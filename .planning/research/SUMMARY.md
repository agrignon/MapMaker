# Project Research Summary

**Project:** MapMaker — Map-to-3D-printable-STL web application
**Domain:** Browser-based terrain and OSM feature 3D model generator — milestone additions (roads, water, vegetation, mesh smoothing, Web Worker offload)
**Researched:** 2026-02-24
**Confidence:** HIGH (stack: direct npm verification + codebase inspection; architecture: existing code confirmed; pitfalls: cross-verified across OSM wiki, slicer community, Three.js discourse)

## Executive Summary

MapMaker is a client-side SPA that converts a user-selected map bounding box into a printable STL file by combining DEM elevation data (terrain) with OSM vector features (buildings, roads, water, vegetation). Phases 1-3 are shipped and verified — location search, bbox selection, terrain generation, buildings, STL export, and orbit preview are all working. The current milestone adds roads, water bodies, vegetation, terrain smoothing, layer controls, and a Web Worker offload to complete the v1 pipeline. The research-recommended approach is to extend the proven pipeline architecture incrementally: add parallel Overpass fetches for each new feature type, apply each as a lib module following the established `overpass.ts / parse.ts / geometry.ts / types.ts` pattern, and wire them into the existing store-first data flow and merge export chain. No redesign is required; all new features slot cleanly into established grooves.

The two new stack additions are minimal and justified: `geometry-extrude` for road polyline-to-ribbon mesh generation (earcut-based, TypedArray output, zero conflict with existing stack), and `comlink` + `vite-plugin-comlink` for ergonomic Web Worker communication (replaces raw postMessage boilerplate, provides TypeScript types). Everything else — water bodies, vegetation geometry, and terrain smoothing — reuses existing dependencies (earcut, three-bvh-csg, @mapbox/martini, osmtogeojson) through the existing pipeline patterns. No new frameworks, no dependency sprawl.

The critical risk pattern for this milestone is geometry correctness under multi-layer composition. Roads at intersections produce overlapping triangle geometry unless junction handling is explicit. Water bodies encoded as OSM multipolygon relations require proper ring assembly via `osmtogeojson` (already in the project). Applying terrain smoothing after feature placement erodes building bases and road edges — avoided entirely by smoothing the DEM elevation grid before any feature geometry is generated. The secondary risk is Web Worker transfer overhead — solved by merging all geometry into three large typed arrays before postMessage rather than one ArrayBuffer per feature.

## Key Findings

### Recommended Stack

The existing stack (Vite 6, React 19, TypeScript, Tailwind v4, MapLibre GL JS, Three.js 0.183, Zustand, @mapbox/martini, earcut 3, proj4, osmtogeojson, three-bvh-csg, manifold-3d) is not changed. Two additions are needed for this milestone:

**Core technologies (new additions only):**
- `geometry-extrude@0.2.1`: Road centerline-to-ribbon mesh — returns TypedArrays that wire directly into `THREE.BufferGeometry`; handles miter joints at bends; earcut is its only dependency (already in project, installs its own 2.x copy automatically); only new runtime dependency
- `comlink@4.4.2` + `vite-plugin-comlink@5.3.0`: Web Worker ergonomics — turns worker functions into async-callable main-thread methods with proper TypeScript types; eliminates postMessage/onmessage boilerplate
- Custom separable box/Gaussian filter (no library): Terrain DEM smoothing — ~30 lines of TypeScript operating on the existing `Float32Array` elevation grid; no maintained TypeScript-native height-field smoothing library exists; `three-subdivide` is unsuitable (designed for organic mesh smoothing, causes tearing on flat grid geometries)

Water bodies, vegetation, and terrain smoothing require zero new libraries. They reuse earcut (triangulation), osmtogeojson (multipolygon assembly), three-bvh-csg (CSG merge), and @mapbox/martini already in the project.

**Version compatibility confirmed:** `geometry-extrude` ships its own earcut 2.x separate from the project's earcut 3.x — npm handles the two copies automatically, no conflict. `vite-plugin-comlink@5.3.0` requires `comlink@^4.3.1` (satisfied by 4.4.2) and `vite>=2.9.6` (project uses Vite 6.0.5).

