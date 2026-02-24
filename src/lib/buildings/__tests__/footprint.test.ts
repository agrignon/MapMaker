/**
 * Tests for building footprint triangulation.
 * Verifies earcut triangulation for simple, complex, and hole-containing polygons.
 */

import { describe, it, expect } from 'vitest';
import { triangulateFootprint } from '../footprint';

describe('triangulateFootprint', () => {
  it('triangulates a simple square into 2 triangles (6 indices)', () => {
    // CCW square: (0,0), (1,0), (1,1), (0,1)
    const square: [number, number][] = [
      [0, 0], [1, 0], [1, 1], [0, 1],
    ];
    const { indices } = triangulateFootprint(square);
    expect(indices.length).toBe(6); // 2 triangles * 3 indices
  });

  it('all returned indices are within bounds of flatVertices', () => {
    const square: [number, number][] = [
      [0, 0], [1, 0], [1, 1], [0, 1],
    ];
    const { flatVertices, indices } = triangulateFootprint(square);
    const vertexCount = flatVertices.length / 2;
    for (const idx of indices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(vertexCount);
    }
  });

  it('triangulates an L-shaped polygon into correct number of triangles', () => {
    // L-shape: 6 vertices → 4 triangles (12 indices) for a convex decomposition
    // Actual earcut may produce different count depending on exact polygon
    const lShape: [number, number][] = [
      [0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2],
    ];
    const { indices } = triangulateFootprint(lShape);
    // n vertices → n-2 triangles for a simple polygon
    expect(indices.length).toBe((lShape.length - 2) * 3);
  });

  it('triangulates a square with a hole (courtyard) into correct number of triangles', () => {
    // Outer: 4x4 square, Hole: 2x2 square in the middle
    const outer: [number, number][] = [
      [0, 0], [4, 0], [4, 4], [0, 4],
    ];
    const hole: [number, number][] = [
      [1, 1], [1, 3], [3, 3], [3, 1],
    ];
    const { indices } = triangulateFootprint(outer, [hole]);
    // 4+4=8 vertices total, with 1 hole → 8 triangles (24 indices) for a simple annular polygon
    // General formula for polygon with holes: n + 2*h - 2 triangles where h = hole vertex count
    // For 4 outer + 4 hole: 4 + 4 + 2 - 2 = 8 triangles = 24 indices
    expect(indices.length).toBe(24);
  });

  it('all indices within bounds for polygon with hole', () => {
    const outer: [number, number][] = [
      [0, 0], [4, 0], [4, 4], [0, 4],
    ];
    const hole: [number, number][] = [
      [1, 1], [1, 3], [3, 3], [3, 1],
    ];
    const { flatVertices, indices } = triangulateFootprint(outer, [hole]);
    const vertexCount = flatVertices.length / 2;
    for (const idx of indices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(vertexCount);
    }
  });

  it('returns empty indices for degenerate polygon (too few vertices)', () => {
    // A line (2 vertices) cannot form triangles
    const line: [number, number][] = [[0, 0], [1, 0]];
    const { indices } = triangulateFootprint(line);
    expect(indices.length).toBe(0);
  });

  it('flatVertices has correct length (2 * vertex count)', () => {
    const pentagon: [number, number][] = [
      [0, 0], [1, 0], [1.5, 1], [0.5, 1.5], [-0.5, 1],
    ];
    const { flatVertices } = triangulateFootprint(pentagon);
    expect(flatVertices.length).toBe(pentagon.length * 2);
  });

  it('flatVertices includes hole vertices', () => {
    const outer: [number, number][] = [[0, 0], [4, 0], [4, 4], [0, 4]];
    const hole: [number, number][] = [[1, 1], [1, 3], [3, 3], [3, 1]];
    const { flatVertices } = triangulateFootprint(outer, [hole]);
    expect(flatVertices.length).toBe((outer.length + hole.length) * 2);
  });
});
