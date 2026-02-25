/**
 * Three.js terrain mesh rendered inside an R3F Canvas.
 * Reads elevation data, exaggeration, and dimension overrides from the Zustand store.
 * Rebuilds full geometry whenever any parameter changes.
 */

import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useMapStore } from '../../store/mapStore';
import { buildTerrainGeometry } from '../../lib/mesh/terrain';
import type { TerrainMeshParams } from '../../lib/mesh/terrain';

export function TerrainMesh() {
  const elevationData = useMapStore((s) => s.elevationData);
  const exaggeration = useMapStore((s) => s.exaggeration);
  const targetWidthMM = useMapStore((s) => s.targetWidthMM);
  const targetDepthMM = useMapStore((s) => s.targetDepthMM);
  const targetHeightMM = useMapStore((s) => s.targetHeightMM);
  const dimensions = useMapStore((s) => s.dimensions);

  const meshRef = useRef<THREE.Mesh>(null);
  const geometryRef = useRef<THREE.BufferGeometry | null>(null);

  useEffect(() => {
    if (!elevationData || !dimensions) return;

    // targetReliefMM: the user's Z height override (base height at exag=1.0).
    // No basePlateThicknessMM subtraction — preview doesn't render a base plate.
    // When targetHeightMM === 0, auto mode — exaggeration controls Z freely.
    const targetReliefMM = targetHeightMM > 0 ? targetHeightMM : 0;

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

    // Always do full rebuild — ensures R3F picks up geometry changes reliably.
    const oldGeometry = geometryRef.current;

    const newGeometry = buildTerrainGeometry(elevationData, params);
    geometryRef.current = newGeometry;

    if (meshRef.current) {
      meshRef.current.geometry = newGeometry;
    }

    if (oldGeometry) {
      oldGeometry.dispose();
    }
  }, [elevationData, exaggeration, targetWidthMM, targetDepthMM, targetHeightMM, dimensions]);

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