See `.planning/research/STACK.md` for full rationale and alternatives considered.

### Expected Features

**Must have (table stakes — all required for v1 milestone):**
- Roads as 3D geometry with type-based widths — every competitor (TerraPrinter, Map2Model, TerrainForge3D) shows roads; absence makes models hard to orient
- Road style selection (raised / recessed / flat) — unique differentiator; no competitor offers this; recessed channels support the painting workflow
- Water bodies as flat depressions below terrain — users expect water visually distinct and lower than land
- Vegetation as toggleable raised patches — parks and forests as OSM polygon extrusions; OSM coverage varies by region
- Layer toggles for all feature types — terrain, buildings, roads, water, vegetation each independently on/off
- Terrain smoothing slider (0-10 Laplacian iterations) — raw 30m SRTM produces sharp elevation steps; smoothing is now competitive table stakes; TerraPrinter added it as a headline feature
- Full model controls — X/Y/Z dimensions in mm; unit toggle mm/inches; contextual control visibility
- Edit-iterate loop — adjust bbox or parameters without losing cached OSM data or layer state
- Web Worker mesh generation — complex scenes lock the main thread 2-5 seconds without offloading
- Production build compiles — Vite/TypeScript static build must succeed for deployment

**Should have (differentiators):**
- Terrain smoothing slider with live preview (not just one-click like TerraPrinter) — visible UX advantage
- Edit → iterate without re-fetching OSM — no competitor caches OSM data between edits
- Location-name STL filenames (`london-uk-150mm.stl`) — minor UX win, `locationName` already in store
- Unit toggle mm/inches — no competitor offers this

**Defer to v1.x / v2+:**
- River/canal as linear depression channels — high geometry complexity; validate water layer first
- GPX track overlay — request-driven, after core is proven
- Shareable URL encoding settings — low-cost v1.x add once core works
- Elevation contour lines — TerrainForge3D has it; low urgency for v1
- KML import, tiling export, AR preview, 3MF multi-material — v2+

See `.planning/research/FEATURES.md` for full competitor matrix and implementation notes per feature.

### Architecture Approach

This milestone extends the proven architecture without redesigning it. The existing four patterns are preserved: store-first data flow (Zustand as single source of truth), pipeline lib functions (`lib/<feature>/` directories with pure TypeScript), mesh component pattern (`XxxMesh.tsx` subscribes to store, builds geometry in `useEffect`), and `zScale` contract (all layers share the same scale formula).

**Major components and new responsibilities:**
1. `mapStore.ts` — extend with `roadFeatures`, `waterFeatures`, `vegetationFeatures`, `roadStyle`, `layerToggles`, `smoothingLevel`, `units`, and per-feature status fields; raw `ElevationData` stays immutable in store (smoothing is a mesh-gen parameter, not stored state)
2. `GenerateButton.tsx` — add parallel `fetchRoadData()`, `fetchWaterData()`, `fetchVegetationData()` calls alongside existing buildings fetch; all start simultaneously; each updates store independently on completion
3. `TerrainMesh.tsx` — apply `applyWaterToElevationGrid()` on the elevation Float32Array BEFORE calling `buildTerrainGeometry()`; accept `smoothingLevel` param and apply box blur before martini mesh generation
4. `RoadMesh.tsx` / `WaterMesh.tsx` / `VegetationMesh.tsx` (new) — follow `BuildingMesh.tsx` pattern exactly
5. `ExportPanel.tsx` — extend merge chain to include roads and vegetation; water depression is baked into the terrain mesh (no separate water geometry in export)
6. `lib/worker/meshWorker.worker.ts` (new, Phase 8) — receives plain Float32Array buffers via Transferable; returns three merged typed arrays; main thread reconstructs `BufferGeometry`

