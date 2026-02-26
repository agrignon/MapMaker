/**
 * OSM GeoJSON parser for vegetation features.
 * Converts raw Overpass API data to VegetationFeature array
 * using osmtogeojson for the initial conversion.
 */

import osmtogeojson from 'osmtogeojson';
import type { VegetationFeature } from './types';

/**
 * Minimum polygon area in square meters for vegetation features.
 * 2500 m² = 50m × 50m — filters pocket parks too small to print
 * at typical model scales.
 */
export const MIN_VEGE_AREA_M2 = 2500;

/**
 * Compute approximate polygon area in m² using the shoelace formula.
 * Coordinates are in degrees; multiplying by (111000)² gives approximate m².
 * Sufficient for the minimum-area threshold filter.
 */
function polygonAreaM2(ring: [number, number][]): number {
  const n = ring.length;
  if (n < 3) return 0;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % n];
    area += x0 * y1 - x1 * y0;
  }
  // Convert from degree² to m² using 111000 m/degree approximation
  return Math.abs(area / 2) * (111000 * 111000);
}

/**
 * Parse raw Overpass API response into VegetationFeature array.
 *
 * Processing rules:
 * - Only Polygon and MultiPolygon geometry is processed
 * - Polygons with fewer than 3 coordinates in the outer ring are skipped (degenerate)
 * - Polygons smaller than MIN_VEGE_AREA_M2 are skipped (too small to print)
 * - MultiPolygon relations produce one VegetationFeature per polygon member
 * - Inner rings (holes) are mapped to the holes array
 *
 * Filtered tags:
 * - leisure=park
 * - natural=wood
 * - landuse=forest
 *
 * @param osmJson - Raw JSON from Overpass API (fetchAllOsmData result)
 * @returns Array of vegetation features with outer ring, hole rings, and area
 */
export function parseVegetationFeatures(osmJson: unknown): VegetationFeature[] {
  const geoJSON = osmtogeojson(osmJson as Parameters<typeof osmtogeojson>[0]);
  const features: VegetationFeature[] = [];

  for (const feature of geoJSON.features) {
    if (!feature.geometry || !feature.properties) continue;
    const props = feature.properties as Record<string, unknown>;
    const geom = feature.geometry;

    // Filter: only park, wood, or forest tags
    if (
      props['leisure'] !== 'park' &&
      props['natural'] !== 'wood' &&
      props['landuse'] !== 'forest'
    ) {
      continue;
    }

    if (geom.type === 'Polygon') {
      const coords = geom.coordinates as number[][][];
      if (coords.length === 0 || coords[0].length < 3) continue;
      const outerRing = coords[0].map(p => [p[0], p[1]]) as [number, number][];
      const areaM2 = polygonAreaM2(outerRing);
      if (areaM2 < MIN_VEGE_AREA_M2) continue;
      features.push({
        outerRing,
        holes: coords.slice(1).map(ring =>
          ring.map(p => [p[0], p[1]]) as [number, number][]
        ),
        areaM2,
      });
    } else if (geom.type === 'MultiPolygon') {
      const polygons = geom.coordinates as number[][][][];
      for (const polygon of polygons) {
        if (polygon.length === 0 || polygon[0].length < 3) continue;
        const outerRing = polygon[0].map(p => [p[0], p[1]]) as [number, number][];
        const areaM2 = polygonAreaM2(outerRing);
        if (areaM2 < MIN_VEGE_AREA_M2) continue;
        features.push({
          outerRing,
          holes: polygon.slice(1).map(ring =>
            ring.map(p => [p[0], p[1]]) as [number, number][]
          ),
          areaM2,
        });
      }
    }
    // Skip LineString — not area features
  }

  return features;
}
