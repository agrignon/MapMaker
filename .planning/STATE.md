# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-23)

**Core value:** Users can turn any place in the world into a physical 3D-printed model with full control over features and dimensions
**Current focus:** Phase 3 — Buildings overlay

## Current Position

Phase: 2 of 6 (Terrain Preview & Export) — COMPLETE
Plan: 5 of 5 complete
Status: All Phase 2 plans complete including gap closure (02-04) and tile boundary seam fix (02-05)
Last activity: 2026-02-24 — Tile boundary seam bug fixed, all 42 tests passing

Progress: [████░░░░░░] ~40%

## Performance Metrics

**Velocity:**
- Total plans completed: 6
- Average duration: 2.2 min
- Total execution time: 0.22 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 2 | 7 min | 3.5 min |
| 02-terrain-preview-export | 4 | 9 min | 2.25 min |

**Recent Trend:**
- Last 5 plans: 2 min, 3 min, 3 min, 2 min, 1 min
- Trend: Fast

*Updated after each plan completion*
| Phase 02-terrain-preview-export P05 | 1 | 2 tasks | 2 files |

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
- [Phase 02-terrain-preview-export 02-04]: Y-axis fix is in terrain.ts coordinate mapping only — stitch.ts and tiles.ts are correct; tile row 0 = north is right
- [Phase 02-terrain-preview-export 02-04]: Regression test uses synthetic 257x257 grid with asymmetric quadrant elevations (NW=100m, NE=50m, SW=25m, SE=10m) to detect inversion without real tile data
- [Phase 02-terrain-preview-export 02-05]: MapTiler terrain-rgb-v2 tiles are standard 256x256 XYZ raster tiles with NO border overlap — stitching uses simple concatenation at col*tileSize stride
- [Phase 02-terrain-preview-export 02-05]: fetchElevationForBbox stitchedWidth/Height must match stitchTileElevations formula exactly (cols*tileSize, rows*tileSize) or resampling coordinates diverge
- [Phase 02-terrain-preview-export]: MapTiler terrain-rgb-v2 tiles are standard 256x256 XYZ raster tiles with NO border overlap — stitching uses simple concatenation at col*tileSize stride

### Pending Todos

None.

### Blockers/Concerns

- Phase 1 gap closure (01-03): UAT verification still pending (no SUMMARY for 01-03)
- Phase 3: three-bvh-csg API and performance for terrain-scale meshes not directly validated — research spike recommended
- Phase 6: MapTiler free tier rate limits under concurrent usage unconfirmed — may require CORS proxy earlier than Phase 6

## Session Continuity

Last session: 2026-02-24
Stopped at: Completed 02-05-PLAN.md — Tile boundary seam bug fix (stitchTileElevations simple concatenation). Phase 2 fully complete with all gap closures. Ready for Phase 3.
Resume file: None
