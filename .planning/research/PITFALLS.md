# Pitfalls Research

**Domain:** Map-to-3D-printable-STL web application
**Researched:** 2026-02-23
**Confidence:** MEDIUM (multiple credible sources, verified across official docs and community discussions; some claims are training-data-supported with search verification)

---

## Critical Pitfalls

These mistakes cause unusable STL files, broken prints, or require major rewrites.

---

### Pitfall 1: Non-Manifold Geometry from Building-Terrain Boolean Merges

**What goes wrong:**
When building meshes are combined with the terrain surface, boolean union operations frequently produce non-manifold edges — edges shared by more than two faces, T-junctions where walls meet terrain, and open holes at the building base perimeter. Slicers (PrusaSlicer, Bambu Studio, Cura) cannot determine inside vs. outside for non-manifold meshes, resulting in missing infill, slicing failures, or silent silently incorrect G-code.

**Why it happens:**
Developers treat building footprint extrusion and terrain mesh generation as separate pipelines and then merge the results with a simple mesh concatenation (combining vertex arrays) rather than a proper boolean CSG operation. Floating point imprecision at the boundary means building base vertices rarely align exactly with terrain surface vertices. The result is a mesh that looks visually correct in the 3D preview but fails printability validation.

**How to avoid:**
- Never concatenate geometry buffers directly when building-to-terrain contact exists. Use a proper CSG library (three-bvh-csg is the current standard for Three.js) for all building-terrain intersections.
- Validate every exported STL with a manifold check before presenting it to the user. Libraries like manifold-3d (WebAssembly port) or server-side MeshLib can perform this check programmatically.
- Embed buildings into the terrain by computing the terrain height at each building footprint vertex and ensuring building base geometry starts at or below terrain level — this eliminates the gap/overlap problem at the seam.
- Run automatic repair as part of the export pipeline, not as a manual user step.

**Warning signs:**
- The 3D preview renders fine but slicers report "non-manifold edges" on import.
- Buildings near the edge of a bounding box appear visually attached but produce slicer warnings.
- File repair tools (Meshmixer, 3D Builder) find hundreds of errors on a freshly exported model.

**Phase to address:** Foundation phase (mesh generation pipeline) — establishing a correct boolean merge strategy before any feature work prevents propagating this bug through every subsequent feature.

---

### Pitfall 2: Projection Mismatch Causing Physically Wrong Dimensions

**What goes wrong:**
The web map display uses Web Mercator (EPSG:3857) for tile rendering, but geographic data (OSM building coordinates, DEM elevation values) is delivered in WGS84 (EPSG:4326). If the developer uses Mercator-projected coordinates directly for mesh generation — common when naively converting screen pixel positions to 3D space — the printed model will have correct shape near the equator but measurably distorted dimensions at higher latitudes. At 45 degrees latitude, Mercator scale error is approximately 41%; at 60 degrees, it exceeds 100%. A 100mm × 100mm print of Stockholm would be ~170mm × 100mm if Mercator coordinates are used without reprojection.

**Why it happens:**
Map tile libraries expose coordinates in Web Mercator because it's the display projection. Developers unfamiliar with geodesy reuse these coordinates for geometry construction. The distortion is invisible at typical map zoom levels and only becomes apparent when a physical model is measured.

**How to avoid:**
- Always reproject bounding box coordinates and all geographic data into a local UTM zone before constructing any 3D geometry. UTM preserves metric distances within a zone.
- Identify the correct UTM zone from the bounding box center coordinate using a library like `utm` (npm) or `proj4`.
- Express all mesh vertices in meters in local UTM space, then apply the user's requested physical dimensions as a final scale factor.
- Never feed longitude/latitude degree values as metric distances into geometry generation.

**Warning signs:**
- Model bounding box dimensions don't match what the user specified (e.g., user asks for 100mm × 100mm but the model is 140mm × 100mm).
- Buildings in the preview appear correctly proportioned but printed dimensions disagree with sliced dimensions.
- Testing against a location at 60°N latitude produces visibly stretched geometry.

