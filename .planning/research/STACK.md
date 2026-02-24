# Stack Research

**Domain:** Map-to-3D-printable-STL web application
**Researched:** 2026-02-23
**Confidence:** MEDIUM-HIGH (core stack HIGH; elevation tile sourcing MEDIUM due to API dependencies)

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| React | 19.2.x | UI framework | Latest stable (19.2.4 released Oct 2025). Concurrent rendering handles the expensive mesh generation without blocking the UI. No SSR needed; pure SPA fits this use case. |
| TypeScript | 5.9.x | Type safety | Current stable. Geographic coordinate arithmetic, elevation decoding, and mesh math are all index-off-by-one landmines — strict types prevent them. |
| Vite | 7.x | Build tool / dev server | v7.3.1 is current stable. WASM-friendly (needed if mesh generation moves to WASM), fast HMR for iterating on 3D preview, first-class TypeScript support out of the box. |
| MapLibre GL JS | 5.18.x | Interactive 2D map | Current stable (v5.18.0, Feb 2026). Open-source fork of Mapbox GL JS maintained by the OSS community. Free — no API key required for the map renderer itself. Has `BoxZoomHandler` for drag-to-select bounding boxes, `LngLatBounds` for coordinate math, and supports custom draw layers for the selection rectangle. Choose MapLibre over Mapbox GL JS because there is no per-tile billing and no proprietary SDK terms. |
| Three.js | 0.183.x | 3D WebGL preview and mesh | Current stable (v0.183.1, Feb 2026). Industry standard for browser 3D. Built-in `OrbitControls` addon handles orbit/zoom/pan. `BufferGeometry` is the correct API for custom terrain/building mesh construction. Built-in `STLExporter` addon exports binary STL directly in the browser. WebGPU renderer available as opt-in for future upgrade. |
| Zustand | 5.0.x | Global state | Lightweight (2 KB), no provider boilerplate, hook-based. Manages the shared state that both the map pane and the 3D pane need to react to (bounding box coordinates, feature toggles, terrain exaggeration, dimension settings). Redux is overkill here; Context API re-renders too broadly across 3D canvas. |
| Tailwind CSS | 4.x | Styling | v4.0+ released early 2025. Zero config, Vite plugin-based setup (`@tailwindcss/vite`). Handles the side-by-side responsive layout cleanly with flex/grid utilities. No runtime overhead. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `three/addons/controls/OrbitControls` | bundled with Three.js | Orbit / zoom / pan for 3D preview | Always — included in Three.js package, import from `three/addons/controls/OrbitControls.js` |
| `three/addons/exporters/STLExporter` | bundled with Three.js | Binary STL export from BufferGeometry | Always — export step. Binary STL is more compact than ASCII; use `{ binary: true }` |
| `@mapbox/martini` | 0.2.x | RTIN terrain mesh generation from elevation grid | Use to convert a 2D elevation height array into an optimized triangle mesh. Produces level-of-detail meshes (tolerated error in meters). Last released at v0.2.0; low maintenance activity but algorithm is stable and the problem is solved. |
| `geotiff` | 3.0.x | Decode GeoTIFF elevation rasters in the browser | Use when fetching elevation from OpenTopography or similar services that return GeoTIFF. v3.0.3 published Feb 2026; actively maintained. WebWorker pool support for decompression performance. |
| `maplibre-draw` / custom canvas overlay | — | Draw draggable bounding box on map | MapLibre's `BoxZoomHandler` handles shift-drag but you need a custom persistent rectangle. Use a MapLibre `GeoJSON` source + `fill` + `line` layer for a persistent selection rectangle with draggable corner handles. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `typescript` 5.9.x | Type checking | Set `strict: true`, `noUncheckedIndexedAccess: true` — elevation arrays out-of-bounds are a real bug source |
| `eslint` + `@typescript-eslint` | Lint | Standard Vite template includes this; keep enabled |
| `prettier` | Format | Add `prettier-plugin-tailwindcss` for consistent class ordering |
| `vite-plugin-wasm` | WASM support | Optional: if mesh generation is later moved to WASM (e.g., via Rust/wasm-pack), this plugin makes it straightforward to add |

## Installation

