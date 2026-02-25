# Feature Research

**Domain:** Map-to-3D-printable-STL web application — New milestone features
**Researched:** 2026-02-24
**Confidence:** MEDIUM-HIGH — Road/water/smoothing approaches confirmed via multiple live competitors (TerraPrinter, Map2Model, OSM wiki); some implementation specifics (vegetation geometry style) from domain inference + codebase context.

---

> **Scope note:** Phases 1-3 shipped and verified (location search, bbox, terrain, buildings, STL export, orbit preview).
> This file focuses on what the NEW milestone adds on top of that foundation.
> Prior FEATURES.md entries for already-shipped features are retained for dependency mapping only.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist for this class of tool. Missing any makes the product feel incomplete for the v1 milestone.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Roads as visible 3D geometry | Every competitor with OSM integration shows roads. City and terrain models without any road network look wrong and are harder to orient. TerraPrinter, Map2Model, TerrainForge3D all include roads. | MEDIUM | OSM `highway=*` ways; buffered centerlines into quads/triangles draped on terrain surface. Width varies by highway class. |
| Road geometry distinct from terrain surface | Roads must be visually differentiated — raised, recessed, or flat. A road at exactly terrain surface is invisible. | MEDIUM | Vertical offset: raised (+N mm) or recessed (−N mm). The distinction drives the painting workflow: recessed channels collect paint; raised roads create barriers. |
| Type-based road widths | A motorway is wider than a footpath. Uniform-width roads look wrong and fail the "realistic model" expectation. | LOW | OSM hierarchy: motorway/trunk (~8–12m), primary/secondary (~6–8m), tertiary/residential (~4–6m), path/footway (~1–2m). Scale by the model's mm-per-meter factor. |
| Water bodies as depressed flat surfaces | Lakes, rivers, ocean shown flat (horizontal) and below surrounding terrain. Users expect water to be visually distinct and lower than land. | MEDIUM | OSM `natural=water`, `waterway=riverbank`. Clamp Z to water-level elevation; create flat polygon mesh at water surface. Must be lower than terrain to be readable as water in print. |
| Vegetation as a distinct toggleable layer | Parks and forests expected to be visible or at minimum suppressed for terrain-only models. TerraPrinter, Map2Model, MapLab3D all include parks/green space. | MEDIUM | OSM `landuse=forest`, `landuse=grass`, `leisure=park`. Simple raised polygon or omitted entirely per user toggle. |
| Layer toggles for all feature types | Competitive minimum: TerraPrinter and TerrainForge3D both offer per-layer toggles. Users who want terrain-only or buildings-only must not be forced to export everything. | LOW | Pure UI state in Zustand; controls which meshes are rendered and which are included in STL export. |
| Physical dimension controls (X, Y, Z in mm) | Users must fit the model to their print bed. Currently width/depth exist in store; Z (height) control is missing but expected. | LOW | Already have `targetWidthMM`/`targetDepthMM` in store. Add `targetHeightMM` or constrain via max Z. |
| Mesh smoothing control | Raw 30m SRTM/DEM produces sharp elevation steps. The user already reported this as a quality concern (PROJECT.md). TerraPrinter added Laplacian smoothing as a headline feature. This is now table stakes for any mesh-quality-conscious tool. | MEDIUM | Laplacian vertex averaging (iterative), user-controlled iteration count (0 = raw, 5–10 = smooth). Runs on `Float32Array` positions before export or preview refresh. |
| Terrain smoothing does not distort feature geometry | If smoothing moves terrain vertices, buildings and roads placed on terrain must follow. The smoothed terrain is the canonical surface for all feature placement. | MEDIUM | Smooth terrain grid first; re-sample building/road base Z from smoothed grid. Order matters. |
| Location name in exported STL filename | Users download many models; an unnamed `model.stl` is confusing. Expected: `london-uk-150mm.stl`. `locationName` already tracked in store. | LOW | Already implemented in export pipeline based on `locationName` state. Validate it is wired through. |
| Production build compiles without errors | A tool that only runs in dev is not shippable. TypeScript/Vite compilation to static files must succeed. | LOW | Not a feature per se, but a prerequisite for every feature to ship. Fix TS errors and vite build config. |

### Differentiators (Competitive Advantage)

