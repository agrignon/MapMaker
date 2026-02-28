---
phase: 05-roads-layer
plan: 01
subsystem: roads
tags: [three.js, overpass, osmtogeojson, geometry-extrude, vitest, road-mesh, terrain]

# Dependency graph
requires:
  - phase: 05-roads-layer
    provides: research context — geometry-extrude@0.2.1 selected, vertex displacement approach, road tier widths
  - phase: 03-buildings
    provides: elevationSampler.ts (sampleElevationAtLonLat), buildings/overpass.ts pattern, buildings/parse.ts pattern
  - phase: 02-terrain-preview-export
    provides: terrain.ts zScale formula, ElevationData/BoundingBox types
  - phase: 01-foundation
    provides: wgs84ToUTM, BoundingBox, geo types
provides:
  - "src/lib/roads/types.ts — RoadTier, RoadStyle, RoadFeature, RoadGeometryParams"
  - "src/lib/roads/overpass.ts — fetchRoadData() for Overpass highway ways"
  - "src/lib/roads/parse.ts — parseRoadFeatures() with classifyTier() helper"
  - "src/lib/roads/roadMesh.ts — buildRoadGeometry() producing merged Three.js BufferGeometry"
  - "patches/geometry-extrude+0.2.1.patch — bug fix for rawVertices ReferenceError"
affects:
  - phase: 05-roads-layer plan 02 (RoadMesh.tsx UI wiring)
  - phase: 09-performance (road geometry in worker)

# Tech tracking
tech-stack:
  added:
    - geometry-extrude@0.2.1 (centerline-to-ribbon mesh via extrudePolyline)
    - patch-package@8.0.1 (persistent npm package bug fix)
  patterns:
    - Road data pipeline mirrors buildings pipeline: overpass fetch → osmtogeojson parse → geometry generation
    - zScale formula identical to terrain.ts and buildings/merge.ts for elevation alignment
    - Centerline projected to local mm space via wgs84ToUTM + bboxCenterUTM subtraction (same as projectRingToMM in buildings/merge.ts)
    - Per-vertex terrain Z via nearest-segment projection + bilinear interpolation
    - Bridge Z via arc-length parameterized linear interpolation + lift offset
    - UV attribute never added (prevents merge mismatch with terrain/building geometries)

key-files:
  created:
    - src/lib/roads/types.ts
    - src/lib/roads/overpass.ts
    - src/lib/roads/parse.ts
    - src/lib/roads/roadMesh.ts
    - src/lib/roads/__tests__/parse.test.ts
    - src/lib/roads/__tests__/roadMesh.test.ts
    - patches/geometry-extrude+0.2.1.patch
  modified:
    - package.json (geometry-extrude@0.2.1 + patch-package@8.0.1 + postinstall script)

key-decisions:
  - "geometry-extrude@0.2.1 has bug: rawVertices references undefined variable 'vertices' instead of 'points' in convertPolylineToTriangulatedPolygon; patched via patch-package"
  - "ROAD_WIDTH_MM: highway=1.8mm, main=1.2mm, residential=0.7mm at 150mm model width"
  - "ROAD_DEPTH_MM: highway=1.0mm, main=0.6mm, residential=0.3mm (locked decisions per CONTEXT.md)"
  - "ROAD_COLOR: '#555555' dark gray (locked decision)"
  - "Bridge lift = ROAD_DEPTH_MM[tier] * 2 — bridges float above terrain by double road depth"
  - "UV attribute never set on road geometry — prevents mergeGeometries attribute mismatch with terrain/building geometries"
  - "zScale computed once before feature loop (not per-feature) — matches terrain.ts behavior"

patterns-established:
  - "Road geometry follows same pipeline as buildings: overpass fetch → osmtogeojson → projectToMM → elevationSampler → mergeGeometries"
  - "Per-vertex terrain Z: for each ribbon vertex, project onto nearest centerline segment, interpolate terrain Z, add style offset + local ribbon Z"
  - "Bridge Z: arc-length parameterized linear interpolation between endpoint terrain Z values + bridge lift"
  - "extrudePolyline called with [projected2D] wrapped in array (MultiLineString format per Pitfall 2 in RESEARCH.md)"

requirements-completed: [ROAD-01, ROAD-02, ROAD-03]

# Metrics
duration: 6min
completed: 2026-02-25
---

# Phase 5 Plan 01: Roads Layer Library Summary

**Overpass fetch, osmtogeojson parsing with highway tier classification, and geometry-extrude ribbon mesh with terrain-following Z, style offsets, and tier-based widths — plus patch-package fix for geometry-extrude@0.2.1 bug**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-25T06:33:28Z
- **Completed:** 2026-02-25T06:39:28Z
- **Tasks:** 2
- **Files modified:** 9 (7 created, 2 modified)

## Accomplishments
- Complete roads data pipeline: Overpass fetch → osmtogeojson parse with tier classification/tunnel exclusion/bridge flagging → geometry-extrude ribbon mesh generation
- `buildRoadGeometry()` produces terrain-following merged BufferGeometry with per-vertex Z via nearest-segment bilinear interpolation
- Road style system: recessed (negative Z offset), raised (positive Z offset), flat (no offset) applied per-tier
- Bridge segments use arc-length parameterized linear Z interpolation + double-depth lift above terrain
- 45 unit tests covering all classification cases, filtering, geometry output, width tiers, style offsets, bridge interpolation

