/**
 * Geographic type definitions for MapMaker.
 * These types form the foundation of the coordinate pipeline:
 * WGS84 → UTM (meter space) → STL (millimeter space)
 */

/** A point in WGS84 coordinates (longitude, latitude in degrees). */
export interface WGS84Coords {
  lon: number;
  lat: number;
}

/** An axis-aligned bounding box in WGS84 coordinates. */
export interface BoundingBox {
  sw: WGS84Coords;
  ne: WGS84Coords;
}

/** A point projected into UTM meter space. */
export interface UTMCoords {
  x: number;
  y: number;
  zone: number;
  hemisphere: 'N' | 'S';
}

/** Physical dimensions of a bounding box in meters (derived from UTM projection). */
export interface BboxDimensions {
  widthM: number;
  heightM: number;
}

/** Physical dimensions of a bounding box in millimeters (for STL export). */
export interface BboxMM {
  widthMM: number;
  heightMM: number;
}

/** Status of the terrain generation pipeline */
export type GenerationStatus = 'idle' | 'fetching' | 'meshing' | 'validating' | 'ready' | 'error';

/** Decoded elevation data for a bounding box */
export interface ElevationData {
  /** Elevation values in meters, row-major order */
  elevations: Float32Array;
  /** Grid width (number of columns) — must be 2^k+1 for martini */
  gridSize: number;
  /** Minimum elevation in meters */
  minElevation: number;
  /** Maximum elevation in meters */
  maxElevation: number;
}
