/**
 * Combined Overpass API fetcher.
 * Fetches buildings, roads, water, and vegetation in a single request to avoid 429 rate limiting.
 */

import type { BoundingBox } from '../types/geo';

/**
 * Fetch all OSM feature data (buildings, roads, water, vegetation) in one Overpass API call.
 *
 * Combines all individual queries to avoid rate limiting (429 Too Many Requests)
 * that occurs with sequential requests. Each parser filters the combined response
 * by its own tag criteria.
 *
 * @param bbox - The bounding box in WGS84 coordinates
 * @returns Raw JSON response from Overpass API
 * @throws Error if the HTTP response is not OK
 */
export async function fetchAllOsmData(bbox: BoundingBox): Promise<unknown> {
  const { sw, ne } = bbox;

  // Combined Overpass QL query: buildings + roads + water + vegetation in one request.
  // >;out skel qt; recurses relation members (needed for water/vegetation multipolygons,
  // harmless for building relations which already use out geom).
  const query = `[out:json][timeout:60][maxsize:33554432][bbox:${sw.lat},${sw.lon},${ne.lat},${ne.lon}];
(
  way["building"];
  way["building:part"];
  relation["building"]["type"="multipolygon"];
  way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|residential|unclassified)$"];
  way["natural"="water"];
  relation["natural"="water"];
  way["waterway"="riverbank"];
  way["leisure"="park"];
  relation["leisure"="park"]["type"="multipolygon"];
  way["natural"="wood"];
  relation["natural"="wood"]["type"="multipolygon"];
  way["landuse"="forest"];
  relation["landuse"="forest"]["type"="multipolygon"];
);
out geom;
>;
out skel qt;`;

  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    throw new Error(
      `Overpass API request failed: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}
