/**
 * Three.js building mesh rendered inside an R3F Canvas.
 *
 * Reads buildingFeatures and elevationData from the Zustand store.
 * Calls buildAllBuildings() when features or elevation change,
 * and rebuilds when exaggeration changes (building Z depends on terrain zScale).
 *
 * Buildings are clipped at the terrain edges using Four Three.js clipping planes
 * so that edge buildings are sliced cleanly rather than overhanging.
 */

import { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useMapStore } from '../../store/mapStore';
import { buildAllBuildings } from '../../lib/buildings/merge';
import { wgs84ToUTM } from '../../lib/utm';
import type { BuildingGeometryParams } from '../../lib/buildings/types';

export function BuildingMesh() {
  const buildingFeatures = useMapStore((s) => s.buildingFeatures);
  const buildingGenerationStatus = useMapStore((s) => s.buildingGenerationStatus);
  const buildingsVisible = useMapStore((s) => s.layerToggles.buildings);
  const elevationData = useMapStore((s) => s.elevationData);
  const exaggeration = useMapStore((s) => s.exaggeration);
  const targetWidthMM = useMapStore((s) => s.targetWidthMM);
  const targetDepthMM = useMapStore((s) => s.targetDepthMM);
  const basePlateThicknessMM = useMapStore((s) => s.basePlateThicknessMM);
  const targetHeightMM = useMapStore((s) => s.targetHeightMM);
  const dimensions = useMapStore((s) => s.dimensions);
  const bbox = useMapStore((s) => s.bbox);
  const utmZone = useMapStore((s) => s.utmZone);

  const meshRef = useRef<THREE.Mesh>(null);
  const geometryRef = useRef<THREE.BufferGeometry | null>(null);

  // Clipping planes at terrain edges — slice buildings cleanly at the model boundary
  const clippingPlanes = useMemo(() => [
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), targetWidthMM / 2),  // +X edge
    new THREE.Plane(new THREE.Vector3(1, 0, 0), targetWidthMM / 2),   // -X edge
    new THREE.Plane(new THREE.Vector3(0, -1, 0), targetDepthMM / 2),  // +Y edge
    new THREE.Plane(new THREE.Vector3(0, 1, 0), targetDepthMM / 2),   // -Y edge
  ], [targetWidthMM, targetDepthMM]);

  useEffect(() => {
    // Only build when we have all required data and buildings are ready
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

    // Compute bbox center in UTM space for mesh centering
    const centerLon = (bbox.sw.lon + bbox.ne.lon) / 2;
    const centerLat = (bbox.sw.lat + bbox.ne.lat) / 2;
    const centerUTM = wgs84ToUTM(centerLon, centerLat);

    // targetReliefMM: must match TerrainMesh.tsx formula exactly for alignment.
    // No basePlateThicknessMM subtraction — preview doesn't render a base plate.
    const targetReliefMM = targetHeightMM > 0 ? targetHeightMM : 0;

    const params: BuildingGeometryParams = {
      widthMM: targetWidthMM,
      depthMM: targetDepthMM,
      geographicWidthM: dimensions.widthM,
      geographicDepthM: dimensions.heightM,
      utmZone,
      bboxCenterUTM: { x: centerUTM.x, y: centerUTM.y },
      exaggeration,
      minElevationM: elevationData.minElevation,
      targetReliefMM,
    };

    // Dispose previous geometry before building new one
    const oldGeometry = geometryRef.current;

    const newGeometry = buildAllBuildings(buildingFeatures, bbox, elevationData, params);

    if (newGeometry) {
      geometryRef.current = newGeometry;
      if (meshRef.current) {
        meshRef.current.geometry = newGeometry;
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
  }, [
    buildingFeatures,
    elevationData,
    exaggeration,
    targetWidthMM,
    targetDepthMM,
    basePlateThicknessMM,
    targetHeightMM,
    dimensions,
    bbox,
    utmZone,
  ]);

  // Cleanup geometry on unmount
  useEffect(() => {
    return () => {
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