**Phase to address:** Foundation phase (coordinate pipeline) — the entire geometry pipeline's correctness depends on this being right from day one.

---

### Pitfall 3: STL Unit Ambiguity (Unitless Format Causes Wrong-Scale Prints)

**What goes wrong:**
The STL file format stores no unit information — it only stores raw floating point vertex coordinates. Slicers interpret these numbers as millimeters by default. If the generator writes coordinates in meters, a 200m × 200m terrain area becomes a 200,000mm × 200,000mm print that is comically oversized. If coordinates are in some intermediate unit, the print silently comes out at the wrong scale, and the user only discovers this after wasting filament.

**Why it happens:**
Developers work in whatever coordinate space is natural to the GIS pipeline (meters) and forget to convert to millimeters before writing the STL. The 3D preview may look fine because the preview camera auto-fits to scene bounds, hiding the scale error.

**How to avoid:**
- Define one canonical rule: all STL vertex coordinates are written in millimeters. The coordinate pipeline ends with a conversion from meters to millimeters (multiply by 1000).
- The user's physical dimension inputs (e.g., "100mm wide") become the authoritative scale reference. Compute the scale factor as `target_mm / geographic_extent_meters * 1000` and apply it to all geometry before export.
- Write a test that exports an STL for a known bounding box, imports it, and asserts vertex bounds match the expected millimeter dimensions.

**Warning signs:**
- Slicer opens the STL and the model appears as a dot, or fills the entire print volume with no room to spare.
- Print preview in slicer shows dimensions that are 1000× or 1/1000 of what was intended.
- User reports "the model comes out tiny."

**Phase to address:** STL export phase — must be verified with an automated dimensional test before shipping export.

---

### Pitfall 4: Missing or Zero-Thickness Terrain in Flat Regions

**What goes wrong:**
In flat areas (Netherlands, coastal Florida, prairies), elevation variation within the bounding box may be less than 1 meter. After applying the user's scale and physical dimensions, the entire terrain surface and all topographic relief compress into a fraction of a millimeter of Z height — effectively zero thickness. The resulting STL either fails geometry validation or produces a "paper model" that shatters on removal from the print bed.

**Why it happens:**
Developers apply a uniform scale to fit geographic extent into the user-specified physical size, without accounting for the fact that Z and XY are on entirely different scales. Elevation variation is orders of magnitude smaller than horizontal extent for most locations.

**How to avoid:**
- Always enforce a minimum terrain surface-to-base height regardless of elevation data range. A safe floor is 1mm of relief (the terrain surface varies by at least 1mm regardless of real-world flatness).
- Expose terrain exaggeration as a first-class user control, defaulting to "auto" which computes the exaggeration needed to produce printable relief. For truly flat areas, the auto setting should produce a gentle raised surface texture rather than a flat plate.
- Guarantee a solid base plate of at least 1.5mm below the lowest terrain point — this ensures a minimum total Z of approximately 2.5mm for any model.
- Warn the user when the selected area is flat: "This area has very low elevation variation. Terrain exaggeration has been set to X to make the model printable."

**Warning signs:**
- User selects an area in the Netherlands or coastal plains and the 3D preview shows a nearly flat disc.
- STL validator reports zero-area faces or degenerate triangles in the terrain mesh.
- Slicer reports the model is 0.2mm tall.

**Phase to address:** Terrain generation phase — add elevation range detection and auto-exaggeration logic before user-testing.

---

### Pitfall 5: OSM Building Height Data Is Mostly Missing

**What goes wrong:**
The vast majority of OSM buildings worldwide have no height tag and no building:levels tag. Research on the Simple 3D Buildings schema confirms that renderers must fall back to default height values for most buildings. If a developer builds the building pipeline expecting height data to be present, the output for most cities will be a flat footprint with no 3D geometry — or buildings will crash at runtime when the height attribute is null/undefined.

