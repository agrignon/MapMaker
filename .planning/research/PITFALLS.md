# Pitfalls Research

**Domain:** Map-to-3D-printable-STL web application
**Researched:** 2026-02-23 (updated 2026-02-24 for roads, water, vegetation, smoothing, Web Workers)
**Confidence:** MEDIUM (multiple credible sources, verified across official docs and community discussions; some claims are training-data-supported with search verification)

---

## Critical Pitfalls

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

## Critical Pitfalls (Phase 4+: Roads, Water, Vegetation, Smoothing, Workers)

These pitfalls are specific to adding the next set of features to the existing terrain+buildings pipeline.

---

### Pitfall 7: Road Intersections Produce Overlapping Triangle Geometry

**What goes wrong:**
OSM roads are represented as centerline LineStrings. To produce 3D geometry, each road segment must be expanded into a ribbon of the appropriate width. The naive approach — offset each way segment independently along its normal and cap both ends — produces overlapping triangles wherever two or more road segments share a node (every intersection, every curve, every junction). The overlapping triangles create non-manifold geometry in the exact topology pattern that breaks slicers: interior faces separating regions that should be continuous solid.

**Why it happens:**
Independent segment expansion is the obvious first implementation: for each way, buffer left and right by half the road width, produce a quad strip, done. The problem only manifests at junction nodes where multiple ways meet. Developers testing on simple rural roads (two ways joining at a single point) miss the problem; it emerges when testing on a city grid with dozens of ways per node.

**How to avoid:**
- Do not use raw boolean union to merge overlapping road segments — the triangle count makes this prohibitively slow for dense cities.
- Instead, compute proper intersection polygons at junction nodes: at each node shared by N road ways, compute the convex hull or mitred polygon of all incoming road widths, then join each road segment's ribbon to the junction polygon without overlap.
- For a simpler approach that avoids intersection geometry entirely, treat roads as raised (or recessed) displacement applied directly to the terrain mesh: sample which terrain vertices fall within the road width and offset their Z value. This eliminates the polygon-overlap problem because roads share the terrain vertex grid rather than adding independent geometry on top.
- For STL export, if overlapping road ribbons are kept in the scene for visual preview, always re-derive the export geometry from the displacement approach, not the visual ribbon approach.

**Warning signs:**
- STL validator reports hundreds of intersecting triangles concentrated along road corridors.
- Slicer preview shows "tunnels" or voids running along road paths — these are the interior faces from overlapping segments.
- Manifold check fails specifically at node coordinates (intersections).

**Phase to address:** Roads phase — establish the intersection-merging strategy before building any road type-specific width logic.

---

### Pitfall 8: Bridges and Tunnels Render at Ground Level

**What goes wrong:**
OSM roads tagged `bridge=yes` (layer=1 or higher) run above other geometry. Roads tagged `tunnel=yes` (layer=-1 or lower) run underground. A naive implementation ignores the `layer` and `tunnel` tags entirely, rendering all road ways at terrain surface elevation regardless of their real-world position. The result: bridges appear to dive into the terrain mesh, and tunnels appear as surface roads. For STL output this creates intersecting geometry between the bridge road and the terrain directly below it.

**Why it happens:**
The `layer` and `tunnel` tags are easy to overlook when querying Overpass — the query returns them but they require additional conditional logic to handle. Developers building the road pipeline for the common case (surface roads) often defer bridge/tunnel handling as an edge case that becomes a correctness problem in any city with an elevated highway or underground rail.

**How to avoid:**
- Filter tunnel roads entirely from the 3D output. Tunnels are underground; they serve no useful visual or printable purpose in a surface terrain model. Add `[tunnel!~"yes"]` to the Overpass query or filter in post-processing.
- For bridge roads, apply an elevation offset: read the `layer` tag value (default 0) and raise the road geometry by `layer * bridge_clearance_mm` above the terrain surface. A clearance of 3–5mm in print space is usually sufficient to convey the bridge visually.
- Document this behavior in the UI: "Bridges are shown raised above terrain. Tunnels are omitted."

**Warning signs:**
- Roads that should be elevated (freeway overpasses, viaducts) appear to cut through hills in the 3D preview.
- Underground metro lines appear as surface roads on top of city streets.
- The Overpass query result contains ways with `tunnel=yes` that are being rendered.

**Phase to address:** Roads phase — add tunnel filtering and bridge layer offset as explicit acceptance criteria, not afterthoughts.

---

