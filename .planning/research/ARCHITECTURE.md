# Architecture Research

**Domain:** Map-to-3D-printable-STL web application (MapMaker v1.0 milestone — roads, water, vegetation, smoothing, controls, Worker offload)
**Researched:** 2026-02-24
**Confidence:** HIGH for integration patterns (based on direct codebase inspection); MEDIUM for new feature geometry specifics

---

## Context: Existing Architecture (Phases 1-3 Delivered)

This document is **milestone-scoped** — it maps new features onto the proven architecture rather than redesigning it. The existing system is well-structured and all new features slot cleanly into established patterns.

### Delivered System Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                       Browser (Client-Side SPA)                    │
│                                                                    │
│  ┌──────────────┐  ┌───────────────────────────────────────────┐   │
│  │  MapView     │  │              PreviewCanvas                │   │
│  │  (MapLibre   │  │  ┌──────────┐  ┌───────────┐             │   │
│  │   + Terradraw│  │  │Terrain   │  │ Building  │  [new →]    │   │
│  │   bbox)      │  │  │Mesh      │  │ Mesh      │  RoadMesh   │   │
│  └──────┬───────┘  │  └──────────┘  └───────────┘  WaterMesh  │   │
│         │          │     @react-three/fiber Canvas   VegetMesh │   │
│         │          └──────────────────────────────────────────┘   │
│         │                                                          │
│  ┌──────▼───────────────────────────────────────────────────────┐  │
│  │              Zustand mapStore (single source of truth)        │  │
│  │  bbox · utmZone · elevationData · buildingFeatures           │  │
│  │  exaggeration · showPreview · targetWidthMM · targetDepthMM  │  │
│  │  [new →] roadFeatures · waterFeatures · vegetationFeatures   │  │
│  │  [new →] roadStyle · layerToggles · smoothingLevel · units   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    lib/ (pure pipeline functions)             │  │
│  │  elevation/  buildings/  mesh/  export/                       │  │
│  │  [new →] roads/  water/  vegetation/  worker/                 │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
         │                                │
         ▼                                ▼