**Why it happens:**
OSM's data richness is geographically uneven. Dense urban areas in Germany, the Netherlands, and parts of the US have rich 3D tagging; most of the world does not. During development, testing against a well-tagged city (Berlin, Amsterdam) creates a false impression that data will be available in production.

**How to avoid:**
- Design the building pipeline with missing height as the base case, not the exception.
- Implement a fallback hierarchy: (1) `height` tag if present, (2) `building:levels` × 3.5m if present, (3) footprint-area heuristic (larger footprint → taller estimate), (4) random value within type-appropriate range (residential: 6–12m, commercial: 8–20m).
- Display a UI indicator when buildings in the selected area are using estimated heights, not tagged heights: "Building heights estimated for X% of structures."
- Test against a sparsely-tagged location (rural US, Southeast Asia) before considering the building pipeline complete.

**Warning signs:**
- All buildings in the 3D preview are uniform height.
- Runtime null reference error when processing building features.
- The OSM Overpass query returns buildings with no height or levels attributes.

**Phase to address:** Building geometry phase — implement fallback height strategy before building rendering is considered done.

---

### Pitfall 6: Building Geometry Extends Below Terrain Surface (Hillside Buildings)

**What goes wrong:**
When a building sits on a slope, its footprint spans multiple elevation values. A naive implementation extrudes the building footprint from a single base elevation (e.g., the average or minimum of the footprint), causing the building to float above the terrain on the uphill side or sink below it on the downhill side. In STL, buildings that float above terrain produce a gap (non-printable void); buildings that sink below produce intersecting geometry that breaks manifold conditions.

**Why it happens:**
Developers treat buildings as 2D footprints extruded by a height value, without sampling terrain elevation at each footprint vertex. This works on flat terrain but breaks immediately on any slope.

**How to avoid:**
- For each building footprint vertex, sample the terrain DEM at that lat/lon and use the sampled elevation as the base of extrusion at that vertex.
- Alternatively, cut all buildings to the terrain surface using a boolean intersection, accepting that buildings on steep slopes may have irregular bases — which is geometrically correct and physically accurate.
- The base plate must extend below the lowest terrain point in the entire model, so even hillside buildings that sink to their real ground level are captured within the printable volume.

**Warning signs:**
- In the 3D preview, buildings on hills appear to float or partially disappear into the terrain.
- STL repair tools report intersecting geometry concentrated around buildings in hilly areas.

