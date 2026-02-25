---
phase: 05-roads-layer
plan: 02
subsystem: roads
tags: [three.js, zustand, r3f, stl-export, road-mesh, ui]

# Dependency graph
requires:
  - phase: 05-roads-layer plan 01
    provides: buildRoadGeometry(), ROAD_COLOR, RoadFeature, RoadStyle, RoadGeometryParams, fetchRoadData(), parseRoadFeatures()
  - phase: 03-buildings
    provides: BuildingMesh.tsx pattern, ExportPanel.tsx buildings merge pattern
  - phase: 04-model-controls-store-foundation
    provides: mapStore.ts extension pattern, CollapsibleSection, layerToggles
provides:
  - "src/store/mapStore.ts — roadFeatures, roadStyle, roadGenerationStatus, roadGenerationStep state + setters"
  - "src/components/Preview/RoadMesh.tsx — R3F component rendering road ribbon geometry on terrain"
  - "src/components/Preview/RoadsSection.tsx — sidebar section with style toggle (recessed/raised/flat) and feature count"
  - "src/components/Preview/PreviewCanvas.tsx — RoadMesh wired into 3D scene"
  - "src/components/Preview/ExportPanel.tsx — road geometry included in STL export merge pipeline"
  - "src/lib/export/stlExport.ts — generateFilename with hasRoads param for -terrain-roads/-terrain-buildings-roads suffixes"
affects:
  - phase: 06-water (water layer follows same pattern as roads)
  - phase: 09-performance (road geometry generation in worker)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - RoadMesh mirrors BuildingMesh pattern exactly (store selectors, useRef geometry, useEffect rebuild, clipping planes, cleanup)
    - RoadsSection mirrors BuildingsSection pattern with road-specific style toggle (3-button row per CTRL-04)
    - Road fetch mirrors building fetch in GenerateButton — parallel non-blocking after terrain ready
    - Export merge: terrain → buildings (CSG) → roads (mergeGeometries, NOT CSG) → validate → STL
    - generateFilename suffix built dynamically from hasBuildings + hasRoads flags

key-files:
  created:
    - src/components/Preview/RoadMesh.tsx
    - src/components/Preview/RoadsSection.tsx
  modified:
    - src/store/mapStore.ts (roadFeatures, roadStyle, roadGenerationStatus state + setters)
    - src/components/Preview/PreviewSidebar.tsx (RoadsSection replaces LayerPlaceholderSection)
    - src/components/Preview/PreviewCanvas.tsx (RoadMesh added to R3F scene)
    - src/components/Sidebar/GenerateButton.tsx (fetchRoads() parallel with fetchBuildings)
    - src/components/Preview/ExportPanel.tsx (road merge step + hasRoads validation tolerance + filename)
    - src/lib/export/stlExport.ts (generateFilename hasRoads param + unified suffix logic)

key-decisions:
  - "Roads merged via mergeGeometries (not CSG) in export — per STATE.md decision; roads are additive geometry, not boolean"
  - "UV attributes stripped before mergeGeometries in export — prevents attribute mismatch with terrain/buildings"
  - "Non-manifold validation tolerant when hasRoads (same as hasBuildings) — slicers auto-repair feature seams"
  - "Road fetch is non-blocking parallel to building fetch — terrain visible immediately"
  - "RoadMesh early return when roadGenerationStatus !== 'ready' — prevents rendering partial/empty geometry"
  - "generateFilename unified suffix builder — terrain[-buildings][-roads] covers all 4 layer combinations"

# Metrics
duration: 4min
completed: 2026-02-25
---

# Phase 5 Plan 02: Roads Layer UI Wiring Summary

**Road layer wired end-to-end: Zustand store extended with road state, RoadMesh R3F component renders terrain-following ribbons in preview, RoadsSection sidebar shows style toggle (recessed/raised/flat), GenerateButton fetches roads in parallel with buildings, and road geometry merged into STL export**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-25T06:43:36Z
- **Completed:** 2026-02-25T06:47:36Z
- **Tasks:** 2
- **Files modified:** 8 (2 created, 6 modified)

