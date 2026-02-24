/**
 * Tests for bilinear elevation sampling.
 * Uses synthetic 3x3 and 5x5 grids with known values.
 */

import { describe, it, expect } from 'vitest';
import { sampleElevationAtLonLat } from '../elevationSampler';
import type { BoundingBox, ElevationData } from '../../../types/geo';

/** Create a simple 3x3 elevation grid (9 cells) */
function make3x3Grid(values: number[]): ElevationData {
  return {
    elevations: new Float32Array(values),
    gridSize: 3,
    minElevation: Math.min(...values),
    maxElevation: Math.max(...values),
  };
}

/**
 * 3x3 test grid (row-major, row 0 = north):
 *   [1, 2, 3]   (north row)
 *   [4, 5, 6]   (middle row)
 *   [7, 8, 9]   (south row)
 *
 * Center value is 5.
 */
const GRID_3X3 = make3x3Grid([1, 2, 3, 4, 5, 6, 7, 8, 9]);

const BBOX: BoundingBox = {
  sw: { lon: 0, lat: 0 },
  ne: { lon: 2, lat: 2 },
};

describe('sampleElevationAtLonLat — bilinear interpolation', () => {
  it('returns NW corner value (top-left of grid)', () => {
    // NW = sw.lon, ne.lat → grid index [0,0] = 1
    const result = sampleElevationAtLonLat(0, 2, BBOX, GRID_3X3);
    expect(result).toBeCloseTo(1, 5);
  });

  it('returns NE corner value (top-right of grid)', () => {
    // NE = ne.lon, ne.lat → grid index [0,2] = 3
    const result = sampleElevationAtLonLat(2, 2, BBOX, GRID_3X3);
    expect(result).toBeCloseTo(3, 5);
  });

  it('returns SW corner value (bottom-left of grid)', () => {
    // SW = sw.lon, sw.lat → grid index [2,0] = 7
    const result = sampleElevationAtLonLat(0, 0, BBOX, GRID_3X3);
    expect(result).toBeCloseTo(7, 5);
  });

  it('returns SE corner value (bottom-right of grid)', () => {
    // SE = ne.lon, sw.lat → grid index [2,2] = 9
    const result = sampleElevationAtLonLat(2, 0, BBOX, GRID_3X3);
    expect(result).toBeCloseTo(9, 5);
  });

  it('returns center grid value', () => {
    // Center = lon=1, lat=1 → grid index [1,1] = 5
    const result = sampleElevationAtLonLat(1, 1, BBOX, GRID_3X3);
    expect(result).toBeCloseTo(5, 5);
  });

  it('returns average between two horizontally adjacent cells', () => {
    // Midpoint between NW (1) and NE (3) in north row = 2
    // lon=1, lat=2 → midpoint of top row → average of col 0 (1) and col 2 (3)
    // At tx=0.5, ty=0: interpolate between e00=1, e10=3, e01=4, e11=6
    // top = 1 + (3-1)*0.5 = 2, bottom = 4 + (6-4)*0.5 = 5, result = 2 (fy=0)
    const result = sampleElevationAtLonLat(1, 2, BBOX, GRID_3X3);
    expect(result).toBeCloseTo(2, 5);
  });

  it('returns average between two vertically adjacent cells (north-south)', () => {
    // NW corner is 1, SW corner (same column) is 7
    // Midpoint = lon=0, lat=1 → ty=0.5, tx=0
    // e00=1, e01=7, no x interpolation (fx=0), result = 1 + (7-1)*0.5 = 4
    const result = sampleElevationAtLonLat(0, 1, BBOX, GRID_3X3);
    expect(result).toBeCloseTo(4, 5);
  });

  it('clamps points outside bbox to edge (west of bbox)', () => {
    // lon=-1 (west of sw.lon=0) should clamp to lon=0
    const inside = sampleElevationAtLonLat(0, 1, BBOX, GRID_3X3);
    const outside = sampleElevationAtLonLat(-1, 1, BBOX, GRID_3X3);
    expect(outside).toBeCloseTo(inside, 5);
  });

  it('clamps points outside bbox to edge (north of bbox)', () => {
    // lat=3 (north of ne.lat=2) should clamp to lat=2
    const inside = sampleElevationAtLonLat(1, 2, BBOX, GRID_3X3);
    const outside = sampleElevationAtLonLat(1, 3, BBOX, GRID_3X3);
    expect(outside).toBeCloseTo(inside, 5);
  });

  it('handles flat grid (all same value)', () => {
    const flatGrid: ElevationData = {
      elevations: new Float32Array(9).fill(42),
      gridSize: 3,
      minElevation: 42,
      maxElevation: 42,
    };
    const result = sampleElevationAtLonLat(0.5, 0.7, BBOX, flatGrid);
    expect(result).toBeCloseTo(42, 5);
  });
});
