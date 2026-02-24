# Project Research Summary

**Project:** MapMaker
**Domain:** Map-to-3D-printable-STL web application
**Researched:** 2026-02-23
**Confidence:** MEDIUM (stack HIGH; features MEDIUM; architecture MEDIUM; pitfalls MEDIUM)

## Executive Summary

MapMaker is a client-side web tool that converts a user-selected geographic bounding box into a print-ready binary STL file. Experts build this type of product as a predominantly browser-side SPA — mesh generation, coordinate projection, elevation decoding, and STL serialization all happen in the browser, with only a thin server proxy layer needed to sidestep CORS restrictions on elevation tile APIs. The recommended architecture is a sequential geo-data pipeline (bbox selection → parallel elevation + OSM fetch → coordinate projection → mesh generation in a Web Worker → Three.js preview → STL export) wired together through a central Zustand store that both the 2D map and 3D preview panels subscribe to. The stack is React 19 + TypeScript 5.9 + Vite 7 + MapLibre GL JS 5.18 + Three.js 0.183 + Zustand 5 + Tailwind 4, with `@mapbox/martini` for terrain mesh generation and MapTiler terrain-RGB tiles as the elevation data source.

The competitive landscape makes clear that no existing tool combines terrain elevation, OSM buildings with real heights, and configurable road styles in a live side-by-side 2D+3D interface. TouchTerrain and Terrain2STL handle terrain only. Map2Model handles buildings but has no terrain elevation. TerraPrinter combines them but has no road style options and no live preview. MapMaker's differentiating features — the terrain+buildings+roads combination with a real-time side-by-side preview and configurable road style (recessed/raised/flat) — are all achievable in v1 and represent a genuine gap no competitor fills.

The most serious risks are geometric, not architectural. Non-manifold meshes from naive building-terrain merges, coordinate system errors from using Web Mercator instead of local meter space, and STL unit ambiguity (writing meters instead of millimeters) are all "looks done but isn't" failures that only manifest at print time. These must be caught with automated validation before any STL reaches the user. A second tier of risk involves OSM data quality: the majority of buildings worldwide lack height tags, so the building pipeline must treat height-missing as the default case from day one, not as an edge case.

## Key Findings

### Recommended Stack

The stack is entirely open-source and free to run. MapLibre GL JS (not Mapbox) is the correct 2D map choice — it is the actively maintained open-source fork with an identical API, no API key billing, and no proprietary SDK terms. Three.js 0.183 provides the 3D preview, terrain mesh construction via `BufferGeometry`, and STL export via the bundled `STLExporter` addon. Elevation data should come from MapTiler terrain-RGB tiles (free API key, standard tile URL pattern, no SDK lock-in) for MVP; the decode formula `height = -10000 + (R*256*256 + G*256 + B) * 0.1` is applied in a hidden canvas. OSM building and road data comes from the public Overpass API. The `@mapbox/martini` library handles RTIN terrain mesh generation from the elevation grid — the algorithm is stable despite low recent maintenance activity.

**Core technologies:**
- React 19 + TypeScript 5.9: UI and type safety — strict types prevent coordinate/index arithmetic bugs
- Vite 7: Build tool — WASM-friendly, fast HMR, first-class TypeScript
- MapLibre GL JS 5.18: 2D interactive map — free, open-source, WebGL-based for GPU consistency with Three.js
- Three.js 0.183: 3D preview, terrain mesh, and STL export — built-in `OrbitControls`, `STLExporter`, `BufferGeometry`
- Zustand 5: Global state — lightweight, selector-based to prevent broad re-renders across heavy map and 3D canvas
- Tailwind CSS 4: Styling — Vite plugin setup, zero config
- `@mapbox/martini` 0.2.x: RTIN terrain mesh from elevation grid
- `geotiff` 3.0.x: GeoTIFF decode if switching from terrain-RGB to OpenTopography

**Critical version notes:**
- Tailwind v4 requires `@tailwindcss/vite` plugin — the v3 PostCSS setup does not work
- `geotiff` v3 has breaking API changes from v2; `ImageFileDirectory` replaces `fileDirectory`
- `@types/three` is bundled with the `three` package — no separate install needed