**Phase to address:** Building geometry phase, specifically the terrain-building integration step.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Simple mesh concatenation for building+terrain merge | Fast to implement, works for flat areas | Non-manifold geometry in any non-trivial terrain; full rewrite of merge pipeline required | Never — use CSG union from the start |
| Using Web Mercator coordinates directly for geometry | No coordinate conversion needed | Physically wrong print dimensions at latitudes above ~40°; requires full coordinate pipeline rewrite | Never |
| Skipping STL manifold validation before download | Simpler pipeline, faster export | Users get broken files; support burden; reputation damage | Never — add validation before v1 |
| Ignoring elevation voids in DEM data | No data-filling logic to write | Holes in terrain mesh, zero-elevation spikes, non-manifold terrain | Only if restricting to void-filled DEM sources (e.g., SRTM Void Filled from USGS) |
| Generating full-resolution mesh for preview | No separate LOD pipeline | Browser tab OOM crash for dense city areas; unresponsive UI during generation | Never for large areas — use preview-only LOD from the start |
| Running geometry generation on main thread | Simpler code | UI freezes during mesh generation; perceived as broken | Never for meshes above ~50k vertices |
| Writing STL in arbitrary coordinate units | Simplifies internal math | Silent scale errors that users only discover after printing | Never — define mm-canonical export on day 1 |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Overpass API (OSM data) | Querying large bounding boxes without timeout/size guards; the default 180s timeout kills large city queries | Set explicit `[timeout:60]` and `[maxsize:33554432]` (32MB) in query; paginate or tile large areas; warn user when area is too large |
| Overpass API | Hitting public instance rate limits when used from a web app with multiple concurrent users | Use a self-hosted Overpass instance, Geofabrik mirror, or switch to a pre-processed vector tile source (MapTiler, Protomaps) for production |
| SRTM/DEM data | Using the original SRTM non-void-filled dataset, which contains "no data" holes over water and shadow areas | Use SRTM Void Filled (available from USGS EROS), which patches holes using interpolation; flag remaining voids to the user |
| Terrain RGB tiles (Mapbox/Terrarium) | Treating the raw PNG pixel values as elevation directly without applying the decode formula (`height = -10000 + (R * 256 + G + B/256) * 0.1` for Mapbox) | Apply the provider-specific decode formula; validate decoded elevation range against expected values for the area |
| Terrain RGB tiles | Fetching tiles at the wrong zoom level for the selected area size; too-low zoom gives blocky 30m+ resolution; too-high zoom multiplies tile count exponentially | Compute the zoom level that gives approximately the target mesh resolution; cap tile fetches at a reasonable number (e.g., 16 tiles max) |
| STL file download | Serving large STL files (100MB+) synchronously on the server | Stream the response or generate client-side; for server generation, use a job queue with polling |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Generating full-resolution terrain mesh in-browser on main thread | UI freezes for 5–30 seconds; browser "page unresponsive" dialog | Move all mesh generation to a Web Worker; use Transferable ArrayBuffers to pass geometry back without copying | Any mesh above ~100k triangles |
| Keeping all geometry in Three.js scene simultaneously (terrain + buildings + roads + preview + export mesh) | Browser tab memory OOM with 4GB limit in Chrome; tab crash | Dispose unused geometries and materials explicitly; use a single merged geometry for export rather than keeping scene graph | Dense urban areas with 1000+ buildings |
| Loading all buildings for the entire bounding box at once from Overpass | Query times out for large cities; browser receives >50MB JSON | Tile the building query into a grid; fetch and process tiles progressively; show progress to user | Areas larger than ~2km × 2km in dense cities |
| Synchronous STL binary write for large meshes | Main thread blocks during serialization | Serialize in Web Worker; for very large meshes, stream the binary output using chunked write | Meshes above ~500k triangles |
| Generating preview mesh and export mesh with the same resolution | Dense city STL is 200MB+; preview lags at high vertex count | Generate a decimated preview mesh (target ~100k triangles) separately from the print-quality export mesh | Immediately on any real-world dense city area |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Accepting arbitrary bounding box sizes without server-side validation | Denial-of-service via massive Overpass queries; server OOM on pathological inputs | Enforce a maximum bounding box area (e.g., 25 km²) both client-side and server-side |
| Proxying Overpass API queries with user-supplied Overpass QL directly | Query injection allowing data exfiltration or API abuse | Construct Overpass queries server-side from validated lat/lon parameters; never pass raw user-supplied query strings |
| Caching terrain tile responses without proper attribution tracking | Violates Mapbox/Terrarium tile service terms of service | Honor tile service usage policies; cache with TTL; display required attributions in the UI |
| Serving generated STL files from a path predictable from user inputs | Enumeration of other users' generated files | Use cryptographically random IDs for generated file paths; expire files after download |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No progress indicator during geometry generation | User thinks the app is broken after clicking "Generate"; abandons the tool | Show deterministic progress steps: "Fetching elevation... Fetching buildings... Generating terrain mesh... Merging geometry... Preparing STL..." |
| Defaulting terrain exaggeration to 1× (no exaggeration) | Flat areas produce invisible terrain detail; user's first print looks like a blank tile; they blame the app | Default to auto-exaggeration that guarantees at least 2mm of relief variation; explain what exaggeration was applied |
| Allowing bounding box selection with no size feedback | User selects an area too large to process, or too small to be meaningful | Show the bounding box dimensions in km and the estimated print size in mm in real time as the user drags |
| Generating a non-printable STL without warning the user | User downloads, slices, and only discovers during slicer import that the file is invalid | Run manifold validation and minimum wall thickness check before presenting the download button; show a clear error with remediation advice if validation fails |
| No preview of what OSM data coverage looks like for the selected area | User selects an area with no buildings (no data), exports, and is confused by an empty model | Show a data coverage indicator or overlay the available OSM building footprints on the 2D map view before generation |
| Showing only a 3D preview without physical dimension annotations | User cannot tell if the model will fit their print bed or if features are too small to print | Display physical dimensions (mm) in the 3D preview overlay; show a warning if any feature is below the minimum wall thickness threshold |
| Making the bounding box non-adjustable after 3D preview | User realizes they want a slightly different area but must restart entirely | Support going back to the 2D map view and adjusting the bounding box without losing toggle settings |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **STL export:** Visually correct in preview — verify STL passes manifold validation with a tool like MeshLab or manifold-3d before shipping. Previews can render non-manifold meshes without errors.
- [ ] **Building heights:** Buildings appear in preview — verify the pipeline handles null/undefined height gracefully and test against a poorly-tagged OSM region (rural US, Southeast Asia).
- [ ] **Terrain mesh:** Terrain looks correct on screen — verify actual vertex coordinates are in millimeters, not meters, by checking exported STL bounds against expected physical dimensions.
- [ ] **Coordinate system:** Model looks proportional — verify dimensions at 60°N latitude by measuring the exported model's XY ratio; it should match the bounding box aspect ratio, not Mercator-distorted.
- [ ] **Flat terrain:** Works on hilly test areas — test against a genuinely flat area (coastal Netherlands, Florida Everglades) to verify minimum Z height is enforced and the model is printable.
- [ ] **Large city areas:** Works on small test area — test a 5km × 5km dense city bounding box (Manhattan, Tokyo) to verify performance, memory, and Overpass query handling.
- [ ] **Road mesh:** Roads appear on terrain — verify road geometry doesn't float above terrain surface and has enough thickness to be printable (minimum 0.5mm raised or 0.3mm recessed for FDM).
- [ ] **Base plate:** Included in 3D preview — verify the base plate and terrain are a single watertight solid in the STL, not two separate meshes placed together (two separate meshes may print incorrectly depending on slicer settings).
- [ ] **Scale units:** User sets 100mm width — verify the exported STL actually measures 100mm × equivalent height in the slicer, not 100 × (arbitrary unit).

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Non-manifold geometry from boolean merges | HIGH | Add server-side manifold repair (MeshLib Python bindings or Manifold WASM) as a post-processing step on every export; measure repair success rate; if >20% of exports need repair, redesign the merge pipeline |
| Projection mismatch discovered post-launch | HIGH | All geometry must be regenerated; requires a full coordinate pipeline rewrite; users get wrong-sized prints until fixed — prioritize over any feature work |
| STL unit error discovered post-launch | MEDIUM | Add a 1000× scale multiplier at the export step; existing downloads are invalid; communicate to users via changelog |
| Missing building heights causing flat output | LOW | Add fallback height estimation logic; re-test with sparsely-tagged regions; no architectural change required |
| Performance issues with large areas | MEDIUM | Add Web Workers for mesh generation; add area size cap with user warning; decimation for preview mesh |
| Overpass rate limiting in production | MEDIUM | Set up self-hosted Overpass instance (Docker) or switch to a pre-processed planet.osm extract via Geofabrik; costs ~$20–50/month for a reasonable server |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Non-manifold geometry from boolean merges | Foundation: mesh generation pipeline | Export a STL for a hilly area and run manifold-3d validation; assert 0 non-manifold edges |
| Projection mismatch (Mercator distortion) | Foundation: coordinate pipeline | Export STL for 45°N location; assert XY physical dimensions match bounding box aspect ratio within 1% |
| STL unit ambiguity | Foundation: STL export | Export STL; import in slicer or check binary header bounding box; assert width matches user-specified physical dimension |
| Flat terrain zero-thickness | Terrain generation phase | Select Netherlands bounding box; assert exported STL minimum Z height >= 2.5mm |
| Missing OSM building heights | Building geometry phase | Query OSM for a rural US area; assert all buildings render with a plausible height; no null reference errors |
| Buildings below/above terrain on slopes | Building-terrain integration phase | Select a hilly city (San Francisco, Lisbon); assert no floating or sunken buildings in STL; manifold check passes |
| Browser OOM on dense city areas | Performance phase | Load a 3km × 3km Manhattan bounding box; assert browser memory stays below 1.5GB; UI remains responsive |
| Overpass rate limiting | Infrastructure phase (before public launch) | Load test with 10 concurrent users generating models; assert no 429 errors |

