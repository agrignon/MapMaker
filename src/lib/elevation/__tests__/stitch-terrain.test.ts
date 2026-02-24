/**
 * Regression test for multi-tile terrain spatial arrangement.
 *
 * Root cause: Y-axis inversion in buildTerrainGeometry. The elevation array
 * has row 0 = northernmost data (north = low tile Y = low array index).
 * The buggy code maps vy=0 to y=-depthMM/2 (SOUTH), placing northern elevation
 * data at the southern mesh position — producing the "4 rotated quadrants" effect.
 *
 * This test MUST FAIL before the fix in terrain.ts is applied (RED phase).
 * After the fix (GREEN phase), NW corner must have the highest Z.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildTerrainGeometry, updateTerrainElevation } from '../../mesh/terrain';
import type { ElevationData } from '../../../types/geo';
import type { TerrainMeshParams } from '../../mesh/terrain';

// ---------------------------------------------------------------------------
// Helper: find vertex closest to (targetX, targetY) in a BufferGeometry
// ---------------------------------------------------------------------------
function findVertexNear(
  geometry: THREE.BufferGeometry,
  targetX: number,
  targetY: number
): { x: number; y: number; z: number } {
  const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
  const count = posAttr.count;

  let bestDist = Infinity;
  let best = { x: 0, y: 0, z: 0 };

  for (let i = 0; i < count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    const dist = (x - targetX) ** 2 + (y - targetY) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = { x, y, z };
    }
  }

  return best;
}

// ---------------------------------------------------------------------------
// Create synthetic elevation data with known spatial pattern.
//
// Array layout (row-major, north = row 0):
//   Row 0..half-1, Col 0..half-1   → NW quadrant: elevation ~100m
//   Row 0..half-1, Col half..end   → NE quadrant: elevation ~50m
//   Row half..end, Col 0..half-1   → SW quadrant: elevation ~25m
//   Row half..end, Col half..end   → SE quadrant: elevation ~10m
//
// Smooth linear gradients within each quadrant to avoid Martini artifacts.
// ---------------------------------------------------------------------------
function makeSyntheticElevation(gridSize: number): ElevationData {
  const elevations = new Float32Array(gridSize * gridSize);
  const half = Math.floor(gridSize / 2);

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const inNorth = row < half;
      const inWest = col < half;

      let elevation: number;

      if (inNorth && inWest) {
        // NW: ~100m, smooth gradient toward edges
        const fx = col / (half - 1);       // 0=west, 1=center
        const fy = row / (half - 1);       // 0=north, 1=center
        elevation = 100 - fx * 10 - fy * 10; // 100 → 80 at center
      } else if (inNorth && !inWest) {
        // NE: ~50m
        const fx = (col - half) / (gridSize - half - 1); // 0=center, 1=east
        const fy = row / (half - 1);
        elevation = 50 + fx * 5 - fy * 5;  // 50 → 50
      } else if (!inNorth && inWest) {
        // SW: ~25m
        const fx = col / (half - 1);
        const fy = (row - half) / (gridSize - half - 1);
        elevation = 25 - fx * 5 + fy * 5;  // 25 → 25
      } else {
        // SE: ~10m
        const fx = (col - half) / (gridSize - half - 1);
        const fy = (row - half) / (gridSize - half - 1);
        elevation = 10 + fx * 3 + fy * 3;  // 10 → 16
      }

      elevations[row * gridSize + col] = elevation;
    }
  }

  return {
    elevations,
    gridSize,
    minElevation: 10,
    maxElevation: 100,
  };
}

// ---------------------------------------------------------------------------
// Test parameters
// ---------------------------------------------------------------------------
const GRID_SIZE = 257; // Martini-compatible (2^8 + 1)
const PARAMS: TerrainMeshParams = {
  widthMM: 150,
  depthMM: 150,
  geographicWidthM: 1000,
  geographicDepthM: 1000,
  exaggeration: 1.5,
  minHeightMM: 5,
  maxError: 5,
};

// Corner positions in mesh space (Z-up, geographic north = positive Y)
const NW_X = -PARAMS.widthMM / 2; // left
const NW_Y = +PARAMS.depthMM / 2; // top (north)
const NE_X = +PARAMS.widthMM / 2; // right
const NE_Y = +PARAMS.depthMM / 2; // top (north)
const SW_X = -PARAMS.widthMM / 2; // left
const SW_Y = -PARAMS.depthMM / 2; // bottom (south)
const SE_X = +PARAMS.widthMM / 2; // right
const SE_Y = -PARAMS.depthMM / 2; // bottom (south)

describe('buildTerrainGeometry — multi-tile spatial arrangement', () => {
  const elevationData = makeSyntheticElevation(GRID_SIZE);
  const geometry = buildTerrainGeometry(elevationData, PARAMS);

  it('NW corner (top-left) has the highest Z because NW elevation = 100m', () => {
    const nw = findVertexNear(geometry, NW_X, NW_Y);
    const se = findVertexNear(geometry, SE_X, SE_Y);

    // NW must be higher than SE (the NW quadrant has 100m, SE has 10m)
    expect(nw.z).toBeGreaterThan(se.z);
  });

  it('SE corner (bottom-right) has the lowest Z because SE elevation = 10m', () => {
    const nw = findVertexNear(geometry, NW_X, NW_Y);
    const ne = findVertexNear(geometry, NE_X, NE_Y);
    const sw = findVertexNear(geometry, SW_X, SW_Y);
    const se = findVertexNear(geometry, SE_X, SE_Y);

    // SE (10m) must be below all other corners
    expect(se.z).toBeLessThan(nw.z);
    expect(se.z).toBeLessThan(ne.z);
    expect(se.z).toBeLessThan(sw.z);
  });

  it('NE corner Z is between NW (100m) and SE (10m)', () => {
    const nw = findVertexNear(geometry, NW_X, NW_Y);
    const ne = findVertexNear(geometry, NE_X, NE_Y);
    const se = findVertexNear(geometry, SE_X, SE_Y);

    // NE has 50m — lower than NW (100m) but higher than SE (10m)
    expect(ne.z).toBeLessThan(nw.z);
    expect(ne.z).toBeGreaterThan(se.z);
  });

  it('SW corner Z is between NW (100m) and SE (10m)', () => {
    const nw = findVertexNear(geometry, NW_X, NW_Y);
    const sw = findVertexNear(geometry, SW_X, SW_Y);
    const se = findVertexNear(geometry, SE_X, SE_Y);

    // SW has 25m — lower than NW (100m) but higher than SE (10m)
    expect(sw.z).toBeLessThan(nw.z);
    expect(sw.z).toBeGreaterThan(se.z);
  });
});

describe('updateTerrainElevation — spatial arrangement preserved after exaggeration change', () => {
  it('NW corner Z still greater than SE corner Z after exaggeration update', () => {
    const elevationData = makeSyntheticElevation(GRID_SIZE);

    // Build geometry with initial exaggeration
    const geometry = buildTerrainGeometry(elevationData, PARAMS);

    // Update to a different exaggeration
    const updatedParams: TerrainMeshParams = { ...PARAMS, exaggeration: 3.0 };
    updateTerrainElevation(geometry, elevationData, updatedParams);

    const nw = findVertexNear(geometry, NW_X, NW_Y);
    const se = findVertexNear(geometry, SE_X, SE_Y);

    // Spatial relationship must be preserved
    expect(nw.z).toBeGreaterThan(se.z);
  });

  it('Z values change after exaggeration update (higher exaggeration = more relief)', () => {
    const elevationData = makeSyntheticElevation(GRID_SIZE);

    // Build with initial exaggeration (1.5)
    const geometry = buildTerrainGeometry(elevationData, PARAMS);
    const nwBefore = findVertexNear(geometry, NW_X, NW_Y);

    // Update to 3x exaggeration
    const updatedParams: TerrainMeshParams = { ...PARAMS, exaggeration: 3.0 };
    updateTerrainElevation(geometry, elevationData, updatedParams);
    const nwAfter = findVertexNear(geometry, NW_X, NW_Y);

    // Higher exaggeration should produce higher Z for elevated terrain
    expect(nwAfter.z).toBeGreaterThan(nwBefore.z);
  });
});
