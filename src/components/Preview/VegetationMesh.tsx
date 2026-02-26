/**
 * Visual vegetation overlay mesh rendered as raised green plateau patches.
 * Preview-only — vegetation geometry is merged into the STL via ExportPanel.
 *
 * Renders each vegetation polygon (park/forest) as a flat green triangle mesh
 * at terrain Z + VEGE_HEIGHT_MM, using earcut for triangulation and Chaikin
 * corner-cutting for smooth polygon edges.
 *
 * Sits above terrain and roads but below water (polygonOffsetFactor=-4 vs water's -6).
 */

import { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import earcut from 'earcut';
import { useMapStore } from '../../store/mapStore';
import { smoothElevations } from '../../lib/mesh/terrain';
import { wgs84ToUTM } from '../../lib/utm';
import { VEGE_HEIGHT_MM } from '../../lib/vegetation/elevation';

/** Muted forest green — distinct from terrain browns and water blue */
const VEGE_COLOR = '#4a7c59';

/** Chaikin corner-cutting iterations — smooths angular OSM polygon edges */
const CHAIKIN_ITERATIONS = 3;

/**
 * Chaikin's corner-cutting algorithm: replaces each edge with two points at
 * 25% and 75%, producing a smooth curve after a few iterations. The ring
 * is kept closed (first === last).
 */
function smoothRing(ring: [number, number][], iterations: number): [number, number][] {
  let pts = ring;
  for (let iter = 0; iter < iterations; iter++) {
    const next: [number, number][] = [];
    // Closed ring: last point === first, iterate up to length - 1
    const n = pts.length - 1; // exclude closing duplicate
    for (let i = 0; i < n; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % n];
      next.push([x0 * 0.75 + x1 * 0.25, y0 * 0.75 + y1 * 0.25]);
      next.push([x0 * 0.25 + x1 * 0.75, y0 * 0.25 + y1 * 0.75]);
    }
    next.push(next[0]); // close the ring
    pts = next;
  }
  return pts;
}

