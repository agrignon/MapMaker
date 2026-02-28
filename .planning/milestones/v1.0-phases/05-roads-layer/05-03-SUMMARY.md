---
phase: 05-roads-layer
plan: "03"
subsystem: ui
tags: [three.js, overpass, z-fighting, polygon-offset, sutherland-hodgman, clipping, buildings, roads]

# Dependency graph
requires:
  - phase: 05-roads-layer
    provides: road mesh geometry (roadMesh.ts), road layer UI (RoadMesh.tsx, RoadsSection.tsx, GenerateButton.tsx)
  - phase: 03-buildings
    provides: building merge pipeline (merge.ts) for building base Z fix
provides:
  - Z-fighting fix for road mesh visibility via position offset + polygonOffset
  - Sequential Overpass fetch pattern (fetchBuildings.finally fetchRoads) to prevent rate limiting
  - Building base Z anchoring to lowest terrain sample (Math.min instead of Math.max)
  - Sutherland-Hodgman triangle clipping for STL export boundary (clipGeometry.ts)
  - All 6 phase-5 UAT tests passing — roads visible, toggleable, fetchable, and exportable
affects: [06-water-layer, 07-smoothing, phase-export-pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sequential Overpass fetch: fetchBuildings().finally(() => void fetchRoads()) — natural delay prevents rate limiting without explicit setTimeout"
    - "Z-fighting prevention: position={[0,0,0.1]} mesh Z lift + polygonOffset/polygonOffsetFactor/polygonOffsetUnits on material"
    - "Building base anchoring: Math.min over sampled terrain Z values to attach to lowest point, not highest"
    - "Sutherland-Hodgman clipping: clip triangles at model boundary (±width/2, ±depth/2) in export pipeline before merge"

key-files:
  created:
    - src/lib/export/clipGeometry.ts
  modified:
    - src/components/Sidebar/GenerateButton.tsx
    - src/components/Preview/RoadMesh.tsx
    - src/components/Preview/ExportPanel.tsx
    - src/lib/buildings/merge.ts

key-decisions:
  - "Road mesh Z-fighting fix uses both position offset (0.1 world units) AND polygonOffset material flags to ensure roads render above terrain in all GPU depth-buffer scenarios"
  - "Road fetch chained via .finally() not .then() — ensures roads always fetch even when buildings fail; both layers are optional"
  - "Building base Z uses Math.min (lowest terrain sample) so uphill walls extend below terrain and are hidden by occlusion — gives flush base appearance without extra geometry"
  - "Sutherland-Hodgman clipping applied in ExportPanel (export path only) — preview mesh is not clipped to keep preview fast; export STL clips to ±width/2, ±depth/2 footprint"

patterns-established:
  - "Gap closure plan pattern: UAT failures → root-cause diagnosis doc → targeted fix plan → re-test checkpoint"
  - "Export boundary clipping via Sutherland-Hodgman applied after geometry merge, before STL serialization"

requirements-completed: [ROAD-01, ROAD-02, ROAD-03]

# Metrics
duration: 15min
completed: 2026-02-25
---

# Phase 5 Plan 03: UAT Gap Closure Summary

**Six UAT road-layer failures resolved via Z-fighting fix (polygonOffset + position lift), sequential Overpass fetch, building base anchoring, and Sutherland-Hodgman export clipping**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-02-25
- **Completed:** 2026-02-25
- **Tasks:** 3 (2 auto + 1 checkpoint:human-verify)
- **Files modified:** 5

## Accomplishments

- Fixed invisible roads in 3D preview — Z-fighting was the root cause (road top face at exact terrain Z, occluded by terrain depth buffer)
- Fixed Overpass rate limiting — building and road fetches now sequential via `.finally()` chain instead of simultaneous
- Fixed floating buildings on slopes — `Math.min` anchors building base to the lowest terrain sample under footprint
- Added Sutherland-Hodgman triangle clipping in export pipeline — roads and buildings no longer extend past model boundary in STL
- All 6 phase-5 UAT tests confirmed passing by user

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix Overpass rate limiting — stagger road fetch after buildings** - `bc717b4` (fix)
2. **Task 2: Verify and commit all working-tree fixes (Z-fighting, clipping, building base)** - `49affb2` (fix)
3. **Task 3: UAT re-test — verify all 6 road failures are resolved** - human-verify checkpoint, approved by user

## Files Created/Modified

- `src/components/Sidebar/GenerateButton.tsx` — Changed `void fetchBuildings(); void fetchRoads()` to `fetchBuildings().finally(() => void fetchRoads())` — prevents simultaneous Overpass requests
- `src/components/Preview/RoadMesh.tsx` — Added `position={[0, 0, 0.1]}` mesh Z lift and `polygonOffset`, `polygonOffsetFactor={-4}`, `polygonOffsetUnits={-4}` to material — eliminates Z-fighting with terrain
- `src/lib/buildings/merge.ts` — Changed `Math.max(...sampledBaseZ)` to `Math.min(...sampledBaseZ)` for building base Z — anchors buildings to lowest terrain point under footprint
- `src/components/Preview/ExportPanel.tsx` — Imports and applies `clipGeometryToFootprint` to buildings and roads geometry before merge into export solid
- `src/lib/export/clipGeometry.ts` — New file implementing Sutherland-Hodgman polygon clipping for export pipeline; exports `clipGeometryToFootprint()`

## Decisions Made

- Road mesh uses both a position Z offset (0.1 world units) and `polygonOffset` material flags — the position offset is coarse but reliable; polygonOffset handles borderline cases. Combined approach covers all GPU depth-buffer scenarios.
- `.finally()` used instead of `.then()` for road fetch chaining — buildings and roads are both optional layers; a building fetch failure must not silently skip road fetch.
- Building base Z uses `Math.min` (not `Math.max`) — the lowest sampled terrain Z becomes the base; uphill-side walls extend below the terrain surface and are hidden by terrain occlusion, giving a flush appearance without extra geometry.
- Sutherland-Hodgman clipping is applied only in the export path (ExportPanel), not in the live preview (RoadMesh/BuildingMesh) — keeps preview fast while ensuring clean STL export geometry.

## Deviations from Plan

None — plan executed exactly as written. All three tasks completed as specified. The working-tree fixes (Tasks 1 and 2) were pre-existing from a debugging session and verified correct without modification.

## Issues Encountered

None — both automated tasks completed cleanly. All tests passed. UAT checkpoint approved by user on first attempt.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 5 (Roads Layer) is fully complete — all requirements ROAD-01, ROAD-02, ROAD-03 satisfied
- All 6 UAT road tests pass in browser
- Road mesh visible in preview and STL export; roads clipped cleanly at model boundary
- Phase 6 (Water Layer) can begin; export pipeline (ExportPanel, clipGeometry) is ready to receive a water layer on the same merge pattern
- Open concern: Coastal/ocean handling requires a concrete v1 decision before Phase 6 architecture is finalized

---
*Phase: 05-roads-layer*
*Completed: 2026-02-25*
