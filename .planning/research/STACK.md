# Stack Research

**Domain:** Overture Maps building footprint integration — bounding-box fetch, vector tile decode, spatial deduplication against OSM buildings
**Researched:** 2026-02-28
**Confidence:** HIGH for fetch approach (PMTiles + pmtiles npm); HIGH for vector tile decode (@mapbox/vector-tile + pbf); MEDIUM for spatial deduplication (turf vs. rbush trade-offs are well-understood but need benchmark validation against real datasets)

---

> **Scope note:** This document covers ONLY the new stack additions for the v1.1 milestone.
> The existing validated stack (React 19, Three.js R3F, Zustand, Vite 6, Vitest, MapLibre GL JS 5,
> @mapbox/martini, earcut, proj4, osmtogeojson, geometry-extrude, comlink, three-bvh-csg, manifold-3d)
> is not re-researched here.

---

## Recommended Stack — New Additions

### 1. Overture Buildings Fetch: PMTiles + pmtiles npm

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| `pmtiles` | `^4.4.0` | Fetch individual vector tiles from the Overture buildings PMTiles archive via HTTP range requests | Overture publishes buildings as PMTiles (MVT format inside a single `.pmtiles` file on S3). The `pmtiles` npm package implements the PMTiles spec in JavaScript/TypeScript, works in the browser via Fetch API, uses HTTP range requests so only the tiles covering the bounding box are downloaded — NOT the entire ~50 GB file. Version 4.4.0 is the current release (published ~23 days before this research date). Ships as ES module. No WASM. No server required. |

**Why NOT DuckDB WASM:** DuckDB WASM does not support the `httpfs` extension, so it cannot query Overture's S3-hosted GeoParquet files from the browser. A workaround (pre-extract + host locally) defeats the purpose of a client-side-only architecture.

**Why NOT direct GeoParquet in browser:** No maintained JavaScript-native GeoParquet browser parser exists. The official approach is server-side (Python CLI, DuckDB server, AWS Athena). DuckDB WASM is the closest option but is blocked by the httpfs limitation above.

**Why NOT Fused UDF HTTP API:** Fused provides a serverless UDF platform that can expose Overture data via HTTP endpoints, but it is a third-party service with its own authentication and pricing, introduces a dependency on an external SaaS, and is not appropriate for a client-only open-data tool.

**Why NOT the unofficial overturemapsapi.com:** A community-maintained API that deploys via GCP/BigQuery. Requires the user to self-host and introduces a backend dependency. Not suitable for MapMaker's fully client-side architecture.

**Fetch pattern:**
```typescript
import { PMTiles } from 'pmtiles';

const OVERTURE_BUILDINGS_URL =
  'https://tiles.overturemaps.org/2026-02-18.0/buildings.pmtiles';

const p = new PMTiles(OVERTURE_BUILDINGS_URL);

// Convert bbox [minLon, minLat, maxLon, maxLat] to z/x/y tiles at zoom 14
// then call p.getZxy(z, x, y) for each tile in range
const tileData = await p.getZxy(14, tileX, tileY);
```

**PMTiles URL discovery:** Overture publishes a STAC catalog at `https://stac.overturemaps.org/catalog.json` with a `latest` field. The catalog structure is:
```
https://labs.overturemaps.org/stac/{release}/buildings/catalog.json
  → link rel="pmtiles" → https://tiles.overturemaps.org/{release}/buildings.pmtiles
```
The application should hard-code a known-good release URL and update it monthly, OR dynamically resolve via the STAC catalog on startup.

**Data retention warning (MEDIUM confidence):** As of September 2025, Overture maintains only the two most recent monthly releases (~60 days). Hard-coded URLs will break after ~2 months. Dynamic STAC discovery is the correct long-term approach.

**CORS:** The `tiles.overturemaps.org` domain (confirmed for 2026-02-18.0 release) is publicly accessible. The Overture S3 buckets have CORS configured for GET/HEAD with the `range` header allowed, which is required for PMTiles HTTP range requests. This works from the browser without a proxy.

---

