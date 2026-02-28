/**
 * Road pipeline type definitions.
 * These types define the data flow from raw OSM data through
 * to Three.js BufferGeometry output.
 */

import type * as THREE from 'three';

/** Width tier classification for roads. */
export type RoadTier = 'highway' | 'main' | 'residential';

/** Visual style for road geometry. */
export type RoadStyle = 'recessed' | 'raised' | 'flat';

/**
 * A parsed road feature from OSM data.
 * Coordinates are in [lon, lat] order (WGS84).
 */
export interface RoadFeature {
  /** Road centerline coordinates as [lon, lat] pairs */
  coordinates: [number, number][];
  /** Width tier classification */
  tier: RoadTier;
  /** Whether this segment is a bridge (elevated interpolation) */
  isBridge: boolean;
}

/**
 * Parameters for road geometry generation, shared across all geometry functions.
 *
 * The zScale formula mirrors terrain.ts and buildings/merge.ts exactly:
 *   horizontalScale = widthMM / geographicWidthM
 *   zScale = horizontalScale * exaggeration  (or targetReliefMM override)
 *
 * Road Z is computed as:
 *   terrainZ = (sampledElevationM - minElevationM) * zScale
 *   roadZ = terrainZ + styleOffset
 */
export interface RoadGeometryParams {
  /** Target physical width in millimeters (x-axis) */
  widthMM: number;
  /** Target physical depth in millimeters (y-axis) */
  depthMM: number;
  /** Real-world width of the bbox in meters */
  geographicWidthM: number;
  /** Real-world depth of the bbox in meters */
  geographicDepthM: number;
  /** Vertical exaggeration multiplier */
  exaggeration: number;
  /** Minimum elevation in meters (Z base, matches terrain) */
  minElevationM: number;
  /** UTM coordinates of the bbox center for centering the mesh */
  bboxCenterUTM: { x: number; y: number };
  /** Road visual style */
  roadStyle: RoadStyle;
  /** Optional Z height override in mm (must match terrain/building params) */
  targetReliefMM?: number;
  /**
   * Optional terrain mesh geometry for raycasting road Z onto the actual
   * terrain surface. When provided, road vertices are snapped to the terrain
   * mesh via BVH-accelerated raycasting instead of sampling the elevation grid.
   * This eliminates Z mismatch between roads and the Martini RTIN terrain.
   */
  terrainGeometry?: THREE.BufferGeometry;
  /**
   * When true, generate only the top face of the road ribbon (no bottom,
   * side walls, or end caps). Eliminates visual striations in the preview
   * where solid ribbon walls poke through the terrain on slopes.
   * Export should use false (default) for full solid geometry.
   */
  topFaceOnly?: boolean;
}
