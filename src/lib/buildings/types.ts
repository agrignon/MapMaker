/**
 * Building pipeline type definitions.
 * These types define the data flow from raw OSM data through
 * to Three.js BufferGeometry output.
 */

import type * as THREE from 'three';

/**
 * A parsed building from OSM data with raw properties and geometry.
 * Coordinates are in [lon, lat] order (WGS84).
 */
export interface BuildingFeature {
  /** OSM building properties (height, levels, roof shape, building type) */
  properties: Record<string, string | undefined>;
  /** Outer ring coordinates as [lon, lat] pairs */
  outerRing: [number, number][];
  /** Hole rings (e.g., courtyards) as [lon, lat] pairs */
  holes: [number, number][][];
}

/**
 * A BuildingFeature with resolved geometry parameters.
 */
export interface ParsedBuilding extends BuildingFeature {
  /** Resolved building height in meters (never NaN or undefined) */
  resolvedHeightM: number;
  /** Roof shape tag (default: 'flat') */
  roofShape: string;
  /** Roof height in meters (0 for flat roofs) */
  roofHeightM: number;
}

/**
 * Parameters for building geometry generation, shared across all geometry functions.
 *
 * The zScale formula mirrors terrain.ts exactly:
 *   zScale = (widthMM / geographicWidthM) * exaggeration
 *
 * Building base Z is computed as:
 *   baseZmm = (sampledElevationM - minElevationM) * zScale
 *
 * This ensures building Z=0 aligns with terrain Z=0 (both relative to minElevation).
 */
export interface BuildingGeometryParams {
  /** Target physical width in millimeters (x-axis) */
  widthMM: number;
  /** Target physical depth in millimeters (y-axis) */
  depthMM: number;
  /** Real-world width of the bbox in meters */
  geographicWidthM: number;
  /** Real-world depth of the bbox in meters */
  geographicDepthM: number;
  /** UTM zone number (1-60) for projection */
  utmZone: number;
  /** UTM coordinates of the bbox center for centering the mesh */
  bboxCenterUTM: { x: number; y: number };
  /** Vertical exaggeration multiplier (matches terrain exaggeration) */
  exaggeration: number;
  /** Minimum elevation in meters (matches terrain minElevation — used as Z base) */
  minElevationM: number;
  /**
   * Optional override for terrain surface Z height in mm.
   * When > 0, overrides zScale so max terrain Z == targetReliefMM.
   * Must match the value passed to TerrainMeshParams.targetReliefMM for alignment.
   * When 0 or undefined, natural zScale is used.
   */
  targetReliefMM?: number;
  /**
   * Optional terrain mesh geometry for raycasting building base Z onto the
   * actual terrain surface. When provided, building footprint vertices are
   * snapped to the terrain mesh via BVH-accelerated raycasting instead of
   * sampling the elevation grid. This eliminates Z mismatch (floating buildings).
   */
  terrainGeometry?: THREE.BufferGeometry;
}
