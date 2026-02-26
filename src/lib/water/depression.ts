/**
 * Elevation grid depression bake algorithm for water features.
 *
 * Applies a depression to the terrain elevation grid at grid cells that fall
 * inside water polygons (and outside hole rings — islands are preserved).
 *
 * This depression is baked BEFORE buildTerrainGeometry() so it appears in the
 * final STL terrain mesh. WaterMesh.tsx is a visual overlay only.
 */

import type { ElevationData, BoundingBox } from '../../types/geo';
import type { WaterFeature } from './types';

/**
 * Depression depth in meters below the shoreline minimum elevation.
 * Tuned to survive Gaussian smoothing while remaining visible in print.
 */
export const WATER_DEPRESSION_M = 3.0;

/**
 * Ray-cast point-in-ring test (Jordan curve theorem).
 * Returns true if (px, py) is inside the closed ring.
 *
 * @param px - X coordinate (longitude)
 * @param py - Y coordinate (latitude)
 * @param ring - Closed ring of [lon, lat] coordinate pairs
 */
function pointInRing(px: number, py: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (((yi > py) !== (yj > py)) &&
        (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Apply water depressions to an elevation grid.
 *
 * For each water feature:
 * 1. Computes the shoreline minimum elevation (min elevation along outer ring vertices)
 * 2. Sets depressionElev = shorelineMin - WATER_DEPRESSION_M
 * 3. Rasterizes the polygon: for each grid cell in the bbox, tests if the cell center
 *    is inside the outer ring AND not inside any hole ring (island exclusion)
 * 4. Sets matching cells to depressionElev
 *
 * Returns a NEW ElevationData — never mutates the input.
 *
 * @param elevData - Input elevation grid (not mutated)
 * @param features - Water features to apply
 * @param bbox - Geographic bounding box of the elevation grid
 * @returns New ElevationData with depressed water cells and updated min/max
 */
export function applyWaterDepressions(
  elevData: ElevationData,
  features: WaterFeature[],
  bbox: BoundingBox
): ElevationData {
  if (features.length === 0) {
    // No-op: return a copy to satisfy immutability contract
    return {
      ...elevData,
      elevations: new Float32Array(elevData.elevations),
    };
  }

  const { elevations, gridSize } = elevData;
  const modifiedElevations = new Float32Array(elevations); // COPY — never mutate input

  const { sw, ne } = bbox;
  const lonRange = ne.lon - sw.lon;
  const latRange = ne.lat - sw.lat;

  for (const { outerRing, holes } of features) {
    // Compute polygon bbox in grid coordinates for early culling
    let minGX = gridSize, maxGX = 0, minGY = gridSize, maxGY = 0;
    for (const [lon, lat] of outerRing) {
      const gx = ((lon - sw.lon) / lonRange) * (gridSize - 1);
      const gy = (1 - (lat - sw.lat) / latRange) * (gridSize - 1);
      if (gx < minGX) minGX = gx;
      if (gx > maxGX) maxGX = gx;
      if (gy < minGY) minGY = gy;
      if (gy > maxGY) maxGY = gy;
    }

    const x0 = Math.max(0, Math.floor(minGX));
    const x1 = Math.min(gridSize - 1, Math.ceil(maxGX));
    const y0 = Math.max(0, Math.floor(minGY));
    const y1 = Math.min(gridSize - 1, Math.ceil(maxGY));

    // Compute depression elevation from shoreline minimum
    // Sample elevation at each outer ring vertex grid position
    let shorelineMin = Infinity;
    for (const [lon, lat] of outerRing) {
      const gx = Math.round(((lon - sw.lon) / lonRange) * (gridSize - 1));
      const gy = Math.round((1 - (lat - sw.lat) / latRange) * (gridSize - 1));
      const idx = Math.max(0, Math.min(gridSize * gridSize - 1, gy * gridSize + gx));
      shorelineMin = Math.min(shorelineMin, elevations[idx]);
    }
    const depressionElev = shorelineMin - WATER_DEPRESSION_M;

    // Rasterize: test each cell center in the polygon bbox
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        // Cell center in geographic coordinates
        const lon = sw.lon + (gx / (gridSize - 1)) * lonRange;
        const lat = ne.lat - (gy / (gridSize - 1)) * latRange;

        // Skip if cell is outside the outer ring
        if (!pointInRing(lon, lat, outerRing)) continue;

        // Skip if cell is inside a hole ring (island)
        let inHole = false;
        for (const hole of holes) {
          if (pointInRing(lon, lat, hole)) {
            inHole = true;
            break;
          }
        }
        if (inHole) continue;

        modifiedElevations[gy * gridSize + gx] = depressionElev;
      }
    }
  }

  // Recompute min/max from modified grid
  let newMin = Infinity, newMax = -Infinity;
  for (let i = 0; i < modifiedElevations.length; i++) {
    if (modifiedElevations[i] < newMin) newMin = modifiedElevations[i];
    if (modifiedElevations[i] > newMax) newMax = modifiedElevations[i];
  }

  return {
    elevations: modifiedElevations,
    gridSize,
    minElevation: newMin,
    maxElevation: newMax,
  };
}