**Key architectural constraint (water):** Water must be applied to the elevation grid before `buildTerrainGeometry()` is called. The depression must be baked into the terrain mesh for STL correctness. `WaterMesh.tsx` renders a visual overlay (blue polygon at water level) for preview only; the physical STL depression comes from the modified terrain.

**Build order enforced by dependencies:** Model controls + store (Phase 4) → Roads (Phase 5) → Water (Phase 6) → Vegetation + Smoothing (Phase 7) → Web Worker (Phase 8). Water modifies the elevation pipeline upstream of terrain generation; smoothing must precede all feature placement; Worker refactoring requires the full feature set to be stable.

See `.planning/research/ARCHITECTURE.md` for the full data flow diagram, store extension plan, and anti-pattern list.

### Critical Pitfalls

1. **Road intersection overlap (Pitfall 7)** — Independent segment extrusion creates overlapping triangles at every junction. Prevent with: use `geometry-extrude.extrudePolyline()` which handles miter joints on single polylines, and choose vertex displacement on the terrain mesh over CSG ribbon geometry for export.

2. **Smoothing applied after feature placement destroys features (Pitfall 13)** — Uniform Laplacian smoothing moves building-base and road-edge vertices, creating skirts and surface blending. Prevent with: smooth the raw DEM elevation `Float32Array` BEFORE generating any feature geometry. Never apply smoothing to the final merged mesh.

3. **Water multipolygon relations break simple polygon parsing (Pitfall 10)** — Lakes with islands and river systems are OSM multipolygon relations with outer + inner rings. Prevent with: use `osmtogeojson` (already in project) to assemble relations before triangulation; test against a lake-with-islands before declaring water complete.

4. **Web Worker postMessage overhead with many small buffers (Pitfall 14)** — Passing one ArrayBuffer per feature causes 44x performance degradation in Chrome vs. three merged arrays. Prevent with: merge all geometry types into single position/normal/index arrays in the Worker before postMessage; never transfer per-feature buffers.

5. **CSG cost grows quadratically with each new layer (Pitfall 17)** — Per-feature CSG against terrain produces O(n × m) triangle intersection tests that blow up for dense city areas. Prevent with: use vertex displacement for roads and water (lower terrain vertex Z within polygon bounds); reserve CSG for building-terrain only where it is already working.

6. **Vite Worker production build breaks on shared chunk imports (Pitfall 15)** — Worker works in `vite dev` but fails in `vite build` when it shares chunks with the main thread. Prevent with: keep worker entry self-contained, set `worker: { format: 'es' }` in vite config, run `vite build` and verify Worker completion as an explicit acceptance test.

7. **Z-fighting between roads, water, and terrain (Pitfall 16)** — Near-coplanar geometry causes GPU flickering in preview and non-manifold edges in STL. Prevent with: unconditional Z-offset rules (water: terrain − 0.5mm minimum; roads raised: terrain + 0.8mm; roads recessed: terrain − 0.3mm) enforced in geometry generation code, not just Three.js material offsets.

## Implications for Roadmap

The phase structure is dictated by the pipeline dependency graph. Water modifies the elevation grid upstream of terrain generation. Smoothing must precede feature placement. Roads are geometrically independent. Worker offload requires all feature geometry to be stable before typed-array interfaces are refactored.

### Phase 4: Model Controls + Store Foundation

**Rationale:** Every subsequent feature consumes store state (layer toggles, road style, units, smoothing level). Building store extensions and control UI first means each new feature can be immediately tested against toggle behavior. No geometry risk, no architectural risk.
**Delivers:** `mapStore.ts` extended with all new state fields; layer toggle UI wired to existing terrain/building meshes; contextual control visibility (road style hidden when roads off; smoothing slider hidden when terrain off); unit conversion (mm/inches display-only).
**Addresses:** Layer toggles for all feature types, model controls (X/Y/Z), unit toggle, edit-iterate loop state foundation.
**Avoids:** Toggle-state confusion — establishes correct behavior before any new layer geometry exists.
**Research flag:** Standard patterns — Zustand state extension is well-documented; skip research-phase.

### Phase 5: Roads Layer

