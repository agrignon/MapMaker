/**
 * Overpass API building data fetcher.
 * Fetches building ways, parts, and relations for a given bounding box.
 */

import type { BoundingBox } from '../../types/geo';

/**
 * Fetch building data from the Overpass API for a given bounding box.
 *
 * IMPORTANT: Overpass bbox order is south,west,north,east (NOT the GeoJSON order lon,lat).
 *
 * @param bbox - The bounding box in WGS84 coordinates
 * @returns Raw JSON response from Overpass API
 * @throws Error if the HTTP response is not OK
 */
export async function fetchBuildingData(bbox: BoundingBox): Promise<unknown> {
  const { sw, ne } = bbox;

  // Overpass QL query: fetch ways with building/building:part tags
  // and relations of type multipolygon with building tag.
  // bbox order: south,west,north,east
  const query = `[out:json][timeout:60][maxsize:33554432][bbox:${sw.lat},${sw.lon},${ne.lat},${ne.lon}];
(
  way["building"];
  way["building:part"];
  relation["building"]["type"="multipolygon"];
);
out geom;`;

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
