/**
 * Building merge orchestrator.
 *
 * Orchestrates the full building geometry pipeline:
 *   1. For each BuildingFeature: resolve height, project coordinates, sample elevation
 *   2. Build individual building geometries
 *   3. Merge all building geometries into a single BufferGeometry
 *
 * CRITICAL: zScale and base offset MUST match terrain.ts exactly.
 *   horizontalScale = widthMM / geographicWidthM
 *   zScale = horizontalScale * exaggeration  (same as terrain.ts line 97)
 *   baseZmm[i] = (sampledElevationM - minElevationM) * zScale  (same as terrain.ts line 124)
 *
 * This ensures building bases align with terrain surface at any exaggeration level.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BoundingBox, ElevationData } from '../../types/geo';
import type { BuildingFeature, BuildingGeometryParams } from './types';
import { wgs84ToUTM } from '../utm';
import { resolveHeight, resolveRoofHeight } from './height';
import { sampleElevationAtLonLat } from './elevationSampler';
import { computeSignedArea } from './walls';
import { buildSingleBuilding } from './buildingMesh';

/**
 * Strip the closing duplicate vertex from an OSM polygon ring.
 * OSM rings repeat the first vertex at the end: [A, B, C, D, A] → [A, B, C, D].
 * This prevents earcut from producing degenerate triangles and ensures
 * edge counts match between floor/roof caps and walls (each perimeter edge
 * appears exactly twice: once in a wall quad, once in a cap triangle).
 */
function stripClosingVertex(ring: [number, number][]): [number, number][] {
  if (ring.length < 2) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) {
    return ring.slice(0, -1);
  }
  return ring;
}

/**
 * Project a [lon, lat] ring to local mm space.
 *
 * Steps:
 *   1. Project to UTM (meters)
 *   2. Subtract bbox center UTM to center the mesh at origin
 *   3. Multiply by horizontalScale to convert meters to mm
 *
 * Y-axis convention: UTM northing increases north = mesh Y increases north = positive Y = north.
 * This automatically matches terrain.ts which uses: y = (1 - vy/(gridSize-1)) * depthMM - depthMM/2
 * (vy=0 = north = positive Y).
 */
function projectRingToMM(
  ring: [number, number][],
  centerUTM: { x: number; y: number },
  horizontalScale: number
): [number, number][] {
  return ring.map(([lon, lat]) => {
    const utm = wgs84ToUTM(lon, lat);
    const x = (utm.x - centerUTM.x) * horizontalScale;
    const y = (utm.y - centerUTM.y) * horizontalScale;
    return [x, y];
  });
}

/**
 * Sample per-vertex base elevation for a ring of [lon, lat] coordinates.
 *
 * @returns Array of base Z values in mm, one per ring vertex
 */
function sampleBaseZmm(
  ring: [number, number][],
  bbox: BoundingBox,
  elevData: ElevationData,
  minElevationM: number,
  zScale: number
): number[] {
  return ring.map(([lon, lat]) => {
    const elevM = sampleElevationAtLonLat(lon, lat, bbox, elevData);
    return (elevM - minElevationM) * zScale;
  });
}

/**
 * Compute footprint area in square meters using the shoelace formula on UTM-projected coordinates.
 * Returns the absolute value (always positive area).
 */
function computeFootprintAreaM2(outerRing: [number, number][]): number {
  const utmRing: [number, number][] = outerRing.map(([lon, lat]) => {
    const utm = wgs84ToUTM(lon, lat);
    return [utm.x, utm.y];
  });
  return Math.abs(computeSignedArea(utmRing));
}

/**
 * Build all buildings and merge into a single BufferGeometry.
 *
 * @param features - Parsed building features from parseBuildingFeatures()
 * @param bbox - Bounding box for the area (WGS84)
 * @param elevData - Elevation data for terrain sampling
 * @param params - Geometry parameters (dimensions, scale, zone, center, exaggeration)
 * @returns Merged BufferGeometry of all buildings, or null if no buildings found
 */
