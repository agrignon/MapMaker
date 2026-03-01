import { PMTiles } from 'pmtiles';
import cover from '@mapbox/tile-cover';
import type { BoundingBox } from '../../types/geo';
import { OVERTURE_BUILDINGS_PMTILES_URL, OVERTURE_FETCH_ZOOM } from './constants';

/**
 * Convert a BoundingBox to a list of [x, y, z] tile tuples at zoom OVERTURE_FETCH_ZOOM.
 *
 * NOTE: tile-cover returns [x, y, z] arrays — z is LAST.
 * PMTiles.getZxy(z, x, y) takes z FIRST. Order must be transposed at call site.
 */
export function bboxToTileKeys(bbox: BoundingBox): [number, number, number][] {
  const { sw, ne } = bbox;
  const w = sw.lon;
  const s = sw.lat;
  const e = ne.lon;
  const n = ne.lat;

  // Build a closed GeoJSON Polygon ring: [w,s],[e,s],[e,n],[w,n],[w,s]
  const polygon: GeoJSON.Polygon = {
    type: 'Polygon',
    coordinates: [
      [
        [w, s],
        [e, s],
        [e, n],
        [w, n],
        [w, s],
      ],
    ],
  };

  // tile-cover returns [x, y, z][] — z is at index 2
  return cover.tiles(polygon, {
    min_zoom: OVERTURE_FETCH_ZOOM,
    max_zoom: OVERTURE_FETCH_ZOOM,
  }) as [number, number, number][];
}

/**
 * Fetch raw tile data from the Overture PMTiles archive for all tiles covering the bbox.
 *
 * Returns a Map<"z/x/y", ArrayBuffer> for all non-empty tiles.
 * Tiles where getZxy returns undefined (no data for that tile) are silently skipped —
 * that is normal for ocean/unpopulated areas, NOT an error.
 *
 * Errors (network, abort) propagate to caller — caller handles silent fallback.
 */
export async function fetchTilesFromArchive(
  bbox: BoundingBox,
  signal: AbortSignal
): Promise<Map<string, ArrayBuffer>> {
  const archive = new PMTiles(OVERTURE_BUILDINGS_PMTILES_URL);
  const tiles = bboxToTileKeys(bbox);

  const results = new Map<string, ArrayBuffer>();

  await Promise.all(
    tiles.map(async ([x, y, z]) => {
      // NOTE: tile-cover returns [x, y, z], but PMTiles.getZxy takes (z, x, y) — z first
      const response = await archive.getZxy(z, x, y, signal);
      if (response !== undefined) {
        results.set(`${z}/${x}/${y}`, response.data);
      }
    })
  );

  return results;
}
