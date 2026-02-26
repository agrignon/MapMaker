---
phase: 06-water-layer
plan: 02
subsystem: water
tags: [water, terrain, earcut, zustand, overpass, depression, three.js, r3f]

# Dependency graph
requires:
  - phase: 06-water-layer/06-01
    provides: fetchWaterData, parseWaterFeatures, applyWaterDepressions, WaterFeature type
  - phase: 05-roads-layer
    provides: RoadMesh pattern for visual overlay; GenerateButton fetch chain pattern
  - phase: 04-model-controls-store-foundation
    provides: CollapsibleSection, LayerToggles, setLayerToggle store action
provides:
  - src/store/mapStore.ts — waterFeatures, waterGenerationStatus, waterGenerationStep state + actions
  - src/components/Preview/WaterMesh.tsx — flat earcut-triangulated blue overlay at depression Z
  - src/components/Preview/WaterSection.tsx — sidebar section with toggle and feature count
  - src/components/Preview/TerrainMesh.tsx — modified with applyWaterDepressions pre-processing
  - src/components/Preview/ExportPanel.tsx — modified with applyWaterDepressions in export pipeline
  - src/lib/export/stlExport.ts — generateFilename with hasWater param
affects:
  - WATR-01 (completed — water bodies visible in preview and baked into exported STL)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Water fetch chained after roads via .finally() — staggered Overpass requests prevent rate limiting
    - Copy-before-modify immutability pattern — effectiveElevData computed per render, store never mutated
    - Earcut polygon triangulation for WaterMesh — handles holes (islands) via holeIndices array
    - Per-feature shoreline minimum sampling — sets depression Z per polygon, not globally
    - PolygonOffset + position Z lift dual strategy for WaterMesh — same as RoadMesh for Z-fighting

key-files:
  created:
    - src/components/Preview/WaterMesh.tsx
    - src/components/Preview/WaterSection.tsx
  modified:
    - src/store/mapStore.ts
    - src/components/Sidebar/GenerateButton.tsx
    - src/components/Preview/TerrainMesh.tsx
    - src/components/Preview/ExportPanel.tsx
    - src/components/Preview/PreviewCanvas.tsx
    - src/components/Preview/PreviewSidebar.tsx
    - src/lib/export/stlExport.ts

key-decisions:
  - "WaterMesh uses earcut triangulation (not worker) — flat polygon tessellation is cheap enough for main thread; avoids complexity of worker for non-animated geometry"
  - "TerrainMesh uses effectiveElevData COPY — applyWaterDepressions always returns a new ElevationData so toggling water off restores original terrain without store mutation"
  - "WaterMesh position Z offset 0.15 + polygonOffsetFactor -6 — stronger polygon offset than roads (-4) ensures water renders above depressed terrain without Z-fighting"
  - "generateFilename adds hasWater param with -water suffix — consistent layer suffix pattern: terrain[-buildings][-roads][-water]"
  - "Ocean limitation documented in WaterSection UI — 'Ocean areas are not yet supported' text per research phase decision"

patterns-established:
  - "Water fetch status display in GenerateButton follows identical road/building spinner pattern"
  - "WaterSection follows RoadsSection CollapsibleSection pattern exactly"

requirements-completed: [WATR-01]

# Metrics
duration: 4min
completed: 2026-02-26
---

# Phase 06 Plan 02: Water Layer UI Integration Summary

**End-to-end water layer: store state, Overpass fetch chain, terrain depression bake, earcut visual overlay, sidebar toggle, export pipeline — water bodies appear as blue depressions in 3D preview and are physically baked into exported STL**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-26T06:12:08Z
- **Completed:** 2026-02-26T06:16:xx
- **Tasks:** 2
- **Files created:** 2
- **Files modified:** 7

## Accomplishments

