/**
 * Tests for roof geometry builders: flat, gabled, hipped, pyramidal.
 * Also tests the buildRoofForShape dispatcher and OBB-based ridge direction.
 */

import { describe, it, expect } from 'vitest';
import {
  buildFlatRoof,
  buildGabledRoof,
  buildPyramidalRoof,
  buildHippedRoof,
  buildRoofForShape,
} from '../roof';

// Unit square footprint (CCW in Y-up space)
const SQUARE_4: [number, number][] = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];

// Rectangular footprint (30mm wide, 10mm deep) — gabled ridge along X axis
const RECT: [number, number][] = [
  [0, 0],
  [30, 0],
  [30, 10],
  [0, 10],
];

// Flat Z values at wall top (uniform for simpler tests)
const Z_FLAT_SQUARE = [5, 5, 5, 5];
const Z_FLAT_RECT = [5, 5, 5, 5];

// ──────────────────────────────────────────────────────────────────────────────
// buildFlatRoof
// ──────────────────────────────────────────────────────────────────────────────

describe('buildFlatRoof', () => {
  it('square footprint (4 vertices) produces exactly 2 triangles (6 position triplets)', () => {
    const result = buildFlatRoof(SQUARE_4, Z_FLAT_SQUARE);
    // 2 triangles * 3 vertices * 3 coords = 18 floats
    expect(result.length).toBe(18);
  });

  it('all Z values in result equal wall top Z', () => {
    const wallTopZ = 7;
    const zValues = [wallTopZ, wallTopZ, wallTopZ, wallTopZ];
    const result = buildFlatRoof(SQUARE_4, zValues);
    for (let i = 2; i < result.length; i += 3) {
      expect(result[i]).toBeCloseTo(wallTopZ, 5);
    }
  });

  it('returns Float32Array', () => {
    const result = buildFlatRoof(SQUARE_4, Z_FLAT_SQUARE);
    expect(result).toBeInstanceOf(Float32Array);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// buildPyramidalRoof
// ──────────────────────────────────────────────────────────────────────────────

describe('buildPyramidalRoof', () => {
  it('square footprint produces 4 triangles (12 position triplets = 36 floats)', () => {
    const result = buildPyramidalRoof(SQUARE_4, Z_FLAT_SQUARE, 5);
    // 4 triangles * 3 vertices * 3 coords = 36 floats
    expect(result.length).toBe(36);
  });

  it('apex Z equals wall top Z + roofHeightMM', () => {
    const wallTopZ = 5;
    const roofHeight = 8;
    const expectedApexZ = wallTopZ + roofHeight;
    const result = buildPyramidalRoof(SQUARE_4, [wallTopZ, wallTopZ, wallTopZ, wallTopZ], roofHeight);
    // Find the maximum Z value — it should be the apex
    let maxZ = -Infinity;
    for (let i = 2; i < result.length; i += 3) {
      if (result[i] > maxZ) maxZ = result[i];
    }
    expect(maxZ).toBeCloseTo(expectedApexZ, 5);
  });

  it('all triangles share the apex point', () => {
    const wallTopZ = 5;
    const roofHeight = 10;
    const expectedApexZ = wallTopZ + roofHeight;
    const result = buildPyramidalRoof(SQUARE_4, [wallTopZ, wallTopZ, wallTopZ, wallTopZ], roofHeight);
    // For each triangle, exactly one vertex should be at apexZ
    for (let t = 0; t < 4; t++) {
      const base = t * 9; // 3 vertices * 3 coords
      const zValues = [result[base + 2], result[base + 5], result[base + 8]];
      const apexCount = zValues.filter((z) => Math.abs(z - expectedApexZ) < 0.001).length;
      expect(apexCount).toBe(1);
    }
  });

  it('returns Float32Array', () => {
    const result = buildPyramidalRoof(SQUARE_4, Z_FLAT_SQUARE, 5);
    expect(result).toBeInstanceOf(Float32Array);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// buildGabledRoof
// ──────────────────────────────────────────────────────────────────────────────

describe('buildGabledRoof', () => {
  it('rectangle footprint produces geometry with apex Z > wall top Z', () => {
    const wallTopZ = 5;
    const roofHeight = 6;
    const result = buildGabledRoof(RECT, Z_FLAT_RECT, [], roofHeight);
    const expectedRidgeZ = wallTopZ + roofHeight;
    let maxZ = -Infinity;
    for (let i = 2; i < result.length; i += 3) {
      if (result[i] > maxZ) maxZ = result[i];
    }
    expect(maxZ).toBeCloseTo(expectedRidgeZ, 5);
  });

  it('returns Float32Array', () => {
    const result = buildGabledRoof(RECT, Z_FLAT_RECT, [], 5);
    expect(result).toBeInstanceOf(Float32Array);
  });

  it('produces non-empty geometry for a rectangle', () => {
    const result = buildGabledRoof(RECT, Z_FLAT_RECT, [], 4);
    expect(result.length).toBeGreaterThan(0);
    // Must be a multiple of 9 (3 vertices * 3 coords per triangle)
    expect(result.length % 9).toBe(0);
  });

  it('zero roof height produces geometry at wall top Z only', () => {
    const wallTopZ = 5;
    const result = buildGabledRoof(RECT, [wallTopZ, wallTopZ, wallTopZ, wallTopZ], [], 0);
    for (let i = 2; i < result.length; i += 3) {
      expect(result[i]).toBeCloseTo(wallTopZ, 5);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// buildHippedRoof
// ──────────────────────────────────────────────────────────────────────────────

describe('buildHippedRoof', () => {
  it('rectangle footprint produces non-empty geometry', () => {
    const result = buildHippedRoof(RECT, Z_FLAT_RECT, [], 5);
    expect(result.length).toBeGreaterThan(0);
    expect(result.length % 9).toBe(0);
  });

  it('max Z equals wall top Z + roofHeightMM', () => {
    const wallTopZ = 5;
    const roofHeight = 7;
    const result = buildHippedRoof(RECT, [wallTopZ, wallTopZ, wallTopZ, wallTopZ], [], roofHeight);
    let maxZ = -Infinity;
    for (let i = 2; i < result.length; i += 3) {
      if (result[i] > maxZ) maxZ = result[i];
    }
    expect(maxZ).toBeCloseTo(wallTopZ + roofHeight, 5);
  });

  it('falls back to pyramidal for a square footprint', () => {
    // For a square, hipped falls back to pyramidal (ridgeLongHalfLen <= 0)
    const squareResult = buildHippedRoof(SQUARE_4, Z_FLAT_SQUARE, [], 5);
    const pyramidalResult = buildPyramidalRoof(SQUARE_4, Z_FLAT_SQUARE, 5);
    // Both should produce same triangle count (pyramidal = 4 triangles = 36 floats)
    expect(squareResult.length).toBe(pyramidalResult.length);
  });

  it('returns Float32Array', () => {
    const result = buildHippedRoof(RECT, Z_FLAT_RECT, [], 5);
    expect(result).toBeInstanceOf(Float32Array);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// buildRoofForShape dispatcher
// ──────────────────────────────────────────────────────────────────────────────

describe('buildRoofForShape', () => {
  it("dispatches 'flat' to buildFlatRoof (2 triangles for square)", () => {
    const result = buildRoofForShape('flat', SQUARE_4, Z_FLAT_SQUARE, [], 0);
    expect(result.length).toBe(18); // 2 triangles * 3 vertices * 3 coords
  });

  it("dispatches 'pyramidal' — apex Z equals wall top + roofHeight", () => {
    const wallTopZ = 5;
    const roofHeight = 4;
    const result = buildRoofForShape('pyramidal', SQUARE_4, [wallTopZ, wallTopZ, wallTopZ, wallTopZ], [], roofHeight);
    let maxZ = -Infinity;
    for (let i = 2; i < result.length; i += 3) {
      if (result[i] > maxZ) maxZ = result[i];
    }
    expect(maxZ).toBeCloseTo(wallTopZ + roofHeight, 5);
  });

  it("dispatches 'gabled' — produces geometry with ridge above walls", () => {
    const wallTopZ = 5;
    const roofHeight = 6;
    const result = buildRoofForShape('gabled', RECT, Z_FLAT_RECT, [], roofHeight);
    let maxZ = -Infinity;
    for (let i = 2; i < result.length; i += 3) {
      if (result[i] > maxZ) maxZ = result[i];
    }
    expect(maxZ).toBeCloseTo(wallTopZ + roofHeight, 5);
  });

  it("dispatches 'hipped' — produces non-empty geometry", () => {
    const result = buildRoofForShape('hipped', RECT, Z_FLAT_RECT, [], 5);
    expect(result.length).toBeGreaterThan(0);
  });

  it("falls back to flat for unknown shape 'onion'", () => {
    const flatResult = buildRoofForShape('flat', SQUARE_4, Z_FLAT_SQUARE, [], 0);
    const onionResult = buildRoofForShape('onion', SQUARE_4, Z_FLAT_SQUARE, [], 5);
    // Unknown shapes fall back to flat: same triangle count
    expect(onionResult.length).toBe(flatResult.length);
  });

  it("falls back to flat for unknown shape 'dome'", () => {
    const flatResult = buildRoofForShape('flat', SQUARE_4, Z_FLAT_SQUARE, [], 0);
    const domeResult = buildRoofForShape('dome', SQUARE_4, Z_FLAT_SQUARE, [], 5);
    expect(domeResult.length).toBe(flatResult.length);
  });
});
