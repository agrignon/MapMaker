# Feature Research

**Domain:** Map-to-3D-printable-STL web application — v1.1 Building Coverage milestone
**Researched:** 2026-02-28
**Confidence:** MEDIUM — Overture data schema verified via official docs (HIGH); browser access method requires a proxy/hosted layer (gap confirmed); deduplication algorithm confirmed at IoU level; height data completeness gaps confirmed but not numerically quantified.

---

> **Scope note:** v1.0 shipped all pipeline features (terrain, buildings, roads, water, vegetation, STL export, Web Worker).
> This file covers only the NEW features needed for v1.1: Overture Maps building footprint integration.
> Prior feature entries from the v1.0 milestone are in `.planning/milestones/v1.0-FEATURES.md`.

---

## Overture Maps Data Landscape

### What Overture Buildings Provides

Overture is an open data foundation (Amazon, Meta, Microsoft, TomTom, Esri) releasing a global building dataset that conflates multiple sources into a single schema. As of the 2026-02-18 release, the dataset contains 2.6+ billion building footprints.

**Sources (in conflation priority order, OSM = highest):**
1. OpenStreetMap (~672M buildings) — community data, highest priority
2. Esri Community Maps (~17M) — community contributions, LiDAR-derived heights in US
3. Instituto Geográfico Nacional España (~12.7M)
4. City of Vancouver (~17K)
5. Google Open Buildings (~1B, high/lower precision tiers)
6. Microsoft ML footprints (~711M AI-derived)
7. East Asian building dataset (~213M)

**Key insight for MapMaker:** ~40% of Overture records already come from OSM. When Overture is used as a gap-fill source (OSM preferred), the net new buildings come primarily from Microsoft and Google ML-derived footprints — which have global coverage but minimal height data.

### Overture Building Schema Fields

Verified via official docs at `docs.overturemaps.org/schema/reference/buildings/building/`:

| Field | Type | Coverage | Notes |
|-------|------|----------|-------|
| `geometry` | Polygon/MultiPolygon | 100% | Footprint (outer boundary) |
| `height` | number (meters) | LOW globally; higher in US | Populated from LiDAR, OSM tags, ML estimation |
| `num_floors` | integer | LOW-MEDIUM | More reliable than height in urban OSM areas |
| `min_height` | number | RARE | Floating structures only |
| `roof_shape` | enum | RARE | Mostly only where OSM has it |
| `roof_height` | number | RARE | Same |
| `facade_color` | string (hex) | RARE | Not relevant for 3D printing |
| `subtype` | enum | MEDIUM | residential, commercial, industrial, etc. |
| `class` | enum | MEDIUM | More specific than subtype |
| `sources[]` | array | 100% | Dataset names + record IDs (not a confidence score) |
| `has_parts` | boolean | LOW | Indicates associated building_part features |
| `names` | object | LOW | Optional building name |

**Critical finding:** Overture does NOT provide a per-feature `confidence` score in the buildings theme. The `sources[]` array lists provenance, but confidence values are present only in the Places theme, not buildings. Height data is sparse globally — ML-derived footprints (Microsoft, Google) typically have NO height field populated.

### Overture Deduplication (How Overture Handles Multi-Source Overlap)

Overture's own conflation pipeline uses **Intersection over Union (IoU)** geometry matching:
- Two features are considered the same building when their IoU exceeds 50%
- OSM data takes priority; ML data fills gaps where no OSM/community feature exists
- Features receive stable **GERS IDs** across releases
- ML features below area thresholds are excluded to remove false positives (solar panels, car ports, shipping containers)

**Implication for MapMaker:** Overture has already deduplicated OSM buildings against ML sources in their dataset. A MapMaker footprint that comes from Overture may have originally come from OSM. To avoid duplicating OSM buildings that already appear in both sources, MapMaker's deduplication must operate spatially against the OSM features it fetches — not on source metadata.

### Browser Access Constraints