### Expected Features

All 11 MVP features are P1 table stakes that must ship in v1. The product does not exist without them. The competitive analysis confirms that the combination of terrain + buildings + roads + live 3D preview is the true differentiator — any subset of these features leaves MapMaker as a weaker version of an existing tool.

**Must have (table stakes):**
- Location search (geocoding) — users cannot find areas by panning a global map blind
- Draggable, resizable bounding box on the 2D map — core interaction paradigm; fixed-size box was criticized as a dealbreaker in Terrain2STL
- Terrain layer with elevation data and vertical exaggeration control — flat terrain is unreadable; auto z-scale that targets a minimum height in mm is highly valued
- Buildings layer with OSM footprint heights — the differentiator; no purely terrain-focused tool has this
- Roads layer with recessed/raised/flat style options — no competitor offers road style control; this is MapMaker's clearest unique feature
- Feature layer toggles (terrain / buildings / roads individually) — enables terrain-only, city-only, or hybrid models
- Physical dimension controls (width, depth, height in mm) + unit toggle (mm/inches) — required to fit a specific printer bed
- Live side-by-side 3D preview with orbit/pan/zoom — users must see what they're printing before a multi-hour job
- Edit → preview → back-to-edit iteration without losing selections — no competitor does this; it is a workflow step change
- STL export with always-on solid base plate + direct browser download — the literal product deliverable

**Should have (competitive differentiators for v1.x):**
- Shareable URL encoding all current settings — replaces user accounts; low cost, high value
- Elevation contour lines on model surface — visual appeal for educational/decorative models; TerrainForge3D already has this
- Water body depressions — coastal and lakeside models gain significant visual clarity

**Defer (v2+):**
- KML/polygon import for non-rectangular areas — significant UI and processing complexity; rectangle covers 90%+ of use cases
- Tiling / split large areas into multiple print tiles — complex; slicer workaround is acceptable for v1
- AR preview — impressive but not core; TerraPrinter has it; defer until core flow is proven
- 3MF multi-material export — requires slicer ecosystem research; painting in slicer is the v1 philosophy
- GPX track overlay — edge case use case; can be v2 once core terrain+buildings+roads is proven

### Architecture Approach

The architecture is predominantly client-side with optional thin server proxy. All mesh generation, coordinate projection, elevation decoding, and STL serialization run in the browser. The critical path is: 2D bbox selection → Zustand store update → parallel fetch of elevation tiles and OSM features → coordinate projection to local meter space → Web Worker mesh generation → Three.js scene update → STL export on demand. Elevation tiles and OSM data are fetched in parallel since they are independent; mesh construction is sequential. The Web Worker is non-negotiable — blocking the main thread during mesh generation for a dense city block causes 500ms–3s UI freezes.

**Major components:**
1. 2D Map Panel (MapLibre GL JS) — location search, bounding box draw tool, feature toggle UI
2. App State (Zustand store) — single source of truth for bbox, enabled features, settings, mesh status
3. Geo Data Pipeline (`geo/`) — parallel elevation tile fetch + Overpass OSM fetch, coordinate projection to local XY meters
4. Mesh Generator Web Worker (`mesh/`) — terrain mesh, building extrusions, road geometry, base plate, merge to single BufferGeometry
5. 3D Preview Panel (Three.js + OrbitControls) — renders live mesh from store geometry, subscribes to store changes
6. STL Exporter (`export/`) — wraps Three.js STLExporter, triggers browser download
7. API Proxy (optional thin serverless function) — CORS bypass for elevation tile requests only

**Key patterns:**
- Zustand store as the single data bus — UI, map, and pipeline never communicate directly; everything flows through the store
- Separate geometry cache per layer — toggling buildings off hides the Three.js object; it does not re-run the full pipeline
- Debounced pipeline trigger (300ms) — prevents thrashing during slider drag
- Preview LOD mesh distinct from export mesh — dense city areas require a decimated preview mesh to avoid browser OOM

### Critical Pitfalls

