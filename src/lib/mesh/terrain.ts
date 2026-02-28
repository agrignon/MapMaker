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
  /**
   * Optional override for terrain surface Z height in mm.
   * When > 0, overrides natural zScale so max terrain Z == targetReliefMM.
   * targetReliefMM = targetHeightMM - basePlateThicknessMM (caller's responsibility).
   * When 0 or undefined, natural zScale (horizontalScale * exaggeration) is used.
   */
  targetReliefMM?: number;
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
 * Smooth an elevation grid using a separable Gaussian blur (two 1D passes).
 * Edge pixels are handled via weight normalization (no padding needed).
 *
 * @param elevations  Flat Float32Array of gridSize×gridSize elevation samples
 * @param gridSize    Side length of the square grid
 * @param radius      Kernel radius (effective kernel width = 2*radius + 1)
 * @returns           New Float32Array with smoothed elevations
 */
export function smoothElevations(
  elevations: Float32Array,
  gridSize: number,
  radius: number
): Float32Array {
  if (radius <= 0) return new Float32Array(elevations);

  const sigma = radius / 2;
  const kernelSize = 2 * radius + 1;
  const kernel = new Float32Array(kernelSize);

  // Build 1D Gaussian kernel
  for (let i = 0; i < kernelSize; i++) {
    const x = i - radius;
    kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
  }

  const temp = new Float32Array(gridSize * gridSize);
  const out = new Float32Array(gridSize * gridSize);

  // Horizontal pass → temp
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      let sum = 0;
      let wt = 0;
      for (let k = -radius; k <= radius; k++) {
        const c = col + k;
        if (c >= 0 && c < gridSize) {
          const w = kernel[k + radius];
          sum += elevations[row * gridSize + c] * w;
          wt += w;
        }
      }
      temp[row * gridSize + col] = sum / wt;
    }
  }

  // Vertical pass → out
  for (let col = 0; col < gridSize; col++) {
    for (let row = 0; row < gridSize; row++) {
      let sum = 0;
      let wt = 0;
      for (let k = -radius; k <= radius; k++) {
        const r = row + k;
        if (r >= 0 && r < gridSize) {
          const w = kernel[k + radius];
          sum += temp[r * gridSize + col] * w;
          wt += w;
        }
      }
      out[row * gridSize + col] = sum / wt;
    }
  }

  return out;
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
  const { gridSize, elevations } = elevationData;
  const { widthMM, depthMM, geographicWidthM, exaggeration, minHeightMM, maxError, targetReliefMM } = params;

  // 0. Callers are responsible for smoothing before calling buildTerrainGeometry.
  //    smoothElevations is exported for caller-side use.
  const smoothed = elevations;

  // Recompute min/max from smoothed data
  let smoothedMin = Infinity;
  let smoothedMax = -Infinity;
  for (let i = 0; i < smoothed.length; i++) {
    if (smoothed[i] < smoothedMin) smoothedMin = smoothed[i];
    if (smoothed[i] > smoothedMax) smoothedMax = smoothed[i];
  }

  // 1. Build martini mesh using RTIN algorithm
  const martini = new Martini(gridSize);
  const tile = martini.createTile(smoothed);
  const { vertices, triangles } = tile.getMesh(maxError);

  const vertexCount = vertices.length / 2;

  // 2. Compute elevation range (from smoothed data)
  const elevRange = smoothedMax - smoothedMin;

  // 3. Compute Z scaling proportional to horizontal scale
  // horizontalScale = mm per meter of real-world distance
  // Z must use the same scale so the terrain looks natural at exaggeration=1
  const horizontalScale = widthMM / geographicWidthM;

  let zScale: number;
  if (elevRange === 0) {
    zScale = 0; // special case: perfectly flat — handled below
  } else if (targetReliefMM && targetReliefMM > 0) {
    // Z height override with exaggeration: targetReliefMM sets the base height
    // at exaggeration=1.0; the exaggeration multiplier scales on top so the
    // slider always produces a visible change even when height is set.
    zScale = (targetReliefMM / elevRange) * exaggeration;
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

    // Sample elevation at this vertex (from smoothed grid)
    const elevation = smoothed[vy * gridSize + vx];

    // X: map to widthMM, centered
    const x = (vx / (gridSize - 1)) * widthMM - widthMM / 2;
    // Y: map to depthMM, centered (depth is Y axis)
    // Y-axis: vy=0 is north (row 0 in array), must map to positive Y (north in mesh space).
    // Formula: y = (1 - vy/(gridSize-1)) * depthMM - depthMM/2
    // vy=0 → y=+depthMM/2 (north), vy=gridSize-1 → y=-depthMM/2 (south)
    const y = (1 - vy / (gridSize - 1)) * depthMM - depthMM / 2;
    // Z: elevation mapped to mm with exaggeration and floor
    let z: number;
    if (elevRange === 0) {
      z = minHeightMM;
    } else {
      z = (elevation - smoothedMin) * zScale;
    }

    positions[i * 3]     = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    // Vertex color from hypsometric tint
    const t = elevRange > 0 ? (elevation - smoothedMin) / elevRange : 0;
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
  const { gridSize, elevations } = elevationData;
  const { widthMM, depthMM, geographicWidthM, exaggeration, minHeightMM, targetReliefMM } = params;

  // Callers are responsible for smoothing before calling updateTerrainElevation.
  const smoothed = elevations;

  let smoothedMin = Infinity;
  let smoothedMax = -Infinity;
  for (let i = 0; i < smoothed.length; i++) {
    if (smoothed[i] < smoothedMin) smoothedMin = smoothed[i];
    if (smoothed[i] > smoothedMax) smoothedMax = smoothed[i];
  }

  const positionAttribute = geometry.getAttribute('position') as THREE.BufferAttribute;
  const vertexCount = positionAttribute.count;

  const elevRange = smoothedMax - smoothedMin;
  const horizontalScale = widthMM / geographicWidthM;

  let zScale: number;
  if (elevRange === 0) {
    zScale = 0;
  } else if (targetReliefMM && targetReliefMM > 0) {
    // Z height override with exaggeration: matches buildTerrainGeometry logic
    zScale = (targetReliefMM / elevRange) * exaggeration;
  } else {
    const naturalHeightMM = elevRange * horizontalScale * exaggeration;
    if (naturalHeightMM < minHeightMM) {
      zScale = minHeightMM / elevRange;
    } else {
      zScale = horizontalScale * exaggeration;
    }
  }

  for (let i = 0; i < vertexCount; i++) {
    const x = positionAttribute.getX(i);
    const y = positionAttribute.getY(i);

    // Recover grid indices from vertex position.
    // X recovery: vx = (x + widthMM/2) / widthMM * (gridSize-1)
    const vx = Math.round((x + widthMM / 2) / widthMM * (gridSize - 1));
    // Y recovery: invert y = (1 - vy/(gridSize-1)) * depthMM - depthMM/2
    // => (y + depthMM/2) / depthMM = 1 - vy/(gridSize-1)
    // => vy = (1 - (y + depthMM/2) / depthMM) * (gridSize-1)
    const vy = Math.round((1 - (y + depthMM / 2) / depthMM) * (gridSize - 1));

    const elevation = smoothed[vy * gridSize + vx];

    let z: number;
    if (elevRange === 0) {
      z = minHeightMM;
    } else {
      z = (elevation - smoothedMin) * zScale;
    }

    positionAttribute.setZ(i, z);
  }

  positionAttribute.needsUpdate = true;
  geometry.computeVertexNormals();
}