### 2. Vector Tile Decoding: @mapbox/vector-tile + pbf

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| `@mapbox/vector-tile` | `^2.0.4` | Parse MVT (Mapbox Vector Tile) binary data into JavaScript feature objects with geometry and properties | PMTiles stores tiles in MVT format. The `@mapbox/vector-tile` library is the reference implementation for the MVT spec. Provides `VectorTile` class that parses tile bytes into layers. Source layer for Overture buildings is `"building"`. Returns feature geometry as pixel coordinates that must be converted back to geographic coordinates. |
| `pbf` | `^4.0.1` | Low-level Protocol Buffer decoder — required peer dependency of `@mapbox/vector-tile` | `@mapbox/vector-tile` takes a `Protobuf` instance (from `pbf`) as input. The `pbf` library is 3KB gzipped, maintained by Mapbox. MapLibre GL JS (already in the project) bundles pbf internally, but it should be added as an explicit dependency since we need to import it in our code. |

**Source layer name:** `"building"` (confirmed from Azure Maps + Overture sample code).

**Available properties from MVT tiles:**
- `height` — float, building height in meters (may be absent; default to 3.0m = 1 floor)
- `subtype` — string, building category (residential, commercial, etc.)
- `names` — JSON-encoded string (stringify nested object)
- `sources` — JSON-encoded string

**Zoom level:** Buildings are present from zoom 13 through zoom 15 (max). Zoom 14 is the recommended query zoom for MapMaker's bounding box sizes (1–25 km²). At zoom 14, one tile covers ~2.4 km × 2.4 km, so a 4 km² bbox requires ~4 tiles at most.

**Decode pattern:**
```typescript
import { VectorTile } from '@mapbox/vector-tile';
import Protobuf from 'pbf';

function decodeTile(buffer: ArrayBuffer) {
  const tile = new VectorTile(new Protobuf(buffer));
  const layer = tile.layers['building'];
  if (!layer) return [];

  const features = [];
  for (let i = 0; i < layer.length; i++) {
    const feature = layer.feature(i);
    // feature.loadGeometry() returns pixel coordinates [0..4096]
    // Must convert to lon/lat using tile z/x/y + extent (4096)
    const geometry = feature.loadGeometry();
    const props = feature.properties;
    features.push({ geometry, props });
  }
  return features;
}
```

**Coordinate conversion:** MVT geometry is in tile-local pixel coordinates (0–4096 range). To convert back to WGS84 lon/lat, use the standard tile-to-lnglat formula based on z/x/y and the pixel position within the tile. No additional library needed — this is ~10 lines of math.

**Types:** `@types/mapbox__vector-tile` provides TypeScript types for the library.

---

### 3. Spatial Deduplication: @turf/boolean-intersects (tree-shaken import)

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| `@turf/boolean-intersects` | `^7.3.1` | Test whether two polygons intersect (share any area) | The deduplication algorithm is: for each Overture footprint, check if any OSM building polygon intersects it. If yes, discard the Overture footprint (OSM wins). `booleanIntersects` returns true if the intersection of two geometries is non-empty — exactly the right predicate. Package is 13.4 KB, ships as ES module (tree-shaking works). |

**Why NOT full `turf` package:** The monolithic `turf` package is 68+ KB even tree-shaken for this use case. Installing only `@turf/boolean-intersects` gives a 13.4 KB package with the exact predicate needed.

**Why NOT `@turf/intersect`:** `intersect` computes the actual intersection polygon (more expensive). For deduplication, we only need a boolean answer. `booleanIntersects` is faster.

**Why NOT `rbush` alone:** rbush is a spatial index that accelerates bounding-box candidate lookup, but it only tests bounding box overlap — not polygon overlap. Bounding boxes of adjacent buildings can overlap even when the buildings themselves do not. For accurate deduplication we need actual polygon intersection testing. rbush would be an optimization layer on top of `booleanIntersects` if performance demands it (see Stack Patterns section below).

**Why NOT custom polygon intersection:** Robust polygon intersection is a non-trivial computational geometry problem (handling shared edges, floating-point precision, non-convex polygons). Using turf's battle-tested implementation avoids subtle bugs.

**Deduplication algorithm:**
```typescript
import { booleanIntersects } from '@turf/boolean-intersects';
import type { Feature, Polygon } from 'geojson';

function deduplicateOverture(
  osmBuildings: Feature<Polygon>[],
  overtureBuildings: Feature<Polygon>[]
): Feature<Polygon>[] {
  return overtureBuildings.filter((overture) =>
    !osmBuildings.some((osm) => booleanIntersects(osm, overture))
  );
}
```

