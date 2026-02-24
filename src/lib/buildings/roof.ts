/**
 * Building roof geometry builders.
 *
 * Provides flat, gabled, hipped, and pyramidal roof cap construction.
 * All builders return Float32Array of triangle positions (3 floats per vertex, 3 vertices per triangle).
 * All triangles use CCW winding (from outside the building).
 */

import { triangulateFootprint } from './footprint';
import { computeOBB } from './obb';

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

/**
 * Build a gabled roof.
 *
 * A gabled roof has a ridgeline running along the long axis of the building OBB.
 * The footprint vertices are divided into "left" and "right" of the ridge
 * and sloped planes connect wall top to ridge apex.
 *
 * @param topRingXY - Outer ring in local mm space [x, y]
 * @param topZmm - Per-vertex top Z in mm (top of walls)
 * @param _holes - Ignored for non-flat roofs (gabled roofs cap over entire footprint)
 * @param roofHeightMM - Height of the roof ridge above the wall top
 * @returns Float32Array of positions for gabled roof triangles
 */
export function buildGabledRoof(
  topRingXY: [number, number][],
  topZmm: number[],
  _holes: [number, number][][] = [],
  roofHeightMM: number
): Float32Array {
  const obb = computeOBB(topRingXY);
  const { center, halfExtents, axes } = obb;

  const wallTopZ = Math.max(...topZmm);
  const ridgeZ = wallTopZ + roofHeightMM;

  // Ridge endpoints: along long axis (axes[0]) from center
  const ridge0: [number, number, number] = [
    center[0] + halfExtents[0] * axes[0][0],
    center[1] + halfExtents[0] * axes[0][1],
    ridgeZ,
  ];
  const ridge1: [number, number, number] = [
    center[0] - halfExtents[0] * axes[0][0],
    center[1] - halfExtents[0] * axes[0][1],
    ridgeZ,
  ];

  const n = topRingXY.length;
  const triangles: number[] = [];

  // Project vertices onto short axis to assign left/right side
  // dot(v - center, shortAxis) determines which side of the ridge a vertex is on
  const shortAxis = axes[1];

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;

    const pi = topRingXY[i];
    const pj = topRingXY[j];
    const zi = topZmm[i];
    const zj = topZmm[j];

    // Project onto short axis (signed: left vs right of ridge)
    const dotI = (pi[0] - center[0]) * shortAxis[0] + (pi[1] - center[1]) * shortAxis[1];
    const dotJ = (pj[0] - center[0]) * shortAxis[0] + (pj[1] - center[1]) * shortAxis[1];

    if (dotI >= 0 && dotJ >= 0) {
      // Both on positive (right) side — connect edge to ridge line
      // Two triangles: quad from edge to ridge
      triangles.push(
        pi[0], pi[1], zi,
        ridge0[0], ridge0[1], ridgeZ,
        pj[0], pj[1], zj,
      );
      triangles.push(
        pj[0], pj[1], zj,
        ridge0[0], ridge0[1], ridgeZ,
        ridge1[0], ridge1[1], ridgeZ,
      );
    } else if (dotI <= 0 && dotJ <= 0) {
      // Both on negative (left) side — connect edge to ridge line (reversed winding for left side)
      triangles.push(
        pj[0], pj[1], zj,
        ridge0[0], ridge0[1], ridgeZ,
        pi[0], pi[1], zi,
      );
      triangles.push(
        ridge1[0], ridge1[1], ridgeZ,
        ridge0[0], ridge0[1], ridgeZ,
        pj[0], pj[1], zj,
      );
    } else {
      // Straddles the ridge — project intersection, create two triangles
      // The intersection with the ridge midplane (dot = 0)
      const t = dotI / (dotI - dotJ);
      const midX = pi[0] + t * (pj[0] - pi[0]);
      const midY = pi[1] + t * (pj[1] - pi[1]);
      const midZ = zi + t * (zj - zi);

      // Project midpoint onto long axis to find nearest ridge endpoint
      const longAxis = axes[0];
      const dotLong = (midX - center[0]) * longAxis[0] + (midY - center[1]) * longAxis[1];
      const clampedLong = Math.max(-halfExtents[0], Math.min(halfExtents[0], dotLong));
      const ridgeMidX = center[0] + clampedLong * longAxis[0];
      const ridgeMidY = center[1] + clampedLong * longAxis[1];

      if (dotI > 0) {
        // pi is on positive side, pj on negative
        triangles.push(
          pi[0], pi[1], zi,
          ridgeMidX, ridgeMidY, ridgeZ,
          midX, midY, midZ,
        );
        triangles.push(
          midX, midY, midZ,
          ridgeMidX, ridgeMidY, ridgeZ,
          pj[0], pj[1], zj,
        );
      } else {
        // pi is on negative side, pj on positive
        triangles.push(
          midX, midY, midZ,
          ridgeMidX, ridgeMidY, ridgeZ,
          pi[0], pi[1], zi,
        );
        triangles.push(
          pj[0], pj[1], zj,
          ridgeMidX, ridgeMidY, ridgeZ,
          midX, midY, midZ,
        );
      }
    }
  }

  return new Float32Array(triangles);
}

