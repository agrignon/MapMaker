/**
 * Clip BufferGeometry to an axis-aligned XY bounding box.
 *
 * Uses the Sutherland-Hodgman polygon clipping algorithm against 4 half-planes.
 * Triangles fully inside the box are kept as-is. Triangles crossing a boundary
 * are split at the clip edge with Z interpolated. Triangles fully outside are
 * discarded.
 *
 * After clipping, boundary caps are generated to seal any open cross-sections
 * at the clip edges, keeping the mesh watertight for STL export.
 *
 * Used by the export pipeline to slice buildings and roads cleanly at the
 * terrain footprint boundary.
 */

import * as THREE from 'three';
import earcut from 'earcut';

type Vec3 = [number, number, number];

/** Tolerance for snapping interpolated vertices onto clip boundaries (mm). */
const SNAP_TOL = 0.001;

/** Rounding factor for vertex deduplication keys. */
const ROUND_FACTOR = 1e4;

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

/** Create a dedup key for a vertex position. */
function vkey(x: number, y: number, z: number): string {
  return `${Math.round(x * ROUND_FACTOR)},${Math.round(y * ROUND_FACTOR)},${Math.round(z * ROUND_FACTOR)}`;
}

/** Create a canonical (order-independent) edge key from two vertex keys. */
function ekey(a: string, b: string): string {
  return a < b ? a + '|' + b : b + '|' + a;
}

/**
 * Compute a perimeter parameter for a vertex on the clip boundary.
 *
 * Unfolds the 4-sided bounding box perimeter into a single scalar 'u' that
 * increases clockwise starting from (+halfW, -halfD). This allows contour
 * loops that span multiple boundaries (e.g. at corners) to be projected to
 * a continuous 2D (u, z) space for earcut triangulation.
 */
function perimeterU(
  x: number,
  y: number,
  halfW: number,
  halfD: number
): number {
  // Right boundary: x = +halfW, y from -halfD to +halfD
  if (Math.abs(x - halfW) < SNAP_TOL) {
    return halfD + y; // range [0, 2*halfD]
  }
  // Top boundary: y = +halfD, x from +halfW to -halfW
  if (Math.abs(y - halfD) < SNAP_TOL) {
    return 2 * halfD + (halfW - x); // range [2*halfD, 2*(halfD+halfW)]
  }
  // Left boundary: x = -halfW, y from +halfD to -halfD
  if (Math.abs(x + halfW) < SNAP_TOL) {
    return 2 * (halfD + halfW) + (halfD - y);
  }
  // Bottom boundary: y = -halfD, x from -halfW to +halfW
  if (Math.abs(y + halfD) < SNAP_TOL) {
    return 2 * (2 * halfD + halfW) + (x + halfW);
  }
  return 0;
}

/**
 * Generate cap faces at clip boundaries to seal open cross-sections.
 *
 * Scans the clipped triangle soup for boundary edges (both vertices on a clip
 * boundary) shared by exactly 1 triangle (open edges). Groups them into contour
 * loops — which may span multiple boundaries at corners — then triangulates each
 * with earcut using a perimeter-unfolding 2D projection, and orients normals
 * outward.
 *
 * Mutates `positions` in-place to snap near-boundary vertices to exact boundary
 * values (within SNAP_TOL).
 */
