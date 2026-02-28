# Roadmap: MapMaker

## Overview

MapMaker is built in nine phases that follow the dependency graph of the output pipeline. Phase 1 establishes correct geographic foundations (map, bbox, coordinate projection) because every downstream feature produces wrong-scale geometry if this is wrong. Phase 2 delivers the terrain-only end-to-end pipeline — elevation data in, printable STL out — which validates the full output contract before buildings or roads are added. Phase 3 layers in OSM buildings on top of the proven terrain pipeline. Phases 4 through 9 complete the v1 feature set: Phase 4 extends the Zustand store with all new state fields and wires up layer controls so every subsequent feature can be immediately toggled; Phase 5 adds roads as 3D geometry with configurable style; Phase 6 bakes water bodies as depressions into the terrain elevation grid; Phase 7 adds vegetation geometry and the terrain smoothing slider; Phase 8 closes the edit-iterate UX loop and polishes export filenames; Phase 9 offloads mesh generation to a Web Worker and ships a production build that compiles clean.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Map, location search, bounding box, and correct coordinate projection pipeline (completed 2026-02-24)
- [x] **Phase 2: Terrain + Preview + Export** - Terrain-only end-to-end pipeline: elevation data to 3D preview to STL download (completed 2026-02-24)
- [x] **Phase 3: Buildings** - OSM buildings with real heights extruded correctly onto terrain (completed 2026-02-25)
- [x] **Phase 4: Model Controls + Store Foundation** - Full layer toggles, physical dimensions, unit toggle, and contextual control visibility wired to all layers (completed 2026-02-25)
- [x] **Phase 5: Roads Layer** - OSM roads as 3D geometry with configurable style (raised/recessed/flat) and type-based widths (UAT gap closure in progress) (completed 2026-02-26)
- [x] **Phase 6: Water Layer** - Rivers, lakes, and water bodies baked as flat depressions into the terrain elevation grid (completed 2026-02-26)
- [x] **Phase 7: Vegetation + Terrain Smoothing** - Parks and forests as toggleable geometry; mesh smoothing slider for smoother STL output (completed 2026-02-26)
- [x] **Phase 8: Edit-Iterate + Export Polish** - State-preserving back-to-edit navigation, live preview updates, and location-name STL filenames (completed 2026-02-28)
- [ ] **Phase 9: Performance Hardening** - Web Worker mesh generation and clean production build

## Phase Details

### Phase 1: Foundation
**Goal**: Users can find any location in the world, define a precise bounding box on an interactive map, and the app captures that selection in a provably correct coordinate projection ready for mesh generation
**Depends on**: Nothing (first phase)
**Requirements**: LOCS-01, LOCS-02, LOCS-03, FNDN-01, FNDN-02
**Success Criteria** (what must be TRUE):
  1. User can type a city name, street address, or lat/lon coordinates into a search field and the map flies to that location
  2. User can draw a bounding box on the 2D map by dragging, and the selected area is visually shown as a rectangle
  3. User can resize and reposition the bounding box after initial placement by dragging its edges or corners
  4. All bounding box coordinates are projected to local flat-earth meter space (UTM), not Web Mercator — verifiable by an automated test asserting correct dimensions at known latitudes
  5. STL export coordinate pipeline writes vertex coordinates in millimeters — verifiable by an automated test asserting a known bbox produces STL dimensions matching specified physical size
**Plans:** 3 plans (all complete)

Plans:
- [x] 01-01-PLAN.md — Project scaffold, MapLibre satellite map, geocoding search, UTM/STL coordinate pipeline with tests
- [x] 01-02-PLAN.md — Bounding box drawing/editing with Terra Draw, sidebar selection info, generate button
- [x] 01-03-PLAN.md — Gap closure: fix API key runtime guard and map instance lookup (all 9 UAT failures); HTML overlay bbox with resize/move

### Phase 2: Terrain + Preview + Export
**Goal**: Users can generate a printable terrain STL for any selected area, see it in a live 3D preview, and download it — the complete output contract is validated end-to-end for the terrain-only case
**Depends on**: Phase 1
**Requirements**: TERR-01, TERR-02, TERR-03, PREV-01, PREV-02, EXPT-01, EXPT-02, EXPT-03, EXPT-04, EXPT-05
**Success Criteria** (what must be TRUE):
  1. User sees real terrain elevation rendered in the 3D preview for the selected area, with visible height variation where the real terrain has relief
  2. User can drag a terrain exaggeration slider to flatten or exaggerate terrain, and the 3D preview updates to reflect the change
  3. Flat terrain areas (near-zero elevation variation) produce a model with a visible minimum height — not a paper-thin surface
  4. User sees the 2D map panel and 3D preview panel displayed side-by-side simultaneously, with orbit, zoom, and pan controls on the 3D panel
  5. User can click Export, and the browser downloads a binary STL file whose bounding box dimensions match the user's specified physical dimensions in millimeters — the file opens without repair warnings in PrusaSlicer or Bambu Studio
