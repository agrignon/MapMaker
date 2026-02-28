---
phase: 09-performance-hardening
plan: 02
subsystem: export-pipeline, worker, generation-guard
tags: [performance, web-worker, export, bbox-cap, non-blocking]
dependency_graph:
  requires: []
  provides: [non-blocking-stl-export, bbox-area-cap]
  affects: [ExportPanel, meshBuilderClient, GenerateButton]
tech_stack:
  added: []
  patterns: [worker-based-export, transferable-arraybuffers, bbox-area-guard]
key_files:
  created: []
  modified:
    - src/components/Sidebar/GenerateButton.tsx
    - src/workers/meshBuilderClient.ts
    - src/components/Preview/ExportPanel.tsx
decisions:
  - "Export pipeline reuses existing buildRoads/buildBuildings worker message types — no new message types needed"
  - "buildRoadsForExport and buildBuildingsForExport omit stale-result rejection (no concurrent export calls)"
  - "terrainGeom stays on main thread for buildSolidMesh; worker builds its own internal BVH terrain from terrainParams+elevData"
  - "Bbox hard cap at 25 km2, soft warning at 4 km2 — uses store dimensions (widthM * heightM)"
metrics:
  duration: "4 min"
  completed: "2026-02-28"
  tasks_completed: 2
  files_modified: 3
---

# Phase 9 Plan 02: Non-blocking Export + Bbox Area Cap Summary

Non-blocking STL export with worker-offloaded building/road geometry and bbox OOM guard.

## What Was Built

### Task 1: Bbox area cap (GenerateButton.tsx)

Added a two-tier area check in `triggerRegenerate()` before any network requests:

- **Hard cap at 25 km2**: Calls `s.setGenerationStatus('error', ...)` and returns immediately. Prevents Overpass 32MB maxsize hits and browser OOM during geometry generation on very large selections.
- **Soft warning at 4-25 km2**: Calls `s.setGenerationStatus('fetching', 'Large area — generation may be slow...')` and proceeds. User sees the warning briefly before the normal step text takes over.
- Area computed as `(dims.widthM * dims.heightM) / 1e6` from store dimensions.

### Task 2: Worker-based export pipeline (meshBuilderClient.ts + ExportPanel.tsx)

**meshBuilderClient.ts — two new export functions:**
- `buildRoadsForExport(...)`: Sends `buildRoads` message to worker, returns `Promise<MeshArrays | null>`. No stale-result rejection sequence counter (export calls are never concurrent).
- `buildBuildingsForExport(...)`: Same pattern for buildings. Both reuse existing `buildRoads`/`buildBuildings` worker message types — no worker changes needed.

**ExportPanel.tsx — three changes:**
1. **Removed** `buildAllBuildings` and `buildRoadGeometry` direct imports.
2. **Added** `buildBuildingsForExport`, `buildRoadsForExport`, `MeshArrays` imports from worker client.
3. **Added** `meshArraysToGeometry(arrays: MeshArrays): THREE.BufferGeometry` helper to reconstruct `BufferGeometry` from worker typed arrays (needed for clipping, merging, and STL write pipeline).
4. **Buildings section**: Replaced synchronous `buildAllBuildings(...)` call with `await buildBuildingsForExport(...)` + `meshArraysToGeometry()`.
5. **Roads section**: Replaced synchronous `buildRoadGeometry(...)` call with `await buildRoadsForExport(...)` + `meshArraysToGeometry()`.

The terrain solid mesh construction (`buildSolidMesh`) stays on the main thread — it's fast (< 30ms) and must remain in the main thread for the STL pipeline. The worker builds its own internal BVH terrain from `terrainParams + elevData`.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- 179 tests pass (`npx vitest run`)
- `npx vite build` succeeds with worker bundle in dist/ (`meshBuilder.worker-TPlSo1Xa.js`)

## Self-Check

Files created/modified:
- src/components/Sidebar/GenerateButton.tsx — modified
- src/workers/meshBuilderClient.ts — modified
- src/components/Preview/ExportPanel.tsx — modified

Commits:
- 77c4173: feat(09-02): add bbox area cap to prevent OOM on dense areas
- bb72236: feat(09-02): route export pipeline building/road geometry through Web Worker

## Self-Check: PASSED