/**
 * Build a hipped roof.
 *
 * A hipped roof has a shortened ridgeline (inset from the ends) with four sloped faces:
 * two long-side trapezoids and two short-side triangles.
 * Falls back to pyramidal if the building is nearly square.
 *
 * @param topRingXY - Outer ring in local mm space [x, y]
 * @param topZmm - Per-vertex top Z in mm (top of walls)
 * @param holes - Hole rings (ignored for non-flat roofs)
 * @param roofHeightMM - Height of the roof ridge above the wall top
 * @returns Float32Array of positions for hipped roof triangles
 */
export function buildHippedRoof(
  topRingXY: [number, number][],
  topZmm: number[],
  holes: [number, number][][] = [],
  roofHeightMM: number
): Float32Array {
  const obb = computeOBB(topRingXY);
  const { center, halfExtents, axes } = obb;

  const ridgeLongHalfLen = halfExtents[0] - halfExtents[1];

  // If nearly square, fall back to pyramidal
  if (ridgeLongHalfLen <= 0) {
    return buildPyramidalRoof(topRingXY, topZmm, roofHeightMM);
  }

  const wallTopZ = Math.max(...topZmm);
  const ridgeZ = wallTopZ + roofHeightMM;

  // Ridge endpoints: inset by shortAxis halfExtent from each end
  const ridge0: [number, number, number] = [
    center[0] + ridgeLongHalfLen * axes[0][0],
    center[1] + ridgeLongHalfLen * axes[0][1],
    ridgeZ,
  ];
  const ridge1: [number, number, number] = [
    center[0] - ridgeLongHalfLen * axes[0][0],
    center[1] - ridgeLongHalfLen * axes[0][1],
    ridgeZ,
  ];

  const n = topRingXY.length;
  const triangles: number[] = [];
  const shortAxis = axes[1];
  const longAxis = axes[0];

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;

    const pi = topRingXY[i];
    const pj = topRingXY[j];
    const zi = topZmm[i];
    const zj = topZmm[j];

    // Classify vertices: short side vs long side using long-axis dot product
    const dotLongI = (pi[0] - center[0]) * longAxis[0] + (pi[1] - center[1]) * longAxis[1];
    const dotLongJ = (pj[0] - center[0]) * longAxis[0] + (pj[1] - center[1]) * longAxis[1];
    const dotShortI = (pi[0] - center[0]) * shortAxis[0] + (pi[1] - center[1]) * shortAxis[1];
    const dotShortJ = (pj[0] - center[0]) * shortAxis[0] + (pj[1] - center[1]) * shortAxis[1];

    const isEndI = Math.abs(dotLongI) > ridgeLongHalfLen;
    const isEndJ = Math.abs(dotLongJ) > ridgeLongHalfLen;

    if (isEndI || isEndJ) {
      // Short-side triangle: connect to nearest ridge endpoint
      const ridgeEnd = dotLongI + dotLongJ > 0 ? ridge0 : ridge1;

      // Simple fan from ridge endpoint to edge
      triangles.push(
        pi[0], pi[1], zi,
        ridgeEnd[0], ridgeEnd[1], ridgeZ,
        pj[0], pj[1], zj,
      );
    } else {
      // Long-side trapezoid: connect to the ridge segment
      if (dotShortI >= 0 && dotShortJ >= 0) {
        // Positive (right) long side
        triangles.push(
          pi[0], pi[1], zi,
          ridge0[0], ridge0[1], ridgeZ,
          pj[0], pj[1], zj,
        );
        triangles.push(
          pj[0], pj[1], zj,
          ridge0[0], ridge0[1], ridgeZ,
          ridge1[0], ridge1[1], ridgeZ,
        );
      } else if (dotShortI <= 0 && dotShortJ <= 0) {
        // Negative (left) long side
        triangles.push(
          pj[0], pj[1], zj,
          ridge0[0], ridge0[1], ridgeZ,
          pi[0], pi[1], zi,
        );
        triangles.push(
          ridge1[0], ridge1[1], ridgeZ,
          ridge0[0], ridge0[1], ridgeZ,
          pj[0], pj[1], zj,
        );
      } else {
        // Edge crosses the short-axis midline — split at midplane and handle each half
        const tSplit = dotShortI / (dotShortI - dotShortJ);
        const midX = pi[0] + tSplit * (pj[0] - pi[0]);
        const midY = pi[1] + tSplit * (pj[1] - pi[1]);
        const midZ = zi + tSplit * (zj - zi);

        if (dotShortI >= 0) {
          // pi on positive side
          triangles.push(
            pi[0], pi[1], zi,
            ridge0[0], ridge0[1], ridgeZ,
            midX, midY, midZ,
          );
          triangles.push(
            midX, midY, midZ,
            ridge0[0], ridge0[1], ridgeZ,
            pj[0], pj[1], zj,
          );
        } else {
          // pi on negative side
          triangles.push(
            midX, midY, midZ,
            ridge0[0], ridge0[1], ridgeZ,
            pi[0], pi[1], zi,
          );
          triangles.push(
            pj[0], pj[1], zj,
            ridge0[0], ridge0[1], ridgeZ,
            midX, midY, midZ,
          );
        }
      }
    }
  }

  void holes; // holes are not used for hipped roofs
  return new Float32Array(triangles);
}

