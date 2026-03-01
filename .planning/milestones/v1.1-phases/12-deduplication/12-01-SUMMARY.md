---
phase: 12-deduplication
plan: "01"
subsystem: buildings
tags: [deduplication, aabb, iou, overture, osm, spatial]

# Dependency graph
requires:
  - phase: 11-mvt-parser
    provides: parseOvertureTiles that produces BuildingFeature[] from Overture MVT tiles
  - phase: 10-overture-access
    provides: BuildingFeature type from src/lib/buildings/types.ts (shared contract)
provides:
  - deduplicateOverture() pure function that filters Overture gap-fill buildings via AABB IoU
  - DEDUP_IOU_THRESHOLD = 0.3 constant (locked decision)
  - src/lib/overture/dedup.ts — standalone module following Phase 10/11 module pattern
affects:
  - 13-integration (wires deduplicateOverture between parseOvertureTiles and buildAllBuildings)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AABB IoU at 0.3 threshold for building overlap detection (zero-dependency, pure arithmetic)"
    - "Pre-compute OSM AABBs once, scan O(N×M) — acceptable for typical bbox building counts"
    - "Guard unionArea <= 0 to prevent NaN from degenerate zero-area rings"

key-files:
  created:
    - src/lib/overture/dedup.ts
    - src/lib/overture/__tests__/dedup.test.ts
  modified: []

key-decisions:
  - "Threshold is >= 0.3 (not strict >) — IoU exactly 0.3 counts as duplicate; locked from STATE.md"
  - "Return ONLY filtered Overture gap-fill list; Phase 13 handles merge with OSM features"
  - "No new npm dependencies — plain TypeScript arithmetic sufficient for AABB IoU"

patterns-established:
  - "dedup.ts follows same standalone module pattern as tiles.ts (Phase 10) and parse.ts (Phase 11)"
  - "Phase 13 imports deduplicateOverture directly from ../overture/dedup (no re-export from index.ts needed)"

requirements-completed: [DEDUP-01]

# Metrics
duration: 2min
completed: 2026-03-01
---

# Phase 12 Plan 01: Deduplication — AABB IoU Building Dedup Summary

**AABB IoU deduplication filter (threshold 0.3) that removes Overture buildings overlapping OSM buildings, passing gap-fill Overture buildings through unchanged**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-01T02:08:17Z
- **Completed:** 2026-03-01T02:10:43Z
- **Tasks:** 2 (TDD RED + GREEN)
- **Files modified:** 2

## Accomplishments

- Implemented `deduplicateOverture(osmFeatures, overtureFeatures)` — pure function, no side effects
- AABB IoU at exactly 0.3 threshold (>= not >) as locked in STATE.md; handles identical buildings, partial overlap, gap-fill, and degenerate zero-area rings
- Full TDD coverage: 14 tests across 11 behavioral cases (all behaviors from DEDUP-01 requirement)
- Full suite passes: 255 tests across 20 files, TypeScript clean, no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: RED — Write failing tests for deduplicateOverture** - `b1dd3f7` (test)
2. **Task 2: GREEN — Implement deduplicateOverture** - `3e41262` (feat)

_TDD plan: two commits (test → feat)_

## Files Created/Modified

- `src/lib/overture/dedup.ts` — `deduplicateOverture()` + `DEDUP_IOU_THRESHOLD` export; `computeAABB()` and `bboxIoU()` internal helpers
- `src/lib/overture/__tests__/dedup.test.ts` — 14 tests: identical, no overlap, below threshold, at threshold, above threshold, empty OSM, empty Overture, multiple OSM, multiple Overture, misaligned duplicate, degenerate ring

## Decisions Made

None beyond plan — followed plan exactly as specified. All key decisions (threshold, algorithm, return type) were pre-locked in STATE.md.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `deduplicateOverture` is ready to import in Phase 13 integration
- Import path: `import { deduplicateOverture } from '../overture/dedup'`
- Phase 13 will call: `const gapFill = deduplicateOverture(osmFeatures, overtureFeatures)` then merge `[...osmFeatures, ...gapFill]` before passing to `buildAllBuildings()`
- No blockers

---
*Phase: 12-deduplication*
*Completed: 2026-03-01*

## Self-Check: PASSED

- src/lib/overture/dedup.ts: FOUND
- src/lib/overture/__tests__/dedup.test.ts: FOUND
- .planning/phases/12-deduplication/12-01-SUMMARY.md: FOUND
- Commit b1dd3f7 (RED test): FOUND
- Commit 3e41262 (GREEN impl): FOUND
