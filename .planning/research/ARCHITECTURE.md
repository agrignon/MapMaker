# Architecture Research

**Domain:** Map-to-3D-printable-STL web application
**Researched:** 2026-02-23
**Confidence:** MEDIUM (based on analysis of existing tools: TerraSTL, TouchTerrain, map2stl, Streets GL, mapa library — verified against official docs where available)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Browser (Client)                            │
├──────────────────────────────┬──────────────────────────────────────┤
│        UI Layer              │         Processing Layer             │
│  ┌──────────┐  ┌──────────┐  │  ┌──────────────┐  ┌─────────────┐  │
│  │  2D Map  │  │  3D      │  │  │  Geo Data    │  │   Mesh      │  │
│  │ (Select) │  │ Preview  │  │  │  Fetcher     │  │  Generator  │  │
│  └────┬─────┘  └────┬─────┘  │  └──────┬───────┘  └──────┬──────┘  │
│       │             │        │         │                  │        │
│  ┌────┴─────────────┴──────┐ │  ┌──────┴───────────────── ┴──────┐  │
│  │     App State (Zustand) │ │  │        Web Worker Thread       │  │
│  │  bbox, features, dims   │◄├──┤  (elevation decode + meshing)  │  │
│  └─────────────────────────┘ │  └────────────────────────────────┘  │
├──────────────────────────────┴──────────────────────────────────────┤
│                        API Proxy Layer (optional)                   │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Thin server (Next.js API routes / Nuxt server routes)       │   │
│  │  Purpose: CORS bypass for external elevation APIs only        │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
         │                          │
         ▼                          ▼
┌─────────────────┐      ┌────────────────────────┐
│  Overpass API   │      │  Elevation Tile Source  │
│  (OSM buildings,│      │  (Mapbox Terrain-DEM    │
│   roads)        │      │   or MapTiler Terrain)  │
└─────────────────┘      └────────────────────────┘
```

**Key decision: predominantly client-side.** Evidence from TerraSTL shows that a thin server proxy handles external API CORS issues, but actual mesh generation happens in the browser. TouchTerrain's server-side approach is a Python/GDAL pattern that suits a CLI tool but adds infrastructure complexity for a web-first product. map2stl.com's hybrid model (server generates script, client runs it in browser) confirms that heavy computation can be offloaded to the client.

---

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| 2D Map Interface | Location search, bounding box selection, feature toggles | MapLibre GL JS or Leaflet with draw plugin |
| App State | Single source of truth: bbox, enabled features, exaggeration, dimensions | Zustand store |
| Geo Data Fetcher | Fetch OSM buildings/roads via Overpass API, convert to GeoJSON | Browser fetch + osmtogeojson |
| Elevation Fetcher | Retrieve terrain height grid for bounding box | Fetch terrain-RGB tiles, decode pixels to meters |
| Coordinate Transformer | Convert WGS84 lat/lon to local XY meters for mesh | Haversine/projection math, or proj4js |
| Mesh Generator | Build Three.js BufferGeometry from elevation + features | Web Worker, runs off main thread |
| 3D Preview | Render live WebGL preview of the in-progress model | Three.js scene with orbit controls |
| STL Serializer | Export final geometry to binary STL | Three.js STLExporter addon |
| API Proxy | Forward elevation tile requests to bypass CORS | Next.js / Nuxt API route, very thin |

---

## Recommended Project Structure

```
src/
├── components/              # React UI components (display only)
│   ├── MapPanel.tsx         # Leaflet/MapLibre map, bbox draw tool
│   ├── PreviewPanel.tsx     # Three.js canvas, orbit controls
│   ├── ControlsSidebar.tsx  # Feature toggles, sliders, export button
│   └── SearchBar.tsx        # Geocoder input
│
├── store/                   # App state
│   └── useMapMakerStore.ts  # Zustand store: bbox, features, settings
│
├── geo/                     # Geographic data pipeline
│   ├── overpass.ts          # Overpass QL query builder + fetcher
│   ├── osmToGeojson.ts      # Thin wrapper around osmtogeojson
│   ├── elevation.ts         # Fetch terrain-RGB tiles, decode height grid
│   └── project.ts           # WGS84 → local meter XY coordinate transform
│
├── mesh/                    # Geometry construction (runs in Web Worker)
│   ├── worker.ts            # Web Worker entry point, receives geo data
│   ├── terrain.ts           # Heightmap → THREE.PlaneGeometry mesh
│   ├── buildings.ts         # GeoJSON footprints → extruded 3D geometry
│   ├── roads.ts             # GeoJSON lines → recessed/raised road mesh
│   ├── basePlate.ts         # Generate solid bottom base
│   └── merge.ts             # Merge all geometry into single BufferGeometry
│
├── export/                  # Output generation
│   └── stlExporter.ts       # Wrap THREE.js STLExporter, trigger download
│
├── preview/                 # Three.js scene setup
│   ├── scene.ts             # Camera, lights, renderer setup
│   └── usePreview.ts        # React hook bridging store → Three.js scene
│
└── api/                     # Server-side proxy (if needed)
    └── elevation/route.ts   # Next.js API route: forward elevation requests
