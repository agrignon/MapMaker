# MapMaker

## What This Is

A web application that converts any real-world location into a 3D-printable STL model. Users specify a location (city name, street address, or lat/lon), define a bounding box on an interactive map, toggle geographic features (terrain, buildings, roads, water, vegetation), adjust physical dimensions and smoothing, and export a print-ready STL file. The app pairs a 2D map editor with a live 3D preview for real-time feedback, with all processing running client-side. Buildings are sourced from both OSM and Overture Maps for global coverage.

## Core Value

Users can turn any place in the world into a physical 3D-printed model — from selecting the location to holding the print — with full control over what features appear and how the model is sized.

## Requirements

### Validated

- ✓ Location search (city name, address, lat/lon) with map fly-to — v1.0
- ✓ Bounding box drawing, resize, and repositioning on interactive satellite map — v1.0
- ✓ UTM coordinate projection pipeline (not Web Mercator) — v1.0
- ✓ Real terrain elevation from DEM tiles with 3D preview — v1.0
- ✓ Terrain exaggeration slider + minimum height floor for flat areas — v1.0
- ✓ Terrain mesh smoothing slider for smoother STL output — v1.0
- ✓ Side-by-side 2D map + 3D preview layout with orbit/zoom/pan — v1.0
- ✓ OSM buildings with real heights, detailed roof geometry (gabled/hipped), and height fallback cascade — v1.0
- ✓ Buildings correctly placed on terrain surface — v1.0
- ✓ OSM road network as 3D geometry with configurable style (recessed/raised/flat) and type-based widths — v1.0
- ✓ Water bodies (rivers, lakes) as flat depressions baked into terrain — v1.0
- ✓ Parks and forests as toggleable vegetation geometry layer — v1.0
- ✓ Layer toggles for terrain, buildings, roads, water, vegetation — v1.0
- ✓ Physical dimensions (X/Y/Z) with mm/inches unit switching — v1.0
- ✓ Contextual control visibility (hidden when layer toggled off) — v1.0
- ✓ Back to edit without losing state + live preview updates — v1.0
- ✓ Location name in STL filenames when available — v1.0
- ✓ Watertight STL export with solid base plate + browser download — v1.0
- ✓ STL dimensions match specified mm measurements — v1.0
- ✓ Web Worker mesh generation for non-blocking UI — v1.0
- ✓ Production build compiles without TypeScript errors — v1.0
- ✓ Overture Maps building footprint fetching via PMTiles for selected bounding box — v1.1
- ✓ Silent fallback to OSM-only when Overture data is unavailable — v1.1
- ✓ MVT tile decoding with winding normalization, MultiPolygon flattening, area filtering — v1.1
- ✓ Spatial deduplication of Overture footprints against OSM buildings (AABB IoU) — v1.1
- ✓ Parallel OSM + Overture fetch with merged building pipeline — v1.1
- ✓ Gap-fill buildings in 3D preview and STL export — v1.1

### Active

- [ ] Three-tier responsive layout system (mobile / tablet / desktop) with clean breakpoints
- [ ] Mobile: full-screen map and preview views with fast toggle between them
- [ ] Mobile: bottom sheet with three snap heights (peek / half / full) for controls
- [ ] Mobile: touch-optimized controls — larger targets, better spacing, gesture-friendly
- [ ] Tablet: side-by-side layout with contextual sidebar (like desktop)
- [ ] Desktop: persistent contextual sidebar replacing floating overlay panel
- [ ] Desktop: better space utilization and layout proportions
- [ ] Contextual sidebar — shows map controls or model/export controls based on active view
- [ ] Transitions and animations — view switches, sheet snapping, loading states, micro-interactions
- [ ] Clean breakpoint system replacing binary 768px mobile/desktop switch

### Out of Scope

- Multi-color/multi-material STL export — user paints in their slicer (Bambu Studio, etc.)
- Mobile-native app — web-first, desktop print workflow
- User accounts or saved projects — local workflow, no auth needed
- Real-time collaboration — single-user tool
- Custom polygon / freehand selection — rectangle covers 90%+ of use cases
- Texture/satellite imagery overlay — FDM printers can't reproduce texture
- Overture building parts (roof geometry) — adds complexity without clear print benefit
- Real-time STAC polling for Overture URL updates — pin to known release, update per MapMaker release cycle
- Server-side proxy for Overture data — breaks client-side architecture; PMTiles works from browser

