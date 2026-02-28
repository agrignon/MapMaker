---
phase: 03-buildings
plan: 01
subsystem: buildings
tags: [earcut, osmtogeojson, three-bvh-csg, three-mesh-bvh, overpass, geojson, building-geometry, bilinear-interpolation, earcut-triangulation, utm-projection]

# Dependency graph
requires:
  - phase: 02-terrain-preview-export
    provides: "terrain.ts zScale formula and coordinate conventions (Y-up, centering, minElevation offset)"
  - phase: 01-foundation
    provides: "wgs84ToUTM, getUTMZone, BoundingBox, ElevationData types"
provides:
  - "fetchBuildingData: Overpass API building fetcher (south,west,north,east bbox order)"
  - "parseBuildingFeatures: osmtogeojson conversion to BuildingFeature array"
  - "resolveHeight: 4-tier fallback cascade (height tag, levels, footprint area heuristic, type defaults)"
  - "resolveRoofHeight: roof height by shape (flat=0, gabled/hipped=0.3x, pyramidal=0.4x)"
  - "sampleElevationAtLonLat: bilinear terrain elevation sampling with Y-up/north convention"
  - "triangulateFootprint: earcut polygon triangulation with hole support"
  - "computeSignedArea: shoelace formula for winding detection and footprint area"
  - "buildWalls: per-vertex base elevation wall construction with winding auto-correction"
  - "buildFlatRoof / buildFloorCap: roof and floor cap geometry"
  - "buildSingleBuilding: closed solid building BufferGeometry (floor + walls + roof)"
  - "buildAllBuildings: full merge pipeline with zScale consistent with terrain.ts"
affects:
  - "03-02-advanced-roofs (will extend buildingMesh.ts with gabled/hipped/pyramidal)"
  - "03-03-ui-integration (will call buildAllBuildings from store/component)"
  - "03-04-csg-terrain-boolean (will use buildAllBuildings result for boolean ops)"

# Tech tracking
tech-stack:
  added:
    - "earcut@3.0.2: polygon triangulation for building footprints"
    - "osmtogeojson@3.0.0-beta.5: OSM to GeoJSON conversion"
    - "three-bvh-csg@0.0.18: future building-terrain boolean ops (installed, not yet used)"
    - "three-mesh-bvh@0.9.8: installed with --legacy-peer-deps due to @react-three/drei@10 peer conflict"
    - "@types/earcut@3.0.0: TypeScript types for earcut"
    - "@types/osmtogeojson@2.2.34: TypeScript types for osmtogeojson"
  patterns:
    - "Building pipeline: fetch → parse → height resolve → project → sample elevation → triangulate → extrude → merge"
    - "zScale consistency: buildings use identical formula to terrain.ts (horizontalScale * exaggeration)"
    - "Per-vertex base elevation: each building corner samples terrain independently (slope-following)"
    - "Winding detection: shoelace formula positive area = CCW in Y-up/UTM space (no reversal needed)"
    - "Footprint-area heuristic: <60m²=5m, <200m²=7m, <600m²=10m, >=600m²=14m"

key-files:
  created:
    - "src/lib/buildings/types.ts: BuildingFeature, ParsedBuilding, BuildingGeometryParams"
    - "src/lib/buildings/overpass.ts: fetchBuildingData"
    - "src/lib/buildings/parse.ts: parseBuildingFeatures"
    - "src/lib/buildings/height.ts: resolveHeight, resolveRoofHeight"
    - "src/lib/buildings/elevationSampler.ts: sampleElevationAtLonLat"
    - "src/lib/buildings/footprint.ts: triangulateFootprint"
    - "src/lib/buildings/walls.ts: buildWalls, computeSignedArea"
    - "src/lib/buildings/roof.ts: buildFlatRoof, buildFloorCap"
    - "src/lib/buildings/buildingMesh.ts: buildSingleBuilding"
    - "src/lib/buildings/merge.ts: buildAllBuildings"
    - "src/lib/buildings/__tests__/height.test.ts: 19 tests"
    - "src/lib/buildings/__tests__/elevationSampler.test.ts: 10 tests"
    - "src/lib/buildings/__tests__/footprint.test.ts: 8 tests"
    - "src/lib/buildings/__tests__/walls.test.ts: 9 tests"
  modified:
    - "package.json: added earcut, osmtogeojson, three-bvh-csg, three-mesh-bvh + type defs"

key-decisions:
  - "three-mesh-bvh installed with --legacy-peer-deps: @react-three/drei@10 requires 0.8.3, three-bvh-csg requires >=0.9.7 — resolved with legacy flag"
  - "Winding convention: positive signed area = CCW in UTM/Y-up coordinates (NOT reversed) — only reverse when area < 0 (CW)"
  - "zScale with minHeightMM floor: buildings use same TERR-03 floor logic as terrain.ts to ensure Z alignment on very flat terrain"
  - "mergeGeometries from three/addons/utils/BufferGeometryUtils.js (not main three package) — standard Three.js extras path"

patterns-established:
  - "Building height cascade: height tag > building:levels > footprint-area heuristic > type defaults (never NaN)"
  - "Elevation sampling Y-axis: ty = (ne.lat - lat) / (ne.lat - sw.lat) — row 0 is north, matching terrain.ts"
  - "Building merge pipeline: project UTM → local mm → sample elevation → triangulate → extrude → merge all"

requirements-completed: [BLDG-01, BLDG-03, BLDG-04]

# Metrics
duration: 8min
completed: 2026-02-24
---

# Phase 3 Plan 01: Building Pipeline — Types, Fetch, Parse, Height, Elevation, Triangulation, Walls, Roof, Merge

