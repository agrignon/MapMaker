import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildSolidMesh } from '../solid';

/**
 * Build a simple terrain surface geometry for testing.
 * Creates a 3x3 grid (4 vertices wide, 4 vertices deep = 16 vertices)
 * with known positions and varying Z values.
 */
function buildTestTerrainGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const gridSize = 4; // 4x4 vertices = 3x3 cells
  const widthMM = 100;
  const depthMM = 100;

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const x = (col / (gridSize - 1)) * widthMM - widthMM / 2;
      const y = (row / (gridSize - 1)) * depthMM - depthMM / 2;
      // Varying Z: hill shape
      const z = 10 * Math.sin((col / (gridSize - 1)) * Math.PI) * Math.sin((row / (gridSize - 1)) * Math.PI);
      positions.push(x, y, z);
    }
  }

  // Build triangle indices (two triangles per cell)
  for (let row = 0; row < gridSize - 1; row++) {
    for (let col = 0; col < gridSize - 1; col++) {
      const tl = row * gridSize + col;
      const tr = tl + 1;
      const bl = (row + 1) * gridSize + col;
      const br = bl + 1;

      indices.push(tl, bl, tr);
      indices.push(tr, bl, br);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Count boundary edges in a non-indexed triangle soup.
 * A boundary edge is shared by != 2 triangles.
 */
function countBoundaryEdges(positions: Float32Array): { boundary: number; total: number } {
  const triangleCount = positions.length / 9;
  const edgeMap = new Map<string, number>();

  for (let t = 0; t < triangleCount; t++) {
    const base = t * 9;
    const v: string[] = [];
    for (let i = 0; i < 3; i++) {
      const b = base + i * 3;
      v.push(`${positions[b].toFixed(4)},${positions[b + 1].toFixed(4)},${positions[b + 2].toFixed(4)}`);
    }
    for (let i = 0; i < 3; i++) {
      const a = v[i], b = v[(i + 1) % 3];
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      edgeMap.set(key, (edgeMap.get(key) ?? 0) + 1);
    }
  }

  let boundary = 0;
  for (const [, count] of edgeMap) {
    if (count !== 2) boundary++;
  }

  return { boundary, total: edgeMap.size };
}

describe('buildSolidMesh', () => {
  it('produces a watertight mesh with no boundary edges', () => {
    const terrain = buildTestTerrainGeometry();
    const solid = buildSolidMesh(terrain, 3);

    // Convert to non-indexed for edge analysis
    const nonIndexed = solid.index ? solid.toNonIndexed() : solid;
    const positions = (nonIndexed.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;

    const { boundary, total } = countBoundaryEdges(positions);

    // A watertight mesh should have 0 boundary edges
    // Allow a small tolerance (< 1% of total edges) for float rounding
    const ratio = boundary / total;
    expect(ratio).toBeLessThan(0.01);
  });

  it('has more triangles than the terrain surface alone', () => {
    const terrain = buildTestTerrainGeometry();
    const solid = buildSolidMesh(terrain, 3);

    const nonIndexed = solid.index ? solid.toNonIndexed() : solid;
    const solidTriCount = (nonIndexed.getAttribute('position') as THREE.BufferAttribute).count / 3;

    const terrainNI = terrain.toNonIndexed();
    const terrainTriCount = (terrainNI.getAttribute('position') as THREE.BufferAttribute).count / 3;

    // Solid has terrain + base plate (2 triangles) + walls
    expect(solidTriCount).toBeGreaterThan(terrainTriCount + 2);
  });

  it('includes base plate at negative Z', () => {
    const terrain = buildTestTerrainGeometry();
    const basePlate = 5;
    const solid = buildSolidMesh(terrain, basePlate);

    solid.computeBoundingBox();
    const bbox = solid.boundingBox!;

    // Base plate should be at -basePlateThicknessMM
    expect(bbox.min.z).toBeCloseTo(-basePlate, 1);
  });
});
