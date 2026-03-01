/**
 * Overture Maps buildings PMTiles URL.
 *
 * RELEASE ROTATION WARNING:
 * Overture releases monthly. This URL encodes the release date (2026-02-18.0).
 * To update: check https://stac.overturemaps.org/catalog.json → "latest" field,
 * then: https://stac.overturemaps.org/{LATEST}/buildings/catalog.json → pmtiles href.
 * STAC catalog: https://stac.overturemaps.org/
 *
 * MVT layer name inside archive: "building" (singular, confirmed 2026-02-28)
 * Zoom range in archive: minzoom 5, maxzoom 14
 * CORS: Access-Control-Allow-Origin: * (verified 2026-02-28, no proxy needed)
 */
export const OVERTURE_BUILDINGS_PMTILES_URL =
  'https://tiles.overturemaps.org/2026-02-18.0/buildings.pmtiles';

/** STAC catalog URL for finding future releases */
export const OVERTURE_STAC_CATALOG_URL = 'https://stac.overturemaps.org/catalog.json';

/**
 * MVT layer name inside the buildings PMTiles archive.
 * IMPORTANT: This is "building" (singular), NOT "buildings" (plural).
 * Confirmed from live archive metadata on 2026-02-28.
 * Using the wrong name returns zero features with no error.
 */
export const OVERTURE_BUILDING_LAYER = 'building';

/** Zoom level for fetching Overture building tiles (maxzoom of archive = 14, where all properties are present) */
export const OVERTURE_FETCH_ZOOM = 14;

/** Timeout in milliseconds for the entire Overture fetch operation (all tiles combined) */
export const OVERTURE_FETCH_TIMEOUT_MS = 5000;