- Zustand store extended with waterFeatures, waterGenerationStatus, waterGenerationStep + setWaterFeatures / setWaterGenerationStatus actions
- GenerateButton: fetchWater() added, chained after roads via nested .finally() — buildings → roads → water fetch sequence; water spinner status shown below roads status
- TerrainMesh: applyWaterDepressions() applied before buildTerrainGeometry() when water visible — effectiveElevData copy ensures store data is never mutated; toggle off restores original terrain
- ExportPanel: applyWaterDepressions() applied before terrain build — depression baked into exported STL; generateFilename updated with hasWater param and -water suffix
- WaterMesh: 172-line earcut-based flat polygon triangulation at depression Z; clipping planes at terrain edges; blue color (#3b82f6); transparent opacity 0.85; polygonOffset -6 prevents Z-fighting
- WaterSection: CollapsibleSection with toggle and feature count; shows "Ocean areas are not yet supported" limitation note
- PreviewCanvas: WaterMesh added after RoadMesh inside SceneErrorBoundary
- PreviewSidebar: WaterSection replaces LayerPlaceholderSection for Water; Vegetation still placeholder
- 176 unit tests pass (zero regressions); TypeScript compiles clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend store, wire fetch chain, TerrainMesh + ExportPanel depression bake** - `679b09d` (feat)
2. **Task 2: Create WaterMesh + WaterSection, wire into PreviewCanvas and PreviewSidebar** - `e6d806a` (feat)

## Files Created/Modified

**Created:**
- `src/components/Preview/WaterMesh.tsx` — flat blue earcut-triangulated overlay at depression Z (172 lines)
- `src/components/Preview/WaterSection.tsx` — sidebar CollapsibleSection with toggle, feature count, ocean note (41 lines)

**Modified:**
- `src/store/mapStore.ts` — water state fields + actions following road pattern
- `src/components/Sidebar/GenerateButton.tsx` — fetchWater(), chain update, water status display
- `src/components/Preview/TerrainMesh.tsx` — applyWaterDepressions pre-processing + new deps
- `src/components/Preview/ExportPanel.tsx` — water depression bake + hasWater filename param
- `src/components/Preview/PreviewCanvas.tsx` — WaterMesh import + placement
- `src/components/Preview/PreviewSidebar.tsx` — WaterSection import + replacement of placeholder
- `src/lib/export/stlExport.ts` — generateFilename hasWater param + -water suffix

## Decisions Made

- WaterMesh uses earcut on main thread (not worker): flat polygon tessellation is fast enough; worker adds complexity without performance benefit for non-animated geometry.
- Copy-before-modify immutability in TerrainMesh: applyWaterDepressions returns new ElevationData, so toggling water off simply omits the call and the original store data is used — no state restoration required.
- PolygonOffset factor -6 for WaterMesh (vs -4 for roads): water must render above the depressed terrain surface, requiring stronger offset.
- -water filename suffix: follows existing terrain[-buildings][-roads] pattern consistently.
- Ocean limitation documented in UI: "Ocean areas are not yet supported" — per Phase 6 research decision, ocean handling is deferred to v2.

## Deviations from Plan

None — plan executed exactly as written. All implementation code provided in the plan was used verbatim.

## Issues Encountered

None. TypeScript compiled clean on first attempt. All 176 tests passed throughout execution.

## User Setup Required

None — water layer uses Overpass API (public, no key required).

## Next Phase Readiness

- WATR-01 complete: water bodies visible as blue depressions in preview; baked into exported STL
- Phase 6 complete: water library (Plan 01) + UI integration (Plan 02) both done
- Phase 7 (Vegetation) can follow the same water pattern: store fields → fetch chain → overlay mesh → sidebar section

---
*Phase: 06-water-layer*
*Completed: 2026-02-26*

## Self-Check: PASSED

- FOUND: src/components/Preview/WaterMesh.tsx
- FOUND: src/components/Preview/WaterSection.tsx
- FOUND: .planning/phases/06-water-layer/06-02-SUMMARY.md
- FOUND: commit 679b09d (Task 1)
- FOUND: commit e6d806a (Task 2)
