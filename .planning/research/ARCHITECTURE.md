# Architecture Research

**Domain:** Overture Maps building footprint integration into MapMaker (v1.1 milestone)
**Researched:** 2026-02-28
**Confidence:** HIGH for integration points (based on direct codebase inspection + Overture documentation); MEDIUM for PMTiles decoding specifics (beta API, limited browser-focused documentation)

---

## Context: What This Document Covers

This document answers one question: **how does Overture Maps building footprint data plug into the existing MapMaker architecture?**

The existing system (v1.0) is fully understood from direct inspection. This document maps the new Overture data source onto that known architecture, identifies precisely which files change, which files are new, and defines the deduplication contract between OSM and Overture buildings.

---

## Existing Architecture (The Baseline)

```
User clicks "Generate Preview"
        |
        v
GenerateButton.triggerRegenerate()
        |
        ├── fetchElevationForBbox()        → setElevationData() → TerrainMesh rebuilds
        │
        └── fetchOsmLayersStandalone()
                |
                └── fetchAllOsmData(bbox)   [single Overpass request]
                        |
                        ├── parseBuildingFeatures() → setBuildingFeatures() → BuildingMesh rebuilds
                        ├── parseRoadFeatures()     → setRoadFeatures()     → RoadMesh rebuilds
                        ├── parseWaterFeatures()    → setWaterFeatures()     → WaterMesh rebuilds
                        └── parseVegetationFeatures() → setVegetationFeatures() → VegetationMesh rebuilds

BuildingMesh.tsx (useEffect on buildingFeatures change)
        |
        └── buildBuildingsInWorker(buildingFeatures, ...)
                |
                └── meshBuilder.worker.ts
                        |
                        └── buildAllBuildings(features, bbox, elevData, params)
                                → THREE.BufferGeometry → transferable Float32Arrays → main thread
```

**The current `buildingFeatures` store field holds `BuildingFeature[]`**. Each `BuildingFeature` has:
- `outerRing: [number, number][]` — WGS84 `[lon, lat]` pairs
- `holes: [number, number][][]` — inner rings
- `properties: Record<string, string | undefined>` — OSM tags (height, levels, roof:shape, etc.)

`BuildingMesh.tsx` passes `buildingFeatures` to the worker. The worker calls `buildAllBuildings()` which handles all geometry: projection to UTM/mm space, elevation sampling, raycasting onto terrain mesh, wall+roof generation.

---

## Overture Maps Data Access: Key Facts

### What Overture Is

Overture builds a global buildings dataset by conflating ~200 sources: OSM (~672M buildings, highest priority), Microsoft ML (~711M), Google Open Buildings (~1B). Total: 2.28+ billion buildings globally. The conflation uses **IoU (Intersection over Union) matching** — buildings with IoU > 50% across sources are merged into a single feature with a stable GERS ID.

**Critical implication:** Overture already contains OSM buildings. When you fetch from Overpass and from Overture for the same bbox, many buildings appear in both responses. Deduplication is mandatory, not optional.

### Overture's OSM Priority Rule

Overture prioritizes OSM data. Where OSM has a building, the Overture record's `sources` field includes `"dataset": "OpenStreetMap"`. Where OSM does not have a building, Overture may have one from Microsoft or Google ML data. The Overture building schema includes height, num_floors, roof_shape, roof_height, facade fields — the same properties the existing height resolution cascade uses.

### Browser Access Path

Overture does not provide a REST API for bbox queries. Data access options ranked by browser viability:

| Method | Browser viable | Notes |
|--------|---------------|-------|
| GeoParquet on S3 | No | Parquet format, requires DuckDB or server-side query |
| PMTiles on S3 | Yes | Vector tile archive, HTTP range requests, JS library available |
| Python CLI | No | Server-side only |
| Third-party REST API (overturemapsapi.com) | Yes (with caveats) | Community project, not official, unknown reliability |

