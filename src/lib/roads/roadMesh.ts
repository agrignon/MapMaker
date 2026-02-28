/**
 * Road ribbon mesh generator.
 *
 * Converts road features (centerline coordinates + tier + bridge flag) into
 * Three.js BufferGeometry using a solid ribbon generator (closed box mesh)
 * with terrain-following Z, style offsets, and type-based widths.
 *
 * When terrainGeometry is provided in params, road vertices are snapped to
 * the actual terrain mesh surface via BVH-accelerated raycasting. This
 * eliminates Z mismatch between roads and the Martini RTIN terrain mesh.
 * Without terrainGeometry (tests, fallback), elevation grid sampling is used.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BoundingBox, ElevationData } from '../../types/geo';
import { wgs84ToUTM } from '../utm';
import { sampleElevationAtLonLat } from '../buildings/elevationSampler';
import { buildTerrainRaycaster } from '../mesh/terrainRaycaster';
import type { RoadFeature, RoadTier, RoadGeometryParams } from './types';

// ─── Road visual constants ─────────────────────────────────────────────────

/**
 * Road ribbon widths in mm (model space at 150mm model width).
 * Highway roads are the widest, residential roads are the narrowest.
 */
export const ROAD_WIDTH_MM: Record<RoadTier, number> = {
  highway: 1.8,
  main: 1.2,
  residential: 0.7,
};

/**
 * Road depth/height offsets in mm for style application.
 * Used for:
 *   - recessed style: negative Z offset (road goes below terrain)
 *   - raised style: positive Z offset (road sits above terrain)
 *   - flat style: no Z offset
 *   - bridge lift: +ROAD_DEPTH_MM[tier] * 2 extra above terrain
 *
 * Range is 0.3–1.0mm — within the 0.5-1.0mm range for deepest (locked decisions).
 */
export const ROAD_DEPTH_MM: Record<RoadTier, number> = {
  highway: 1.0,   // full depth (locked decision)
  main: 0.6,      // ~60% (locked decision)
  residential: 0.3, // ~30% (locked decision)
};

/**
 * Road surface color — dark gray (locked decision: #555 range).
 * Exported for use in RoadMesh.tsx material creation.
 */
export const ROAD_COLOR = '#555555';

// ─── Internal helpers ──────────────────────────────────────────────────────

/**
 * Project a [lon, lat] centerline to local mm space.
 *
 * Steps:
 *   1. Project to UTM (meters)
 *   2. Subtract bbox center UTM to center the mesh at origin
 *   3. Multiply by horizontalScale to convert meters to mm
 *
 * Y-axis convention: UTM northing increases north = mesh Y increases north.
 * This matches terrain.ts and buildings/merge.ts exactly.
 */
function projectCenterlineToMM(
  coords: [number, number][],
  centerUTM: { x: number; y: number },
  horizontalScale: number
): [number, number][] {
  return coords.map(([lon, lat]) => {
    const utm = wgs84ToUTM(lon, lat);
    return [
      (utm.x - centerUTM.x) * horizontalScale,
      (utm.y - centerUTM.y) * horizontalScale,
    ];
  });
}

/** Maximum road segment length in meters before subdivision. */
const MAX_SEGMENT_M = 10;

/**
 * Subdivide a WGS84 centerline so no segment exceeds MAX_SEGMENT_M meters.
 * Inserts linearly interpolated intermediate points along long segments so
 * the road ribbon samples terrain elevation at high enough resolution to
 * closely follow the terrain mesh surface.
 */
function subdivideCenterline(
  coords: [number, number][],
  maxSegmentM: number
): [number, number][] {
  if (coords.length < 2) return coords;

  const result: [number, number][] = [coords[0]];

  for (let i = 0; i < coords.length - 1; i++) {
    const [lon1, lat1] = coords[i];
    const [lon2, lat2] = coords[i + 1];

    // Approximate segment length in meters
    const latAvg = (lat1 + lat2) / 2;
    const dxM = (lon2 - lon1) * 111320 * Math.cos(latAvg * Math.PI / 180);
    const dyM = (lat2 - lat1) * 110574;
    const distM = Math.sqrt(dxM * dxM + dyM * dyM);

    const numSeg = Math.max(1, Math.ceil(distM / maxSegmentM));

    for (let s = 1; s <= numSeg; s++) {
      const t = s / numSeg;
      result.push([
        lon1 + t * (lon2 - lon1),
        lat1 + t * (lat2 - lat1),
      ]);
    }
  }

  return result;
}

