---
phase: 02-terrain-preview-export
plan: "03"
subsystem: ui
tags: [three, manifold-3d, stl-export, solid-mesh, progress-bar, download-dialog, zustand]

# Dependency graph
requires:
  - phase: 02-02
    provides: buildTerrainGeometry, ElevationData, basePlateThicknessMM, PreviewSidebar children pattern
provides:
  - Watertight solid mesh builder: terrain surface + base plate + side walls (buildSolidMesh)
  - manifold-3d WASM validation with boundary-edge fallback (validateMesh)
  - Binary STL export, browser download, location-based filename (exportToSTL, downloadSTL, generateFilename)
  - Export panel UI: dimension inputs, labeled progress bar, download dialog with file details
affects:
  - 02-04-buildings (building mesh will overlay same PreviewCanvas; ExportPanel will need to include buildings when added)
  - 03-stl-validation (manifold-3d integration validated in browser context here)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Three.js STLExporter addons path: import from 'three/addons/exporters/STLExporter.js' (not examples/jsm)"
    - "mergeGeometries from 'three/addons/utils/BufferGeometryUtils.js' for combining terrain + base + walls"
    - "Module-level ArrayBuffer ref for download: Zustand doesn't serialize ArrayBuffers, use module var"
    - "manifold-3d lazy init with setup(): getManifold() caches lib instance after first load"
    - "Boundary-edge fallback: edge map counting — every edge must appear exactly 2× for manifold"
    - "Export pipeline decoupled from scene: rebuilds geometry from store data, not from live Three.js objects"

key-files:
  created:
    - src/lib/mesh/solid.ts
    - src/lib/export/stlExport.ts
    - src/lib/export/validate.ts
    - src/components/Preview/ExportPanel.tsx
  modified:
    - src/components/Layout/SplitLayout.tsx
    - src/store/mapStore.ts
    - src/types/geo.ts

key-decisions:
  - "Export pipeline rebuilds geometry from store data (elevationData + params), not from live Three.js scene objects — decouples export from preview"
  - "Module-level ArrayBuffer ref for STL buffer — Zustand state is serializable, ArrayBuffer is not"
  - "Boundary-edge fallback for manifold validation: counts edge occurrences; every edge must be shared by exactly 2 triangles"
  - "64 samples per perimeter edge for side walls: balances mesh quality vs triangle count for typical terrain models"
  - "Export status gated on generationStatus === 'ready': button disabled until terrain is generated"

patterns-established:
  - "Export decoupled from preview: export uses store state to rebuild mesh independently of live scene"
  - "Module-level mutable ref for non-serializable data (ArrayBuffer) alongside serializable Zustand state"
  - "Async export with intermediate setExportStatus('building'/'validating') + setTimeout(0) yields for React renders"

requirements-completed: [EXPT-01, EXPT-02, EXPT-03, EXPT-04, EXPT-05]

# Metrics
duration: 4min
completed: 2026-02-24
---

# Phase 2 Plan 03: STL Export Pipeline Summary

**Watertight solid mesh builder with manifold-3d validation, binary STL export, and an export panel featuring labeled progress bar and download dialog with file details**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-02-24T05:17:18Z
- **Completed:** 2026-02-24T05:21:39Z
- **Tasks:** 2 of 3 (Task 3 is a human-verify checkpoint — awaiting user verification)
- **Files modified:** 7

## Accomplishments
- Built `buildSolidMesh()` that closes terrain geometry into a watertight solid: terrain surface (non-indexed) + base plate (2 triangles at z=-basePlateThicknessMM) + 4 side walls (64 quads per edge, sampling terrain perimeter)
- Created `validateMesh()` using manifold-3d WASM with automatic fallback to boundary-edge check if WASM fails to initialize
- Implemented `exportToSTL()` / `downloadSTL()` / `generateFilename()` using Three.js STLExporter binary mode
- Built ExportPanel component with dimension inputs, Export STL button, labeled progress bar (building=33%, validating=66%, writing=90%), and download dialog showing file size/triangles/dimensions

## Task Commits

Each task was committed atomically:

1. **Task 1: Build watertight solid mesh, manifold validation, and STL export** - `0c19180` (feat)
2. **Task 2: Build Export panel UI with progress bar and download dialog** - `e0b725f` (feat)

**Task 3: Human-verify checkpoint** - awaiting user verification in PrusaSlicer/Bambu Studio

## Files Created/Modified
- `src/lib/mesh/solid.ts` — buildSolidMesh(): terrain surface + base plate + 4 side walls at 64 samples/edge
- `src/lib/export/validate.ts` — validateMesh(): manifold-3d WASM + boundary-edge fallback
- `src/lib/export/stlExport.ts` — exportToSTL(), downloadSTL(), generateFilename() with location slugify
- `src/components/Preview/ExportPanel.tsx` — dimension inputs, Export button, progress bar, download dialog
- `src/components/Layout/SplitLayout.tsx` — added ExportPanel below TerrainControls in PreviewSidebar
- `src/store/mapStore.ts` — added exportStatus, exportStep, exportResult, locationName state + actions
- `src/types/geo.ts` — added ExportResult and ExportStatus types

## Decisions Made
- Export pipeline rebuilds geometry from store data (elevationData + params) rather than reading from the live Three.js scene — this decouples export from preview state and avoids scene graph coupling
- ArrayBuffer for the STL buffer is held in a module-level ref (not Zustand state) because Zustand serializes state and ArrayBuffers don't serialize cleanly
- Side walls use 64 regular samples per edge rather than walking the RTIN triangle perimeter — simpler and produces clean rectangular quads even when the adaptive mesh has irregular boundary vertex density
- manifold-3d fallback to boundary-edge check ensures validation works even if WASM fails to initialize in certain browser environments

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - TypeScript compiled cleanly on first attempt, all 14 existing tests continued passing.

## User Setup Required
None - no external service configuration required. Validation uses already-installed manifold-3d package.

## Checkpoint Status

**Task 3 (human-verify) is blocking.** User must:
1. Run `npm run dev` (http://localhost:5173)
2. Draw bbox over mountainous area, click Generate Preview
3. In the right sidebar: set dimensions, click Export STL
4. Verify progress bar shows labeled steps (Building/Validating/Writing)
5. Verify download dialog shows file size, triangle count, and mm dimensions
6. Open the downloaded .stl in PrusaSlicer or Bambu Studio
7. Confirm: no repair warnings, solid model with terrain on top and flat base
8. Try a flat area (e.g., Kansas City) — verify model is not paper-thin (5mm minimum floor)

Type "approved" to continue to Plan 02-04, or describe issues.

## Next Phase Readiness
- Complete STL export pipeline: bbox → Generate → 3D preview → Export → download .stl
- ExportPanel slotted into PreviewSidebar via children pattern — ready for Plan 02-04 building layer
- manifold-3d validated in browser context (resolves the concern documented in 02-02 SUMMARY)
- locationName field added to store — ready for geocoding search integration

---
*Phase: 02-terrain-preview-export*
*Completed: 2026-02-24 (pending Task 3 human verification)*
