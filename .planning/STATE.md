# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-23)

**Core value:** Users can turn any place in the world into a physical 3D-printed model with full control over features and dimensions
**Current focus:** Phase 1 — Foundation

## Current Position

Phase: 1 of 6 (Foundation)
Plan: 1 of 2 in current phase (01-01 complete)
Status: In Progress
Last activity: 2026-02-24 — Completed 01-01: project scaffold, MapLibre map, UTM/STL pipeline

Progress: [█░░░░░░░░░] ~8%

## Performance Metrics

**Velocity:**
- Total plans completed: 1
- Average duration: 5 min
- Total execution time: 0.08 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 1 | 5 min | 5 min |

**Recent Trend:**
- Last 5 plans: 5 min
- Trend: —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- All phases: Client-side architecture — mesh generation, coordinate projection, elevation decode, and STL serialization all run in browser; thin server proxy only for CORS on elevation tiles
- Phase 1: Coordinate projection must use local UTM flat-earth meter space, not Web Mercator — enforced with automated tests before any geometry is built
- Phase 2: Elevation data from MapTiler terrain-RGB tiles; martini RTIN algorithm for terrain mesh; manifold-3d WASM for STL validation
- Phase 3: three-bvh-csg for building-terrain boolean operations (prevents non-manifold geometry)
- Phase 6: Web Worker + Transferable ArrayBuffers for mesh generation (non-negotiable — prevents 500ms–3s UI freeze on dense areas)
- [Phase 01-foundation]: Used @vis.gl/react-maplibre@8.1.0 (package jumped from 1.x alpha to 8.x major; 8.1.0 is stable)
- [Phase 01-foundation]: UTM projection uses centroid longitude for zone selection — both corners project into same zone for valid meter-space arithmetic
- [Phase 01-foundation]: Tailwind v4 via @tailwindcss/vite plugin — no tailwind.config.js, configuration in CSS with @theme directives

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 2: Martini tile stitching for bounding boxes spanning multiple tiles needs a research spike before implementation
- Phase 3: three-bvh-csg API and performance for terrain-scale meshes not directly validated — research spike recommended
- Phase 6: MapTiler free tier rate limits under concurrent usage unconfirmed — may require CORS proxy earlier than Phase 6

## Session Continuity

Last session: 2026-02-24
Stopped at: Completed 01-foundation-01-PLAN.md — project scaffold complete, ready for Plan 02 (bbox drawing)
Resume file: None