## Context

Shipped v1.1 with 13,994 lines of TypeScript across 13 phases (v1.0 + v1.1).
Tech stack: React 19, Three.js (R3F), Zustand, Vite, Vitest, MapLibre GL JS.
Data sources: MapTiler (elevation DEM tiles), Overpass/OSM (buildings, roads, water, vegetation), Overture Maps (gap-fill buildings via PMTiles).
All processing is client-side: coordinate projection, elevation decode, mesh generation, STL serialization.
264 tests passing across 21 test files. Production build compiles clean.

## Constraints

- **Data availability**: Building detail depends on OSM coverage — some areas have rich 3D building data, others only footprints. Overture Maps fills gaps with basic footprints.
- **Browser performance**: Bbox area capped at 25 km² (hard) / 4 km² (soft warning) to prevent OOM on dense areas
- **STL file size**: Dense areas with many buildings produce large files — mesh generation runs in Web Worker to keep UI responsive
- **Elevation data resolution**: Free DEM sources at ~30m SRTM resolution; smoothing slider helps interpolate rough transitions
- **Overture URL rotation**: Overture PMTiles URL rotates every ~60 days; pinned to known release with STAC catalog documented for updates

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Hybrid 2D+3D editing view | User wants real-time feedback; side-by-side layout gives map context + 3D preview | ✓ Good |
| Detailed building geometry (gabled/hipped roofs) | Differentiates from simple extruded-footprint tools; makes prints more realistic | ✓ Good |
| User-controlled terrain exaggeration | Small prints need exaggerated terrain to be visible; flat areas need it too | ✓ Good |
| Configurable road style (recessed/raised/flat) | Different styles suit different painting and printing workflows | ✓ Good |
| Always include base plate | Stability on print bed; cleaner look; no manual addition needed | ✓ Good |
| mm default, switchable to inches | Most 3D printing is metric; US users may prefer inches | ✓ Good |
| Client-side architecture | All mesh gen, projection, elevation decode, STL serialization in browser | ✓ Good |
| MapTiler terrain-rgb + Overpass OSM | Free/open data sources for elevation and features | ✓ Good |
| Water as baked depressions | Visible in print, paintable, matches DEM water level | ✓ Good |
| Vegetation as toggleable layer | Separate geometry that can be on/off, like buildings | ✓ Good |
| Mesh smoothing slider | User controls interpolation; raw 30m DEM too rough for quality prints | ✓ Good |
| Web Worker + Transferable ArrayBuffers | Non-blocking UI during mesh generation; merged typed arrays prevent Chrome regression | ✓ Good |
| Earcut base plate | Exact perimeter match with wall edges eliminates boundary edge gaps | ✓ Good |
| CSS visibility:hidden for preview preservation | Instant re-entry when going Back to Edit; WebGL context not destroyed | ✓ Good |
| Caller-side smoothing pipeline | smooth → water depression → build terrain; all callers follow same order | ✓ Good |
| PMTiles via browser-native `pmtiles` package | Only viable option; DuckDB WASM lacks HTTPFS support | ✓ Good |
| Merge at data ingestion in GenerateButton | Single integration point; store and mesh layers unchanged | ✓ Good |
| Promise.allSettled for parallel fetch | Overture failures degrade silently to OSM-only; no added latency | ✓ Good |
| AABB IoU at 0.3 threshold for dedup | Polygon-level overlap detection; handles L-shaped and courtyard buildings | ✓ Good |
| Winding normalization in parser | Parser is the data boundary; downstream code trusts consistent CCW outer rings | ✓ Good |
| Fixed zoom 14 for Overture fetch | Archive maxzoom; only level with complete building properties | ✓ Good |

---
## Current Milestone: v1.2 Responsive UI

**Goal:** End-to-end responsive redesign so MapMaker thrives on mobile phones, tablets, and desktops — not just works.

**Target features:**
- Three-tier responsive layout (mobile / tablet / desktop) with proper breakpoints
- Mobile bottom sheet with peek/half/full snap heights
- Full-screen focus views on mobile with smooth toggle
- Touch-optimized controls and spacing
- Persistent contextual sidebar on tablet/desktop
- Transitions, animations, and micro-interactions throughout

---
*Last updated: 2026-02-28 after v1.2 milestone start*
