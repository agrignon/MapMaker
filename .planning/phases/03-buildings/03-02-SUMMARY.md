---
phase: 03-buildings
plan: 02
subsystem: buildings
tags: [obb, rotating-calipers, convex-hull, gabled-roof, hipped-roof, pyramidal-roof, r3f, zustand, overpass, three-mesh]

# Dependency graph
requires:
  - phase: 03-buildings
    plan: 01
    provides: "buildAllBuildings, BuildingFeature, BuildingGeometryParams, fetchBuildingData, parseBuildingFeatures, buildFlatRoof, buildFloorCap, buildWalls"
  - phase: 02-terrain-preview-export
    provides: "TerrainMesh pattern (useRef geometry, useEffect rebuild, dispose on unmount), mapStore, exaggeration, zScale formula"
provides:
  - "buildGabledRoof: ridge-line along OBB long axis, two sloped sides"
  - "buildHippedRoof: shortened ridge with 4 sloped faces, square fallback to pyramidal"
  - "buildPyramidalRoof: single apex at centroid, triangle fan from all perimeter edges"
  - "buildRoofForShape: dispatcher for all 4 roof types, unknown shapes fall back to flat"
  - "computeOBB: 2D oriented bounding box via rotating calipers on convex hull"
  - "BuildingMesh: R3F component rendering merged building geometry in 3D preview"
  - "Extended mapStore: buildingFeatures, buildingGenerationStatus, buildingGenerationStep"
  - "Extended GenerateButton: non-blocking building fetch after terrain, status indicator"
affects:
  - "03-03-ui-integration (buildings already visible in preview, UI refinement may be minimal)"
  - "03-04-csg-terrain-boolean (BuildingMesh geometry will be input to CSG boolean ops)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "OBB via rotating calipers: convex hull + per-edge AABB projection, keep minimum-area rotation"
    - "Gabled roof: long-axis ridge, dot-product side classification for left/right slopes"
    - "Hipped roof: inset ridge (halfExtents[0] - halfExtents[1]), 4-face geometry, pyramidal fallback"
    - "Pyramidal roof: apex at centroid, CCW triangle fan from all perimeter edges"
    - "Non-flat wall height: wallHeightMM = buildingHeightMM - roofHeightMM (min 50% floor)"
    - "BuildingMesh pattern mirrors TerrainMesh: useRef geometry, useEffect rebuild, dispose on unmount"
    - "Non-blocking building fetch: fire-and-forget after terrain fetch completes"

key-files:
  created:
    - "src/lib/buildings/obb.ts: computeOBB (Graham scan convex hull + rotating calipers)"
    - "src/components/Preview/BuildingMesh.tsx: R3F building mesh component"
    - "src/lib/buildings/__tests__/roof.test.ts: 21 tests for all 4 roof types + dispatcher"
  modified:
    - "src/lib/buildings/roof.ts: added buildGabledRoof, buildHippedRoof, buildPyramidalRoof, buildRoofForShape"
    - "src/lib/buildings/buildingMesh.ts: use buildRoofForShape, wall height clamping for non-flat roofs"
    - "src/types/geo.ts: added BuildingGenerationStatus type"
    - "src/store/mapStore.ts: buildingFeatures, buildingGenerationStatus, buildingGenerationStep state + actions"
    - "src/components/Sidebar/GenerateButton.tsx: non-blocking building fetch + status indicator"
    - "src/components/Preview/PreviewCanvas.tsx: render <BuildingMesh /> alongside <TerrainMesh />"

key-decisions:
  - "Graham scan convex hull for OBB: simple custom implementation, ~60 lines, no external library needed"
  - "Hipped roof fallback to pyramidal: when halfExtents[0] <= halfExtents[1] (square buildings), ridge degenerates to a point"
  - "Wall height floor at 50%: when roofHeightMM >= buildingHeightMM, clamp wall to buildingHeightMM * 0.5 so walls never disappear"
  - "Non-blocking building fetch: terrain preview appears immediately; buildings load asynchronously with status indicator"
  - "BuildingMesh conditionally renders only when buildingGenerationStatus === 'ready': prevents empty geometry flash"

patterns-established:
  - "Roof builder signature: (topRingXY, topZmm, holes, roofHeightMM) -> Float32Array"
  - "Non-flat wall height: total height split as (buildingHeight - roofHeight) walls + roofHeight roof"
  - "OBB long axis: axes[0] = long axis unit vector, axes[1] = short axis, halfExtents[0] = long half-length"

