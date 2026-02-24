/**
 * 2D Oriented Bounding Box (OBB) computation using rotating calipers on convex hull.
 *
 * Used to determine the long-axis ridge direction for gabled and hipped roofs.
 */

/**
 * OBB result type.
 * axes[0] = long axis unit vector, axes[1] = short axis unit vector
 * halfExtents[0] = half-length along long axis, halfExtents[1] = half-length along short axis
 */
export interface OBBResult {
  center: [number, number];
  halfExtents: [number, number];
  axes: [[number, number], [number, number]];
}

/**
 * Compute the 2D convex hull of a set of points using the Graham scan algorithm.
 * Returns points in CCW order.
 */
function convexHull(points: [number, number][]): [number, number][] {
  if (points.length < 3) return [...points];

  // Find the bottom-most point (lowest Y, then leftmost X)
  let minIdx = 0;
  for (let i = 1; i < points.length; i++) {
    if (
      points[i][1] < points[minIdx][1] ||
      (points[i][1] === points[minIdx][1] && points[i][0] < points[minIdx][0])
    ) {
      minIdx = i;
    }
  }

  const pivot = points[minIdx];

  // Sort remaining points by polar angle with respect to pivot
  const sorted = points
    .filter((_, i) => i !== minIdx)
    .sort((a, b) => {
      const angleA = Math.atan2(a[1] - pivot[1], a[0] - pivot[0]);
      const angleB = Math.atan2(b[1] - pivot[1], b[0] - pivot[0]);
      if (Math.abs(angleA - angleB) > 1e-10) return angleA - angleB;
      // Tie-break by distance (closer first)
      const dA = (a[0] - pivot[0]) ** 2 + (a[1] - pivot[1]) ** 2;
      const dB = (b[0] - pivot[0]) ** 2 + (b[1] - pivot[1]) ** 2;
      return dA - dB;
    });

  // Cross product of vectors OA and OB
  function cross(o: [number, number], a: [number, number], b: [number, number]): number {
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  }

  const hull: [number, number][] = [pivot];
  for (const pt of sorted) {
    while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], pt) <= 0) {
      hull.pop();
    }
    hull.push(pt);
  }

  return hull;
}

/**
 * Compute the 2D Oriented Bounding Box of a polygon using rotating calipers on the convex hull.
 *
 * Algorithm:
 *   1. Compute convex hull of the vertices
 *   2. For each edge of the convex hull, rotate coordinate system to align with that edge
 *   3. Compute axis-aligned bounding box in rotated space
 *   4. Keep the rotation that produces minimum area
 *
 * @param vertices - 2D polygon vertices [[x, y], ...]
 * @returns OBB with center, halfExtents, and axes (long axis first)
 */
export function computeOBB(vertices: [number, number][]): OBBResult {
  if (vertices.length < 3) {
    // Degenerate: return trivial OBB
    const xs = vertices.map((v) => v[0]);
    const ys = vertices.map((v) => v[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const hw = (maxX - minX) / 2;
    const hd = (maxY - minY) / 2;
    const longFirst = hw >= hd;
    return {
      center: [cx, cy],
      halfExtents: longFirst ? [hw, hd] : [hd, hw],
      axes: longFirst ? [[1, 0], [0, 1]] : [[0, 1], [1, 0]],
    };
  }

  const hull = convexHull(vertices);
  const n = hull.length;

  let bestArea = Infinity;
  let bestOBB: OBBResult = {
    center: [0, 0],
    halfExtents: [0, 0],
    axes: [[1, 0], [0, 1]],
  };

  for (let i = 0; i < n; i++) {
    const p0 = hull[i];
    const p1 = hull[(i + 1) % n];

    // Edge direction (unit vector)
    const ex = p1[0] - p0[0];
    const ey = p1[1] - p0[1];
    const edgeLen = Math.sqrt(ex * ex + ey * ey);
    if (edgeLen < 1e-10) continue;

    const ux = ex / edgeLen; // unit vector along edge
    const uy = ey / edgeLen;
    const vx = -uy;           // perpendicular (rotate 90° CCW)
    const vy = ux;

    // Project all hull points onto (u, v) axes
    let minU = Infinity, maxU = -Infinity;
    let minV = Infinity, maxV = -Infinity;
    for (const pt of hull) {
      const u = pt[0] * ux + pt[1] * uy;
      const v = pt[0] * vx + pt[1] * vy;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }

    const width = maxU - minU;
    const height = maxV - minV;
    const area = width * height;

    if (area < bestArea) {
      bestArea = area;

      // Center in world space
      const centerU = (minU + maxU) / 2;
      const centerV = (minV + maxV) / 2;
      const cx = centerU * ux + centerV * vx;
      const cy = centerU * uy + centerV * vy;

      const hw = width / 2;
      const hd = height / 2;

      // Determine which axis is longer
      if (hw >= hd) {
        bestOBB = {
          center: [cx, cy],
          halfExtents: [hw, hd],
          axes: [[ux, uy], [vx, vy]],
        };
      } else {
        bestOBB = {
          center: [cx, cy],
          halfExtents: [hd, hw],
          axes: [[vx, vy], [ux, uy]],
        };
      }
    }
  }

  return bestOBB;
}
