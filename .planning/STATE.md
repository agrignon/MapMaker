---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
last_updated: "2026-02-28T06:41:04.070Z"
progress:
  total_phases: 8
  completed_phases: 8
  total_plans: 23
  completed_plans: 23
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-24)

**Core value:** Users can turn any place in the world into a physical 3D-printed model with full control over features and dimensions
**Current focus:** Phase 8 — Edit, Iterate, Export Polish (in progress)

## Current Position

Phase: 8 — Edit, Iterate, Export Polish (in progress)
Plan: 2 of 2 complete — Phase 8 Plan 02 done: Watertight STL export (earcut base plate, perimeter-vertex walls, strict manifold validation gating) (EXPT-03)
Status: Phase 8 complete; PREV-03 + PREV-04 + EXPT-06 + EXPT-03 done; 179 tests passing
Last activity: 2026-02-28 — Plan 08-02 complete: watertight solid mesh construction + strict validation blocking all non-manifold STL downloads

Progress: [█████████░] 96%

## Performance Metrics

**Velocity:**
- Total plans completed: 13
- Average duration: 2.5 min
- Total execution time: ~0.5 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation | 2 | 7 min | 3.5 min |
| 02-terrain-preview-export | 4 | 9 min | 2.25 min |
| 03-buildings | 3 | 19 min | 6.3 min |
| 04-model-controls-store-foundation | 3 | 7 min | 2.3 min |
| 05-roads-layer | 2 | 10 min | 5 min |

**Recent Trend:**
- Last 5 plans: 2 min, 2 min, 1 min, 8 min, 4 min
- Trend: Normal

