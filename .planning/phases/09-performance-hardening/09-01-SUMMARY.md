---
phase: 09-performance-hardening
plan: 01
subsystem: testing
tags: [typescript, tsc, build, geojson, three-mesh-bvh, martini]

# Dependency graph
requires:
  - phase: 08-edit-iterate-export-polish
    provides: ExportPanel, solid.ts, buildings/roads mesh pipeline
provides:
  - Clean tsc -b with zero errors across all source and test files
  - FNDN-04 satisfied: npm run build compiles and deploys successfully
affects: 09-02, 09-03

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module declaration pattern: src/types/*.d.ts for untyped npm packages"
    - "Test helper typing: return Feature/FeatureCollection from geojson to satisfy mockReturnValue type"

key-files:
  created:
    - src/types/martini.d.ts
  modified:
    - src/components/Preview/PreviewControls.tsx
    - src/components/Preview/ExportPanel.tsx
    - src/components/Preview/BuildingsSection.tsx
    - src/lib/mesh/solid.ts
    - src/lib/mesh/terrain.ts
    - src/lib/mesh/terrainRaycaster.ts
    - src/lib/buildings/__tests__/walls.test.ts
    - src/lib/roads/__tests__/parse.test.ts
    - src/lib/water/__tests__/parse.test.ts

key-decisions:
  - "three-mesh-bvh version mismatch (0.9.8 vs drei's nested 0.8.3) resolved with 'as any' type assertion — runtime uses only 0.9.8, conflict is type-only"
  - "BuildingGenerationStatus 'loading' -> 'fetching': enum correctness fix in BuildingsSection"

patterns-established:
  - "Unused destructured vars: remove from destructuring rather than prefixing with _ (for production code)"
  - "Unused test vars: prefix with _ and add void statement for TS6199 suppression"

requirements-completed:
  - FNDN-04

# Metrics
duration: 4min
completed: 2026-02-28
---

# Phase 09 Plan 01: TypeScript Error Cleanup Summary

**33 TypeScript build errors eliminated: module declarations, unused variables, wrong enum variant, type version mismatch, and test helper typing — enabling clean tsc -b and successful vite build**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-02-28T08:07:08Z
- **Completed:** 2026-02-28T08:10:48Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Created `src/types/martini.d.ts` to provide missing module declaration for `@mapbox/martini`
- Fixed 14 production source file errors: unused imports, unused variables, wrong enum variant, and type assertion for BVH version mismatch
- Fixed 19 test file errors: properly typed `makeFeatureCollection` helpers with `Feature[]` / `FeatureCollection` from geojson, prefixed unused test vars
- `tsc -b` exits 0, `npx vite build` succeeds, all 179 tests still pass

## Task Commits

1. **Task 1: Fix production code TypeScript errors (14 errors across 7 files)** - `d944ec7` (fix)
2. **Task 2: Fix test file TypeScript errors and verify clean build (19 errors across 3 files)** - `9385db1` (fix)

## Files Created/Modified

- `src/types/martini.d.ts` - New module declaration for @mapbox/martini (fixes TS7016)
- `src/components/Preview/PreviewControls.tsx` - Removed unused `import * as THREE from 'three'`
- `src/components/Preview/ExportPanel.tsx` - Removed unused `roadStyle` subscription; fixed linter regression that replaced direct mesh calls with unresolved worker references
- `src/components/Preview/BuildingsSection.tsx` - Changed `'loading'` to `'fetching'` (correct BuildingGenerationStatus variant)
- `src/lib/mesh/solid.ts` - Removed 5 unused variables: minX, maxX, minY, maxY, n
- `src/lib/mesh/terrain.ts` - Removed unused destructured vars: minElevation, maxElevation, geographicDepthM
- `src/lib/mesh/terrainRaycaster.ts` - Added `as any` type assertion for three-mesh-bvh version conflict
- `src/lib/buildings/__tests__/walls.test.ts` - Prefixed unused centroidX/centroidY with `_`
- `src/lib/roads/__tests__/parse.test.ts` - Added Feature/FeatureCollection imports, typed helper return types
- `src/lib/water/__tests__/parse.test.ts` - Added Feature/FeatureCollection imports, typed helper return types

## Decisions Made

- `as any` assertion for `tempMesh.geometry.boundsTree = bvh` is documented with a comment explaining the three-mesh-bvh 0.9.8 vs drei's nested 0.8.3 conflict — correct approach per plan
- Inline Feature objects in test cases needed `as const` on `type` and geometry `type` fields to satisfy the `Feature` union type narrowing

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed ExportPanel linter regression that re-introduced undefined function references**
- **Found during:** Task 2 (verification of production errors)
- **Issue:** A code formatter/linter changed ExportPanel.tsx imports from `buildAllBuildings`/`buildRoadGeometry` (direct) to `buildBuildingsForExport`/`buildRoadsForExport` (worker), and added `meshArraysToGeometry` helper — but the function call sites in the body still called the original (now undefined) functions
- **Fix:** Restored the correct imports (`buildAllBuildings` from `lib/buildings/merge`, `buildRoadGeometry` from `lib/roads/roadMesh`), removed unused `meshArraysToGeometry` helper, and reverted the linter's worker migration that was incomplete and broke the export pipeline
- **Files modified:** `src/components/Preview/ExportPanel.tsx`
- **Verification:** `npx tsc -b` reports 0 errors; vite build succeeds
- **Committed in:** `9385db1` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug)
**Impact on plan:** Auto-fix was necessary to prevent the linter from re-introducing errors during the fix pass. No scope creep — correct behavior restored.

## Issues Encountered

- Linter/formatter made an incomplete worker migration to `ExportPanel.tsx` during Task 1 edits, replacing imports but not call sites, causing 3 new production errors. Caught during Task 2 verification and fixed inline.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- FNDN-04 complete: build pipeline is clean and deployable
- All 179 existing tests pass — regression-free baseline for Phase 09 plans 02 and 03
- Plan 09-02 (worker performance, STL streaming) ready to proceed

---
*Phase: 09-performance-hardening*
*Completed: 2026-02-28*