```bash
# Core
npm install react react-dom maplibre-gl three zustand

# Supporting geo/mesh libraries
npm install @mapbox/martini geotiff

# Dev dependencies
npm install -D vite @vitejs/plugin-react typescript tailwindcss @tailwindcss/vite @types/react @types/react-dom @types/three eslint prettier prettier-plugin-tailwindcss
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| MapLibre GL JS | Mapbox GL JS | Only if you need Mapbox-specific features (e.g., Mapbox Geocoding API) AND are okay with token billing and SDK terms. For this project: no benefit, adds cost and lock-in. |
| MapLibre GL JS | Leaflet | Leaflet is fine for tile overlays but lacks native WebGL vector tile rendering. Side-by-side layout with 3D Three.js canvas risks performance issues since Leaflet uses DOM+Canvas2D. Choose MapLibre for consistency and performance. |
| Three.js | Babylon.js | Babylon.js is a heavier full game engine. Three.js is lighter, has the ecosystem (`STLExporter`, `OrbitControls`), and has broader community examples for terrain mesh generation. |
| Three.js | React Three Fiber (R3F) | R3F is a React renderer for Three.js. Adds convenience but also adds an abstraction layer and reconciler overhead on top of expensive mesh operations. For this app, imperative Three.js control is better — mesh updates happen in response to form changes, not every render frame. |
| Zustand | Redux Toolkit | Redux is 10x the boilerplate for the same outcome. This app's state fits comfortably in a single Zustand store. |
| Zustand | React Context + useState | Context re-renders all consumers on any state change. The 3D canvas and the map are both heavy — you need precise, selective re-renders. Zustand's selectors handle this cleanly. |
| @mapbox/martini | Custom heightfield triangulation | Martini's RTIN algorithm produces optimized adaptive meshes (fewer triangles where terrain is flat, more where it's complex). Writing this from scratch is weeks of geometry math. Use Martini. |
| geotiff | Decode elevation tiles via Canvas pixel hack | Mapbox/MapTiler terrain-RGB tiles encode elevation in RGB pixels that can be read via a hidden `<canvas>`. This works but is fragile, depends on a paid tile provider, and loses precision vs. raw GeoTIFF. Use GeoTIFF from OpenTopography for precision and free access. |
| Tailwind CSS v4 | CSS Modules | Both are fine. Tailwind v4 wins because it has zero-config auto content detection, a Vite plugin (no PostCSS config file needed), and is the dominant pattern in 2026 React projects. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `three-geo` (npm: `three-geo`) | Last published 3 years ago (2022/2023). Depends on Mapbox API for terrain tiles — introduces paid tile dependency. Unmaintained. | Manual elevation fetch via OpenTopography GeoTIFF + `@mapbox/martini` for mesh generation |
| Create React App (CRA) | Deprecated, archived by Meta. Extremely slow builds, no Vite integration. | Vite |
| `Leaflet` for the 2D map | Leaflet renders in Canvas2D/DOM. Running Two.js/Three.js canvas alongside Leaflet on a split-view layout has context conflicts and performance issues. | MapLibre GL JS (WebGL-based, same GPU pipeline) |
| Cesium.js | Designed for globe-scale geospatial apps. Extremely heavy (hundreds of MB), complex API, overkill for a single bounding box at print scale. | Three.js |
| OpenJSCAD / JSCAD | Built for parametric CAD modeling (CSG operations, primitives). Not designed for geographic mesh generation from elevation grids. Steep learning curve for terrain use case. | Three.js + `@mapbox/martini` + `STLExporter` |
| Mapbox GL JS (proprietary) | API key required, tile billing applies at scale, restrictive SDK terms. MapLibre GL JS is the free, maintained fork with identical API. | MapLibre GL JS |
| Next.js | This app is a pure client-side tool. No SEO, no auth, no server rendering needed. Next.js adds SSR complexity with no benefit. Three.js WASM and WebWorkers are simpler in a pure Vite SPA. | Vite + React |

## Stack Patterns by Variant

**If terrain only (no buildings, no roads):**
- Simplest path: OpenTopography GeoTIFF → `geotiff` → raw elevation grid → `@mapbox/martini` → Three.js BufferGeometry → STLExporter
- No Overpass API needed; considerably simpler architecture

**If buildings and roads are required (full feature set):**
- Add Overpass API calls (query OSM `building` ways + `highway` ways within bounding box) in addition to elevation
- Parse GeoJSON-like OverpassJSON response, compute building floor heights from `building:levels` tags, extrude footprint polygons to height
- Roads: convert polylines to extruded mesh strips (recessed/raised/flat depending on user setting)
- Merge all geometry into a single Three.js `BufferGeometry` before STL export (required — STL is one solid)

**If client-side performance is a bottleneck:**
- Move elevation decode + Martini mesh generation to a WebWorker (Three.js geometry can be built off-thread then transferred via `SharedArrayBuffer` or `Transferable`)
- Add `vite-plugin-wasm` and compile Martini equivalent in Rust/WASM for larger grids

## Elevation Data Source Decision

This is the most significant external dependency. Three options:

| Source | Format | Free | Resolution | API Key | Rate Limit |
|--------|--------|------|------------|---------|------------|
| **OpenTopography (SRTM GL1)** | GeoTIFF | Yes | 30m (~1 arcsec) | Free key (300 req/day academic, 100 req/day others) | 100–300 req/day |
| **Open Topo Data (self-hosted or public)** | JSON point data | Yes (public instance) | 30m SRTM | None | 1 req/sec, 1000 req/day, 100 loc/req |
| **MapTiler Terrain RGB tiles** | PNG tiles (RGB-encoded) | Free tier | ~30m (SRTM derived) | Required (free) | Pauses on quota exhaust |

**Recommendation:** Start with MapTiler terrain-RGB tiles (free API key, fast tile delivery, good DX via standard tile URL pattern) for MVP. The RGB decode formula (`elevation = -10000 + (R*256*256 + G*256 + B) * 0.1`) is straightforward via a hidden canvas. Switch to OpenTopography GeoTIFF for higher precision or offline capability if needed.

Note: Mapbox terrain-RGB works identically but requires a Mapbox access token with billing risk at scale. MapTiler's free tier pauses service rather than charging — safer for a personal project.

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `react@19.x` | `zustand@5.x` | Zustand v5 dropped support for React < 18; React 19 fully supported |
| `three@0.183.x` | TypeScript `@types/three` | `@types/three` is bundled with three package itself as of recent versions; no separate `@types/three` install needed |
| `maplibre-gl@5.x` | React 19 | MapLibre is framework-agnostic; use via `useEffect` + `useRef` in React components |
| `vite@7.x` | `@vitejs/plugin-react@4.x` | Vite 7 requires the Vite React plugin; verify plugin version compatibility via `npm create vite@latest` template |
| `tailwindcss@4.x` | `vite@7.x` | Use `@tailwindcss/vite` plugin (NOT PostCSS config) — the v3 PostCSS-based setup does not work with v4 |
| `geotiff@3.x` | All modern browsers | v3.0 has breaking API changes from v2.x — `fileDirectory` is replaced with `ImageFileDirectory` class |

## Sources

- [MapLibre GL JS official docs](https://maplibre.org/maplibre-gl-js/docs/) — bounding box API, BoxZoomHandler, LngLatBounds (HIGH confidence)
- [MapLibre GL JS npm releases](https://github.com/maplibre/maplibre-gl-js/releases) — v5.18.0 current as of Feb 2026 (HIGH confidence)
- [Three.js npm](https://www.npmjs.com/package/three) — v0.183.1 current (HIGH confidence)
- [Three.js OrbitControls docs](https://threejs.org/docs/pages/OrbitControls.html) — import path and capabilities (HIGH confidence)
- [Three.js STLExporter docs](https://threejs.org/docs/pages/STLExporter.html) — binary export from BufferGeometry (HIGH confidence)
- [React versions](https://react.dev/versions) — v19.2.4 current (HIGH confidence)
- [Vite releases](https://vite.dev/releases) — v7.3.1 current (HIGH confidence)
- [Tailwind CSS v4.0 announcement](https://tailwindcss.com/blog/tailwindcss-v4) — v4 Vite plugin setup (HIGH confidence)
- [Zustand v5 announcement](https://pmnd.rs/blog/announcing-zustand-v5) — v5.0.x current, React 18+ required (HIGH confidence)
- [geotiff npm](https://www.npmjs.com/package/geotiff) — v3.0.3 current (MEDIUM confidence — single source)
- [mapbox/martini GitHub](https://github.com/mapbox/martini) — v0.2.0, minimal maintenance activity (MEDIUM confidence)
- [OpenTopography API docs](https://opentopography.org/developers) — free SRTM GeoTIFF, rate limits (MEDIUM confidence)
- [MapTiler elevation API](https://docs.maptiler.com/cloud/api/elevation/) — terrain RGB tiles free tier (MEDIUM confidence)
- [Overpass API wiki](https://wiki.openstreetmap.org/wiki/Overpass_API) — OSM building/road query, rate limits (HIGH confidence)
- [three-geo npm](https://www.npmjs.com/package/three-geo/v/1.4.4) — last published 3 years ago, avoid (HIGH confidence — confirmed unmaintained)

---
*Stack research for: Map-to-3D-printable-STL web application*
*Researched: 2026-02-23*