requirements-completed: [BLDG-01, BLDG-02, BLDG-04]

# Metrics
duration: 6min
completed: 2026-02-24
---

# Phase 3 Plan 02: Advanced Roofs and 3D Preview Integration

**Gabled, hipped, and pyramidal roof geometry via OBB ridge detection, wired into the 3D preview through a new BuildingMesh R3F component and extended Zustand store**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-02-24T08:12:02Z
- **Completed:** 2026-02-24T08:17:56Z
- **Tasks:** 2
- **Files modified:** 9 (2 new library files, 1 new component, 1 new test file, 5 modified)

## Accomplishments

- OBB helper (`obb.ts`): Graham scan convex hull + rotating calipers gives minimum-area bounding box with long/short axis identification
- Three new roof builders in `roof.ts`: gabled (ridge along OBB long axis), hipped (shortened ridge with 4 faces, pyramidal fallback for square buildings), pyramidal (apex at centroid, triangle fan)
- `buildRoofForShape` dispatcher handles all 4 types with unknown-shape fallback to flat
- `buildingMesh.ts` updated: non-flat buildings use `buildingHeightMM - roofHeightMM` for wall height; minimum wall height clamped at 50%
- 21 new roof tests added; all 109 tests pass (no regressions)
- Store extended with `buildingFeatures`, `buildingGenerationStatus`, `buildingGenerationStep`
- `GenerateButton` triggers non-blocking building fetch after terrain; shows building fetch status below button
- `BuildingMesh.tsx` R3F component reads store, calls `buildAllBuildings()`, rebuilds on exaggeration changes, disposes geometry on unmount
- `PreviewCanvas.tsx` renders `<BuildingMesh />` alongside `<TerrainMesh />`
- TypeScript compiles with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Gabled, hipped, pyramidal roof geometry with OBB helper and tests** - `11ddd39` (feat)
2. **Task 2: Wire buildings into 3D preview — extend store, update GenerateButton, create BuildingMesh** - `06ca013` (feat)

## Files Created/Modified

- `src/lib/buildings/obb.ts` - computeOBB: 2D OBB via Graham scan + rotating calipers on convex hull
- `src/lib/buildings/roof.ts` - Extended with buildGabledRoof, buildHippedRoof, buildPyramidalRoof, buildRoofForShape
- `src/lib/buildings/buildingMesh.ts` - Updated to use buildRoofForShape, wall height splitting for non-flat roofs
- `src/lib/buildings/__tests__/roof.test.ts` - 21 tests for all roof builders and dispatcher
- `src/types/geo.ts` - Added BuildingGenerationStatus type
- `src/store/mapStore.ts` - Extended with building state (features, status, step) and actions
- `src/components/Sidebar/GenerateButton.tsx` - Non-blocking building fetch + status indicator
- `src/components/Preview/BuildingMesh.tsx` - New R3F component for building geometry
- `src/components/Preview/PreviewCanvas.tsx` - Added BuildingMesh to scene

## Decisions Made

- **Graham scan convex hull:** Chose simple custom implementation (~40 lines) over an external library — no new dependencies needed, sufficient for polygon OBB computation
- **Hipped roof pyramidal fallback:** When OBB halfExtents[0] <= halfExtents[1] (building is approximately square), the hipped ridge length is zero or negative — fallback to pyramidal is semantically correct
- **Wall height floor:** For non-flat roofs, walls are at minimum 50% of total height (`max(0.5 * buildingHeightMM, buildingHeightMM - roofHeightMM)`) — prevents invisible walls when OSM roof height data is disproportionate
- **Non-blocking building fetch:** Terrain preview shows immediately after elevation fetch; buildings load in the background without blocking the user from viewing the terrain

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — buildings load automatically from Overpass API when Generate is clicked.

## Next Phase Readiness

- Buildings render in 3D preview with correct terrain placement and roof shapes
- `buildAllBuildings()` output is ready for CSG boolean operations (Plan 03-04)
- All existing functionality (terrain preview, exaggeration slider, STL export) continues to work
- zScale alignment with terrain is maintained by using same formula as merge.ts/terrain.ts

---
*Phase: 03-buildings*
*Completed: 2026-02-24*