**Plans:** 5 plans (all complete)

Plans:
- [x] 02-01-PLAN.md — Setup + split-panel layout + elevation tile fetching/stitching pipeline
- [x] 02-02-PLAN.md — Martini terrain mesh + R3F 3D preview + exaggeration controls
- [x] 02-03-PLAN.md — Watertight solid mesh + manifold validation + STL export + download
- [x] 02-04-PLAN.md — Gap closure: fix tile rotation/stitching bug (terrain appears as 4 incorrectly rotated quadrants)
- [x] 02-05-PLAN.md — Gap closure: fix tile boundary seam bug (false border-overlap assumption in stitchTileElevations)

### Phase 3: Buildings
**Goal**: Users can see OSM buildings rendered with real heights on top of terrain, including correct placement on slopes and estimated heights where OSM data is missing
**Depends on**: Phase 2
**Requirements**: BLDG-01, BLDG-02, BLDG-03, BLDG-04
**Success Criteria** (what must be TRUE):
  1. User sees building footprints from OSM extruded to their real heights within the selected area — a dense urban area shows clearly distinct buildings
  2. Buildings with detailed OSM roof geometry (gabled, hipped, flat) render with the correct roof shape rather than a flat top
  3. Buildings missing OSM height tags still render with plausible heights derived from the fallback hierarchy (levels tag, then footprint-area heuristic, then type default) — a rural US area shows buildings rather than empty terrain
  4. Buildings sit exactly at terrain level at their geographic location — a building on a slope has its base flush with the slope, not floating above or cutting below it
**Plans:** 3/3 plans complete

Plans:
- [x] 03-01-PLAN.md — Building data pipeline + geometry core library (Overpass fetch, height resolver, elevation sampler, earcut triangulation, wall/roof construction, merge)
- [x] 03-02-PLAN.md — Roof geometry (gabled/hipped/pyramidal) + 3D preview integration (BuildingMesh component, store extension, GenerateButton wiring)
- [x] 03-03-PLAN.md — STL export integration (three-bvh-csg CSG union) + visual verification checkpoint

### Phase 4: Model Controls + Store Foundation
**Goal**: All layer state fields exist in the Zustand store and the UI exposes fully wired layer toggles, physical dimension inputs, unit switching, and contextual control visibility — so every subsequent phase can immediately test its feature against the correct toggle behavior
**Depends on**: Phase 3
**Requirements**: CTRL-01, CTRL-02, CTRL-03, CTRL-04
**Success Criteria** (what must be TRUE):
  1. User can toggle terrain, buildings, roads, water, and vegetation on/off individually, and the 3D preview immediately reflects each toggle
  2. User can enter maximum physical dimensions (X width, Y depth, Z height) in the sidebar, and the 3D preview and exported STL reflect the specified size
  3. User can switch measurements between mm and inches, and all dimension displays update to show the converted values
  4. Road style selector is hidden when the roads toggle is off, vegetation controls are hidden when vegetation is off, and smoothing slider is hidden when terrain is off — contextual visibility is correct for each layer
**Plans:** 3/3 plans complete

Plans:
- [x] 04-01-PLAN.md — Extend Zustand store with layer toggles, units, targetHeightMM; wire mesh visibility and export gating
- [x] 04-02-PLAN.md — Rebuild PreviewSidebar with collapsible sections, ModelSizeSection, layer toggles, unit toggle, contextual visibility
- [x] 04-03-PLAN.md — Gap closure: wire targetHeightMM into terrain/building mesh generation and export pipeline

### Phase 5: Roads Layer
**Goal**: Users can see the OSM road network rendered as 3D geometry within the selected area, choose a road style, and have roads included in the exported STL
**Depends on**: Phase 4
**Requirements**: ROAD-01, ROAD-02, ROAD-03
**Success Criteria** (what must be TRUE):
  1. User sees the OSM road network rendered as 3D geometry on terrain within the selected area — a town center shows a visible road grid
  2. Highway and trunk roads are visibly wider than residential and service streets — type-based width differences are noticeable in the 3D preview
  3. User can select recessed channels, raised surfaces, or flat road style, and the 3D preview updates to show roads in the chosen style
  4. Roads are included in the exported STL and the resulting file opens without repair warnings in a standard slicer
**Plans:** 3/3 plans complete

