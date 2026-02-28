/**
 * Export panel for the 3D preview sidebar.
 * Provides: Export STL button, labeled progress bar, download dialog.
 * Dimension inputs have been migrated to ModelSizeSection.
 *
 * Placed inside PreviewSidebar, below layer sections.
 * Export is gated: only enabled when terrain is generated (generationStatus === 'ready').
 */

import { useRef, useState } from 'react';
import * as THREE from 'three';
import { useMapStore } from '../../store/mapStore';
import { buildTerrainGeometry, smoothElevations } from '../../lib/mesh/terrain';
import { buildSolidMesh } from '../../lib/mesh/solid';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { validateMesh } from '../../lib/export/validate';
import { exportToSTL, downloadSTL, generateFilename } from '../../lib/export/stlExport';
import { buildBuildingsForExport, buildRoadsForExport } from '../../workers/meshBuilderClient';
import type { MeshArrays } from '../../workers/meshBuilderClient';
import { clipGeometryToFootprint } from '../../lib/export/clipGeometry';
import { wgs84ToUTM } from '../../lib/utm';
import { applyWaterDepressions } from '../../lib/water/depression';
import { VEGE_HEIGHT_MM } from '../../lib/vegetation/elevation';
import earcut from 'earcut';
import type { BuildingGeometryParams } from '../../lib/buildings/types';
import type { RoadGeometryParams } from '../../lib/roads/types';

// Module-level buffer storage — ArrayBuffer is not serializable to Zustand
// This holds the last exported buffer for the Download button
const exportBufferRef: { current: ArrayBuffer | null } = { current: null };

/**
 * Merge two geometries as separate watertight shells (no CSG boolean).
 * Strips to position+normal only, converts to non-indexed triangle soup.
 * Slicers (PrusaSlicer, Bambu Studio) compute boolean union automatically.
 */
function mergeShells(
  base: THREE.BufferGeometry,
  feature: THREE.BufferGeometry
): THREE.BufferGeometry {
  const baseNI = base.index ? base.toNonIndexed() : base.clone();
  const featureNI = feature.index ? feature.toNonIndexed() : feature.clone();

  for (const name of Object.keys(baseNI.attributes)) {
    if (name !== 'position' && name !== 'normal') baseNI.deleteAttribute(name);
  }
  for (const name of Object.keys(featureNI.attributes)) {
    if (name !== 'position' && name !== 'normal') featureNI.deleteAttribute(name);
  }

  if (!baseNI.getAttribute('normal')) baseNI.computeVertexNormals();
  if (!featureNI.getAttribute('normal')) featureNI.computeVertexNormals();

  const merged = mergeGeometries([baseNI, featureNI], false);
  baseNI.dispose();
  featureNI.dispose();

  if (!merged) throw new Error('mergeShells: mergeGeometries returned null');
  merged.computeVertexNormals();
  return merged;
}

/**
 * Reconstruct a THREE.BufferGeometry from the typed arrays returned by the worker.
 * Needed because the export pipeline works with BufferGeometry for clipping,
 * merging, and STL write.
 */
function meshArraysToGeometry(arrays: MeshArrays): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(arrays.positions, 3));
  if (arrays.normals) {
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(arrays.normals, 3));
  }
  if (arrays.index) {
    geo.setIndex(new THREE.BufferAttribute(arrays.index, 1));
  }
  if (!arrays.normals) {
    geo.computeVertexNormals();
  }
  return geo;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