Overture does NOT provide a REST API or bbox-queryable JSON endpoint accessible directly from a browser. Access methods:

| Method | Browser-accessible? | Notes |
|--------|---------------------|-------|
| S3 GeoParquet (DuckDB SQL) | NO | HTTPFS extension not available in DuckDB-WASM |
| Python CLI (`overturemaps download --bbox=...`) | NO | Server-side only |
| PMTiles (vector tiles) | YES (with library) | Range requests to S3; requires `pmtiles` JS library; zoom 13 needed for full attributes |
| Third-party REST API (overturemapsapi.com) | YES (with key) | Not official; self-hosted on GCP; requires signup |
| Fused UDFs | NO | Python library only |
| Hosted proxy/serverless function | YES | MapMaker can call a small Cloudflare Worker / AWS Lambda that runs the overturemaps Python CLI and returns GeoJSON |

**PMTiles approach (most viable for browser):**
- Public URL: `https://overturemaps-tiles-us-west-2-beta.s3.amazonaws.com/RELEASE/buildings.pmtiles`
- Use `pmtiles` npm package to make HTTP range requests in the browser
- Must request zoom level 13+ to get full attribute data (height, class, etc.)
- Downloads tile(s) covering the bbox — tile payload size for a dense urban bbox at z13 is several MB
- The `pmtiles` library decodes Mapbox Vector Tile (MVT) format; building geometries come as tile-relative coordinates requiring de-tiling to WGS84

---

## Feature Landscape

### Table Stakes (Users Expect These)

For the v1.1 Overture integration, these are features that must work correctly for the milestone to be considered done.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Overture building footprints fetched for selected bbox | The entire point of v1.1 — gap-fill requires getting the data | MEDIUM | Browser access requires PMTiles or a thin proxy; not a trivial `fetch()` call. Bounding box aligns with existing `mapBounds` store state. |
| Spatial deduplication: OSM preferred, Overture fills gaps | Without deduplication, buildings stack doubled — prints with doubled walls, incorrect density | HIGH | Core algorithmic challenge. Requires polygon intersection test (IoU or centroid-in-polygon) for each Overture feature against OSM set. RBush spatial index for performance. |
| Gap-fill buildings rendered as extruded boxes | Overture-only buildings need geometry. Flat roof / default height. Must visually match OSM building style. | LOW | Reuse existing `buildSingleBuilding()` pipeline. Pass Overture footprint as a `BuildingFeature` with synthetic properties. No new geometry code needed. |
| Correct terrain placement of Overture buildings | Overture buildings must sit on terrain surface, not float or clip through it | LOW | Existing BVH raycasting in `terrainRaycaster.ts` handles this — same pipeline as OSM buildings |
| Merged buildings included in STL export | Gap-fill buildings must appear in the exported STL, not just the preview | LOW | STL export already merges all `BuildingFeature[]` via `buildAllBuildings()`. Feed merged array into existing pipeline. |
| No UI changes required | Milestone is transparent to user — seamless gap-fill | LOW | Zustand store change may be needed to hold merged building array; no new controls |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Height cascade reuses OSM data when available | Overture ML footprints often have no height. Using the existing `resolveHeight()` cascade (area heuristic, type default) means gap-fill buildings still get plausible heights rather than all being the same. | LOW | `BuildingFeature` interface accepts arbitrary properties; pass `subtype`/`class` as `building` property to get type-based defaults from existing `height.ts`. |
| OSM building parts preserved for detailed buildings | Overture does NOT have building:part detail. By keeping OSM features for any building where OSM has coverage, the detailed gabled/hipped roofs from OSM are preserved. | LOW | This is a side effect of OSM-preferred deduplication — no extra work needed. |
| Spatial index for O(n log n) deduplication | Dense urban areas may have 1,000+ OSM buildings and 3,000+ Overture footprints. Naive O(n*m) intersection is too slow client-side. RBush spatial index makes the search tractable. | MEDIUM | RBush (v4, MIT) is already a transitive dep via three-mesh-bvh ecosystem; or add directly. Flatbush is faster for static datasets. |
| Deduplication threshold tunable | IoU-based deduplication can be tuned (e.g., 30% overlap = same building). Too high = misses duplicates at slight offsets (GPS error); too low = falsely removes adjacent buildings. | LOW | Single constant; default 30% overlap sufficient for typical alignment errors between OSM and ML footprints |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Display Overture building height/metadata in UI | Users might want to see where data came from | This is a transparency feature, not a quality feature; adds UI complexity with no print value; Overture heights are sparse outside US | No provenance UI. Log to console in dev mode only. |
| Use Overture height data for gap-fill buildings | Overture has height fields — use them | ML-derived footprints (the gap-fill cases) almost never have `height` populated. Providing false confidence in sparse data is worse than the existing area-heuristic cascade. Existing `resolveHeight()` produces better results for these buildings. | Pass Overture `height` field as a property if present; it will be consumed by tier-1 of the existing cascade, which already handles it correctly. |
| Overture building categories in 3D style | Overture has subtype/class enums — show commercial buildings differently from residential | Building category styling requires per-material mesh splitting, conflicts with the single-geometry STL merge, and Overture category coverage for ML footprints is sparse. | Use existing type-based height defaults in `height.ts`. No visual differentiation needed in v1.1. |
| Confidence-score filtering of Overture buildings | Filter out low-confidence footprints | Overture buildings theme does NOT have a confidence score field. The `sources[]` array does not carry a numeric confidence. This feature does not exist to implement. | Use minimum area threshold (>10 m²) to filter out ML noise — same approach Overture itself uses internally. |
| Real-time Overture data freshness (live S3 query) | Always get latest Overture release | DuckDB WASM cannot query S3 GeoParquet directly due to missing HTTPFS extension. PMTiles S3 URLs change with each release (release date in path). Polling for the latest release URL adds fragility. | Target a specific recent Overture PMTiles release in the implementation; update the URL with each MapMaker release. |
| Fetch Overture data for the entire visible map extent | Get all buildings, not just selected bbox | The selected bbox is already area-capped at 25 km² (hard limit). Fetching a larger extent means more data, more deduplication work, more build time, and more STL size — all of which hurt UX. | Fetch only for the user's selected bbox, exactly as OSM is fetched. |