Plans:
- [x] 05-01-PLAN.md — Road data pipeline + geometry library (Overpass fetch, parse/classify, geometry-extrude ribbon mesh, terrain-following Z, unit tests)
- [x] 05-02-PLAN.md — RoadMesh component + RoadsSection UI + store extension + GenerateButton wiring + STL export integration
- [ ] 05-03-PLAN.md — Gap closure: fix Z-fighting (roads invisible), Overpass rate limiting (road fetch fails), building base Z, export clipping

### Phase 6: Water Layer
**Goal**: Users can see rivers, lakes, and water bodies rendered as flat depressions within the selected area, with the depression baked into the terrain mesh so the STL is correct for printing
**Depends on**: Phase 5
**Requirements**: WATR-01
**Success Criteria** (what must be TRUE):
  1. User sees water bodies (rivers, lakes) rendered as flat depressions visually distinct from surrounding terrain in the 3D preview
  2. Water depression is baked into the terrain elevation grid before mesh generation — the exported STL shows the physical depression, not just a visual overlay
  3. An area containing a lake with an island renders correctly — the island is above water level, the surrounding lake is a depression, and the STL is watertight
**Plans**: TBD

### Phase 7: Vegetation + Terrain Smoothing
**Goal**: Users can see parks and forests as a toggleable geometry layer, and can control mesh smoothing to interpolate rough elevation transitions into smoother surfaces for better print quality
**Depends on**: Phase 6
**Requirements**: VEGE-01, TERR-04
**Success Criteria** (what must be TRUE):
  1. User sees parks and forested areas rendered as raised geometry patches distinct from surrounding terrain — a city park is visibly distinguishable from roads and buildings
  2. User can drag a smoothing slider, and the 3D terrain preview updates to show smoother elevation transitions — raw 30m SRTM step artifacts are visibly reduced at higher smoothing values
  3. Smoothing is applied to the DEM elevation grid before feature placement — buildings, roads, and water depressions remain correctly positioned after smoothing is increased
  4. Vegetation layer count is displayed next to the vegetation toggle — a zero-feature result ("Vegetation — 0 features found") is shown rather than a silent empty layer
**Plans:** 2/2 plans complete

Plans:
- [x] 07-01-PLAN.md — Terrain smoothing slider: export smoothElevations, remove hardcoded smoothing from buildTerrainGeometry, add smoothingLevel store field + slider UI, wire caller-side smoothing into TerrainMesh/ExportPanel/WaterMesh
- [ ] 07-02-PLAN.md — Vegetation layer: data pipeline (types, parser, Overpass extension), VegetationMesh preview component, VegetationSection sidebar UI, STL export integration

### Phase 8: Edit-Iterate + Export Polish
**Goal**: Users can navigate between editing and preview without losing state, the preview reflects changes live, and exported STL filenames include the searched location name
**Depends on**: Phase 7
**Requirements**: PREV-03, PREV-04, EXPT-06
**Success Criteria** (what must be TRUE):
  1. User can click "Back to Edit" from the 3D preview and return to the editing view with the same bounding box, feature toggles, layer settings, and dimension values intact — nothing is reset
  2. When a user toggles a feature on/off or changes any setting (dimensions, units, smoothing, road style), the 3D preview updates automatically without requiring a manual regenerate click
  3. When the user searched for a named location (e.g., "London, UK"), the downloaded STL filename includes that name (e.g., `london-uk-150mm.stl`) rather than raw coordinates
**Plans**: TBD

### Phase 9: Performance Hardening
**Goal**: Mesh generation runs off the main thread so the UI never freezes during generation, and the production build compiles clean for deployment
**Depends on**: Phase 8
**Requirements**: FNDN-03, FNDN-04
**Success Criteria** (what must be TRUE):
  1. Mesh generation for any valid bounding box runs in a Web Worker — the 2D map and UI controls remain fully interactive during generation with no visible freeze or jank
  2. Running `npm run build` completes without TypeScript errors — the production artifact is deployable and the Worker bundle loads correctly at runtime
  3. A dense urban area (e.g., a 1km x 1km block of a major city) generates a preview mesh without crashing the browser tab or producing an out-of-memory error
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/3 | Complete | 2026-02-24 |
| 2. Terrain + Preview + Export | 5/5 | Complete | 2026-02-24 |
| 3. Buildings | 3/3 | Complete | 2026-02-25 |
| 4. Model Controls + Store Foundation | 3/3 | Complete   | 2026-02-25 |
| 5. Roads Layer | 3/3 | Complete   | 2026-02-26 |
| 6. Water Layer | 2/2 | Complete   | 2026-02-26 |
| 7. Vegetation + Terrain Smoothing | 2/2 | Complete   | 2026-02-26 |
| 8. Edit-Iterate + Export Polish | 2/2 | Complete   | 2026-02-28 |
| 9. Performance Hardening | 0/TBD | Not started | - |