export function buildAllBuildings(
  features: BuildingFeature[],
  bbox: BoundingBox,
  elevData: ElevationData,
  params: BuildingGeometryParams
): THREE.BufferGeometry | null {
  if (features.length === 0) return null;

  const { widthMM, geographicWidthM, exaggeration, minElevationM, bboxCenterUTM } = params;

  // Compute horizontal scale: mm per meter of real-world distance
  // CRITICAL: Must match terrain.ts line 84: horizontalScale = widthMM / geographicWidthM
  const horizontalScale = widthMM / geographicWidthM;

  // Compute zScale: matches terrain.ts lines 86-98
  // Must produce the same zScale as terrain.ts for building-terrain alignment.
  const elevRange = elevData.maxElevation - elevData.minElevation;
  let zScale: number;
  if (elevRange === 0) {
    // Flat terrain: use horizontalScale * exaggeration as the scale
    // (terrain.ts uses zScale=0 and sets z=minHeightMM, but for buildings we still need the scale)
    zScale = horizontalScale * exaggeration;
  } else if (params.targetReliefMM && params.targetReliefMM > 0) {
    // Z height override: matches terrain.ts override logic exactly for alignment
    zScale = params.targetReliefMM / elevRange;
  } else {
    // Check if terrain uses minHeightMM floor
    // TERR-03: when naturalHeightMM < minHeightMM, zScale = minHeightMM / elevRange
    // Buildings must use THE SAME zScale as terrain to align correctly.
    // We pass minHeightMM=5 as the standard value (from terrain.ts defaults).
    const MIN_HEIGHT_MM = 5;
    const naturalHeightMM = elevRange * horizontalScale * exaggeration;
    if (naturalHeightMM < MIN_HEIGHT_MM) {
      zScale = MIN_HEIGHT_MM / elevRange;
    } else {
      zScale = horizontalScale * exaggeration;
    }
  }

  const buildingGeometries: THREE.BufferGeometry[] = [];

  for (const feature of features) {
    const { properties, outerRing, holes } = feature;

    // Strip closing duplicate vertex from OSM rings before processing.
    // OSM rings repeat the first vertex: [A,B,C,D,A] → [A,B,C,D].
    // Without stripping, earcut references both v0 and vN for the same position,
    // causing perimeter edges to appear 3 times instead of 2 → non-manifold.
    const openOuter = stripClosingVertex(outerRing);
    const openHoles = holes.map(stripClosingVertex);

    // Skip degenerate rings (need at least 3 unique vertices for a polygon)
    if (openOuter.length < 3) continue;

    // Step a: Compute footprint area and resolve height
    const footprintAreaM2 = computeFootprintAreaM2(openOuter);
    const heightM = resolveHeight(properties, footprintAreaM2);
    const roofShape = properties['roof:shape'] ?? 'flat';
    const roofHeightM = resolveRoofHeight(properties, heightM);

    // Step b: Project outer ring to local mm space
    const outerRingMM = projectRingToMM(openOuter, bboxCenterUTM, horizontalScale);

    // Project hole rings to local mm space
    const holesMM = openHoles.map((hole) =>
      projectRingToMM(hole, bboxCenterUTM, horizontalScale)
    );

    // Step c: Sample terrain elevation per vertex (outer ring)
    // baseZmm[i] = (sampledElevationM - minElevationM) * zScale
    // CRITICAL: matches terrain.ts line 124: z = (elevation - minElevation) * zScale
    const baseZmm = sampleBaseZmm(openOuter, bbox, elevData, minElevationM, zScale);

    // Step d: Convert building height from meters to mm using zScale.
    // heightMM = heightM * zScale is algebraically equivalent to
    // heightM * horizontalScale * exaggeration in the non-override case, and
    // correctly handles both TERR-03 floor and targetReliefMM override cases.
    const heightMM = heightM * zScale;
    const roofHeightMM = roofHeightM * zScale;

    // Step e: Build single building geometry
    try {
      const geo = buildSingleBuilding(
        outerRingMM,
        holesMM,
        baseZmm,
        heightMM,
        roofShape,
        roofHeightMM
      );
      buildingGeometries.push(geo);
    } catch {
      // Skip buildings that fail to triangulate (degenerate geometry)
      continue;
    }
  }

  if (buildingGeometries.length === 0) return null;

  // Merge all building geometries into one
  const merged = mergeGeometries(buildingGeometries, false);
  merged.computeVertexNormals();

  // Dispose individual geometries to free memory
  for (const geo of buildingGeometries) {
    geo.dispose();
  }

  return merged;
}