## Task Commits

Each task was committed atomically:

1. **Task 1: Install geometry-extrude, create road types, Overpass fetch, and parse module with tests** - `e2f5a38` (feat)
2. **Task 2: Build road geometry module with terrain-following Z, style offsets, and width tiers** - `44b9fc2` (feat)

**Plan metadata:** TBD (docs commit)

## Files Created/Modified
- `src/lib/roads/types.ts` — RoadTier, RoadStyle, RoadFeature, RoadGeometryParams type definitions
- `src/lib/roads/overpass.ts` — fetchRoadData() querying Overpass for highway ways (bbox order: sw.lat,sw.lon,ne.lat,ne.lon)
- `src/lib/roads/parse.ts` — parseRoadFeatures() + classifyTier() (highway/main/residential + null for excluded types)
- `src/lib/roads/roadMesh.ts` — buildRoadGeometry() with terrain Z assignment, style offsets, bridge interpolation; exports ROAD_WIDTH_MM, ROAD_DEPTH_MM, ROAD_COLOR
- `src/lib/roads/__tests__/parse.test.ts` — 31 tests: tier classification, tunnel exclusion, bridge flagging, geometry type filtering
- `src/lib/roads/__tests__/roadMesh.test.ts` — 14 tests: null handling, BufferGeometry output, width tiers, style offsets, bridge Z interpolation
- `patches/geometry-extrude+0.2.1.patch` — Persistent fix for library bug (rawVertices: vertices → rawVertices: points)
- `package.json` — Added geometry-extrude, patch-package, postinstall script
- `package-lock.json` — Updated lock file

## Decisions Made
- ROAD_WIDTH_MM: highway=1.8mm, main=1.2mm, residential=0.7mm (locked per CONTEXT.md/RESEARCH.md)
- ROAD_DEPTH_MM: highway=1.0mm, main=0.6mm, residential=0.3mm (locked per CONTEXT.md)
- ROAD_COLOR: '#555555' dark gray (locked per CONTEXT.md)
- Bridge lift = ROAD_DEPTH_MM[tier] * 2 (bridges float above terrain by double road depth)
- UV attribute never set on road geometry (prevents mergeGeometries mismatch with terrain/buildings)
- zScale computed once before feature loop (not per-feature, matches terrain.ts)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed geometry-extrude@0.2.1 ReferenceError in extrudePolyline**
- **Found during:** Task 2 (road geometry module)
- **Issue:** `convertPolylineToTriangulatedPolygon` referenced undefined variable `vertices` in `rawVertices: vertices` — should be `rawVertices: points` (the Float32Array of polyline points). This caused `ReferenceError: vertices is not defined` aborting all extrusion calls, returning null for all road geometry.
- **Fix:** Patched `dist/geometry-extrude.js` line 1630 (rawVertices: vertices → rawVertices: points); installed `patch-package@8.0.1`; created `patches/geometry-extrude+0.2.1.patch`; added `"postinstall": "patch-package"` to package.json scripts to persist fix across npm installs.
- **Files modified:** node_modules/geometry-extrude/dist/geometry-extrude.js (patched), patches/geometry-extrude+0.2.1.patch (new), package.json (postinstall), package-lock.json
- **Verification:** extrudePolyline called directly with 2-point polyline — produces position=36 floats, indices=12, normal=36. All 14 roadMesh tests pass.
- **Committed in:** `44b9fc2` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Required for any road geometry to be produced at all. patch-package approach ensures fix persists after npm install. No scope creep.

## Issues Encountered
- geometry-extrude@0.2.1 has a bug where `rawVertices: vertices` references an undefined `vertices` variable (should be `points` — the Float32Array built from the input polyline). The `rawVertices` field is never consumed internally (addTopAndBottom only destructures `indices`, `topVertices`, `rect`, `depth`), so this is a metadata-only bug in the return value, but it still throws ReferenceError and aborts the function. Fixed via patch-package.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All road library code complete and tested (types, overpass, parse, roadMesh)
- Plan 02 can wire `fetchRoadData`, `parseRoadFeatures`, `buildRoadGeometry` into the UI, 3D preview, and export pipeline
- `ROAD_COLOR`, `ROAD_WIDTH_MM`, `ROAD_DEPTH_MM` exported for use in RoadMesh.tsx material/controls
- No blockers for Plan 02

---
*Phase: 05-roads-layer*
*Completed: 2026-02-25*

## Self-Check: PASSED

Files verified:
- FOUND: src/lib/roads/types.ts
- FOUND: src/lib/roads/overpass.ts
- FOUND: src/lib/roads/parse.ts
- FOUND: src/lib/roads/roadMesh.ts
- FOUND: src/lib/roads/__tests__/parse.test.ts
- FOUND: src/lib/roads/__tests__/roadMesh.test.ts
- FOUND: patches/geometry-extrude+0.2.1.patch

Commits verified:
- FOUND: e2f5a38 (Task 1 — feat: install geometry-extrude, types, overpass, parse + tests)
- FOUND: 44b9fc2 (Task 2 — feat: road geometry module + patch-package bug fix)

Test results: 160 tests pass (45 new road tests + 115 existing = no regressions)
TypeScript: clean (npx tsc --noEmit: exit 0)