**Full 10-module building geometry pipeline from Overpass API fetch through earcut triangulation and Three.js BufferGeometry merge, with 46 passing unit tests and zScale consistent with terrain.ts**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-02-24T08:01:13Z
- **Completed:** 2026-02-24T08:08:44Z
- **Tasks:** 3
- **Files modified:** 15 (10 library files, 4 test files, 1 package.json)

## Accomplishments
- Complete building data pipeline: Overpass API fetch → osmtogeojson parse → height resolution with 4-tier cascade
- Pure math layer: bilinear elevation sampling, earcut triangulation (including holes/courtyards), per-vertex wall construction with winding detection
- Geometry composition: flat roof cap, floor cap, wall extrusion, and merge orchestrator with zScale matching terrain.ts exactly
- 46 new unit tests across 4 test files; all 88 total tests pass (no regressions)
- TypeScript clean: `tsc --noEmit` passes with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies, create types, overpass, parse, height** - `595a459` (feat)
2. **Task 2: Elevation sampler, footprint triangulation, wall construction with tests** - `3deb72a` (feat)
3. **Task 3: Flat roof, building mesh composer, merge orchestrator** - `72e27f7` (feat)

## Files Created/Modified
- `src/lib/buildings/types.ts` - BuildingFeature, ParsedBuilding, BuildingGeometryParams interfaces
- `src/lib/buildings/overpass.ts` - fetchBuildingData (Overpass QL, south/west/north/east bbox order)
- `src/lib/buildings/parse.ts` - parseBuildingFeatures using osmtogeojson (Polygon + MultiPolygon)
- `src/lib/buildings/height.ts` - resolveHeight with 4-tier cascade + resolveRoofHeight
- `src/lib/buildings/elevationSampler.ts` - sampleElevationAtLonLat with bilinear interpolation
- `src/lib/buildings/footprint.ts` - triangulateFootprint with hole support via earcut
- `src/lib/buildings/walls.ts` - buildWalls (per-vertex elevation), computeSignedArea (winding detection)
- `src/lib/buildings/roof.ts` - buildFlatRoof, buildFloorCap (reversed winding for downward normal)
- `src/lib/buildings/buildingMesh.ts` - buildSingleBuilding (floor + walls + roof)
- `src/lib/buildings/merge.ts` - buildAllBuildings (full pipeline orchestrator)
- `src/lib/buildings/__tests__/height.test.ts` - 19 tests for full height cascade
- `src/lib/buildings/__tests__/elevationSampler.test.ts` - 10 tests for bilinear sampling
- `src/lib/buildings/__tests__/footprint.test.ts` - 8 tests for triangulation
- `src/lib/buildings/__tests__/walls.test.ts` - 9 tests for wall construction and winding
- `package.json` - Added earcut, osmtogeojson, three-bvh-csg, three-mesh-bvh

## Decisions Made

- **three-mesh-bvh peer conflict resolved with --legacy-peer-deps:** `@react-three/drei@10` pins `three-mesh-bvh@0.8.3`, but `three-bvh-csg` requires `>=0.9.7`. Used `--legacy-peer-deps` to install 0.9.8 alongside drei's internal copy.
- **Winding convention clarified:** In UTM coordinates (Y-axis = north = up), positive shoelace signed area = CCW (standard math orientation). Reversed the plan's "if area > 0, reverse" to "if area < 0, reverse" to get correct outward-facing normals.
- **zScale includes minHeightMM floor detection:** Buildings use the same TERR-03 floor logic as terrain.ts (`zScale = minHeightMM / elevRange` when `naturalHeightMM < 5mm`) to ensure building base Z aligns with terrain Z on flat areas.
- **mergeGeometries import path:** Uses `three/addons/utils/BufferGeometryUtils.js` (Three.js extras, not main package).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed winding convention sign for UTM coordinate space**
- **Found during:** Task 2 (wall construction tests)
- **Issue:** Plan specified "if signed area > 0 (CW in screen space), reverse" but in UTM coordinates (Y-axis up/north), positive signed area = CCW (no reversal needed). Reversing on positive area inverted wall normals.
- **Fix:** Changed `if (signedArea > 0)` to `if (signedArea < 0)` in buildWalls. Updated test expectations to match UTM Y-up convention (CCW = positive area).
- **Files modified:** `src/lib/buildings/walls.ts`, `src/lib/buildings/__tests__/walls.test.ts`
- **Verification:** All 9 wall tests pass including outward normal verification
- **Committed in:** `3deb72a` (Task 2 commit)

**2. [Rule 3 - Blocking] Handled npm peer dependency conflict for three-mesh-bvh**
- **Found during:** Task 1 (dependency installation)
- **Issue:** `three-bvh-csg` requires `three-mesh-bvh>=0.9.7` but `@react-three/drei@10` has a peer dep on `three-mesh-bvh@0.8.3`. Direct install failed with ERESOLVE.
- **Fix:** Installed `earcut osmtogeojson` first (no conflicts), then installed `three-mesh-bvh` and `three-bvh-csg` separately with `--legacy-peer-deps`.
- **Files modified:** `package.json`, `package-lock.json`
- **Verification:** All packages installed, build and tests pass
- **Committed in:** `595a459` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 bug fix, 1 blocking dependency issue)
**Impact on plan:** Both fixes essential for correctness and functionality. No scope creep.

## Issues Encountered
- Three.js peer dependency conflict required `--legacy-peer-deps` flag — flagged for monitoring if drei upgrades its three-mesh-bvh peer dep requirement in the future.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Complete building library ready for Phase 3 Plan 02 (advanced roofs: gabled, hipped, pyramidal)
- `buildAllBuildings` ready for UI integration in Plan 03
- All exports correctly typed; no circular dependencies
- zScale alignment with terrain.ts verified conceptually; visual alignment will be validated during UI integration

---
*Phase: 03-buildings*
*Completed: 2026-02-24*
