/**
 * Clip BufferGeometry to an axis-aligned XY bounding box.
 *
 * Uses the Sutherland-Hodgman polygon clipping algorithm against 4 half-planes.
 * Triangles fully inside the box are kept as-is. Triangles crossing a boundary
 * are split at the clip edge with Z interpolated. Triangles fully outside are
 * discarded.
 *
 * Used by the export pipeline to slice buildings and roads cleanly at the
 * terrain footprint boundary.
 */

import * as THREE from 'three';

type Vec3 = [number, number, number];

/**
 * Clip a polygon (array of 3D vertices) against a single axis-aligned half-plane.
 *
 * The half-plane is defined as: nx*x + ny*y + d >= 0 (inside).
 * Vertices on the plane boundary (dist === 0) are treated as inside.
 */
function clipPolygonByPlane(
  polygon: Vec3[],
  nx: number,
  ny: number,
  d: number
): Vec3[] {
  const output: Vec3[] = [];
  const n = polygon.length;
  if (n === 0) return output;

  for (let i = 0; i < n; i++) {
    const current = polygon[i];
    const next = polygon[(i + 1) % n];

    const currentDist = nx * current[0] + ny * current[1] + d;
    const nextDist = nx * next[0] + ny * next[1] + d;

    const currentInside = currentDist >= 0;
    const nextInside = nextDist >= 0;

    if (currentInside) {
      output.push(current);
      if (!nextInside) {
        // Edge exits — compute intersection
        const t = currentDist / (currentDist - nextDist);
        output.push([
          current[0] + t * (next[0] - current[0]),
          current[1] + t * (next[1] - current[1]),
          current[2] + t * (next[2] - current[2]),
        ]);
      }
    } else if (nextInside) {
      // Edge enters — compute intersection
      const t = currentDist / (currentDist - nextDist);
      output.push([
        current[0] + t * (next[0] - current[0]),
        current[1] + t * (next[1] - current[1]),
        current[2] + t * (next[2] - current[2]),
      ]);
    }
  }

  return output;
}

/**
 * Test if a vertex is inside ALL 4 clip planes.
 */
function isInsideBox(x: number, y: number, halfW: number, halfD: number): boolean {
  return x >= -halfW && x <= halfW && y >= -halfD && y <= halfD;
}

/**
 * Clip a BufferGeometry to the XY footprint defined by ±halfWidth and ±halfDepth.
 *
 * Triangles fully inside the box are copied as-is (fast path).
 * Triangles crossing the boundary are split via Sutherland-Hodgman.
 * Triangles fully outside are discarded.
 *
 * @param geometry - Input BufferGeometry (indexed or non-indexed)
 * @param halfWidth - Half the model width in mm (clip at ±halfWidth on X axis)
 * @param halfDepth - Half the model depth in mm (clip at ±halfDepth on Y axis)
 * @returns New non-indexed BufferGeometry clipped to the footprint
 */
export function clipGeometryToFootprint(
  geometry: THREE.BufferGeometry,
  halfWidth: number,
  halfDepth: number
): THREE.BufferGeometry {
  // Work with non-indexed geometry for triangle-by-triangle processing
  const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry;
  const positions = nonIndexed.getAttribute('position') as THREE.BufferAttribute;
  const triangleCount = positions.count / 3;

  // Define clip planes: nx*x + ny*y + d >= 0 is inside
  const planes: [number, number, number][] = [
    [1, 0, halfWidth],    // x >= -halfWidth  (left boundary)
    [-1, 0, halfWidth],   // -x >= -halfWidth → x <= halfWidth  (right boundary)
    [0, 1, halfDepth],    // y >= -halfDepth  (south boundary)
    [0, -1, halfDepth],   // -y >= -halfDepth → y <= halfDepth  (north boundary)
  ];

  const clippedPositions: number[] = [];

  for (let t = 0; t < triangleCount; t++) {
    const base = t * 3;

    const x0 = positions.getX(base);
    const y0 = positions.getY(base);
    const z0 = positions.getZ(base);
    const x1 = positions.getX(base + 1);
    const y1 = positions.getY(base + 1);
    const z1 = positions.getZ(base + 1);
    const x2 = positions.getX(base + 2);
    const y2 = positions.getY(base + 2);
    const z2 = positions.getZ(base + 2);

    // Fast path: all vertices inside → keep triangle as-is
    if (
      isInsideBox(x0, y0, halfWidth, halfDepth) &&
      isInsideBox(x1, y1, halfWidth, halfDepth) &&
      isInsideBox(x2, y2, halfWidth, halfDepth)
    ) {
      clippedPositions.push(x0, y0, z0, x1, y1, z1, x2, y2, z2);
      continue;
    }

    // Slow path: clip triangle against all 4 planes
    let polygon: Vec3[] = [[x0, y0, z0], [x1, y1, z1], [x2, y2, z2]];

    for (const [nx, ny, d] of planes) {
      if (polygon.length === 0) break;
      polygon = clipPolygonByPlane(polygon, nx, ny, d);
    }

    // Fan-triangulate the clipped polygon
    for (let i = 1; i < polygon.length - 1; i++) {
      clippedPositions.push(
        polygon[0][0], polygon[0][1], polygon[0][2],
        polygon[i][0], polygon[i][1], polygon[i][2],
        polygon[i + 1][0], polygon[i + 1][1], polygon[i + 1][2],
      );
    }
  }

  // Clean up if we created a non-indexed copy
  if (nonIndexed !== geometry) {
    nonIndexed.dispose();
  }

  const result = new THREE.BufferGeometry();
  result.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(clippedPositions), 3)
  );
  result.computeVertexNormals();
  return result;
}