┌─────────────────┐           ┌───────────────────────┐
│  Overpass API   │           │  MapTiler Terrain-RGB  │
│  (buildings,    │           │  (elevation tiles,     │
│   roads, water, │           │   free tier)           │
│   vegetation)   │           └───────────────────────┘
└─────────────────┘
```

### Established Patterns (Must Not Break)

The codebase uses four patterns consistently. All new features must follow them:

1. **Store-first data flow** — OSM features live in Zustand; mesh components read from the store; no component-to-component prop drilling.
2. **Pipeline lib function** — Each feature layer has its own `lib/<feature>/` directory with pure TypeScript functions: `overpass.ts` (query), `parse.ts` (OSM → features), `merge.ts` (features → `THREE.BufferGeometry`).
3. **Mesh component pattern** — Each 3D layer is a React component (`XxxMesh.tsx`) inside `components/Preview/`. It subscribes to store, calls the lib merge function in `useEffect`, holds geometry in `useRef`, disposes on unmount.
4. **zScale contract** — All mesh layers share the same `zScale` formula (`horizontalScale * exaggeration` with minHeightMM floor). Breaking this misaligns layers.

---

## New Feature Integration Points

### Roads (ROAD-01, ROAD-02, ROAD-03)

**OSM Source:** Overpass QL — `way["highway"]` within bbox. Relevant tags: `highway` value (motorway, trunk, primary, secondary, tertiary, residential, service, footway, path), `name`, `lanes`.

**New Overpass query** (extend existing buildings query or add a separate fetch):
```
[out:json][timeout:60][bbox:${s},${w},${n},${e}];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|service|living_street)$"];
);
out geom;
```
Separate from buildings fetch — roads and buildings complete independently. Start both in parallel from `GenerateButton.tsx`.

**Road Geometry Approach:**

Roads are linestrings. Converting a centerline polyline to a ribbon mesh requires:
1. For each segment, compute a perpendicular offset vector scaled by road width.
2. Emit a quad (two triangles) for each segment pair.
3. Sample terrain elevation at each vertex to pin the road to the terrain surface.

Road width by OSM highway type (in real-world meters, then scale via `horizontalScale`):
| Highway type | Width (m) |
|---|---|
| motorway | 7.0 |
| trunk, primary | 6.0 |
| secondary | 5.0 |
| tertiary | 4.0 |
| residential | 3.5 |
| service, living_street | 2.5 |

**Road styles** (ROAD-02):
- **Recessed:** Road surface sits below terrain. The ribbon quads start at `terrainZ - recessDepthMM` (3mm default), creating a channel. Add inner walls as quads.
- **Raised:** Road surface sits above terrain at `terrainZ + raiseHeightMM` (2mm default). The ribbon quads start at terrain level, adding a raised plateau.
- **Flat:** Road surface sits at terrain level (just ribbon quads at terrainZ). Used for painting workflows.

**New files:**
```
src/lib/roads/
├── overpass.ts       — fetchRoadData(bbox) → raw Overpass JSON
├── parse.ts          — parseRoadFeatures(raw) → RoadFeature[]
├── geometry.ts       — buildRoadMesh(features, params) → THREE.BufferGeometry
└── types.ts          — RoadFeature, RoadGeometryParams
```

**New component:** `src/components/Preview/RoadMesh.tsx` — follows `BuildingMesh.tsx` pattern exactly.

**Export integration:** Road geometry participates in the STL export merge in `ExportPanel.tsx`. It slots into the merge chain after buildings: `mergeTerrainAndBuildings(terrain, buildings)` → add `mergeRoads(solid, roadsGeo)` or extend `mergeTerrainAndBuildings` to accept an array of geometries.

---

### Water Bodies (WATR-01)

**OSM Source:** Overpass QL query for water polygons:
```
[out:json][timeout:60][bbox:${s},${w},${n},${e}];
(
  way["natural"="water"];
  way["waterway"~"^(riverbank|canal)$"];
  relation["natural"="water"]["type"="multipolygon"];
  relation["waterway"~"^(riverbank|canal)$"]["type"="multipolygon"];
);
out geom;
```

**Water Geometry Approach:**

Water as flat depressions means lowering the terrain within water polygons to a constant Z. Two sub-approaches:

- **Option A (mesh replacement):** When building terrain mesh, detect which grid cells fall inside water polygons and force those elevations to `minElevation`. Build terrain geometry normally from the modified grid.
- **Option B (overlay geometry):** Build flat polygon geometry at `waterLevelZ` and use it as a mask/overlay in the 3D preview. For STL export, cut the water area out via CSG subtraction.

**Recommendation: Option A for STL export integrity.** Modifying the elevation grid before Martini mesh generation produces clean manifold output without CSG. For the 3D preview, an overlay at water level is simpler and works visually.

Concretely:
1. `parseWaterFeatures()` returns polygon rings in WGS84.
2. `applyWaterToElevationGrid(elevationData, waterFeatures, bbox)` — for each grid cell, if its lon/lat falls inside a water polygon, set elevation to `minElevation` (or a configured water level offset). Returns a modified `ElevationData`.
3. Pass the modified elevation data to `buildTerrainGeometry()` — the depression appears naturally in the terrain mesh.
4. 3D preview: render a flat `WaterMesh` overlay at water level using the polygon geometry directly (with a blue material for visual distinction).

**New files:**
```
src/lib/water/
├── overpass.ts       — fetchWaterData(bbox) → raw Overpass JSON
├── parse.ts          — parseWaterFeatures(raw) → WaterFeature[]
├── elevation.ts      — applyWaterToElevationGrid(elevData, features, bbox) → ElevationData
└── types.ts          — WaterFeature
```

**New component:** `src/components/Preview/WaterMesh.tsx` — flat polygon at water level, blue translucent material for preview. Does not need to be in the STL export (terrain depression handles the physical shape).

**Store integration:** Add `waterFeatures: WaterFeature[] | null` to `mapStore`. The elevation pipeline in `GenerateButton.tsx` applies water features to the grid before setting `elevationData` in the store.

**Key constraint:** Water feature application must happen before `setElevationData()` is called so `TerrainMesh` renders with the depression already baked in. Water is not a separate layer added on top — it modifies the terrain grid.

---

### Vegetation (VEGE-01)

**OSM Source:** Overpass QL for parks and forests:
```
[out:json][timeout:60][bbox:${s},${w},${n},${e}];
(
  way["landuse"~"^(forest|meadow|grass|greenfield|recreation_ground)$"];
  way["leisure"~"^(park|garden|nature_reserve)$"];
  way["natural"~"^(wood|scrub|heath|grassland)$"];
  relation["landuse"~"^(forest|meadow|grass)$"]["type"="multipolygon"];
  relation["leisure"="park"]["type"="multipolygon"];
);
out geom;
```

**Vegetation Geometry Approach:**

Vegetation is a flat polygon raised slightly above terrain (`terrainZ + vegetationHeightMM` — 1mm default). This creates a printable raised texture distinct from bare terrain.

Geometry: earcut-triangulate the polygon footprint in the same coordinate space as buildings/roads. Sample terrain elevation per vertex. Each vertex Z = terrain elevation + vegetation height offset.

This is identical to the building floor cap in `buildingMesh.ts` — reuse `buildFloorCap()` with a uniform offset instead of per-vertex wall heights.

**New files:**
```
src/lib/vegetation/
├── overpass.ts       — fetchVegetationData(bbox) → raw Overpass JSON
├── parse.ts          — parseVegetationFeatures(raw) → VegetationFeature[]
├── geometry.ts       — buildVegetationMesh(features, params) → THREE.BufferGeometry
└── types.ts          — VegetationFeature
```

**New component:** `src/components/Preview/VegetationMesh.tsx` — green material, slightly raised above terrain.

**Export integration:** Vegetation geometry participates in the STL merge chain as an optional layer alongside buildings and roads.

---

### Terrain Smoothing (TERR-04)

**What it is:** A user-controlled slider that applies smoothing to the `ElevationData.elevations` Float32Array before it enters `buildTerrainGeometry()`.

**Algorithm:** Gaussian or box blur on the elevation grid. A box blur (averaging kernel) is simpler and sufficient:
```typescript
function boxBlurElevation(
  elevations: Float32Array,
  gridSize: number,
  radius: number  // 0 = no blur, 1 = 1-cell radius, 2 = 2-cell radius
): Float32Array {
  // For each cell, average the (2*radius+1)^2 neighborhood
  // Standard separable box blur: horizontal pass then vertical pass
}
```

**Slider design:** `smoothingLevel: number` in the store (0–3 or 0–5). 0 = no smoothing (raw DEM), higher = more passes or larger kernel. The slider label could say "Smooth" with 0 being "Raw" and max being "Very Smooth."

**Integration point:** Apply smoothing at the point where elevation data is consumed by mesh generation. Two options:
- **Option A:** Apply in `buildTerrainGeometry()` based on a `smoothingPasses` param. Cleanest — `ElevationData` stays raw, smoothing is a mesh-gen parameter.
- **Option B:** Apply in `TerrainMesh.tsx`'s `useEffect` before calling `buildTerrainGeometry()`. Keeps lib functions pure.

**Recommendation: Option A.** Add `smoothingPasses: number` to `TerrainMeshParams`. Smoothing is part of mesh generation, not data storage. The raw elevations are preserved in the store and smoothing can change without refetching.

**Store change:** Add `smoothingLevel: number` (default 0) to `mapStore`. `TerrainMesh.tsx` passes it as `maxError`/`smoothingPasses` to `buildTerrainGeometry()`.

---

### Web Worker Offload (FNDN-03)

**Current state:** All mesh generation runs synchronously on the main thread. `ExportPanel.tsx` and `TerrainMesh.tsx`/`BuildingMesh.tsx` call geometry functions directly.

**Target state:** Heavy mesh generation (terrain, buildings, roads, vegetation) runs in a dedicated Web Worker.

**Vite Worker Pattern (confirmed working in this stack):**
```typescript
// src/lib/worker/meshWorker.ts
const worker = new Worker(
  new URL('./meshWorker.worker.ts', import.meta.url),
  { type: 'module' }
);
```

The worker receives plain-object message with all geometry parameters and returns `Float32Array` buffers via transferable objects (zero-copy):
```typescript
// Worker receives:
{
  type: 'buildTerrain',
  elevations: Float32Array,       // transferred
  gridSize: number,
  params: TerrainMeshParams
}

