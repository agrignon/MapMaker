/**
 * Elevation tile utilities for MapMaker.
 * Handles tile coordinate math, MapTiler terrain-RGB tile fetching,
 * and RGB-to-elevation decoding.
 */

/**
 * Convert WGS84 lon/lat to tile XYZ coordinates using OSM slippy map formula.
 */
export function lonLatToTile(lon: number, lat: number, z: number): [number, number] {
  const n = Math.pow(2, z);
  const x = Math.floor((lon + 180) / 360 * n);
  const latRad = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return [x, y];
}

/**
 * Return MapTiler terrain-rgb-v2 tile URL.
 */
export function tileUrl(z: number, x: number, y: number, apiKey: string): string {
  return `https://api.maptiler.com/tiles/terrain-rgb-v2/${z}/${x}/${y}.png?key=${apiKey}`;
}

/**
 * Decode terrain-RGB pixel values to elevation in meters.
 * Formula: -10000 + ((r * 256 * 256 + g * 256 + b) * 0.1)
 */
export function rgbToElevation(r: number, g: number, b: number): number {
  return -10000 + ((r * 256 * 256 + g * 256 + b) * 0.1);
}

/**
 * Fetch a tile and return its RGBA pixel data.
 * Uses createImageBitmap + OffscreenCanvas to avoid main thread blocking.
 */
export async function fetchTilePixels(url: string): Promise<Uint8ClampedArray> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch tile: ${response.status} ${response.statusText} — ${url}`);
  }
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2d context from OffscreenCanvas');
  }
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  return imageData.data;
}

/**
 * Convert an RGBA pixel array to a Float32Array of elevation values in meters.
 * Iterates pixels in groups of 4 (RGBA), applying rgbToElevation for each pixel.
 */
export function decodeTileToElevation(pixels: Uint8ClampedArray, size: number): Float32Array {
  const elevations = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    elevations[i] = rgbToElevation(r, g, b);
  }
  return elevations;
}

/**
 * Return the range of tile coordinates covering a bounding box at a given zoom level.
 * Note: tile Y increases downward (north is lower Y),
 * so yMin corresponds to ne.lat and yMax corresponds to sw.lat.
 */
export function getTileRange(
  sw: { lon: number; lat: number },
  ne: { lon: number; lat: number },
  zoom: number
): { xMin: number; xMax: number; yMin: number; yMax: number; cols: number; rows: number } {
  const [xSW, ySW] = lonLatToTile(sw.lon, sw.lat, zoom);
  const [xNE, yNE] = lonLatToTile(ne.lon, ne.lat, zoom);

  const xMin = Math.min(xSW, xNE);
  const xMax = Math.max(xSW, xNE);
  // yNE is smaller (north is lower Y in tile coords)
  const yMin = Math.min(ySW, yNE);
  const yMax = Math.max(ySW, yNE);

  const cols = xMax - xMin + 1;
  const rows = yMax - yMin + 1;

  return { xMin, xMax, yMin, yMax, cols, rows };
}

/**
 * Select optimal zoom level for a bounding box.
 * Starts at zoom 12, decreases if tile count exceeds maxTiles.
 * If tile count is 1, tries increasing zoom up to 14 for more detail.
 * Returns zoom in range [8, 14].
 */
export function chooseTileZoom(
  sw: { lon: number; lat: number },
  ne: { lon: number; lat: number },
  maxTiles = 9
): number {
  let zoom = 12;

  // Decrease zoom until tile count is within maxTiles or we hit minimum
  while (zoom > 8) {
    const range = getTileRange(sw, ne, zoom);
    const tileCount = range.cols * range.rows;
    if (tileCount <= maxTiles) {
      break;
    }
    zoom--;
  }

  // If tile count is 1, try increasing zoom for more detail (up to 14)
  const rangeAtCurrent = getTileRange(sw, ne, zoom);
  if (rangeAtCurrent.cols * rangeAtCurrent.rows === 1 && zoom < 14) {
    while (zoom < 14) {
      const rangeNext = getTileRange(sw, ne, zoom + 1);
      const nextCount = rangeNext.cols * rangeNext.rows;
      if (nextCount > maxTiles) {
        break;
      }
      zoom++;
    }
  }

  return Math.max(8, Math.min(14, zoom));
}
