/**
 * Building footprint triangulation using earcut.
 *
 * Converts polygon rings (outer + holes) into triangle indices
 * for use in building floor caps and roof geometry.
 */

import earcut from 'earcut';

/**
 * Triangulate a building footprint polygon using earcut.
 *
 * @param outer - Outer ring as [x, y] pairs (2D projected coordinates)
 * @param holes - Optional hole rings as [x, y] pairs (e.g., courtyards)
 * @returns Object with flat vertex array and triangle index array
 *   - flatVertices: [x0, y0, x1, y1, ...] (2D coordinates)
 *   - indices: Triangle index triples into flatVertices (3 indices per triangle)
 */
export function triangulateFootprint(
  outer: [number, number][],
  holes: [number, number][][] = []
): { flatVertices: number[]; indices: number[] } {
  // Flatten outer ring: [x0, y0, x1, y1, ...]
  const flatVertices: number[] = [];
  for (const [x, y] of outer) {
    flatVertices.push(x, y);
  }

  // Record hole start indices (in vertex index space, not flatVertices index)
  const holeIndices: number[] = [];
  for (const hole of holes) {
    holeIndices.push(flatVertices.length / 2);
    for (const [x, y] of hole) {
      flatVertices.push(x, y);
    }
  }

  // Run earcut triangulation (2D, stride=2)
  const indices = earcut(
    flatVertices,
    holeIndices.length > 0 ? holeIndices : undefined,
    2
  );

  return { flatVertices, indices };
}
