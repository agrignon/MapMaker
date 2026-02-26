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
 * Water polygon covering center 3x3 cells (gx=1..3, gy=1..3).
 */
function makeCenterPolygon(): WaterFeature {
  return {
    outerRing: [
      [0.2, 0.8],
      [0.8, 0.8],
      [0.8, 0.2],
      [0.2, 0.2],
      [0.2, 0.8],
    ],
    holes: [],
  };
}

/**
 * Island hole covering center 1x1 cell (gx=2, gy=2).
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

    const expectedElev = 100 - WATER_DEPRESSION_M;

    // Center 3x3 (gy=1..3, gx=1..3) should be fully depressed
    for (let gy = 1; gy <= 3; gy++) {
      for (let gx = 1; gx <= 3; gx++) {
        expect(result.elevations[gy * 5 + gx]).toBeCloseTo(expectedElev, 5);
      }
    }

    // Edge cells are tapered (not fully depressed, not at original 100)
    // On a 5x5 grid the taper reaches all edge cells — they should be
    // LOWER than 100 but HIGHER than the full depression
    expect(result.elevations[0 * 5 + 0]).toBeLessThan(100); // corner tapered
    expect(result.elevations[0 * 5 + 0]).toBeGreaterThan(expectedElev);
  });

  it('does NOT depress cells inside hole rings (island)', () => {
    const feature: WaterFeature = {
      outerRing: makeCenterPolygon().outerRing,
      holes: [makeCenterHole()],
    };
    const result = applyWaterDepressions(FLAT_GRID_5x5, [feature], SIMPLE_BBOX);

    const expectedElev = 100 - WATER_DEPRESSION_M;

    // Center cell (gx=2, gy=2) is inside the hole — NOT water-depressed
    // (it may be slightly tapered since it neighbors water cells, but it
    // must NOT be at full depression depth)
    expect(result.elevations[2 * 5 + 2]).toBeGreaterThan(expectedElev);

    // Surrounding water cells SHOULD be fully depressed
    expect(result.elevations[2 * 5 + 1]).toBeCloseTo(expectedElev, 5);
    expect(result.elevations[1 * 5 + 1]).toBeCloseTo(expectedElev, 5);
    expect(result.elevations[3 * 5 + 3]).toBeCloseTo(expectedElev, 5);
  });

  it('returns new ElevationData — does not mutate input', () => {
    const original = new Float32Array(FLAT_GRID_5x5.elevations);
    const feature = makeCenterPolygon();

    applyWaterDepressions(FLAT_GRID_5x5, [feature], SIMPLE_BBOX);

    for (let i = 0; i < original.length; i++) {
      expect(FLAT_GRID_5x5.elevations[i]).toBe(original[i]);
    }
  });

  it('recomputes minElevation and maxElevation', () => {
    const feature = makeCenterPolygon();
    const result = applyWaterDepressions(FLAT_GRID_5x5, [feature], SIMPLE_BBOX);

    const expectedMin = 100 - WATER_DEPRESSION_M;

    expect(result.minElevation).toBeCloseTo(expectedMin, 5);
    // maxElevation may be slightly below 100 due to taper on all edge cells
    expect(result.maxElevation).toBeLessThanOrEqual(100);
    expect(result.maxElevation).toBeGreaterThan(expectedMin);
  });

  it('handles empty features array (no-op)', () => {
    const result = applyWaterDepressions(FLAT_GRID_5x5, [], SIMPLE_BBOX);

    for (let i = 0; i < FLAT_GRID_5x5.elevations.length; i++) {
      expect(result.elevations[i]).toBe(FLAT_GRID_5x5.elevations[i]);
    }

    expect(result.minElevation).toBe(FLAT_GRID_5x5.minElevation);
    expect(result.maxElevation).toBe(FLAT_GRID_5x5.maxElevation);
  });

  it('returns a new object even for no-op (empty features)', () => {
    const result = applyWaterDepressions(FLAT_GRID_5x5, [], SIMPLE_BBOX);

    expect(result).not.toBe(FLAT_GRID_5x5);
    expect(result.elevations).not.toBe(FLAT_GRID_5x5.elevations);
  });

  it('taper creates gradual slope from land to water', () => {
    const feature = makeCenterPolygon();
    const result = applyWaterDepressions(FLAT_GRID_5x5, [feature], SIMPLE_BBOX);

    const depressed = 100 - WATER_DEPRESSION_M;

    // A cell adjacent to water (dist=1) should be lower than a corner (dist=2)
    const adjacent = result.elevations[0 * 5 + 2]; // top edge, middle
    const corner = result.elevations[0 * 5 + 0];   // top-left corner

    expect(adjacent).toBeLessThan(corner); // closer to water = lower
    expect(adjacent).toBeGreaterThan(depressed); // but not fully depressed
    expect(corner).toBeGreaterThan(depressed);
  });
});
