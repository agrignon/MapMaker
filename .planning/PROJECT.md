# MapMaker

## What This Is

A web application that converts any real-world location into a 3D-printable STL model. Users specify a location (city name, street address, or lat/lon), define a bounding box on an interactive map, toggle geographic features (terrain, buildings, roads), adjust physical dimensions, and export a print-ready STL file with a solid base plate. The app pairs a 2D map editor with a live 3D preview for real-time feedback.

## Core Value

Users can turn any place in the world into a physical 3D-printed model — from selecting the location to holding the print — with full control over what features appear and how the model is sized.

## Requirements

### Validated

<!-- Shipped and confirmed working (Phases 1-3). -->

- [x] Location search (city name, address, lat/lon) with map fly-to
- [x] Bounding box drawing, resize, and repositioning on interactive satellite map
- [x] UTM coordinate projection pipeline (not Web Mercator)
- [x] Real terrain elevation from DEM tiles with 3D preview
- [x] Terrain exaggeration slider + minimum height floor for flat areas
- [x] Side-by-side 2D map + 3D preview layout with orbit/zoom/pan
- [x] OSM buildings with real heights, detailed roof geometry, height fallback cascade
- [x] Buildings correctly placed on terrain surface
- [x] Watertight STL export with solid base plate + browser download
- [x] STL dimensions match specified mm measurements

### Active

<!-- Current scope. Building toward these (Phases 4+). -->

- [ ] Roads: OSM road network as 3D geometry with configurable style and type-based width
- [ ] Water: Rivers, lakes, ocean as flat depressions at water level
- [ ] Vegetation: Parks and forests as toggleable geometry layer
- [ ] Controls: Layer toggles, physical dimensions (X/Y/Z), mm/inches, contextual visibility
- [ ] Terrain smoothing: User-controlled mesh interpolation slider for smoother STL output
- [ ] Edit-iterate: Back to edit without losing state + live preview updates
- [ ] Export: Location name in filenames when available
- [ ] Performance: Web Worker mesh generation
- [ ] Build: Production build compiles without errors

### Out of Scope

- Multi-color/multi-material STL export — user paints in their slicer (Bambu Studio, etc.)
- Mobile-native app — web-first, responsive later
- User accounts or saved projects — local workflow, no auth needed initially
- Real-time collaboration — single-user tool

## Current Milestone: v1.0 (Re-scoped)

**Goal:** Complete the full location-to-print pipeline with terrain, buildings, roads, water, vegetation, controls, and polished UX

**Target features (remaining):**
- Roads layer with style selection and type-based widths
- Water bodies as flat depressions
- Vegetation/parks as toggleable layer
- Terrain mesh smoothing slider
- Full model controls (layer toggles, dimensions, units)
- Edit-iterate loop with state preservation
- Location-name filenames, production build fix, Web Worker offload

## Context

- Target audience: 3D printing enthusiasts who want to create terrain/city models
- The "painting" workflow happens outside this app — in Bambu Studio or similar slicers
- Geographic data sources: MapTiler (elevation DEM tiles), Overpass/OSM (buildings, roads, water, vegetation)
- All processing is client-side: coordinate projection, elevation decode, mesh generation, STL serialization
- Phases 1-3 shipped: foundation, terrain+preview+export, buildings — all verified with 115 passing tests
- User reported mesh quality concern: raw DEM produces rough/abrupt elevation changes needing smoothing

## Constraints

- **Data availability**: Building detail depends on OSM coverage — some areas have rich 3D building data, others only footprints
- **Browser performance**: 3D preview and potential client-side STL generation must perform well in-browser
- **STL file size**: Dense areas with many buildings could produce large files — may need LOD or simplification options
- **Elevation data resolution**: Free DEM sources vary in resolution (~30m SRTM vs higher-res local sources)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Hybrid 2D+3D editing view | User wants real-time feedback while toggling features; side-by-side layout gives map context + 3D preview | — Pending |
| Detailed building geometry where available | Differentiates from simple extruded-footprint tools; makes prints more realistic | — Pending |
| User-controlled terrain exaggeration | Small prints need exaggerated terrain to be visible; flat areas need it too | — Pending |
| Configurable road style (recessed/raised/flat) | Different styles suit different painting and printing workflows | — Pending |
| Always include base plate | Stability on print bed; cleaner look; user doesn't have to add one manually | ✓ Good |
| mm default, switchable to inches | Most 3D printing is metric; US users may prefer inches | — Pending |
| Client-side architecture | All mesh gen, projection, elevation decode, STL serialization in browser | ✓ Good |
| MapTiler terrain-rgb + Overpass OSM | Free/open data sources for elevation and features | ✓ Good |
| three-bvh-csg for CSG boolean | Prevents non-manifold geometry in building+terrain union | ✓ Good |
| Water as flat depressions | Visible in print, paintable, matches DEM water level | — Pending |
| Vegetation as toggleable layer | Like buildings — separate geometry that can be on/off | — Pending |
| Mesh smoothing slider | User controls interpolation level; raw DEM too rough for quality prints | — Pending |

---
*Last updated: 2026-02-24 after v1.0 re-scope — validated phases 1-3, added water/vegetation/smoothing/build fix*