Features where MapMaker can out-execute competitors or where no competitor does this well.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Road style selection: raised / recessed / flat | No competitor offers this. TerraPrinter shows roads flat. Recessed roads are the only approach that works for the "paint the road a different color" workflow. Raised roads suit military/tactical models. This is the intended differentiator per PROJECT.md. | MEDIUM | Toggle enum: `raised` (+offset above terrain), `recessed` (indent below terrain), `flat` (at terrain Z). Offset: ~0.5–1.5mm in model space. |
| Terrain smoothing slider with live preview | TerraPrinter has Laplacian smoothing but it is a one-click option, not interactive. A slider with live preview update is a better UX and lets users tune quality vs. file size. | MEDIUM | Slider value = smoothing iterations (0–10). Triggers terrain mesh rebuild and preview update. May need debounce (250ms) to avoid thrash. Web Worker recommended for performance. |
| Vegetation as actual extruded geometry | Competitors either omit vegetation or show it as color in 3MF. Raised terrain patches for parks/forests give the model tactile texture and help users orient. | MEDIUM | OSM `leisure=park`, `landuse=forest`, `landuse=grass`. Flat polygon extruded 0.3–0.8mm above terrain (symbolic height, not literal tree height). |
| River/canal as navigable depression channels | Rivers are often narrow linear features. Modeling them as depressed channels (OSM `waterway=river`, `waterway=canal`) rather than just flat polygons shows flow direction and creates readable linear features even at small model scales. | HIGH | Buffer centerline by width tag or classification default; create a mesh cap below terrain level along the path. Intersects terrain mesh: requires mesh boolean or terrain vertex clamping. |
| Edit → iterate → export without re-fetching OSM | Users should be able to return to the 2D map, adjust parameters, and update the 3D preview without fetching OSM data again. OSM data is cached in Zustand state (buildings already cached as `buildingFeatures`). Same pattern for roads, water, vegetation. | MEDIUM | Data fetch on "Generate"; cache in store; re-mesh from cached data when parameters change. Avoids Overpass rate limits and latency. |
| Web Worker mesh generation (non-blocking UI) | Complex scenes (terrain + buildings + roads + water + vegetation) can lock the main thread for 2–5 seconds. Offloading to a Worker keeps the UI responsive during generation. | HIGH | Transfer `Float32Array` buffers to Worker (zero-copy); receive back processed geometry; construct Three.js BufferGeometry on main thread from returned arrays. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Realistic tree geometry (cylinders + spheres) | Users imagine literal tree models on forest areas | Trees at terrain scale are tiny, print poorly (detail < nozzle diameter), increase triangle count dramatically, and break watertightness. OSM tree data is also sparse and unreliable. | Extruded polygon "forest patch" at +0.5mm. Distinct enough to identify; paintable; prints cleanly. |
| Individual road lanes or markings | Road detail visible on maps suggests it should appear on model | Lane markings at model scale are sub-millimeter — invisible after printing and just increase mesh complexity. Lane count exaggeration would be misleading at small scale. | Width proportional to classification is sufficient. Detail lives in the painting layer. |
| Water surface texture / wave geometry | Users want water to look like water | Geometric wave patterns are below FDM resolution for typical model sizes; surface texture doesn't survive most printing processes; adds mesh complexity for zero print quality gain. | Flat depression at water level. User applies blue paint or blue filament in slicer. |
| Animated terrain smoothing preview | Users want to see smoothing animate | Requires re-rendering during slider drag; even with debounce this is GPU-intensive for large meshes; the visual diff between iteration steps is tiny. | Debounced preview update (250ms delay after slider stop). Clear "Applying smoothing..." state indicator. |
| Per-road-type color in 3D preview | Users want primary roads red, motorways blue, etc. | Requires material per road type; complicates the mesh merge; confusing in monochrome STL output context; TerraPrinter does this for preview only and it requires separate mesh per type | Single road material in preview; style conveys type via width; user identifies types in slicer after export. |
| Water physics / elevation-accurate water level | Water should sit at the exact DEM elevation of the water feature | DEM values over water bodies are unreliable (radar noise, cloud cover); computing precise water level from OSM tags requires a separate data source; not worth the complexity for v1 | Use minimum terrain elevation in water polygon footprint + small downward offset. Good enough for print distinction. |
| Vegetation height from canopy models | Forest height from lidar/DSM data | Lidar DSM data is not freely available globally; computing canopy from DEM vs. DTM requires separate tile sets; enormous scope expansion | Fixed symbolic extrusion height (e.g., 0.5mm in model space). |

## Feature Dependencies

