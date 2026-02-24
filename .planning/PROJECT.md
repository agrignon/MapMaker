# MapMaker

## What This Is

A web application that converts any real-world location into a 3D-printable STL model. Users specify a location (city name, street address, or lat/lon), define a bounding box on an interactive map, toggle geographic features (terrain, buildings, roads), adjust physical dimensions, and export a print-ready STL file with a solid base plate. The app pairs a 2D map editor with a live 3D preview for real-time feedback.

## Core Value

Users can turn any place in the world into a physical 3D-printed model — from selecting the location to holding the print — with full control over what features appear and how the model is sized.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

<!-- Current scope. Building toward these. -->

- [ ] User can search for a location by city name, street address, or lat/lon coordinates
- [ ] User can define a bounding box by dragging on a 2D map to set the area of interest
- [ ] User can toggle geographic features on/off: terrain, buildings, roads
- [ ] User can control terrain elevation exaggeration with a slider (flatten to exaggerate)
- [ ] User can choose road style: recessed channels, raised surfaces, or flat at terrain level
- [ ] Buildings render with detailed geometry (roof shapes, facades) where data is available
- [ ] User can set max physical dimensions: X width, Y depth, Z height
- [ ] Measurements switchable between mm and inches (default: mm)
- [ ] Hybrid editing view: 2D map for selection + live 3D preview updating as features are toggled
- [ ] 3D preview with orbit, zoom, and pan controls
- [ ] STL export with solid base plate included
- [ ] User can download the generated STL file to their local machine
- [ ] User can go back from 3D preview to editing and iterate

### Out of Scope

- Multi-color/multi-material STL export — user paints in their slicer (Bambu Studio, etc.)
- Mobile-native app — web-first, responsive later
- User accounts or saved projects — local workflow, no auth needed initially
- Real-time collaboration — single-user tool

## Context

- Target audience: 3D printing enthusiasts who want to create terrain/city models
- The "painting" workflow happens outside this app — in Bambu Studio or similar slicers
- Geographic data sources need to provide: elevation/DEM data, building footprints with heights and geometry, road networks
- OpenStreetMap is likely the primary data source (free, open, rich building/road data); elevation from open DEM sources
- STL generation can happen client-side or server-side — best approach TBD during research
- Start as a personal project, may open publicly later — architecture should allow scaling but doesn't need it day one

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
| Always include base plate | Stability on print bed; cleaner look; user doesn't have to add one manually | — Pending |
| mm default, switchable to inches | Most 3D printing is metric; US users may prefer inches | — Pending |

---
*Last updated: 2026-02-23 after initialization*
