/**
 * OSM GeoJSON parser for water features.
 * Converts raw Overpass API data to WaterFeature array
 * using osmtogeojson for the initial conversion.
 */

import osmtogeojson from 'osmtogeojson';
import type { WaterFeature } from './types';

/**
 * Parse raw Overpass API response into WaterFeature array.
 *
 * Processing rules:
 * - Only Polygon and MultiPolygon geometry is processed
 * - LineString features (river centerlines) are skipped
 * - Polygons with fewer than 3 coordinates in the outer ring are skipped (degenerate)
 * - MultiPolygon relations produce one WaterFeature per polygon member
 * - Inner rings (holes) are mapped to the holes array — used for islands in lakes
 *
 * @param osmJson - Raw JSON from Overpass API (fetchWaterData result)
 * @returns Array of water features with outer ring and hole ring geometry
 */
export function parseWaterFeatures(osmJson: unknown): WaterFeature[] {
  const geoJSON = osmtogeojson(osmJson as Parameters<typeof osmtogeojson>[0]);
  const features: WaterFeature[] = [];

  for (const feature of geoJSON.features) {
    if (!feature.geometry || !feature.properties) continue;
    const geom = feature.geometry;

    if (geom.type === 'Polygon') {
      const coords = geom.coordinates as number[][][];
      if (coords.length === 0 || coords[0].length < 3) continue;
      features.push({
        outerRing: coords[0].map(p => [p[0], p[1]]) as [number, number][],
        holes: coords.slice(1).map(ring =>
          ring.map(p => [p[0], p[1]]) as [number, number][]
        ),
      });
    } else if (geom.type === 'MultiPolygon') {
      const polygons = geom.coordinates as number[][][][];
      for (const polygon of polygons) {
        if (polygon.length === 0 || polygon[0].length < 3) continue;
        features.push({
          outerRing: polygon[0].map(p => [p[0], p[1]]) as [number, number][],
          holes: polygon.slice(1).map(ring =>
            ring.map(p => [p[0], p[1]]) as [number, number][]
          ),
        });
      }
    }
    // Skip LineString — waterway=river centerlines (not area features)
  }

  return features;
}