export function VegetationMesh() {
  const vegetationFeatures = useMapStore((s) => s.vegetationFeatures);
  const vegetationGenerationStatus = useMapStore((s) => s.vegetationGenerationStatus);
  const vegetationVisible = useMapStore((s) => s.layerToggles.vegetation);
  const elevationData = useMapStore((s) => s.elevationData);
  const bbox = useMapStore((s) => s.bbox);
  const dimensions = useMapStore((s) => s.dimensions);
  const exaggeration = useMapStore((s) => s.exaggeration);
  const targetWidthMM = useMapStore((s) => s.targetWidthMM);
  const targetDepthMM = useMapStore((s) => s.targetDepthMM);
  const targetHeightMM = useMapStore((s) => s.targetHeightMM);
  const smoothingLevel = useMapStore((s) => s.smoothingLevel);

  const meshRef = useRef<THREE.Mesh>(null);
  const geometryRef = useRef<THREE.BufferGeometry | null>(null);

  // Clipping planes at terrain edges (same as RoadMesh/BuildingMesh/WaterMesh)
  const clippingPlanes = useMemo(() => [
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), targetWidthMM / 2),
    new THREE.Plane(new THREE.Vector3(1, 0, 0), targetWidthMM / 2),
    new THREE.Plane(new THREE.Vector3(0, -1, 0), targetDepthMM / 2),
    new THREE.Plane(new THREE.Vector3(0, 1, 0), targetDepthMM / 2),
  ], [targetWidthMM, targetDepthMM]);

  useEffect(() => {
    if (!vegetationFeatures || vegetationFeatures.length === 0 || !elevationData || !bbox || !dimensions) return;

    // Apply caller-side smoothing to match TerrainMesh elevation grid
    // Ensures vegetation Z aligns with the smoothed terrain surface
    const radius = Math.round((smoothingLevel / 100) * 8);
    const smoothedElevations = radius > 0
      ? smoothElevations(elevationData.elevations, elevationData.gridSize, radius)
      : elevationData.elevations;

    // Compute scaling parameters (same formula as terrain/roads/buildings/water)
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

    const { sw: bboxSw, ne: bboxNe } = bbox;
    const lonRange = bboxNe.lon - bboxSw.lon;
    const latRange = bboxNe.lat - bboxSw.lat;
    const gridSize = elevationData.gridSize;

    // Helper: sample smoothed elevation grid at a lon/lat and return Z in model space
    const elevMin = elevationData.minElevation;
    const sampleZ = (lon: number, lat: number): number => {
      const gx = Math.max(0, Math.min(gridSize - 1, Math.round(((lon - bboxSw.lon) / lonRange) * (gridSize - 1))));
      const gy = Math.max(0, Math.min(gridSize - 1, Math.round((1 - (lat - bboxSw.lat) / latRange) * (gridSize - 1))));
      const elev = smoothedElevations[gy * gridSize + gx];
      return (elev - elevMin) * zScale + VEGE_HEIGHT_MM;
    };

    // Build terrain-following vegetation geometry for each polygon
    const allPositions: number[] = [];
    const allIndices: number[] = [];
    let vertexOffset = 0;

    for (const feature of vegetationFeatures) {
      // Smooth polygon edges with Chaikin corner-cutting before projection
      const smoothedOuter = smoothRing(feature.outerRing, CHAIKIN_ITERATIONS);
      const smoothedHoles = feature.holes.map(h => smoothRing(h, CHAIKIN_ITERATIONS));

      // Flatten outer ring + holes for earcut, computing per-vertex Z from terrain
      const coords2d: number[] = [];
      const vertexZs: number[] = [];
      const holeIndices: number[] = [];

      // Outer ring — project to model coordinates with per-vertex terrain Z
      for (const [lon, lat] of smoothedOuter) {
        const utm = wgs84ToUTM(lon, lat);
        coords2d.push(
          (utm.x - centerUTM.x) * horizontalScale,
          (utm.y - centerUTM.y) * horizontalScale
        );
        vertexZs.push(sampleZ(lon, lat));
      }

      // Hole rings
      for (const hole of smoothedHoles) {
        holeIndices.push(coords2d.length / 2);
        for (const [lon, lat] of hole) {
          const utm = wgs84ToUTM(lon, lat);
          coords2d.push(
            (utm.x - centerUTM.x) * horizontalScale,
            (utm.y - centerUTM.y) * horizontalScale
          );
          vertexZs.push(sampleZ(lon, lat));
        }
      }

      // Triangulate with earcut
      const indices = earcut(coords2d, holeIndices.length > 0 ? holeIndices : undefined, 2);

      // Build 3D positions with per-vertex Z (terrain-following)
      const numPts = coords2d.length / 2;
      for (let i = 0; i < numPts; i++) {
        allPositions.push(coords2d[i * 2], coords2d[i * 2 + 1], vertexZs[i]);
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
  }, [vegetationFeatures, elevationData, exaggeration, targetWidthMM, targetDepthMM, targetHeightMM, dimensions, bbox, smoothingLevel]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (geometryRef.current) {
        geometryRef.current.dispose();
        geometryRef.current = null;
      }
    };
  }, []);

  if (vegetationGenerationStatus !== 'ready') return null;
  if (!vegetationFeatures || vegetationFeatures.length === 0) return null;

  return (
    <mesh ref={meshRef} visible={vegetationVisible} position={[0, 0, 0.08]}>
      <meshStandardMaterial
        color={VEGE_COLOR}
        side={THREE.DoubleSide}
        clippingPlanes={clippingPlanes}
        polygonOffset
        polygonOffsetFactor={-4}
        polygonOffsetUnits={-4}
        transparent
        opacity={0.9}
      />
    </mesh>
  );
}