## Feature Dependencies

```
[Existing v1.0 — already shipped]
    [OSM Building Fetch] → [parseBuildingFeatures()] → [BuildingFeature[]] → [buildAllBuildings()] → [BufferGeometry]
                                                                                    ↑
[New v1.1 additions]                                                                |
                                                                                    |
[Overture Building Fetch (bbox)]                                                    |
    └──requires──> [PMTiles JS library OR thin server-side proxy]                   |
    └──requires──> [bbox from mapStore (already exists)]                            |
    └──produces──> [OvertureBuilding[] (GeoJSON Feature[] with height/class)]       |
                         |                                                           |
                         ↓                                                           |
[Spatial Deduplication]                                                             |
    └──requires──> [OSM BuildingFeature[] (from existing parse pipeline)]           |
    └──requires──> [OvertureBuilding[] (from new fetch)]                            |
    └──uses──> [RBush spatial index for OSM bbox lookup]                            |
    └──uses──> [polygon intersection (centroid-in-bbox OR IoU)]                     |
    └──produces──> [filtered OvertureBuilding[] (no OSM overlap)]                   |
                         |                                                           |
                         ↓                                                           |
[Overture→BuildingFeature Adapter]                                                  |
    └──converts──> [OvertureBuilding geometry → [lon,lat][] outerRing]              |
    └──converts──> [height/class fields → properties Record<string, string>]        |
    └──produces──> [BuildingFeature[] (Overture-sourced, adapter format)]           |
                         |                                                           |
                         ↓                                                           |
[Merged BuildingFeature Array]                                                      |
    └──concat──> [OSM BuildingFeature[]] + [Overture-adapted BuildingFeature[]]  ───┘
    └──feeds existing──> [buildAllBuildings() → BufferGeometry → preview + STL]
```

