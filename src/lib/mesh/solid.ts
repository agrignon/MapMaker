/**
 * Builds a watertight solid mesh from a terrain surface BufferGeometry.
 * Closes the terrain surface into a printable solid by adding:
 *   - Base plate: flat rectangle at z = -basePlateThicknessMM
 *   - Side walls: four walls connecting terrain perimeter edges down to the base
 *
 * All faces use counter-clockwise winding (viewed from outside) for manifold correctness.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const EDGE_SAMPLES = 64; // Samples per edge for side walls

/**
 * Sample the Z value of a terrain surface at a given XY position.
 * Uses the mesh's position buffer to find the nearest vertex.
 * For perimeter sampling, we linearly interpolate across a row/column.
 */
function sampleTerrainEdge(
  positions: THREE.BufferAttribute,
  widthMM: number,
  depthMM: number,
  edge: 'north' | 'south' | 'east' | 'west',
  t: number // 0 to 1 along edge
): { x: number; y: number; z: number } {
  const halfW = widthMM / 2;
  const halfD = depthMM / 2;

  let tx: number, ty: number;
  switch (edge) {
    case 'south': tx = t;     ty = 0; break; // y = -halfD
    case 'north': tx = 1 - t; ty = 1; break; // y = +halfD (reversed for CCW)
    case 'east':  tx = 1;     ty = t; break; // x = +halfW
    case 'west':  tx = 0;     ty = 1 - t; break; // x = -halfW (reversed for CCW)
  }

  const targetX = tx * widthMM - halfW;
  const targetY = ty * depthMM - halfD;

  // Find the closest vertex in the positions buffer
  const count = positions.count;
  let bestDist = Infinity;
  let bestZ = 0;

  for (let i = 0; i < count; i++) {
    const px = positions.getX(i);
    const py = positions.getY(i);
    const dist = (px - targetX) ** 2 + (py - targetY) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      bestZ = positions.getZ(i);
    }
  }

  return { x: targetX, y: targetY, z: bestZ };
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

  const widthMM = maxX - minX;
  const depthMM = maxY - minY;

  // We need a non-indexed copy of the terrain surface for manifold-safe merging
  const terrainNonIndexed = terrainGeometry.toNonIndexed();
  // Remove color attribute from solid — it's only needed for preview
  terrainNonIndexed.deleteAttribute('color');

  const positions = terrainGeometry.getAttribute('position') as THREE.BufferAttribute;

  // ---- 1. Base plate -------------------------------------------------------
  // Two triangles forming a rectangle at z = baseZ
  // Winding: viewed from below (looking up at -Z), counter-clockwise
  // So from -Z direction: (minX,minY) → (maxX,minY) → (maxX,maxY) → (minX,maxY)
  // Two triangles (CCW from below, meaning CW from above):
  //   T1: (minX,minY,baseZ) (minX,maxY,baseZ) (maxX,minY,baseZ)  — wrong, let me think clearly
  //
  // The base plate normal should point DOWN (-Z), i.e. outward from the solid.
  // CCW winding when viewed from outside (below) = the vertices go counter-clockwise
  // when you look from -Z direction (from below).
  //
  // Looking from below (-Z looking upward):
  //   top-left = (minX, maxY)
  //   top-right = (maxX, maxY)
  //   bottom-left = (minX, minY)
  //   bottom-right = (maxX, minY)
  //
  // For normal pointing downward (-Z), CCW from below:
  //   T1: BL → TL → TR   = (minX,minY) → (minX,maxY) → (maxX,maxY)
  //   T2: BL → TR → BR   = (minX,minY) → (maxX,maxY) → (maxX,minY)

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
  // For each of the 4 edges, sample EDGE_SAMPLES points along the terrain perimeter
  // and the corresponding base edge, then create quads.
  //
  // Winding convention: CCW when viewed from outside (outward-pointing normal).
  // South wall (y = minY): normal points in -Y direction
  //   Walking west to east along south edge (t: 0 → 1):
  //   p0 = terrain[t], p1 = terrain[t+1], b0 = base[t], b1 = base[t+1]
  //   Quad: p0→b0→b1→p1 (CCW from -Y looking in)
  // North wall (y = maxY): normal points in +Y direction
  //   Walking east to west (reversed):
  // East wall (x = maxX): normal points in +X direction
  // West wall (x = minX): normal points in -X direction

  const wallArrays: Float32Array[] = [];

  const edges: Array<'south' | 'north' | 'east' | 'west'> = ['south', 'north', 'east', 'west'];

  for (const edge of edges) {
    const triCount = EDGE_SAMPLES * 2; // 2 triangles per quad
    const wallPositions = new Float32Array(triCount * 3 * 3); // 3 vertices * 3 coords
    let idx = 0;

    for (let s = 0; s < EDGE_SAMPLES; s++) {
      const t0 = s / EDGE_SAMPLES;
      const t1 = (s + 1) / EDGE_SAMPLES;

      const p0 = sampleTerrainEdge(positions, widthMM, depthMM, edge, t0);
      const p1 = sampleTerrainEdge(positions, widthMM, depthMM, edge, t1);

      // Base points directly below p0 and p1
      const b0 = { x: p0.x, y: p0.y, z: baseZ };
      const b1 = { x: p1.x, y: p1.y, z: baseZ };

      // Quad as 2 triangles with outward-facing normals.
      // For south wall (looking from -Y): p0 is left-top, p1 is right-top
      // b0 is left-bottom, b1 is right-bottom
      // CCW from outside: T1 = p0 → b0 → p1 (wrong), let me use cross-product logic:
      //
      // For a quad p0, p1 (top), b1, b0 (bottom) going left-to-right,
      // the outward normal depends on the edge direction.
      // The "edge direction" vector tells us how the T parameter increases.
      //
      // sampleTerrainEdge reverses north & west, so the edge parameter t
      // always increases in the "correct outward-CCW" direction.
      //
      // Standard quad winding (outward CCW):
      //   T1: p0 → p1 → b1
      //   T2: p0 → b1 → b0

      // T1
      wallPositions[idx++] = p0.x; wallPositions[idx++] = p0.y; wallPositions[idx++] = p0.z;
      wallPositions[idx++] = p1.x; wallPositions[idx++] = p1.y; wallPositions[idx++] = p1.z;
      wallPositions[idx++] = b1.x; wallPositions[idx++] = b1.y; wallPositions[idx++] = b1.z;

      // T2
      wallPositions[idx++] = p0.x; wallPositions[idx++] = p0.y; wallPositions[idx++] = p0.z;
      wallPositions[idx++] = b1.x; wallPositions[idx++] = b1.y; wallPositions[idx++] = b1.z;
      wallPositions[idx++] = b0.x; wallPositions[idx++] = b0.y; wallPositions[idx++] = b0.z;
    }

    wallArrays.push(wallPositions);
  }

  const wallGeometries = wallArrays.map((arr) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return g;
  });

  // ---- 3. Merge all parts --------------------------------------------------
  const allGeoms = [terrainNonIndexed, basePlateGeom, ...wallGeometries];
  const merged = mergeGeometries(allGeoms, false);

  if (!merged) {
    throw new Error('buildSolidMesh: mergeGeometries returned null');
  }

  merged.computeVertexNormals();

  return merged;
}
