/**
 * Terrain mesh generation using Martini RTIN algorithm.
 * Produces Three.js BufferGeometry with hypsometric vertex colors.
 */

import * as THREE from 'three';
import Martini from '@mapbox/martini';
import type { ElevationData } from '../../types/geo';

export interface TerrainMeshParams {
  widthMM: number;        // target physical width in millimeters
  depthMM: number;        // target physical depth in millimeters
  geographicWidthM: number;  // real-world width of the bbox in meters
  geographicDepthM: number;  // real-world depth of the bbox in meters
  exaggeration: number;   // vertical exaggeration multiplier (default 1.5)
  minHeightMM: number;    // TERR-03 minimum floor height in mm (default 5)
  maxError: number;       // RTIN error threshold (default 5, lower = more triangles)
}

/**
 * Map normalized elevation (0-1) to RGB hypsometric tint.
 * Color stops:
 *   0.00-0.30: dark green (#2d6a2d) to yellow-green (#6b8c42) — lowlands/valleys
 *   0.30-0.65: yellow-green (#6b8c42) to brown (#8b6a3e) — mid elevations
 *   0.65-1.00: brown (#8b6a3e) to white (#ffffff) — peaks/snow
 *
 * Returns [r, g, b] each in 0-1 range for Three.js Color.
 */
export function elevationToColor(t: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, t));

  // Color stops as [r, g, b] in 0-255 range
  const darkGreen:    [number, number, number] = [0x2d / 255, 0x6a / 255, 0x2d / 255];
  const yellowGreen:  [number, number, number] = [0x6b / 255, 0x8c / 255, 0x42 / 255];
  const brown:        [number, number, number] = [0x8b / 255, 0x6a / 255, 0x3e / 255];
  const white:        [number, number, number] = [1.0, 1.0, 1.0];

  function lerp(a: [number, number, number], b: [number, number, number], f: number): [number, number, number] {
    return [
      a[0] + (b[0] - a[0]) * f,
      a[1] + (b[1] - a[1]) * f,
      a[2] + (b[2] - a[2]) * f,
    ];
  }

  if (clamped <= 0.3) {
    const f = clamped / 0.3;
    return lerp(darkGreen, yellowGreen, f);
  } else if (clamped <= 0.65) {
    const f = (clamped - 0.3) / 0.35;
    return lerp(yellowGreen, brown, f);
  } else {
    const f = (clamped - 0.65) / 0.35;
    return lerp(brown, white, f);
  }
}

/**
 * Build a Three.js BufferGeometry terrain mesh from elevation data using Martini RTIN.
 *
 * The mesh is centered at origin (X and Y centered, Z=0 at base).
 * Positions are in millimeters.
 */
export function buildTerrainGeometry(
  elevationData: ElevationData,
  params: TerrainMeshParams
): THREE.BufferGeometry {
  const { gridSize, elevations, minElevation, maxElevation } = elevationData;
  const { widthMM, depthMM, geographicWidthM, geographicDepthM, exaggeration, minHeightMM, maxError } = params;

  // 1. Build martini mesh using RTIN algorithm
  const martini = new Martini(gridSize);
  const tile = martini.createTile(elevations);
  const { vertices, triangles } = tile.getMesh(maxError);

  const vertexCount = vertices.length / 2;

  // 2. Compute elevation range
  const elevRange = maxElevation - minElevation;

  // 3. Compute Z scaling proportional to horizontal scale
  // horizontalScale = mm per meter of real-world distance
  // Z must use the same scale so the terrain looks natural at exaggeration=1
  const horizontalScale = widthMM / geographicWidthM;

  let zScale: number;
  if (elevRange === 0) {
    zScale = 0; // special case: perfectly flat — handled below
  } else {
    // Natural Z height at exaggeration=1 would be elevRange * horizontalScale mm
    // With exaggeration applied: elevRange * horizontalScale * exaggeration mm
    // Enforce minHeightMM floor for flat areas
    const naturalHeightMM = elevRange * horizontalScale * exaggeration;
    if (naturalHeightMM < minHeightMM) {
      zScale = minHeightMM / elevRange;
    } else {
      zScale = horizontalScale * exaggeration;
    }
  }

  // 4. Build positions Float32Array
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);

  for (let i = 0; i < vertexCount; i++) {
    const vx = vertices[i * 2];
    const vy = vertices[i * 2 + 1];

    // Sample elevation at this vertex
    const elevation = elevations[vy * gridSize + vx];

    // X: map to widthMM, centered
    const x = (vx / (gridSize - 1)) * widthMM - widthMM / 2;
    // Y: map to depthMM, centered (depth is Y axis)
    const y = (vy / (gridSize - 1)) * depthMM - depthMM / 2;
    // Z: elevation mapped to mm with exaggeration and floor
    let z: number;
    if (elevRange === 0) {
      z = minHeightMM;
    } else {
      z = (elevation - minElevation) * zScale;
    }

    positions[i * 3]     = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    // Vertex color from hypsometric tint
    const t = elevRange > 0 ? (elevation - minElevation) / elevRange : 0;
    const [r, g, b] = elevationToColor(t);
    colors[i * 3]     = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
  }

  // 5. Build BufferGeometry
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(triangles), 1));
  geometry.computeVertexNormals();

  return geometry;
}

/**
 * Update Z positions in-place when exaggeration changes (avoids full remesh).
 * Colors stay the same — elevation mapping doesn't change with exaggeration.
 */
export function updateTerrainElevation(
  geometry: THREE.BufferGeometry,
  elevationData: ElevationData,
  params: TerrainMeshParams
): void {
  const { gridSize, elevations, minElevation, maxElevation } = elevationData;
  const { widthMM, geographicWidthM, exaggeration, minHeightMM } = params;

  const positionAttribute = geometry.getAttribute('position') as THREE.BufferAttribute;
  const vertexCount = positionAttribute.count;

  const elevRange = maxElevation - minElevation;
  const horizontalScale = widthMM / geographicWidthM;

  let zScale: number;
  if (elevRange === 0) {
    zScale = 0;
  } else {
    const naturalHeightMM = elevRange * horizontalScale * exaggeration;
    if (naturalHeightMM < minHeightMM) {
      zScale = minHeightMM / elevRange;
    } else {
      zScale = horizontalScale * exaggeration;
    }
  }

  // We need to know which vertex corresponds to which grid position.
  // The positions were built from the martini vertices array, so we need to
  // re-derive the vertex grid positions from the current X/Y positions.
  // Since X = (vx / (gridSize-1)) * widthMM - widthMM/2,
  // we can recover vx from X: vx = (X + widthMM/2) / widthMM * (gridSize-1)
  // Similarly for vy from Y.
  const { widthMM, depthMM } = params;

  for (let i = 0; i < vertexCount; i++) {
    const x = positionAttribute.getX(i);
    const y = positionAttribute.getY(i);

    // Recover grid indices
    const vx = Math.round((x + widthMM / 2) / widthMM * (gridSize - 1));
    const vy = Math.round((y + depthMM / 2) / depthMM * (gridSize - 1));

    const elevation = elevations[vy * gridSize + vx];

    let z: number;
    if (elevRange === 0) {
      z = minHeightMM;
    } else {
      z = (elevation - minElevation) * zScale;
    }

    positionAttribute.setZ(i, z);
  }

  positionAttribute.needsUpdate = true;
  geometry.computeVertexNormals();
}
