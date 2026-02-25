/**
 * Road ribbon mesh generator.
 *
 * Converts road features (centerline coordinates + tier + bridge flag) into
 * Three.js BufferGeometry using geometry-extrude for ribbon mesh generation
 * with terrain-following Z, style offsets, and type-based widths.
 *
 * CRITICAL: zScale MUST match terrain.ts and buildings/merge.ts exactly.
 * Road terrain Z = (sampledElevationM - minElevationM) * zScale
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import geometryExtrude from 'geometry-extrude';
import type { BoundingBox, ElevationData } from '../../types/geo';
import { wgs84ToUTM } from '../utm';
import { sampleElevationAtLonLat } from '../buildings/elevationSampler';
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

/**
 * Find the closest parameter t [0,1] on a line segment (p0 → p1) for point p.
 * Returns the clamped projection parameter.
 */
function projectPointOntoSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return 0;
  const t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  return Math.max(0, Math.min(1, t));
}

/**
 * Assign terrain-following Z values to extruded ribbon vertices.
 *
 * For each vertex in the position Float32Array:
 * 1. Find the nearest segment in the centerline2D by projecting the vertex XY
 * 2. Interpolate terrain Z at that position
 * 3. Add style offset (positive=raised, negative=recessed, 0=flat)
 * 4. Add the vertex's local ribbon Z (0 = bottom face, ribbonDepth = top face)
 *
 * @param position - Flat Float32Array of [x, y, z, x, y, z, ...] vertices (mutated in place)
 * @param centerline2D - Projected centerline in local mm space
 * @param terrainZs - Per-vertex terrain Z values in mm (aligned with centerline2D)
 * @param styleOffset - Z offset in mm from road style (+ raised, - recessed, 0 flat)
 * @param ribbonDepth - Extrusion depth in mm (thickness of the ribbon)
 */
function assignTerrainZ(
  position: Float32Array,
  centerline2D: [number, number][],
  terrainZs: number[],
  styleOffset: number,
  ribbonDepth: number
): void {
  const vertexCount = position.length / 3;
  const segCount = centerline2D.length - 1;

  for (let vi = 0; vi < vertexCount; vi++) {
    const px = position[vi * 3];
    const py = position[vi * 3 + 1];
    // Local z from extrusion: 0 = bottom of ribbon, ribbonDepth = top
    const localZ = position[vi * 3 + 2];

    // Find the nearest segment and interpolated terrain Z
    let bestDist = Infinity;
    let bestTerrainZ = terrainZs[0];

    for (let si = 0; si < segCount; si++) {
      const ax = centerline2D[si][0];
      const ay = centerline2D[si][1];
      const bx = centerline2D[si + 1][0];
      const by = centerline2D[si + 1][1];

      const t = projectPointOntoSegment(px, py, ax, ay, bx, by);

      // Projected point on segment
      const projX = ax + t * (bx - ax);
      const projY = ay + t * (by - ay);

      // Distance from vertex to projected point
      const ddx = px - projX;
      const ddy = py - projY;
      const dist = ddx * ddx + ddy * ddy;

      if (dist < bestDist) {
        bestDist = dist;
        // Interpolate terrain Z along segment
        bestTerrainZ = terrainZs[si] + t * (terrainZs[si + 1] - terrainZs[si]);
      }
    }

    // Final Z = terrain Z + style offset + local ribbon thickness
    position[vi * 3 + 2] = bestTerrainZ + styleOffset + localZ;
  }
}

// ─── Bridge Z interpolation helper ────────────────────────────────────────

/**
 * Assign bridge Z values — linearly interpolated between endpoint terrain Z values,
 * plus a bridge lift to visually float above terrain.
 *
 * For bridges: no style offset; instead use lifted linear interpolation.
 * Bridge lift = ROAD_DEPTH_MM[tier] * 2 (double depth to float above terrain).
 *
 * @param position - Flat Float32Array of vertices (mutated in place)
 * @param centerline2D - Projected centerline in local mm space
 * @param startTerrainZ - Terrain Z at first centerline point (mm)
 * @param endTerrainZ - Terrain Z at last centerline point (mm)
 * @param bridgeLift - Additional Z lift for bridge (mm)
 * @param ribbonDepth - Extrusion depth in mm (ribbon thickness)
 */
