/**
 * BVH-accelerated terrain raycaster for snapping geometry vertices
 * to the actual Martini RTIN terrain mesh surface.
 *
 * Used by both road and building mesh generators to eliminate Z mismatch
 * between the raw elevation grid and the simplified terrain mesh.
 */

import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

export type TerrainZSampler = (x: number, y: number) => number | null;

/**
 * Build a BVH-accelerated terrain raycaster. Returns a function that maps
 * (x, y) in mm space to the terrain Z at that point, or null if no hit.
 *
 * Uses three-mesh-bvh for O(log n) ray intersection instead of brute-force.
 */
export function buildTerrainRaycaster(
  terrainGeometry: THREE.BufferGeometry
): TerrainZSampler {
  // Build BVH for the terrain geometry
  const bvh = new MeshBVH(terrainGeometry);

  // Create a temporary mesh for raycasting
  const tempMesh = new THREE.Mesh(terrainGeometry, new THREE.MeshBasicMaterial());
  // Type assertion: resolves version mismatch between three-mesh-bvh 0.9.8 and drei's nested 0.8.3
  tempMesh.geometry.boundsTree = bvh as any;

  // Compute terrain bounding box to determine ray origin height and clamp bounds
  terrainGeometry.computeBoundingBox();
  const bb = terrainGeometry.boundingBox!;
  const terrainMaxZ = bb.max.z;
  const rayOriginZ = terrainMaxZ + 100; // well above terrain

  const raycaster = new THREE.Raycaster();
  const rayDir = new THREE.Vector3(0, 0, -1);

  return (x: number, y: number): number | null => {
    // Clamp query point to terrain bounds so edge vertices still hit the mesh
    const cx = Math.max(bb.min.x, Math.min(bb.max.x, x));
    const cy = Math.max(bb.min.y, Math.min(bb.max.y, y));
    raycaster.set(new THREE.Vector3(cx, cy, rayOriginZ), rayDir);

    // Use BVH-accelerated intersection
    const hits = raycaster.intersectObject(tempMesh, false);
    if (hits.length > 0) {
      return hits[0].point.z;
    }
    return null;
  };
}
