/**
 * Builds a watertight solid mesh from a terrain surface BufferGeometry.
 * Closes the terrain surface into a printable solid by adding:
 *   - Base plate: polygon at z = -basePlateThicknessMM that exactly matches
 *     the wall bottom perimeter (earcut-triangulated for zero interior edges)
 *   - Side walls: four walls connecting terrain perimeter edges down to the base
 *
 * Wall construction uses actual perimeter vertices from the terrain geometry
 * (instead of nearest-vertex sampling) to eliminate floating-point near-miss gaps.
 *
 * Base plate is earcut-triangulated so every wall bottom edge is shared by
 * exactly one base plate triangle, resulting in zero boundary edges.
 *
 * All faces use counter-clockwise winding (viewed from outside) for manifold correctness.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import earcut from 'earcut';

interface PerimeterVertex {
  x: number;
  y: number;
  z: number;
}

/**
 * Extract vertices that lie on each edge of the terrain bounding box.
 * Groups vertices by edge (south/north/east/west) and sorts them
 * in the correct winding order for outward-facing wall construction.
 *
 * Edge tolerance: vertex is on-edge if its perpendicular distance to the
 * bbox edge is < 0.01mm (covers float rounding from Martini RTIN).
 *
 * Winding order (CCW from outside, i.e. CCW when viewed from below -Z):
 *   south: west→east (x ascending)
 *   east:  south→north (y ascending)
 *   north: east→west (x descending)
 *   west:  north→south (y descending)
 * Reading south→east→north→west→back to south forms a CCW loop from below.
 */
function extractPerimeterVertices(
  positions: THREE.BufferAttribute,
  bbox: THREE.Box3
): Record<'south' | 'north' | 'east' | 'west', PerimeterVertex[]> {
  const { min, max } = bbox;
  const tol = 0.01; // mm tolerance for edge detection

  const edges: Record<string, PerimeterVertex[]> = {
    south: [], // y ≈ min.y
    north: [], // y ≈ max.y
    east: [],  // x ≈ max.x
    west: [],  // x ≈ min.x
  };

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);

    if (Math.abs(y - min.y) < tol) edges.south.push({ x, y: min.y, z });
    if (Math.abs(y - max.y) < tol) edges.north.push({ x, y: max.y, z });
    if (Math.abs(x - max.x) < tol) edges.east.push({ x: max.x, y, z });
    if (Math.abs(x - min.x) < tol) edges.west.push({ x: min.x, y, z });
  }

  // Sort for correct winding direction (CCW from outside / below):
  edges.south.sort((a, b) => a.x - b.x);  // west→east
  edges.east.sort((a, b) => a.y - b.y);   // south→north
  edges.north.sort((a, b) => b.x - a.x);  // east→west
  edges.west.sort((a, b) => b.y - a.y);   // north→south

  // Deduplicate vertices at same position (RTIN may produce duplicates)
  for (const edgeName of Object.keys(edges)) {
    const verts = edges[edgeName];
    const deduped: PerimeterVertex[] = [];
    for (const v of verts) {
      if (
        deduped.length === 0 ||
        Math.abs(v.x - deduped[deduped.length - 1].x) > 0.001 ||
        Math.abs(v.y - deduped[deduped.length - 1].y) > 0.001
      ) {
        deduped.push(v);
      }
    }
    edges[edgeName] = deduped;
  }

  return edges as Record<'south' | 'north' | 'east' | 'west', PerimeterVertex[]>;
}

/**
 * Build a watertight solid mesh by adding a base plate and four side walls
 * to the terrain surface.
 *
 * @param terrainGeometry - The terrain surface BufferGeometry from buildTerrainGeometry
 * @param basePlateThicknessMM - Thickness of the base plate in mm (e.g. 3)
 * @returns A new BufferGeometry that is a closed, watertight solid
 */
