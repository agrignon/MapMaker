/**
 * Three.js road mesh rendered inside an R3F Canvas.
 *
 * Reads roadFeatures and elevationData from the Zustand store.
 * Calls buildRoadGeometry() when features, elevation, or road style change,
 * and rebuilds when exaggeration changes (road Z depends on terrain zScale).
 *
 * Roads are clipped at the terrain edges using four Three.js clipping planes
 * so that edge roads are sliced cleanly rather than overhanging.
 */

import { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useMapStore } from '../../store/mapStore';
import { buildRoadGeometry, ROAD_COLOR } from '../../lib/roads/roadMesh';
import { wgs84ToUTM } from '../../lib/utm';
import type { RoadGeometryParams } from '../../lib/roads/types';

export function RoadMesh() {
  const roadFeatures = useMapStore((s) => s.roadFeatures);
  const roadGenerationStatus = useMapStore((s) => s.roadGenerationStatus);
  const roadsVisible = useMapStore((s) => s.layerToggles.roads);
  const roadStyle = useMapStore((s) => s.roadStyle);
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

  // Clipping planes at terrain edges — slice roads cleanly at the model boundary
  const clippingPlanes = useMemo(() => [
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), targetWidthMM / 2),  // +X edge
    new THREE.Plane(new THREE.Vector3(1, 0, 0), targetWidthMM / 2),   // -X edge
    new THREE.Plane(new THREE.Vector3(0, -1, 0), targetDepthMM / 2),  // +Y edge
    new THREE.Plane(new THREE.Vector3(0, 1, 0), targetDepthMM / 2),   // -Y edge
  ], [targetWidthMM, targetDepthMM]);

  useEffect(() => {
    // Only build when we have all required data and roads are ready
    if (
      !roadFeatures ||
      roadFeatures.length === 0 ||
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

    // targetReliefMM: must match TerrainMesh.tsx and BuildingMesh.tsx formula exactly.
    // No basePlateThicknessMM subtraction — preview doesn't render a base plate.
    const targetReliefMM = targetHeightMM > 0 ? targetHeightMM : 0;

    const params: RoadGeometryParams = {
      widthMM: targetWidthMM,
      depthMM: targetDepthMM,
      geographicWidthM: dimensions.widthM,
      geographicDepthM: dimensions.heightM,
      exaggeration,
      minElevationM: elevationData.minElevation,
      bboxCenterUTM: { x: centerUTM.x, y: centerUTM.y },
      roadStyle,
      targetReliefMM,
    };

    // Dispose previous geometry before building new one
    const oldGeometry = geometryRef.current;

    const newGeometry = buildRoadGeometry(roadFeatures, bbox, elevationData, params);

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
    roadFeatures,
    roadStyle,
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

  // Only render when roads are ready
  if (roadGenerationStatus !== 'ready') return null;
  if (!roadFeatures || roadFeatures.length === 0) return null;

  // Lift road mesh slightly above terrain to prevent Z-fighting.
  // Recessed roads have their top face at exact terrain Z — without this offset
  // the terrain mesh occludes them entirely. The 0.1mm lift + polygonOffset
  // ensures roads are always visible in the preview for all style modes.
  return (
    <mesh ref={meshRef} visible={roadsVisible} position={[0, 0, 0.1]}>
      <meshStandardMaterial
        color={ROAD_COLOR}
        side={THREE.DoubleSide}
        clippingPlanes={clippingPlanes}
        polygonOffset
        polygonOffsetFactor={-4}
        polygonOffsetUnits={-4}
      />
    </mesh>
  );
}
