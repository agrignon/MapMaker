---
phase: 06-water-layer
plan: 01
subsystem: water
tags: [osmtogeojson, overpass, elevation, geometry, three.js, vitest]

# Dependency graph
requires:
  - phase: 05-roads-layer
    provides: Overpass fetch + osmtogeojson parse pattern; ElevationData type from geo.ts
  - phase: 02-terrain-preview-export
    provides: ElevationData interface and terrain elevation grid
provides:
  - src/lib/water/types.ts — WaterFeature interface
  - src/lib/water/overpass.ts — fetchWaterData() Overpass API fetcher
  - src/lib/water/parse.ts — parseWaterFeatures() OSM JSON to WaterFeature[] converter
  - src/lib/water/depression.ts — applyWaterDepressions() elevation grid depression bake
  - 14 unit tests for parse and depression (7 each)
affects:
  - 06-water-layer/06-02 (wires water pipeline into UI and terrain generation)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - osmtogeojson parse pattern (same as roads) — mock osmtogeojson in tests, return GeoJSON directly
    - Elevation grid rasterization via ray-cast pointInRing (Jordan curve theorem)
    - Polygon bbox culling before rasterization for performance
    - Shoreline minimum sampling to set depression depth
    - Immutability pattern — always copy Float32Array before modifying

key-files:
  created:
    - src/lib/water/types.ts
    - src/lib/water/overpass.ts
    - src/lib/water/parse.ts
    - src/lib/water/depression.ts
    - src/lib/water/__tests__/parse.test.ts
    - src/lib/water/__tests__/depression.test.ts
  modified: []

key-decisions:
  - "WATER_DEPRESSION_M = 3.0m below shoreline minimum — tuned to survive Gaussian smoothing"
  - "pointInRing uses Jordan curve theorem ray-cast — standard polygon inclusion test, handles concave shapes"
  - "applyWaterDepressions always returns new ElevationData — Float32Array copied before modification, input never mutated"
  - "Overpass query includes >;out skel qt; for relation member recursion — required to reconstruct MultiPolygon water bodies"
  - "Polygon bbox culling before cell iteration — avoids N^2 cell tests for large grids with small polygons"

patterns-established:
  - "Water parse tests mock osmtogeojson like roads tests — no real API calls in unit tests"
  - "Depression tests use 5x5 grid with simple bbox {sw:{0,0},ne:{1,1}} for predictable coordinate math"

requirements-completed: [WATR-01]

# Metrics
duration: 3min
completed: 2026-02-26
---

# Phase 06 Plan 01: Water Library — TDD Pipeline Summary

**OSM water data pipeline: types, Overpass fetcher, osmtogeojson parser, and elevation grid depression bake with island exclusion — 14 unit tests, all passing**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-26T06:06:29Z
- **Completed:** 2026-02-26T06:09:18Z
- **Tasks:** 2 (TDD: RED then GREEN)
- **Files created:** 6

## Accomplishments
- WaterFeature interface defined with outerRing + holes for island-in-lake support
- fetchWaterData() Overpass query includes relation member recursion (>;out skel qt;) for MultiPolygon water bodies
- parseWaterFeatures() handles Polygon and MultiPolygon from osmtogeojson; skips LineString; filters degenerate rings
- applyWaterDepressions() rasterizes water polygons onto elevation grid using ray-cast point-in-polygon; island holes excluded; input ElevationData never mutated; min/max recomputed
- 14 unit tests pass across parse and depression test files; 176 total suite tests green (0 regressions)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create water types and failing tests** - `155a56d` (test)
2. **Task 2: Implement parse, depression, overpass — GREEN** - `babf54a` (feat)

## Files Created/Modified
- `src/lib/water/types.ts` — WaterFeature interface (outerRing, holes)
- `src/lib/water/overpass.ts` — fetchWaterData() with relation recursion Overpass query
- `src/lib/water/parse.ts` — parseWaterFeatures() via osmtogeojson; Polygon + MultiPolygon support
- `src/lib/water/depression.ts` — applyWaterDepressions() rasterization + WATER_DEPRESSION_M constant
- `src/lib/water/__tests__/parse.test.ts` — 7 tests: Polygon, MultiPolygon+holes, LineString skip, degenerate filter, multiple features
- `src/lib/water/__tests__/depression.test.ts` — 7 tests: depression applied, island excluded, immutability, min/max recomputed, no-op empty

## Decisions Made
- WATER_DEPRESSION_M = 3.0m: Set at 3m below shoreline minimum to ensure the depression survives any future Gaussian smoothing applied to the elevation grid.
- Jordan curve ray-cast for pointInRing: Standard algorithm works for both convex and concave polygon shapes without needing a geometry library.
- Immutability enforced by test: The "returns new ElevationData" test verifies byte-by-byte that the input Float32Array is unchanged after calling applyWaterDepressions.
- Relation recursion (>;out skel qt;): Required by osmtogeojson to reconstruct MultiPolygon geometry from Overpass relation members; without it, island-in-lake shapes would fail to parse.

## Deviations from Plan

None — plan executed exactly as written. Implementation code provided in plan was used verbatim.

## Issues Encountered

None. TDD cycle completed cleanly: RED (import errors due to missing modules) → GREEN (all 14 tests pass).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness
- Water library module is self-contained and ready for Plan 02 integration
- Plan 02 will wire fetchWaterData + parseWaterFeatures into the terrain generation pipeline (calling applyWaterDepressions before buildTerrainGeometry)
- WaterMesh.tsx visual overlay component will be built in Plan 02

---
*Phase: 06-water-layer*
*Completed: 2026-02-26*