/**
 * Build a pyramidal roof.
 *
 * All perimeter edges connect to a single apex at the centroid.
 *
 * @param topRingXY - Outer ring in local mm space [x, y]
 * @param topZmm - Per-vertex top Z in mm (top of walls)
 * @param roofHeightMM - Height of the apex above the wall top
 * @returns Float32Array of positions for pyramidal roof triangles
 */
export function buildPyramidalRoof(
  topRingXY: [number, number][],
  topZmm: number[],
  roofHeightMM: number
): Float32Array {
  const n = topRingXY.length;

  // Compute centroid of footprint
  let cx = 0;
  let cy = 0;
  for (const [x, y] of topRingXY) {
    cx += x;
    cy += y;
  }
  cx /= n;
  cy /= n;

  const wallTopZ = Math.max(...topZmm);
  const apexZ = wallTopZ + roofHeightMM;
  const apex: [number, number, number] = [cx, cy, apexZ];

  const triangles: number[] = [];

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const pi = topRingXY[i];
    const pj = topRingXY[j];
    const zi = topZmm[i];
    const zj = topZmm[j];

    // CCW triangle: pi, apex, pj (winding for outward normals)
    triangles.push(
      pi[0], pi[1], zi,
      apex[0], apex[1], apexZ,
      pj[0], pj[1], zj,
    );
  }

  return new Float32Array(triangles);
}

/**
 * Dispatch to the correct roof builder based on the OSM roof:shape tag.
 *
 * Known shapes: 'flat', 'gabled', 'hipped', 'pyramidal'
 * Unknown shapes fall back to flat.
 *
 * @param shape - OSM roof:shape value
 * @param topRingXY - Outer ring in local mm space
 * @param topZmm - Per-vertex wall top Z in mm
 * @param holes - Hole rings (used only by flat roof)
 * @param roofHeightMM - Height of roof above wall top
 * @returns Float32Array of roof triangle positions
 */
export function buildRoofForShape(
  shape: string,
  topRingXY: [number, number][],
  topZmm: number[],
  holes: [number, number][][] = [],
  roofHeightMM: number = 0
): Float32Array {
  switch (shape) {
    case 'gabled':
      return buildGabledRoof(topRingXY, topZmm, holes, roofHeightMM);
    case 'hipped':
      return buildHippedRoof(topRingXY, topZmm, holes, roofHeightMM);
    case 'pyramidal':
      return buildPyramidalRoof(topRingXY, topZmm, roofHeightMM);
    case 'flat':
    default:
      return buildFlatRoof(topRingXY, topZmm, holes);
  }
}
