/**
 * OSM GeoJSON parser for building features.
 * Converts raw Overpass API data to BuildingFeature array
 * using osmtogeojson for the initial conversion.
 */

import osmtogeojson from 'osmtogeojson';
import type { BuildingFeature } from './types';

type GeoJSONPosition = number[];
type GeoJSONRing = GeoJSONPosition[];

/**
 * Convert [lon, lat, ?alt] position array to [lon, lat] tuple.
 */
function toCoordPair(pos: GeoJSONPosition): [number, number] {
  return [pos[0], pos[1]];
}

/**
 * Extract a BuildingFeature from a polygon's rings and OSM properties.
 */
function extractFromPolygon(
  outerRing: GeoJSONRing,
  holeRings: GeoJSONRing[],
  properties: Record<string, unknown>
): BuildingFeature | null {
  if (!outerRing || outerRing.length < 4) return null;

  const outer = outerRing.map(toCoordPair);
  const holes = holeRings
    .filter((ring) => ring && ring.length >= 4)
    .map((ring) => ring.map(toCoordPair));

  // Normalize properties to Record<string, string | undefined>
  const normalizedProps: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value !== null && value !== undefined) {
      normalizedProps[key] = String(value);
    } else {
      normalizedProps[key] = undefined;
    }
  }

  return { properties: normalizedProps, outerRing: outer, holes };
}

/**
 * Parse raw Overpass API response into BuildingFeature array.
 *
 * Handles both Polygon and MultiPolygon GeoJSON geometry types.
 * Each polygon (including each part of a MultiPolygon) becomes a separate
 * BuildingFeature entry so geometry can be processed independently.
 *
 * @param overpassData - Raw JSON from Overpass API (fetchBuildingData result)
 * @returns Array of building features with geometry and properties
 */
export function parseBuildingFeatures(overpassData: unknown): BuildingFeature[] {
  const geoJSON = osmtogeojson(overpassData as Parameters<typeof osmtogeojson>[0]);
  const features: BuildingFeature[] = [];

  for (const feature of geoJSON.features) {
    if (!feature.geometry || !feature.properties) continue;

    const props = feature.properties as Record<string, unknown>;
    const geometry = feature.geometry;

    if (geometry.type === 'Polygon') {
      const coords = geometry.coordinates as GeoJSONRing[];
      const [outerRing, ...holeRings] = coords;
      const building = extractFromPolygon(outerRing, holeRings, props);
      if (building) features.push(building);
    } else if (geometry.type === 'MultiPolygon') {
      const polygons = geometry.coordinates as GeoJSONRing[][];
      for (const polygon of polygons) {
        const [outerRing, ...holeRings] = polygon;
        const building = extractFromPolygon(outerRing, holeRings, props);
        if (building) features.push(building);
      }
    }
  }

  return features;
}