**Recommended: PMTiles.** The `pmtiles` npm package provides a browser-compatible class that makes HTTP range requests against the remote `.pmtiles` file. No server required. The file is hosted at:

```
https://overturemaps-tiles-us-west-2-beta.s3.amazonaws.com/{RELEASE}/buildings.pmtiles
```

Current release cadence is monthly. Example: `2025-10-22`. The file uses the MVT (Mapbox Vector Tile) format inside the PMTiles container. Buildings appear at zoom 13+ (all properties included at z13).

**PMTiles JS API (from typedoc, HIGH confidence):**
```typescript
import { PMTiles } from 'pmtiles';

const pmtiles = new PMTiles('https://overturemaps-tiles-us-west-2-beta.s3.amazonaws.com/2025-10-22/buildings.pmtiles');
// Fetch a specific tile:
const tile = await pmtiles.getZxy(z, x, y);  // returns ArrayBuffer | undefined
```

To decode the MVT tile bytes to GeoJSON-like features, use `@mapbox/vector-tile` + `pbf`:
```typescript
import { VectorTile } from '@mapbox/vector-tile';
import Protobuf from 'pbf';

const tile = new VectorTile(new Protobuf(tileArrayBuffer));
const layer = tile.layers['building']; // layer name TBD — needs verification
for (let i = 0; i < layer.length; i++) {
  const feature = layer.feature(i);
  const geojson = feature.toGeoJSON(x, y, z);  // returns GeoJSON Feature
}
```

The tile coordinate system is standard TMS/Slippy Map. Given a bbox in WGS84, tile coordinates at zoom 14 can be derived using `lon2tile(lon, z)` and `lat2tile(lat, z)` — standard formulas. For a MapMaker bbox at z14, typically 4–16 tiles cover the area.

**MEDIUM confidence on exact layer name inside the MVT.** The PMTiles docs confirm MVT format and buildings theme but do not document the layer key. Needs one-time empirical check: open `https://pmtiles.io/` with the Overture buildings URL and inspect layer names.

---

## Integration Architecture

### System Overview With Overture Added

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         Browser (Client-Side SPA)                          │
│                                                                            │
│  GenerateButton.triggerRegenerate()                                        │
│        |                                                                   │
│        ├── fetchElevationForBbox()  ─────────────────────────────────────► │
│        │                                                                   │
│        └── fetchOsmLayersStandalone(bbox)      ◄── MODIFIED                │
│                   |                                                        │
│                   ├── fetchAllOsmData(bbox)  ─────────────────────────────►│
│                   │       |                                                │
│                   │       └── parseBuildingFeatures()  → osmBuildings      │
│                   │                                                        │
│                   ├── fetchOvertureBuildings(bbox)  ──────────────────────►│
│                   │       |                              Overture PMTiles  │
│                   │       └── parseOvertureBuildings()  → overtureBuildings│
│                   │                                                        │
│                   └── mergeAndDeduplicateBuildings(                        │
│                             osmBuildings, overtureBuildings                │
│                         )  → BuildingFeature[]                             │
│                                  |                                         │
│                                  └── setBuildingFeatures()  ◄── SAME STORE │
│                                                                            │
│  mapStore.ts:  buildingFeatures: BuildingFeature[]  (unchanged type)       │
│                                                                            │
│  BuildingMesh.tsx  →  meshBuilder.worker.ts  →  buildAllBuildings()        │
│       (ALL UNCHANGED — downstream pipeline sees no difference)             │
└────────────────────────────────────────────────────────────────────────────┘
         |                           |                         |
         ▼                           ▼                         ▼