### Pitfall 9: Road Widths Too Narrow to Print (Sub-Millimeter Features)

**What goes wrong:**
OSM `highway=footway`, `highway=path`, `highway=cycleway`, and even `highway=residential` roads, when converted to physical print dimensions, may produce road features narrower than 0.4mm — the minimum feature size for a standard FDM nozzle. These features appear in the 3D preview (which renders at arbitrary resolution) but are silently removed or collapsed by the slicer, resulting in a print with missing road networks.

**Why it happens:**
Road widths in real life: motorways are 10–14m wide, footways are 1–2m wide. On a 100mm × 100mm print representing a 1km × 1km area, scale is 0.1mm per real-world meter. A 2m-wide footway becomes 0.2mm — below the minimum printable width. Developers set road widths based on visual appeal in the 3D preview (where sub-millimeter features render fine) and never validate against physical print constraints.

**How to avoid:**
- Define a minimum road width in print-space millimeters (0.8mm is safe for a 0.4mm nozzle, representing 2 nozzle diameters).
- Apply the minimum as a floor: `printWidthMM = Math.max(0.8, realWorldWidthM * scaleMMperM)`.
- Differentiate road categories: skip or omit footways, paths, and cycleways if they would render below 0.6mm — cluttering the model with sub-threshold features adds triangle count without adding printable geometry.
- Display a UI warning: "At this scale, minor roads and paths are below minimum print width and have been omitted."

**Warning signs:**
- The slicer shows fewer road features than the 3D preview.
- Thin road lines appear in the Three.js preview but vanish in Bambu Studio/PrusaSlicer.
- STL triangle inspection shows degenerate (zero-area) triangles from collapsed road ribbons.

**Phase to address:** Roads phase — enforce minimum width at the geometry generation step, not at render time.

---

### Pitfall 10: OSM Water Bodies Use Multipolygon Relations That Break Simple Parsing

**What goes wrong:**
Large OSM water bodies (lakes with islands, river systems, coastal areas) are encoded as multipolygon relations, not simple closed ways. A multipolygon relation has one or more `outer` ring members and zero or more `inner` ring members (holes). The Overpass query `natural=water` returns both simple closed ways AND multipolygon relations. Treating all results as simple polygons silently drops the inner ring data, producing water geometry with no holes — islands become submerged. More critically, the outer ring ways of a multipolygon relation are often split across multiple way members that must be assembled in order, which requires implementing a ring assembly algorithm.

**Why it happens:**
The OSM multipolygon relation model is documented but not obvious. The Overpass `out geom` format returns geometry for each member way individually, not as a pre-assembled polygon. Developers consuming the `elements` array and treating each element's `geometry` directly as a polygon ring miss the relation assembly step entirely. The bug is invisible in areas where water bodies happen to be simple closed ways (small ponds, simple rectangles) and only surfaces with complex or large water features.

**How to avoid:**
- Use `out geom` and process relation members explicitly: collect outer ways, assemble rings by connecting shared endpoints, then collect inner ways and assemble hole rings.
- Use a battle-tested library for polygon ring assembly. The `osmtogeojson` npm library handles multipolygon assembly correctly and outputs standard GeoJSON, which is far easier to triangulate than raw OSM elements.
- After assembly, triangulate the resulting polygon-with-holes using an ear-clipping or constrained Delaunay library (earcut is the standard for browser use and handles holes via index concatenation).
- Test against a known lake-with-islands (e.g., Lake of the Ozarks, Lake Leman) before declaring water bodies complete.

**Warning signs:**
- Lakes that should contain islands show solid water surfaces with no holes.
- The Overpass response contains `type: "relation"` elements with multiple way members — these must be assembled.
- The assembled polygon self-intersects or produces negative area, indicating incorrect ring ordering.

**Phase to address:** Water phase — multipolygon assembly is the foundational requirement before any water geometry rendering.

---

### Pitfall 11: Coastline Geometry Is Not in Overpass — It Is Pre-Processed Separately

**What goes wrong:**
OSM coastlines (`natural=coastline`) are not usable raw from Overpass. The Overpass API returns individual coastline way segments that are part of ways spanning thousands of kilometers. No single Overpass query returns a usable closed polygon for the sea or ocean. A developer who queries `natural=coastline` within a bounding box receives disconnected way fragments that cannot be directly triangulated into a water polygon covering the ocean portion of the model.

