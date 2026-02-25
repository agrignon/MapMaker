---
phase: 03-buildings
plan: 03
subsystem: buildings
tags: [three-bvh-csg, csg-union, stl-export, manifold, buildingSolid, export-pipeline, vitest]

# Dependency graph
requires:
  - phase: 03-buildings
    plan: 01
    provides: "buildAllBuildings, BuildingFeature, BuildingGeometryParams — building geometry pipeline"
  - phase: 03-buildings
    plan: 02
    provides: "BuildingMesh, buildingFeatures in store — buildings visible in 3D preview"
  - phase: 02-terrain-preview-export
    provides: "buildSolidMesh, exportToSTL, generateFilename, validateMesh — terrain export pipeline"
provides:
  - "unionBuildingsWithTerrain: CSG ADDITION of terrain solid + buildings geometry via three-bvh-csg Evaluator"
  - "mergeTerrainAndBuildings: try CSG union first, fallback to mergeGeometries if CSG fails/throws"
  - "Updated ExportPanel: includes building geometry in STL export when buildingFeatures exist in store"
  - "Updated generateFilename: optional hasBuildings flag → -terrain-buildings.stl vs -terrain.stl suffix"
  - "buildingSolid.test.ts: 6 tests covering CSG union, triangle count, indexed input handling, fallback path, manifold validation"
affects:
  - "03-04 (if any): buildings are now in exported STL — future plans can assume full pipeline is complete"
  - "Human verification gate: user verifies buildings appear in 3D preview and exported STL opens cleanly in slicer"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CSG union pattern: Brush(nonIndexedGeo) + updateMatrixWorld + Evaluator.evaluate(a, b, ADDITION)"
    - "Evaluator attributes=['position', 'normal'] — skip UV to avoid missing-attribute errors"
    - "Try/catch around synchronous CSG + Date.now() elapsed check for timeout detection"
    - "Non-manifold seam warning pattern: warn but allow export when buildings present, block for terrain-only"
    - "Export pipeline: terrain solid → buildings geometry → mergeTerrainAndBuildings → validate → STL"

key-files:
  created:
    - "src/lib/mesh/buildingSolid.ts: unionBuildingsWithTerrain, mergeTerrainAndBuildings with CSG + fallback"
    - "src/lib/mesh/__tests__/buildingSolid.test.ts: 6 tests for CSG union and fallback path"
  modified:
    - "src/components/Preview/ExportPanel.tsx: building-aware export — checks buildingFeatures, calls mergeTerrainAndBuildings"
    - "src/lib/export/stlExport.ts: generateFilename hasBuildings flag → terrain-buildings.stl suffix"

key-decisions:
  - "CSG fallback to mergeGeometries: if three-bvh-csg throws or takes >10s, fall back to simple geometry merge — better than blocking export with an error"
  - "Non-manifold seam warning (non-blocking): buildings + terrain may have non-manifold seams at building bases — warn user but allow export since slicers auto-repair"
  - "Evaluator attributes=['position', 'normal']: skip UV attributes entirely — STL export does not need UV, and missing UV attributes caused CSG errors"
  - "Strip non-position/normal attributes before CSG: prevents attribute mismatch errors in three-bvh-csg Evaluator"

patterns-established:
  - "CSG pattern: Brush(nonIndexed) + updateMatrixWorld(true) + evaluator.evaluate(a, b, ADDITION)"
  - "Export pipeline extension: terrainSolid → optional building merge → validate → STL"
  - "Filename suffix: generateFilename(bbox, locationName, hasBuildings) — boolean flag selects suffix variant"

requirements-completed: [BLDG-01, BLDG-04]

# Metrics
duration: ~5min
completed: 2026-02-24
---

# Phase 3 Plan 03: CSG Union and Building Export Integration Summary

**three-bvh-csg ADDITION union of terrain solid + buildings geometry, wired into STL export pipeline with CSG-failure fallback and non-manifold seam warning**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-02-24 (prior session)
- **Completed:** 2026-02-24
- **Tasks:** 1 (+ 1 human verification checkpoint)
- **Files modified:** 4 (2 new, 2 modified)

## Accomplishments

