# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-23)

**Core value:** Users can turn any place in the world into a physical 3D-printed model with full control over features and dimensions
**Current focus:** Phase 2 — Terrain Preview & Export (IN PROGRESS)

## Current Position

Phase: 2 of 6 (Terrain Preview & Export) — IN PROGRESS
Plan: 3 of 4 in current phase (02-03 Tasks 1-2 complete, awaiting Task 3 human-verify checkpoint)
Status: Plan 02-03 Checkpoint — User must verify exported STL in PrusaSlicer/Bambu Studio
Last activity: 2026-02-24 — Completed 02-03 Tasks 1-2: watertight solid mesh, STL export, export panel UI

Progress: [████░░░░░░] ~33%

## Performance Metrics

**Velocity:**
- Total plans completed: 4
- Average duration: 3 min
- Total execution time: 0.20 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 2 | 7 min | 3.5 min |
| 02-terrain-preview-export | 2 | 6 min | 3 min |

**Recent Trend:**
- Last 5 plans: 5 min, 2 min, 3 min, 3 min
- Trend: Fast

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
- [Phase 01-foundation 01-02]: terra-draw-maplibre-gl-adapter@1.3.0 installed separately — adapter not bundled in terra-draw 1.25.0
- [Phase 01-foundation 01-02]: MapInteractions inner component pattern — useTerradraw must be called inside a <Map> child for useMap() context
- [Phase 01-foundation 01-02]: Auto-switch to select mode after rectangle creation — no manual mode toggle needed by user
- [Phase 02-terrain-preview-export 02-01]: @react-three/fiber@9 used (not v8) — React 19 compatible; v8 does not support React 19
- [Phase 02-terrain-preview-export 02-01]: manifold-3d excluded from Vite optimizeDeps — WASM binary causes streaming compile failures when pre-bundled
- [Phase 02-terrain-preview-export 02-01]: fetchTilePixels uses OffscreenCanvas (not img element) to avoid main-thread blocking during tile decode
- [Phase 02-terrain-preview-export 02-01]: chooseTileZoom falls back to zoom=8 minimum for bboxes too large to fit in 9 tiles — correct graceful degradation
- [Phase 02-terrain-preview-export 02-02]: minHeightMM=5 floor for flat terrain: zScale = 5/elevRange when exaggeration produces < 5mm height (TERR-03)
- [Phase 02-terrain-preview-export 02-02]: In-place Z update on exaggeration change: recover grid indices from vertex X/Y positions to avoid re-running Martini
- [Phase 02-terrain-preview-export 02-02]: GenerateButton in left sidebar (trigger); terrain controls in right-panel PreviewSidebar after generation
- [Phase 02-terrain-preview-export 02-02]: Camera Z-up at [200,-300,250] fov=50 for natural overhead angle on 150mm terrain model
- [Phase 02-terrain-preview-export]: Export pipeline rebuilds geometry from store data (not scene): decouples STL export from live Three.js scene
- [Phase 02-terrain-preview-export]: Module-level ArrayBuffer ref for STL buffer: Zustand can't serialize ArrayBuffers; hold buffer in module var for download

### Pending Todos

None.

### Blockers/Concerns

- Phase 3: three-bvh-csg API and performance for terrain-scale meshes not directly validated — research spike recommended
- Phase 6: MapTiler free tier rate limits under concurrent usage unconfirmed — may require CORS proxy earlier than Phase 6
- Phase 3: three-bvh-csg API and performance for terrain-scale meshes not directly validated — research spike recommended
- Phase 6: MapTiler free tier rate limits under concurrent usage unconfirmed — may require CORS proxy earlier than Phase 6

## Session Continuity

Last session: 2026-02-24
Stopped at: Completed 02-03 Tasks 1-2; paused at Task 3 checkpoint:human-verify — user must test exported STL in PrusaSlicer/Bambu Studio; type "approved" to continue
Resume file: None
