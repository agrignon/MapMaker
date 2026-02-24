/**
 * Unit tests for stitchTileElevations and multi-tile grid stitching.
 *
 * These tests verify that tile stitching uses simple concatenation (no border-overlap
 * deduplication), producing grids with dimensions cols*tileSize x rows*tileSize.
 *
 * RED phase: All 4 tests MUST FAIL with the current buggy implementation in stitch.ts,
 * which incorrectly assumes adjacent tiles share a 1-pixel border.
 */

import { describe, it, expect } from 'vitest';
import { stitchTileElevations } from '../stitch';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Create a synthetic tile with all pixels set to a constant elevation value.
 */
function makeTile(
  col: number,
  row: number,
  tileSize: number,
  fillValue: number
): { elevation: Float32Array; tileSize: number; col: number; row: number } {
  const elevation = new Float32Array(tileSize * tileSize).fill(fillValue);
  return { elevation, tileSize, col, row };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('stitchTileElevations — grid dimensions', () => {
  it('stitched grid dimensions are cols*tileSize x rows*tileSize (no border deduction)', () => {
    // 2x1 grid, tileSize=4: correct stitched width = 2*4 = 8, height = 1*4 = 4
    const tileSize = 4;
    const tile0 = makeTile(0, 0, tileSize, 100);
    const tile1 = makeTile(1, 0, tileSize, 200);

    const result = stitchTileElevations([tile0, tile1], 2, 1, tileSize);

    // Correct: 2*4*1*4 = 32. Buggy code produces 7*4=28 (stitchedWidth = 2*4-1 = 7)
    expect(result.length).toBe(8 * 4);
  });
});

describe('stitchTileElevations — boundary data preservation', () => {
  it('no elevation data is dropped at tile boundaries', () => {
    // 2x1 grid, tileSize=4
    // Tile(0,0): each pixel = its column index (0,1,2,3 repeating per row)
    // Tile(1,0): each pixel = column index + 10 (10,11,12,13 repeating per row)
    const tileSize = 4;

    const elev0 = new Float32Array(tileSize * tileSize);
    for (let r = 0; r < tileSize; r++) {
      for (let c = 0; c < tileSize; c++) {
        elev0[r * tileSize + c] = c; // 0,1,2,3
      }
    }

    const elev1 = new Float32Array(tileSize * tileSize);
    for (let r = 0; r < tileSize; r++) {
      for (let c = 0; c < tileSize; c++) {
        elev1[r * tileSize + c] = c + 10; // 10,11,12,13
      }
    }

    const tile0 = { elevation: elev0, tileSize, col: 0, row: 0 };
    const tile1 = { elevation: elev1, tileSize, col: 1, row: 0 };

    const result = stitchTileElevations([tile0, tile1], 2, 1, tileSize);

    // First row of stitched grid must be [0, 1, 2, 3, 10, 11, 12, 13]
    // Buggy code skips srcCol=0 of tile(1,0) — drops value 10 — and grid is only 7 wide
    const firstRow = Array.from(result.slice(0, 8));
    expect(firstRow).toEqual([0, 1, 2, 3, 10, 11, 12, 13]);
  });
});

describe('stitchTileElevations — zero-elevation strips', () => {
  it('no zero-elevation strips at grid edges', () => {
    // 2x2 grid, tileSize=4: all tiles filled with 500 (nonzero)
    const tileSize = 4;
    const tiles = [
      makeTile(0, 0, tileSize, 500),
      makeTile(1, 0, tileSize, 500),
      makeTile(0, 1, tileSize, 500),
      makeTile(1, 1, tileSize, 500),
    ];

    const result = stitchTileElevations(tiles, 2, 2, tileSize);

    // Buggy code leaves the last column and last row unwritten, defaulting to 0
    const hasZero = Array.from(result).some((v) => v === 0);
    expect(hasZero).toBe(false);
  });
});

describe('stitchTileElevations — corner values in 2x2 grid', () => {
  it('2x2 tile stitching preserves known corner values', () => {
    // Each tile has a distinct constant elevation:
    // Tile(0,0)=100 (NW), Tile(1,0)=200 (NE), Tile(0,1)=300 (SW), Tile(1,1)=400 (SE)
    const tileSize = 4;
    const tiles = [
      makeTile(0, 0, tileSize, 100), // NW
      makeTile(1, 0, tileSize, 200), // NE
      makeTile(0, 1, tileSize, 300), // SW
      makeTile(1, 1, tileSize, 400), // SE
    ];

    const result = stitchTileElevations(tiles, 2, 2, tileSize);

    // Stitched grid: 8x8 = 64 elements
    expect(result.length).toBe(64);

    // Corner values:
    // result[0]  = top-left  = NW = 100
    // result[7]  = top-right = NE = 200
    // result[56] = bottom-left  = SW = 300
    // result[63] = bottom-right = SE = 400
    expect(result[0]).toBe(100);   // top-left (NW)
    expect(result[7]).toBe(200);   // top-right (NE)
    expect(result[56]).toBe(300);  // bottom-left (SW)
    expect(result[63]).toBe(400);  // bottom-right (SE)
  });
});
