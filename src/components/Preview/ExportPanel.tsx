/**
 * Export panel for the 3D preview sidebar.
 * Provides: dimension inputs, Export STL button, labeled progress bar, download dialog.
 *
 * Placed inside PreviewSidebar, below TerrainControls.
 * Export is gated: only enabled when terrain is generated (generationStatus === 'ready').
 */

import { useRef, useState } from 'react';
import * as THREE from 'three';
import { useMapStore } from '../../store/mapStore';
import { buildTerrainGeometry } from '../../lib/mesh/terrain';
import { buildSolidMesh } from '../../lib/mesh/solid';
import { mergeTerrainAndBuildings } from '../../lib/mesh/buildingSolid';
import { validateMesh } from '../../lib/export/validate';
import { exportToSTL, downloadSTL, generateFilename } from '../../lib/export/stlExport';
import { buildAllBuildings } from '../../lib/buildings/merge';
import { wgs84ToUTM } from '../../lib/utm';
import type { BuildingGeometryParams } from '../../lib/buildings/types';

// Module-level buffer storage — ArrayBuffer is not serializable to Zustand
// This holds the last exported buffer for the Download button
const exportBufferRef: { current: ArrayBuffer | null } = { current: null };

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
  const dimensions = useMapStore((s) => s.dimensions);
  const bbox = useMapStore((s) => s.bbox);
  const utmZone = useMapStore((s) => s.utmZone);
  const locationName = useMapStore((s) => s.locationName);
  const exportStatus = useMapStore((s) => s.exportStatus);
  const exportStep = useMapStore((s) => s.exportStep);
  const exportResult = useMapStore((s) => s.exportResult);
  const buildingFeatures = useMapStore((s) => s.buildingFeatures);
  const buildingsVisible = useMapStore((s) => s.layerToggles.buildings);

  const setExportStatus = useMapStore((s) => s.setExportStatus);
  const setExportResult = useMapStore((s) => s.setExportResult);
  const setTargetDimensions = useMapStore((s) => s.setTargetDimensions);

  // Local state for dimension inputs (avoid over-triggering store on every keystroke)
  const [widthInput, setWidthInput] = useState(String(targetWidthMM));
  const [depthInput, setDepthInput] = useState(String(targetDepthMM));

  // Error message for validation failure
  const [validationError, setValidationError] = useState<string | null>(null);

  // Ref to hold the pending download filename
  const pendingFilenameRef = useRef<string>('terrain.stl');

  const isTerrainReady = generationStatus === 'ready' && elevationData !== null;
  const isExporting = exportStatus === 'building' || exportStatus === 'validating';

  // Progress bar percentage
  // Steps: Building solid mesh (10%) → Building buildings mesh (30%) →
  //        Merging terrain and buildings (50%) → Validating (70%) → Writing STL (90%)
  const progressPercent =
    exportStep.includes('Writing') ? 90 :
    exportStep.includes('Validating') ? 70 :
    exportStep.includes('Merging') ? 50 :
    exportStep.includes('buildings mesh') ? 30 :
    exportStep.includes('Building') ? 10 : 10;

  async function handleExport() {
    if (!elevationData || !bbox || !dimensions) return;

    setValidationError(null);
    exportBufferRef.current = null;

    try {
      // Step 1: Build terrain geometry
      setExportStatus('building', 'Building solid mesh...');
      await new Promise(resolve => setTimeout(resolve, 0)); // Yield to React render

      const terrainGeom = buildTerrainGeometry(elevationData, {
        widthMM: targetWidthMM,
        depthMM: targetDepthMM,
        geographicWidthM: dimensions.widthM,
        geographicDepthM: dimensions.heightM,
        exaggeration,
        minHeightMM: 5,
        maxError: 5,
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
        };

        const buildingsGeometry = buildAllBuildings(
          buildingFeatures,
          bbox,
          elevationData,
          buildingParams
        );

        if (buildingsGeometry) {
          setExportStatus('building', 'Merging terrain and buildings...');
          await new Promise(resolve => setTimeout(resolve, 0));

          exportSolid = mergeTerrainAndBuildings(terrainSolid, buildingsGeometry);
          buildingsGeometry.dispose();
        }
      }

      // Step 3: Validate mesh
      setExportStatus('validating', 'Validating mesh...');
      await new Promise(resolve => setTimeout(resolve, 0));

      const validation = await validateMesh(exportSolid);

      if (!validation.isManifold && !hasBuildings) {
        // Terrain-only export must be manifold — block export
        const errMsg = validation.error ?? 'Mesh is not watertight — please try again';
        setValidationError(errMsg);
        setExportStatus('error', errMsg);
        return;
      }

      if (!validation.isManifold && hasBuildings) {
        // Buildings + terrain may have non-manifold seams — warn but allow export
        // Slicers (PrusaSlicer, Bambu Studio) auto-repair these meshes
        setValidationError(
          'Mesh has non-manifold edges at building seams — your slicer will auto-repair this.'
        );
      }

      // Step 4: Write STL
      setExportStatus('building', 'Writing STL...');
      await new Promise(resolve => setTimeout(resolve, 0));

      const mesh = new THREE.Mesh(exportSolid);
      const { buffer, sizeBytes, triangleCount } = exportToSTL(mesh);

      // Compute height: terrain Z range + base plate
      const posAttr = exportSolid.getAttribute('position') as THREE.BufferAttribute;
      let maxZ = -Infinity;
      for (let i = 0; i < posAttr.count; i++) {
        const z = posAttr.getZ(i);
        if (z > maxZ) maxZ = z;
      }
      const heightMM = maxZ + basePlateThicknessMM;

      // Generate filename (includes -buildings suffix when buildings are present)
      const filename = generateFilename(bbox, locationName, hasBuildings);
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

  const labelStyle: React.CSSProperties = {
    color: '#d1d5db',
    fontSize: '13px',
    fontWeight: 500,
  };

  const inputStyle: React.CSSProperties = {
    backgroundColor: '#1f2937',
    border: '1px solid #374151',
    borderRadius: '6px',
    color: '#e5e7eb',
    padding: '6px 10px',
    fontSize: '13px',
    outline: 'none',
    width: '80px',
    textAlign: 'right' as const,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Divider */}
      <div style={{ borderTop: '1px solid #374151' }} />

      {/* Section A: Dimensions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <span style={{ color: '#e5e7eb', fontSize: '13px', fontWeight: 600 }}>
          Model Dimensions
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label htmlFor="export-width" style={labelStyle}>Width</label>
          <input
            id="export-width"
            type="number"
            min={10}
            max={500}
            step={1}
            value={widthInput}
            onChange={(e) => setWidthInput(e.target.value)}
            onBlur={() => {
              const v = parseInt(widthInput, 10);
              if (!isNaN(v) && v > 0) {
                setTargetDimensions(v, targetDepthMM);
              } else {
                setWidthInput(String(targetWidthMM));
              }
            }}
            style={inputStyle}
          />
          <span style={{ color: '#9ca3af', fontSize: '13px' }}>mm</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label htmlFor="export-depth" style={labelStyle}>Depth</label>
          <input
            id="export-depth"
            type="number"
            min={10}
            max={500}
            step={1}
            value={depthInput}
            onChange={(e) => setDepthInput(e.target.value)}
            onBlur={() => {
              const v = parseInt(depthInput, 10);
              if (!isNaN(v) && v > 0) {
                setTargetDimensions(targetWidthMM, v);
              } else {
                setDepthInput(String(targetDepthMM));
              }
            }}
            style={inputStyle}
          />
          <span style={{ color: '#9ca3af', fontSize: '13px' }}>mm</span>
        </div>

        <p style={{ color: '#6b7280', fontSize: '11px', margin: 0 }}>
          STL will be scaled to these dimensions
        </p>
      </div>

      {/* Section B: Export button */}
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