### Dependency Notes

- **Overture fetch depends on access method decision:** PMTiles (browser-native, no backend needed) vs. thin proxy (simpler code, requires a deployed function). This is the single highest-risk decision in the milestone — see PITFALLS.md.
- **Deduplication must run before the adapter step:** Filtering happens on Overture features before converting to `BuildingFeature`, to avoid paying the adapter cost for rejected buildings.
- **OSM fetch is unchanged:** Existing `overpass.ts` combined fetch continues to work exactly as before. Overture is additive.
- **`buildAllBuildings()` is unchanged:** Accepts `BuildingFeature[]` regardless of source. The adapter step is the integration seam.
- **Web Worker already exists:** The merged `BuildingFeature[]` can be passed to the existing worker as-is — the worker doesn't know or care about data source.
- **Terrain raycasting is unchanged:** `terrainRaycaster.ts` BVH raycasting applies to all building features uniformly.

## MVP Definition

### Launch With (v1.1)

This milestone has one goal: more buildings everywhere, seamlessly.

- [ ] **Overture building footprint fetch** — Retrieve Overture buildings for the selected bbox, browser-accessible. Method TBD (PMTiles or proxy) based on implementation research.
- [ ] **Spatial deduplication (OSM preferred)** — Filter Overture footprints that overlap an OSM building (by bbox intersection + centroid-in-polygon or IoU >= 30%). Keep OSM; discard Overture duplicate.
- [ ] **Overture-to-BuildingFeature adapter** — Convert Overture GeoJSON Feature to `BuildingFeature` interface; map `height`, `num_floors`, `subtype`, `class` to `properties` keys the existing height cascade understands.
- [ ] **Gap-fill geometry (extruded flat box)** — Overture-sourced buildings render as flat-roofed extruded footprints using existing pipeline. No new geometry code.
- [ ] **Merged pipeline end-to-end** — OSM + gap-fill buildings both appear in preview and STL export.

### Add After Validation (v1.x)

- [ ] **Minimum area filter** — Filter Overture footprints below ~10 m² (garages, outbuildings, ML noise). Trigger: user reports of tiny floating geometry.
- [ ] **Overture data freshness** — Pin and update the PMTiles release URL when Overture publishes a new release. Trigger: release cadence (monthly); document as a maintenance task.
- [ ] **Source attribution in console** — Log count of OSM buildings + Overture gap-fill buildings to browser console in dev mode. Useful for debugging coverage. Trigger: developer request.

### Future Consideration (v2+)

- [ ] **Overture building parts (building_part theme)** — Overture has a separate building_part type with roof geometry for some buildings. Coverage is low and adds significant parsing complexity. Defer.
- [ ] **Height from Overture LiDAR sources** — In the US, Esri contributes LiDAR-derived heights. A future milestone could prefer Overture height where it comes from LiDAR sources (identifiable in `sources[]`). Defer until height coverage improves globally.
- [ ] **Alternative gap-fill sources** — Microsoft Global ML Building Footprints (separate dataset, ~1.4B buildings, available as GeoJSON by quad-key). Could supplement or replace Overture for some regions. Defer; evaluate if Overture coverage proves insufficient.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Overture footprint fetch (PMTiles) | HIGH | MEDIUM-HIGH | P1 |
| Spatial deduplication (OSM preferred) | HIGH | HIGH | P1 |
| Overture→BuildingFeature adapter | HIGH | LOW | P1 |
| Gap-fill geometry (flat box extrusion) | HIGH | LOW (reuses existing) | P1 |
| Merged pipeline in preview + STL | HIGH | LOW (pipe change only) | P1 |
| Minimum area filter | MEDIUM | LOW | P2 |
| Source attribution logging | LOW | LOW | P2 |
| PMTiles release URL updater | MEDIUM | LOW | P2 |
| Overture building_part support | MEDIUM | HIGH | P3 |
| LiDAR height preference logic | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for v1.1 launch
- P2: Add when core works; polish
- P3: Future consideration