---

## Sources

- [How to fix non-manifold geometry issues | Sculpteo](https://www.sculpteo.com/en/3d-learning-hub/create-3d-file/fix-non-manifold-geometry/)
- [Non-manifold meshes: What Is Non-Manifold Geometry | MeshLib](https://meshlib.io/blog/non-manifold-meshes/)
- [How to print maps, terrains and landscapes on a 3D printer | Prusa Blog](https://blog.prusa3d.com/how-to-print-maps-terrains-and-landscapes-on-a-3d-printer_29117/)
- [TouchTerrain GitHub repository and known limitations | ChHarding](https://github.com/ChHarding/TouchTerrain_for_CAGEO)
- [3D Printing Digital Elevation Models | OpenTopography](https://opentopography.org/learn/3D_printing)
- [3D printing of digital elevation models | EduTech Wiki](https://edutechwiki.unige.ch/en/3D_printing_of_digital_elevation_models)
- [Simple 3D Buildings limitations | OpenStreetMap Wiki](https://wiki.openstreetmap.org/wiki/Simple_3D_buildings)
- [Missing Building Height/Level informations | OSM Help](https://help.openstreetmap.org/questions/56351/missing-building-heightlevel-informations)
- [Estimation of missing building height in OpenStreetMap data | GMD](https://gmd.copernicus.org/articles/15/7505/)
- [Overpass API rate limiting | OpenStreetMap Wiki](https://wiki.openstreetmap.org/wiki/Overpass_API)
- [SRTM Void Filled | USGS EROS](https://www.usgs.gov/centers/eros/science/usgs-eros-archive-digital-elevation-shuttle-radar-topography-mission-srtm-void)
- [Web Mercator projection distortion | Wikipedia](https://en.wikipedia.org/wiki/Web_Mercator_projection)
- [STL file unit mismatch issues | FixMySTL](https://fixmystl.github.io/FixMySTL/)
- [Performing Boolean operations on STL files | Three.js Forum](https://discourse.threejs.org/t/performing-boolean-operations-on-stl-files/57610)
- [Three-bvh-csg: fast CSG operations | Three.js Forum](https://discourse.threejs.org/t/three-bvh-csg-a-library-for-performing-fast-csg-operations/42713)
- [Three.js vs WebGPU for large models | AlterSquare](https://altersquare.io/three-js-vs-webgpu-construction-3d-viewers-scale-beyond-500mb/)
- [Building Efficient Three.js Scenes | Codrops](https://tympanus.net/codrops/2025/02/11/building-efficient-three-js-scenes-optimize-performance-while-maintaining-quality/)
- [Web Workers for non-blocking UI | MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)
- [Floating point precision for geographic coordinates | Aapeli Vuorinen](https://www.aapelivuorinen.com/blog/2023/06/30/floats-for-coordinates/)
- [Minimum wall thickness for 3D printing | Formlabs](https://formlabs.com/eu/blog/minimum-wall-thickness-3d-printing/)

---
*Pitfalls research for: Map-to-3D-printable-STL web application (MapMaker)*
*Researched: 2026-02-23*