/**
 * Build a solid extruded ribbon (closed box) along a 2D centerline.
 *
 * For each centerline point, computes the averaged tangent from adjacent
 * segments and offsets left/right perpendicular to it by halfWidth. At
 * corners the offset is scaled by 1/cos(halfAngle), capped at 2x to
 * prevent miter spikes.
 *
 * When topFaceOnly=false (default): Generates a closed solid with 4 vertices
 * per centerline point (TL, TR, BL, BR) and faces for: top, bottom, left wall,
 * right wall, start cap, end cap. Used for STL export (slicers handle overlaps).
 *
 * When topFaceOnly=true: Generates only the top face with 2 vertices per
 * centerline point (L, R). Eliminates side wall / bottom face terrain
 * intersection artifacts (striations) in the 3D preview.
 *
 * All Z values are 0 — caller assigns top/bottom Z after construction.
 *
 * @returns positions + indices, or null if centerline has < 2 points
 */
function buildSolidRibbon(
  centerline: [number, number][],
  halfWidth: number,
  topFaceOnly = false
): { positions: Float32Array; indices: Uint32Array } | null {
  const n = centerline.length;
  if (n < 2) return null;

  const vertsPerPoint = topFaceOnly ? 2 : 4;
  const positions = new Float32Array(n * vertsPerPoint * 3);

  let triCount: number;
  if (topFaceOnly) {
    // Top face only: 2 triangles per segment
    triCount = (n - 1) * 2;
  } else {
    // Full solid: top(2) + bottom(2) + left wall(2) + right wall(2) = 8 per segment + 4 caps
    triCount = (n - 1) * 8 + 4;
  }
  const indices = new Uint32Array(triCount * 3);

  for (let i = 0; i < n; i++) {
    // Compute tangent direction at point i
    let tx: number, ty: number;

    if (i === 0) {
      tx = centerline[1][0] - centerline[0][0];
      ty = centerline[1][1] - centerline[0][1];
    } else if (i === n - 1) {
      tx = centerline[n - 1][0] - centerline[n - 2][0];
      ty = centerline[n - 1][1] - centerline[n - 2][1];
    } else {
      // Average of normalized adjacent segment directions
      const d0x = centerline[i][0] - centerline[i - 1][0];
      const d0y = centerline[i][1] - centerline[i - 1][1];
      const d1x = centerline[i + 1][0] - centerline[i][0];
      const d1y = centerline[i + 1][1] - centerline[i][1];

      const len0 = Math.sqrt(d0x * d0x + d0y * d0y);
      const len1 = Math.sqrt(d1x * d1x + d1y * d1y);

      if (len0 < 1e-12 && len1 < 1e-12) {
        tx = 1;
        ty = 0;
      } else if (len0 < 1e-12) {
        tx = d1x;
        ty = d1y;
      } else if (len1 < 1e-12) {
        tx = d0x;
        ty = d0y;
      } else {
        tx = d0x / len0 + d1x / len1;
        ty = d0y / len0 + d1y / len1;
      }
    }

    // Normalize tangent
    const tLen = Math.sqrt(tx * tx + ty * ty);
    if (tLen < 1e-12) {
      tx = 1;
      ty = 0;
    } else {
      tx /= tLen;
      ty /= tLen;
    }

    // Miter normal: perpendicular to tangent (left-hand side)
    const nx = -ty;
    const ny = tx;

    // Compute miter scale for interior points: 1/cos(halfAngle), capped at 2
    let miterScale = 1.0;
    if (i > 0 && i < n - 1) {
      const d0x = centerline[i][0] - centerline[i - 1][0];
      const d0y = centerline[i][1] - centerline[i - 1][1];
      const len0 = Math.sqrt(d0x * d0x + d0y * d0y);
      if (len0 > 1e-12) {
        const n0x = -d0y / len0;
        const n0y = d0x / len0;
        const dot = nx * n0x + ny * n0y;
        if (Math.abs(dot) > 1e-6) {
          miterScale = Math.min(Math.abs(1.0 / dot), 2.0);
        } else {
          miterScale = 2.0;
        }
      }
    }

    const offsetX = nx * halfWidth * miterScale;
    const offsetY = ny * halfWidth * miterScale;

    const lx = centerline[i][0] + offsetX;
    const ly = centerline[i][1] + offsetY;
    const rx = centerline[i][0] - offsetX;
    const ry = centerline[i][1] - offsetY;

    if (topFaceOnly) {
      const base = i * 2;
      // L (left):  index base+0
      positions[(base + 0) * 3] = lx;
      positions[(base + 0) * 3 + 1] = ly;
      positions[(base + 0) * 3 + 2] = 0; // topZ assigned later
      // R (right): index base+1
      positions[(base + 1) * 3] = rx;
      positions[(base + 1) * 3 + 1] = ry;
      positions[(base + 1) * 3 + 2] = 0;
    } else {
      const base = i * 4;
      // TL (top-left):  index base+0
      positions[(base + 0) * 3] = lx;
      positions[(base + 0) * 3 + 1] = ly;
      positions[(base + 0) * 3 + 2] = 0; // topZ assigned later
      // TR (top-right): index base+1
      positions[(base + 1) * 3] = rx;
      positions[(base + 1) * 3 + 1] = ry;
      positions[(base + 1) * 3 + 2] = 0;
      // BL (bot-left):  index base+2
      positions[(base + 2) * 3] = lx;
      positions[(base + 2) * 3 + 1] = ly;
      positions[(base + 2) * 3 + 2] = 0; // botZ assigned later
      // BR (bot-right): index base+3
      positions[(base + 3) * 3] = rx;
      positions[(base + 3) * 3 + 1] = ry;
      positions[(base + 3) * 3 + 2] = 0;
    }
  }

  // Build triangle indices
  let idx = 0;

  if (topFaceOnly) {
    // Top face only: 2 triangles per segment
    for (let i = 0; i < n - 1; i++) {
      const l0 = i * 2, r0 = i * 2 + 1;
      const l1 = (i + 1) * 2, r1 = (i + 1) * 2 + 1;

      indices[idx++] = l0; indices[idx++] = r0; indices[idx++] = l1;
      indices[idx++] = r0; indices[idx++] = r1; indices[idx++] = l1;
    }
  } else {
    // Segment faces (top, bottom, left wall, right wall)
    for (let i = 0; i < n - 1; i++) {
      const tl0 = i * 4, tr0 = i * 4 + 1, bl0 = i * 4 + 2, br0 = i * 4 + 3;
      const tl1 = (i + 1) * 4, tr1 = (i + 1) * 4 + 1, bl1 = (i + 1) * 4 + 2, br1 = (i + 1) * 4 + 3;

      // Top face (+Z normal)
      indices[idx++] = tl0; indices[idx++] = tr0; indices[idx++] = tl1;
      indices[idx++] = tr0; indices[idx++] = tr1; indices[idx++] = tl1;

      // Bottom face (-Z normal, reversed winding)
      indices[idx++] = bl0; indices[idx++] = bl1; indices[idx++] = br0;
      indices[idx++] = br0; indices[idx++] = bl1; indices[idx++] = br1;

      // Left wall (TL-BL edge)
      indices[idx++] = tl0; indices[idx++] = tl1; indices[idx++] = bl0;
      indices[idx++] = bl0; indices[idx++] = tl1; indices[idx++] = bl1;

      // Right wall (TR-BR edge)
      indices[idx++] = tr0; indices[idx++] = br0; indices[idx++] = tr1;
      indices[idx++] = tr1; indices[idx++] = br0; indices[idx++] = br1;
    }

    // Start cap (i=0)
    {
      const tl = 0, tr = 1, bl = 2, br = 3;
      indices[idx++] = tl; indices[idx++] = bl; indices[idx++] = tr;
      indices[idx++] = tr; indices[idx++] = bl; indices[idx++] = br;
    }

    // End cap (i=n-1)
    {
      const base = (n - 1) * 4;
      const tl = base, tr = base + 1, bl = base + 2, br = base + 3;
      indices[idx++] = tl; indices[idx++] = tr; indices[idx++] = bl;
      indices[idx++] = tr; indices[idx++] = br; indices[idx++] = bl;
    }
  }

  return { positions, indices };
}