┌─────────────────┐    ┌──────────────────────────┐  ┌─────────────────────┐
│  Overpass API   │    │   Overture Maps PMTiles   │  │  MapTiler Terrain   │
│  (OSM buildings │    │   buildings.pmtiles on S3 │  │  (elevation, DEM)   │
│   + all other   │    │   HTTP range requests     │  │                     │
│   OSM layers)   │    │   via pmtiles npm pkg     │  └─────────────────────┘
└─────────────────┘    └──────────────────────────┘
```

### The Integration Seam

The cleanest integration point is **between parsing and storing**. The existing flow is:

```
fetchAllOsmData() → parseBuildingFeatures() → setBuildingFeatures()
```

The new flow is:

```
fetchAllOsmData()         → parseBuildingFeatures() → osmBuildings
fetchOvertureBuildings()  → parseOvertureBuildings() → overtureBuildings
mergeAndDeduplicateBuildings(osmBuildings, overtureBuildings) → setBuildingFeatures()
```

Everything downstream of `setBuildingFeatures()` — the store, `BuildingMesh.tsx`, the worker, `buildAllBuildings()`, the STL export — is **unchanged**. The seam is in `GenerateButton.tsx`'s `fetchOsmLayersStandalone()` function.

---

## Component Boundaries

### New Files (Create)

```
src/lib/buildings/
├── overture.ts          NEW — fetchOvertureBuildings(bbox) → BuildingFeature[]
│                              PMTiles fetch + MVT decode + coordinate transform
│                              Returns Overture buildings as BuildingFeature[]
│                              with synthetic properties (height, num_floors, roof_shape)
│                              mapped to the existing BuildingFeature.properties format
│
└── deduplicate.ts       NEW — mergeAndDeduplicateBuildings(
                                   osm: BuildingFeature[],
                                   overture: BuildingFeature[]
                               ) → BuildingFeature[]
                               Spatial deduplication: OSM preferred, Overture fills gaps
```

### Modified Files

```
src/components/Sidebar/GenerateButton.tsx
  — fetchOsmLayersStandalone() function:
    Add: const overtureBuildings = await fetchOvertureBuildings(bbox)
    Add: const merged = mergeAndDeduplicateBuildings(osmBuildings, overtureBuildings)
    Change: setBuildingFeatures(buildings) → setBuildingFeatures(merged)
    Status reporting: show "Fetching Overture data..." alongside OSM status

src/lib/overpass.ts
  — No change. Combined OSM fetch is unchanged.

src/lib/buildings/parse.ts
  — No change. OSM parser is unchanged.
```

### Unchanged Files (Must Remain Unchanged)

```
src/store/mapStore.ts              — buildingFeatures type stays BuildingFeature[]
src/lib/buildings/merge.ts         — buildAllBuildings() receives same type, unchanged
src/lib/buildings/types.ts         — BuildingFeature interface unchanged
src/components/Preview/BuildingMesh.tsx  — no change, reads same store field
src/workers/meshBuilder.worker.ts  — no change, receives same BuildingFeature[]
src/components/Preview/ExportPanel.tsx   — no change, STL export unchanged
```

---

## Deduplication Design

### Why IoU Is the Right Metric

Overture uses IoU > 50% internally to match buildings across sources. We must use the same metric for the same reason: two footprints representing the same building will overlap significantly (IoU > 0.4–0.6) even with projection differences, while adjacent buildings will have near-zero overlap.

### Algorithm

```typescript
// src/lib/buildings/deduplicate.ts

