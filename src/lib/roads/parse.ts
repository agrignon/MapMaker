/**
 * OSM GeoJSON parser for road features.
 * Converts raw Overpass API data to RoadFeature array
 * using osmtogeojson for the initial conversion.
 */

import osmtogeojson from 'osmtogeojson';
import type { RoadFeature, RoadTier } from './types';

/**
 * Classify a highway tag value into a RoadTier.
 *
 * @param highway - The OSM highway tag value
 * @returns The road tier, or null if the highway type should be skipped
 */
export function classifyTier(highway: string): RoadTier | null {
  switch (highway) {
    case 'motorway':
    case 'motorway_link':
    case 'trunk':
    case 'trunk_link':
      return 'highway';

    case 'primary':
    case 'primary_link':
    case 'secondary':
    case 'secondary_link':
    case 'tertiary':
    case 'tertiary_link':
      return 'main';

    case 'residential':
    case 'unclassified':
      return 'residential';

    default:
      return null;
  }
}

/**
 * Parse raw Overpass API response into RoadFeature array.
 *
 * Processing rules:
 * - Only LineString geometry is processed (Polygon roundabouts are skipped — Pitfall 4)
 * - Features without highway property are skipped
 * - Tunnels (tunnel=yes) are excluded (locked decision)
 * - Bridges (bridge=yes) are flagged with isBridge=true
 * - Highway types not matching known tiers are skipped
 *
 * @param osmJson - Raw JSON from Overpass API (fetchRoadData result)
 * @returns Array of road features with geometry and classification
 */
export function parseRoadFeatures(osmJson: unknown): RoadFeature[] {
  const geoJSON = osmtogeojson(osmJson as Parameters<typeof osmtogeojson>[0]);
  const features: RoadFeature[] = [];

  for (const feature of geoJSON.features) {
    if (!feature.geometry || !feature.properties) continue;

    const props = feature.properties as Record<string, unknown>;
    const geometry = feature.geometry;

    // Only process LineString geometry — skip Polygon (roundabouts converted by osmtogeojson)
    if (geometry.type !== 'LineString') continue;

    // Highway tag required
    const highway = props['highway'];
    if (!highway || typeof highway !== 'string') continue;

    // Skip tunnels (locked decision: tunnels excluded from road mesh)
    if (props['tunnel'] === 'yes') continue;

    // Classify tier — skip if highway type is not in our set
    const tier = classifyTier(highway);
    if (tier === null) continue;

    // Flag bridges
    const isBridge = props['bridge'] === 'yes';

    // Extract coordinates from LineString
    const coords = geometry.coordinates as number[][];
    const coordinates: [number, number][] = coords.map((pos) => [pos[0], pos[1]]);

    features.push({ coordinates, tier, isBridge });
  }

  return features;
}
