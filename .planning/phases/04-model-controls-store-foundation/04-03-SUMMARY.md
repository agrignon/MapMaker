---
phase: 04-model-controls-store-foundation
plan: 03
subsystem: ui
tags: [three-js, zustand, terrain, mesh, stl-export, z-height]

# Dependency graph
requires:
  - phase: 04-model-controls-store-foundation
    provides: targetHeightMM stored in Zustand and displayed in ModelSizeSection UI
  - phase: 02-terrain-preview-export
    provides: buildTerrainGeometry, updateTerrainElevation, TerrainMeshParams
  - phase: 03-buildings
    provides: buildAllBuildings, BuildingGeometryParams, merge.ts
provides:
  - targetReliefMM optional field in TerrainMeshParams and BuildingGeometryParams
  - buildTerrainGeometry and updateTerrainElevation honor targetReliefMM override
  - buildAllBuildings honors targetReliefMM override for building-terrain alignment
  - TerrainMesh, BuildingMesh, ExportPanel all wire targetHeightMM from store to mesh generation
  - Export heightMM reflects user's Z override when set
affects: [05-roads, 06-water, 07-vegetation, 09-worker]

# Tech tracking
tech-stack:
  added: []
  patterns: [targetReliefMM override pattern — caller subtracts basePlateThicknessMM before passing to terrain/building params]

key-files:
  created: []
  modified:
    - src/lib/mesh/terrain.ts
    - src/lib/buildings/types.ts
    - src/lib/buildings/merge.ts
    - src/components/Preview/TerrainMesh.tsx
    - src/components/Preview/BuildingMesh.tsx
    - src/components/Preview/ExportPanel.tsx

key-decisions:
  - "targetReliefMM in TerrainMeshParams represents terrain surface max Z in mm (not total height including base plate); caller subtracts basePlateThicknessMM before passing"
  - "buildAllBuildings building heightMM refactored to use zScale directly (heightM * zScale) — algebraically equivalent in non-override case, correct for both TERR-03 floor and targetReliefMM override"
  - "targetReliefMM computation repeated in three places (TerrainMesh, BuildingMesh, ExportPanel) — intentional, premature extraction for a 1-line formula"

patterns-established:
  - "Z height override pattern: compute targetReliefMM = max(1, targetHeightMM - basePlateThicknessMM) in each call site; pass to both terrain and building params with identical formula for alignment"

requirements-completed: [CTRL-02]

# Metrics
duration: 3min
completed: 2026-02-25
---

# Phase 4 Plan 03: Z Height Override Wiring Summary

**targetHeightMM store value fully wired through terrain mesh, building mesh, and STL export pipeline so user's Z height override produces correctly scaled 3D preview and export**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-25T04:28:01Z
- **Completed:** 2026-02-25T04:30:41Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added optional `targetReliefMM` to `TerrainMeshParams` and `BuildingGeometryParams` — no breaking change to existing callers (optional field)
- `buildTerrainGeometry` and `updateTerrainElevation` now override `zScale = targetReliefMM / elevRange` when `targetReliefMM > 0`
- `buildAllBuildings` applies identical zScale override for perfect building-terrain alignment; building `heightMM` refactored to use `zScale` directly
- `TerrainMesh`, `BuildingMesh`, and `ExportPanel` all read `targetHeightMM` from store, compute `targetReliefMM = max(1, targetHeightMM - basePlateThicknessMM)`, and pass to mesh generation
- Export result `heightMM` uses `targetHeightMM` directly when override is set; falls back to geometry scan for auto mode

## Task Commits

Each task was committed atomically:

1. **Task 1: Add targetReliefMM to terrain and building Z-scale computation** - `f33ae0d` (feat)
2. **Task 2: Wire targetHeightMM from store through TerrainMesh, BuildingMesh, and ExportPanel** - `d500db0` (feat)

**Plan metadata:** (docs commit — see final commit)

## Files Created/Modified

- `src/lib/mesh/terrain.ts` - Added `targetReliefMM?` to `TerrainMeshParams`; override zScale in `buildTerrainGeometry` and `updateTerrainElevation` when `targetReliefMM > 0`
- `src/lib/buildings/types.ts` - Added `targetReliefMM?` to `BuildingGeometryParams`
- `src/lib/buildings/merge.ts` - Override zScale in `buildAllBuildings` when `targetReliefMM > 0`; refactor building `heightMM` to use `zScale` directly
- `src/components/Preview/TerrainMesh.tsx` - Read `targetHeightMM` from store; compute and pass `targetReliefMM` in params; add to dependency array
- `src/components/Preview/BuildingMesh.tsx` - Read `targetHeightMM` and `basePlateThicknessMM` from store; compute and pass `targetReliefMM`; add to dependency array
- `src/components/Preview/ExportPanel.tsx` - Read `targetHeightMM` from store; compute `targetReliefMM`; pass to both terrain and building params; use `targetHeightMM` directly for export `heightMM` when set

## Decisions Made

- `targetReliefMM` in `TerrainMeshParams` represents terrain surface max Z (not total including base plate); each call site subtracts `basePlateThicknessMM` before passing. This keeps the library function focused on terrain surface geometry.
- Building height conversion refactored from `heightM * horizontalScale * exaggeration` to `heightM * zScale` in all cases — algebraically identical in the non-override case, and the only correct formula when `targetReliefMM` overrides `zScale`.
- `targetReliefMM` computation is repeated in three places (TerrainMesh, BuildingMesh, ExportPanel). This is intentional — premature extraction for a 1-line formula. Extract in a future phase if it appears in more places.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CTRL-02 (Z height) is now fully functional: store value propagates through preview and export pipelines
- Phase 4 gap closure complete — all CTRL-01 through CTRL-04 requirements fully wired
- Ready for Phase 5 (Roads)

---
*Phase: 04-model-controls-store-foundation*
*Completed: 2026-02-25*
