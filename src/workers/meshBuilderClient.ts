/**
 * Main-thread client for the meshBuilder Web Worker.
 *
 * Provides async APIs for building road and building geometry off-thread.
 * Uses sequence IDs to reject stale results (e.g., from a previous
 * slider position) without terminating the worker.
 */

import type { TerrainMeshParams } from '../lib/mesh/terrain';
import type { RoadGeometryParams, RoadFeature } from '../lib/roads/types';
import type { BuildingGeometryParams, BuildingFeature } from '../lib/buildings/types';
import type { WaterFeature } from '../lib/water/types';
import type { ElevationData, BoundingBox } from '../types/geo';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface MeshArrays {
  positions: Float32Array;
  normals: Float32Array | null;
  index: Uint32Array | null;
}

interface PendingRequest {
  resolve: (value: MeshArrays | null) => void;
  reject: (reason: Error) => void;
}

// ─── Worker singleton ──────────────────────────────────────────────────────

let worker: Worker | null = null;
const pending = new Map<number, PendingRequest>();

/** Monotonic sequence counter for stale-result rejection. */
let roadSeqId = 0;
let buildingSeqId = 0;
let nextRequestId = 0;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(
      new URL('./meshBuilder.worker.ts', import.meta.url),
      { type: 'module' }
    );
    worker.onmessage = (e: MessageEvent) => {
      const { id, type } = e.data;
      const req = pending.get(id);
      if (!req) return; // stale or unknown
      pending.delete(id);

      if (type === 'error') {
        req.reject(new Error(e.data.message));
      } else {
        const { positions, normals, index } = e.data;
        if (positions) {
          req.resolve({ positions, normals, index });
        } else {
          req.resolve(null);
        }
      }
    };
    worker.onerror = (e) => {
      // Reject all pending requests
      for (const [id, req] of pending) {
        req.reject(new Error(e.message ?? 'Worker error'));
        pending.delete(id);
      }
    };
  }
  return worker;
}

function serializeElevData(elevData: ElevationData) {
  return {
    elevations: elevData.elevations,
    gridSize: elevData.gridSize,
    minElevation: elevData.minElevation,
    maxElevation: elevData.maxElevation,
  };
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Build road geometry in the worker. Returns transferable arrays or null.
 * Automatically rejects stale results from previous calls.
 */
export function buildRoadsInWorker(
  features: RoadFeature[],
  bbox: BoundingBox,
  elevData: ElevationData,
  terrainParams: TerrainMeshParams,
  roadParams: Omit<RoadGeometryParams, 'terrainGeometry'>,
  smoothingLevel = 25,
  waterFeatures?: WaterFeature[] | null,
  waterVisible?: boolean
): { promise: Promise<MeshArrays | null>; seqId: number } {
  const seqId = ++roadSeqId;
  const id = nextRequestId++;
  const w = getWorker();

  const promise = new Promise<MeshArrays | null>((resolve, reject) => {
    pending.set(id, { resolve, reject });

    w.postMessage({
      id,
      type: 'buildRoads',
      features,
      bbox,
      elevData: serializeElevData(elevData),
      terrainParams,
      roadParams,
      smoothingLevel,
      waterFeatures: waterFeatures ?? undefined,
      waterVisible: waterVisible ?? false,
    });
  });

  return { promise, seqId };
}

/** Returns the current road sequence ID for stale-check comparison. */
export function getRoadSeqId(): number {
  return roadSeqId;
}

/**
 * Build building geometry in the worker. Returns transferable arrays or null.
 * Automatically rejects stale results from previous calls.
 */
export function buildBuildingsInWorker(
  features: BuildingFeature[],
  bbox: BoundingBox,
  elevData: ElevationData,
  terrainParams: TerrainMeshParams,
  buildingParams: Omit<BuildingGeometryParams, 'terrainGeometry'>,
  smoothingLevel = 25,
  waterFeatures?: WaterFeature[] | null,
  waterVisible?: boolean
): { promise: Promise<MeshArrays | null>; seqId: number } {
  const seqId = ++buildingSeqId;
  const id = nextRequestId++;
  const w = getWorker();

  const promise = new Promise<MeshArrays | null>((resolve, reject) => {
    pending.set(id, { resolve, reject });

    w.postMessage({
      id,
      type: 'buildBuildings',
      features,
      bbox,
      elevData: serializeElevData(elevData),
      terrainParams,
      buildingParams,
      smoothingLevel,
      waterFeatures: waterFeatures ?? undefined,
      waterVisible: waterVisible ?? false,
    });
  });

  return { promise, seqId };
}

/** Returns the current building sequence ID for stale-check comparison. */
export function getBuildingSeqId(): number {
  return buildingSeqId;
}

/**
 * Build road geometry in the worker for export. Unlike buildRoadsInWorker,
 * this does not use stale-result rejection (export has no concurrent calls).
 */
export function buildRoadsForExport(
  features: RoadFeature[],
  bbox: BoundingBox,
  elevData: ElevationData,
  terrainParams: TerrainMeshParams,
  roadParams: Omit<RoadGeometryParams, 'terrainGeometry'>,
  smoothingLevel = 25,
  waterFeatures?: WaterFeature[] | null,
  waterVisible?: boolean
): Promise<MeshArrays | null> {
  const id = nextRequestId++;
  const w = getWorker();

  return new Promise<MeshArrays | null>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({
      id,
      type: 'buildRoads',
      features,
      bbox,
      elevData: serializeElevData(elevData),
      terrainParams,
      roadParams,
      smoothingLevel,
      waterFeatures: waterFeatures ?? undefined,
      waterVisible: waterVisible ?? false,
    });
  });
}

/**
 * Build building geometry in the worker for export.
 * Unlike buildBuildingsInWorker, this does not use stale-result rejection
 * (export has no concurrent calls).
 */
export function buildBuildingsForExport(
  features: BuildingFeature[],
  bbox: BoundingBox,
  elevData: ElevationData,
  terrainParams: TerrainMeshParams,
  buildingParams: Omit<BuildingGeometryParams, 'terrainGeometry'>,
  smoothingLevel = 25,
  waterFeatures?: WaterFeature[] | null,
  waterVisible?: boolean
): Promise<MeshArrays | null> {
  const id = nextRequestId++;
  const w = getWorker();

  return new Promise<MeshArrays | null>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({
      id,
      type: 'buildBuildings',
      features,
      bbox,
      elevData: serializeElevData(elevData),
      terrainParams,
      buildingParams,
      smoothingLevel,
      waterFeatures: waterFeatures ?? undefined,
      waterVisible: waterVisible ?? false,
    });
  });
}