```
[Already shipped — Phases 1-3]
    [Location Search] → [2D Map + Bbox] → [Terrain Generation] → [Buildings] → [STL Export]

[New milestone features]

[Terrain Smoothing Slider]
    └──requires──> [Terrain mesh (ElevationData + terrain.ts already exist)]
    └──must run before──> [Road/Water/Building base Z sampling]
    └──feeds into──> [STL Export mesh quality]

[Roads Layer]
    └──requires──> [OSM road fetch (new overpass query)]
    └──requires──> [Terrain elevation sampler (elevationSampler.ts already exists)]
    └──requires──> [Road Style selection (raised/recessed/flat)]
    └──toggle controls──> [Road geometry included in STL]

[Road Style Control]
    └──requires──> [Roads Layer enabled]
    └──inputs──> [road Z offset: +N mm raised, -N mm recessed, 0 flat]

[Water Layer]
    └──requires──> [OSM water fetch (new overpass query)]
    └──requires──> [Terrain elevation sampler]
    └──toggle controls──> [Water geometry included in STL]
    └──constraint: water Z < terrain Z at same XY]

[Vegetation Layer]
    └──requires──> [OSM landuse/leisure fetch (new overpass query)]
    └──requires──> [Terrain elevation sampler]
    └──toggle controls──> [Vegetation geometry included in STL]

[Layer Toggles UI]
    └──controls──> [Roads Layer, Water Layer, Vegetation Layer]
    └──already controls──> [Terrain Layer, Buildings Layer (extend existing pattern)]

[Dimension Controls (X/Y/Z + unit toggle)]
    └──X/Y already in store (targetWidthMM, targetDepthMM)]
    └──add: targetHeightMM or Z clamp
    └──unit toggle: mm/inches (display-only conversion, no geometry impact)
    └──feeds into──> [STL Export scaling]

[Web Worker offload]
    └──wraps──> [Terrain mesh build, road mesh build, building mesh build]
    └──requires──> [Transferable Float32Array buffers — no Three.js objects in worker]
    └──enables──> [Non-blocking UI during generation]

[OSM Data Cache]
    └──roads, water, vegetation cached in Zustand after first fetch]
    └──enables──> [Edit → iterate loop without re-fetching]
    └──buildings already cached as buildingFeatures in store (same pattern)]
```

### Dependency Notes

- **Smoothing must precede feature placement:** Roads and buildings use the terrain's Z values as a base. If smoothing runs after road geometry is generated, roads will not follow the smoothed surface. Smooth first, then sample elevation for all other features.
- **Water geometry conflicts with terrain mesh at the same Z:** Water must always be slightly below the terrain surface. The simplest implementation: find the minimum DEM value within the water polygon, subtract a small offset (0.2–0.5mm in model space). Avoids mesh boolean operations.
- **Road mesh must be watertight for STL:** Roads draped on terrain as open quads need side walls and bottom caps to contribute to a valid solid. Same pattern as buildings — each road segment is a prism, not a surface patch.
- **Layer toggles must affect both preview and export:** A road toggled off must be absent from the STL, not just hidden in Three.js. Export should re-read toggle state, not just use whatever geometry is in the scene.
- **Web Worker cannot use Three.js:** BufferGeometry construction must happen on the main thread. Workers receive/return plain `Float32Array` (positions, normals, indices). Main thread wraps them into BufferGeometry.
- **Unit toggle (mm/inches) is display-only:** All internal geometry and store values stay in mm. The UI converts on display and converts back on input. No geometry pipeline change.

## MVP Definition

### Launch With (v1 — current milestone)

This milestone completes the "full pipeline" goal. All items below must ship for v1.

- [ ] **Roads layer** — OSM highway ways as 3D prisms on terrain, type-based widths, style choice (recessed/raised/flat).
- [ ] **Road style selection (raised / recessed / flat)** — The key differentiator; drives the painting workflow.
- [ ] **Water bodies as flat depressions** — Lakes, rivers shown below terrain level; toggleable.
- [ ] **Vegetation as raised patches** — Parks and forests as extruded polygons; toggleable.
- [ ] **Layer toggles for all feature types** — Terrain, buildings, roads, water, vegetation each individually on/off.
- [ ] **Mesh smoothing slider** — Laplacian iterations 0-10; live preview update; smooth terrain before feature placement.
- [ ] **Full model controls** — Width, depth, height in mm; unit toggle (mm / inches); contextual visibility (road style hidden when roads off; smoothing available when terrain on).
- [ ] **Edit-iterate loop** — Return to 2D map without losing bbox, layer states, or cached OSM data; preview updates when parameters change.
- [ ] **Location-name filenames** — `london-uk-150mm.stl`; `locationName` already in store, wire through export.
- [ ] **Production build compiles** — Vite/TypeScript build succeeds without errors; can be deployed to static host.
- [ ] **Web Worker mesh generation** — Terrain + road + building mesh generation off the main thread; UI stays responsive.