// Worker returns:
{
  type: 'terrainReady',
  positions: Float32Array,        // transferred back
  normals: Float32Array,
  colors: Float32Array,
  indices: Uint32Array
}
```

**Critical constraint:** The Worker file cannot import Three.js directly if the goal is pure geometry math (Three.js brings in DOM dependencies). Two options:
- **Option A:** Worker does pure math, returns `Float32Array` position/normal/index arrays. Main thread reconstructs `BufferGeometry`. This is cleanest.
- **Option B:** Worker imports Three.js (which works in Workers if Three.js doesn't touch DOM). More complex but keeps mesh construction logic in one place.

**Recommendation: Option A.** The existing lib functions (`buildTerrainGeometry`, `buildAllBuildings`) already return `THREE.BufferGeometry`. Refactor them to return typed arrays, then add a thin Three.js `BufferGeometry` reconstructor on the main thread.

**Worker scope for Phase 6:** Start with terrain mesh generation in the Worker (largest CPU cost). Add buildings, roads, vegetation progressively. The export pipeline (`mergeTerrainAndBuildings` with CSG) is the most expensive single operation — it's also the most important to move to a Worker.

**Three.js BufferGeometry round-trip:**
```typescript
// Main thread: send raw arrays to worker
worker.postMessage({
  elevations: elevationData.elevations.buffer,
  ...params
}, [elevationData.elevations.buffer]); // transfer

