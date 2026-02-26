/**
 * Tests for the water depression bake algorithm.
 * Verifies: elevation lowering at water cells, island (hole) preservation,
 * immutability of input, min/max recomputation, and no-op for empty features.
 */

import { describe, it, expect } from 'vitest';
import { applyWaterDepressions, WATER_DEPRESSION_M } from '../depression';
import type { WaterFeature } from '../types';
import type { BoundingBox, ElevationData } from '../../../types/geo';

// ─── Test fixtures ─────────────────────────────────────────────────────────────

/**
 * Simple 5x5 elevation grid at 100m.
 * Grid cell (gx, gy) maps to index gy * 5 + gx.
 * lon = sw.lon + (gx / 4) * lonRange
 * lat = ne.lat - (gy / 4) * latRange
 * For bbox { sw:{lon:0,lat:0}, ne:{lon:1,lat:1} }:
 *   gx=0 → lon=0, gx=4 → lon=1
 *   gy=0 → lat=1 (north), gy=4 → lat=0 (south)
 */
const FLAT_GRID_5x5: ElevationData = {
  elevations: new Float32Array(25).fill(100),
  gridSize: 5,
  minElevation: 100,
  maxElevation: 100,
};

const SIMPLE_BBOX: BoundingBox = {
  sw: { lon: 0, lat: 0 },
  ne: { lon: 1, lat: 1 },
};

/**
 * Build a water polygon covering the center 3x3 cells (gx=1..3, gy=1..3).
 *
 * For a 5x5 grid with bbox lon=[0,1], lat=[0,1]:
 *   gx=1 → lon = 0 + (1/4)*1 = 0.25
 *   gx=3 → lon = 0 + (3/4)*1 = 0.75
 *   gy=1 → lat = 1 - (1/4)*1 = 0.75 (near north edge)
 *   gy=3 → lat = 1 - (3/4)*1 = 0.25 (near south edge)
 *
 * Outer ring is a rectangle around those cells, shrunk slightly inward from
 * the corner cell CENTERS so the pointInRing test reliably catches gx=1..3, gy=1..3
 * and misses gx=0, gx=4, gy=0, gy=4.
 *
 * We use 0.2..0.8 as the polygon bounds (cell centers for gx/gy=1..3 are at 0.25..0.75).
 */
function makeCenterPolygon(): WaterFeature {
  return {
    outerRing: [
      [0.2, 0.8],  // top-left (lon, lat)
      [0.8, 0.8],  // top-right
      [0.8, 0.2],  // bottom-right
      [0.2, 0.2],  // bottom-left
      [0.2, 0.8],  // closed
    ],
    holes: [],
  };
}

/**
 * Island hole covering center 1x1 cell (gx=2, gy=2).
 * Cell center: lon=0.5, lat=0.5
 * Hole ring just around center cell: 0.4..0.6 in lon/lat.
 */
function makeCenterHole(): [number, number][] {
  return [
    [0.4, 0.6],
    [0.6, 0.6],
    [0.6, 0.4],
    [0.4, 0.4],
    [0.4, 0.6],
  ];
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('applyWaterDepressions', () => {
  it('depresses elevation at water polygon cells', () => {
    const feature = makeCenterPolygon();
    const result = applyWaterDepressions(FLAT_GRID_5x5, [feature], SIMPLE_BBOX);

    // Shoreline min = 100m (flat grid), so depressionElev = 100 - WATER_DEPRESSION_M
    const expectedElev = 100 - WATER_DEPRESSION_M;

    // Edge cells (gy=0 or gy=4 or gx=0 or gx=4) should be unchanged at 100m
    expect(result.elevations[0 * 5 + 0]).toBe(100); // corner
    expect(result.elevations[0 * 5 + 2]).toBe(100); // top edge
    expect(result.elevations[4 * 5 + 4]).toBe(100); // corner

    // Center 3x3 (gy=1..3, gx=1..3) should be depressed
    for (let gy = 1; gy <= 3; gy++) {
      for (let gx = 1; gx <= 3; gx++) {
        const idx = gy * 5 + gx;
        expect(result.elevations[idx]).toBeCloseTo(expectedElev, 5);
      }
    }
  });

  it('does NOT depress cells inside hole rings (island)', () => {
    const feature: WaterFeature = {
      outerRing: makeCenterPolygon().outerRing,
      holes: [makeCenterHole()],
    };
    const result = applyWaterDepressions(FLAT_GRID_5x5, [feature], SIMPLE_BBOX);

    const expectedElev = 100 - WATER_DEPRESSION_M;

    // Center cell (gx=2, gy=2) is inside the hole — should NOT be depressed
    expect(result.elevations[2 * 5 + 2]).toBe(100);

    // Surrounding water cells (gx=1, gy=2 for example) SHOULD be depressed
    expect(result.elevations[2 * 5 + 1]).toBeCloseTo(expectedElev, 5);
    expect(result.elevations[1 * 5 + 1]).toBeCloseTo(expectedElev, 5);
    expect(result.elevations[3 * 5 + 3]).toBeCloseTo(expectedElev, 5);
  });

  it('returns new ElevationData — does not mutate input', () => {
    const original = new Float32Array(FLAT_GRID_5x5.elevations);
    const feature = makeCenterPolygon();

    applyWaterDepressions(FLAT_GRID_5x5, [feature], SIMPLE_BBOX);

    // Original must be byte-for-byte identical
    for (let i = 0; i < original.length; i++) {
      expect(FLAT_GRID_5x5.elevations[i]).toBe(original[i]);
    }
  });

  it('recomputes minElevation and maxElevation', () => {
    const feature = makeCenterPolygon();
    const result = applyWaterDepressions(FLAT_GRID_5x5, [feature], SIMPLE_BBOX);

    const expectedMin = 100 - WATER_DEPRESSION_M;

    expect(result.minElevation).toBeCloseTo(expectedMin, 5);
    expect(result.maxElevation).toBe(100);
  });

  it('handles empty features array (no-op)', () => {
    const result = applyWaterDepressions(FLAT_GRID_5x5, [], SIMPLE_BBOX);

    // All elevations should be unchanged
    for (let i = 0; i < FLAT_GRID_5x5.elevations.length; i++) {
      expect(result.elevations[i]).toBe(FLAT_GRID_5x5.elevations[i]);
    }

    expect(result.minElevation).toBe(FLAT_GRID_5x5.minElevation);
    expect(result.maxElevation).toBe(FLAT_GRID_5x5.maxElevation);
    expect(result.gridSize).toBe(FLAT_GRID_5x5.gridSize);
  });

  it('returns a new object even for no-op (empty features)', () => {
    const result = applyWaterDepressions(FLAT_GRID_5x5, [], SIMPLE_BBOX);

    // Must be a new object reference
    expect(result).not.toBe(FLAT_GRID_5x5);
    expect(result.elevations).not.toBe(FLAT_GRID_5x5.elevations);
  });

  it('does not depress cells outside the water polygon', () => {
    const feature = makeCenterPolygon();
    const result = applyWaterDepressions(FLAT_GRID_5x5, [feature], SIMPLE_BBOX);

    // All border cells should remain at 100
    for (let gx = 0; gx < 5; gx++) {
      expect(result.elevations[0 * 5 + gx]).toBe(100); // top row (gy=0)
      expect(result.elevations[4 * 5 + gx]).toBe(100); // bottom row (gy=4)
    }
    for (let gy = 0; gy < 5; gy++) {
      expect(result.elevations[gy * 5 + 0]).toBe(100); // left col (gx=0)
      expect(result.elevations[gy * 5 + 4]).toBe(100); // right col (gx=4)
    }
  });
});