**Why it happens:**
The OSM coastline is processed by a dedicated tool (OSMCoastline) and distributed as pre-built land/water polygon shapefiles by Geofabrik and osmdata.openstreetmap.de. This is a known limitation documented in the OSM wiki but easy to miss when the Overpass-for-everything approach is working for other feature types.

**How to avoid:**
- Do not attempt to render ocean from raw Overpass coastline data. Use a pre-processed source.
- For coastal models, use the water-polygons shapefile from osmdata.openstreetmap.de, clipped to the bounding box. This provides ready-to-use closed polygons for ocean areas.
- Alternatively, skip ocean rendering and note it as out-of-scope for v1: the terrain DEM already encodes elevation 0 for water, which produces a visible low-elevation band in the terrain mesh.
- If ocean geometry is required, use a raster approach: sample the DEM at each terrain vertex — vertices with elevation <= 0 are water. Apply water displacement directly to the terrain mesh rather than adding a separate polygon layer.

**Warning signs:**
- Overpass query for `natural=coastline` returns ways but no closed polygons or multipolygon relations.
- The assembled coastline ring does not close — it has open ends at the bounding box boundary.
- Ocean areas appear as raised terrain rather than flat water in the 3D preview.

**Phase to address:** Water phase — establish ocean handling strategy (omit, raster-sample, or pre-processed shapefile) before building coastline geometry.

---

### Pitfall 12: Vegetation Coverage Is Wildly Inconsistent — Empty Results Break the Layer

**What goes wrong:**
OSM vegetation data (`landuse=forest`, `natural=wood`, `leisure=park`, `landuse=grass`) has extremely uneven global coverage. In well-mapped European cities, vegetation polygons cover most parks and green spaces. In many other regions, the same areas show zero OSM vegetation features — not because there are no parks, but because they have not been mapped. A vegetation layer that works beautifully in London or Berlin silently produces no geometry for the same layer in a medium-sized US city or most cities in the developing world. Users see the layer toggle but get nothing, and assume the feature is broken.

**Why it happens:**
Vegetation is one of the lowest-priority mapping targets in OSM — it requires local knowledge and dedicated effort. Developers test against well-mapped cities during development, creating an incorrect baseline assumption.

**How to avoid:**
- Treat empty vegetation results as a valid state, not an error. The UI must clearly distinguish "no parks in OSM data for this area" from "vegetation layer is off."
- Add a data coverage indicator: after fetching, show the count of vegetation features found. Zero features should show a notification: "No vegetation data found in OSM for this area. This feature depends on local mapping coverage."
- Do not make the vegetation layer part of the STL export validation criteria — empty vegetation should not block export.
- Consider a fallback: if OSM vegetation is empty, offer to use terrain elevation coloring to indicate green areas (already implemented via hypsometric tints) as a visual substitute.

**Warning signs:**
- Vegetation Overpass query returns `{ elements: [] }` for real-world cities.
- The layer toggle shows "on" but no geometry appears in the 3D preview.
- Users from non-European regions report the vegetation layer never works.

**Phase to address:** Vegetation phase — implement empty-result handling and coverage feedback before any vegetation geometry rendering.

---

### Pitfall 13: Mesh Smoothing Collapses Boundary Features (Roads, Building Bases, Water Edges)

**What goes wrong:**
Laplacian smoothing moves each vertex toward the average position of its neighbors. Applied uniformly to a terrain mesh that already has buildings placed, roads displaced, and water depressions carved into it, the smoothing pass moves boundary vertices — building footprint perimeter vertices, road edge vertices, water edge vertices — toward their terrain neighbors. After 3–5 smoothing iterations, building bases develop "skirts" where the terrain creeps up into the building footprint, water edges become soft ramps instead of crisp depressions, and road surfaces blend back into surrounding terrain.

Additionally, uniform Laplacian smoothing causes mesh shrinkage — the mesh contracts toward its barycenter with each iteration, causing the terrain to shrink away from the base plate, creating a gap at the perimeter.

**Why it happens:**
Smoothing is typically applied post-hoc to the generated terrain mesh. The smoothing pass has no knowledge of which vertices are "feature constrained" (building perimeter, road edge) versus "free terrain" (open hillside). Standard implementations treat all vertices identically. The shrinkage effect is a known mathematical property of uniform Laplacian smoothing, documented in the signal processing literature.