// ─── Main export ───────────────────────────────────────────────────────────

/**
 * Build a merged Three.js BufferGeometry from road features.
 *
 * Processing pipeline per feature:
 * 1. Skip features with < 2 coordinates
 * 2. Subdivide centerline (max 10m segments) for dense terrain sampling
 * 3. Project centerline coordinates to local mm space
 * 4. Sample per-vertex terrain Z (raycasting terrain mesh if available,
 *    otherwise bilinear interpolation from elevation grid as fallback)
 * 5. Build solid ribbon geometry (top + bottom + side walls + end caps)
 * 6. Assign top/bottom Z with style offset or bridge lift
 * 7. Build Three.js BufferGeometry with computed vertex normals
 *
 * @param features - Parsed road features from parseRoadFeatures()
 * @param bbox - Bounding box for the area (WGS84)
 * @param elevData - Elevation data for terrain sampling
 * @param params - Geometry parameters (dimensions, scale, center, style, exaggeration)
 * @returns Merged BufferGeometry of all roads, or null if no roads found
 */
export function buildRoadGeometry(
  features: RoadFeature[],
  bbox: BoundingBox,
  elevData: ElevationData,
  params: RoadGeometryParams
): THREE.BufferGeometry | null {
  if (features.length === 0) return null;

  const {
    widthMM,
    geographicWidthM,
    exaggeration,
    minElevationM,
    bboxCenterUTM,
    roadStyle,
    targetReliefMM,
    terrainGeometry,
    topFaceOnly,
  } = params;

  // Compute horizontal scale: mm per meter of real-world distance
  // CRITICAL: Must match terrain.ts line 91: horizontalScale = widthMM / geographicWidthM
  const horizontalScale = widthMM / geographicWidthM;

  // Compute zScale — MUST match terrain.ts and buildings/merge.ts exactly
  const elevRange = elevData.maxElevation - elevData.minElevation;
  let zScale: number;
  if (elevRange === 0) {
    zScale = horizontalScale * exaggeration;
  } else if (targetReliefMM && targetReliefMM > 0) {
    zScale = (targetReliefMM / elevRange) * exaggeration;
  } else {
    const MIN_HEIGHT_MM = 5;
    const naturalHeightMM = elevRange * horizontalScale * exaggeration;
    zScale = naturalHeightMM < MIN_HEIGHT_MM ? MIN_HEIGHT_MM / elevRange : horizontalScale * exaggeration;
  }

  // Build BVH-accelerated raycaster if terrain geometry is available.
  // When provided, road vertices are snapped to the actual terrain mesh
  // surface, eliminating the Z mismatch from Martini RTIN simplification.
  const raycastTerrainZ = terrainGeometry
    ? buildTerrainRaycaster(terrainGeometry)
    : null;

  const roadGeometries: THREE.BufferGeometry[] = [];

  for (const feature of features) {
    const { tier, isBridge } = feature;

    // Skip degenerate centerlines
    if (feature.coordinates.length < 2) continue;

    // Step 1: Subdivide centerline for dense terrain sampling
    const coordinates = subdivideCenterline(feature.coordinates, MAX_SEGMENT_M);

    // Step 2: Project centerline to local mm space
    const projected2D = projectCenterlineToMM(coordinates, bboxCenterUTM, horizontalScale);

    // Step 3: Sample per-vertex terrain Z values
    // When terrain geometry is available, raycast from each centerline point
    // onto the terrain mesh for exact Z. Fall back to elevation grid sampling.
    const terrainZs = projected2D.map(([x, y], idx) => {
      if (raycastTerrainZ) {
        const hitZ = raycastTerrainZ(x, y);
        if (hitZ !== null) return hitZ;
      }
      // Fallback: sample from elevation grid (used in tests/export without terrain mesh)
      const [lon, lat] = coordinates[idx];
      const elevM = sampleElevationAtLonLat(lon, lat, bbox, elevData);
      return (elevM - minElevationM) * zScale;
    });

    // Step 4: Build ribbon geometry
    const ribbonWidth = ROAD_WIDTH_MM[tier];
    const ribbonDepth = ROAD_DEPTH_MM[tier];
    const ribbon = buildSolidRibbon(projected2D, ribbonWidth / 2, topFaceOnly);
    if (!ribbon) continue;

    const { positions, indices } = ribbon;
    const vertsPerPoint = topFaceOnly ? 2 : 4;

    // Step 5: Assign terrain-following Z values
    // topFaceOnly: only top Z (2 verts per point: L, R)
    // full solid: top + bottom Z (4 verts per point: TL, TR, BL, BR)
    if (isBridge) {
      // Bridge: linearly interpolate between endpoint terrain Z + lift
      const bridgeLift = ROAD_DEPTH_MM[tier] * 2;
      const startZ = terrainZs[0];
      const endZ = terrainZs[terrainZs.length - 1];

      // Compute cumulative arc-length for parameterization
      let totalLength = 0;
      const cumDist = [0];
      for (let i = 0; i < projected2D.length - 1; i++) {
        const dx = projected2D[i + 1][0] - projected2D[i][0];
        const dy = projected2D[i + 1][1] - projected2D[i][1];
        totalLength += Math.sqrt(dx * dx + dy * dy);
        cumDist.push(totalLength);
      }

      for (let i = 0; i < projected2D.length; i++) {
        const arcParam = totalLength > 0 ? cumDist[i] / totalLength : 0;
        const baseZ = startZ + arcParam * (endZ - startZ) + bridgeLift;
        const topZ = baseZ + ribbonDepth;
        const base = i * vertsPerPoint;
        if (topFaceOnly) {
          positions[(base + 0) * 3 + 2] = topZ;  // L
          positions[(base + 1) * 3 + 2] = topZ;  // R
        } else {
          const botZ = baseZ;
          positions[(base + 0) * 3 + 2] = topZ;  // TL
          positions[(base + 1) * 3 + 2] = topZ;  // TR
          positions[(base + 2) * 3 + 2] = botZ;  // BL
          positions[(base + 3) * 3 + 2] = botZ;  // BR
        }
      }
    } else {
      // Non-bridge: terrain-following with style offset
      let styleOffset: number;
      if (roadStyle === 'recessed') {
        styleOffset = -ROAD_DEPTH_MM[tier];
      } else if (roadStyle === 'raised') {
        styleOffset = ROAD_DEPTH_MM[tier];
      } else {
        styleOffset = 0;
      }

      for (let i = 0; i < projected2D.length; i++) {
        const topZ = terrainZs[i] + styleOffset + ribbonDepth;
        const base = i * vertsPerPoint;
        if (topFaceOnly) {
          positions[(base + 0) * 3 + 2] = topZ;  // L
          positions[(base + 1) * 3 + 2] = topZ;  // R
        } else {
          const botZ = terrainZs[i] + styleOffset;
          positions[(base + 0) * 3 + 2] = topZ;  // TL
          positions[(base + 1) * 3 + 2] = topZ;  // TR
          positions[(base + 2) * 3 + 2] = botZ;  // BL
          positions[(base + 3) * 3 + 2] = botZ;  // BR
        }
      }
    }

    // Step 6: Build Three.js BufferGeometry
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));

    roadGeometries.push(geo);
  }

  if (roadGeometries.length === 0) return null;

  // Merge all road geometries into one
  const merged = mergeGeometries(roadGeometries, false);
  merged.computeVertexNormals();

  // Dispose individual geometries to free memory
  for (const geo of roadGeometries) {
    geo.dispose();
  }

  return merged;
}
