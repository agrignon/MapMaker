/**
 * Three.js building mesh rendered inside an R3F Canvas.
 *
 * Reads buildingFeatures and elevationData from the Zustand store.
 * Builds building geometry off-thread via a Web Worker when features
 * or elevation change. Rebuilds when exaggeration changes (building Z
 * depends on terrain zScale).
 *
 * Rebuilds are debounced (250ms) so dragging the exaggeration slider doesn't
 * queue excessive worker requests. Progress is reported via the store's
 * rebuildingLayers field.
 *
 * Buildings are clipped at the terrain edges using four Three.js clipping planes
 * so that edge buildings are sliced cleanly rather than overhanging.
 */

import { useRef, useEffect, useMemo, useCallback } from 'react';
import * as THREE from 'three';
import { useMapStore } from '../../store/mapStore';
import { buildBuildingsInWorker, getBuildingSeqId } from '../../workers/meshBuilderClient';
import type { TerrainMeshParams } from '../../lib/mesh/terrain';
import { wgs84ToUTM } from '../../lib/utm';

/** Debounce delay in ms — prevents expensive rebuilds while slider is being dragged. */
const REBUILD_DEBOUNCE_MS = 250;

export function BuildingMesh() {
  const buildingFeatures = useMapStore((s) => s.buildingFeatures);
  const buildingGenerationStatus = useMapStore((s) => s.buildingGenerationStatus);
  const buildingsVisible = useMapStore((s) => s.layerToggles.buildings);
  const elevationData = useMapStore((s) => s.elevationData);
  const exaggeration = useMapStore((s) => s.exaggeration);
  const smoothingLevel = useMapStore((s) => s.smoothingLevel);
  const targetWidthMM = useMapStore((s) => s.targetWidthMM);
  const targetDepthMM = useMapStore((s) => s.targetDepthMM);
  const targetHeightMM = useMapStore((s) => s.targetHeightMM);
  const dimensions = useMapStore((s) => s.dimensions);
  const bbox = useMapStore((s) => s.bbox);
  const utmZone = useMapStore((s) => s.utmZone);
  const setRebuildingLayers = useMapStore((s) => s.setRebuildingLayers);

  const meshRef = useRef<THREE.Mesh>(null);
  const geometryRef = useRef<THREE.BufferGeometry | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  // Clipping planes at terrain edges — slice buildings cleanly at the model boundary
  const clippingPlanes = useMemo(() => [
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), targetWidthMM / 2),  // +X edge
    new THREE.Plane(new THREE.Vector3(1, 0, 0), targetWidthMM / 2),   // -X edge
    new THREE.Plane(new THREE.Vector3(0, -1, 0), targetDepthMM / 2),  // +Y edge
    new THREE.Plane(new THREE.Vector3(0, 1, 0), targetDepthMM / 2),   // -Y edge
  ], [targetWidthMM, targetDepthMM]);

  const doRebuild = useCallback(async () => {
    if (
      !buildingFeatures ||
      buildingFeatures.length === 0 ||
      !elevationData ||
      !bbox ||
      !dimensions ||
      !utmZone
    ) {
      return;
    }

    setRebuildingLayers('Rebuilding buildings...');

    // Compute bbox center in UTM space for mesh centering
    const centerLon = (bbox.sw.lon + bbox.ne.lon) / 2;
    const centerLat = (bbox.sw.lat + bbox.ne.lat) / 2;
    const centerUTM = wgs84ToUTM(centerLon, centerLat);

    const targetReliefMM = targetHeightMM > 0 ? targetHeightMM : 0;

    const terrainParams: TerrainMeshParams = {
      widthMM: targetWidthMM,
      depthMM: targetDepthMM,
      geographicWidthM: dimensions.widthM,
      geographicDepthM: dimensions.heightM,
      exaggeration,
      minHeightMM: 5,
      maxError: 5,
      targetReliefMM,
    };

    const { promise, seqId } = buildBuildingsInWorker(
      buildingFeatures,
      bbox,
      elevationData,
      terrainParams,
      {
        widthMM: targetWidthMM,
        depthMM: targetDepthMM,
        geographicWidthM: dimensions.widthM,
        geographicDepthM: dimensions.heightM,
        utmZone,
        bboxCenterUTM: { x: centerUTM.x, y: centerUTM.y },
        exaggeration,
        minElevationM: elevationData.minElevation,
        targetReliefMM,
      },
      smoothingLevel
    );
    seqRef.current = seqId;

    try {
      const arrays = await promise;

      // Reject stale result — a newer request was dispatched while we waited
      if (seqId !== getBuildingSeqId()) return;

      const oldGeometry = geometryRef.current;

      if (arrays) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(arrays.positions, 3));
        if (arrays.normals) {
          geo.setAttribute('normal', new THREE.BufferAttribute(arrays.normals, 3));
        }
        if (arrays.index) {
          geo.setIndex(new THREE.BufferAttribute(arrays.index, 1));
        }
        if (!arrays.normals) {
          geo.computeVertexNormals();
        }

        geometryRef.current = geo;
        if (meshRef.current) {
          meshRef.current.geometry = geo;
        }
      } else {
        geometryRef.current = null;
        if (meshRef.current) {
          meshRef.current.geometry = new THREE.BufferGeometry();
        }
      }

      if (oldGeometry) {
        oldGeometry.dispose();
      }
    } catch {
      // Worker error — leave current geometry in place
    }

    // Only clear status if this is still the latest request
    if (seqId === getBuildingSeqId()) {
      setRebuildingLayers(null);
    }
  }, [
    buildingFeatures,
    elevationData,
    exaggeration,
    smoothingLevel,
    targetWidthMM,
    targetDepthMM,
    targetHeightMM,
    dimensions,
    bbox,
    utmZone,
    setRebuildingLayers,
  ]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    // Debounce: wait for params to stabilize before starting worker request
    debounceRef.current = setTimeout(() => {
      doRebuild();
    }, REBUILD_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [doRebuild]);

  // Cleanup geometry on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (geometryRef.current) {
        geometryRef.current.dispose();
        geometryRef.current = null;
      }
    };
  }, []);

  // Only render when buildings are ready
  if (buildingGenerationStatus !== 'ready') return null;
  if (!buildingFeatures || buildingFeatures.length === 0) return null;

  return (
    <mesh ref={meshRef} visible={buildingsVisible}>
      <meshStandardMaterial
        color="#c0c0c0"
        side={THREE.DoubleSide}
        clippingPlanes={clippingPlanes}
      />
    </mesh>
  );
}