export function mergeAndDeduplicateBuildings(
  osmBuildings: BuildingFeature[],
  overtureBuildings: BuildingFeature[]
): BuildingFeature[] {

  // 1. OSM is always preferred — start with all OSM buildings
  const result: BuildingFeature[] = [...osmBuildings];

  // 2. For each Overture building, check if it overlaps with any OSM building
  for (const overtureBuilding of overtureBuildings) {
    const hasOsmMatch = osmBuildings.some(
      (osmBuilding) => iou(overtureBuilding.outerRing, osmBuilding.outerRing) > 0.3
    );

    // 3. Only add Overture building if no OSM match found (gap-fill only)
    if (!hasOsmMatch) {
      result.push(overtureBuilding);
    }
  }

  return result;
}
```

**IoU threshold: 0.3 (not 0.5).** OSM and Overture may use slightly different footprint sources even for the same building (e.g., OSM community-traced vs ML roofprint). A 0.3 threshold avoids false duplicates from small geometry differences. Overture uses 0.5 internally where both sources are already normalized; we use 0.3 to be conservative given raw coordinate differences.

### IoU Computation

Computing exact polygon IoU (intersection area / union area) requires polygon clipping. Two options:

**Option A: Turf.js** — `@turf/intersect` returns intersection polygon; `@turf/area` computes area. Well-tested, production-ready. Adds ~50KB to bundle. Accurate.

**Option B: Bounding-box IoU** — Compute bbox of each footprint's outerRing, compute bbox overlap. O(1) per pair, zero dependencies, no polygon math. Approximate — false negatives for L-shaped buildings, but acceptable for gap-fill deduplication where precision matters less than recall.

**Recommendation: Bounding-box IoU first.** The goal is to not render duplicate geometry, not to be cartographically precise. Bbox IoU is fast (O(n*m) with no library overhead), handles 99% of cases correctly (most buildings are roughly rectangular), and can be swapped for exact polygon IoU if needed. Implement with a `bboxOf(ring)` helper and standard IoU formula.

```typescript
function bboxOf(ring: [number, number][]): [number, number, number, number] {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const [lon, lat] of ring) {
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLon, minLat, maxLon, maxLat];
}

function bboxIou(a: [number,number,number,number], b: [number,number,number,number]): number {
  const interMinLon = Math.max(a[0], b[0]);
  const interMinLat = Math.max(a[1], b[1]);
  const interMaxLon = Math.min(a[2], b[2]);
  const interMaxLat = Math.min(a[3], b[3]);

  if (interMaxLon <= interMinLon || interMaxLat <= interMinLat) return 0;

  const interArea = (interMaxLon - interMinLon) * (interMaxLat - interMinLat);
  const aArea = (a[2] - a[0]) * (a[3] - a[1]);
  const bArea = (b[2] - b[0]) * (b[3] - b[1]);
  return interArea / (aArea + bArea - interArea);
}
```

**Performance:** For a dense area with 5,000 OSM buildings and 3,000 Overture gap-fills, the O(n*m) check is 15M comparisons. Each comparison is 10 arithmetic operations — ~150M ops. In a Worker this is acceptable. Pre-indexing OSM buildings by grid cell reduces this to ~O(n log n) if needed.

### Properties Mapping

Overture building properties must be mapped to the existing `BuildingFeature.properties` format (`Record<string, string | undefined>`) which the height resolution cascade reads:

| Existing OSM property key | Overture field | Notes |
|---------------------------|---------------|-------|
| `height` | `height` | Direct map, convert number to string |
| `building:levels` | `num_floors` | Direct map |
| `roof:shape` | `roof_shape` | Overture values: "flat", "gabled", "hipped" — matches OSM vocabulary |
| `roof:height` | `roof_height` | Direct map |
| `building` | `class` or `subtype` | Overture has "building" subtype field |

For gap-fill buildings (Overture-only, no OSM match), the `properties` object will have whatever Overture provides. The existing `resolveHeight()` function in `src/lib/buildings/height.ts` already handles missing height/levels with a footprint-area-based fallback — Overture-only buildings with height=undefined will use that fallback automatically.

---

## Data Flow: Full Sequence

```
User clicks "Generate Preview"
        |
        v
triggerRegenerate()
        |
        ├── fetchElevationForBbox()                    [unchanged, async]
        │
        └── fetchOsmLayersStandalone(bbox)             [MODIFIED]
                |
                ├── fetchAllOsmData(bbox)              [unchanged, Overpass]
                │       → osmData (combined JSON)
                │       → osmBuildings = parseBuildingFeatures(osmData)
                │       → roads = parseRoadFeatures(osmData)         → setRoadFeatures()
                │       → water = parseWaterFeatures(osmData)        → setWaterFeatures()
                │       → vegetation = parseVegetationFeatures(osmData) → setVegetationFeatures()
                │
                ├── fetchOvertureBuildings(bbox)       [NEW, parallel with OSM]
                │       → PMTiles.getZxy() for each tile covering bbox
                │       → VectorTile decode → GeoJSON polygon features
                │       → overtureBuildings: BuildingFeature[]
                │
                └── mergeAndDeduplicateBuildings(osmBuildings, overtureBuildings)  [NEW]
                        → merged: BuildingFeature[]
                        → setBuildingFeatures(merged)

