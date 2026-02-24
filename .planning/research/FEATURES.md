# Feature Research

**Domain:** Map-to-3D-printable-STL web application
**Researched:** 2026-02-23
**Confidence:** MEDIUM — Competitor feature sets confirmed via multiple sources; user pain points from instructional content and community; some gaps around newer tools (Map2Model JS-only pages blocked).

## Feature Landscape

### Table Stakes (Users Expect These)

Features every existing tool in the space provides in some form. Missing any of these = product feels broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Location search (city, address, coordinates) | Every tool except Terrain2STL (oldest) offers text search. Users expect to type a place name rather than manually drag a map blind. Absent in original Terrain2STL and criticized as a gap. | LOW | Geocoding via Nominatim (OSM, free) or Mapbox. TouchTerrain added this in v3.0 (2020) and it was immediately the most-praised UX improvement. |
| Draggable bounding box on 2D map | 100% of tools use a rectangular area selector. Core interaction paradigm for the domain. | LOW | Terrain2STL originally had a fixed-size box; being unable to resize it was explicitly listed as a "disadvantage" by reviewers. |
| Terrain elevation data with vertical exaggeration control | Every tool provides z-scale control. Flat terrain (z=1) produces unreadable prints — exaggeration is mandatory for most areas. | MEDIUM | SRTM (30–90m) is baseline; USGS/NED (10m US) is better. Auto z-scale that targets a desired height in mm is a highly valued feature (added in TouchTerrain 3.3). |
| Configurable base plate / base thickness | Every single tool includes a base. A print with zero base falls apart off the bed. Users expect to control base height in mm. | LOW | Terrain2STL defaults 2mm; TouchTerrain users commonly set 0.5–3mm. Always-on is correct — this is not a toggle. |
| STL file export and download | The product is literally an STL generator. No STL output = the product does not exist. | LOW | Binary STL is standard. Some tools also offer OBJ, 3MF. STL must be printable without repair. |
| Physical dimension controls (width, depth, height in mm) | Users need the model to fit their printer's build plate. Every tool provides some form of this. Without it users get random-sized prints. | LOW | Should enforce build plate limits. mm default is standard in the hobby. |

### Differentiators (Competitive Advantage)

Features where existing tools are split, weak, or absent — and where MapMaker can compete.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Buildings with height geometry (not just flat footprints) | TouchTerrain has NO buildings. Terrain2STL has NO buildings. Map2Model has buildings but NO terrain elevation. TerrainForge3D has buildings but flat-ish terrain. TerraPrinter introduced combined terrain+buildings and it is explicitly listed as its headline feature. The combination is genuinely rare. | HIGH | Uses OSM building:height and roof data where available; falls back to estimated heights. This is the gap MapMaker specifically plans to fill. Coverage is OSM-dependent. |
| Live side-by-side hybrid view (2D map + 3D preview updating together) | No current tool does this well. TouchTerrain generates server-side and shows a post-processing preview. TerraPrinter shows a 3D view but it is separate from the selection map. Real-time feedback while toggling features on the 2D editor is a significant UX step change. | HIGH | Three.js or Babylon.js for 3D; MapLibre GL or Leaflet for 2D. Keeping them synchronized is the core technical challenge. |
| Configurable road style (recessed channels / raised surfaces / flat) | No existing tool offers this. Roads are typically either absent (TouchTerrain), included flat at terrain level (TerraPrinter), or extruded identically (Map2Model). Recessed roads serve the "painting" workflow (user paints road color into the groove). Raised roads serve architectural and military modeling. | MEDIUM | Road geometry comes from OSM. Width and style are design choices. Recess/raise is a boolean surface offset on the terrain mesh. |
| Toggle individual feature layers (terrain on/off, buildings on/off, roads on/off) | TerrainForge3D partially does this with layer types (buildings, water, railways, road categories). TerraPrinter offers layer toggles. Most simple tools (Terrain2STL, TouchTerrain) offer none — terrain only. Per-layer toggles let users create terrain-only, city-only, or hybrid models from a single flow. | MEDIUM | State machine: each layer affects mesh generation. Toggling terrain off with buildings on requires a flat base surface (elevation becomes 0 but buildings still extrude). |
| Unit switching (mm / inches) | Absent from most tools. US-based hobbyists often work in inches in their slicers and need to specify print dimensions in their preferred unit. | LOW | Pure UI conversion layer — no geometry impact. |
| Measurements switchable between mm and inches with persistence | See above. | LOW | Store preference in localStorage. |
| Orbit / zoom / pan 3D preview with reset | TouchTerrain provides a basic post-generation preview. TerraPrinter provides a proper interactive 3D viewer. TerraSTL uses Three.js. Orbit controls are now expected by users who have used TerraPrinter or Maps3D. | MEDIUM | Three.js OrbitControls is the standard pattern. |
| Edit → preview → edit iteration loop | No tool supports this without re-running the full pipeline. The ability to tweak parameters and see the 3D result update (or at least go back to edit mode without losing selections) is a workflow improvement no competitor offers cleanly. | MEDIUM | State management: preserve selections and settings when navigating between views. |

