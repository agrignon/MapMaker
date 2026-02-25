/**
 * Road pipeline type definitions.
 * These types define the data flow from raw OSM data through
 * to Three.js BufferGeometry output.
 */

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
}