export function buildSolidMesh(
  terrainGeometry: THREE.BufferGeometry,
  basePlateThicknessMM: number
): THREE.BufferGeometry {
  // Get the bounding box of the terrain surface
  terrainGeometry.computeBoundingBox();
  const bbox = terrainGeometry.boundingBox!;

  const baseZ = -basePlateThicknessMM;

  // We need a non-indexed copy of the terrain surface for manifold-safe merging
  const terrainNonIndexed = terrainGeometry.toNonIndexed();
  // Remove color attribute from solid — it's only needed for preview
  terrainNonIndexed.deleteAttribute('color');

  const positions = terrainGeometry.getAttribute('position') as THREE.BufferAttribute;

  // ---- 1. Extract perimeter vertices ----------------------------------------
  const perimeterVerts = extractPerimeterVertices(positions, bbox);

  // ---- 2. Build perimeter loop in CCW order (for wall + base plate) ---------
  // The loop order is: south → east → north → west → (back to south start)
  // This is CCW when viewed from below (-Z), giving outward base plate normal.
  const edgeOrder: Array<'south' | 'east' | 'north' | 'west'> = ['south', 'east', 'north', 'west'];
  const perimeterLoop: PerimeterVertex[] = [];

  for (const edge of edgeOrder) {
    const verts = perimeterVerts[edge];
    for (const v of verts) {
      // Skip corner duplicates
      if (
        perimeterLoop.length > 0 &&
        Math.abs(v.x - perimeterLoop[perimeterLoop.length - 1].x) < 0.001 &&
        Math.abs(v.y - perimeterLoop[perimeterLoop.length - 1].y) < 0.001
      ) {
        continue;
      }
      perimeterLoop.push(v);
    }
  }
  // Deduplicate loop closure (last == first)
  if (
    perimeterLoop.length > 1 &&
    Math.abs(perimeterLoop[perimeterLoop.length - 1].x - perimeterLoop[0].x) < 0.001 &&
    Math.abs(perimeterLoop[perimeterLoop.length - 1].y - perimeterLoop[0].y) < 0.001
  ) {
    perimeterLoop.pop();
  }

  // ---- 3. Base plate -------------------------------------------------------
  // Earcut-triangulate the perimeter loop at z=baseZ.
  // Using earcut ensures NO interior edges — all triangle edges lie on the perimeter
  // (which are also wall bottom edges), giving zero boundary edges at the base.
  const coords2d: number[] = [];
  for (const v of perimeterLoop) {
    coords2d.push(v.x, v.y);
  }
  const triIndices = earcut(coords2d, undefined, 2);

  // Build non-indexed triangle soup for base plate
  // Winding: earcut returns CCW in 2D (y-up), which matches CCW from below (-Z) = outward normal down
  const basePlatePositions = new Float32Array(triIndices.length * 3);
  for (let t = 0; t < triIndices.length; t++) {
    const vi = triIndices[t];
    basePlatePositions[t * 3 + 0] = perimeterLoop[vi].x;
    basePlatePositions[t * 3 + 1] = perimeterLoop[vi].y;
    basePlatePositions[t * 3 + 2] = baseZ;
  }

  const basePlateGeom = new THREE.BufferGeometry();
  basePlateGeom.setAttribute('position', new THREE.BufferAttribute(basePlatePositions, 3));

  // ---- 4. Side walls -------------------------------------------------------
  // Build quads from terrain top perimeter down to baseZ.
  // Walls use the same sorted/deduplicated perimeter vertices as the loop above.
  const wallArrays: Float32Array[] = [];

  for (const edge of edgeOrder) {
    const verts = perimeterVerts[edge];
    if (verts.length < 2) continue;

    const segCount = verts.length - 1;
    const wallPositions = new Float32Array(segCount * 2 * 3 * 3);
    let idx = 0;

    for (let s = 0; s < segCount; s++) {
      const p0 = verts[s];
      const p1 = verts[s + 1];
      const b0z = baseZ;
      const b1z = baseZ;

      // T1: p0 → p1 → b1 (CCW from outside)
      wallPositions[idx++] = p0.x; wallPositions[idx++] = p0.y; wallPositions[idx++] = p0.z;
      wallPositions[idx++] = p1.x; wallPositions[idx++] = p1.y; wallPositions[idx++] = p1.z;
      wallPositions[idx++] = p1.x; wallPositions[idx++] = p1.y; wallPositions[idx++] = b1z;

      // T2: p0 → b1 → b0 (CCW from outside)
      wallPositions[idx++] = p0.x; wallPositions[idx++] = p0.y; wallPositions[idx++] = p0.z;
      wallPositions[idx++] = p1.x; wallPositions[idx++] = p1.y; wallPositions[idx++] = b1z;
      wallPositions[idx++] = p0.x; wallPositions[idx++] = p0.y; wallPositions[idx++] = b0z;
    }

    wallArrays.push(wallPositions.slice(0, idx));
  }

  // ---- 5. Corner stitching -------------------------------------------------
  // Connect adjacent wall edges at each bbox corner.
  // At each corner, the last vertex of one wall meets the first vertex of the next.
  // If they have different Z values (RTIN artifact), add triangles to bridge the gap.
  //
  // Corner order follows the perimeter loop: south end → east start (SE),
  // east end → north start (NE), north end → west start (NW), west end → south start (SW).
  const cornerPairs = [
    { from: perimeterVerts.south[perimeterVerts.south.length - 1], to: perimeterVerts.east[0] },   // SE
    { from: perimeterVerts.east[perimeterVerts.east.length - 1],   to: perimeterVerts.north[0] },  // NE
    { from: perimeterVerts.north[perimeterVerts.north.length - 1], to: perimeterVerts.west[0] },   // NW
    { from: perimeterVerts.west[perimeterVerts.west.length - 1],   to: perimeterVerts.south[0] },  // SW
  ];

  for (const { from, to } of cornerPairs) {
    if (!from || !to) continue;
    // Check if corners are at the same XY (they should be)
    const sameXY =
      Math.abs(from.x - to.x) < 0.001 &&
      Math.abs(from.y - to.y) < 0.001;
    // If same XY, same Z means walls already meet exactly — no fill needed.
    // If different Z values at the same corner, add a vertical triangle to fill.
    if (sameXY && Math.abs(from.z - to.z) < 0.001) continue;
    if (sameXY && Math.abs(from.z - to.z) >= 0.001) {
      // Single triangle fills the vertical gap at this corner
      const triPositions = new Float32Array([
        from.x, from.y, from.z,
        from.x, from.y, to.z,
        from.x, from.y, baseZ,
      ]);
      wallArrays.push(triPositions);
      continue;
    }
    // Different XY: the corners don't share the same bbox corner (shouldn't happen
    // for a rectangular terrain, but handle gracefully with a quad)
    const cornerPositions = new Float32Array([
      from.x, from.y, from.z,
      to.x,   to.y,   to.z,
      from.x, from.y, baseZ,

      to.x,   to.y,   to.z,
      to.x,   to.y,   baseZ,
      from.x, from.y, baseZ,
    ]);
    wallArrays.push(cornerPositions);
  }

  // ---- 6. Merge all parts --------------------------------------------------
  const wallGeometries = wallArrays.map((arr) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return g;
  });

  // Strip normals — recompute on merged result for consistency
  terrainNonIndexed.deleteAttribute('normal');
  basePlateGeom.deleteAttribute('normal');
  wallGeometries.forEach((g) => g.deleteAttribute('normal'));

  const allGeoms = [terrainNonIndexed, basePlateGeom, ...wallGeometries];
  const merged = mergeGeometries(allGeoms, false);

  if (!merged) {
    throw new Error('buildSolidMesh: mergeGeometries returned null');
  }

  merged.computeVertexNormals();

  // Dispose intermediate geometries
  terrainNonIndexed.dispose();
  basePlateGeom.dispose();
  wallGeometries.forEach((g) => g.dispose());

  return merged;
}

// Export for type only — used by tests
export type { PerimeterVertex };