**Rationale:** Roads are geometrically independent from water and vegetation — the Overpass query, parse, geometry pipeline, and mesh component can be built and tested in isolation. Most impactful visual addition. Road intersection geometry strategy (displacement vs. ribbon) must be established here before it propagates.
**Delivers:** `lib/roads/` module; `RoadMesh.tsx` following `BuildingMesh.tsx` pattern; roads fetched in parallel in `GenerateButton`; roads in STL export merge chain; road style (raised/recessed/flat) UI wired to store.
**Uses:** `geometry-extrude.extrudePolyline()` for ribbon geometry; existing elevation sampler for terrain-draping; existing Overpass/osmtogeojson infrastructure.
**Addresses:** Roads as 3D geometry, type-based widths, road style selection (key differentiator).
**Avoids:** Pitfall 7 (intersection overlap) — establish junction strategy and minimum-width floor (0.8mm) before type-specific road work. Pitfall 8 (bridges/tunnels) — filter tunnels from Overpass; raise bridge ways by layer tag. Pitfall 9 (sub-mm widths) — enforce `Math.max(0.8, realWidth * scale)` floor. Pitfall 16 (Z-fighting) — establish road Z-offset convention unconditionally.
**Research flag:** Needs research-phase for road intersection polygon merging — the gnarliest geometry problem in the milestone; community solutions vary and the right approach for this codebase needs a spike.

### Phase 6: Water Layer

**Rationale:** Water integration with the elevation grid is architecturally the most complex of the new layers — it modifies the upstream terrain pipeline, not just adds a downstream mesh. Building it after roads means the lib module pattern is established and the store integration is proven.
**Delivers:** `lib/water/` module; `applyWaterToElevationGrid()` function that runs BEFORE terrain mesh generation; water depression baked into terrain STL geometry; `WaterMesh.tsx` visual overlay (blue, preview only); toggleable water layer.
**Addresses:** Water bodies as flat depressions, toggleable water layer.
**Avoids:** Pitfall 10 (multipolygon relations) — use `osmtogeojson` for ring assembly; test against lake-with-islands. Pitfall 11 (coastlines not in Overpass) — scope ocean to elevation-zero raster fallback for v1; skip raw coastline ways. Pitfall 13 (smoothing destroys water edges) — water is applied to elevation grid before smoothing, so depression is preserved through the smoothing pass. Pitfall 17 (CSG cost) — use vertex displacement (clamp terrain Z within water polygon), not CSG.
**Research flag:** Needs research-phase for coastal/ocean handling — Pitfall 11 requires a concrete decision: elevation-zero raster fallback, osmdata.openstreetmap.de water polygon shapefile, or scope out ocean for v1. This affects water architecture and must be decided before implementation begins.

### Phase 7: Vegetation Layer + Terrain Smoothing

**Rationale:** Vegetation is geometrically the simplest new layer (earcut-triangulated flat polygon extruded upward, identical to building floor caps). Smoothing is a parameter change to `buildTerrainGeometry()` with a UI slider — no new data pipeline. They are grouped because both are lower-complexity and best tested together (smoothing quality is visible only with all layers active).
**Delivers:** `lib/vegetation/` module; `VegetationMesh.tsx`; vegetation in STL export; `smoothingPasses` parameter in `TerrainMeshParams`; box-blur function in `lib/mesh/terrain.ts`; smoothing slider in sidebar (debounced 250ms); loading indicator during rebuild.
**Addresses:** Vegetation as raised patches, terrain smoothing slider with live preview.
**Avoids:** Pitfall 12 (empty vegetation results) — treat zero features as valid state; show count next to layer toggle ("Vegetation — 0 features found in this area"). Pitfall 13 (smoothing destroys features) — smooth elevation grid first (before all feature placement happens); cap slider at 5 iterations.
**Research flag:** Standard patterns for both — skip research-phase. Vegetation follows building floor-cap pattern exactly. Smoothing is a standard 2-pass separable box filter documented in the STACK.md implementation sketch.

### Phase 8: Web Worker Offload

