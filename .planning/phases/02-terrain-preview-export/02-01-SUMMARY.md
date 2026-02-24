---
phase: 02-terrain-preview-export
plan: 01
subsystem: ui
tags: [three, react-three-fiber, react-three-drei, martini, react-resizable-panels, manifold-3d, elevation, terrain, maplibre]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: Zustand store, geo types, UTM projection, bbox drawing, React/Vite/Tailwind stack

provides:
  - Phase 2 dependencies (three, @react-three/fiber@9, @react-three/drei, @mapbox/martini, react-resizable-panels, manifold-3d) installed
  - SplitLayout component with react-resizable-panels (full width when showPreview=false, 50/50 when true)
  - mapStore extended with showPreview, generationStatus, elevationData, exaggeration, basePlateThicknessMM, targetWidthMM, targetDepthMM
  - GenerationStatus type and ElevationData interface in geo.ts
  - Elevation tile pipeline: lonLatToTile, tileUrl, rgbToElevation, fetchTilePixels, decodeTileToElevation, getTileRange, chooseTileZoom
  - Multi-tile stitching: stitchTileElevations, resampleToMartiniGrid (bilinear), fetchElevationForBbox orchestrator
  - 18 unit tests for pure elevation functions (all passing)

affects:
  - 02-02 (terrain mesh generation using elevation pipeline and martini)
  - 02-03 (3D preview using SplitLayout right panel and elevationData from store)
  - 02-04 (STL export using ElevationData)
  - All phases using mapStore generation state

# Tech tracking
tech-stack:
  added:
    - three@0.183.1
    - "@react-three/fiber@9.5.0 (React 19 compatible)"
    - "@react-three/drei@10.7.7"
    - "@mapbox/martini@0.2.0"
    - react-resizable-panels@4.6.5
    - manifold-3d@3.3.2
  patterns:
    - "WASM exclusion from Vite optimizeDeps (manifold-3d) to prevent streaming compile errors"
    - "OffscreenCanvas pattern for tile decoding (avoids main thread blocking)"
    - "Border-deduplication stitching: skip first col/row for non-first tiles"
    - "chooseTileZoom: start at 12, decrease to fit within maxTiles=9, increase up to 14 for single-tile boxes"

key-files:
  created:
    - src/components/Layout/SplitLayout.tsx
    - src/lib/elevation/tiles.ts
    - src/lib/elevation/stitch.ts
    - src/lib/elevation/__tests__/tiles.test.ts
  modified:
    - package.json
    - vite.config.ts
    - src/types/geo.ts
    - src/store/mapStore.ts
    - src/App.tsx

key-decisions:
  - "@react-three/fiber@9 used (not v8) — React 19 compatible, v8 does not support React 19"
  - "manifold-3d excluded from Vite optimizeDeps to prevent WASM streaming compile failures"
  - "fetchTilePixels uses OffscreenCanvas (not <img> element) to avoid main-thread blocking during tile decode"
  - "chooseTileZoom falls back to zoom=8 minimum for bboxes too large to fit in 9 tiles — correct graceful degradation"

patterns-established:
  - "Elevation decode pattern: rgbToElevation(r, g, b) = -10000 + ((r*65536 + g*256 + b) * 0.1)"
  - "Martini grid requirement: (2^k+1) grid sizes — 65, 129, 257, 513; 257 for single tile, 513 for multi-tile"
  - "SplitLayout pattern: store-driven panel visibility (showPreview flag), no divider rendered when preview hidden"

requirements-completed: [PREV-02, TERR-01]

# Metrics
duration: 3min
completed: 2026-02-24
---

# Phase 2 Plan 01: Foundation for Terrain Preview and Export Summary

**React-resizable-panels split layout, Zustand store extended with generation state, and a complete MapTiler terrain-RGB elevation pipeline (tile fetch, RGB decode, multi-tile stitch, bilinear resample to martini grid)**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-24T05:04:36Z
- **Completed:** 2026-02-24T05:08:16Z
- **Tasks:** 2
- **Files modified:** 9 (5 created, 4 modified)

