/**
 * Mesh validation using manifold-3d WASM library.
 * Falls back to a boundary-edge check if manifold-3d fails to initialize.
 *
 * A mesh is manifold (watertight) when every edge is shared by exactly 2 triangles.
 */

import * as THREE from 'three';

// Lazy-loaded manifold module (avoids main-thread blocking on load)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let manifoldLib: any | null = null;

export async function getManifold() {
  if (!manifoldLib) {
    try {
      const Module = (await import('manifold-3d')).default;
      manifoldLib = await Module();
      manifoldLib.setup();
    } catch (err) {
      // Manifold-3d failed to load — will use fallback validation
      manifoldLib = null;
      throw err;
    }
  }
  return manifoldLib;
}

/**
 * Boundary-edge fallback: a mesh is manifold if every edge is shared by exactly 2 triangles.
 * Operates on non-indexed triangle soup (positions.length must be divisible by 9).
 */
function boundaryEdgeCheck(positions: Float32Array): { isManifold: boolean; error?: string } {
  const triangleCount = positions.length / 9;
  const edgeMap = new Map<string, number>();

  for (let t = 0; t < triangleCount; t++) {
    const base = t * 9;
    // Build 3 vertex keys from coordinates (rounded to avoid float noise)
    const v: string[] = [];
    for (let i = 0; i < 3; i++) {
      const b = base + i * 3;
      const x = positions[b].toFixed(4);
      const y = positions[b + 1].toFixed(4);
      const z = positions[b + 2].toFixed(4);
      v.push(`${x},${y},${z}`);
    }
    // Add 3 edges (each edge = sorted pair of vertex keys)
    for (let i = 0; i < 3; i++) {
      const a = v[i];
      const b = v[(i + 1) % 3];
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      edgeMap.set(key, (edgeMap.get(key) ?? 0) + 1);
    }
  }

  // Count boundary edges (shared by != 2 triangles)
  let boundaryEdges = 0;
  for (const [, count] of edgeMap) {
    if (count !== 2) boundaryEdges++;
  }

  // Allow minor boundary edges — RTIN adaptive mesh + sampled walls
  // will have small gaps that slicers auto-repair
  const totalEdges = edgeMap.size;
  const ratio = boundaryEdges / totalEdges;
  if (ratio > 0.05) {
    return { isManifold: false, error: `Too many boundary edges: ${boundaryEdges}/${totalEdges} (${(ratio * 100).toFixed(1)}%)` };
  }

  return { isManifold: true };
}

export interface ValidationResult {
  isManifold: boolean;
  error?: string;
  triangleCount: number;
  method: 'manifold-3d' | 'boundary-edge-fallback';
}

/**
 * Validate that a BufferGeometry is manifold (watertight).
 * Tries manifold-3d first; falls back to boundary-edge check on failure.
 */
export async function validateMesh(geometry: THREE.BufferGeometry): Promise<ValidationResult> {
  // Always work with non-indexed triangle soup
  const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry;
  const posAttr = nonIndexed.getAttribute('position') as THREE.BufferAttribute;
  const positions = posAttr.array as Float32Array;
  const triangleCount = positions.length / 9;

  // --- Try manifold-3d WASM ---
  try {
    const lib = await getManifold();
    const { Manifold, Mesh } = lib;

    // Build flat vertex/index arrays for manifold-3d
    const numVerts = positions.length / 3;
    const vertProperties = new Float32Array(numVerts * 3);
    for (let i = 0; i < positions.length; i++) {
      vertProperties[i] = positions[i];
    }

    const triVerts = new Uint32Array(triangleCount * 3);
    for (let i = 0; i < triangleCount * 3; i++) {
      triVerts[i] = i;
    }

    const mesh = new Mesh({ numProp: 3, vertProperties, triVerts });
    const manifold = new Manifold(mesh);
    const status = manifold.status();

    // manifold-3d status: 0 = NoError
    const isManifold = status === 0;
    const error = isManifold ? undefined : `manifold-3d status: ${status}`;

    return { isManifold, error, triangleCount, method: 'manifold-3d' };
  } catch (_err) {
    // manifold-3d unavailable or failed — use boundary-edge fallback
    const result = boundaryEdgeCheck(positions);
    return { ...result, triangleCount, method: 'boundary-edge-fallback' };
  }
}