```

### Structure Rationale

- **geo/**: All data fetching is isolated here. Easy to swap elevation sources (OpenTopoData → Mapbox → MapTiler) without touching mesh code.
- **mesh/**: Runs in a Web Worker. Contains zero DOM or React references. Receives plain data, returns serializable geometry (Float32Array buffers).
- **store/**: Zustand is the single data bus. UI components read from store; geo/mesh pipeline reads bbox and settings from store to start work.
- **preview/**: Three.js scene management is isolated from React rendering cycle. Uses imperative refs, not JSX.

---

## Architectural Patterns

### Pattern 1: Geo Data Pipeline — Fetch → Decode → Project → Build

**What:** All geographic data flows through a sequential pipeline before hitting the mesh generator. Each stage has a clear input/output contract.

**When to use:** Always. This ordering is mandatory — you cannot build meshes before you have projected coordinates.

**Trade-offs:** Sequential means latency adds up. Mitigation: run elevation fetch and OSM fetch in parallel (they are independent).

**Example:**
```typescript
// Parallel fetch, sequential project+build
const [elevationGrid, osmData] = await Promise.all([
  fetchElevationGrid(bbox),       // terrain-RGB tiles → height[][]]
  fetchOSMFeatures(bbox, features) // Overpass → GeoJSON
]);

// Project to local meter space (runs synchronously, fast)
const projected = projectToLocal(bbox, osmData);

// Send to Web Worker for mesh generation
worker.postMessage({ elevationGrid, projected, settings });
```

**Confidence:** MEDIUM — pattern confirmed across multiple tools (TerraSTL, mapa, map2stl)

---

### Pattern 2: Web Worker Isolation for Mesh Generation

**What:** Move all geometry construction to a dedicated Web Worker. The main thread only receives finished `Float32Array` position/normal/index buffers via `transferable objects`.

**When to use:** Always for this domain. Mesh generation for a dense city block can involve hundreds of thousands of triangles. Blocking the main thread produces an unresponsive UI.

**Trade-offs:** Cannot use Three.js scene objects directly in a Worker (no DOM). Return raw typed arrays; reconstruct `BufferGeometry` on the main thread.

**Example:**
```typescript
// worker.ts — no Three.js, pure math
self.onmessage = ({ data }) => {
  const positions = buildTerrainMesh(data.elevationGrid, data.settings);
  const buildings = buildBuildingMeshes(data.projected.buildings, data.settings);
  const merged = mergeBuffers([positions, buildings]);
  // Transfer ownership — zero-copy
  self.postMessage({ positions: merged.positions }, [merged.positions.buffer]);
};

