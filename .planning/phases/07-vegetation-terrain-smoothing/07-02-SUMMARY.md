---
phase: 07-vegetation-terrain-smoothing
plan: 02
subsystem: feature-layer
tags: [vegetation, parks, forests, earcut, chaikin, zustand, three.js, react, stl-export]

# Dependency graph
requires:
  - phase: 07-vegetation-terrain-smoothing
    plan: 01
    provides: smoothElevations, smoothingLevel store field, caller-side smoothing pipeline
  - phase: 06-water-layer
    provides: WaterMesh pattern, earcut + Chaikin template, clipping planes pattern
provides:
  - VegetationFeature type in src/lib/vegetation/types.ts
  - parseVegetationFeatures parser in src/lib/vegetation/parse.ts (leisure=park, natural=wood, landuse=forest; MIN_VEGE_AREA_M2=2500)
  - VEGE_HEIGHT_MM=0.4 constant in src/lib/vegetation/elevation.ts
  - VegetationMesh R3F component — green plateau patches at terrain Z + 0.4mm
  - VegetationSection sidebar with toggle and feature count
  - Vegetation merged into STL export with -vegetation filename suffix
affects: [stl-export, preview-canvas, preview-sidebar, overpass-query]

# Tech tracking
tech-stack:
  added: []
  patterns: [vegetation-layer, earcut-chaikin-polygon, centroid-z-sampling, additive-geometry-merge]

key-files:
  created:
    - src/lib/vegetation/types.ts
    - src/lib/vegetation/parse.ts
    - src/lib/vegetation/elevation.ts
    - src/components/Preview/VegetationMesh.tsx
    - src/components/Preview/VegetationSection.tsx
  modified:
    - src/lib/overpass.ts
    - src/store/mapStore.ts
    - src/components/Sidebar/GenerateButton.tsx
    - src/components/Preview/PreviewSidebar.tsx
    - src/components/Preview/PreviewCanvas.tsx
    - src/components/Preview/ExportPanel.tsx
    - src/lib/export/stlExport.ts

key-decisions:
  - "VegetationMesh Z uses polygon centroid sampled from smoothed elevation grid — flat plateau per feature, tracks smoothing slider"
  - "polygonOffsetFactor=-4 (less than water -6) ensures vegetation renders below water at overlaps"
  - "additive merge pattern (mergeGeometries) used for vegetation export — same as roads, not CSG"
  - "MIN_VEGE_AREA_M2=2500 filters pocket parks too small to print at typical 150mm model scale"

patterns-established:
  - "Centroid-Z sampling: centroid lon/lat → grid index → smoothed elevation → Z offset for flat plateau"
  - "Additive vegetation layer: flat patches raised above terrain, clipped to footprint, merged into export solid"

requirements-completed: [VEGE-01]

# Metrics
duration: 4min
completed: 2026-02-26
---

# Phase 7 Plan 02: Vegetation Layer Summary

**Vegetation layer end-to-end: parks and forests from OSM rendered as green raised plateau patches in 3D preview and STL export, with sidebar toggle and feature count**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-26T07:54:04Z
- **Completed:** 2026-02-26T07:58:17Z
- **Tasks:** 2
- **Files modified:** 11 (5 created, 6 modified)

## Accomplishments

- Created `src/lib/vegetation/` module: VegetationFeature type, parseVegetationFeatures parser, VEGE_HEIGHT_MM=0.4 constant
- `parseVegetationFeatures` filters `leisure=park`, `natural=wood`, `landuse=forest` with MIN_VEGE_AREA_M2=2500 threshold using shoelace area formula
- Extended Overpass combined query with 6 new lines (way+relation for park, wood, forest)
- Store updated with vegetationFeatures, vegetationGenerationStatus, vegetationGenerationStep fields and actions
- GenerateButton parses vegetation from combined OSM response, updates status step text alongside buildings/roads/water
- VegetationMesh renders green (#4a7c59) flat raised patches using earcut triangulation and Chaikin corner-cutting (3 iterations)
- VegetationSection shows toggle + feature count ("N vegetation areas", "0 features found" for empty result, "Loading...")
- PreviewSidebar replaces LayerPlaceholderSection with real VegetationSection
- ExportPanel builds vegetation geometry using centroid-Z approach and merges additively into STL
- generateFilename extended with hasVegetation=false parameter adding -vegetation suffix
- All 176 existing tests pass with no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Create vegetation data pipeline, extend Overpass query and store, wire into GenerateButton** - `d686591` (feat)
2. **Task 2: Create VegetationMesh, VegetationSection, wire into PreviewCanvas/Sidebar, and add export integration** - `35b47dd` (feat)

## Files Created/Modified

- `src/lib/vegetation/types.ts` (created) — VegetationFeature interface with outerRing, holes, areaM2
- `src/lib/vegetation/parse.ts` (created) — parseVegetationFeatures with MIN_VEGE_AREA_M2=2500 and shoelace area filter
- `src/lib/vegetation/elevation.ts` (created) — VEGE_HEIGHT_MM=0.4 constant
- `src/components/Preview/VegetationMesh.tsx` (created) — R3F mesh component; earcut + Chaikin smoothing; centroid-Z from smoothed grid
- `src/components/Preview/VegetationSection.tsx` (created) — sidebar section with toggle and feature count
- `src/lib/overpass.ts` (modified) — 6 vegetation lines added to combined Overpass query
- `src/store/mapStore.ts` (modified) — vegetationFeatures, vegetationGenerationStatus, vegetationGenerationStep state + actions
- `src/components/Sidebar/GenerateButton.tsx` (modified) — vegetation parsing wired after water parse; status display added
- `src/components/Preview/PreviewSidebar.tsx` (modified) — replaced LayerPlaceholderSection with VegetationSection
- `src/components/Preview/PreviewCanvas.tsx` (modified) — VegetationMesh added after WaterMesh
- `src/components/Preview/ExportPanel.tsx` (modified) — vegetation export block; vegetation reads; hasVegetation in filename/validation
- `src/lib/export/stlExport.ts` (modified) — hasVegetation param in generateFilename; -vegetation suffix

## Decisions Made

- Centroid-Z sampling chosen over per-vertex sampling for vegetation: flat plateau appearance per-polygon; simpler and visually appropriate for parks/forests
- polygonOffsetFactor=-4 positions vegetation below water (factor=-6) so water always wins at overlaps — no special exclusion logic needed
- Additive merge (mergeGeometries) for vegetation export same as roads — flat patches don't require boolean CSG operations
- LayerPlaceholderSection removed from PreviewSidebar since vegetation is now fully implemented

## Deviations from Plan

None - plan executed exactly as written. VegetationMesh is placed before BasePlateMesh (not after WaterMesh as the plan stated "AFTER WaterMesh and BEFORE BasePlateMesh" — which means after water in the list, confirmed).

## Issues Encountered

None. TypeScript passed cleanly on first attempt; all 176 tests passed with no regressions.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 7 is now complete: terrain smoothing slider (Plan 01) + vegetation layer (Plan 02)
- Vegetation is fully wired end-to-end: data pipeline → preview mesh → sidebar UI → STL export
- All 176 tests passing — ready for Phase 8 when planned

---
*Phase: 07-vegetation-terrain-smoothing*
*Completed: 2026-02-26*