1. **Non-manifold geometry from building-terrain merges** — Never concatenate geometry buffers when buildings contact terrain. Use `three-bvh-csg` for boolean union operations. Sample terrain elevation at each building footprint vertex so buildings sit exactly at terrain level. Run manifold validation (manifold-3d WASM) on every export before presenting the download button.

2. **Projection mismatch (Web Mercator distortion)** — Never use Web Mercator tile coordinates for mesh geometry. Project all coordinates to local flat-earth meter space centered on the bbox center before any geometry math. At 45°N latitude, Mercator scale error is ~41%; at 60°N it exceeds 100%. This is a full-pipeline rewrite if discovered post-launch.

3. **STL unit ambiguity (meters vs. millimeters)** — STL format stores no unit metadata; slicers assume millimeters. Establish one canonical rule from day one: all STL vertex coordinates are in millimeters. End the coordinate pipeline with explicit `meters × 1000` conversion. Write an automated test that exports a known bbox and asserts the STL bounding box matches the user-specified physical dimensions.

4. **Missing OSM building height data** — Most buildings worldwide have no `height` or `building:levels` tag. The building pipeline must treat missing height as the base case, not an exception. Implement a fallback hierarchy: (1) `height` tag, (2) `building:levels × 3.5m`, (3) footprint-area heuristic, (4) type-appropriate random range. Test against a rural US location before declaring the building pipeline done.

5. **Flat terrain zero-thickness** — In flat regions, elevation variation within the bbox may be under 1 meter. After scaling to print dimensions, the terrain surface compresses to a fraction of a millimeter. Enforce a minimum 1mm of terrain relief and a minimum 1.5mm base plate on all exports. Default terrain exaggeration to "auto" — compute the multiplier needed to produce at least 2mm of relief variation.

## Implications for Roadmap

The component dependency graph in ARCHITECTURE.md and the pitfall-to-phase mapping in PITFALLS.md strongly suggest a 6-phase structure. The first two phases must establish correct geometric foundations — any phase that skips this will propagate manifold, projection, or unit errors into every subsequent feature.

### Phase 1: Foundation — Map Selection + Correct Coordinate Pipeline

**Rationale:** Every other component depends on having a bbox and correct coordinate projection. The two highest-severity pitfalls (projection mismatch, STL unit ambiguity) must be solved and locked in with automated tests before any geometry feature is built. If these are wrong, all downstream phases will produce wrong-scale or non-printable models.

**Delivers:** Working 2D map with location search, draggable/resizable bounding box, and a tested coordinate projection pipeline (WGS84 → local XY meters). No 3D output yet — just provably correct input data.

**Addresses:** Location search, draggable bounding box (FEATURES.md table stakes)