Store: buildingFeatures: BuildingFeature[]  (now contains both OSM + Overture gap-fills)

BuildingMesh.tsx  ← useEffect on buildingFeatures
        |
        └── buildBuildingsInWorker(buildingFeatures, ...)   [unchanged]
                |
                └── meshBuilder.worker.ts                  [unchanged]
                        |
                        └── buildAllBuildings()            [unchanged]
                                → same geometry pipeline for all buildings
                                → OSM buildings: rich geometry (roofs, heights)
                                → Overture gap-fills: flat box (height from Overture or fallback)
```

### Parallelism

`fetchOvertureBuildings()` and `fetchAllOsmData()` should run in **parallel** — both start at the same time. The merge runs only after both complete. This avoids adding Overture latency to the serial critical path. The pattern matches existing parallel fetch design.

```typescript
// In fetchOsmLayersStandalone():
const [osmData, overtureBuildings] = await Promise.all([
  fetchAllOsmData(bbox),
  fetchOvertureBuildings(bbox),   // new
]);

const osmBuildings = parseBuildingFeatures(osmData);
const merged = mergeAndDeduplicateBuildings(osmBuildings, overtureBuildings);
setBuildingFeatures(merged);
```

---

## fetchOvertureBuildings Implementation Design

```typescript
// src/lib/buildings/overture.ts

import { PMTiles } from 'pmtiles';
import { VectorTile } from '@mapbox/vector-tile';
import Protobuf from 'pbf';
import type { BuildingFeature } from './types';
import type { BoundingBox } from '../../types/geo';

// Overture releases buildings as PMTiles; update URL per release
const OVERTURE_BUILDINGS_URL =
  'https://overturemaps-tiles-us-west-2-beta.s3.amazonaws.com/2025-10-22/buildings.pmtiles';

// Standard TMS tile coordinate conversions
function lon2tile(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, z));
}
function lat2tile(lat: number, z: number): number {
  return Math.floor(
    ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
      Math.pow(2, z)
  );
}

export async function fetchOvertureBuildings(bbox: BoundingBox): Promise<BuildingFeature[]> {
  const ZOOM = 14; // buildings appear at z13+; z14 gives adequate precision
  const pmtiles = new PMTiles(OVERTURE_BUILDINGS_URL);

  const swTileX = lon2tile(bbox.sw.lon, ZOOM);
  const swTileY = lat2tile(bbox.ne.lat, ZOOM); // lat2tile: higher lat = lower Y
  const neTileX = lon2tile(bbox.ne.lon, ZOOM);
  const neTileY = lat2tile(bbox.sw.lat, ZOOM);

  const features: BuildingFeature[] = [];

  // Fetch all tiles covering the bbox in parallel
  const tileRequests: Promise<void>[] = [];
  for (let x = swTileX; x <= neTileX; x++) {
    for (let y = swTileY; y <= neTileY; y++) {
      tileRequests.push(
        (async () => {
          const result = await pmtiles.getZxy(ZOOM, x, y);
          if (!result) return;

          const tile = new VectorTile(new Protobuf(result.data));
          const layer = tile.layers['building']; // layer name to verify empirically
          if (!layer) return;

          for (let i = 0; i < layer.length; i++) {
            const f = layer.feature(i);
            const geojson = f.toGeoJSON(x, y, ZOOM);

            if (geojson.geometry.type !== 'Polygon') continue;

            const coords = geojson.geometry.coordinates as number[][][];
            const [outerRing, ...holes] = coords;

            const feature: BuildingFeature = {
              outerRing: outerRing.map(([lon, lat]) => [lon, lat] as [number, number]),
              holes: holes.map((h) => h.map(([lon, lat]) => [lon, lat] as [number, number])),
              properties: mapOvertureProps(f.properties),
            };

            features.push(feature);
          }
        })()
      );
    }
  }

  await Promise.all(tileRequests);
  return features;
}

