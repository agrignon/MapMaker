/**
 * Bilinear terrain elevation sampling.
 *
 * Samples the ElevationData grid at a given WGS84 lon/lat position
 * using bilinear interpolation.
 *
 * Y-axis convention (matching terrain.ts):
 *   - Row 0 in elevations array = north (ne.lat)
 *   - Row (gridSize-1) = south (sw.lat)
 *   - ty = (ne.lat - lat) / (ne.lat - sw.lat) — increases south, row index increases south
 */

import type { BoundingBox, ElevationData } from '../../types/geo';

/** Clamp a value to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Sample terrain elevation at a given WGS84 longitude/latitude.
 *
 * Uses bilinear interpolation of the surrounding 4 grid cells.
 * Points outside the bbox are clamped to the nearest edge.
 *
 * @param lon - Longitude in degrees (WGS84)
 * @param lat - Latitude in degrees (WGS84)
 * @param bbox - Bounding box matching the elevation data grid
 * @param elevData - Elevation data from terrain tile processing
 * @returns Elevation in meters at the given position
 */
export function sampleElevationAtLonLat(
  lon: number,
  lat: number,
  bbox: BoundingBox,
  elevData: ElevationData
): number {
  const { sw, ne } = bbox;
  const { elevations, gridSize } = elevData;

  // Normalize to [0, 1] within bbox
  const tx = (lon - sw.lon) / (ne.lon - sw.lon);
  // Y-axis: ty=0 = north (row 0), ty=1 = south (row gridSize-1)
  // Matches terrain.ts: row 0 = ne.lat (north)
  const ty = (ne.lat - lat) / (ne.lat - sw.lat);

  // Map to grid coordinates (clamped to valid range)
  const gx = clamp(tx, 0, 1) * (gridSize - 1);
  const gy = clamp(ty, 0, 1) * (gridSize - 1);

  // Integer grid coordinates for the 4 surrounding cells
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const x1 = Math.min(x0 + 1, gridSize - 1);
  const y1 = Math.min(y0 + 1, gridSize - 1);

  // Fractional position within the grid cell
  const fx = gx - x0;
  const fy = gy - y0;

  // Read the 4 surrounding elevation values (row-major: index = row * gridSize + col)
  const e00 = elevations[y0 * gridSize + x0]; // top-left
  const e10 = elevations[y0 * gridSize + x1]; // top-right
  const e01 = elevations[y1 * gridSize + x0]; // bottom-left
  const e11 = elevations[y1 * gridSize + x1]; // bottom-right

  // Bilinear interpolation
  const top = e00 + (e10 - e00) * fx;
  const bottom = e01 + (e11 - e01) * fx;
  return top + (bottom - top) * fy;
}
