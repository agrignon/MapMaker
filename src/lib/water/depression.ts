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

/** Grid cells of shoreline taper — land slopes gradually into water instead of a cliff. */
const TAPER_CELLS = 3;

/**
 * Ray-cast point-in-ring test (Jordan curve theorem).
 * Returns true if (px, py) is inside the closed ring.
 *
 * @param px - X coordinate (longitude)
 * @param py - Y coordinate (latitude)
 * @param ring - Closed ring of [lon, lat] coordinate pairs
 */
export function pointInRing(px: number, py: number, ring: [number, number][]): boolean {
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

    // Compute depression elevation from shoreline minimum.
    // IMPORTANT: Only sample outer ring vertices that fall inside the grid.
    // Large water bodies (e.g. Folsom Lake) have outer rings extending far
    // beyond the bbox — clamping those to grid edges corrupts shorelineMin.
    let shorelineMin = Infinity;
    for (const [lon, lat] of outerRing) {
      const gx = ((lon - sw.lon) / lonRange) * (gridSize - 1);
      const gy = (1 - (lat - sw.lat) / latRange) * (gridSize - 1);
      if (gx < 0 || gx > gridSize - 1 || gy < 0 || gy > gridSize - 1) continue;
      const idx = Math.round(gy) * gridSize + Math.round(gx);
      shorelineMin = Math.min(shorelineMin, elevations[idx]);
    }

    // Fallback: if no outer ring vertices inside the grid (water body envelops
    // the entire bbox, e.g. house on a lakefront), sample water-interior grid
    // cells directly — they're the cells we're about to depress.
    if (shorelineMin === Infinity) {
      for (let gy = y0; gy <= y1; gy++) {
        for (let gx = x0; gx <= x1; gx++) {
          const lon = sw.lon + (gx / (gridSize - 1)) * lonRange;
          const lat = ne.lat - (gy / (gridSize - 1)) * latRange;
          if (!pointInRing(lon, lat, outerRing)) continue;
          let inHole = false;
          for (const hole of holes) {
            if (pointInRing(lon, lat, hole)) { inHole = true; break; }
          }
          if (inHole) continue;
          shorelineMin = Math.min(shorelineMin, elevations[gy * gridSize + gx]);
        }
      }
    }

    // If still no samples (polygon doesn't intersect grid at all), skip
    if (shorelineMin === Infinity) continue;

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

  // Shoreline taper: smooth the land-water transition over TAPER_CELLS grid cells.
  // Uses a simple BFS distance field from water boundary cells, then linearly
  // interpolates non-water cells toward depression elevation based on distance.
  const total = gridSize * gridSize;
  const isWater = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    if (modifiedElevations[i] !== elevations[i]) isWater[i] = 1;
  }

  // BFS from water boundary cells outward
  const dist = new Float32Array(total);
  dist.fill(Infinity);
  const queue: number[] = [];

  // Seed: water cells adjacent to non-water cells
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const idx = y * gridSize + x;
      if (!isWater[idx]) continue;
      // Check 4-neighbors for a non-water cell
      if ((x > 0 && !isWater[idx - 1]) ||
          (x < gridSize - 1 && !isWater[idx + 1]) ||
          (y > 0 && !isWater[idx - gridSize]) ||
          (y < gridSize - 1 && !isWater[idx + gridSize])) {
        dist[idx] = 0;
        queue.push(idx);
      }
    }
  }

  // BFS expand outward into non-water cells up to TAPER_CELLS
  let head = 0;
  while (head < queue.length) {
    const idx = queue[head++];
    const cx = idx % gridSize;
    const cy = (idx - cx) / gridSize;
    const d = dist[idx] + 1;
    if (d > TAPER_CELLS) continue;

    const neighbors = [
      cy > 0 ? idx - gridSize : -1,
      cy < gridSize - 1 ? idx + gridSize : -1,
      cx > 0 ? idx - 1 : -1,
      cx < gridSize - 1 ? idx + 1 : -1,
    ];
    for (const ni of neighbors) {
      if (ni < 0 || isWater[ni] || dist[ni] <= d) continue;
      dist[ni] = d;
      queue.push(ni);
    }
  }

  // Apply taper: lower non-water cells near the shoreline by a fraction of
  // WATER_DEPRESSION_M, creating a gradual slope from land down to water level.
  for (let i = 0; i < total; i++) {
    if (isWater[i] || dist[i] > TAPER_CELLS) continue;
    const t = 1 - dist[i] / (TAPER_CELLS + 1); // 0.75 at dist=1, 0.50 at dist=2, 0.25 at dist=3
    modifiedElevations[i] = elevations[i] - t * WATER_DEPRESSION_M;
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