function mapOvertureProps(raw: Record<string, unknown>): Record<string, string | undefined> {
  return {
    building: String(raw['class'] ?? raw['subtype'] ?? 'yes'),
    height: raw['height'] != null ? String(raw['height']) : undefined,
    'building:levels': raw['num_floors'] != null ? String(raw['num_floors']) : undefined,
    'roof:shape': raw['roof_shape'] != null ? String(raw['roof_shape']) : undefined,
    'roof:height': raw['roof_height'] != null ? String(raw['roof_height']) : undefined,
  };
}
```

**MEDIUM confidence on `tile.layers['building']`.** The PMTiles docs confirm MVT format and buildings theme but do not document the exact layer key string in the MVT. This must be verified by loading a sample tile at pmtiles.io and inspecting layer names. Common naming: `buildings`, `building`, `overture_buildings`.

---

## Project Structure: New Files Only

```
src/lib/buildings/
├── overture.ts          NEW — PMTiles fetch + MVT decode → BuildingFeature[]
├── deduplicate.ts       NEW — mergeAndDeduplicateBuildings(osm, overture) → BuildingFeature[]
├── overture.ts          (existing src/lib/buildings/overpass.ts stays for building-only legacy)
│                        (src/lib/overpass.ts stays for combined OSM fetch — unchanged)
├── merge.ts             UNCHANGED
├── parse.ts             UNCHANGED
├── types.ts             UNCHANGED
└── ... (all other files unchanged)

src/components/Sidebar/
└── GenerateButton.tsx   MODIFIED (fetchOsmLayersStandalone only)

No new store fields. No new mesh components. No changes to worker or export pipeline.
```

---

## Build Order

Dependencies determine order. Build in this sequence:

**Step 1: fetchOvertureBuildings() in isolation**

Build `src/lib/buildings/overture.ts` as a standalone function. Test it independently by calling it with a known bbox and logging the returned `BuildingFeature[]` count. This verifies PMTiles access, tile coordinate math, MVT decoding, and property mapping before integrating into the live pipeline.

Blockers to resolve first:
- Install `pmtiles` and `@mapbox/vector-tile` + `pbf` npm packages
- Verify the MVT layer name by fetching one tile manually at pmtiles.io
- Confirm CORS allows browser fetch from the S3 bucket (Overture tiles are public; their web explorer uses them browser-side, so CORS is expected to be open)

**Step 2: mergeAndDeduplicateBuildings() with tests**

Build `src/lib/buildings/deduplicate.ts`. Write unit tests with synthetic `BuildingFeature[]` arrays that have known overlaps and gaps. Verify: (a) OSM-only buildings pass through, (b) Overture buildings matching OSM are dropped, (c) Overture buildings with no OSM match are added. Do not integrate into `GenerateButton.tsx` yet.

**Step 3: Wire into GenerateButton.tsx**

Modify `fetchOsmLayersStandalone()` to run OSM and Overture fetches in parallel and merge results. Use `Promise.allSettled()` rather than `Promise.all()` so an Overture fetch failure degrades gracefully to OSM-only (no error shown to user, just no gap-fill buildings).

```typescript
const [osmResult, overtureResult] = await Promise.allSettled([
  fetchAllOsmData(bbox),
  fetchOvertureBuildings(bbox),
]);

const osmData = osmResult.status === 'fulfilled' ? osmResult.value : null;
const overtureBuildings = overtureResult.status === 'fulfilled' ? overtureResult.value : [];