*Updated after each plan completion*
| Phase 08-edit-iterate-export-polish P01 | 3 | 2 tasks | 5 files |
| Phase 02-terrain-preview-export P05 | 1 | 2 tasks | 2 files |
| Phase 03-buildings P01 | 3 | 3 tasks | 15 files |
| Phase 03-buildings P02 | 2 | 2 tasks | 9 files |
| Phase 03-buildings P03 | 1 | 1 task | 4 files |
| Phase 04-model-controls-store-foundation P01 | 2 | 2 tasks | 3 files |
| Phase 04-model-controls-store-foundation P02 | 2 | 2 tasks | 8 files |
| Phase 04-model-controls-store-foundation P03 | 3 | 2 tasks | 6 files |
| Phase 05-roads-layer P01 | 6 | 2 tasks | 9 files |
| Phase 05-roads-layer P02 | 4 | 2 tasks | 8 files |
| Phase 06-water-layer P01 | 3 | 2 tasks | 6 files |
| Phase 06-water-layer P02 | 4 | 2 tasks | 9 files |
| Phase 07-vegetation-terrain-smoothing P01 | 2 | 2 tasks | 6 files |
| Phase 07-vegetation-terrain-smoothing P02 | 4 | 2 tasks | 11 files |
| Phase 08-edit-iterate-export-polish P02 | 7 | 2 tasks | 3 files |

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
- [Phase 04-model-controls-store-foundation]: LayerToggles interface exported from mapStore.ts; setTargetWidth uses get() for aspect-ratio-preserving depth calculation; terrain has no toggle (always on); setUnits is display-only; Three.js mesh.visible=false for instant hide without regeneration
- [Phase 04-model-controls-store-foundation]: CollapsibleSection uses local useState for expand/collapse (ephemeral UI state, not Zustand)
- [Phase 04-model-controls-store-foundation]: PreviewSidebar is now self-contained with no children prop; dimension inputs migrated from ExportPanel to ModelSizeSection
- [Phase 04-model-controls-store-foundation 04-03]: targetReliefMM = targetHeightMM - basePlateThicknessMM; caller subtracts base plate before passing to TerrainMeshParams/BuildingGeometryParams — keeps library functions focused on surface geometry
- [Phase 04-model-controls-store-foundation 04-03]: buildAllBuildings building heightMM refactored to heightM * zScale (instead of heightM * horizontalScale * exaggeration) — correct for targetReliefMM override, TERR-03 floor, and normal cases
- [Phase 05-roads-layer]: geometry-extrude@0.2.1 has rawVertices bug; patched via patch-package — rawVertices: vertices → rawVertices: points in convertPolylineToTriangulatedPolygon
- [Phase 05-roads-layer]: ROAD_WIDTH_MM: highway=1.8mm, main=1.2mm, residential=0.7mm; ROAD_DEPTH_MM: highway=1.0mm, main=0.6mm, residential=0.3mm; ROAD_COLOR: #555555
- [Phase 05-roads-layer]: Bridge lift = ROAD_DEPTH_MM[tier] * 2; UV never set on road geometry to avoid mergeGeometries attribute mismatch with terrain/buildings
- [Phase 05-roads-layer 05-02]: Roads merged via mergeGeometries (not CSG) in export — roads are additive geometry; CSG reserved for buildings
- [Phase 05-roads-layer 05-02]: generateFilename unified suffix builder — terrain[-buildings][-roads] covers all 4 layer combinations with hasRoads=false default for backward compat
- [Phase 05-roads-layer]: Road mesh Z-fighting fix combines position offset (0.1 world units) + polygonOffset material flags — dual approach covers all GPU depth-buffer scenarios
- [Phase 05-roads-layer]: Road fetch chained via .finally() not .then() — buildings and roads are both optional; building failure must not silently skip road fetch
- [Phase 05-roads-layer]: Building base Z uses Math.min (lowest terrain sample) — uphill walls extend below terrain and are hidden by occlusion; gives flush base without extra geometry
- [Phase 05-roads-layer]: Sutherland-Hodgman clipping applied only in export path (ExportPanel) — preview mesh unclipped for speed; STL clips to ±width/2, ±depth/2 footprint
- [Phase 06-water-layer]: Water depression baked into elevation grid at WATER_DEPRESSION_M=3.0m below shoreline minimum; island holes excluded via ray-cast point-in-ring
- [Phase 06-water-layer]: Overpass water query uses relation member recursion (>;out skel qt;) to reconstruct MultiPolygon water bodies from OSM relations
- [Phase 06-water-layer]: WaterMesh uses earcut on main thread (not worker) — flat polygon tessellation is fast enough; worker adds complexity without benefit for non-animated geometry
- [Phase 06-water-layer]: generateFilename hasWater param adds -water suffix — extends terrain[-buildings][-roads] pattern; no breaking change (default false)
- [Phase 07-vegetation-terrain-smoothing 07-01]: smoothElevations moved to caller-side — buildTerrainGeometry receives pre-smoothed data; pipeline order: smoothElevations → applyWaterDepressions → buildTerrainGeometry
- [Phase 07-vegetation-terrain-smoothing 07-01]: Radius formula Math.round((smoothingLevel/100)*8) — level=25 → radius=2 (matches old default), level=0 → no smoothing, level=100 → radius=8
- [Phase 07-vegetation-terrain-smoothing]: VegetationMesh Z uses polygon centroid sampled from smoothed elevation grid — flat plateau per feature, tracks smoothing slider
- [Phase 07-vegetation-terrain-smoothing]: polygonOffsetFactor=-4 for vegetation (less than water's -6) ensures vegetation renders below water at overlaps without exclusion logic
- [Phase 07-vegetation-terrain-smoothing]: MIN_VEGE_AREA_M2=2500 (50m x 50m) filters pocket parks too small to print at typical 150mm model scale
- [Phase 08-edit-iterate-export-polish 08-01]: CSS visibility:hidden (not unmount) preserves R3F WebGL context when user goes Back to Edit — re-entry is instant
- [Phase 08-edit-iterate-export-polish 08-01]: triggerRegenerate() uses useMapStore.getState() outside React — works from StaleIndicator onClick handler
- [Phase 08-edit-iterate-export-polish 08-01]: generatedBboxKey is 5-decimal coordinate string; only bbox changes trigger stale indicator, not settings changes
- [Phase 08-edit-iterate-export-polish 08-01]: Reverse geocode only fires when locationName is null — search result is never overwritten on regenerate
- [Phase 08-edit-iterate-export-polish 08-01]: feature.text preferred over place_name for clean STL filenames (short name vs qualified address)
- [Phase 08-edit-iterate-export-polish]: Earcut base plate replaces 2-triangle rectangle in solid.ts: base plate must use exact same perimeter XY as wall bottom edges or boundary edges remain (21% → 0%)
- [Phase 08-edit-iterate-export-polish]: ExportPanel always blocks non-manifold download: removed warn-and-allow path for feature+terrain exports

### Pending Todos

None.

### Blockers/Concerns

- Phase 1 gap closure (01-03): Automated task complete (code fixes committed, 14/14 tests pass). UAT browser verification still pending — requires user with valid MapTiler API key to verify 9 browser scenarios
- Phase 6 (Water): Coastal/ocean handling requires a concrete v1 decision before water layer architecture is finalized — options: scope out, elevation-zero raster fallback, or osmdata.openstreetmap.de water polygons; resolve in Phase 6 research spike
- Phase 9 (Worker): comlink + vite-plugin-comlink with shared geometry lib code — production build edge cases (Pitfall 15) warrant a spike before full implementation

## Deferred Issues

Pre-existing `npm run build` failures (NOT caused by Phase 3 changes — exist in committed codebase from Phase 2/3 — addressed in Phase 9):
- `src/components/Preview/PreviewControls.tsx(2,1): THREE declared but never read`
- `src/lib/buildings/__tests__/walls.test.ts(131,5): All variables are unused`
- `src/lib/mesh/terrain.ts(7,21): Missing declaration for @mapbox/martini`
- `src/lib/mesh/terrain.ts(69,47): geographicDepthM declared but never read`

## Session Continuity

Last session: 2026-02-28
Stopped at: Completed 08-02-PLAN.md — Watertight STL export: earcut-triangulated base plate, perimeter-vertex walls, corner Z-gap stitching, strict manifold validation gating (blocks all non-manifold downloads); EXPT-03 done; 179 tests passing
Resume file: None
