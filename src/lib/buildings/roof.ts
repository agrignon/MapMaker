/**
 * Building roof cap geometry.
 *
 * Provides flat roof cap and floor cap construction.
 * Both use earcut triangulation of the footprint and assign per-vertex Z values.
 *
 * For Plan 02, only flat roofs are supported. Gabled/hipped/pyramidal roofs
 * will be added in the next plan.
 */

import { triangulateFootprint } from './footprint';

/**
 * Build a flat roof cap (top face of building).
 *
 * @param topRingXY - Outer ring in local mm space [x, y]
 * @param topZmm - Per-vertex top Z in mm (baseZmm[i] + heightMM)
 * @param holes - Hole rings in local mm space (e.g., courtyards)
 * @returns Float32Array of positions for roof cap triangles
 */
export function buildFlatRoof(
  topRingXY: [number, number][],
  topZmm: number[],
  holes: [number, number][][] = []
): Float32Array {
  const { flatVertices, indices } = triangulateFootprint(topRingXY, holes);
  const triangleCount = indices.length / 3;
  const positions = new Float32Array(triangleCount * 3 * 3); // 3 vertices * 3 coords per triangle

  let offset = 0;
  for (let t = 0; t < triangleCount; t++) {
    for (let v = 0; v < 3; v++) {
      const vi = indices[t * 3 + v];
      const x = flatVertices[vi * 2];
      const y = flatVertices[vi * 2 + 1];
      const z = topZmm[vi];
      positions[offset++] = x;
      positions[offset++] = y;
      positions[offset++] = z;
    }
  }

  return positions;
}

/**
 * Build a floor cap (bottom face of building).
 *
 * Uses reversed triangle winding relative to the roof cap so normals
 * point downward (away from the building interior).
 *
 * @param ringXY - Outer ring in local mm space [x, y]
 * @param baseZmm - Per-vertex base Z in mm (terrain elevation at each vertex)
 * @param holes - Hole rings in local mm space (e.g., courtyards)
 * @returns Float32Array of positions for floor cap triangles (reversed winding)
 */
export function buildFloorCap(
  ringXY: [number, number][],
  baseZmm: number[],
  holes: [number, number][][] = []
): Float32Array {
  const { flatVertices, indices } = triangulateFootprint(ringXY, holes);
  const triangleCount = indices.length / 3;
  const positions = new Float32Array(triangleCount * 3 * 3);

  let offset = 0;
  for (let t = 0; t < triangleCount; t++) {
    // Reverse winding: output vertices in order [2, 1, 0] instead of [0, 1, 2]
    for (let v = 2; v >= 0; v--) {
      const vi = indices[t * 3 + v];
      const x = flatVertices[vi * 2];
      const y = flatVertices[vi * 2 + 1];
      const z = baseZmm[vi];
      positions[offset++] = x;
      positions[offset++] = y;
      positions[offset++] = z;
    }
  }

  return positions;
}