**How to avoid:**
- Apply smoothing to the raw DEM elevation grid BEFORE generating road, water, or building features. Smooth the elevation array, then generate all features on the smoothed terrain. This prevents feature destruction entirely.
- If post-mesh smoothing is required, use constrained smoothing: mark boundary vertices (all vertices that define building footprint edges, road edges, water edges, and model perimeter) as fixed, and only relax unconstrained interior vertices.
- Use Taubin smoothing (lambda-mu variant) instead of pure Laplacian: the two-pass approach with alternating positive and negative lambdas prevents mesh shrinkage while still removing high-frequency noise.
- Cap the number of smoothing iterations at 3–5 for the UI slider range. Each additional iteration beyond 5 produces diminishing returns and increasing shrinkage risk.

**Warning signs:**
- Building bases show a "moat" effect — terrain dips just outside building perimeter after smoothing.
- Road surfaces become indistinguishable from surrounding terrain after applying the slider.
- The model perimeter shrinks slightly inward, creating a visible gap between terrain and side walls.
- STL manifold check fails after smoothing that was passing before.

**Phase to address:** Terrain smoothing phase — implement pre-feature smoothing OR constrained post-smoothing; never apply unconstrained Laplacian to a fully-featured mesh.

---

### Pitfall 14: Web Worker Communication Overhead Negates the Performance Benefit

**What goes wrong:**
Web Workers avoid blocking the main thread, but geometry data must cross the thread boundary via `postMessage`. The naive approach — passing the full vertex arrays as Transferable ArrayBuffers — works correctly for a single large buffer. However, if the geometry is represented as many small objects (one ArrayBuffer per building, per road segment), the `postMessage` call must enumerate all transferables in the second argument. Chrome and Edge exhibit exponential performance degradation when the transferable list contains thousands of individual ArrayBuffers: benchmarks show a 44x slowdown compared to structured clone when passing 200,000 small buffers. The Worker appears to freeze the UI for several seconds despite running off the main thread — worse than no Worker at all.

**Why it happens:**
Developers discover that individual geometry objects must be transferred as Transferables to avoid memory doubling, and then naively pass every geometry buffer (one per feature) in the transferable list. The performance issue only manifests when the feature count is high (dense city with hundreds of buildings and road segments), which is exactly the case where Worker offloading is most needed.

**How to avoid:**
- Merge all geometry into a single large geometry in the Worker before transferring. Produce one merged position ArrayBuffer, one index ArrayBuffer, and one normals ArrayBuffer for the complete model. Transfer three large buffers instead of thousands of small ones.
- Alternatively, use `SharedArrayBuffer` + `Atomics` for geometry that must be updated incrementally, avoiding postMessage entirely after the initial allocation. Note: SharedArrayBuffer requires COOP/COEP headers to be set on the server.
- Never pass the Three.js `BufferGeometry` object itself via postMessage — it is not transferable. Serialize the raw typed arrays (Float32Array, Uint32Array) and reconstruct the BufferGeometry on the main thread.
- Benchmark: time the postMessage call separately from computation time. If postMessage time > computation time, consolidate the transfer.

**Warning signs:**
- The UI freezes for a second or more after Worker computation completes (postMessage is the bottleneck, not computation).
- Chrome DevTools shows a long "Serialize" task on the main thread when the Worker posts its result.
- Memory usage doubles briefly during the transfer (indicating structured clone rather than transfer).

**Phase to address:** Web Worker phase — establish merged-geometry transfer protocol as the architectural baseline before implementing any per-feature geometry Worker.

---

### Pitfall 15: Vite Worker Module Bundling Breaks in Production Build

**What goes wrong:**
Vite supports Web Workers with the `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })` syntax. In development mode (Vite dev server), this works. In production build mode, Workers that dynamically import modules also imported by the main thread cause build failures or incorrect chunk splitting. Specifically: if the geometry generation code is imported by both the main thread and the Worker, Vite may produce a chunk that is not accessible at the Worker's expected URL, resulting in a `SyntaxError: Cannot use import statement` at Worker startup in production.

**Why it happens:**
Vite's Worker handling is documented but has known edge cases: the Worker detection only works when `new URL()` is used directly inside `new Worker()` with static string arguments. Dynamic imports inside classic Workers (not module Workers) cause a dev-only syntax error. Shared chunks between the main thread and Worker have historically caused production-only failures that are invisible in `vite dev`.

**How to avoid:**
- Use Vite's recommended Worker syntax exactly: `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`.
- Set `worker: { format: 'es' }` in `vite.config.ts`.
- Keep Worker entry points self-contained: avoid importing large shared utilities into the Worker that are also imported by the main thread. Prefer copying small utility functions into the Worker file, or extracting them into a dedicated `shared/` module with no side effects.
- Add a production build + Worker functional test to CI: spin up the built app, trigger geometry generation, verify the Worker completes without errors. Vite dev success does not guarantee production correctness.

