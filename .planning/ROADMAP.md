# Roadmap: MapMaker

## Overview

MapMaker is built in six phases that follow the dependency graph of the output pipeline. Phase 1 establishes correct geographic foundations (map, bbox, coordinate projection) because every downstream feature produces wrong-scale geometry if this is wrong. Phase 2 delivers the terrain-only end-to-end pipeline — elevation data in, printable STL out — which validates the full output contract before buildings or roads are added. Phases 3 and 4 layer in the differentiating features (buildings then roads) on top of the proven pipeline. Phase 5 completes the edit-iterate workflow loop. Phase 6 hardens performance so the app handles real-world usage without freezing or memory errors.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Map, location search, bounding box, and correct coordinate projection pipeline
- [x] **Phase 2: Terrain + Preview + Export** - Terrain-only end-to-end pipeline: elevation data to 3D preview to STL download (gap closure: tile stitching bug) (completed 2026-02-24)
- [ ] **Phase 3: Buildings** - OSM buildings with real heights extruded correctly onto terrain
- [ ] **Phase 4: Roads + Controls** - OSM roads with configurable styles and fully parameterized layer controls
- [ ] **Phase 5: Edit-Iterate Loop** - State-preserving back-to-edit navigation and live preview updates
- [ ] **Phase 6: Performance Hardening** - Web Worker mesh generation and browser memory/rate-limit safeguards

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
**Plans:** 3 plans (2 complete, 1 gap closure)

Plans:
- [x] 01-01-PLAN.md — Project scaffold, MapLibre satellite map, geocoding search, UTM/STL coordinate pipeline with tests
- [x] 01-02-PLAN.md — Bounding box drawing/editing with Terra Draw, sidebar selection info, generate button
- [ ] 01-03-PLAN.md — Gap closure: fix API key runtime guard and map instance lookup (all 9 UAT failures)

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
**Plans:** 4/4 plans complete

Plans:
- [x] 02-01-PLAN.md — Setup + split-panel layout + elevation tile fetching/stitching pipeline
- [x] 02-02-PLAN.md — Martini terrain mesh + R3F 3D preview + exaggeration controls
- [x] 02-03-PLAN.md — Watertight solid mesh + manifold validation + STL export + download
- [x] 02-04-PLAN.md — Gap closure: fix tile rotation/stitching bug (terrain appears as 4 incorrectly rotated quadrants)

### Phase 3: Buildings
**Goal**: Users can see OSM buildings rendered with real heights on top of terrain, including correct placement on slopes and estimated heights where OSM data is missing
**Depends on**: Phase 2
**Requirements**: BLDG-01, BLDG-02, BLDG-03, BLDG-04
**Success Criteria** (what must be TRUE):
  1. User sees building footprints from OSM extruded to their real heights within the selected area — a dense urban area shows clearly distinct buildings
  2. Buildings with detailed OSM roof geometry (gabled, hipped, flat) render with the correct roof shape rather than a flat top
  3. Buildings missing OSM height tags still render with plausible heights derived from the fallback hierarchy (levels tag, then footprint-area heuristic, then type default) — a rural US area shows buildings rather than empty terrain
  4. Buildings sit exactly at terrain level at their geographic location — a building on a slope has its base flush with the slope, not floating above or cutting below it
**Plans**: TBD

### Phase 4: Roads + Controls
**Goal**: Users can see OSM roads rendered on terrain with a choice of road style, and all layer controls (toggles, dimensions, units, road style, terrain exaggeration) are fully wired up and contextually aware
**Depends on**: Phase 3
**Requirements**: ROAD-01, ROAD-02, ROAD-03, CTRL-01, CTRL-02, CTRL-03, CTRL-04
**Success Criteria** (what must be TRUE):
  1. User sees the OSM road network rendered as 3D geometry on terrain within the selected area, with highway roads visibly wider than residential streets
  2. User can select recessed channels, raised surfaces, or flat road style, and the 3D preview updates to show roads in the chosen style
  3. User can toggle terrain, buildings, and roads on/off individually, and the 3D preview reflects the current visible layers
  4. User can enter maximum physical dimensions (X width, Y depth, Z height) in either mm or inches, switch units, and the preview and exported STL reflect the specified size
  5. Road style selector is hidden when the roads layer is toggled off, and terrain exaggeration slider is hidden when terrain layer is toggled off
**Plans**: TBD

### Phase 5: Edit-Iterate Loop
**Goal**: Users can move between the editing view and 3D preview without losing their selections or settings, and the preview automatically reflects changes without requiring manual refresh
**Depends on**: Phase 4
**Requirements**: PREV-03, PREV-04
**Success Criteria** (what must be TRUE):
  1. User can click "Back to Edit" from the 3D preview and return to the editing view with the same bounding box position, feature toggles, and settings intact — nothing is reset
  2. When a user toggles a feature on/off or changes any setting, the 3D preview updates automatically to reflect the change without the user needing to click a refresh or regenerate button
**Plans**: TBD

### Phase 6: Performance Hardening
**Goal**: Mesh generation runs off the main thread so the UI never freezes, and the app handles dense city areas, large bounding boxes, and repeat usage without running out of memory or hitting API rate limits
**Depends on**: Phase 5
**Requirements**: FNDN-03
**Success Criteria** (what must be TRUE):
  1. Mesh generation for any valid bounding box runs in a Web Worker — the 2D map and UI remain fully interactive during generation with no visible freeze or jank
  2. A dense urban area (e.g., a 1km x 1km block of Manhattan) generates a preview mesh without crashing the browser tab or producing an out-of-memory error
  3. Loading a new area after a previous one completes does not accumulate memory — geometry for previous layers is disposed before new geometry is allocated
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 2/3 | Gap closure | - |
| 2. Terrain + Preview + Export | 4/4 | Complete    | 2026-02-24 |
| 3. Buildings | 0/TBD | Not started | - |
| 4. Roads + Controls | 0/TBD | Not started | - |
| 5. Edit-Iterate Loop | 0/TBD | Not started | - |
| 6. Performance Hardening | 0/TBD | Not started | - |
