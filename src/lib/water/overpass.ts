/**
 * Overpass API water data fetcher.
 * Fetches natural=water and waterway=riverbank features for a given bounding box.
 * Includes relation member recursion to support MultiPolygon water bodies (lakes with islands).
 */

import type { BoundingBox } from '../../types/geo';

/**
 * Fetch water data from the Overpass API for a given bounding box.
 *
 * IMPORTANT: Overpass bbox order is south,west,north,east (NOT the GeoJSON order lon,lat).
 *
 * Fetches:
 * - way["natural"="water"] — lake/pond/reservoir ways
 * - relation["natural"="water"] — large water body relations (MultiPolygon)
 * - way["waterway"="riverbank"] — wide river bank polygons
 *
 * Includes ">; out skel qt;" for relation member recursion (resolves member way nodes
 * so osmtogeojson can reconstruct polygons correctly — Pitfall 1 from research).
 *
 * @param bbox - The bounding box in WGS84 coordinates
 * @returns Raw JSON response from Overpass API
 * @throws Error if the HTTP response is not OK
 */
export async function fetchWaterData(bbox: BoundingBox): Promise<unknown> {
  const { sw, ne } = bbox;

  // Overpass QL query: fetch water ways and relations with relation member recursion
  // bbox order: south,west,north,east
  const query = `[out:json][timeout:60][maxsize:33554432][bbox:${sw.lat},${sw.lon},${ne.lat},${ne.lon}];
(
  way["natural"="water"];
  relation["natural"="water"];
  way["waterway"="riverbank"];
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
      `Overpass water fetch failed: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}