// Worker: compute, return
self.postMessage({
  positions: new Float32Array([...]),
  normals: new Float32Array([...]),
  indices: new Uint32Array([...])
}, [positions.buffer, normals.buffer, indices.buffer]);

// Main thread: reconstruct
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
geo.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
```

---

## Store Extension Plan

The current `mapStore.ts` needs new state fields. Add these incrementally, one feature at a time:

```typescript
// Roads
roadFeatures: RoadFeature[] | null;
roadStyle: 'recessed' | 'raised' | 'flat';
roadGenerationStatus: 'idle' | 'fetching' | 'building' | 'ready' | 'error';

// Water
waterFeatures: WaterFeature[] | null;
waterGenerationStatus: 'idle' | 'fetching' | 'building' | 'ready' | 'error';

// Vegetation
vegetationFeatures: VegetationFeature[] | null;
vegetationGenerationStatus: 'idle' | 'fetching' | 'building' | 'ready' | 'error';

// Layer toggles (CTRL-01)
layerToggles: {
  terrain: boolean;     // default true
  buildings: boolean;   // default true
  roads: boolean;       // default true
  water: boolean;       // default true
  vegetation: boolean;  // default true
};

// Smoothing (TERR-04)
smoothingLevel: number;  // 0-3, default 0

// Units (CTRL-03)
units: 'mm' | 'inches';  // default 'mm'
```

Layer visibility uses Three.js `mesh.visible = layerToggles.terrain` — no geometry rebuild needed for toggling. This is the established anti-pattern prevention from the prior architecture.

---

## Updated Data Flow: Generate Pipeline

```
User clicks "Generate Preview"
        |
        v