## Implementation Notes by Feature

### Overture Building Fetch

**Recommended approach: PMTiles via `pmtiles` JS library**

The `pmtiles` npm package supports HTTP range requests against the public S3 endpoint:
```
https://overturemaps-tiles-us-west-2-beta.s3.amazonaws.com/2026-02-18/buildings.pmtiles
```

Workflow:
1. Compute tile coordinates covering the user bbox at zoom 13
2. Fetch relevant tile(s) via HTTP range request (PMTiles handles this)
3. Decode MVT (Mapbox Vector Tile) format to GeoJSON features
4. Filter features within the bbox polygon (tiles are larger than exact bbox)

**Constraints:**
- `pmtiles` package adds ~50KB to bundle (acceptable)
- Tile size at z13 for a dense urban 4 km² bbox: ~1-5MB per tile
- CORS: AWS S3 allows cross-origin range requests for these public buckets (verified via Azure Maps example using same endpoint)
- Zoom 13 required for full attribute data per Overture docs

**Alternative: Thin server proxy**

A Cloudflare Worker or Vercel Edge Function can call `overturemaps download --bbox=... -f geojson` and return GeoJSON. Simpler to parse but requires deployment of backend infrastructure — contradicts the "all client-side" architecture of MapMaker.

**Recommendation:** PMTiles approach. Keeps client-side architecture. Additional dep is small and well-maintained.

### Spatial Deduplication

**Algorithm:**

```
Input: osmBuildings: BuildingFeature[], overtureBuildings: OvertureFeature[]
Output: filteredOverture: OvertureFeature[]  (no OSM overlap)

1. Build RBush index over osmBuildings bboxes
2. For each overtureBuilding:
   a. Query RBush with overture bbox → candidateOSMBuildings[]
   b. If no candidates → keep (no overlap possible)
   c. For each candidate:
      - Compute centroid of overtureBuilding
      - Test if centroid is inside candidate OSM polygon (point-in-polygon)
      - OR compute IoU of bboxes as fast pre-filter, then polygon IoU if > threshold
   d. If any candidate overlap >= 30% IoU → discard overture building (OSM has it)
3. Return surviving overtureBuildings
```

**JavaScript implementation:**
- `rbush` (v4, MIT) for spatial index — O(log n) bbox lookup
- Centroid-in-polygon: turf.js `booleanPointInPolygon()` or manual ray-casting (simpler, no dep)
- IoU: compute intersection area / union area for two polygons — `@turf/intersect` + area calculation

**Performance estimate for 4 km² dense urban:**
- OSM buildings: ~500–2,000
- Overture buildings: ~1,000–4,000 (including ML-only)
- With RBush: 4,000 × O(log 2,000) lookups ≈ ~44,000 operations — negligible (<10ms)
- Polygon intersection for candidates (typically 1-3 per lookup): ~50ms total in worst case

**Threshold:** 30% IoU as default. This handles typical GPS alignment errors (~5-10m) between OSM and ML footprints without false-positives for adjacent buildings.

### Overture-to-BuildingFeature Adapter

Overture features arrive as GeoJSON `Feature<Polygon|MultiPolygon>`. The adapter maps fields to the `BuildingFeature` interface already used throughout the pipeline:

```typescript
interface OvertureBuilding {
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] };
  properties: {
    height?: number;
    num_floors?: number;
    subtype?: string;   // residential, commercial, industrial…
    class?: string;     // house, apartments, office…
  };
}

function adaptOvertureBuilding(feature: OvertureBuilding): BuildingFeature {
  const props: Record<string, string | undefined> = {};
  if (feature.properties.height) props['height'] = String(feature.properties.height);
  if (feature.properties.num_floors) props['building:levels'] = String(feature.properties.num_floors);
  // Map subtype/class to building tag for height.ts type defaults
  props['building'] = feature.properties.class ?? feature.properties.subtype ?? 'yes';

  return {
    properties: props,
    outerRing: extractOuterRing(feature.geometry),
    holes: extractHoles(feature.geometry),
  };
}
```