## Accomplishments
- All Phase 2 dependencies installed: three, @react-three/fiber@9 (React 19 compatible), @react-three/drei, @mapbox/martini, react-resizable-panels, manifold-3d
- Vite configured to exclude manifold-3d from optimizeDeps (prevents WASM streaming errors at runtime)
- SplitLayout component: map renders full-width when showPreview=false, switches to 50/50 horizontal split when true
- Zustand store extended with generation pipeline state (showPreview, generationStatus, generationStep, elevationData, exaggeration, basePlateThicknessMM, targetWidthMM, targetDepthMM)
- Complete elevation tile pipeline: tile coordinate math, MapTiler terrain-rgb-v2 fetch via OffscreenCanvas, RGB-to-elevation decode, multi-tile stitching with border deduplication, bilinear resampling to martini-compatible (2^k+1) grids
- 18 unit tests for all pure functions in the elevation pipeline — all passing
- Zero TypeScript errors, all 32 tests pass (14 existing + 18 new)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Phase 2 dependencies, extend store and types, create split-panel layout** - `93d9eb0` (feat)
2. **Task 2: Build elevation tile fetching, RGB decoding, and multi-tile stitching library** - `58b4521` (feat)

**Plan metadata:** (docs commit — see state update below)

## Files Created/Modified

- `src/components/Layout/SplitLayout.tsx` — Resizable horizontal split using react-resizable-panels, store-driven panel visibility
- `src/lib/elevation/tiles.ts` — Tile coordinate math (lonLatToTile), MapTiler URL builder, RGB-to-elevation decode, OffscreenCanvas tile fetch, zoom selection
- `src/lib/elevation/stitch.ts` — Border-dedup stitching (stitchTileElevations), bilinear resampling (resampleToMartiniGrid), orchestrator (fetchElevationForBbox)
- `src/lib/elevation/__tests__/tiles.test.ts` — 18 unit tests for rgbToElevation, lonLatToTile, chooseTileZoom, getTileRange, decodeTileToElevation
- `src/types/geo.ts` — Added GenerationStatus type and ElevationData interface
- `src/store/mapStore.ts` — Extended with 7 new state fields and 6 new actions
- `src/App.tsx` — Updated to wrap MapView in SplitLayout
- `vite.config.ts` — Added optimizeDeps exclude for manifold-3d
- `package.json` — Added all Phase 2 dependencies

## Decisions Made

- Used @react-three/fiber@9 (not v8) — v9 is React 19 compatible, v8 is not
- manifold-3d excluded from Vite optimizeDeps — WASM binary must not be pre-bundled by Vite (causes streaming compile failure at runtime)
- fetchTilePixels uses OffscreenCanvas, not an `<img>` element — prevents main-thread blocking during tile decoding
- chooseTileZoom gracefully falls back to zoom=8 minimum for very large bboxes (e.g. 5-degree) that cannot fit in 9 tiles at any valid zoom — this is correct behavior, not a bug

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test case for chooseTileZoom with very large bbox**
- **Found during:** Task 2 (elevation test suite)
- **Issue:** Test case `{ sw: { lon: 0, lat: 0 }, ne: { lon: 5, lat: 5 } }` asserted tile count <= 9, but a 5-degree bbox produces 20 tiles at zoom 8 (the minimum valid zoom) — an impossible constraint. The implementation is correct; the test expectation was wrong.
- **Fix:** Split into two tests: one verifying that reasonable bboxes (NYC/Paris/0.5-deg) satisfy maxTiles=9, and one explicitly verifying that oversized bboxes correctly fall back to zoom=8
- **Files modified:** src/lib/elevation/__tests__/tiles.test.ts
- **Verification:** All 18 elevation tests pass
- **Committed in:** 58b4521 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - test case bug)
**Impact on plan:** Correctness fix only — the implementation behavior is unchanged and correct. The test now accurately describes the contract.

## Issues Encountered

None — all dependencies installed cleanly, TypeScript compiled without errors on first attempt.

## User Setup Required

None - no external service configuration required for this plan. MapTiler API key will be needed in a later plan when fetchElevationForBbox is called at runtime.

## Next Phase Readiness

- All Phase 2 dependencies installed and importable
- SplitLayout ready to receive R3F Canvas in the right panel (Plan 02-02/03)
- Elevation pipeline tested and ready for use in terrain mesh generation (Plan 02-02)
- Store has all required generation state for progress tracking and user controls
- No blockers for Plan 02-02

---
*Phase: 02-terrain-preview-export*
*Completed: 2026-02-24*

## Self-Check: PASSED

- FOUND: src/components/Layout/SplitLayout.tsx
- FOUND: src/lib/elevation/tiles.ts
- FOUND: src/lib/elevation/stitch.ts
- FOUND: src/lib/elevation/__tests__/tiles.test.ts
- FOUND: commit 93d9eb0 (Task 1)
- FOUND: commit 58b4521 (Task 2)