**Rationale:** Worker refactoring requires the full feature set to be stable — every geometry type (terrain, buildings, roads, vegetation) must have its typed-array interface defined before the Worker module is built. Refactoring mid-feature-development would force managing two code paths simultaneously. This phase adds no new features; it is a performance and UX improvement.
**Delivers:** `lib/worker/meshWorker.worker.ts`; typed-array interfaces for all geometry builders; `BufferGeometry` reconstructors on main thread; non-blocking UI during generation; production artifact verified with Worker function completing without errors.
**Uses:** `comlink@4.4.2` + `vite-plugin-comlink@5.3.0`; Vite native `{ type: 'module' }` worker pattern; `worker: { format: 'es' }` in vite config.
**Addresses:** Web Worker mesh generation (non-blocking UI).
**Avoids:** Pitfall 14 (many-buffer postMessage overhead) — merge all geometry into three typed arrays before transfer; never per-feature buffers. Pitfall 15 (Vite production build) — keep worker self-contained, set `worker: { format: 'es' }`, verify `vite build` + Worker completion as explicit acceptance test.
**Research flag:** Needs research-phase for comlink + vite-plugin-comlink integration with multiple geometry entry points and shared code paths — documented edge cases warrant a focused spike before full implementation.

### Phase Ordering Rationale

- **Controls before geometry (Phase 4 first):** Zustand state extensions and toggle UI must exist before any new mesh component reads them, preventing build-order breakage and enabling immediate toggle testing.
- **Roads before water (Phase 5 before 6):** Roads are geometrically independent; water modifies the elevation pipeline which is architecturally upstream. Establishing the lib module pattern on roads first makes water integration cleaner.
- **Water before vegetation (Phase 6 before 7):** Water modifies terrain; vegetation is placed on top of the (potentially water-modified) smoothed terrain. Correct ordering produces correct base Z for vegetation vertices.
- **Smoothing grouped with vegetation (Phase 7):** Smoothing is a DEM-grid parameter, logically independent but visually tested with all layers active. Both are lower-complexity and group naturally.
- **Worker last (Phase 8):** The Worker refactors all geometry builders simultaneously. Doing this before features are stable creates double maintenance burden. Feature stability is the prerequisite.
- **Displacement over CSG for roads and water:** PITFALLS.md Pitfall 17 is explicit — per-layer CSG against terrain produces quadratic time growth for dense cities. Roads and water use vertex displacement on the DEM grid; CSG is reserved for building-terrain only.

### Research Flags

Phases needing a research spike during planning:
- **Phase 5 (Roads):** Road intersection polygon merging strategy — the choice between vertex displacement and junction polygon computation has significant consequences for mesh quality and STL validity; needs a focused decision spike.
- **Phase 6 (Water):** Coastal/ocean handling — Pitfall 11 makes raw Overpass coastlines unusable; the v1 decision (scope out, raster fallback, or pre-processed shapefile) affects architecture and must be made before water implementation begins.
- **Phase 8 (Worker):** comlink + vite-plugin-comlink with shared geometry lib code — production build edge cases (Pitfall 15) and multi-entry-point Worker configuration need a spike before full implementation.

Phases with standard patterns (skip research-phase):
- **Phase 4 (Controls):** Zustand state extension and React context visibility patterns are thoroughly documented.
- **Phase 7 (Vegetation + Smoothing):** Vegetation follows building floor-cap pattern exactly; smoothing is a standard separable box filter with implementation sketch already in STACK.md.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Direct `npm info` queries verified all versions and peer deps; Vite docs confirmed worker syntax; existing codebase confirmed integration points; earcut version split confirmed via GitHub releases |
| Features | MEDIUM-HIGH | Live competitor pages (TerraPrinter, Map2Model, TerrainForge3D) confirmed feature sets; OSM wiki authoritative for tag hierarchies; some vegetation geometry style inferred from domain context + existing building patterns |
| Architecture | HIGH | Based on direct codebase inspection of existing `lib/`, `store/`, and `components/Preview/` patterns; all new features confirmed to slot into established grooves without redesign |
| Pitfalls | MEDIUM | Cross-verified via OSM wiki, Three.js discourse, Chrome DevTools documentation, slicer community; some performance numbers (44x postMessage regression) from community benchmarks, not primary research |