// main thread — reconstruct geometry
worker.onmessage = ({ data }) => {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  scene.add(new THREE.Mesh(geo, material));
};
```

**Confidence:** MEDIUM — confirmed by three.js community discussion, Evil Martians blog on OffscreenCanvas + Workers

---

### Pattern 3: Coordinate Origin Reset (Local Meter Space)

**What:** Convert all WGS84 lat/lon coordinates to a local flat-earth meter space centered on the bounding box center before any mesh math. Do this once, early in the pipeline.

**When to use:** Always. Raw lat/lon values are degrees; direct use in 3D mesh coordinates produces wildly distorted geometry.

**Trade-offs:** Loses global coordinate frame, but that is irrelevant for a print artifact.

**Example:**
```typescript
function projectToLocal(bbox: BBox, lat: number, lon: number): [number, number] {
  // Haversine approximate: accurate enough for areas < 100km
  const centerLat = (bbox.minLat + bbox.maxLat) / 2;
  const centerLon = (bbox.minLon + bbox.maxLon) / 2;
  const metersPerDegLat = 111320;
  const metersPerDegLon = 111320 * Math.cos(centerLat * Math.PI / 180);
  const x = (lon - centerLon) * metersPerDegLon;
  const y = (lat - centerLat) * metersPerDegLat;
  return [x, y];
}
```

**Confidence:** HIGH — standard GIS practice, confirmed in OSM 3D renderer implementations

---

### Pattern 4: Elevation from Terrain-RGB Tiles (Decode in Browser)

**What:** Fetch PNG tiles from a terrain-RGB source (MapTiler, or self-hostable SRTM tiles). Decode RGB pixel values to height in meters using: `height = -10000 + ((R * 256 * 256 + G * 256 + B) * 0.1)`.

**When to use:** Preferred over point-query APIs (OpenTopoData) because tiles deliver a grid of elevation values in one request rather than N point queries.

**Trade-offs:** Requires canvas context to read pixel data. Rate limited by tile server. Mapbox Terrain-DEM requires Mapbox SDK; MapTiler terrain-RGB has a free tier and no SDK restriction.

**Example:**
```typescript
async function decodeElevationTile(tileUrl: string): Promise<Float32Array> {
  const img = await loadImage(tileUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.width; canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, img.width, img.height);
  const heights = new Float32Array(img.width * img.height);
  for (let i = 0; i < heights.length; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    heights[i] = -10000 + ((r * 65536 + g * 256 + b) * 0.1);
  }
  return heights;
}
```

**Confidence:** HIGH — formula from Mapbox official docs; decode approach confirmed by multiple web sources

---

### Pattern 5: OSM Buildings via Overpass API + osmtogeojson

**What:** Query Overpass API with a bounding box to retrieve building ways and relations. Convert OSM XML/JSON to GeoJSON with osmtogeojson. Extract `building:levels`, `height`, `min_height`, `roof:shape` for mesh extrusion.

**When to use:** Always. Overpass is the standard access pattern for OSM feature extraction.

**Trade-offs:** Overpass public servers can be slow under load. For production: self-host or use Overpass-API paid plans. For the initial personal project, public Overpass is fine.

**Example Overpass query:**
```
[out:json][bbox:{{minLat}},{{minLon}},{{maxLat}},{{maxLon}}];
(
  way["building"];
  way["building:part"];
  way["highway"];
  relation["building"]["type"="multipolygon"];
);
out geom;
```

**Confidence:** HIGH — documented on OSM Wiki Overpass API page; osmtogeojson is the standard conversion library

---

## Data Flow

### Main Pipeline: Bounding Box to STL

```
User draws bbox on 2D map
        |
        v
App State updated (bbox, features, settings)
        |
        v
[Parallel fetch]
  Elevation Tiles ──────────────────────────┐
  (terrain-RGB, via API proxy if CORS issue) │
                                             ├──► Web Worker
  OSM Features ─────────────────────────────┘
  (Overpass API: buildings, roads)
        |
        v (in Web Worker)
Project lat/lon → local XY meters
        |
        v
Build terrain mesh (heightmap → PlaneGeometry positions)
        |
        v
Build building meshes (footprints → extrusions per roof type)
        |
        v
Build road meshes (centerlines → offset quads, recessed/raised/flat)
        |
        v
Generate base plate (flat bottom box at min elevation)
        |
        v
Merge all BufferGeometry → single BufferGeometry
        |
        v (back to main thread)
Three.js scene updated → 3D Preview renders
        |
        v (on user click "Export")
STLExporter → binary STL Blob → browser download
```

### State Management Flow

```
[Zustand Store]
  bbox: BBox
  features: { terrain, buildings, roads }
  settings: { exaggeration, roadStyle, dimensions, units }
  meshStatus: 'idle' | 'fetching' | 'building' | 'ready' | 'error'
  geometry: BufferGeometry | null