**Warning signs:**
- `vite build` succeeds but the app throws `SyntaxError` in the browser console on first geometry generation.
- Chrome DevTools shows a failed Worker fetch in the Network panel (404 or MIME type error).
- The app works on `vite dev` but not on the built artifact served from a static host.

**Phase to address:** Web Worker phase — validate production build Worker behavior as an explicit test case, not an assumption.

---

### Pitfall 16: Layer Z-Fighting Between Roads, Water, and Terrain

**What goes wrong:**
When roads, water depressions, and terrain geometry occupy nearly the same Z position, the GPU depth buffer cannot determine which surface to render in front. The result is "Z-fighting": flickering, shimmering artifacts where the surfaces alternate visibility depending on camera angle and floating-point precision. For the 3D preview, this is a visual annoyance. For the STL export mesh, coplanar surfaces at the same Z produce non-manifold geometry: two faces occupying the same plane create an ambiguous interior/exterior boundary that slicers cannot process.

**Why it happens:**
Roads raised by a small epsilon (e.g., 0.1mm above terrain) and water recessed by a small epsilon (e.g., 0.1mm below terrain) interact with the Martini terrain mesh, which uses adaptive triangulation. At the road and water polygon boundaries, terrain vertices may be at almost the same Z as the feature vertices, producing near-zero depth differences below the float32 precision threshold.

**How to avoid:**
- Establish explicit Z-offset rules for each layer type and enforce them unconditionally:
  - Terrain: Z = elevation value (baseline)
  - Water: Z = terrain elevation − 0.5mm minimum (never coplanar with terrain)
  - Roads (raised): Z = terrain elevation + 0.8mm minimum
  - Roads (recessed): Z = terrain elevation − 0.3mm minimum
  - Building bases: start at terrain Z − 0.1mm (slightly below surface to close the seam)
- For the Three.js preview, use `polygonOffset` material properties to push road and water surfaces away from terrain: `material.polygonOffset = true; material.polygonOffsetFactor = -1;`
- For the STL export, do not rely on polygonOffset — use explicit vertex offset values in the geometry generation code.

**Warning signs:**
- In the 3D preview, roads or water surfaces flicker when the camera moves.
- Rotating the preview slightly changes which layer appears on top.
- STL validator reports coplanar faces or zero-area triangles at road/water boundaries.

**Phase to address:** Layer management phase — establish Z-offset conventions in the first road or water phase before adding any subsequent layer.

---

### Pitfall 17: CSG Cost Grows With Each Additional Layer (Quadratic Blowup)

**What goes wrong:**
The existing pipeline uses three-bvh-csg for building-terrain union operations. As roads and water depressions are added, each new layer potentially requires a CSG operation with the terrain mesh. CSG time scales with the product of triangle counts in both operands (approximately O(n × m) where n is terrain triangles and m is the incoming feature triangles). A terrain mesh with 50,000 triangles combined with a dense road network of 20,000 triangles produces a CSG problem with 1 billion potential intersections — multiple seconds per operation in JavaScript.

**Why it happens:**
Each layer is added incrementally, and the first few CSG operations seem fast. The performance cliff only appears when the total number of active feature layers is high (buildings + roads + water + vegetation), each requiring its own CSG pass against the evolving terrain mesh.

**How to avoid:**
- Avoid per-layer CSG against the terrain wherever possible. Instead, apply features as direct vertex displacement to the terrain mesh:
  - Roads: adjust terrain vertex Z values along road paths (no CSG required).
  - Water: lower terrain vertex Z values within water polygon bounds (no CSG required).
  - Vegetation: if represented as geometry primitives above terrain, keep them separate from the terrain CSG entirely.
- Reserve CSG operations for cases where geometry truly must merge: building footprints cutting into the terrain is the canonical example. Roads and water rarely need full CSG — displacement is geometrically equivalent for a terrain model.
- If CSG is unavoidable for a layer, batch all features of that type into a single merged geometry and perform one CSG operation against the terrain, not one per feature.

**Warning signs:**
- Generation time increases from 2 seconds to 20+ seconds when roads and water are both enabled.
- The browser "page unresponsive" dialog appears during multi-layer model generation.
- Profiling shows `three-bvh-csg` operations consuming >80% of total generation time.

