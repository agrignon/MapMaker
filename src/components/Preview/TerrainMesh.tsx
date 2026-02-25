/**
 * Three.js terrain mesh rendered inside an R3F Canvas.
 * Reads elevation data and exaggeration from the Zustand store.
 * Calls buildTerrainGeometry on initial load or when elevation data changes,
 * and updateTerrainElevation in-place when only exaggeration changes.
 */

import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useMapStore } from '../../store/mapStore';
import { buildTerrainGeometry, updateTerrainElevation } from '../../lib/mesh/terrain';
import type { TerrainMeshParams } from '../../lib/mesh/terrain';
import type { ElevationData } from '../../types/geo';

export function TerrainMesh() {
  const elevationData = useMapStore((s) => s.elevationData);
  const exaggeration = useMapStore((s) => s.exaggeration);
  const targetWidthMM = useMapStore((s) => s.targetWidthMM);
  const targetDepthMM = useMapStore((s) => s.targetDepthMM);
  const basePlateThicknessMM = useMapStore((s) => s.basePlateThicknessMM);
  const targetHeightMM = useMapStore((s) => s.targetHeightMM);
  const dimensions = useMapStore((s) => s.dimensions);

  const meshRef = useRef<THREE.Mesh>(null);
  const geometryRef = useRef<THREE.BufferGeometry | null>(null);
  const lastElevationRef = useRef<ElevationData | null>(null);
  const lastParamsRef = useRef<TerrainMeshParams | null>(null);

  useEffect(() => {
    if (!elevationData || !dimensions) return;

    // Compute targetReliefMM: total Z override minus base plate thickness.
    // When targetHeightMM === 0, auto mode — no override.
    const targetReliefMM = targetHeightMM > 0
      ? Math.max(1, targetHeightMM - basePlateThicknessMM)
      : 0;

    const params: TerrainMeshParams = {
      widthMM: targetWidthMM,
      depthMM: targetDepthMM,
      geographicWidthM: dimensions.widthM,
      geographicDepthM: dimensions.heightM,
      exaggeration,
      minHeightMM: 5,
      maxError: 5,
      targetReliefMM,
    };

    const elevationChanged = elevationData !== lastElevationRef.current;

    if (elevationChanged) {
      // Full rebuild — elevation data changed
      const oldGeometry = geometryRef.current;

      const newGeometry = buildTerrainGeometry(elevationData, params);
      geometryRef.current = newGeometry;
      lastElevationRef.current = elevationData;
      lastParamsRef.current = params;

      if (meshRef.current) {
        meshRef.current.geometry = newGeometry;
      }

      // Dispose old geometry to free GPU memory
      if (oldGeometry) {
        oldGeometry.dispose();
      }
    } else if (geometryRef.current && lastParamsRef.current) {
      // In-place Z update — only exaggeration or target dimensions changed
      updateTerrainElevation(geometryRef.current, elevationData, params);
      lastParamsRef.current = params;
    }
  }, [elevationData, exaggeration, targetWidthMM, targetDepthMM, basePlateThicknessMM, targetHeightMM, dimensions]);

  // Cleanup geometry on unmount
  useEffect(() => {
    return () => {
      if (geometryRef.current) {
        geometryRef.current.dispose();
        geometryRef.current = null;
      }
    };
  }, []);

  if (!elevationData || !dimensions) return null;

  return (
    <mesh ref={meshRef}>
      <meshStandardMaterial vertexColors side={THREE.DoubleSide} />
    </mesh>
  );
}
