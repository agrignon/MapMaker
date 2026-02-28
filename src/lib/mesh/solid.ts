/**
 * Builds a watertight solid mesh from a terrain surface BufferGeometry.
 * Closes the terrain surface into a printable solid by adding:
 *   - Base plate: flat rectangle at z = -basePlateThicknessMM
 *   - Side walls: four walls connecting terrain perimeter edges down to the base
 *
 * Wall construction uses actual perimeter vertices from the terrain geometry
 * (instead of nearest-vertex sampling) to eliminate floating-point near-miss gaps.
 *
 * All faces use counter-clockwise winding (viewed from outside) for manifold correctness.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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

  // Sort for correct winding direction (CCW from outside):
  // South: west → east (ascending x)
  edges.south.sort((a, b) => a.x - b.x);
  // North: east → west (descending x) — reversed for CCW
  edges.north.sort((a, b) => b.x - a.x);
  // East: south → north (ascending y)
  edges.east.sort((a, b) => a.y - b.y);
  // West: north → south (descending y) — reversed for CCW
  edges.west.sort((a, b) => b.y - a.y);

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

  const minX = bbox.min.x;
  const maxX = bbox.max.x;
  const minY = bbox.min.y;
  const maxY = bbox.max.y;
  const baseZ = -basePlateThicknessMM;

  // We need a non-indexed copy of the terrain surface for manifold-safe merging
  const terrainNonIndexed = terrainGeometry.toNonIndexed();
  // Remove color attribute from solid — it's only needed for preview
  terrainNonIndexed.deleteAttribute('color');

  const positions = terrainGeometry.getAttribute('position') as THREE.BufferAttribute;

  // ---- 1. Base plate -------------------------------------------------------
  // Two triangles forming a rectangle at z = baseZ
  // The base plate normal should point DOWN (-Z), i.e. outward from the solid.
  // CCW winding when viewed from outside (below):
  //   T1: (minX,minY,baseZ) → (minX,maxY,baseZ) → (maxX,maxY,baseZ)
  //   T2: (minX,minY,baseZ) → (maxX,maxY,baseZ) → (maxX,minY,baseZ)

  const basePlatePositions = new Float32Array([
    // T1
    minX, minY, baseZ,
    minX, maxY, baseZ,
    maxX, maxY, baseZ,
    // T2
    minX, minY, baseZ,
    maxX, maxY, baseZ,
    maxX, minY, baseZ,
  ]);
  const basePlateGeom = new THREE.BufferGeometry();
  basePlateGeom.setAttribute('position', new THREE.BufferAttribute(basePlatePositions, 3));

  // ---- 2. Side walls -------------------------------------------------------
  // Extract actual perimeter vertices from terrain geometry.
  // This eliminates the nearest-vertex sampling gap that caused non-manifold seams.
  const perimeterVerts = extractPerimeterVertices(positions, bbox);
  const wallArrays: Float32Array[] = [];
  const edgeNames: Array<'south' | 'north' | 'east' | 'west'> = ['south', 'north', 'east', 'west'];

  for (const edge of edgeNames) {
    const verts = perimeterVerts[edge];
    if (verts.length < 2) continue;

    const segCount = verts.length - 1;
    const triCount = segCount * 2;
    const wallPositions = new Float32Array(triCount * 3 * 3);
    let idx = 0;

    for (let s = 0; s < segCount; s++) {
      const p0 = verts[s];
      const p1 = verts[s + 1];
      const b0 = { x: p0.x, y: p0.y, z: baseZ };
      const b1 = { x: p1.x, y: p1.y, z: baseZ };

      // T1: p0 → p1 → b1 (CCW from outside)
      wallPositions[idx++] = p0.x; wallPositions[idx++] = p0.y; wallPositions[idx++] = p0.z;
      wallPositions[idx++] = p1.x; wallPositions[idx++] = p1.y; wallPositions[idx++] = p1.z;
      wallPositions[idx++] = b1.x; wallPositions[idx++] = b1.y; wallPositions[idx++] = b1.z;

      // T2: p0 → b1 → b0 (CCW from outside)
      wallPositions[idx++] = p0.x; wallPositions[idx++] = p0.y; wallPositions[idx++] = p0.z;
      wallPositions[idx++] = b1.x; wallPositions[idx++] = b1.y; wallPositions[idx++] = b1.z;
      wallPositions[idx++] = b0.x; wallPositions[idx++] = b0.y; wallPositions[idx++] = b0.z;
    }

    // Trim array if fewer triangles than allocated
    wallArrays.push(wallPositions.slice(0, idx));
  }

  // ---- 3. Corner stitching -------------------------------------------------
  // Connect the end of each edge to the start of the next edge at each bbox corner.
  // At each corner (SE, NE, NW, SW), the last vertex of one wall may have a different
  // Z than the first vertex of the next wall (RTIN triangulation artifact). Fill the gap.
  const cornerPairs = [
    { from: perimeterVerts.south[perimeterVerts.south.length - 1], to: perimeterVerts.east[0] },   // SE corner
    { from: perimeterVerts.east[perimeterVerts.east.length - 1],   to: perimeterVerts.north[0] },  // NE corner
    { from: perimeterVerts.north[perimeterVerts.north.length - 1], to: perimeterVerts.west[0] },   // NW corner
    { from: perimeterVerts.west[perimeterVerts.west.length - 1],   to: perimeterVerts.south[0] },  // SW corner
  ];

  for (const { from, to } of cornerPairs) {
    // If they share the same Z, no triangle needed (walls meet exactly)
    if (!from || !to || Math.abs(from.z - to.z) < 0.001) continue;
    // Otherwise, add a triangle to bridge the Z gap
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

  const wallGeometries = wallArrays.map((arr) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return g;
  });

  // ---- 4. Merge all parts --------------------------------------------------
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

  return merged;
}