**Performance note:** For typical MapMaker bounding boxes (≤25 km²), expected OSM building counts are 50–2000, and Overture footprints in the same area are 100–5000. The naive O(n×m) `booleanIntersects` loop should complete in < 100ms for these sizes. If profiling reveals a bottleneck, add `rbush@4.0.0` as a bounding-box pre-filter to reduce candidates before calling `booleanIntersects`.

---

## Installation

```bash
# Overture fetch
npm install pmtiles

# MVT decode
npm install @mapbox/vector-tile pbf
npm install -D @types/mapbox__vector-tile

# Spatial deduplication
npm install @turf/boolean-intersects
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `pmtiles` npm + HTTP range requests | DuckDB WASM + GeoParquet | If DuckDB WASM adds httpfs support in a future release. As of Feb 2026, httpfs is not available in WASM, making this approach impossible for S3-hosted GeoParquet. |
| `pmtiles` npm + HTTP range requests | Self-hosted proxy server (DuckDB/Python backend) | If the project adds a backend in the future. Would allow arbitrary Parquet queries. Not suitable for current client-only architecture. |
| `@mapbox/vector-tile` | Manual Protobuf parsing | Only if `@mapbox/vector-tile` is no longer maintained. It is the reference implementation and is actively maintained (v2.0.4, Jul 2025). |
| `@turf/boolean-intersects` | Custom point-in-polygon overlap test | If Overture footprints are convex and simple, a centroid-based test (is the centroid inside the OSM polygon?) would work as a 90% approximation. Use only if booleanIntersects is too slow for very dense areas. |
| `@turf/boolean-intersects` alone | `rbush` + `@turf/boolean-intersects` | Add `rbush@4.0.0` as a bounding-box pre-filter if O(n×m) intersection is too slow. For MapMaker's bounding box sizes this is unlikely to be needed — benchmark first. |

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| DuckDB WASM | No httpfs in WASM as of Feb 2026. Cannot query S3 GeoParquet from browser. Build size impact is also 6+ MB. | `pmtiles` npm with HTTP range requests |
| Full `turf` package (`import turf from '@turf/turf'`) | 68+ KB bundle weight for a feature that only needs a 13 KB sub-package | Import `@turf/boolean-intersects` directly |
| `overturemaps-py` Python CLI | Server-side tool, incompatible with browser-only architecture | `pmtiles` npm |
| GeoParquet browser parsers (`geoarrow-js`, `@loaders.gl/parquet`) | No stable, well-maintained GeoParquet library for browsers exists as of Feb 2026 that can range-request partial Parquet files from S3. These libraries require full file download or a server. | `pmtiles` npm reading from Overture's PMTiles distribution |
| `rbush` as the primary deduplication method | rbush indexes bounding boxes, not polygons. Two buildings can have overlapping bboxes but non-overlapping footprints. Bounding-box-only deduplication produces false positives (discards valid gap-fill buildings). | `@turf/boolean-intersects` for polygon-level accuracy |

## Stack Patterns by Variant

**If bounding box is small (< 4 km²):**
- Fetch tiles at zoom 14 (typically 1–4 tiles)
- Decode all features in one pass
- Run `booleanIntersects` deduplication inline (no pre-filter needed)

**If bounding box is at the 25 km² hard limit:**
- Fetch tiles at zoom 13 (fewer, larger tiles) OR zoom 14 (more tiles but better feature granularity)
- Consider adding `rbush` bbox pre-filter before `booleanIntersects` to keep deduplication under 200ms
- Run deduplication inside the existing Web Worker to keep UI non-blocking

**If Overture PMTiles URL changes (monthly releases):**
- Fetch `https://labs.overturemaps.org/stac/catalog.json`, read `latest` field
- Navigate to `https://labs.overturemaps.org/stac/{latest}/buildings/catalog.json`
- Find the link with `rel: "pmtiles"` and use its `href` as the PMTiles URL
- Cache the resolved URL for the session

## Integration Points with Existing Code

