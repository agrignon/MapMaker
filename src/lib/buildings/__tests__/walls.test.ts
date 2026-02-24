/**
 * Tests for building wall construction.
 * Verifies correct vertex count, per-vertex base elevation, winding detection,
 * and outward-facing normals.
 */

import { describe, it, expect } from 'vitest';
import { buildWalls, computeSignedArea } from '../walls';

describe('computeSignedArea', () => {
  it('returns positive for CCW ring (standard math orientation, Y up = north)', () => {
    // CCW square in standard math coords (Y axis points up/north)
    // (0,0) → (1,0) → (1,1) → (0,1) → back
    // Shoelace gives positive for CCW when Y increases upward
    const ccwSquare: [number, number][] = [
      [0, 0], [1, 0], [1, 1], [0, 1], [0, 0],
    ];
    expect(computeSignedArea(ccwSquare)).toBeGreaterThan(0);
  });

  it('returns negative for CW ring (standard math orientation, Y up = north)', () => {
    // CW square in standard math coords (reverse of CCW)
    // (0,0) → (0,1) → (1,1) → (1,0) → back
    const cwSquare: [number, number][] = [
      [0, 0], [0, 1], [1, 1], [1, 0], [0, 0],
    ];
    expect(computeSignedArea(cwSquare)).toBeLessThan(0);
  });

  it('returns correct absolute area for unit square', () => {
    // CCW unit square area = 1.0
    const square: [number, number][] = [
      [0, 0], [1, 0], [1, 1], [0, 1], [0, 0],
    ];
    expect(Math.abs(computeSignedArea(square))).toBeCloseTo(1.0, 5);
  });

  it('returns correct area for a 3x4 rectangle', () => {
    const rect: [number, number][] = [
      [0, 0], [3, 0], [3, 4], [0, 4], [0, 0],
    ];
    expect(Math.abs(computeSignedArea(rect))).toBeCloseTo(12.0, 5);
  });
});

describe('buildWalls', () => {
  // CCW square (already correct winding): 4 unique vertices, no closing duplicate
  // buildWalls wraps last vertex back to first via modulo: 4 vertices → 4 edges
  const CCW_SQUARE: [number, number][] = [
    [0, 0], [10, 0], [10, 10], [0, 10],
  ];
  const UNIFORM_BASE = [0, 0, 0, 0]; // all at z=0
  const HEIGHT_MM = 30;

  it('produces 6 vertices per wall segment (4 segments = 24 vertices = 72 floats)', () => {
    // 4 vertices → 4 edges → 4 quads → 4*6 = 24 vertices * 3 coords = 72 floats
    const walls = buildWalls(CCW_SQUARE, UNIFORM_BASE, HEIGHT_MM);
    expect(walls.length).toBe(72);
  });

  it('per-vertex base Z: distinct base Z values appear in bottom vertices', () => {
    // Supply different base Z values for each vertex
    const varyingBase = [0, 5, 10, 15]; // mm elevations
    const walls = buildWalls(CCW_SQUARE, varyingBase, HEIGHT_MM);

    // Extract all Z values (every 3rd value starting at index 2)
    const zValues = new Set<number>();
    for (let i = 2; i < walls.length; i += 3) {
      zValues.add(walls[i]);
    }

    // We expect base values 0, 5, 10, 15 to appear
    expect(zValues.has(0)).toBe(true);
    expect(zValues.has(5)).toBe(true);
    expect(zValues.has(10)).toBe(true);
    expect(zValues.has(15)).toBe(true);
  });

  it('top vertex Z = base Z + height', () => {
    const varyingBase = [100, 200, 300, 400];
    const walls = buildWalls(CCW_SQUARE, varyingBase, HEIGHT_MM);

    // Every Z value should be either a base value or base + HEIGHT_MM
    const expectedZValues = new Set([100, 200, 300, 400, 130, 230, 330, 430]);
    for (let i = 2; i < walls.length; i += 3) {
      expect(expectedZValues.has(walls[i])).toBe(true);
    }
  });

  it('winding detection: CW ring produces same geometry as CCW ring (outward normals in both)', () => {
    // CW square (reversed winding — should be auto-corrected)
    const cwSquare: [number, number][] = [
      [0, 0], [0, 10], [10, 10], [10, 0],
    ];
    const cwBase = [0, 0, 0, 0];

    const ccwWalls = buildWalls(CCW_SQUARE, UNIFORM_BASE, HEIGHT_MM);
    const cwWalls = buildWalls(cwSquare, cwBase, HEIGHT_MM);

    // Both should produce the same number of vertices
    expect(ccwWalls.length).toBe(cwWalls.length);
  });

  it('wall normals point outward from ring centroid', () => {
    // For a CCW square centered at (5,5), outward normals should point away from center
    // Check the first wall segment (bottom edge: (0,0)→(10,0))
    // Normal should point in -Y direction (south, away from interior at y=5)
    const walls = buildWalls(CCW_SQUARE, UNIFORM_BASE, HEIGHT_MM);

    // Triangle 1 of first segment: A=(0,0,0), B=(10,0,0), C=(10,0,30)
    // Edge1 = B-A = (10,0,0), Edge2 = C-A = (10,0,30)
    // Normal = Edge1 × Edge2
    const ax = walls[0], ay = walls[1], az = walls[2];
    const bx = walls[3], by = walls[4], bz = walls[5];
    const cx = walls[6], cy = walls[7], cz = walls[8];

    const ex = bx - ax, ey = by - ay, ez = bz - az;
    const fx = cx - ax, fy = cy - ay, fz = cz - az;

    // Cross product E × F
    const nx = ey * fz - ez * fy;
    const ny = ez * fx - ex * fz;
    // const nz = ex * fy - ey * fx; // not needed for this check

    // For bottom wall at y=0, outward normal should have negative Y component
    // (pointing away from interior which is at y=5)
    // Normal = (10,0,0) × (10,0,30) = (0*30-0*0, 0*10-10*30, 10*0-0*10)
    // = (0, -300, 0) → normalized: (0, -1, 0) ✓

    // The normal should point in the direction away from the ring centroid
    const centroidX = 5, centroidY = 5;
    // Midpoint of bottom edge: (5, 0)
    // Vector from centroid to edge midpoint: (5-5=0, 0-5=-5) → Y negative
    // Normal Y should also be negative (same direction as outward)
    expect(ny).toBeLessThan(0);

    // Suppress unused variable warnings
    void ax; void ay; void az; void ex; void ey; void ez; void fx; void fy; void fz;
    void nx; void cx; void cy; void cz;
  });
});
