---
phase: 07-vegetation-terrain-smoothing
plan: 01
subsystem: ui
tags: [terrain, smoothing, slider, zustand, three.js, react]

# Dependency graph
requires:
  - phase: 06-water-layer
    provides: WaterMesh, applyWaterDepressions, water integration into terrain pipeline
provides:
  - smoothElevations exported function from terrain.ts for caller-side use
  - smoothingLevel store field (0-100, default 25) with setSmoothingLevel action
  - Smoothing slider UI in TerrainSection (0-100%, step 5, Raw/Smooth labels)
  - Caller-side smoothing pipeline in TerrainMesh, ExportPanel, WaterMesh
affects: [08-vegetation-layer, export-pipeline, terrain-mesh]

# Tech tracking
tech-stack:
  added: []
  patterns: [caller-controlled-smoothing, smooth-then-depress-then-build]

key-files:
  created: []
  modified:
    - src/lib/mesh/terrain.ts
    - src/store/mapStore.ts
    - src/components/Preview/TerrainSection.tsx
    - src/components/Preview/TerrainMesh.tsx
    - src/components/Preview/ExportPanel.tsx
    - src/components/Preview/WaterMesh.tsx

key-decisions:
  - "Smoothing moved to callers (TerrainMesh, ExportPanel, WaterMesh) not baked into buildTerrainGeometry — enables runtime slider control"
  - "Pipeline order fixed as: smoothElevations → applyWaterDepressions → buildTerrainGeometry — ensures water depressions carved into already-smoothed terrain, not blurred by post-smoothing"
  - "Radius mapping: Math.round((smoothingLevel / 100) * 8) — level=0 no-op, level=25 radius=2 (previous default), level=100 radius=8 (heavy smooth)"
  - "WaterMesh uses smoothed elevations for shoreline sampling — water overlay Z aligns with smoothed terrain surface"

patterns-established:
  - "Caller-side smoothing pattern: import smoothElevations, compute radius from store level, apply before water depression"
  - "Smooth-depress-build order: all three callers apply smoothing BEFORE applyWaterDepressions BEFORE buildTerrainGeometry"

requirements-completed: [TERR-04]

# Metrics
duration: 2min
completed: 2026-02-26
---

# Phase 7 Plan 01: Terrain Smoothing Slider Summary

**User-controlled terrain smoothing slider (0-100%) with caller-side Gaussian blur pipeline replacing hardcoded two-pass smoothing in buildTerrainGeometry**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-26T07:48:57Z
- **Completed:** 2026-02-26T07:51:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Exported `smoothElevations` from terrain.ts and removed hardcoded two-pass smoothing from `buildTerrainGeometry` and `updateTerrainElevation`
- Added `smoothingLevel` (0-100, default 25) state field and `setSmoothingLevel` action to Zustand store
- Added Smoothing slider UI (0-100%, step 5, Raw/Smooth endpoint labels) to TerrainSection below exaggeration slider
- Wired caller-side smoothing into TerrainMesh, ExportPanel, and WaterMesh — all three use pipeline order: smooth → water depression → build terrain
- All 176 existing tests pass with no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Export smoothElevations, remove hardcoded smoothing, add store field and slider UI** - `9128120` (feat)
2. **Task 2: Wire caller-side smoothing into TerrainMesh, ExportPanel, and WaterMesh** - `bcb4943` (feat)

## Files Created/Modified
- `src/lib/mesh/terrain.ts` - Exported `smoothElevations`; removed hardcoded two-pass smoothing from `buildTerrainGeometry` and `updateTerrainElevation`
- `src/store/mapStore.ts` - Added `smoothingLevel: number` state field (default 25) and `setSmoothingLevel` action
- `src/components/Preview/TerrainSection.tsx` - Added Smoothing slider (0-100%, step 5) between exaggeration and base plate; updated summary string
- `src/components/Preview/TerrainMesh.tsx` - Applies caller-side smoothing before applyWaterDepressions before buildTerrainGeometry; includes smoothingLevel in deps
- `src/components/Preview/ExportPanel.tsx` - Identical pipeline as TerrainMesh for STL export; smoothingLevel read from store
- `src/components/Preview/WaterMesh.tsx` - Uses smoothed elevations for shoreline sampling; includes smoothingLevel in deps

## Decisions Made
- Smoothing moved to callers, not baked into `buildTerrainGeometry` — this is what enables runtime slider control without changing the function signature
- Pipeline order locked as smooth → water depression → build terrain to ensure depressions are carved into smoothed terrain (not blurred away by post-smoothing)
- Radius formula `Math.round((smoothingLevel / 100) * 8)` maps level=25 to radius=2, which matches the old fine-pass radius for backwards-compatible default behavior

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Smoothing slider fully wired end-to-end in preview and export pipeline
- `smoothElevations` is now public API for any future callers (e.g., vegetation layer in Phase 8)
- All 176 tests pass — no regressions from removing hardcoded smoothing

---
*Phase: 07-vegetation-terrain-smoothing*
*Completed: 2026-02-26*
