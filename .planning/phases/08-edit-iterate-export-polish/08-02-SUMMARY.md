---
phase: 08-edit-iterate-export-polish
plan: 02
subsystem: export
tags: [three.js, solid-mesh, stl, manifold, watertight, earcut]

# Dependency graph
requires:
  - phase: 02-terrain-preview-export
    provides: buildTerrainGeometry output and STL export pipeline
  - phase: 07-vegetation-terrain-smoothing
    provides: full feature set (buildings, roads, water, vegetation) for export
provides:
  - Watertight terrain solid by construction (perimeter-vertex walls + earcut base plate)
  - Strict validation gating blocking ALL non-manifold downloads
  - Automated test suite verifying solid mesh watertightness
affects: [export, stl, 3d-printing, solid-mesh]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Perimeter-vertex wall extraction (extract actual terrain edge vertices instead of nearest-vertex sampling)
    - Earcut-triangulated base plate (matches exact wall bottom vertex positions, zero boundary edges)
    - Corner Z-gap stitching at wall junctions (handles RTIN triangulation artifacts)

key-files:
  created:
    - src/lib/mesh/__tests__/solid.test.ts
  modified:
    - src/lib/mesh/solid.ts
    - src/components/Preview/ExportPanel.tsx

key-decisions:
  - "Earcut base plate replaces 2-triangle rectangle: base plate must use exact same perimeter XY as walls or boundary edges remain at wall bottoms (21% -> 0%)"
  - "ExportPanel always blocks non-manifold download: removed warn-and-allow path for feature+terrain exports"
  - "Corner Z-gap stitching only needed when adjacent wall vertices have different Z values at shared bbox corner"

patterns-established:
  - "Watertight solid pattern: terrain surface + perimeter-vertex walls + earcut base plate with matching vertex positions"

requirements-completed: [EXPT-03]

# Metrics
duration: 7min
completed: 2026-02-28
---

# Phase 08 Plan 02: Watertight STL Export Summary

**Earcut-triangulated solid mesh + strict manifold validation that blocks all non-manifold STL downloads**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-28T06:28:44Z
- **Completed:** 2026-02-28T06:35:30Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Replaced nearest-vertex wall sampling in solid.ts with actual perimeter vertex extraction from terrain geometry, eliminating floating-point near-miss gaps
- Fixed base plate triangulation from 2-triangle rectangle to earcut polygon matching exact wall bottom edges (reduces boundary edges from 21% to 0%)
- ExportPanel now blocks download for ALL non-manifold geometry — removed the warn-and-allow path for feature+terrain exports
- Added 3-test watertight validation suite for buildSolidMesh

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix solid mesh wall construction + tighten export validation** - `180cad5` (fix)
2. **Task 1 auto-fix: Fix base plate triangulation gap** - `42197d7` (fix)
3. **Task 2: Add watertight solid mesh test (TDD GREEN)** - `fd596c3` (test)

**Plan metadata:** (docs commit follows)

_Note: Task 2 is TDD — tests were written first, then solid.ts was fixed to pass them._

## Files Created/Modified
- `src/lib/mesh/solid.ts` - Complete rewrite: extractPerimeterVertices + earcut base plate + corner stitching
- `src/components/Preview/ExportPanel.tsx` - Strict validation: always block non-manifold downloads
- `src/lib/mesh/__tests__/solid.test.ts` - New: 3 tests verifying watertightness, triangle count, base plate Z

## Decisions Made
- Used earcut (already in package.json) for base plate triangulation — ensures every wall bottom edge is paired with exactly one base plate edge, giving 0 boundary edges. A fan-triangulation from center creates interior radial edges that appear only once each (17 boundary edges on a 4-edge grid).
- Always block non-manifold downloads: the original warn-and-allow path for feature+terrain exports was removed. With the wall construction fix, terrain-only exports should now be consistently manifold. Feature exports that fail manifold validation indicate real geometry problems slicers cannot reliably auto-repair.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Base plate triangulation left 21% boundary edges**
- **Found during:** Task 2 (watertight test writing)
- **Issue:** The initial solid.ts fix used a 2-triangle rectangle for the base plate. The wall bottom edges had intermediate vertices (e.g., perimeter vertex at x=-16.67) that were not present in the base plate, leaving them as 1-count boundary edges (21% of all edges).
- **Fix:** Replaced the 2-triangle rectangle with earcut triangulation of the full perimeter loop — same perimeter vertices the walls use, projected to baseZ. Fan-triangulation was also considered but creates interior edges that appear only once.
- **Files modified:** src/lib/mesh/solid.ts
- **Verification:** 0 boundary edges (0%) on test terrain; all 3 solid.test.ts tests pass
- **Committed in:** 42197d7

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Fix was essential for watertightness. The initial perimeter-vertex approach was correct for wall construction but needed earcut for the base plate to achieve true manifold geometry.

## Issues Encountered
- Fan triangulation from center was tried first (creates n triangles from center to each perimeter edge) but creates interior radial edges that appear only once each in the edge count — boundary edges. Earcut produces proper polygon triangulation with no interior structure beyond what's needed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- STL export pipeline produces watertight terrain-only geometry by construction
- ExportPanel strictly gates downloads on manifold validation
- 179 tests pass (3 new solid mesh tests + 176 existing)
- Ready for Phase 08-03 (remaining edit/iterate/export polish tasks)

---
*Phase: 08-edit-iterate-export-polish*
*Completed: 2026-02-28*