**Phase to address:** Roads phase and Water phase — establish displacement-first approach before any CSG operations are added for these feature types.

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
| Treating all Overpass results as simple polygons | No relation assembly code to write | Lakes with islands rendered as solid water; coastlines break entirely | Never for water features; acceptable for buildings in MVP |
| Applying Laplacian smoothing uniformly to full-featured mesh | Easy to implement | Building bases erode, road surfaces blend into terrain, mesh shrinks | Never — smooth the DEM grid before features, or use constrained smoothing |
| Separate postMessage per geometry buffer in Web Worker | Natural object-per-feature structure | 44x performance regression in Chrome with hundreds of features | Never for feature counts > 50; merge geometry before transfer |
| Per-road-segment CSG against terrain | Conceptually clean | Exponential time growth; 20s generation for dense cities | Never — use vertex displacement for roads and water |
| Road widths set for visual appeal only | Looks good in Three.js preview | Sub-threshold features silently removed by slicer; users get incomplete prints | Never — enforce minimum print-width floor in geometry generation |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Overpass API (OSM data) | Querying large bounding boxes without timeout/size guards; the default 180s timeout kills large city queries | Set explicit `[timeout:60]` and `[maxsize:33554432]` (32MB) in query; paginate or tile large areas; warn user when area is too large |
| Overpass API | Hitting public instance rate limits when used from a web app with multiple concurrent users | Use a self-hosted Overpass instance, Geofabrik mirror, or switch to a pre-processed vector tile source (MapTiler, Protomaps) for production |
| Overpass API (multi-layer) | Sending separate queries for buildings, roads, water, vegetation — 4x API calls per model generation | Combine all feature types in a single Overpass union query; reduces latency and rate-limit exposure |
| Overpass API (vegetation) | Assuming empty result means error; crashing on `elements: []` | Always handle empty results gracefully; show coverage indicator; continue generation without vegetation |
| Overpass API (water relations) | Treating multipolygon relation member ways as standalone polygons | Use `osmtogeojson` to assemble relations before triangulation; never skip relation processing for water |
| SRTM/DEM data | Using the original SRTM non-void-filled dataset, which contains "no data" holes over water and shadow areas | Use SRTM Void Filled (available from USGS EROS), which patches holes using interpolation; flag remaining voids to the user |
| Terrain RGB tiles (Mapbox/Terrarium) | Treating the raw PNG pixel values as elevation directly without applying the decode formula | Apply the provider-specific decode formula; validate decoded elevation range against expected values for the area |
| Terrain RGB tiles | Fetching tiles at the wrong zoom level for the selected area size; too-low zoom gives blocky 30m+ resolution | Compute the zoom level that gives approximately the target mesh resolution; cap tile fetches at a reasonable number (e.g., 16 tiles max) |
| Vite Web Worker (production) | Testing Worker behavior only in `vite dev` | Always run `vite build` and verify Worker function in the built artifact before declaring done |
| osmdata.openstreetmap.de water polygons | Fetching entire planet water polygon shapefile for coastlines | Clip to bounding box server-side; the full shapefile is gigabytes; only use for models that include coastal ocean areas |

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
| Per-segment road CSG against terrain | Generation time grows from 3s to 30s+ with each road segment added | Use vertex displacement for roads, not CSG; reserve CSG for building-terrain only | Any model with more than ~20 road segments in CSG mode |
| Passing many small ArrayBuffers as Transferable in postMessage | UI freeze of 5–10s after Worker completes despite Worker running off-thread | Merge all geometry into 3 large typed arrays before transfer; never pass one ArrayBuffer per feature | Feature count > 100 (buildings + roads + vegetation) |
| Running all Overpass queries sequentially (one per layer) | Total fetch time = sum of all query times; 4–8 second wait before generation starts | Combine all layers in one Overpass union query; or fetch in parallel with Promise.all | Always — combine from the start |

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
| Vegetation layer toggle visible in areas with zero OSM coverage | User toggles vegetation on and off expecting to see parks, finds no change, assumes the feature is broken | Show coverage count next to layer toggle: "Vegetation (0 features found in this area)" |
| Smoothing slider changes not reflected instantly in 3D preview | User adjusts slider but cannot see the effect; does not know if smoothing is working | Apply smoothing asynchronously and update the preview incrementally; a brief spinner on the 3D preview is acceptable; total blackout is not |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **STL export:** Visually correct in preview — verify STL passes manifold validation with a tool like MeshLab or manifold-3d before shipping. Previews can render non-manifold meshes without errors.
- [ ] **Building heights:** Buildings appear in preview — verify the pipeline handles null/undefined height gracefully and test against a poorly-tagged OSM region (rural US, Southeast Asia).
- [ ] **Terrain mesh:** Terrain looks correct on screen — verify actual vertex coordinates are in millimeters, not meters, by checking exported STL bounds against expected physical dimensions.
- [ ] **Coordinate system:** Model looks proportional — verify dimensions at 60°N latitude by measuring the exported model's XY ratio; it should match the bounding box aspect ratio, not Mercator-distorted.
- [ ] **Flat terrain:** Works on hilly test areas — test against a genuinely flat area (coastal Netherlands, Florida Everglades) to verify minimum Z height is enforced and the model is printable.
- [ ] **Large city areas:** Works on small test area — test a 5km × 5km dense city bounding box (Manhattan, Tokyo) to verify performance, memory, and Overpass query handling.
- [ ] **Road mesh:** Roads appear on terrain — verify road geometry doesn't float above terrain surface and has enough thickness to be printable (minimum 0.8mm raised or 0.5mm recessed for FDM).
- [ ] **Road intersections:** Roads look connected visually — verify STL manifold check passes at intersection nodes; overlapping road ribbons produce non-manifold geometry that looks fine in preview.
- [ ] **Bridge/tunnel:** Roads appear — verify that `tunnel=yes` ways are excluded and `bridge=yes` ways are raised above terrain with `layer` tag applied.
- [ ] **Road width:** Roads visible in preview — verify minimum width floor is applied; test that a footway at 100mm/1km scale is still at least 0.8mm wide in STL coordinates.
- [ ] **Water bodies:** Lakes appear — verify multipolygon relations are correctly assembled (islands appear as holes); test against a lake with an island.
- [ ] **Coastline:** Ocean looks handled — verify the pipeline does not attempt to parse raw Overpass coastline ways as closed polygons; document the strategy used (omit/DEM-sample/shapefile).
- [ ] **Vegetation:** Layer appears in well-mapped city — verify the layer degrades gracefully (no crash, informative message) when Overpass returns zero vegetation features.
- [ ] **Smoothing:** Slider changes terrain — verify building bases and road surfaces are not eroded by smoothing; test with 5 iterations at maximum slider value.
- [ ] **Web Worker:** UI stays responsive during generation — verify main thread frame rate stays above 30fps during Worker computation using Chrome DevTools Performance tab.
- [ ] **Worker production build:** Works in dev — verify Worker initializes and completes successfully in `vite build` output served from a static server, not just `vite dev`.
- [ ] **Base plate:** Included in 3D preview — verify the base plate and terrain are a single watertight solid in the STL, not two separate meshes placed together.
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
| Road intersection non-manifold discovered post-roads phase | HIGH | Requires redesigning road geometry generation from ribbon-based to displacement-based; all road rendering code must be rewritten |
| Water multipolygon parsing missing islands | MEDIUM | Add osmtogeojson or equivalent library; re-test all water body types; no architectural change to other layers required |
| Smoothing eroding features discovered post-smoothing phase | MEDIUM | Switch from post-mesh smoothing to pre-feature DEM smoothing; may require re-ordering the generation pipeline and invalidating cached terrain results |
| Worker production build failure | LOW | Add `worker: { format: 'es' }` to Vite config; restructure Worker imports to avoid shared chunk conflicts; validate with `vite build` after each Worker change |

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
| Road intersection overlapping triangles | Roads phase — intersection geometry strategy | Export a city grid STL; manifold-3d reports 0 non-manifold edges at road intersections |
| Bridge/tunnel rendering at ground level | Roads phase — layer tag processing | Model with known bridge (Tower Bridge, Golden Gate); assert bridge geometry is elevated; tunnel=yes ways absent from STL |
| Sub-millimeter road width | Roads phase — width enforcement | Export 100mm model at 1km scale; assert all road geometry >= 0.8mm width in STL; footways absent or at floor width |
| Water multipolygon missing islands | Water phase — relation assembly | Model Lake Geneva (has known islands); assert island outlines appear as holes in water geometry |
| Coastline not available from Overpass | Water phase — coastline strategy | Model a coastal area (San Francisco Bay); assert ocean strategy is documented and tested |
| Vegetation empty results crash | Vegetation phase — empty-result handling | Query vegetation for a sparsely-mapped area; assert layer toggle works without error; coverage message displayed |
| Mesh smoothing erodes features | Smoothing phase — constrained smoothing | Apply maximum smoothing slider; assert building base perimeter vertices are within 0.1mm of pre-smooth positions |
| Worker postMessage overhead | Web Worker phase — geometry consolidation | Profile postMessage time with 500-building model; assert transfer time < 200ms |
| Vite Worker production build failure | Web Worker phase — build validation | Run `vite build`; serve output; trigger generation; assert Worker completes without SyntaxError in browser console |
| Layer Z-fighting | Layer management phase | Enable terrain + roads + water simultaneously; rotate 3D preview; assert no flickering surfaces |
| CSG performance blowup | Roads/Water phase — displacement-first architecture | Generate model with terrain + roads + water + buildings; assert total generation time < 10s for a 1km × 1km area |

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
- [Transferable objects | MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects)
- [Floating point precision for geographic coordinates | Aapeli Vuorinen](https://www.aapelivuorinen.com/blog/2023/06/30/floats-for-coordinates/)
- [Minimum wall thickness for 3D printing | Formlabs](https://formlabs.com/eu/blog/minimum-wall-thickness-3d-printing/)
- [3D printing OSM data | OpenStreetMap Wiki](https://wiki.openstreetmap.org/wiki/3D_printing_OSM_data)
- [Key:bridge | OpenStreetMap Wiki](https://wiki.openstreetmap.org/wiki/Key:bridge)
- [Key:tunnel | OpenStreetMap Wiki](https://wiki.openstreetmap.org/wiki/Key:tunnel)
- [Key:layer | OpenStreetMap Wiki](https://wiki.openstreetmap.org/wiki/Key:layer)
- [Relation:multipolygon | OpenStreetMap Wiki](https://wiki.openstreetmap.org/wiki/Relation:multipolygon)
- [Relation:multipolygon/Algorithm | OpenStreetMap Wiki](https://wiki.openstreetmap.org/wiki/Relation:multipolygon/Algorithm)
- [Water polygons | osmdata.openstreetmap.de](https://osmdata.openstreetmap.de/data/water-polygons.html)
- [Coastline | OpenStreetMap Wiki](https://wiki.openstreetmap.org/wiki/Coastline)
- [OSM Coastlines | Jochen Topf](https://blog.jochentopf.com/2012-03-07-osm-coastlines.html)
- [Landcover coverage accuracy | ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0143622822001138)
- [Landuse=forest | OpenStreetMap Wiki](https://wiki.openstreetmap.org/wiki/Tag:landuse=forest)
- [Laplacian mesh smoothing overview | ScienceDirect Topics](https://www.sciencedirect.com/topics/computer-science/laplacian-smoothing)
- [Laplacian smoothing with bilateral weights 2025 | Taylor & Francis](https://www.tandfonline.com/doi/full/10.1080/21642583.2025.2568665)
- [Performance issue of massive transferable objects in Web Worker | joji.me](https://joji.me/en-us/blog/performance-issue-of-using-massive-transferable-objects-in-web-worker/)
- [Trouble reconstructing geometry from web worker | Three.js Forum](https://discourse.threejs.org/t/trouble-reconstructing-geometry-from-web-worker/21423)
- [CSG performance too slow | Three.js Forum](https://discourse.threejs.org/t/performance-problem-with-csg-too-slow/52441)
- [Z-fighting polygonOffset issue | Three.js GitHub](https://github.com/mrdoob/three.js/issues/2593)
- [Vite Web Worker features | Vite docs](https://vite.dev/guide/features)
- [Vite Worker module build issue #10057 | GitHub](https://github.com/vitejs/vite/issues/10057)
- [OSM-Based Road Network Geometry | KTH Diva Portal](https://kth.diva-portal.org/smash/get/diva2:1375175/FULLTEXT01.pdf)
- [Building road geometry from centerlines | OSM Community Forum](https://forum.openstreetmap.org/viewtopic.php?id=16262)
- [Terrain_Trails: 3D printable terrain with roads | GitHub](https://github.com/jkoether/Terrain_Trails)
- [Faster WebGL with OffscreenCanvas and Web Workers | Evil Martians](https://evilmartians.com/chronicles/faster-webgl-three-js-3d-graphics-with-offscreencanvas-and-web-workers)
- [three-bvh-csg GitHub repository | gkjohnson](https://github.com/gkjohnson/three-bvh-csg)

---
*Pitfalls research for: Map-to-3D-printable-STL web application (MapMaker)*
*Researched: 2026-02-23 (updated 2026-02-24)*