### Anti-Features (Commonly Requested, Often Problematic)

Features to explicitly NOT build in v1 — either scope creep, complexity bombs, or better handled elsewhere.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Multi-color / multi-material STL export | Users want terrain brown, buildings grey, roads black automatically in the print | Requires multi-body STL or 3MF with material assignments; slicer support varies wildly; correct color mapping for geographic features requires a separate design system; Bambu Studio and PrusaSlicer handle this manually better than any automated tool today | Solid single-color model is the target; user paints in slicer per PROJECT.md |
| User accounts / saved projects | Users want to save their work | Server-side state, auth system, database — doubles infrastructure scope for v1; no clear monetization path validated | Export settings as a shareable URL (simpler, no auth, same resume-ability) |
| Custom polygon / freehand area selection | Power users want irregular boundaries (coastline, state borders) | KML/GPX import adds significant UI complexity; freehand drawing on a map is a difficult interaction; edge cases multiply | Rectangle bounding box with adjustable size and rotation covers 90%+ of use cases; KML can be v2 |
| Tiling / multi-tile for large print areas | Users with small printers want to print large areas in pieces | Large area processing is computationally expensive; tile joining geometry requires precise alignment; build plate limit detection per-printer is complex | Instruct users to use their slicer to cut the model; or document this as v2 |
| Texture / color overlay on the STL | Users want satellite imagery baked onto the model surface | UV-mapped textures on terrain meshes require significant post-processing; printer support varies; most FDM printers can't reproduce texture meaningfully | Clean raised geometry that users paint manually or with multi-filament slicer; good surface geometry at adequate resolution makes painting easier |
| GPX track overlay (hiking trails) | TerraPrinter added this; users who want to memorialize a hike want their GPS path on the model | Edge case use case for v1; draping a GPX line on a terrain mesh requires interpolation at each vertex; adds data format handling complexity | Can be v2; core terrain+buildings+roads is the primary value |
| Real-time server-side processing progress bar | Users are anxious during STL generation | Hard to implement accurately; SSE or WebSocket adds infrastructure complexity | Show estimated wait time based on area size; use client-side generation where feasible to avoid the problem |
| Mobile-native experience | Users are on phones | 3D canvas performance on mobile is poor; dragging a precise bounding box on a small screen is frustrating; the print workflow ultimately connects to a desktop slicer | Responsive layout as best-effort; optimize for desktop as primary |

## Feature Dependencies

```
[Location Search]
    └──enables──> [2D Map View loads at correct location]
                       └──enables──> [Bounding Box Selection]
                                         └──enables──> [Feature Layer Toggles]
                                                           └──enables──> [3D Preview]
                                                                             └──enables──> [STL Export + Download]

[Terrain Layer]
    └──required for──> [Elevation Exaggeration Control]
    └──required for──> [Road Style (recessed/raised/flat)]

[Buildings Layer]
    └──requires──> [OSM building data fetch]
    └──enhances──> [Terrain Layer] (buildings sit on terrain surface)

[Roads Layer]
    └──requires──> [OSM road network fetch]
    └──requires──> [Road Style Selection]

[Dimension Controls (X/Y/Z mm)]
    └──feeds into──> [STL mesh scaling at export time]

[Unit Toggle (mm/inches)]
    └──wraps──> [Dimension Controls] (display layer only)

[3D Preview]
    └──requires──> [At least one feature layer enabled]
    └──enhances──> [Edit → Iterate loop]

[Base Plate]
    └──always-on — no dependency, always included in export]
```

### Dependency Notes

