# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-24)

**Core value:** Users can turn any place in the world into a physical 3D-printed model with full control over features and dimensions
**Current focus:** Phase 4 — Model Controls + Store Foundation

## Current Position

Phase: 4 — Model Controls + Store Foundation
Plan: Not started
Status: v1.0 roadmap expanded to 9 phases — 19/34 requirements complete (Phases 1-3), 15 remaining requirements mapped to Phases 4-9
Last activity: 2026-02-24 — v1.0 re-scope roadmap created: Phases 4-9 defined for roads, water, vegetation, smoothing, edit-iterate, and performance

Progress: [██████░░░░] ~56%

## Performance Metrics

**Velocity:**
- Total plans completed: 9
- Average duration: 2.9 min
- Total execution time: ~0.49 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 2 | 7 min | 3.5 min |
| 02-terrain-preview-export | 4 | 9 min | 2.25 min |
| 03-buildings | 3 | 19 min | 6.3 min |

**Recent Trend:**
- Last 5 plans: 2 min, 1 min, 8 min, 6 min, 5 min
- Trend: Normal

*Updated after each plan completion*
| Phase 02-terrain-preview-export P05 | 1 | 2 tasks | 2 files |
| Phase 03-buildings P01 | 3 | 3 tasks | 15 files |
| Phase 03-buildings P02 | 2 | 2 tasks | 9 files |
| Phase 03-buildings P03 | 1 | 1 task | 4 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- All phases: Client-side architecture — mesh generation, coordinate projection, elevation decode, and STL serialization all run in browser; thin server proxy only for CORS on elevation tiles
- Phase 1: Coordinate projection must use local UTM flat-earth meter space, not Web Mercator — enforced with automated tests before any geometry is built
- Phase 2: Elevation data from MapTiler terrain-RGB tiles; martini RTIN algorithm for terrain mesh; manifold-3d WASM for STL validation
- Phase 3: three-bvh-csg for building-terrain boolean operations (prevents non-manifold geometry)
- Phase 4: Zustand store extended first — all new state fields (roadFeatures, waterFeatures, vegetationFeatures, roadStyle, layerToggles, smoothingLevel, units) before any new mesh component reads them
- Phase 5: geometry-extrude@0.2.1 for road centerline-to-ribbon mesh; vertex displacement for roads and water (not CSG) to avoid quadratic triangle intersection cost on dense cities
- Phase 6: Water must be applied to elevation grid BEFORE buildTerrainGeometry() — depression baked into terrain STL, WaterMesh.tsx is visual overlay only
- Phase 7: Smooth DEM elevation Float32Array BEFORE all feature placement — smoothing applied after feature geometry is generated destroys building bases and road edges
- Phase 9: Web Worker + Transferable ArrayBuffers for mesh generation — merge all geometry into three typed arrays before postMessage, never per-feature buffers (prevents 44x Chrome regression)
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
- [Phase 03-buildings 03-01]: three-mesh-bvh@0.9.8 installed with --legacy-peer-deps (conflict with @react-three/drei@10 which pins 0.8.3)
- [Phase 03-buildings 03-01]: Winding convention — positive shoelace area = CCW in UTM Y-up coords (reverse only when area < 0); plan doc said screen-space convention which is opposite
- [Phase 03-buildings 03-01]: zScale for buildings includes TERR-03 minHeightMM=5 floor check to stay aligned with terrain on flat areas
- [Phase 03-buildings 03-01]: mergeGeometries from three/addons/utils/BufferGeometryUtils.js (not main three package)
- [Phase 03-buildings 03-02]: OBB via rotating calipers — Graham scan convex hull + per-edge AABB projection, keep minimum-area rotation; axes[0] = long axis
- [Phase 03-buildings 03-02]: Hipped roof falls back to pyramidal when building is square (halfExtents[0] <= halfExtents[1] means ridge length is zero)
- [Phase 03-buildings 03-02]: Non-flat wall height = max(50% buildingHeight, buildingHeight - roofHeight) — prevents invisible walls from disproportionate OSM roof height data
- [Phase 03-buildings 03-02]: BuildingMesh uses non-blocking building fetch — terrain visible immediately, buildings load asynchronously with status indicator
- [Phase 03-buildings 03-03]: CSG fallback to mergeGeometries — if three-bvh-csg throws or exceeds 10s, fall back to simple merge; export never fails completely
- [Phase 03-buildings 03-03]: Non-manifold seam warning (non-blocking) for buildings+terrain export — slicers auto-repair minor seam gaps, blocking the export entirely would be worse UX
- [Phase 03-buildings 03-03]: Evaluator attributes=['position', 'normal'] — skip UV to avoid attribute-mismatch errors in three-bvh-csg when geometries lack UV channels
- [Phase 01-foundation 01-03]: HTML overlay approach for bbox rectangle — div follows map via 'move' event listener; no MapLibre GeoJSON source required
- [Phase 01-foundation 01-03]: maps.current vs maps[id] — without MapProvider, useMap() only populates .current key; always use maps.current inside a <Map> child
- [Phase 01-foundation 01-03]: API key guard pattern — cast env var as string|undefined, guard with if (!KEY) return <ErrorUI>; never silently pass empty string to MapTiler

### Pending Todos

None.

### Blockers/Concerns

- Phase 1 gap closure (01-03): Automated task complete (code fixes committed, 14/14 tests pass). UAT browser verification still pending — requires user with valid MapTiler API key to verify 9 browser scenarios
- Phase 5 (Roads): Road intersection polygon merging strategy requires a research spike — vertex displacement vs. junction polygon computation has significant mesh quality and STL validity consequences; resolve before implementation begins
- Phase 6 (Water): Coastal/ocean handling requires a concrete v1 decision before water layer architecture is finalized — options: scope out, elevation-zero raster fallback, or osmdata.openstreetmap.de water polygons; resolve in Phase 6 research spike
- Phase 9 (Worker): comlink + vite-plugin-comlink with shared geometry lib code — production build edge cases (Pitfall 15) warrant a spike before full implementation

## Deferred Issues

Pre-existing `npm run build` failures (NOT caused by Phase 3 changes — exist in committed codebase from Phase 2/3 — addressed in Phase 9):
- `src/components/Preview/PreviewControls.tsx(2,1): THREE declared but never read`
- `src/lib/buildings/__tests__/walls.test.ts(131,5): All variables are unused`
- `src/lib/mesh/terrain.ts(7,21): Missing declaration for @mapbox/martini`
- `src/lib/mesh/terrain.ts(69,47): geographicDepthM declared but never read`

## Session Continuity

Last session: 2026-02-24
Stopped at: v1.0 roadmap re-scoped — Phases 4-9 defined and written to ROADMAP.md; REQUIREMENTS.md traceability updated; ready to begin Phase 4 planning
Resume file: None