export function ExportPanel() {
  const generationStatus = useMapStore((s) => s.generationStatus);
  const elevationData = useMapStore((s) => s.elevationData);
  const exaggeration = useMapStore((s) => s.exaggeration);
  const basePlateThicknessMM = useMapStore((s) => s.basePlateThicknessMM);
  const targetWidthMM = useMapStore((s) => s.targetWidthMM);
  const targetDepthMM = useMapStore((s) => s.targetDepthMM);
  const targetHeightMM = useMapStore((s) => s.targetHeightMM);
  const dimensions = useMapStore((s) => s.dimensions);
  const bbox = useMapStore((s) => s.bbox);
  const utmZone = useMapStore((s) => s.utmZone);
  const locationName = useMapStore((s) => s.locationName);
  const exportStatus = useMapStore((s) => s.exportStatus);
  const exportStep = useMapStore((s) => s.exportStep);
  const exportResult = useMapStore((s) => s.exportResult);
  const buildingFeatures = useMapStore((s) => s.buildingFeatures);
  const buildingsVisible = useMapStore((s) => s.layerToggles.buildings);
  const roadFeatures = useMapStore((s) => s.roadFeatures);
  const roadsVisible = useMapStore((s) => s.layerToggles.roads);
  const waterFeatures = useMapStore((s) => s.waterFeatures);
  const waterVisible = useMapStore((s) => s.layerToggles.water);
  const vegetationFeatures = useMapStore((s) => s.vegetationFeatures);
  const vegetationVisible = useMapStore((s) => s.layerToggles.vegetation);
  const smoothingLevel = useMapStore((s) => s.smoothingLevel);

  const setExportStatus = useMapStore((s) => s.setExportStatus);
  const setExportResult = useMapStore((s) => s.setExportResult);

  // Error message for validation failure
  const [validationError, setValidationError] = useState<string | null>(null);

  // Ref to hold the pending download filename
  const pendingFilenameRef = useRef<string>('terrain.stl');

  const isTerrainReady = generationStatus === 'ready' && elevationData !== null;
  const isExporting = exportStatus === 'building' || exportStatus === 'validating';

  // Progress bar percentage
  // Steps: Building solid mesh (10%) → Building buildings mesh (30%) →
  //        Building roads mesh (45%) → Merging roads (50%) →
  //        Validating (70%) → Writing STL (90%)
  const progressPercent =
    exportStep.includes('Writing') ? 90 :
    exportStep.includes('Validating') ? 70 :
    exportStep.includes('vegetation into') ? 60 :
    exportStep.includes('roads into') ? 50 :
    exportStep.includes('roads mesh') ? 45 :
    exportStep.includes('Merging') ? 50 :
    exportStep.includes('buildings mesh') ? 30 :
    exportStep.includes('Building') ? 10 : 10;

  async function handleExport() {
    if (!elevationData || !bbox || !dimensions) return;

    setValidationError(null);
    exportBufferRef.current = null;

    // targetReliefMM: matches TerrainMesh.tsx and BuildingMesh.tsx formula exactly.
    // No basePlateThicknessMM subtraction — base plate is added by buildSolidMesh separately.
    const targetReliefMM = targetHeightMM > 0 ? targetHeightMM : 0;

    try {
      // Step 1: Build terrain geometry
      setExportStatus('building', 'Building solid mesh...');
      await new Promise(resolve => setTimeout(resolve, 0)); // Yield to React render

      // Step 1: Apply caller-side smoothing (matches TerrainMesh.tsx pipeline order)
      // CRITICAL: smooth → water depression → buildTerrainGeometry
      const radius = Math.round((smoothingLevel / 100) * 8);
      const smoothedElevData = radius > 0
        ? { ...elevationData, elevations: smoothElevations(elevationData.elevations, elevationData.gridSize, radius) }
        : elevationData;

      // Step 2: Apply water depression before terrain mesh generation
      const hasWater = Boolean(waterFeatures && waterFeatures.length > 0 && waterVisible);
      const effectiveElevData = hasWater
        ? applyWaterDepressions(smoothedElevData, waterFeatures!, bbox)
        : smoothedElevData;

      const terrainGeom = buildTerrainGeometry(effectiveElevData, {
        widthMM: targetWidthMM,
        depthMM: targetDepthMM,
        geographicWidthM: dimensions.widthM,
        geographicDepthM: dimensions.heightM,
        exaggeration,
        minHeightMM: 5,
        maxError: 5,
        targetReliefMM,
      });

      const terrainSolid = buildSolidMesh(terrainGeom, basePlateThicknessMM);

      // Step 2: Include building geometry if available and buildings layer is toggled on
      const hasBuildings = Boolean(buildingFeatures && buildingFeatures.length > 0 && utmZone && buildingsVisible);
      let exportSolid = terrainSolid;

      if (hasBuildings && buildingFeatures && utmZone) {
        setExportStatus('building', 'Building buildings mesh...');
        await new Promise(resolve => setTimeout(resolve, 0));

        // Compute bbox center UTM (same as BuildingMesh.tsx)
        const centerLon = (bbox.sw.lon + bbox.ne.lon) / 2;
        const centerLat = (bbox.sw.lat + bbox.ne.lat) / 2;
        const centerUTM = wgs84ToUTM(centerLon, centerLat);

        const buildingParams: BuildingGeometryParams = {
          widthMM: targetWidthMM,
          depthMM: targetDepthMM,
          geographicWidthM: dimensions.widthM,
          geographicDepthM: dimensions.heightM,
          utmZone,
          bboxCenterUTM: { x: centerUTM.x, y: centerUTM.y },
          exaggeration,
          minElevationM: elevationData.minElevation,
          targetReliefMM,
          terrainGeometry: terrainGeom,
        };

        const buildingsGeometry = buildAllBuildings(
          buildingFeatures,
          bbox,
          elevationData,
          buildingParams
        );

        if (buildingsGeometry) {
          setExportStatus('building', 'Clipping buildings to footprint...');
          await new Promise(resolve => setTimeout(resolve, 0));

          // Clip buildings to terrain footprint — buildings that extend past the
          // model boundary are sliced cleanly at the edge instead of floating.
          const clippedBuildings = clipGeometryToFootprint(
            buildingsGeometry,
            targetWidthMM / 2,
            targetDepthMM / 2
          );
          buildingsGeometry.dispose();

          setExportStatus('building', 'Merging terrain and buildings...');
          await new Promise(resolve => setTimeout(resolve, 0));

          const merged = mergeShells(exportSolid, clippedBuildings);
          exportSolid.dispose();
          exportSolid = merged;
          clippedBuildings.dispose();
        }
      }

      // Step 2b: Include road geometry if available and roads layer is toggled on
      const hasRoads = Boolean(roadFeatures && roadFeatures.length > 0 && roadsVisible);

      if (hasRoads && roadFeatures) {
        setExportStatus('building', 'Building roads mesh...');
        await new Promise(resolve => setTimeout(resolve, 0));

        const centerLon = (bbox.sw.lon + bbox.ne.lon) / 2;
        const centerLat = (bbox.sw.lat + bbox.ne.lat) / 2;
        const centerUTM = wgs84ToUTM(centerLon, centerLat);

        // Always export roads as raised — recessed/flat styles are only visible
        // through vertex colors in the preview. STL has no color, so roads must
        // protrude above the terrain to be geometrically distinct and paintable.
        const roadParams: RoadGeometryParams = {
          widthMM: targetWidthMM,
          depthMM: targetDepthMM,
          geographicWidthM: dimensions.widthM,
          geographicDepthM: dimensions.heightM,
          exaggeration,
          minElevationM: elevationData.minElevation,
          bboxCenterUTM: { x: centerUTM.x, y: centerUTM.y },
          roadStyle: 'raised',
          targetReliefMM,
          terrainGeometry: terrainGeom,
        };

        const roadsGeometry = buildRoadGeometry(roadFeatures, bbox, elevationData, roadParams);

        if (roadsGeometry) {
          setExportStatus('building', 'Clipping roads to footprint...');
          await new Promise(resolve => setTimeout(resolve, 0));

          // Clip roads to terrain footprint (same as buildings)
          const clippedRoads = clipGeometryToFootprint(
            roadsGeometry,
            targetWidthMM / 2,
            targetDepthMM / 2
          );
          roadsGeometry.dispose();

          setExportStatus('building', 'Merging roads into model...');
          await new Promise(resolve => setTimeout(resolve, 0));

          const mergedRoads = mergeShells(exportSolid, clippedRoads);
          exportSolid.dispose();
          exportSolid = mergedRoads;
          clippedRoads.dispose();
        }
      }

      // Step 2c: Include vegetation geometry if available and vegetation layer is toggled on
      // Vegetation is built as enclosed solid slabs (top + bottom + side walls) so
      // each patch is a watertight shell suitable for 3D printing.
      const hasVegetation = Boolean(vegetationFeatures && vegetationFeatures.length > 0 && vegetationVisible);

      if (hasVegetation && vegetationFeatures) {
        setExportStatus('building', 'Building vegetation mesh...');
        await new Promise(resolve => setTimeout(resolve, 0));

        const centerLon = (bbox.sw.lon + bbox.ne.lon) / 2;
        const centerLat = (bbox.sw.lat + bbox.ne.lat) / 2;
        const centerUTM = wgs84ToUTM(centerLon, centerLat);
        const horizontalScale = targetWidthMM / dimensions.widthM;

        // Use same smoothed data as terrain for Z sampling
        const vegeRadius = Math.round((smoothingLevel / 100) * 8);
        const vegeSmoothed = vegeRadius > 0
          ? smoothElevations(elevationData.elevations, elevationData.gridSize, vegeRadius)
          : elevationData.elevations;

        // Compute smoothed min/max to match terrain.ts (buildTerrainGeometry:149-154)
        // CRITICAL: terrain uses smoothed min/max for elevRange and Z offset.
        // Using raw elevationData.min/max causes Z mismatch → floating vegetation.
        let vegeSmoothedMin = Infinity, vegeSmoothedMax = -Infinity;
        for (let i = 0; i < vegeSmoothed.length; i++) {
          if (vegeSmoothed[i] < vegeSmoothedMin) vegeSmoothedMin = vegeSmoothed[i];
          if (vegeSmoothed[i] > vegeSmoothedMax) vegeSmoothedMax = vegeSmoothed[i];
        }
        const elevRange = vegeSmoothedMax - vegeSmoothedMin;

        let vegeZScale: number;
        if (targetReliefMM > 0 && elevRange > 0) {
          vegeZScale = (targetReliefMM / elevRange) * exaggeration;
        } else if (elevRange > 0) {
          vegeZScale = horizontalScale * exaggeration;
          if (elevRange * vegeZScale < 5) vegeZScale = 5 / elevRange;
        } else {
          vegeZScale = horizontalScale * exaggeration;
        }

        const gridSize = elevationData.gridSize;
        const lonRange = bbox.ne.lon - bbox.sw.lon;
        const latRange = bbox.ne.lat - bbox.sw.lat;

        // Helper: sample terrain Z at lon/lat
        const sampleTerrainZ = (lon: number, lat: number): number => {
          const gx = Math.max(0, Math.min(gridSize - 1, Math.round(((lon - bbox.sw.lon) / lonRange) * (gridSize - 1))));
          const gy = Math.max(0, Math.min(gridSize - 1, Math.round((1 - (lat - bbox.sw.lat) / latRange) * (gridSize - 1))));
          const elev = vegeSmoothed[gy * gridSize + gx];
          return (elev - vegeSmoothedMin) * vegeZScale;
        };

        // Build enclosed solid slab geometry for each vegetation polygon:
        // top face (terrain Z + height), bottom face (terrain Z), side walls
        const allVegePositions: number[] = [];
        const allVegeIndices: number[] = [];
        let vegeVertexOffset = 0;

        for (const feature of vegetationFeatures) {
          // Flatten outer ring + holes for earcut
          const coords2d: number[] = [];
          const topZs: number[] = [];
          const botZs: number[] = [];
          const holeIndices: number[] = [];

          // Outer ring — project and compute per-vertex terrain Z
          for (const [lon, lat] of feature.outerRing) {
            const utm = wgs84ToUTM(lon, lat);
            coords2d.push((utm.x - centerUTM.x) * horizontalScale, (utm.y - centerUTM.y) * horizontalScale);
            const tZ = sampleTerrainZ(lon, lat);
            topZs.push(tZ + VEGE_HEIGHT_MM);
            botZs.push(tZ);
          }
          for (const hole of feature.holes) {
            holeIndices.push(coords2d.length / 2);
            for (const [lon, lat] of hole) {
              const utm = wgs84ToUTM(lon, lat);
              coords2d.push((utm.x - centerUTM.x) * horizontalScale, (utm.y - centerUTM.y) * horizontalScale);
              const tZ = sampleTerrainZ(lon, lat);
              topZs.push(tZ + VEGE_HEIGHT_MM);
              botZs.push(tZ);
            }
          }

          const triIndices = earcut(coords2d, holeIndices.length > 0 ? holeIndices : undefined, 2);
          const numPts = coords2d.length / 2;

          // --- Top face (outward normal +Z) ---
          const topBase = vegeVertexOffset;
          for (let i = 0; i < numPts; i++) {
            allVegePositions.push(coords2d[i * 2], coords2d[i * 2 + 1], topZs[i]);
          }
          for (const idx of triIndices) {
            allVegeIndices.push(idx + topBase);
          }
          vegeVertexOffset += numPts;

          // --- Bottom face (outward normal -Z, reversed winding) ---
          const botBase = vegeVertexOffset;
          for (let i = 0; i < numPts; i++) {
            allVegePositions.push(coords2d[i * 2], coords2d[i * 2 + 1], botZs[i]);
          }
          // Reversed winding: swap second and third vertex of each triangle
          for (let t = 0; t < triIndices.length; t += 3) {
            allVegeIndices.push(triIndices[t] + botBase);
            allVegeIndices.push(triIndices[t + 2] + botBase);
            allVegeIndices.push(triIndices[t + 1] + botBase);
          }
          vegeVertexOffset += numPts;

          // --- Side walls around each ring boundary ---
          // Builds quads connecting top and bottom perimeter vertices.
          // Outer ring: outward-facing normals. Hole rings: inward-facing.
          const outerLen = feature.outerRing.length;
          const buildWalls = (ringStart: number, ringLen: number, outward: boolean) => {
            for (let i = 0; i < ringLen; i++) {
              const j = (i + 1) % ringLen;
              const ti = topBase + ringStart + i;
              const tj = topBase + ringStart + j;
              const bi = botBase + ringStart + i;
              const bj = botBase + ringStart + j;
              if (outward) {
                // CCW from outside: ti → bi → bj, ti → bj → tj
                allVegeIndices.push(ti, bi, bj);
                allVegeIndices.push(ti, bj, tj);
              } else {
                // Reversed for holes: ti → bj → bi, ti → tj → bj
                allVegeIndices.push(ti, bj, bi);
                allVegeIndices.push(ti, tj, bj);
              }
            }
          };

          buildWalls(0, outerLen, true);
          // Hole walls
          let holeStart = outerLen;
          for (const hole of feature.holes) {
            buildWalls(holeStart, hole.length, false);
            holeStart += hole.length;
          }
        }

        if (allVegePositions.length > 0) {
          const vegeGeo = new THREE.BufferGeometry();
          vegeGeo.setAttribute('position', new THREE.Float32BufferAttribute(allVegePositions, 3));
          vegeGeo.setIndex(allVegeIndices);
          vegeGeo.computeVertexNormals();

          // Clip to footprint
          const clippedVege = clipGeometryToFootprint(vegeGeo, targetWidthMM / 2, targetDepthMM / 2);
          vegeGeo.dispose();

          setExportStatus('building', 'Merging vegetation into model...');
          await new Promise(resolve => setTimeout(resolve, 0));

          const mergedVege = mergeShells(exportSolid, clippedVege);
          exportSolid.dispose();
          exportSolid = mergedVege;
          clippedVege.dispose();
        }
      }

      // Step 3: Validate terrain solid (the foundational watertight shell).
      // Multi-feature exports are composed of individually watertight shells
      // (terrain, buildings, roads, vegetation) — slicers compute boolean union
      // automatically. Boundary-edge validation can't handle multi-shell meshes
      // (edges shared between shells produce count != 2), so we only validate
      // terrain-only exports strictly. For multi-feature, trust construction.
      const hasFeatures = hasBuildings || hasRoads || hasVegetation;

      if (!hasFeatures) {
        setExportStatus('validating', 'Validating mesh...');
        await new Promise(resolve => setTimeout(resolve, 0));

        const validation = await validateMesh(exportSolid);

        if (!validation.isManifold) {
          const errMsg = validation.error ?? 'Mesh is not watertight';
          setValidationError(errMsg);
          setExportStatus('error', errMsg);
          exportSolid.dispose();
          return;
        }
      }

      // Step 4: Write STL
      setExportStatus('building', 'Writing STL...');
      await new Promise(resolve => setTimeout(resolve, 0));

      const mesh = new THREE.Mesh(exportSolid);
      const { buffer, sizeBytes, triangleCount } = exportToSTL(mesh);

      // Compute height in mm from actual geometry (matches preview).
      // Since exaggeration multiplies the height override, we always scan
      // the geometry for maxZ to get the true height.
      const posAttr = exportSolid.getAttribute('position') as THREE.BufferAttribute;
      let maxZ = -Infinity;
      for (let i = 0; i < posAttr.count; i++) {
        const z = posAttr.getZ(i);
        if (z > maxZ) maxZ = z;
      }
      const heightMM = maxZ + basePlateThicknessMM;

      // Generate filename (reflects which layers are included)
      const filename = generateFilename(bbox, locationName, hasBuildings, hasRoads, hasWater, hasVegetation);
      pendingFilenameRef.current = filename;

      // Store buffer for download
      exportBufferRef.current = buffer;

      setExportResult({
        sizeBytes,
        triangleCount,
        widthMM: targetWidthMM,
        depthMM: targetDepthMM,
        heightMM,
        filename,
      });

      setExportStatus('ready', 'Export complete');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Export failed';
      setValidationError(msg);
      setExportStatus('error', msg);
    }
  }

  function handleDownload() {
    if (!exportBufferRef.current || !exportResult) return;
    downloadSTL(exportBufferRef.current, exportResult.filename);
  }

  function handleClose() {
    setExportStatus('idle', '');
    setExportResult(null);
    setValidationError(null);
    exportBufferRef.current = null;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingTop: '12px' }}>
      {/* Section A: Export button */}
      {exportStatus !== 'ready' && (
        <button
          onClick={handleExport}
          disabled={!isTerrainReady || isExporting}
          style={{
            backgroundColor: isTerrainReady && !isExporting ? '#2563eb' : '#374151',
            color: isTerrainReady && !isExporting ? '#fff' : '#9ca3af',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: isTerrainReady && !isExporting ? 'pointer' : 'not-allowed',
            width: '100%',
          }}
        >
          {isExporting ? 'Exporting...' : 'Export STL'}
        </button>
      )}

      {/* Section C: Progress bar */}
      {isExporting && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div
            style={{
              width: '100%',
              height: '6px',
              backgroundColor: '#374151',
              borderRadius: '3px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${progressPercent}%`,
                height: '100%',
                backgroundColor: '#3b82f6',
                borderRadius: '3px',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
          <span style={{ color: '#9ca3af', fontSize: '11px', textAlign: 'center' }}>
            {exportStep}
          </span>
        </div>
      )}

      {/* Validation error */}
      {exportStatus === 'error' && validationError && (
        <div
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid #ef4444',
            borderRadius: '6px',
            padding: '10px',
          }}
        >
          <p style={{ color: '#ef4444', fontSize: '12px', margin: 0 }}>
            {validationError}
          </p>
          <button
            onClick={() => { setExportStatus('idle', ''); setValidationError(null); }}
            style={{
              marginTop: '8px',
              background: 'none',
              border: 'none',
              color: '#9ca3af',
              fontSize: '11px',
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: 0,
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Validation warning (non-blocking, shown with download dialog) */}
      {exportStatus === 'ready' && validationError && (
        <div
          style={{
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid #f59e0b',
            borderRadius: '6px',
            padding: '10px',
          }}
        >
          <p style={{ color: '#f59e0b', fontSize: '12px', margin: 0 }}>
            {validationError}
          </p>
        </div>
      )}

      {/* Section D: Download dialog */}
      {exportStatus === 'ready' && exportResult && (
        <div
          style={{
            backgroundColor: '#111827',
            border: '1px solid #374151',
            borderRadius: '8px',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          {/* Success header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#22c55e', fontSize: '16px' }}>&#10003;</span>
            <span style={{ color: '#22c55e', fontSize: '13px', fontWeight: 600 }}>
              Export complete
            </span>
          </div>

          {/* File details */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#9ca3af', fontSize: '12px' }}>File</span>
              <span
                style={{
                  color: '#e5e7eb',
                  fontSize: '12px',
                  maxWidth: '160px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={exportResult.filename}
              >
                {exportResult.filename}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#9ca3af', fontSize: '12px' }}>Size</span>
              <span style={{ color: '#e5e7eb', fontSize: '12px' }}>
                {formatBytes(exportResult.sizeBytes)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#9ca3af', fontSize: '12px' }}>Triangles</span>
              <span style={{ color: '#e5e7eb', fontSize: '12px' }}>
                {formatCount(exportResult.triangleCount)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#9ca3af', fontSize: '12px' }}>Dimensions</span>
              <span style={{ color: '#e5e7eb', fontSize: '12px' }}>
                {exportResult.widthMM} &times; {exportResult.depthMM} &times; {exportResult.heightMM.toFixed(1)} mm
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleDownload}
              style={{
                flex: 1,
                backgroundColor: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '8px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Download
            </button>
            <button
              onClick={handleClose}
              style={{
                flex: '0 0 auto',
                backgroundColor: '#374151',
                color: '#9ca3af',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