- **Location Search requires 2D Map View:** The geocoding result pans and zooms the map — this is the entry point to the whole flow.
- **Bounding Box requires 2D Map View:** The box is drawn on the map canvas; can't exist without it.
- **Feature Layer Toggles require Bounding Box:** We don't know what area to fetch data for until the box is set.
- **3D Preview requires at least one layer:** An empty scene is valid technically but confusing to users; require at least terrain or buildings to be enabled.
- **Road Style requires Roads Layer enabled:** The style control is meaningless and should be hidden/disabled when roads are toggled off.
- **Elevation Exaggeration requires Terrain Layer enabled:** Same pattern — hide control when terrain is off.
- **STL Export requires a non-empty 3D scene:** Don't allow export before any geometry is generated.
- **Buildings enhance Terrain (but don't require it):** Buildings-only on a flat base is a valid mode (city model without topography, like Map2Model). Terrain-only is also valid (like TouchTerrain). The combination is the differentiator.

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the core value proposition: "any place in the world to a print-ready STL with terrain + buildings + roads."

- [ ] **Location search** — Without this, users can't find anywhere quickly; panning a global map blind is a dealbreaker.
- [ ] **Draggable/resizable bounding box on 2D map** — Core area selection paradigm; non-negotiable.
- [ ] **Terrain layer with elevation data and z-scale exaggeration** — Half the value prop; flat land is useless.
- [ ] **Buildings layer (OSM footprints + heights)** — The other half; this is what separates MapMaker from every terrain-only tool.
- [ ] **Roads layer with style options (recessed / raised / flat)** — Table stakes for city models and the painting workflow.
- [ ] **Feature layer toggles (terrain / buildings / roads individually)** — Users need control over what appears; an all-or-nothing tool is frustrating.
- [ ] **Physical dimension controls (width mm, depth mm, height mm) + unit toggle (mm/inches)** — Required to fit a specific printer and material; otherwise every print is random-sized.
- [ ] **Live 3D preview with orbit/pan/zoom** — Users must see what they're getting before a potentially multi-hour print. No preview = no trust.
- [ ] **Edit → preview → back to edit iteration** — If users can't iterate without starting over, iteration doesn't happen.
- [ ] **STL export with solid base plate** — The literal product deliverable.
- [ ] **Download STL to local machine** — Must be direct download, no email, no account required.

### Add After Validation (v1.x)

Features to add once core workflow is proven.

- [ ] **Shareable URL encoding current settings** — Trigger: users ask "how do I save this?" or "how do I share this?" Replace user accounts with URL state.
- [ ] **Elevation contour lines (topographic lines) on model surface** — Trigger: users creating educational/decorative models request it. TerrainForge3D offers this; it adds significant visual value.
- [ ] **Adjustable area box aspect ratio / rotation** — Trigger: users complain that the square box doesn't fit their target area well.
- [ ] **GPX track overlay** — Trigger: user requests for hiking/trail visualization; TerraPrinter already has this so users will ask.
- [ ] **Water bodies as depressions** — Trigger: users working on coastal or lakeside areas want visual distinction for water.

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **KML/polygon import for non-rectangular areas** — Significant UI and processing complexity; only power users need it; defer until core rectangular flow is proven.
- [ ] **Tiling / split large areas into multiple print tiles** — High complexity; cross-tile alignment must be perfect; slicer workaround is acceptable for v1.
- [ ] **Offline / installable PWA mode** — Nice for privacy-conscious users; adds significant SW complexity; defer.
- [ ] **AR preview (place model on physical surface via phone camera)** — TerraPrinter has this; impressive but not core to the workflow; complex to implement well.
- [ ] **3MF export with multi-material color assignments** — Requires slicer ecosystem research; the "painting happens in slicer" philosophy avoids this for v1.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Location search | HIGH | LOW | P1 |
| Draggable bounding box | HIGH | LOW | P1 |
| Terrain + elevation exaggeration | HIGH | MEDIUM | P1 |
| Buildings layer (OSM heights) | HIGH | HIGH | P1 |
| Roads layer + style options | HIGH | MEDIUM | P1 |
| Feature layer toggles | HIGH | LOW | P1 |
| Physical dimensions (mm/inches) | HIGH | LOW | P1 |
| Live 3D preview with orbit controls | HIGH | MEDIUM | P1 |
| Edit → iterate → edit loop | HIGH | MEDIUM | P1 |
| STL export + download | HIGH | MEDIUM | P1 |
| Solid base plate (always on) | HIGH | LOW | P1 |
| Shareable URL encoding | MEDIUM | LOW | P2 |
| Elevation contour lines | MEDIUM | MEDIUM | P2 |
| Water body depressions | MEDIUM | MEDIUM | P2 |
| GPX track overlay | LOW | MEDIUM | P2 |
| KML polygon import | MEDIUM | HIGH | P3 |
| Tiling / multi-tile export | MEDIUM | HIGH | P3 |
| AR preview | LOW | HIGH | P3 |
| 3MF multi-material export | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Terrain2STL | TouchTerrain | Map2Model | TerraPrinter | TerrainForge3D | MapMaker plan |
|---------|-------------|--------------|-----------|--------------|----------------|---------------|
| Location search | No (coordinate only) | Yes (v3.0+) | Yes | Yes | Yes (lat/lon) | Yes (address/city/lat-lon) |
| Bounding box selection | Yes (fixed then resizable) | Yes (any aspect ratio) | Yes (rect/circle/polygon) | Yes (radius-based) | Yes (click-drag) | Yes (drag on 2D map) |
| Terrain elevation | Yes (SRTM3, 90m) | Yes (SRTM/NED, 10–30m) | No (flat only) | Yes | Partial (contours) | Yes (SRTM + higher-res sources) |
| Elevation exaggeration | Yes | Yes (auto z-scale) | N/A | Yes | No | Yes (slider) |
| Buildings | No | No | Yes (footprints + heights) | Yes | Yes | Yes (OSM footprints + heights) |
| Roads | No | No | Yes | Yes | Yes (by type) | Yes (recessed/raised/flat) |
| Road style options | No | No | No | No (flat) | No | Yes — differentiator |
| Feature layer toggles | No | No | No | Yes | Yes | Yes |
| Physical dimensions | Yes | Yes | No | Yes (max size) | Yes | Yes (X/Y/Z + unit toggle) |
| Unit toggle (mm/inches) | No | No | No | No | No | Yes |
| 3D preview | No | Yes (post-process) | No | Yes (interactive) | No | Yes (live, side-by-side) |
| Edit → iterate loop | No | No | No | Partial | No | Yes |
| STL export | Yes | Yes | Yes | Yes | No (3MF only) | Yes |
| Base plate | Yes | Yes | Yes | Yes | Yes | Yes (always included) |
| Multi-material / color | No | No | No | Yes (3MF) | Yes (3MF) | No (v1 out of scope) |

## Sources

- [TouchTerrain official site](https://touchterrain.geol.iastate.edu/) — Confirmed HIGH confidence via GitHub README
- [TouchTerrain GitHub (ChHarding)](https://github.com/ChHarding/TouchTerrain_for_CAGEO) — HIGH confidence, authoritative source for all parameters
- [TouchTerrain NEWS.md](https://github.com/ChHarding/TouchTerrain_for_CAGEO/blob/master/NEWS.md) — HIGH confidence, version history
- [Terrain2STL](https://jthatch.com/Terrain2STL/) — MEDIUM confidence (page fetched directly, feature list from live page)
- [TerraPrinter](https://terraprinter.com/) — MEDIUM confidence (page fetched directly, comprehensive feature list)
- [TerrainForge3D how-to-use](https://www.terrainforge3d.com/how-to-use) — MEDIUM confidence (page fetched directly)
- [Map2Model](https://map2model.com/) — MEDIUM confidence (JS-gated page, confirmed features via 3druck.com article and 3printr.com)
- [Prusa Blog: How to print maps, terrains and landscapes](https://blog.prusa3d.com/how-to-print-maps-terrains-and-landscapes-on-a-3d-printer_29117/) — MEDIUM confidence, workflow and pain point analysis
- [Instructables: Making a 3D Printable 3D Map With Roads and Features](https://www.instructables.com/Making-a-3D-Printable-3D-Map-With-Roads-and-Featur/) — MEDIUM confidence, manual workflow pain points
- [3druck.com Map2Model article](https://3druck.com/en/programs/map2model-webtool-creates-free-3d-printable-city-models-from-openstreetmap-data-51147820/) — MEDIUM confidence, feature summary and limitations
- [All3DP: CADMAPPER alternatives](https://all3dp.com/2/best-cad-mapper-openstreetmap-cadmapper/) — LOW confidence (blocked by 403)
- [TerraSTL GitHub](https://github.com/aligundogdu/TerraStl) — MEDIUM confidence, feature set from README

---
*Feature research for: Map-to-3D-printable-STL web application (MapMaker)*
*Researched: 2026-02-23*