### Add After Validation (v1.x)

- [ ] **River/canal channels as linear depressions** — More detailed water geometry; narrow rivers are hard to read as flat polygons at model scale. Trigger: user feedback on water readability.
- [ ] **GPX track overlay** — For hiking/trail memorabilia models. Trigger: user requests; TerraPrinter already has it, users will compare.
- [ ] **Shareable URL encoding current settings** — Replaces user accounts. Trigger: users ask "how do I save this?"
- [ ] **Elevation contour lines** — Topo ring features on terrain surface; TerrainForge3D offers this; adds educational value.

### Future Consideration (v2+)

- [ ] **KML/polygon import** — Non-rectangular areas; high complexity; defer.
- [ ] **Tiling / multi-tile export** — Large areas across multiple print pieces; slicer workaround acceptable for v1.
- [ ] **AR preview** — Model in augmented reality; TerraPrinter has it; impressive but not core.
- [ ] **3MF multi-material export** — Color-coded layers; slicer handles this better.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Roads layer (geometry) | HIGH | MEDIUM | P1 |
| Road style (raised/recessed/flat) | HIGH | LOW (given roads exist) | P1 |
| Water bodies (flat depressions) | HIGH | MEDIUM | P1 |
| Vegetation (raised patches) | MEDIUM | MEDIUM | P1 |
| Layer toggles (all feature types) | HIGH | LOW | P1 |
| Mesh smoothing slider | HIGH | MEDIUM | P1 |
| Model controls (X/Y/Z + units) | HIGH | LOW | P1 |
| Edit-iterate loop | HIGH | MEDIUM | P1 |
| Location-name filenames | MEDIUM | LOW | P1 |
| Production build fix | HIGH | LOW | P1 |
| Web Worker offload | MEDIUM | HIGH | P1 |
| River/canal linear channels | MEDIUM | HIGH | P2 |
| GPX track overlay | LOW | MEDIUM | P2 |
| Shareable URL | MEDIUM | LOW | P2 |
| Contour lines | MEDIUM | MEDIUM | P2 |
| KML polygon import | MEDIUM | HIGH | P3 |
| Tiling export | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for this milestone (v1.0)
- P2: Add when core is working and users validate
- P3: Future consideration

## Competitor Feature Analysis

| Feature | TerraPrinter | Map2Model | TerrainForge3D | MapMaker target |
|---------|--------------|-----------|----------------|-----------------|
| Roads | Yes (flat on terrain) | Yes | Yes (by type) | Yes — recessed/raised/flat style |
| Road style options | None (flat only) | None | None | Yes — unique differentiator |
| Road type-based widths | Unknown | Yes | Yes | Yes — OSM classification-driven |
| Water bodies | Yes (toggleable) | Yes | Yes | Yes — flat depressions |
| Water depth exaggeration | Yes (slider) | No | No | Not in v1 (keep flat) |
| Vegetation / parks | Yes (experimental tree scatter) | Yes | Partial | Yes — raised polygon patches |
| Mesh smoothing | Yes (Laplacian, one-click) | No | No | Yes — slider with live preview |
| Layer toggles | Yes | No | Yes | Yes — all feature types |
| Dimension controls (mm) | Yes (max printable size only) | No | Yes | Yes — X/Y/Z independent |
| Unit toggle mm/inches | No | No | No | Yes — differentiator |
| Edit-iterate without re-fetch | No | No | No | Yes — OSM data cached in store |
| Web Worker mesh gen | Unknown | No | No | Yes — planned |
| Location-name filename | No | No | No | Yes — minor UX win |

## Implementation Notes by Feature

### Roads

**OSM data source:** Overpass API — `way["highway"]` within bbox. Exclude `highway=footway`, `highway=steps`, `highway=path` by default (configurable).

**Width mapping by class (pre-scale, in meters, real-world):**
- `motorway`, `trunk`: 8–12m (model: scale by mm/m factor)
- `primary`, `secondary`: 6–8m
- `tertiary`, `residential`, `unclassified`: 4–6m
- `service`: 2–4m
- `footway`, `path`, `cycleway`: 1.5–2m

**Geometry:** Buffer centerline into quads (one quad per way segment). Triangulate. Drape on terrain by sampling Z at each vertex. Add side walls and bottom cap to make watertight prism.

