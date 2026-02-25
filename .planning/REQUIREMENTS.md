# Requirements: MapMaker

**Defined:** 2026-02-23
**Core Value:** Users can turn any place in the world into a physical 3D-printed model with full control over features and dimensions.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Location & Selection

- [x] **LOCS-01**: User can search for a location by city name, street address, or lat/lon coordinates
- [x] **LOCS-02**: User can define a bounding box by dragging on a 2D map to set the area of interest
- [x] **LOCS-03**: User can resize and reposition the bounding box after initial placement

### Terrain

- [x] **TERR-01**: User sees real terrain elevation data rendered from DEM sources within the selected bounding box
- [x] **TERR-02**: User can control terrain elevation exaggeration with a slider (flatten to exaggerate)
- [x] **TERR-03**: Flat terrain areas produce a printable model with minimum height floor (not zero-thickness)
- [ ] **TERR-04**: User can control mesh smoothing with a slider to interpolate rough elevation transitions into smooth surfaces

### Buildings

- [x] **BLDG-01**: User sees OSM building footprints extruded to real heights within the selected area
- [x] **BLDG-02**: Buildings use detailed roof geometry (gabled, hipped, etc.) where OSM data is available
- [x] **BLDG-03**: Buildings missing height data use a fallback hierarchy (levels → footprint heuristic → type default)
- [x] **BLDG-04**: Buildings sit correctly on the terrain surface at their geographic location

### Roads

- [ ] **ROAD-01**: User sees OSM road network rendered as 3D geometry within the selected area
- [ ] **ROAD-02**: User can choose road style: recessed channels, raised surfaces, or flat at terrain level
- [ ] **ROAD-03**: Road width reflects road type (highway wider than residential street)

### Water

- [ ] **WATR-01**: User sees water bodies (rivers, lakes, ocean) rendered as flat depressions at water level within the selected area

### Vegetation

- [ ] **VEGE-01**: User sees parks and forested areas rendered as a toggleable vegetation layer with distinct geometry

### Model Controls

- [ ] **CTRL-01**: User can toggle terrain, buildings, roads, water, and vegetation on/off individually
- [ ] **CTRL-02**: User can set maximum physical dimensions: X width, Y depth, Z height
- [ ] **CTRL-03**: User can switch measurements between mm and inches (default: mm)
- [ ] **CTRL-04**: Controls are hidden/disabled when their layer is toggled off (e.g., road style hidden when roads off)

### Preview & Navigation

- [x] **PREV-01**: User sees a live 3D preview of the model with orbit, zoom, and pan controls
- [x] **PREV-02**: 2D map editor and 3D preview are displayed side-by-side in a hybrid layout
- [ ] **PREV-03**: User can go back from 3D preview to editing without losing selections or settings
- [ ] **PREV-04**: 3D preview updates when user toggles features or changes settings

### Export

- [x] **EXPT-01**: User can generate a binary STL file from the current model
- [x] **EXPT-02**: Generated STL includes a solid base plate underneath the terrain/features
- [x] **EXPT-03**: Generated STL is watertight (manifold) and printable without repair in standard slicers
- [x] **EXPT-04**: User can download the STL file directly to their local machine
- [x] **EXPT-05**: STL dimensions match the user's specified physical dimensions in the correct unit (mm)
- [ ] **EXPT-06**: Exported STL filename includes the searched location name when available (not just coordinates)

### Foundation (Technical)

- [x] **FNDN-01**: All geometry uses local meter-space coordinates (UTM projection), not Web Mercator
- [x] **FNDN-02**: STL export writes coordinates in millimeters (canonical unit for 3D printing)
- [ ] **FNDN-03**: Mesh generation runs in a Web Worker to prevent UI freezing
- [ ] **FNDN-04**: Production build (`npm run build`) compiles without TypeScript errors

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Enhanced Selection

- **ESEL-01**: User can share current view/settings via a URL (no accounts needed)
- **ESEL-02**: User can adjust bounding box aspect ratio and rotation

### Additional Layers

- ~~**LAYR-01**: User sees water bodies rendered as depressions in the terrain~~ → Promoted to v1 as WATR-01
- **LAYR-02**: User can overlay GPX tracks (hiking trails) on the model
- **LAYR-03**: User sees elevation contour lines on the terrain surface

### Advanced Export

- **AEXP-01**: User can export in 3MF format with multi-material color assignments
- **AEXP-02**: User can split large areas into multiple print tiles

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-color/multi-material STL | User paints in their slicer (Bambu Studio, etc.) — better control there |
| User accounts / saved projects | Doubles infrastructure scope; URL sharing is simpler alternative |
| Custom polygon / freehand selection | Rectangle covers 90%+ of use cases; KML import is v2+ |
| Mobile-native experience | 3D canvas performance poor on mobile; print workflow is desktop |
| Texture/satellite imagery overlay | FDM printers can't reproduce texture; clean geometry for manual painting |
| Real-time collaboration | Single-user tool |
| Server-side STL generation | Client-side preferred for simplicity; server fallback if needed later |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| LOCS-01 | Phase 1 | Complete |
| LOCS-02 | Phase 1 | Complete |
| LOCS-03 | Phase 1 | Complete |
| FNDN-01 | Phase 1 | Complete |
| FNDN-02 | Phase 1 | Complete |
| TERR-01 | Phase 2 | Complete |
| TERR-02 | Phase 2 | Complete |
| TERR-03 | Phase 2 | Complete |
| PREV-01 | Phase 2 | Complete |
| PREV-02 | Phase 2 | Complete |
| EXPT-01 | Phase 2 | Complete |
| EXPT-02 | Phase 2 | Complete |
| EXPT-03 | Phase 2 | Complete |
| EXPT-04 | Phase 2 | Complete |
| EXPT-05 | Phase 2 | Complete |
| BLDG-01 | Phase 3 | Complete |
| BLDG-02 | Phase 3 | Complete |
| BLDG-03 | Phase 3 | Complete |
| BLDG-04 | Phase 3 | Complete |
| CTRL-01 | Phase 4 | Pending |
| CTRL-02 | Phase 4 | Pending |
| CTRL-03 | Phase 4 | Pending |
| CTRL-04 | Phase 4 | Pending |
| ROAD-01 | Phase 5 | Pending |
| ROAD-02 | Phase 5 | Pending |
| ROAD-03 | Phase 5 | Pending |
| WATR-01 | Phase 6 | Pending |
| VEGE-01 | Phase 7 | Pending |
| TERR-04 | Phase 7 | Pending |
| PREV-03 | Phase 8 | Pending |
| PREV-04 | Phase 8 | Pending |
| EXPT-06 | Phase 8 | Pending |
| FNDN-03 | Phase 9 | Pending |
| FNDN-04 | Phase 9 | Pending |

**Coverage:**
- v1 requirements: 34 total
- Mapped to phases: 34/34 (100%)
- Phases 1-3: 19 requirements — Complete
- Phases 4-9: 15 requirements — Pending

---
*Requirements defined: 2026-02-23*
*Last updated: 2026-02-24 after v1.0 re-scope — added TERR-04, WATR-01, VEGE-01, EXPT-06, FNDN-04; updated CTRL-01 for water+vegetation toggles; Phases 4-9 assigned for all 15 pending requirements*
