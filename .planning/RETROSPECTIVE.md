# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-02-28
**Phases:** 9 | **Plans:** 25 | **Timeline:** 5 days

### What Was Built
- Full location-to-STL pipeline: search → bbox → terrain → buildings → roads → water → vegetation → export
- 7 geographic feature layers with individual toggles and configurable styles
- Watertight STL export with solid base plate, matching mm dimensions
- Live 3D preview with orbit/zoom/pan, side-by-side with 2D map editor
- Web Worker mesh generation with bbox area cap for browser stability

### What Worked
- Phase dependency ordering (terrain first, then layers on top) eliminated integration rework
- Caller-side smoothing pipeline (smooth → water depression → build terrain) kept all layers consistent
- Combined Overpass fetch (one request for buildings+roads+water) eliminated rate limiting issues
- Terrain raycaster via three-mesh-bvh gave accurate Z placement without Martini RTIN mismatch
- Web Worker with Transferable ArrayBuffers kept UI responsive during complex mesh generation

### What Was Inefficient
- Stale milestone audit (ran at phase 3, all gaps were just "not built yet") — audit too early
- Several gap closure plans needed (01-03, 02-04, 02-05, 05-03) for issues found during UAT
- CSG union approach for buildings initially chosen, then replaced with shell merge for performance
- Z alignment bugs recurred across multiple phases (buildings, roads, vegetation, water) due to smoothed vs raw elevation mismatch

### Patterns Established
- Caller-side data pipeline: smooth → depress → build terrain → sample Z for features
- Each feature layer is a separate watertight shell in STL — slicers compute union automatically
- Web Worker receives smoothingLevel and applies full pipeline before building BVH raycaster
- CSS visibility:hidden preserves R3F WebGL context across view transitions
- Earcut for base plate triangulation matches exact wall edge perimeter

### Key Lessons
1. Z alignment must use the same effective elevation data everywhere — smoothed + depressed, never raw
2. Run milestone audit after all phases are built, not mid-development
3. Water depressions must be applied before terrain build AND before any Z sampling by other features
4. Terrain raycasting (BVH mesh lookup) is more accurate than grid sampling for features on Martini RTIN terrain
5. Combined Overpass queries prevent 429 rate limiting that plagued separate per-feature fetches

### Cost Observations
- Model mix: balanced profile (sonnet executors, inherit planners)
- Timeline: 5 days from first commit to milestone completion
- Notable: 164 commits, 25 plans — high throughput with minimal rework after gap closures

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Timeline | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | 5 days | 9 | Initial milestone — established GSD workflow patterns |

### Cumulative Quality

| Milestone | Tests | LOC | Plans |
|-----------|-------|-----|-------|
| v1.0 | 176 | 12,191 | 25 |

### Top Lessons (Verified Across Milestones)

1. Z alignment consistency across all layers is the most critical integration concern for 3D terrain apps
2. Phase dependency ordering (foundation → terrain → features) prevents costly rework