GenerateButton.handleGenerate()
        |
        ├── fetchElevationForBbox()                [existing, async]
        │       |
        │       └── If waterFeatures already available:
        │               applyWaterToElevationGrid()   [new, synchronous]
        │       └── setElevationData(elevData)
        │
        ├── fetchBuildingData() [existing, parallel, non-blocking]
        │
        ├── fetchRoadData()     [new, parallel, non-blocking]
        │
        ├── fetchWaterData()    [new, parallel, non-blocking]
        │       |
        │       └── on complete: applyWaterToElevationGrid() + re-trigger terrain rebuild
        │
        └── fetchVegetationData() [new, parallel, non-blocking]

Each fetch → parse → set store state
Store state change → Mesh component useEffect fires → geometry rebuilt
```

**Note on water and terrain dependency:** Water polygon data must be applied to elevation data before terrain renders with depressions. If water arrives after elevation, the store change to `waterFeatures` must trigger a re-application of water to the elevation grid. Either: (a) `TerrainMesh.tsx` subscribes to both `elevationData` and `waterFeatures` and applies water before building geometry, or (b) water application is done once at fetch-complete time and the result is stored as `processedElevationData` separate from raw `elevationData`. Option (a) is simpler and avoids duplicating elevation state.

---

## Export Pipeline Extension

Current export chain in `ExportPanel.tsx`:
```
buildTerrainGeometry() → buildSolidMesh() → mergeTerrainAndBuildings() → validateMesh() → exportToSTL()
```

Extended export chain:
```
buildTerrainGeometry(elevData with water applied, smoothingLevel)
  → buildSolidMesh()
  → mergeTerrainAndBuildings(terrainSolid, buildingsGeo?)   [existing]
  → mergeRoads(solid, roadsGeo?)                            [new]
  → mergeVegetation(solid, vegetationGeo?)                  [new]
  → validateMesh()
  → exportToSTL()
```

Each new merge step only executes if the feature is toggled on AND has geometry. The merge pattern (try CSG ADDITION, fallback to `mergeGeometries`) is already established in `buildingSolid.ts` and can be reused.

---

## New Project Structure

```
src/
├── components/
│   ├── Layout/
│   │   └── SplitLayout.tsx
│   ├── Map/
│   │   ├── MapView.tsx
│   │   └── SearchOverlay.tsx
│   ├── Preview/
│   │   ├── PreviewCanvas.tsx        — add RoadMesh, WaterMesh, VegetationMesh
│   │   ├── TerrainMesh.tsx
│   │   ├── BuildingMesh.tsx
│   │   ├── RoadMesh.tsx             — NEW
│   │   ├── WaterMesh.tsx            — NEW
│   │   ├── VegetationMesh.tsx       — NEW
│   │   ├── ExportPanel.tsx          — extend merge chain
│   │   ├── PreviewControls.tsx
│   │   ├── PreviewSidebar.tsx
│   │   └── TerrainControls.tsx
│   └── Sidebar/
│       ├── Sidebar.tsx              — add layer toggles, controls
│       ├── GenerateButton.tsx       — add road/water/vegetation fetches
│       └── SelectionInfo.tsx
│
├── lib/
│   ├── buildings/                   — EXISTING (unchanged)
│   ├── elevation/                   — EXISTING + water application hook
│   ├── export/                      — EXISTING (unchanged)
│   ├── mesh/                        — EXISTING + smoothing param
│   ├── roads/                       — NEW
│   │   ├── overpass.ts
│   │   ├── parse.ts
│   │   ├── geometry.ts
│   │   └── types.ts
│   ├── water/                       — NEW
│   │   ├── overpass.ts
│   │   ├── parse.ts
│   │   ├── elevation.ts
│   │   └── types.ts
│   ├── vegetation/                  — NEW
│   │   ├── overpass.ts
│   │   ├── parse.ts
│   │   ├── geometry.ts
│   │   └── types.ts
│   └── worker/                      — NEW (Phase 6)
│       ├── meshWorker.worker.ts
│       └── workerClient.ts
│
├── store/
│   └── mapStore.ts                  — extend with road/water/vegetation/controls state
│
└── types/
    └── geo.ts                       — extend with new status types