**Height cascade behavior for Overture buildings:**
- Tier 1 (`height` tag): Fires if Overture has height data (LiDAR-sourced, rare globally)
- Tier 2 (`building:levels`): Fires if Overture has `num_floors` (moderate coverage in urban OSM-originated features)
- Tier 3 (footprint area heuristic): Most common for ML footprints — good default
- Tier 4 (type defaults): Fires for named subtypes without area data

This means the existing height cascade in `height.ts` works correctly with no changes.

### Minimum Area Filter

Before the adapter step, filter Overture features with polygon area below 10 m² (approximate). This mirrors Overture's own internal ML noise filter.

Overture's ML sources exclude shipping containers, carports, and solar panels using size thresholds internally, but these occasionally slip through. A 10 m² floor prevents noise from reaching the mesh pipeline.

Implementation: compute bounding box area as a fast pre-filter (actual polygon area only for features that pass bbox threshold). No turf.js needed — simple `(maxLon - minLon) * (maxLat - minLat) * 111,320 * 111,320 * cos(lat)`.

## Competitor Feature Analysis

| Feature | TerraPrinter | Map2Model | MapMaker v1.0 | MapMaker v1.1 |
|---------|--------------|-----------|----------------|----------------|
| Building data source | OSM only | OSM only | OSM only | OSM + Overture gap-fill |
| Coverage in low-OSM areas | Poor | Poor | Poor | Better (ML-backed) |
| Building deduplication logic | N/A | N/A | N/A | IoU-based, OSM preferred |
| Height for gap-fill buildings | N/A | N/A | N/A | Area heuristic cascade |
| Roof geometry for gap-fill | N/A | N/A | N/A | Flat only (ML footprints have no roof data) |
| Transparent / no UI change | N/A | N/A | N/A | Yes — seamless |

## Sources

- [Overture Maps Buildings Overview](https://docs.overturemaps.org/guides/buildings/) — HIGH confidence, official docs, accessed 2026-02-28
- [Overture Maps Building Schema Reference](https://docs.overturemaps.org/schema/reference/buildings/building/) — HIGH confidence, official schema docs
- [Overture Maps PMTiles Documentation](https://docs.overturemaps.org/examples/overture-tiles/) — HIGH confidence, official examples
- [Overture Maps Getting Data](https://docs.overturemaps.org/getting-data/) — HIGH confidence, official docs
- [DuckDB-WASM + Overture (Camptocamp blog)](https://dev.to/camptocamp-geo/querying-overture-maps-geoparquet-directly-in-the-browser-with-duckdb-wasm-4jn4) — MEDIUM confidence, confirms HTTPFS limitation in browser
- [RBush spatial index](https://github.com/mourner/rbush) — HIGH confidence, well-documented MIT library
- [Turf.js booleanPointInPolygon](https://turfjs.org/docs/api/booleanPointInPolygon) — HIGH confidence, official API docs
- [Overture vs OSM building footprints analysis](https://milanjanosov.substack.com/p/overture-vs-osm-building-footprints) — MEDIUM confidence, third-party analysis
- [OSM Completeness with Overture Maps (HeiGIT)](https://heigit.org/osm-completeness-with-overture-maps-data/) — MEDIUM confidence, academic research
- [Azure Maps PMTiles sample using Overture buildings S3 endpoint](https://github.com/Azure-Samples/AzureMapsCodeSamples/blob/main/Samples/PMTiles/Overture%20Building%20Theme/Buildings.html) — HIGH confidence, confirms CORS access pattern
- MapMaker v1.0 codebase (`src/lib/buildings/`) — HIGH confidence, direct source of integration constraints

---
*Feature research for: MapMaker v1.1 — Overture Maps building footprint gap-fill integration*
*Researched: 2026-02-28*