| Existing File | How v1.1 Integrates |
|---------------|---------------------|
| `src/lib/buildings/types.ts` | Add `overtureSource?: true` flag to `BuildingFeature` to mark gap-fill buildings |
| `src/lib/buildings/parse.ts` | Add parallel `parseOvertureFeatures(tiles)` function that converts MVT features to `BuildingFeature` array |
| `src/lib/buildings/merge.ts` | Add `mergeWithOverture(osmBuildings, overtureBuildings)` that runs deduplication and returns combined array |
| `src/lib/overpass.ts` or new `src/lib/overture.ts` | New file: `fetchOvertureBuildings(bbox)` — resolves tiles from bbox, calls `pmtiles.getZxy()`, decodes MVT |
| `src/workers/meshBuilder.worker.ts` | Extend worker to call `fetchOvertureBuildings` in parallel with the existing Overpass fetch |

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `pmtiles@4.4.0` | Vite 6, ES module builds | Ships as ES module. No WASM, no native Node addons. Works in Vite's dev server and production build. |
| `@mapbox/vector-tile@2.0.4` | `pbf@4.x` | Requires `pbf` as a peer. MapLibre GL JS 5 bundles its own pbf internally — do NOT share; install pbf explicitly so our import resolves independently. |
| `@turf/boolean-intersects@7.3.1` | Vite 6, tree-shaking | v7 is ES module with proper `sideEffects: false`. Vite tree-shakes correctly. |
| `pmtiles@4.4.0` | `maplibre-gl@5.x` | MapLibre GL JS already registers the `pmtiles://` protocol handler internally if the `pmtiles` package is present. To avoid double-registration, check before calling `Protocol.add()`. |

## Sources

- [Overture Maps PMTiles documentation](https://docs.overturemaps.org/examples/overture-tiles/) — PMTiles URL format, zoom levels, source layer name `"building"` (MEDIUM confidence, official docs; source-layer confirmed via Azure Maps sample code)
- [Azure Maps Overture Buildings sample](https://github.com/Azure-Samples/AzureMapsCodeSamples/blob/main/Samples/PMTiles/Overture%20Building%20Theme/Buildings.html) — source-layer `"building"`, `height` property, PMTiles URL pattern (HIGH confidence, official Microsoft sample)
- STAC catalog navigation `https://labs.overturemaps.org/stac/2026-02-18.0/buildings/catalog.json` — resolved exact PMTiles URL `https://tiles.overturemaps.org/2026-02-18.0/buildings.pmtiles` (HIGH confidence, direct catalog inspection)
- [pmtiles npm](https://www.npmjs.com/package/pmtiles) — version 4.4.0, published ~23 days before this research date (HIGH confidence, npm registry)
- [PMTiles TypeDoc: PMTiles class](https://pmtiles.io/typedoc/classes/PMTiles.html) — `getZxy(z, x, y)` is the only tile fetch method; no built-in bbox query (HIGH confidence, official docs)
- [Overture Maps STAC announcement](https://docs.overturemaps.org/blog/2026/02/11/stac/) — `latest` field in root catalog, STAC-based URL discovery pattern (HIGH confidence, official blog)
- [Overture data retention policy](https://docs.overturemaps.org/blog/2025/09/24/release-notes/) — 60-day window, two most recent releases kept (HIGH confidence, official release notes)
- [@mapbox/vector-tile npm](https://www.npmjs.com/package/@mapbox/vector-tile) — version 2.0.4, last published Jul 2025 (HIGH confidence, npm registry)
- [@turf/boolean-intersects npm](https://www.npmjs.com/package/@turf/boolean-intersects) — version 7.3.1, package size 13.4 KB (HIGH confidence, npm registry)
- [Overture buildings schema reference](https://docs.overturemaps.org/schema/reference/buildings/building/) — `height` is `float64` in meters, `num_floors` is `int32` (HIGH confidence, official schema docs)
- [DuckDB WASM + GeoParquet browser article](https://dev.to/camptocamp-geo/querying-overture-maps-geoparquet-directly-in-the-browser-with-duckdb-wasm-4jn4) — confirms httpfs not available in WASM; requires pre-extracted data (HIGH confidence, verifies the limitation)

---
*Stack research for: MapMaker v1.1 — Overture Maps building footprint integration*
*Researched: 2026-02-28*