**Overall confidence:** HIGH for implementation approach; MEDIUM for edge-case behavior (coastlines, dense-city road intersection geometry at junctions, Worker production build edge cases with shared chunks)

### Gaps to Address

- **Ocean / coastline handling:** The OSM Overpass coastline limitation (Pitfall 11) requires a concrete v1 decision before water layer architecture is finalized. Options: (a) scope out ocean and document it, (b) use elevation-zero raster fallback on the DEM (terrain vertices with elevation <= 0 treated as water), (c) fetch osmdata.openstreetmap.de water polygons clipped to bbox. Resolve in Phase 6 research spike.
- **Road intersection polygon strategy:** `geometry-extrude` handles miter joints for single polylines but does not merge overlapping ribbons at multi-way junctions. The project must decide: (a) vertex displacement on terrain grid (no intersection problem, less geometrically precise), (b) junction polygon computation (correct geometry, more complex), or (c) accept minor slicer warnings at dense junctions. Resolve in Phase 5 research spike.
- **Worker shared chunk edge cases:** `vite-plugin-comlink` + geometry lib shared-import edge cases (Pitfall 15) are documented but not fully characterized for this project's specific import graph. A production build spike must be the first deliverable of Phase 8.
- **Overpass rate limits at scale:** Current single-user usage does not surface Overpass rate limits. The single combined Overpass query for all feature types (recommended in ARCHITECTURE.md anti-pattern 1) reduces exposure. Flagged for v1.x infrastructure if traffic grows.

## Sources

### Primary (HIGH confidence)
- `npm info geometry-extrude`, `npm info comlink`, `npm info vite-plugin-comlink` — version, peer deps, last modified dates (direct npm registry query)
- Vite Web Workers official docs (vitejs.dev) — native worker syntax, TypeScript support, production build behavior
- geometry-extrude GitHub README — extrudePolyline/extrudePolygon API, TypedArray output format
- earcut GitHub releases — 3.0.0 ESM-only vs. 2.2.4 CJS distinction, confirming the two-copy npm behavior
- MapMaker codebase (direct inspection) — existing `overpass.ts`, `elevationSampler.ts`, `types.ts`, `buildingMesh.ts`, `mapStore.ts` patterns
- OSM Highway wiki (wiki.openstreetmap.org/wiki/Key:highway) — tag hierarchy and classification
- OSM water features wiki (wiki.openstreetmap.org/wiki/Tag:natural=water) — water/waterway tags
- OSM landuse wiki (wiki.openstreetmap.org/wiki/Key:landuse) — vegetation/park tags
- Overpass API Language Guide — compound queries, `out geom` format, relation member assembly

### Secondary (MEDIUM confidence)
- TerraPrinter, Map2Model, TerrainForge3D live pages — competitor feature analysis
- OSM 3D printing wiki (2013, outdated) — confirmed recessed road approach as community expectation
- Three.js discourse — smoothing discussion, Worker BufferGeometry round-trip pattern
- Laplacian smoothing Wikipedia — algorithm description and shrinkage property of uniform Laplacian
- vite-plugin-comlink GitHub — plugin configuration pattern, TypeScript types path
- Evil Martians article — Three.js OffscreenCanvas + Web Worker patterns with Transferable ArrayBuffers
- GameDev.net article (box filtering height maps) — separable box filter for height map smoothing rationale
- Nosferalatu — Laplacian mesh smoothing implementation reference

### Tertiary (LOW confidence)
- Chrome DevTools postMessage 44x regression benchmark (Pitfall 14) — community benchmark post, not primary research; directionally correct but specific multiplier needs validation against this project's geometry sizes
- OSM coastline handling via osmdata.openstreetmap.de — inferred from osmdata documentation; not tested against actual coastline bbox query

---
*Research completed: 2026-02-24*
*Ready for roadmap: yes*