```

---

## Component Responsibilities (Updated)

| Component | Existing Responsibility | New Additions |
|-----------|------------------------|---------------|
| `mapStore.ts` | bbox, elevation, buildings, export state | road/water/vegetation features + status, layer toggles, smoothingLevel, units, roadStyle |
| `GenerateButton.tsx` | Fetch elevation + buildings (parallel) | Fetch roads + water + vegetation in parallel |
| `TerrainMesh.tsx` | Render terrain from elevationData | Apply water features before building geometry; accept smoothingLevel |
| `BuildingMesh.tsx` | Render building geometry | Add visibility toggle from layerToggles |
| `RoadMesh.tsx` | (new) | Render road ribbon geometry; use roadStyle from store |
| `WaterMesh.tsx` | (new) | Render flat polygon overlay at water level; blue material |
| `VegetationMesh.tsx` | (new) | Render raised polygon geometry; green material |
| `PreviewCanvas.tsx` | Render Terrain + Buildings | Add Road + Water + Vegetation mesh components |
| `ExportPanel.tsx` | Merge terrain + buildings → STL | Extend merge chain; include toggled-on layers |
| `PreviewSidebar.tsx` | Exaggeration slider, export | Add smoothing slider; layer toggles panel |

---

## Build Order for New Features

The dependency graph of the new features dictates this order:

**1. Model Controls + Store Extensions** (no geometry, wire first)
- Reason: Every subsequent feature consumes controls (layer toggles, road style, units). Build controls first so features can be tested against toggles immediately.
- Deliverable: `mapStore.ts` with all new state; sidebar control UI; layer visibility wiring to existing Terrain/Building meshes.

**2. Road Layer** (adds first new geometry type)
- Reason: Roads are geometrically independent from water/vegetation. The Overpass query, parse, geometry, and mesh component can be built and tested in isolation. Most impactful visual addition.
- Deliverable: `lib/roads/`, `RoadMesh.tsx`, road data in `GenerateButton`, roads in STL export.

**3. Water Layer** (modifies terrain pipeline)
- Reason: Water must integrate with the elevation pipeline, which adds architectural complexity vs roads. Build after roads so the pattern is established.
- Deliverable: `lib/water/`, `WaterMesh.tsx`, `applyWaterToElevationGrid` in terrain path, water in export.

**4. Vegetation Layer** (simplest new layer — same pattern as buildings)
- Reason: Vegetation is flat polygon geometry, structurally identical to building floors. Builds last because it is lowest priority and most OSM-data-dependent.
- Deliverable: `lib/vegetation/`, `VegetationMesh.tsx`, vegetation in export.

**5. Terrain Smoothing** (parameterize existing mesh function)
- Reason: Smoothing is a parameter change to `buildTerrainGeometry()` — no new data pipeline. Can be done at any point but best after roads/water/vegetation to batch-test visual quality with all layers active.
- Deliverable: `smoothingPasses` param in `TerrainMeshParams`; blur function in `lib/mesh/terrain.ts`; smoothing slider in sidebar.

**6. Web Worker Offload** (Phase 6 — refactor, no new features)
- Reason: Depends on all previous features being complete and stable. Refactoring the geometry pipeline to return typed arrays (rather than Three.js objects) must be done with the full feature set in place to avoid double-refactoring.
- Deliverable: `lib/worker/meshWorker.worker.ts`; typed-array interfaces for terrain/buildings/roads/vegetation builders; `BufferGeometry` reconstructors on main thread.

---

## Anti-Patterns Specific to This Milestone

### Anti-Pattern 1: Separate Overpass Queries for Each Feature

**What to do instead:** Combine roads, water, and vegetation into a single Overpass query per generate call, or at minimum group them into parallel fetches. Three separate sequential queries for roads, water, vegetation triples API latency.

**Recommended:** One compound query per generate (union all needed element types) or three parallel fetches that all start simultaneously. The existing buildings pattern (parallel, non-blocking) must extend to all new feature types.

---

### Anti-Pattern 2: Storing Smoothed Elevation in the Store

**What to do instead:** Keep raw `ElevationData` in the store. Apply smoothing only at mesh-generation time, as a parameter. If smoothing is stored, changing the smoothing slider requires a store update, re-smoothing, and storage of a new elevation array — wasted memory and complexity.

---

### Anti-Pattern 3: Applying Water Depressions After TerrainGeometry Build

**What to do instead:** Apply water polygon masking to the `elevations` Float32Array **before** passing it to `buildTerrainGeometry()`. Water depressions need to be part of the terrain surface, not layered on top (which would produce floating water planes with no depression in the print).

---

### Anti-Pattern 4: Moving All Mesh Generation to Worker Before Features Are Complete

**What to do instead:** Build Phase 4 (roads), Phase 5 (water/vegetation/smoothing), and Phase 6 (edit-iterate) on the main thread first. Worker refactoring is a Phase 6 concern. Premature workerization forces managing two code paths (worker + main thread) during active feature development.

---

### Anti-Pattern 5: Rebuilding Geometry for Layer Toggle Changes

**What to do instead:** Use Three.js `mesh.visible` for layer toggles. The geometry is already built; toggling visibility is a scene property, not a pipeline re-run. Only rebuild geometry when `elevationData`, `bbox`, or geometry-affecting settings change.

---

## Integration Points

### Overpass API — Extended Query Set

| Query | Tags | Returns |
|-------|------|---------|
| Buildings (existing) | `building`, `building:part` | Polygon ways + relations |
| Roads (new) | `highway~"motorway|trunk|primary|secondary|tertiary|residential|service"` | Way linestrings with geometry |
| Water (new) | `natural=water`, `waterway~"riverbank|canal"` | Polygon ways + multipolygon relations |
| Vegetation (new) | `landuse~"forest|meadow|grass"`, `leisure~"park|garden"`, `natural~"wood|scrub"` | Polygon ways + multipolygon relations |

All queries use `[out:json][timeout:60][bbox:${sw},{ne}]` and `out geom;` — same pattern as the existing buildings query.

### Internal Boundaries (New)

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `TerrainMesh.tsx` ↔ water features | Store subscription — `waterFeatures` from store | When waterFeatures change, TerrainMesh applies them before geometry build |
| `GenerateButton.tsx` ↔ new fetchers | Direct async calls in `handleGenerate()` — same as buildings pattern | Each fetch updates store independently; errors are non-blocking |
| `ExportPanel.tsx` ↔ new geometry | Reads `roadFeatures`, `waterFeatures`, `vegetationFeatures` from store | Builds and merges each layer geometry in sequence before STL export |
| `lib/worker/meshWorker.worker.ts` ↔ main thread | `postMessage` with `Transferable` Float32Array buffers | Worker must not import Three.js scene objects; return typed arrays only |

---

## Sources

- OSM tags reference (highway, waterway, landuse, natural): https://wiki.openstreetmap.org/wiki/Key:highway
- Overpass API Language Guide (compound queries, out geom): https://wiki.openstreetmap.org/wiki/Overpass_API/Language_Guide
- Vite Web Worker with TypeScript (module workers): https://vitejs.dev/guide/features#web-workers
- Three.js Web Worker pattern (transferable buffers): https://evilmartians.com/chronicles/faster-webgl-three-js-3d-graphics-with-offscreencanvas-and-web-workers
- Three.js BufferGeometry in Workers (community confirmed): https://discourse.threejs.org/t/trouble-reconstructing-geometry-from-web-worker/21423
- OSM water features (natural=water, waterway tags): https://wiki.openstreetmap.org/wiki/Tag:natural=water
- OSM vegetation / landuse tagging: https://wiki.openstreetmap.org/wiki/Key:landuse
- Existing codebase: src/lib/buildings/, src/store/mapStore.ts, src/components/Preview/ (direct inspection, HIGH confidence)

---

*Architecture research for: MapMaker v1.0 milestone — roads, water, vegetation, smoothing, controls, Worker offload*
*Researched: 2026-02-24*