**Style offset:**
- `raised`: vertex Z + 0.8mm (in model space, post-scale)
- `recessed`: vertex Z − 0.8mm (creates channels, good for painting)
- `flat`: vertex Z + 0 (visible only if slightly above terrain, may need +0.1mm epsilon)

**Intersections:** Road buffers will overlap at intersections — use max Z among overlapping segments, or merge overlapping polygons before extrusion.

### Water Bodies

**OSM data source:** Overpass — `way["natural"="water"]`, `way["waterway"="riverbank"]`, `relation["natural"="water"]["type"="multipolygon"]`.

**Geometry:** Polygon triangulation (same approach as building footprints). Z = min terrain elevation within polygon footprint − 0.3mm offset. Flat cap, no side walls needed if bounded by terrain.

**Constraint:** Must be below terrain surface or invisible in print. Use `elevationSampler.ts` pattern to find min Z within polygon bounds.

### Vegetation

**OSM data source:** Overpass — `way["landuse"="forest"]`, `way["landuse"="grass"]`, `way["leisure"="park"]`, `way["landuse"="meadow"]`.

**Geometry:** Polygon triangulation draped on terrain (sample Z for each vertex). Extrude upward by fixed symbolic height (0.3–0.5mm in model space). No side walls needed for a "bump" effect; add if full solid required for STL.

**OSM coverage note:** Park/forest coverage varies significantly by region. Always-empty vegetation in some rural areas is expected. Toggle hide is the escape hatch.

### Mesh Smoothing

**Algorithm:** Laplacian smoothing — each vertex moves toward the average of its neighbors. Iterations: 0 (raw) to 10 (smooth). Each iteration: for each interior vertex, compute mean position of adjacent vertices; assign as new position. Boundary vertices are clamped (do not move — preserves model footprint).

**Implementation:** Operate on the raw `Float32Array` elevation grid (not the final positions array) before mesh generation. Re-sample smoothed grid when generating terrain mesh. This keeps feature base Z calculations consistent with the smoothed surface.

**Preview update:** Slider debounced 250ms. Triggers terrain mesh rebuild (and road/building base re-sampling if those features are enabled). Show loading indicator during rebuild.

**Web Worker candidate:** Smoothing on large grids (512x512+) takes measurable time. Offload to worker.

### Layer Toggles and Controls UI

**State in Zustand:** Add boolean flags: `roadsEnabled`, `waterEnabled`, `vegetationEnabled`. `buildingsEnabled` and `terrainEnabled` — add if not already present.

**Contextual visibility rules:**
- Road style control: visible only when `roadsEnabled = true`
- Smoothing slider: visible when `terrainEnabled = true`
- Elevation exaggeration slider: visible when `terrainEnabled = true`
- Water depth control (if added): visible when `waterEnabled = true`

**Export behavior:** STL export reads toggle state and includes only enabled layers' meshes in the union/merge step.

## Sources

- [TerraPrinter feature set](https://terraprinter.com/) — MEDIUM confidence, live page fetch; road/water/smoothing features confirmed
- [OpenStreetMap 3D printing wiki](https://wiki.openstreetmap.org/wiki/3D_printing_OSM_data) — LOW confidence (2013, outdated), confirmed recessed road approach
- [TerraPrinter Laplacian smoothing announcement](https://terraprinter.com/) — MEDIUM confidence (mentioned on live page)
- [OSM Highway classification wiki](https://wiki.openstreetmap.org/wiki/Key:highway) — HIGH confidence, authoritative tag reference
- [Map2Model article — feature set confirmation](https://3druck.com/en/programs/map2model-webtool-creates-free-3d-printable-city-models-from-openstreetmap-data-51147820/) — MEDIUM confidence
- [Laplacian smoothing algorithm — Wikipedia](https://en.wikipedia.org/wiki/Laplacian_smoothing) — HIGH confidence, algorithm description
- [Three.js forum — smoothing discussion](https://discourse.threejs.org/t/how-to-smooth-an-obj-with-threejs/3950) — MEDIUM confidence, implementation pattern
- [Nosferalatu — Laplacian Mesh Smoothing implementation](https://nosferalatu.com/LaplacianMeshSmoothing.html) — MEDIUM confidence, algorithm reference
- MapMaker codebase — HIGH confidence: existing overpass.ts, elevationSampler.ts, types.ts patterns directly inform new feature integration points

---
*Feature research for: MapMaker — roads, water, vegetation, mesh smoothing, model controls (new milestone)*
*Researched: 2026-02-24*
