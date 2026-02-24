/**
 * Elevation tile stitching and resampling utilities for MapMaker.
 * Stitches multiple decoded tile elevation arrays into a single grid,
 * then resamples to a martini-compatible (2^k+1) grid size.
 */

import { ElevationData } from '../../types/geo';
import {
  chooseTileZoom,
  getTileRange,
  fetchTilePixels,
  decodeTileToElevation,
  tileUrl,
} from './tiles';

/**
 * Stitch multiple decoded tile elevation arrays into a single elevation grid.
 * Adjacent tiles share a 1-pixel border; stitching skips duplicate border pixels.
 * Resulting stitched size: (cols * tileSize - (cols - 1)) x (rows * tileSize - (rows - 1))
 */
export function stitchTileElevations(
  tiles: { elevation: Float32Array; tileSize: number; col: number; row: number }[],
  cols: number,
  rows: number,
  tileSize: number
): Float32Array {
  // Each non-first tile contributes (tileSize - 1) pixels (skipping shared border)
  const stitchedWidth = cols * tileSize - (cols - 1);
  const stitchedHeight = rows * tileSize - (rows - 1);
  const result = new Float32Array(stitchedWidth * stitchedHeight);

  for (const tile of tiles) {
    const { elevation, col, row } = tile;

    // Destination offset in the stitched grid
    const destColOffset = col * (tileSize - 1);
    const destRowOffset = row * (tileSize - 1);

    // Source pixel range — skip first col/row for non-first tiles to avoid border duplication
    const srcColStart = col === 0 ? 0 : 1;
    const srcRowStart = row === 0 ? 0 : 1;

    for (let srcRow = srcRowStart; srcRow < tileSize; srcRow++) {
      for (let srcCol = srcColStart; srcCol < tileSize; srcCol++) {
        const srcIdx = srcRow * tileSize + srcCol;
        const destCol = destColOffset + srcCol - (col === 0 ? 0 : 1);
        const destRow = destRowOffset + srcRow - (row === 0 ? 0 : 1);
        const destIdx = destRow * stitchedWidth + destCol;
        result[destIdx] = elevation[srcIdx];
      }
    }
  }

  return result;
}

/**
 * Resample an elevation grid to a (2^k+1) x (2^k+1) size using bilinear interpolation.
 * Valid target sizes: 65, 129, 257, 513.
 */
export function resampleToMartiniGrid(
  elevation: Float32Array,
  srcWidth: number,
  srcHeight: number,
  targetSize: number
): Float32Array {
  const result = new Float32Array(targetSize * targetSize);
  const scaleX = (srcWidth - 1) / (targetSize - 1);
  const scaleY = (srcHeight - 1) / (targetSize - 1);

  for (let destRow = 0; destRow < targetSize; destRow++) {
    for (let destCol = 0; destCol < targetSize; destCol++) {
      const srcX = destCol * scaleX;
      const srcY = destRow * scaleY;

      const x0 = Math.floor(srcX);
      const x1 = Math.min(x0 + 1, srcWidth - 1);
      const y0 = Math.floor(srcY);
      const y1 = Math.min(y0 + 1, srcHeight - 1);

      const fx = srcX - x0;
      const fy = srcY - y0;

      // Bilinear interpolation
      const v00 = elevation[y0 * srcWidth + x0];
      const v10 = elevation[y0 * srcWidth + x1];
      const v01 = elevation[y1 * srcWidth + x0];
      const v11 = elevation[y1 * srcWidth + x1];

      const v = (1 - fy) * ((1 - fx) * v00 + fx * v10) +
                fy * ((1 - fx) * v01 + fx * v11);

      result[destRow * targetSize + destCol] = v;
    }
  }

  return result;
}

/**
 * Fetch elevation data for a bounding box.
 * Orchestrates zoom selection, tile fetching, stitching, and resampling.
 */
export async function fetchElevationForBbox(
  sw: { lon: number; lat: number },
  ne: { lon: number; lat: number },
  apiKey: string
): Promise<ElevationData> {
  // 1. Choose optimal zoom level
  const zoom = chooseTileZoom(sw, ne);

  // 2. Get tile range
  const { xMin, yMin, cols, rows } = getTileRange(sw, ne, zoom);

  const tileSize = 256;
  const isMultiTile = cols > 1 || rows > 1;
  const targetSize = isMultiTile ? 513 : 257;

  // 3. Fetch all tiles concurrently
  const tilePromises: Promise<{ elevation: Float32Array; tileSize: number; col: number; row: number }>[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const tileX = xMin + col;
      const tileY = yMin + row;
      const url = tileUrl(zoom, tileX, tileY, apiKey);

      const promise = fetchTilePixels(url).then((pixels) => {
        const elevation = decodeTileToElevation(pixels, tileSize);
        return { elevation, tileSize, col, row };
      });

      tilePromises.push(promise);
    }
  }

  const fetchedTiles = await Promise.all(tilePromises);

  // 4. Stitch tiles
  const stitchedElevation = stitchTileElevations(fetchedTiles, cols, rows, tileSize);
  const stitchedWidth = cols * tileSize - (cols - 1);
  const stitchedHeight = rows * tileSize - (rows - 1);

  // 5. Resample to martini grid
  const elevations = resampleToMartiniGrid(stitchedElevation, stitchedWidth, stitchedHeight, targetSize);

  // 6. Compute min/max elevation
  let minElevation = Infinity;
  let maxElevation = -Infinity;
  for (let i = 0; i < elevations.length; i++) {
    const v = elevations[i];
    if (v < minElevation) minElevation = v;
    if (v > maxElevation) maxElevation = v;
  }

  // 7. Return ElevationData
  return {
    elevations,
    gridSize: targetSize,
    minElevation,
    maxElevation,
  };
}