Store changes → trigger pipeline re-run (debounced ~300ms)
Pipeline completes → geometry written to store
3D Preview subscribes to geometry → re-renders
```

### Key Data Flow Directions

1. **User input (2D map) → store → pipeline → 3D preview**: All changes flow one way through the store. The 2D map never directly talks to the 3D preview.
2. **Elevation API → browser → Web Worker**: Tile fetch happens on main thread (needs canvas for decode), then raw height array is transferred to Worker.
3. **Web Worker → BufferGeometry → Three.js scene**: Worker returns typed arrays; main thread reconstructs geometry and attaches to scene.
4. **Three.js scene → STLExporter → download**: Export reads the same geometry already in the preview; no re-generation needed.

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Personal project (1 user) | Static hosting (Vercel/Netlify), API proxy as serverless function, public Overpass |
| Public beta (< 1K users/day) | Same stack; rate limit proxy; cache OSM responses by bbox hash |
| Public (10K+ users/day) | Self-host Overpass mirror; cache elevation tiles via CDN edge; consider server-side STL generation for fallback on slow devices |
| Scale beyond that | Not required per project brief; architecture supports it by extracting mesh generation to dedicated worker service |

### Scaling Priorities

1. **First bottleneck:** Overpass API rate limits. Public servers allow ~10,000 req/day. At scale, deploy a self-hosted Overpass instance or cache responses.
2. **Second bottleneck:** Elevation tile delivery. Cache decoded height arrays in sessionStorage or IndexedDB keyed by tile URL — avoids repeated CORS proxy fetches for the same area.

---

## Anti-Patterns

### Anti-Pattern 1: Run Mesh Generation on the Main Thread

**What people do:** Call `buildMesh()` synchronously in a React event handler or `useEffect`.

**Why it's wrong:** For a dense city block, this can take 500ms–3s of pure CPU work. The browser UI freezes — no orbit controls, no progress indicator, page appears hung.

**Do this instead:** Always offload to a Web Worker. Send the data via `postMessage` with transferable buffers. Show a loading state while the worker runs.

---

### Anti-Pattern 2: Use Raw Lat/Lon as 3D Coordinates

**What people do:** Use `latitude` as the Y axis and `longitude` as the X axis directly in Three.js.

**Why it's wrong:** One degree of latitude ≈ 111 km. One degree of longitude varies by latitude. The aspect ratio is wrong, scale is in degrees not meters, and projection distortion is severe near the poles.

**Do this instead:** Project to local flat-earth meters at pipeline start. Pick the bbox center as origin (0,0). All downstream mesh code works in meters.

---

### Anti-Pattern 3: Rebuild Geometry on Every Feature Toggle

**What people do:** Re-fetch all data and re-run the full pipeline whenever a checkbox changes (e.g., toggle buildings off).

**Why it's wrong:** Full pipeline can take 2–5s. Toggling buildings should be near-instant.

**Do this instead:** Cache each layer's geometry separately (terrain mesh, buildings mesh, roads mesh). Toggling a feature shows/hides the Three.js object; only re-run the pipeline when bbox or settings that affect the mesh shape change (not visibility).

---

### Anti-Pattern 4: Generate Non-Manifold Meshes

**What people do:** Build terrain and buildings as separate open surfaces without capping them or adding a base plate.

**Why it's wrong:** STL slicers require watertight (manifold) meshes. An open terrain surface with no bottom will fail to slice or produce hollow models that won't print reliably.

**Do this instead:** Always close geometry. Terrain mesh needs a bottom face and side walls. Building extrusions must have a closed top (roof) and bottom. The base plate provides a solid unified floor. Optionally, use the `manifold-3d` WASM library to validate and repair before export.

---

### Anti-Pattern 5: Point-Query Elevation API for Grid Sampling

**What people do:** Query OpenTopoData for every grid point individually (e.g., a 100x100 grid = 10,000 requests).

**Why it's wrong:** OpenTopoData free API limits to 100 points per request and 1,000 requests per day. A single model generation exhausts the day's quota.

**Do this instead:** Use terrain-RGB tile fetching. A single 256x256 tile delivers 65,536 elevation points in one image request. Calculate which tiles cover the bbox and fetch only those.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Overpass API (OSM) | HTTP GET to `overpass-api.de/api/interpreter`, Overpass QL query with bbox | CORS: public Overpass allows browser requests; add proxy if rate-limited |
| MapTiler Terrain-RGB | Fetch PNG tiles at `api.maptiler.com/tiles/terrain-rgb/{z}/{x}/{y}.png?key=...` | Free tier available; decode RGB in canvas; no SDK lock-in like Mapbox |
| Mapbox Terrain-DEM | Only available via Mapbox SDK (GL JS) — not as standalone tile fetch | Avoid direct dependency; use MapTiler as the terrain tile source instead |
| Nominatim (geocoding) | HTTP GET `nominatim.openstreetmap.org/search?q=...&format=json` | Free; required User-Agent header; rate limit: 1 req/sec |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| React UI ↔ Zustand Store | Direct Zustand hooks (`useMapMakerStore`) | UI reads/writes store; no prop drilling |
| Store ↔ Pipeline | Zustand `subscribe` triggers pipeline when bbox/settings change | Debounce 300ms to avoid thrashing on slider drag |
| Main thread ↔ Web Worker | `postMessage` / `onmessage` with Transferable ArrayBuffers | Use Comlink library to simplify Worker RPC boilerplate |
| Web Worker ↔ Three.js scene | Worker returns `Float32Array` buffers; main reconstructs `BufferGeometry` | Worker cannot touch DOM or Three.js objects directly |
| Three.js scene ↔ STLExporter | Direct function call: `exporter.parse(scene)` | No async needed; large scenes may stall — export from Worker if needed |

---

## Build Order Implications for Roadmap

The component dependency graph dictates a natural build sequence:

1. **2D Map Interface first** — Users cannot define a bbox without it. All other components depend on having a bbox.
2. **Coordinate projection next** — Required by every downstream mesh component. Build and test this unit in isolation with known coordinates.
3. **Elevation pipeline** — Can be built and tested without OSM data. Terrain-only model validates the full pipeline end to end.
4. **STL export** — Build once terrain mesh exists; validates the export mechanism before buildings/roads add complexity.
5. **OSM buildings pipeline** — Depends on working coordinate projection and a live 3D preview to validate output.
6. **Roads pipeline** — Roads depend on OSM fetch infrastructure (shared with buildings) but have their own geometry logic.
7. **Settings (exaggeration, road style, dimensions, units)** — Layer on top of working geometry, parameterize existing mesh code.
8. **Polish (loading states, error handling, UX)** — Last, once the full pipeline is proven.

**Critical path:** 2D bbox selection → elevation fetch → terrain mesh → STL export → 3D preview. Everything else is additive.

---

## Sources

- TerraSTL architecture (Nuxt/Vue + Three.js + OpenTopoData): https://github.com/aligundogdu/TerraStl
- Streets GL rendering pipeline (WebGL2, OSM vector tiles, TypeScript): https://github.com/StrandedKitty/streets-gl
- mapa library (Python elevation pipeline, ALOS DEM, STL): https://github.com/fgebhart/mapa
- TouchTerrain server-side Python/GDAL/Google Earth Engine approach: https://github.com/ChHarding/TouchTerrain_for_CAGEO
- map2stl hybrid model (Ruby server + OpenJSCAD in browser): https://github.com/davr/map2stl
- Mapbox terrain-RGB decode formula (official docs): https://docs.mapbox.com/data/tilesets/reference/mapbox-terrain-dem-v1/
- Three.js STLExporter (official): https://threejs.org/docs/pages/STLExporter.html
- Web Workers for Three.js mesh generation: https://evilmartians.com/chronicles/faster-webgl-three-js-3d-graphics-with-offscreencanvas-and-web-workers
- manifold-3d WASM mesh repair library: https://github.com/elalish/manifold
- OSM Simple 3D Buildings schema: https://wiki.openstreetmap.org/wiki/Simple_3D_Buildings
- Overpass API bounding box queries: https://wiki.openstreetmap.org/wiki/Overpass_API
- OpenTopoData API (point query, rate limits): https://www.opentopodata.org/api/
- MapTiler terrain tiles free tier: https://www.maptiler.com/terrain/

---
*Architecture research for: Map-to-3D-printable-STL web application (MapMaker)*
*Researched: 2026-02-23*