## Accomplishments
- Complete road layer UI integration: store state → 3D preview → sidebar controls → STL export
- RoadMesh.tsx mirrors BuildingMesh.tsx exactly — terrain-following road ribbons with clipping planes and layer toggle visibility
- RoadsSection.tsx provides recessed/raised/flat style toggle that causes live RoadMesh rebuild via useEffect
- Roads fetched in parallel with buildings after terrain generation (non-blocking)
- Road generation status shown below GenerateButton alongside building status
- STL export pipeline: terrain → buildings → roads → validate → write; roads use mergeGeometries (not CSG)
- generateFilename supports all 4 layer combinations: terrain, terrain-buildings, terrain-roads, terrain-buildings-roads

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend store, create RoadMesh component, create RoadsSection UI, wire GenerateButton** - `7156d29` (feat)
2. **Task 2: Integrate road geometry into STL export pipeline** - `a9bfe14` (feat)

## Files Created/Modified
- `src/store/mapStore.ts` — Added RoadFeature/RoadStyle import + roadFeatures, roadStyle, roadGenerationStatus, roadGenerationStep state + setRoadFeatures, setRoadStyle, setRoadGenerationStatus actions
- `src/components/Preview/RoadMesh.tsx` — R3F mesh component: reads store selectors, computes RoadGeometryParams, calls buildRoadGeometry() in useEffect, disposes on unmount, clipping planes at terrain edges
- `src/components/Preview/RoadsSection.tsx` — CollapsibleSection with road count summary, layer toggle, 3-button road style selector (recessed/raised/flat); controls hidden when layer toggled off (CTRL-04)
- `src/components/Preview/PreviewSidebar.tsx` — RoadsSection replaces LayerPlaceholderSection for Roads; Water/Vegetation remain as placeholders (Phase 6/7)
- `src/components/Preview/PreviewCanvas.tsx` — RoadMesh added to R3F Canvas after BuildingMesh
- `src/components/Sidebar/GenerateButton.tsx` — fetchRoads() mirrors fetchBuildings(); both called in parallel after terrain ready; road generation step shown in UI
- `src/components/Preview/ExportPanel.tsx` — Road merge step added (Step 2b) after buildings; mergeGeometries approach; attribute stripping; validation tolerance extended to roads; progress bar updated; generateFilename call updated with hasRoads
- `src/lib/export/stlExport.ts` — generateFilename gains hasRoads=false param; unified suffix string builder for all 4 layer combinations

## Decisions Made
- Roads merged via mergeGeometries (not CSG) in export — roads are additive geometry (the CSG approach is reserved for buildings which need boolean intersection with terrain)
- UV attributes stripped before merge — prevents attribute mismatch when merging road geometry with terrain+buildings
- Non-manifold validation tolerant when hasRoads — same policy as hasBuildings; slicers auto-repair seams
- RoadMesh early return on `roadGenerationStatus !== 'ready'` — safe: no partial renders
- generateFilename unified suffix builder — simpler than branching for each combination

## Deviations from Plan

None - plan executed exactly as written.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 5 roads layer complete (types, fetch, parse, mesh, preview, export)
- Phase 6 (Water) can follow the same pipeline pattern as roads
- Phase 9 (Performance) can move road geometry generation to Web Worker

---
*Phase: 05-roads-layer*
*Completed: 2026-02-25*

## Self-Check: PASSED

Files verified:
- FOUND: src/components/Preview/RoadMesh.tsx
- FOUND: src/components/Preview/RoadsSection.tsx
- FOUND: src/store/mapStore.ts
- FOUND: src/components/Preview/ExportPanel.tsx
- FOUND: src/lib/export/stlExport.ts

Commits verified:
- FOUND: 7156d29 (Task 1 — feat: wire road layer into store, preview, and generate button)
- FOUND: a9bfe14 (Task 2 — feat: integrate road geometry into STL export pipeline)

Test results: 160 tests pass (no regressions)
TypeScript: clean (npx tsc --noEmit: exit 0)
