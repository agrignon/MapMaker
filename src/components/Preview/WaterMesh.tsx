/**
 * Visual water overlay mesh rendered at depression Z level.
 * Preview-only — the STL depression is baked into the terrain via
 * applyWaterDepressions in TerrainMesh.tsx and ExportPanel.tsx.
 *
 * Renders each water polygon as a flat blue triangle mesh using earcut.
 * Hole rings (islands) are correctly excluded via earcut hole indices.
 */

import { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import earcut from 'earcut';
import { useMapStore } from '../../store/mapStore';
import { WATER_DEPRESSION_M, pointInRing } from '../../lib/water/depression';
import { wgs84ToUTM } from '../../lib/utm';

/** Water overlay color — a distinct blue that contrasts with terrain greens/browns */
const WATER_COLOR = '#3b82f6';

export function WaterMesh() {
  const waterFeatures = useMapStore((s) => s.waterFeatures);
  const waterGenerationStatus = useMapStore((s) => s.waterGenerationStatus);
  const waterVisible = useMapStore((s) => s.layerToggles.water);
  const elevationData = useMapStore((s) => s.elevationData);
  const bbox = useMapStore((s) => s.bbox);
  const dimensions = useMapStore((s) => s.dimensions);
  const exaggeration = useMapStore((s) => s.exaggeration);
  const targetWidthMM = useMapStore((s) => s.targetWidthMM);
  const targetDepthMM = useMapStore((s) => s.targetDepthMM);
  const targetHeightMM = useMapStore((s) => s.targetHeightMM);

  const meshRef = useRef<THREE.Mesh>(null);
  const geometryRef = useRef<THREE.BufferGeometry | null>(null);

  // Clipping planes at terrain edges (same as RoadMesh/BuildingMesh)
  const clippingPlanes = useMemo(() => [
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), targetWidthMM / 2),
    new THREE.Plane(new THREE.Vector3(1, 0, 0), targetWidthMM / 2),
    new THREE.Plane(new THREE.Vector3(0, -1, 0), targetDepthMM / 2),
    new THREE.Plane(new THREE.Vector3(0, 1, 0), targetDepthMM / 2),
  ], [targetWidthMM, targetDepthMM]);

  useEffect(() => {
    if (!waterFeatures || waterFeatures.length === 0 || !elevationData || !bbox || !dimensions) return;

    // Compute scaling parameters (same formula as terrain/roads/buildings)
    const horizontalScale = targetWidthMM / dimensions.widthM;
    const elevRange = elevationData.maxElevation - elevationData.minElevation;
    const targetReliefMM = targetHeightMM > 0 ? targetHeightMM : 0;

    let zScale: number;
    if (targetReliefMM > 0 && elevRange > 0) {
      zScale = (targetReliefMM / elevRange) * exaggeration;
    } else if (elevRange > 0) {
      zScale = horizontalScale * exaggeration;
      const naturalHeightMM = elevRange * zScale;
      if (naturalHeightMM < 5) {
        zScale = 5 / elevRange;
      }
    } else {
      zScale = horizontalScale * exaggeration;
    }

    const centerLon = (bbox.sw.lon + bbox.ne.lon) / 2;
    const centerLat = (bbox.sw.lat + bbox.ne.lat) / 2;
    const centerUTM = wgs84ToUTM(centerLon, centerLat);

    // Build flat mesh for each water polygon at depression Z
    const allPositions: number[] = [];
    const allIndices: number[] = [];
    let vertexOffset = 0;

    for (const feature of waterFeatures) {
      // Compute depression Z from shoreline elevations
      // Sample the outer ring to find the minimum shoreline elevation
      const { sw: bboxSw, ne: bboxNe } = bbox;
      const lonRange = bboxNe.lon - bboxSw.lon;
      const latRange = bboxNe.lat - bboxSw.lat;
      const gridSize = elevationData.gridSize;

      // Only sample outer ring vertices that fall inside the grid.
      // Large water bodies extend far beyond the bbox — clamping out-of-bounds
      // vertices to grid edges corrupts shorelineMin and puts the overlay at wrong Z.
      let shorelineMin = Infinity;
      for (const [lon, lat] of feature.outerRing) {
        const gx = ((lon - bboxSw.lon) / lonRange) * (gridSize - 1);
        const gy = (1 - (lat - bboxSw.lat) / latRange) * (gridSize - 1);
        if (gx < 0 || gx > gridSize - 1 || gy < 0 || gy > gridSize - 1) continue;
        const idx = Math.round(gy) * gridSize + Math.round(gx);
        shorelineMin = Math.min(shorelineMin, elevationData.elevations[idx]);
      }

      // Fallback: water body envelops the entire bbox (no outer ring vertices in grid).
      // Sample interior grid cells to find a representative elevation.
      if (shorelineMin === Infinity) {
        for (let sgy = 0; sgy < gridSize; sgy += Math.max(1, gridSize >> 3)) {
          for (let sgx = 0; sgx < gridSize; sgx += Math.max(1, gridSize >> 3)) {
            const slon = bboxSw.lon + (sgx / (gridSize - 1)) * lonRange;
            const slat = bboxNe.lat - (sgy / (gridSize - 1)) * latRange;
            if (pointInRing(slon, slat, feature.outerRing)) {
              shorelineMin = Math.min(shorelineMin, elevationData.elevations[sgy * gridSize + sgx]);
            }
          }
        }
      }

      if (shorelineMin === Infinity) continue; // polygon doesn't intersect grid

      const depressionElevM = shorelineMin - WATER_DEPRESSION_M;
      const depressionZ = (depressionElevM - elevationData.minElevation) * zScale;

      // Flatten outer ring + holes for earcut
      const coords2d: number[] = [];
      const holeIndices: number[] = [];

      // Outer ring — project to model coordinates
      for (const [lon, lat] of feature.outerRing) {
        const utm = wgs84ToUTM(lon, lat);
        const x = (utm.x - centerUTM.x) * horizontalScale;
        const y = (utm.y - centerUTM.y) * horizontalScale;
        coords2d.push(x, y);
      }

      // Hole rings
      for (const hole of feature.holes) {
        holeIndices.push(coords2d.length / 2);
        for (const [lon, lat] of hole) {
          const utm = wgs84ToUTM(lon, lat);
          const x = (utm.x - centerUTM.x) * horizontalScale;
          const y = (utm.y - centerUTM.y) * horizontalScale;
          coords2d.push(x, y);
        }
      }

      // Triangulate with earcut
      const indices = earcut(coords2d, holeIndices.length > 0 ? holeIndices : undefined, 2);

      // Build 3D positions at depression Z
      const numPts = coords2d.length / 2;
      for (let i = 0; i < numPts; i++) {
        allPositions.push(coords2d[i * 2], coords2d[i * 2 + 1], depressionZ);
      }
      for (const idx of indices) {
        allIndices.push(idx + vertexOffset);
      }
      vertexOffset += numPts;
    }

    if (allPositions.length === 0) return;

    const oldGeometry = geometryRef.current;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(allPositions, 3));
    geo.setIndex(allIndices);
    geo.computeVertexNormals();

    geometryRef.current = geo;
    if (meshRef.current) {
      meshRef.current.geometry = geo;
    }
    if (oldGeometry) oldGeometry.dispose();
  }, [waterFeatures, elevationData, exaggeration, targetWidthMM, targetDepthMM, targetHeightMM, dimensions, bbox]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (geometryRef.current) {
        geometryRef.current.dispose();
        geometryRef.current = null;
      }
    };
  }, []);

  if (waterGenerationStatus !== 'ready') return null;
  if (!waterFeatures || waterFeatures.length === 0) return null;

  return (
    <mesh ref={meshRef} visible={waterVisible} position={[0, 0, 0.15]}>
      <meshStandardMaterial
        color={WATER_COLOR}
        side={THREE.DoubleSide}
        clippingPlanes={clippingPlanes}
        polygonOffset
        polygonOffsetFactor={-6}
        polygonOffsetUnits={-6}
        transparent
        opacity={0.85}
      />
    </mesh>
  );
}