**Avoids:** Projection mismatch (PITFALLS.md critical #2), STL unit ambiguity setup (PITFALLS.md critical #3)

**Stack:** MapLibre GL JS 5.18, Zustand 5 store initialization, Nominatim geocoding, TypeScript strict mode

**Research flag:** Standard patterns; well-documented. No phase research needed.

---

### Phase 2: Terrain Mesh + STL Export + 3D Preview

**Rationale:** The critical path per ARCHITECTURE.md is bbox → elevation → terrain mesh → STL export → 3D preview. This phase delivers the end-to-end pipeline for the terrain-only case, which validates the full output contract (printable STL at correct physical dimensions) before adding buildings or roads. Catching manifold and unit errors here is cheap; catching them in Phase 4 requires reworking the building merge pipeline too.

**Delivers:** Terrain-only STL that passes manifold validation, renders in the 3D preview with orbit controls, and exports at user-specified physical dimensions in millimeters. Auto-exaggeration for flat areas.

**Addresses:** Terrain layer + elevation exaggeration, physical dimension controls, unit toggle, live 3D preview with orbit controls, STL export + download, solid base plate (FEATURES.md P1)

**Avoids:** Non-manifold geometry (PITFALLS.md #1 — foundation for merge strategy), flat terrain zero-thickness (PITFALLS.md #4), STL unit ambiguity (PITFALLS.md #3)

**Stack:** Three.js 0.183, `@mapbox/martini`, MapTiler terrain-RGB tiles, Web Worker, STLExporter, manifold-3d validation

**Research flag:** Martini RTIN algorithm and terrain-RGB tile decoding are documented but non-trivial. Consider a focused research spike on tile zoom level selection and grid assembly before implementing.

---

### Phase 3: Buildings Layer

**Rationale:** Buildings are the primary differentiator. They depend on working coordinate projection (Phase 1) and a live 3D preview (Phase 2) to validate output. Building-terrain integration (placing buildings correctly on sloped terrain) is the most failure-prone aspect of this domain — it must be solved here, not deferred.

**Delivers:** OSM buildings rendered with real heights (or estimated heights where tags are missing) extruded onto the terrain surface. Buildings sit correctly at terrain level on slopes. Building layer toggle works.

**Addresses:** Buildings layer with OSM footprint heights, feature layer toggles (buildings) (FEATURES.md P1)

**Avoids:** Non-manifold geometry from building-terrain merge (PITFALLS.md #1 — use three-bvh-csg), missing OSM building heights (PITFALLS.md #5 — implement fallback hierarchy), hillside building geometry errors (PITFALLS.md #6)

**Stack:** Overpass API, osmtogeojson, three-bvh-csg, building height fallback logic

**Research flag:** `three-bvh-csg` CSG boolean operations for terrain-building merge may require a spike to understand performance characteristics and API. Phase research recommended.

---

### Phase 4: Roads Layer + Settings Polish

**Rationale:** Roads share Overpass/OSM infrastructure with buildings (Phase 3) but have distinct geometry logic (centerlines to offset quad strips). Road style (recessed/raised/flat) is MapMaker's clearest unique feature — no competitor offers it. Settings controls (exaggeration slider, road style picker, dimension inputs) apply to existing geometry and parameterize what was built in Phases 2–3.

**Delivers:** Roads rendered on terrain with user-selectable recessed/raised/flat style. Road layer toggle. Fully parameterized controls: terrain exaggeration, road style, print dimensions, unit toggle.

**Addresses:** Roads layer + style options, feature layer toggles (roads), dimension controls (FEATURES.md P1)

**Avoids:** Road geometry floating above terrain (PITFALLS.md "looks done but isn't" checklist — minimum 0.5mm raised / 0.3mm recessed for FDM)

**Stack:** Overpass API (roads query), road geometry offset math, Zustand settings state

**Research flag:** Standard patterns for road centerline-to-mesh conversion. OSM highway tag taxonomy is documented. No phase research needed.

---

### Phase 5: Edit-Iterate Loop + UX Hardening

**Rationale:** The edit → preview → back-to-edit loop with state preservation is a workflow differentiator that no competitor supports cleanly (FEATURES.md). UX pitfalls identified in PITFALLS.md — no progress indicators, no data coverage preview, no physical dimension annotations in the 3D view — significantly damage first impressions and must be addressed before public launch.

**Delivers:** State-preserving navigation between edit and preview modes. Progress indicators for each pipeline stage. Data coverage overlay on 2D map. Physical dimension annotations in 3D preview. Bounding box dimension readout in km and estimated mm. OSM data coverage indicator.

**Addresses:** Edit → iterate loop (FEATURES.md P1), side-by-side 2D+3D hybrid view polish

**Avoids:** All UX pitfalls in PITFALLS.md (no progress indicator, defaulting z=1 exaggeration, no size feedback, non-printable STL without warning, no coverage preview)

**Stack:** Zustand meshStatus state machine, React loading state components

**Research flag:** Standard patterns. No phase research needed.

---

### Phase 6: Performance + Public Launch Hardening

**Rationale:** Several pitfalls only manifest at real-world scale — dense city areas (Manhattan, Tokyo) that stress Overpass query size limits, browser memory on 1000+ building scenes, and Overpass rate limiting under concurrent users. These must be addressed before public launch, not after.

**Delivers:** Web Worker mesh generation, LOD preview mesh distinct from export mesh, Overpass query size guards (`[timeout:60][maxsize:32MB]`), bounding box area cap with user warning, geometry disposal for unused layers, sessionStorage elevation tile cache.

**Addresses:** Performance (implicit in all P1 features being responsive)

**Avoids:** Browser OOM on dense city areas (PITFALLS.md performance trap), Overpass rate limiting (PITFALLS.md integration gotcha), Overpass query injection (PITFALLS.md security), generating full-resolution preview mesh (PITFALLS.md technical debt)

**Stack:** Web Workers API, Transferable ArrayBuffers, Comlink (optional Worker RPC), IndexedDB/sessionStorage elevation cache

**Research flag:** Web Worker + Transferable ArrayBuffer pattern for Three.js geometry is documented but non-trivial. The Evil Martians OffscreenCanvas + Workers article is the canonical reference. Consider a spike before implementing.

---

### Phase Ordering Rationale

- **Phases 1–2 must be sequential and first.** The coordinate pipeline correctness (Phase 1) and terrain-to-STL pipeline (Phase 2) are preconditions for everything. Skipping ahead to buildings while these are unverified propagates manifold and projection bugs into all subsequent phases.
- **Phase 3 (buildings) before Phase 4 (roads)** because buildings and roads share OSM fetch infrastructure, and buildings are architecturally harder (boolean mesh merge with terrain). Getting buildings right first makes roads straightforward.
- **Phase 5 before public launch** because UX pitfalls (no progress indicator, no coverage preview) cause user abandonment at first contact regardless of geometric correctness.
- **Phase 6 as hardening.** Performance and rate-limiting issues only need addressing before real concurrent usage. Developing with them deferred keeps early phases simpler.

### Research Flags

Phases likely needing a `/gsd:research-phase` spike during planning:
- **Phase 2:** Martini RTIN tile-to-grid assembly and zoom level selection — documented but enough nuance to warrant a focused spike before implementation
- **Phase 3:** `three-bvh-csg` API and performance for building-terrain boolean operations — this is the highest-risk single integration in the project
- **Phase 6:** Web Worker + Transferable ArrayBuffer pattern for Three.js geometry — non-trivial; Evil Martians article is the starting point

Phases with standard, well-documented patterns (skip research-phase):
- **Phase 1:** MapLibre GL JS bounding box draw and Nominatim geocoding are thoroughly documented
- **Phase 4:** OSM highway tag taxonomy and road centerline-to-mesh math are standard; Overpass query patterns are documented
- **Phase 5:** React loading state and Zustand state machine patterns are standard

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core technologies (React, Three.js, MapLibre, Zustand, Vite, Tailwind) verified against official release pages. Elevation source (MapTiler terrain-RGB) confirmed as free tier with documented decode formula. `@mapbox/martini` confirmed as stable but low-maintenance. |
| Features | MEDIUM | Competitor feature sets confirmed via live pages and GitHub repositories. User pain points from instructional content and community. Map2Model features partially confirmed via secondary articles (JS-gated page). |
| Architecture | MEDIUM | Pipeline pattern confirmed across multiple open-source implementations (TerraSTL, map2stl, mapa, Streets GL). Web Worker pattern confirmed via Evil Martians. Specifics of three-bvh-csg integration are inferred, not directly verified. |
| Pitfalls | MEDIUM | Non-manifold geometry, projection distortion, and STL unit issues confirmed via official slicer documentation and community. OSM height data sparseness confirmed via OSM Wiki and academic paper. Some performance thresholds (triangle counts, memory limits) are estimates from community experience. |

**Overall confidence:** MEDIUM

### Gaps to Address

- **three-bvh-csg API for building-terrain merge:** The correct approach (CSG boolean union) is clear, but the specific API surface and performance characteristics of `three-bvh-csg` for terrain-scale meshes have not been directly validated. Address with a Phase 3 research spike.

- **Martini tile assembly for bounding boxes spanning multiple tiles:** The per-tile decode is documented; the logic for assembling multiple tiles into a coherent elevation grid (tile stitching, handling bbox-to-tile math) needs a Phase 2 spike to confirm implementation details.

- **MapTiler free tier rate limits under concurrent usage:** Free tier pauses rather than charges, but the exact request-per-day limits for terrain-RGB tile serving are not confirmed. May require a CORS proxy and caching strategy earlier than Phase 6.

- **Overpass public instance reliability for production:** Public Overpass allows ~10,000 requests/day. For a publicly accessible tool, this could be exhausted quickly. A self-hosted Overpass instance should be planned for as a Phase 6 milestone before public launch, not an afterthought.

- **Browser canvas CORS for terrain-RGB decode:** Reading pixel data from a cross-origin image via canvas requires CORS headers on the tile server. MapTiler serves tiles with appropriate CORS headers, but a fallback proxy may be needed. Verify early in Phase 2.

## Sources

### Primary (HIGH confidence)
- [MapLibre GL JS official docs](https://maplibre.org/maplibre-gl-js/docs/) — bounding box API, BoxZoomHandler, LngLatBounds
- [Three.js STLExporter docs](https://threejs.org/docs/pages/STLExporter.html) — binary export from BufferGeometry
- [Three.js OrbitControls docs](https://threejs.org/docs/) — import path and capabilities
- [React versions](https://react.dev/versions) — v19.2.4 current
- [Vite releases](https://vite.dev/releases) — v7.3.1 current
- [Tailwind CSS v4 announcement](https://tailwindcss.com/blog/tailwindcss-v4) — Vite plugin setup
- [Zustand v5 announcement](https://pmnd.rs/blog/announcing-zustand-v5) — React 18+ required
- [Mapbox terrain-RGB decode formula](https://docs.mapbox.com/data/tilesets/reference/mapbox-terrain-dem-v1/) — official formula
- [Overpass API bounding box queries](https://wiki.openstreetmap.org/wiki/Overpass_API) — QL syntax, rate limits
- [TouchTerrain GitHub](https://github.com/ChHarding/TouchTerrain_for_CAGEO) — feature set and version history
- [OSM Simple 3D Buildings schema](https://wiki.openstreetmap.org/wiki/Simple_3D_buildings) — height tag coverage

### Secondary (MEDIUM confidence)
- [TerraSTL GitHub](https://github.com/aligundogdu/TerraStl) — Nuxt/Vue + Three.js + OpenTopoData architecture
- [Streets GL](https://github.com/StrandedKitty/streets-gl) — WebGL2 OSM rendering pipeline patterns
- [map2stl GitHub](https://github.com/davr/map2stl) — hybrid client/server architecture model
- [mapbox/martini GitHub](https://github.com/mapbox/martini) — RTIN algorithm, v0.2.0 stable
- [geotiff npm](https://www.npmjs.com/package/geotiff) — v3.0.3, breaking changes from v2
- [Evil Martians: OffscreenCanvas + Web Workers](https://evilmartians.com/chronicles/faster-webgl-three-js-3d-graphics-with-offscreencanvas-and-web-workers) — Web Worker pattern for Three.js
- [manifold-3d GitHub](https://github.com/elalish/manifold) — WASM mesh repair
- [three-bvh-csg Three.js Forum](https://discourse.threejs.org/t/three-bvh-csg-a-library-for-performing-fast-csg-operations/42713) — CSG approach for building-terrain merge
- [TerraPrinter](https://terraprinter.com/) — competitor feature set
- [Terrain2STL](https://jthatch.com/Terrain2STL/) — competitor feature set
- [Prusa Blog: printing terrain](https://blog.prusa3d.com/how-to-print-maps-terrains-and-landscapes-on-a-3d-printer_29117/) — workflow and user pain points
- [Estimation of missing building heights](https://gmd.copernicus.org/articles/15/7505/) — academic confirmation of OSM height data sparseness
- [OSM Help: Missing Building Height](https://help.openstreetmap.org/questions/56351/missing-building-heightlevel-informations) — community confirmation

### Tertiary (LOW confidence)
- [All3DP: CADMapper alternatives](https://all3dp.com/2/best-cad-mapper-openstreetmap-cadmapper/) — blocked by 403; competitor landscape only partially captured
- [Map2Model features](https://map2model.com/) — JS-gated page; features confirmed via secondary articles only

---
*Research completed: 2026-02-23*
*Ready for roadmap: yes*