function generateBoundaryCaps(
  positions: number[],
  halfWidth: number,
  halfDepth: number
): number[] {
  const caps: number[] = [];

  const boundaryValues = [
    { axis: 0, value: -halfWidth },
    { axis: 0, value: halfWidth },
    { axis: 1, value: -halfDepth },
    { axis: 1, value: halfDepth },
  ];

  // Snap vertices near clip boundaries to exact boundary values
  const vCount = positions.length / 3;
  for (let i = 0; i < vCount; i++) {
    const base = i * 3;
    for (const b of boundaryValues) {
      if (Math.abs(positions[base + b.axis] - b.value) < SNAP_TOL) {
        positions[base + b.axis] = b.value;
      }
    }
  }

  /** Check if a coordinate pair lies on any clip boundary (exact after snap). */
  function isOnAnyBoundary(x: number, y: number): boolean {
    return (
      x === -halfWidth ||
      x === halfWidth ||
      y === -halfDepth ||
      y === halfDepth
    );
  }

  // Collect all boundary edges and count triangle sharing globally
  const edgeTriCount = new Map<string, number>();
  const edgeEndpoints = new Map<string, [string, string]>();
  const vertexCoords = new Map<string, [number, number, number]>();

  const triCount = positions.length / 9;

  for (let t = 0; t < triCount; t++) {
    const tBase = t * 9;
    const verts: [number, number, number][] = [];
    const keys: string[] = [];
    const onBoundary: boolean[] = [];

    for (let v = 0; v < 3; v++) {
      const x = positions[tBase + v * 3];
      const y = positions[tBase + v * 3 + 1];
      const z = positions[tBase + v * 3 + 2];
      verts.push([x, y, z]);
      const k = vkey(x, y, z);
      keys.push(k);
      vertexCoords.set(k, verts[v]);
      onBoundary.push(isOnAnyBoundary(x, y));
    }

    for (let e = 0; e < 3; e++) {
      const ai = e;
      const bi = (e + 1) % 3;

      // Both vertices must lie on a clip boundary
      if (onBoundary[ai] && onBoundary[bi]) {
        const ka = keys[ai];
        const kb = keys[bi];
        if (ka === kb) continue; // degenerate edge

        const ek = ekey(ka, kb);
        edgeTriCount.set(ek, (edgeTriCount.get(ek) || 0) + 1);
        if (!edgeEndpoints.has(ek)) {
          edgeEndpoints.set(ek, [ka, kb]);
        }
      }
    }
  }

  // Keep only open boundary edges (shared by exactly 1 triangle)
  const openEdges: [string, string][] = [];
  for (const [ek, count] of edgeTriCount) {
    if (count === 1) {
      openEdges.push(edgeEndpoints.get(ek)!);
    }
  }

  if (openEdges.length === 0) return caps;

  // Build adjacency graph from all open boundary edges
  const adj = new Map<string, Set<string>>();
  for (const [a, b] of openEdges) {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  }

  // Walk adjacency to form ordered contour chains
  const visited = new Set<string>();
  const contours: string[][] = [];

  for (const startVtx of adj.keys()) {
    if (visited.has(startVtx)) continue;

    const chain: string[] = [startVtx];
    visited.add(startVtx);

    let cur = startVtx;
    while (true) {
      const neighbors = adj.get(cur)!;
      let next: string | undefined;
      for (const n of neighbors) {
        if (!visited.has(n)) {
          next = n;
          break;
        }
      }
      if (!next) break;
      chain.push(next);
      visited.add(next);
      cur = next;
    }

    if (chain.length >= 3) {
      contours.push(chain);
    }
  }

  // Triangulate each contour with earcut using perimeter-unfolded 2D projection
  for (const contour of contours) {
    const coords3D = contour.map((k) => vertexCoords.get(k)!);

    // Project to 2D: (perimeterU, z)
    const flat: number[] = [];
    for (const [x, y, z] of coords3D) {
      flat.push(perimeterU(x, y, halfWidth, halfDepth), z);
    }

    const indices = earcut(flat, undefined, 2);

    for (let i = 0; i < indices.length; i += 3) {
      const a = coords3D[indices[i]];
      const b = coords3D[indices[i + 1]];
      const c = coords3D[indices[i + 2]];

      // Cross product for triangle normal
      const e1x = b[0] - a[0],
        e1y = b[1] - a[1],
        e1z = b[2] - a[2];
      const e2x = c[0] - a[0],
        e2y = c[1] - a[1],
        e2z = c[2] - a[2];
      const nx = e1y * e2z - e1z * e2y;
      const ny = e1z * e2x - e1x * e2z;

      // Outward direction: from model center (0,0) towards triangle centroid.
      // Boundary caps are at the edges of the bounding box, so the centroid's
      // XY components naturally point away from the origin.
      const cx = (a[0] + b[0] + c[0]) / 3;
      const cy = (a[1] + b[1] + c[1]) / 3;
      const dot = nx * cx + ny * cy;

      if (dot >= 0) {
        caps.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      } else {
        // Flip winding to correct normal direction
        caps.push(a[0], a[1], a[2], c[0], c[1], c[2], b[0], b[1], b[2]);
      }
    }
  }

  return caps;
}

/**
 * Clip a BufferGeometry to the XY footprint defined by ±halfWidth and ±halfDepth.
 *
 * Triangles fully inside the box are copied as-is (fast path).
 * Triangles crossing the boundary are split via Sutherland-Hodgman.
 * Triangles fully outside are discarded.
 * Open cross-sections at clip boundaries are sealed with cap faces.
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

  // Generate boundary caps to seal open cross-sections
  const capPositions = generateBoundaryCaps(clippedPositions, halfWidth, halfDepth);
  for (let i = 0; i < capPositions.length; i++) {
    clippedPositions.push(capPositions[i]);
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