const osmBuildings = osmData ? parseBuildingFeatures(osmData) : [];
const merged = mergeAndDeduplicateBuildings(osmBuildings, overtureBuildings);
setBuildingFeatures(merged);
```

**Step 4: Visual verification**

Test in a known area with sparse OSM building coverage (rural areas, parts of Southeast Asia, Africa) to confirm Overture gap-fills appear. Test in a dense OSM area (Manhattan, central London) to confirm no duplicate buildings appear.

**Step 5: Hardened release URL**

The PMTiles URL contains a hardcoded release date. Before shipping, either: (a) pull the latest release date from Overture's GitHub release notes, or (b) fetch the Overture releases API (if one exists) to get the latest URL dynamically. Option (a) is acceptable for v1.1 — just update the URL constant per release.

---

## Error Handling and Degradation

The Overture fetch must degrade gracefully. It is an enhancement, not a requirement. If PMTiles fetch fails (network, S3 down, CORS issue), the app should render OSM-only buildings with no error surfaced to the user.

| Failure scenario | Behavior |
|-----------------|----------|
| S3 unavailable | `fetchOvertureBuildings()` throws → `Promise.allSettled` catches → `overtureBuildings = []` → OSM-only |
| CORS blocked | Same as above |
| MVT layer name wrong | `layer = tile.layers['building']` returns `undefined` → `if (!layer) return` → zero Overture features → OSM-only |
| Stale release URL | PMTiles file not found → same degradation path |
| Tile fetch timeout | Wrap in `AbortController` with 15s timeout → degrade to OSM-only |

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: New Store Field for Overture Buildings

**What people do:** Add `overtureFeatures: BuildingFeature[] | null` to the store alongside `buildingFeatures`, then merge in `BuildingMesh.tsx`.

**Why it's wrong:** Creates two sources of truth for buildings. `BuildingMesh.tsx` now needs to know about the merge. The STL export in `ExportPanel.tsx` needs to know about it. The worker needs to know about it. You've spread the merge logic across three files instead of one.

**Do this instead:** Merge at the data ingestion point in `fetchOsmLayersStandalone()`. The store holds only the final merged array. Everything downstream is unaware of the merge.

### Anti-Pattern 2: Fetching Overture After OSM (Serial)

**What people do:** `await fetchAllOsmData(); await fetchOvertureBuildings();` — sequential fetches.

**Why it's wrong:** Overture adds latency on the critical path. OSM typically takes 3–8 seconds for a dense area. Overture PMTiles may take 2–5 seconds (multiple tile fetches). Serial = 8–13 seconds. Parallel = 8 seconds (whichever is slower).

**Do this instead:** `Promise.allSettled([fetchAllOsmData(), fetchOvertureBuildings()])` — start both simultaneously.

### Anti-Pattern 3: Exact Polygon IoU for Deduplication at First Pass

**What people do:** Import Turf.js, compute exact polygon intersection for every Overture×OSM building pair.

**Why it's wrong:** Turf.js adds bundle weight and the O(n*m) exact polygon computation is expensive for dense areas (5,000 × 3,000 = 15M polygon intersection operations). The extra accuracy is not needed for gap-fill deduplication.

**Do this instead:** Bounding-box IoU first. If duplicate leakage is observed in testing, profile before adding exact polygon computation. Spatial grid indexing (bucket OSM buildings into lat/lon cells, only check Overture buildings against nearby OSM buildings) solves the performance issue without Turf.js.

### Anti-Pattern 4: Treating Overture as the Authoritative Source

**What people do:** Prefer Overture over OSM for overlapping buildings (reasoning: Overture merges more sources, so it must be richer).

**Why it's wrong:** OSM buildings have community-verified 3D attributes (roof shapes, material types, detailed heights). Overture building_part data comes exclusively from OSM. Discarding OSM geometry in favor of Overture loses the rich building detail that drives MapMaker's roof geometry.

**Do this instead:** OSM always wins on overlap. Overture only fills gaps where OSM has nothing.

### Anti-Pattern 5: Fetching Overture at Max Bbox Scale

**What people do:** Use zoom 8 or 10 to fetch fewer tiles for large bboxes.

**Why it's wrong:** Overture buildings appear at z13+ with full properties. Lower zoom tiles may not include building footprints or will have simplified/omitted geometry. The existing MapMaker area cap (25 km² hard limit, 4 km² soft warning) means the bbox is small enough that z14 tile fetches are 4–25 tiles — a manageable set.

**Do this instead:** Always use zoom 14. With the existing area cap, this is always ≤ 30 tiles per generate.

---

## Integration Points Summary

### New External Service

| Service | URL | Integration Pattern | CORS | Notes |
|---------|-----|---------------------|------|-------|
| Overture Maps PMTiles | `https://overturemaps-tiles-us-west-2-beta.s3.amazonaws.com/{release}/buildings.pmtiles` | PMTiles JS library, HTTP range requests | Expected open (public S3, used by Overture's browser explorer) | URL requires manual update per release; labeled "beta" |