function assignBridgeZ(
  position: Float32Array,
  centerline2D: [number, number][],
  startTerrainZ: number,
  endTerrainZ: number,
  bridgeLift: number,
  ribbonDepth: number
): void {
  // Compute total centerline length for parameterization
  let totalLength = 0;
  const segLengths: number[] = [];

  for (let si = 0; si < centerline2D.length - 1; si++) {
    const dx = centerline2D[si + 1][0] - centerline2D[si][0];
    const dy = centerline2D[si + 1][1] - centerline2D[si][1];
    const len = Math.sqrt(dx * dx + dy * dy);
    segLengths.push(len);
    totalLength += len;
  }

  // Precompute cumulative distances
  const cumDist: number[] = [0];
  for (const len of segLengths) {
    cumDist.push(cumDist[cumDist.length - 1] + len);
  }

  const vertexCount = position.length / 3;
  const segCount = centerline2D.length - 1;

  for (let vi = 0; vi < vertexCount; vi++) {
    const px = position[vi * 3];
    const py = position[vi * 3 + 1];
    const localZ = position[vi * 3 + 2];

    // Find nearest point on centerline and its arc-length parameter
    let bestDist = Infinity;
    let bestArcParam = 0;

    for (let si = 0; si < segCount; si++) {
      const ax = centerline2D[si][0];
      const ay = centerline2D[si][1];
      const bx = centerline2D[si + 1][0];
      const by = centerline2D[si + 1][1];

      const t = projectPointOntoSegment(px, py, ax, ay, bx, by);
      const projX = ax + t * (bx - ax);
      const projY = ay + t * (by - ay);

      const ddx = px - projX;
      const ddy = py - projY;
      const dist = ddx * ddx + ddy * ddy;

      if (dist < bestDist) {
        bestDist = dist;
        // Arc-length parameter [0, 1] along the full centerline
        if (totalLength > 0) {
          bestArcParam = (cumDist[si] + t * segLengths[si]) / totalLength;
        } else {
          bestArcParam = 0;
        }
      }
    }

    // Linearly interpolate terrain Z along bridge + lift
    const bridgeTerrainZ = startTerrainZ + bestArcParam * (endTerrainZ - startTerrainZ);
    position[vi * 3 + 2] = bridgeTerrainZ + bridgeLift + localZ;
  }
}

// ─── Main export ───────────────────────────────────────────────────────────

/**
 * Build a merged Three.js BufferGeometry from road features.
 *
 * Processing pipeline per feature:
 * 1. Skip features with < 2 coordinates
 * 2. Project centerline coordinates to local mm space
 * 3. Sample per-vertex terrain Z via bilinear interpolation
 * 4. Compute style offset (recessed/raised/flat) or bridge lift
 * 5. Call geometry-extrude extrudePolyline to produce ribbon geometry
 * 6. Post-process position array to assign terrain-following Z
 * 7. Build Three.js BufferGeometry (strip UV to avoid merge mismatch)
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

  const roadGeometries: THREE.BufferGeometry[] = [];

  for (const feature of features) {
    const { coordinates, tier, isBridge } = feature;

    // Skip degenerate centerlines
    if (coordinates.length < 2) continue;

    // Step 1: Project centerline to local mm space
    const projected2D = projectCenterlineToMM(coordinates, bboxCenterUTM, horizontalScale);

    // Step 2: Sample per-vertex terrain Z values
    const terrainZs = coordinates.map(([lon, lat]) => {
      const elevM = sampleElevationAtLonLat(lon, lat, bbox, elevData);
      return (elevM - minElevationM) * zScale;
    });

    // Step 3: Call extrudePolyline to produce ribbon geometry
    const ribbonWidth = ROAD_WIDTH_MM[tier];
    const ribbonDepth = ROAD_DEPTH_MM[tier];

    let extrudeResult: ReturnType<typeof geometryExtrude.extrudePolyline>;
    try {
      extrudeResult = geometryExtrude.extrudePolyline(
        [projected2D],  // MUST wrap in array — MultiLineString format (Pitfall 2)
        { lineWidth: ribbonWidth, depth: ribbonDepth, miterLimit: 2 }
      );
    } catch {
      // Skip roads that fail extrusion (degenerate geometry)
      continue;
    }

    const { position, indices, normal } = extrudeResult;

    // Step 4: Post-process position array — assign terrain-following Z
    const positionCopy = new Float32Array(position);

    if (isBridge) {
      // Bridge: linearly interpolate Z between endpoint terrain Z values + lift
      const bridgeLift = ROAD_DEPTH_MM[tier] * 2;
      assignBridgeZ(
        positionCopy,
        projected2D,
        terrainZs[0],
        terrainZs[terrainZs.length - 1],
        bridgeLift,
        ribbonDepth
      );
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

      assignTerrainZ(
        positionCopy,
        projected2D,
        terrainZs,
        styleOffset,
        ribbonDepth
      );
    }

    // Step 5: Build Three.js BufferGeometry
    // Note: Use new Float32Array(position) copy (geometry-extrude may reuse internal buffers)
    // Use Uint32Array for indices (road meshes can exceed 65535 vertices)
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positionCopy, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normal), 3));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));

    // Strip UV attribute before merge (Pitfall 7 — geometry-extrude returns UV
    // but terrain/buildings lack it; mismatched attributes cause merge errors)
    // UV is not in the attribute set we set above, so no deletion needed.

    roadGeometries.push(geo);
  }

  if (roadGeometries.length === 0) return null;

  // Merge all road geometries into one
  // UV attribute was never added, so no stripping needed before merge
  const merged = mergeGeometries(roadGeometries, false);
  merged.computeVertexNormals();

  // Dispose individual geometries to free memory
  for (const geo of roadGeometries) {
    geo.dispose();
  }

  return merged;
}
