/**
 * Web Worker for off-thread road and building geometry computation.
 *
 * Receives serializable data (features, bbox, elevation grid, params),
 * internally builds terrain geometry + BVH raycaster, runs the heavy
 * geometry functions, then transfers resulting typed arrays back to the
 * main thread as Transferable objects (zero-copy).
 */

import * as THREE from 'three';
import { buildTerrainGeometry, smoothElevations } from '../lib/mesh/terrain';
import { buildRoadGeometry } from '../lib/roads/roadMesh';
import { buildAllBuildings } from '../lib/buildings/merge';
import { applyWaterDepressions } from '../lib/water/depression';
import type { TerrainMeshParams } from '../lib/mesh/terrain';
import type { RoadGeometryParams } from '../lib/roads/types';
import type { BuildingGeometryParams } from '../lib/buildings/types';
import type { WaterFeature } from '../lib/water/types';
import type { ElevationData, BoundingBox } from '../types/geo';

// ─── Message types ─────────────────────────────────────────────────────────

interface BuildRoadsMessage {
  id: number;
  type: 'buildRoads';
  features: import('../lib/roads/types').RoadFeature[];
  bbox: BoundingBox;
  elevData: {
    elevations: Float32Array;
    gridSize: number;
    minElevation: number;
    maxElevation: number;
  };
  terrainParams: TerrainMeshParams;
  roadParams: Omit<RoadGeometryParams, 'terrainGeometry'>;
  smoothingLevel: number;
  waterFeatures?: WaterFeature[];
  waterVisible?: boolean;
}

interface BuildBuildingsMessage {
  id: number;
  type: 'buildBuildings';
  features: import('../lib/buildings/types').BuildingFeature[];
  bbox: BoundingBox;
  elevData: {
    elevations: Float32Array;
    gridSize: number;
    minElevation: number;
    maxElevation: number;
  };
  terrainParams: TerrainMeshParams;
  buildingParams: Omit<BuildingGeometryParams, 'terrainGeometry'>;
  smoothingLevel: number;
  waterFeatures?: WaterFeature[];
  waterVisible?: boolean;
}

type WorkerMessage = BuildRoadsMessage | BuildBuildingsMessage;

interface ResultMessage {
  id: number;
  type: 'result';
  positions: Float32Array | null;
  normals: Float32Array | null;
  index: Uint32Array | null;
}

interface ErrorMessage {
  id: number;
  type: 'error';
  message: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function extractArrays(geometry: THREE.BufferGeometry | null): {
  positions: Float32Array | null;
  normals: Float32Array | null;
  index: Uint32Array | null;
} {
  if (!geometry) return { positions: null, normals: null, index: null };

  const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
  const normalAttr = geometry.getAttribute('normal') as THREE.BufferAttribute | null;
  const indexAttr = geometry.index;

  // Copy arrays so we own the buffers for transfer
  const positions = new Float32Array(posAttr.array as Float32Array);
  const normals = normalAttr
    ? new Float32Array(normalAttr.array as Float32Array)
    : null;
  const index = indexAttr
    ? new Uint32Array(indexAttr.array as Uint32Array)
    : null;

  geometry.dispose();
  return { positions, normals, index };
}

function reconstructElevData(data: BuildRoadsMessage['elevData']): ElevationData {
  return {
    elevations: data.elevations,
    gridSize: data.gridSize,
    minElevation: data.minElevation,
    maxElevation: data.maxElevation,
  };
}

// ─── Message handler ───────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;

  try {
    // Reconstruct elevation data
    const elevData = reconstructElevData(msg.elevData);

    // Apply caller-side smoothing before building terrain for BVH raycasting.
    // Since Phase 7, buildTerrainGeometry no longer smooths internally —
    // smoothing must be applied here so road/building raycasters hit the
    // same smoothed surface the user sees in the preview.
    const radius = Math.round((msg.smoothingLevel / 100) * 8);
    const smoothedElevData: ElevationData = radius > 0
      ? { ...elevData, elevations: smoothElevations(elevData.elevations, elevData.gridSize, radius) }
      : elevData;

    // Apply water depressions to match the visible terrain in TerrainMesh.tsx.
    // Without this, buildTerrainGeometry recomputes min/max from its input —
    // depressions push min down, shifting the entire Z coordinate system.
    // Roads/buildings raycasted against a non-depressed terrain sit below
    // the visible (depressed) terrain surface.
    const hasWater = Boolean(msg.waterFeatures && msg.waterFeatures.length > 0 && msg.waterVisible);
    const effectiveElevData: ElevationData = hasWater
      ? applyWaterDepressions(smoothedElevData, msg.waterFeatures!, msg.bbox)
      : smoothedElevData;

    // Build terrain geometry for BVH raycasting (from smoothed + depressed data)
    const terrainGeo = buildTerrainGeometry(effectiveElevData, msg.terrainParams);

    let result: THREE.BufferGeometry | null = null;

    if (msg.type === 'buildRoads') {
      const params: RoadGeometryParams = {
        ...msg.roadParams,
        terrainGeometry: terrainGeo,
      };
      result = buildRoadGeometry(msg.features, msg.bbox, effectiveElevData, params);
    } else if (msg.type === 'buildBuildings') {
      const params: BuildingGeometryParams = {
        ...msg.buildingParams,
        terrainGeometry: terrainGeo,
      };
      result = buildAllBuildings(msg.features, msg.bbox, effectiveElevData, params);
    }

    terrainGeo.dispose();

    const { positions, normals, index } = extractArrays(result);

    const response: ResultMessage = {
      id: msg.id,
      type: 'result',
      positions,
      normals,
      index,
    };

    // Transfer ownership of typed arrays (zero-copy)
    const transfers: Transferable[] = [];
    if (positions) transfers.push(positions.buffer);
    if (normals) transfers.push(normals.buffer);
    if (index) transfers.push(index.buffer);

    (self as unknown as Worker).postMessage(response, transfers);
  } catch (err) {
    const response: ErrorMessage = {
      id: msg.id,
      type: 'error',
      message: err instanceof Error ? err.message : 'Worker error',
    };
    (self as unknown as Worker).postMessage(response);
  }
};