- `buildingSolid.ts` created: `unionBuildingsWithTerrain` performs CSG ADDITION via three-bvh-csg; `mergeTerrainAndBuildings` adds try/catch fallback to `mergeGeometries` if CSG fails or exceeds 10s
- `ExportPanel.tsx` updated: after building terrain solid, checks `buildingFeatures` from store; if present, calls `buildAllBuildings` + `mergeTerrainAndBuildings`; non-manifold seam warning shown (non-blocking) instead of blocking export
- `generateFilename` in `stlExport.ts` updated with `hasBuildings: boolean` flag — produces `-terrain-buildings.stl` or `-terrain-buildings-{coords}.stl` suffix variants
- 6 new tests added in `buildingSolid.test.ts`: CSG union geometry shape, triangle count increase, indexed input handling, fallback path, manifold validation (WASM-tolerant)
- All 115 tests pass, TypeScript compiles with zero errors
- Export is backward compatible — areas without buildings export terrain-only as before

## Task Commits

Each task was committed atomically:

1. **Task 1: Create CSG union module and update ExportPanel to include buildings in STL export** - `dc6cede` (feat)
2. **Task 2: Visual verification — buildings in 3D preview and exported STL** - Human verification checkpoint: APPROVED (2026-02-24)

**Fix (deviation):** `9a96f9d` — non-manifold seam warning (non-blocking) for buildings+terrain export instead of hard block

## Files Created/Modified

- `src/lib/mesh/buildingSolid.ts` - CSG union module: unionBuildingsWithTerrain, mergeTerrainAndBuildings with fallback
- `src/lib/mesh/__tests__/buildingSolid.test.ts` - 6 tests: CSG union geometry, triangle count, indexed input, fallback, manifold
- `src/components/Preview/ExportPanel.tsx` - Building-aware export pipeline with progress steps and non-manifold warning
- `src/lib/export/stlExport.ts` - generateFilename with hasBuildings flag, -terrain-buildings.stl suffix

## Decisions Made

- **CSG fallback:** three-bvh-csg on terrain-scale meshes is unvalidated for performance — wrapping in try/catch with mergeGeometries fallback ensures export never fails completely, even if CSG is too slow or throws
- **Non-manifold warning (non-blocking):** Building-terrain seams may have non-manifold edges. Blocking the export entirely would be worse UX than letting the user download a slicer-repairable file with a warning
- **Evaluator attributes=['position', 'normal']:** UV is not needed for STL export; including UV caused attribute-mismatch errors when geometries had inconsistent UV channels
- **Attribute stripping before CSG:** Both terrainGeo and buildingsGeo are stripped to position+normal before passing to CSG to prevent Evaluator errors

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Non-manifold seam handling: warn instead of blocking export**
- **Found during:** Task 1 (ExportPanel validation logic)
- **Issue:** Initial implementation blocked export when `!validation.isManifold && hasBuildings`, but building-terrain seams almost always produce some non-manifold edges — this would make the export unusable
- **Fix:** Changed validation logic to: terrain-only must be manifold (block on fail), buildings+terrain shows non-blocking warning ("Mesh has non-manifold edges at building seams — your slicer will auto-repair this.")
- **Files modified:** `src/components/Preview/ExportPanel.tsx`
- **Verification:** Export proceeds with buildings, validation warning shown in UI
- **Committed in:** `9a96f9d`

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug in validation logic)
**Impact on plan:** Auto-fix essential for usability. The plan noted slicers auto-repair but didn't explicitly specify non-blocking behavior for the validation gate.

## Issues Encountered

None beyond the non-manifold validation fix above.

## User Setup Required

None — CSG is client-side. No new API keys, environment variables, or external services required.

## Next Phase Readiness

- Full building pipeline complete: fetch → parse → geometry → 3D preview → CSG union → STL export
- Human verification (Task 2) approved: buildings confirmed in 3D preview and exported STL opens without repair warnings in slicer
- Backward compatible: areas without OSM building data export terrain-only STL unchanged
- Phase 3 is complete — all 3 plans executed and human-verified

## Self-Check: PASSED

All files verified:
- FOUND: `src/lib/mesh/buildingSolid.ts`
- FOUND: `src/lib/mesh/__tests__/buildingSolid.test.ts`
- FOUND: `src/components/Preview/ExportPanel.tsx`
- FOUND: `src/lib/export/stlExport.ts`
- FOUND: `.planning/phases/03-buildings/03-03-SUMMARY.md`

All commits verified:
- FOUND: `dc6cede` (feat: CSG union module and building-aware STL export)
- FOUND: `9a96f9d` (fix: allow export with non-manifold building seams)

Test suite: 115 tests pass across 11 test files.
TypeScript: zero errors (`npx tsc --noEmit`).

---
*Phase: 03-buildings*
*Completed: 2026-02-24*