### New Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `GenerateButton.tsx` → `overture.ts` | Direct async call inside `fetchOsmLayersStandalone()` | Parallel with OSM fetch via `Promise.allSettled()` |
| `overture.ts` → `deduplicate.ts` | Function call: `mergeAndDeduplicateBuildings(osm, overture)` | Both arguments required; graceful empty-array fallback |
| `deduplicate.ts` → `mapStore.ts` | Result passed to `setBuildingFeatures()` | Identical contract to current OSM-only flow |

### Required New Dependencies

| Package | Purpose | Version to use |
|---------|---------|----------------|
| `pmtiles` | PMTiles archive decoder for browser | Latest (4.4.0 as of research) |
| `@mapbox/vector-tile` | MVT decoder (tile bytes → features) | Latest stable |
| `pbf` | Protobuf reader (required by vector-tile) | Latest stable |

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| Integration seam location | HIGH | Direct codebase inspection; `fetchOsmLayersStandalone()` is the exact merge point |
| OSM/Overture duplicate existence | HIGH | Overture documentation confirms OSM is a source; ~672M OSM buildings in dataset |
| PMTiles browser access | MEDIUM | Official docs confirm JS library + HTTP access; CORS assumption (browser explorer uses it) needs empirical verification |
| MVT layer name inside PMTiles | LOW | Not documented; must be checked empirically by fetching a tile at pmtiles.io |
| Deduplication threshold 0.3 IoU | MEDIUM | Based on Overture's own 0.5 threshold + adjustment for raw coordinate differences; needs tuning with real data |
| Overture property field names | HIGH | Official schema documentation; height, num_floors, roof_shape, roof_height confirmed |
| Degradation behavior | HIGH | `Promise.allSettled()` pattern is standard; catch paths are straightforward |

---

## Sources

- Overture Maps buildings schema: https://docs.overturemaps.org/schema/reference/buildings/building/
- Overture Maps building conflation process: https://docs.overturemaps.org/guides/buildings/
- Overture Maps PMTiles documentation: https://docs.overturemaps.org/examples/overture-tiles/
- PMTiles JavaScript library API: https://pmtiles.io/typedoc/classes/PMTiles.html
- @mapbox/vector-tile npm package: https://github.com/mapbox/vector-tile-js
- Overture data access (no browser REST API confirmed): https://docs.overturemaps.org/getting-data/
- IoU deduplication methodology: https://docs.overturemaps.org/guides/buildings/ (conflation section)
- Existing codebase (HIGH confidence — direct inspection):
  - `src/components/Sidebar/GenerateButton.tsx`
  - `src/lib/buildings/parse.ts`, `merge.ts`, `types.ts`
  - `src/store/mapStore.ts`
  - `src/workers/meshBuilder.worker.ts`
  - `src/components/Preview/BuildingMesh.tsx`

---

*Architecture research for: MapMaker v1.1 — Overture Maps building footprint integration*
*Researched: 2026-02-28*
