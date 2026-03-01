# Project Research Summary

**Project:** MapMaker v1.1 — Overture Maps Building Gap-Fill Integration
**Domain:** Browser-native geospatial data integration for 3D-printable terrain models
**Researched:** 2026-02-28
**Confidence:** HIGH (stack and architecture have HIGH confidence from direct codebase inspection and official documentation; one LOW-confidence gap remains on the MVT layer name inside the Overture PMTiles archive)

## Executive Summary

MapMaker v1.1 adds a single high-value capability: gap-fill buildings from Overture Maps in areas where OpenStreetMap coverage is sparse. The integration is purely additive — the entire downstream pipeline (mesh worker, geometry builder, STL export) is unchanged. The seam is in `fetchOsmLayersStandalone()` in `GenerateButton.tsx`, where Overture buildings are fetched in parallel with the existing Overpass request, deduplicated against OSM (OSM always wins on overlap), and merged into the same `BuildingFeature[]` array that already flows through the rest of the system.

The recommended browser-access approach for Overture data is PMTiles via HTTP range requests using the `pmtiles` npm package (v4.4.0). This is the only viable option that preserves MapMaker's fully client-side architecture — DuckDB WASM cannot query S3 GeoParquet from the browser due to missing HTTPFS support, and a thin server proxy would require deploying backend infrastructure. PMTiles tiles covering the user's bounding box are fetched at zoom 14, decoded from MVT format using `@mapbox/vector-tile` + `pbf`, and then filtered and adapted to the existing `BuildingFeature` interface. Three new libraries totaling under 100KB are required.

The primary risks are: (1) the PMTiles URL is release-date-specific and will 404 after Overture's next monthly rotation — the fix is graceful degradation to OSM-only plus a STAC-catalog URL discovery strategy; (2) spatial deduplication must be IoU-based at the polygon level, not centroid-distance, because complex building footprints defeat naive heuristics and produce double-rendered buildings in the STL; and (3) one operational fact requires empirical verification before code is written — the MVT source-layer name inside the Overture buildings PMTiles archive (expected `"building"`, confirmed via Azure Maps sample code, but must be validated by fetching a tile at pmtiles.io before shipping).

## Key Findings

### Recommended Stack

The v1.0 validated stack (React 19, Three.js R3F, Zustand, Vite 6, Vitest, MapLibre GL JS 5, @mapbox/martini, earcut, osmtogeojson, geometry-extrude, comlink, three-bvh-csg, manifold-3d) is unchanged. Three new packages are added:

**Core new technologies:**
- `pmtiles@^4.4.0` — fetches individual vector tiles from the Overture buildings PMTiles archive via HTTP range requests; the only browser-viable approach for querying Overture's S3-hosted dataset without a backend
- `@mapbox/vector-tile@^2.0.4` + `pbf@^4.0.1` — decodes MVT (Mapbox Vector Tile) binary format from PMTiles tiles into GeoJSON-like feature objects; `pbf` is a required peer dependency; MapLibre GL JS 5 bundles its own `pbf` internally so install `pbf` explicitly for independent resolution
- `@turf/boolean-intersects@^7.3.1` — 13.4KB tree-shaken package for polygon intersection testing during spatial deduplication; use this sub-package rather than the full 68KB `turf` monolith

**Recommended deduplication approach:** Bounding-box IoU (zero dependencies, ~10 lines of arithmetic) handles 99% of cases correctly and avoids Turf.js bundle weight. Escalate to `@turf/boolean-intersects` for exact polygon testing only if bounding-box IoU produces visible false negatives in testing.

**Version compatibility:** `pmtiles@4.4.0` ships as an ES module with no WASM and no native addons — works directly with Vite 6. `@turf/boolean-intersects@7.3.1` is ES module with `sideEffects: false` — Vite tree-shakes correctly.

See `.planning/research/STACK.md` for full alternatives analysis, rejected approaches (DuckDB WASM, GeoParquet, third-party API), and npm installation commands.

### Expected Features

This milestone has one goal: more buildings everywhere, seamlessly, with no UI changes visible to users.

**Must have (P1 — v1.1 launch):**
- Overture building footprint fetch for selected bbox — retrieves Overture buildings via PMTiles browser access using the user's existing `mapBounds` store state
- Spatial deduplication (OSM preferred) — filters Overture footprints that overlap OSM buildings; OSM wins on any overlap; 30% bounding-box IoU threshold handles GPS/projection alignment differences
- Overture-to-BuildingFeature adapter — maps Overture GeoJSON Feature fields (`height`, `num_floors`, `subtype`, `class`) to the existing `BuildingFeature.properties` format understood by the height cascade in `height.ts`
- Gap-fill geometry (extruded flat box) — Overture-sourced buildings render using existing `buildSingleBuilding()` pipeline with no new geometry code
- Merged pipeline end-to-end — OSM + gap-fill buildings both appear in preview and STL export

**Should have (P2 — after core works):**
- Minimum area filter (>= 15 m²) — removes ML-detected sheds, kiosks, and solar panels that slip through Overture's internal noise filter
- PMTiles release URL maintenance — update the hardcoded PMTiles URL constant when Overture publishes a new monthly release (~60-day window before URLs expire)
- Source attribution logging — `console.log` counts of OSM vs. Overture buildings in dev mode for debugging coverage gaps

**Defer (v2+):**
- Overture building parts (`building_part` theme) — adds roof geometry for some buildings but low global coverage and high parsing complexity
- LiDAR-derived height preference from Overture `sources[]` — useful in the US where Esri contributes LiDAR heights, but globally sparse
- Alternative gap-fill sources — Microsoft Global ML Building Footprints as a regional supplement

**Anti-features (confirmed problematic, do not implement):**
- Confidence-score filtering: Overture buildings theme has no confidence score field; `sources[]` lists provenance but not a numeric confidence value
- Real-time Overture data freshness (live STAC polling on every request): adds fragility; pin to a known release and update per MapMaker release cycle
- Overture building category styling in 3D preview: conflicts with the single-geometry STL merge; ML footprint category coverage is too sparse to be useful

See `.planning/research/FEATURES.md` for the full feature dependency diagram, competitor analysis table, and implementation notes per feature.

### Architecture Approach

The integration seam is narrow and well-defined. The only file requiring meaningful modification is `GenerateButton.tsx` — specifically its `fetchOsmLayersStandalone()` function, which gains a parallel Overture fetch and a merge call before `setBuildingFeatures()`. Two new files are created. All other files — the store, `BuildingMesh.tsx`, the mesh worker, `buildAllBuildings()`, and the STL export pipeline — are unchanged.

**New components:**
1. `src/lib/buildings/overture.ts` — PMTiles fetch + MVT decode + tile-to-WGS84 coordinate transform + property mapping; exports `fetchOvertureBuildings(bbox): Promise<BuildingFeature[]>`
2. `src/lib/buildings/deduplicate.ts` — `mergeAndDeduplicateBuildings(osm, overture)` using bounding-box IoU at 0.3 threshold; OSM always wins on overlap; returns a single `BuildingFeature[]` for the store

**Modified file:**
- `src/components/Sidebar/GenerateButton.tsx` — `fetchOsmLayersStandalone()` runs OSM and Overture fetches in parallel via `Promise.allSettled()`; degrades silently to OSM-only if Overture fails

**Critical design decisions enforced by research:**
- Merge at the data ingestion point, not in the store or the mesh layer. One source of truth: `buildingFeatures: BuildingFeature[]` holds the final merged result. Adding a separate `overtureFeatures` store field spreads merge logic across three files.
- Use `Promise.allSettled()` (not `Promise.all()`) so Overture fetch failures degrade silently to OSM-only without surfacing an error to the user. Overture is an enhancement, not a requirement.
- Deduplication must run before geometry generation — comparing polygon arrays is orders of magnitude cheaper than disposing merged `BufferGeometry` objects.
- Always fetch at zoom level 14. Overture buildings appear with full properties at z13+, and the existing 25 km² area cap means a z14 query covers at most ~30 tiles.

See `.planning/research/ARCHITECTURE.md` for full data flow diagrams, implementation code samples, build order, and anti-pattern analysis.

### Critical Pitfalls

1. **No browser REST API for Overture — wrong access pattern:** Assuming Overture has an Overpass-like endpoint produces CORS errors and full-file downloads of hundreds of MB. Use PMTiles via the `pmtiles` npm package with HTTP range requests only. This is the first thing to validate — it determines the entire integration architecture.

2. **Spatial deduplication false negatives (double-rendered buildings):** Centroid-distance deduplication fails for L-shaped and courtyard buildings. Bounding-box IoU at 0.3 threshold is required. Double-renders produce doubled wall thickness and non-manifold STL errors that slicers report at building positions. This is the highest-complexity component and requires unit tests before pipeline integration.

3. **PMTiles CORS misconfiguration:** HTTP range requests require `range` in `AllowedHeaders` and `etag` in `ExposeHeaders` on the S3 bucket. Failure is non-obvious — OPTIONS preflight may succeed while actual range requests fail. Test from the production deployment domain, not just localhost.

4. **Height null for ML-derived buildings:** Overture `height` is null for the vast majority of Microsoft and Google ML footprints — these are 2D footprints only. The existing height cascade's area-heuristic fallback (`resolveHeight()` tier 3) is the correct behavior. Do not attempt complex height inference; document explicitly in code that ML sources lack height data and the area-based default is intentional.

5. **Overture release URL drift:** PMTiles URLs embed the release date and 404 after approximately 60 days when Overture rotates old releases. Implement graceful OSM-only fallback and document the URL constant as requiring periodic update. The Overture STAC catalog (`https://labs.overturemaps.org/stac/catalog.json`) provides dynamic URL discovery as the long-term solution.

6. **Ring winding order inconsistency (inverted normals):** The OSM parser handles rings with potential closing-vertex duplicates (stripped via `stripClosingVertex`). Overture GeoJSON follows RFC 7946 — exterior CCW, holes CW, no closing duplicate. Passing Overture rings to OSM-coded geometry functions without normalization produces inverted normals and failed earcut triangulation. Normalize winding in the Overture parser before any shared geometry code is called.

7. **MultiPolygon buildings silently skipped:** Overture geometry is declared as `Polygon | MultiPolygon`. Handling only `Polygon` causes complex buildings (campus clusters, multi-part footprints) to disappear silently. For `MultiPolygon`, emit one `BuildingFeature` per polygon entry in `coordinates[]`.

8. **Data volume blowup in dense cities:** A 4 km² bbox over central Tokyo or Manhattan can return 5,000–15,000 Overture buildings from ML sources. Apply a 15 m² minimum area filter before deduplication to eliminate shed/kiosk/solar-panel noise. Cap total combined feature count before geometry generation if browser memory exceeds limits.

See `.planning/research/PITFALLS.md` for the full pitfall-to-phase mapping, recovery strategies (all rated LOW-MEDIUM cost), and the "Looks Done But Isn't" verification checklist.

## Implications for Roadmap

The milestone maps cleanly to four implementation phases ordered by the dependency chain and risk. Each phase is independently testable before the next begins.

### Phase 1: Overture Fetch Strategy and Access Validation

**Rationale:** All other phases depend on getting Overture data into the browser. The access method (PMTiles) must be validated empirically before writing any parsing or deduplication code. This phase surfaces the MVT layer name gap and CORS behavior early — both are unknowns that could force architectural rework if discovered later.
**Delivers:** A working `fetchOvertureBuildings(bbox)` stub that returns raw building feature data from the Overture PMTiles archive — tested in isolation with a known bbox, logged to console to verify count and structure. Graceful 404/CORS fallback established and tested by intentionally breaking the URL.
**Addresses:** P1 feature — Overture building footprint fetch
**Avoids:** Pitfall 1 (wrong access pattern), Pitfall 2 (CORS misconfiguration), Pitfall 10 (release URL drift)
**Verify:** Fetch for a known OSM-sparse area (rural India or Sub-Saharan Africa) and confirm buildings are returned. Test CORS from the production deployment domain. Verify the MVT layer name empirically at pmtiles.io by loading the Overture buildings URL and inspecting layer names.
**Research flag:** This phase requires empirical validation — the MVT layer name is LOW confidence in existing research. Resolve before writing the parser.

### Phase 2: Overture Parser and Feature Adapter

**Rationale:** Once raw data is fetchable, the adapter translates it to the format the existing pipeline expects. Parser correctness — especially ring winding order and MultiPolygon handling — is a prerequisite for meaningful deduplication testing. Bugs here produce inverted normals and missing buildings that are hard to diagnose in the integrated pipeline.
**Delivers:** `parseOvertureBuildings()` within `src/lib/buildings/overture.ts` that correctly handles Polygon and MultiPolygon geometry, normalizes ring winding order to match the OSM pipeline's expectations, maps Overture properties to `BuildingFeature.properties`, and applies a 15 m² minimum area filter. Gap-fill buildings use the area-heuristic height fallback with the reason documented in code.
**Uses:** `@mapbox/vector-tile`, `pbf`, tile-to-WGS84 coordinate math (~10 lines of arithmetic, no additional library)
**Implements:** `src/lib/buildings/overture.ts` (parsing and adapter portion)
**Avoids:** Pitfall 6 (height null for ML buildings — document and use area fallback explicitly), Pitfall 8 (ring winding order — normalize in parser before shared geometry code), Pitfall 9 (MultiPolygon not handled — emit one BuildingFeature per polygon entry), Pitfall 3 (roofprint displacement — accept as known limitation, document in code comment)

### Phase 3: Spatial Deduplication

**Rationale:** Deduplication is the highest-complexity component and the most likely to produce subtle bugs. False negatives (missed duplicates) produce double-rendered buildings and non-manifold STL errors. The algorithm must be built and unit-tested against synthetic test cases with known outcomes before it is wired into the live pipeline.
**Delivers:** `mergeAndDeduplicateBuildings(osm, overture)` in `src/lib/buildings/deduplicate.ts` with unit tests covering: OSM-only buildings pass through unchanged; Overture buildings matching OSM (by bbox IoU > 0.3) are discarded; Overture buildings with no OSM match are added; L-shaped buildings with OSM coverage are not double-rendered; overall feature count and memory stay within bounds for a 4 km² dense urban bbox.
**Avoids:** Pitfall 4 (deduplication false negatives — IoU-based, not centroid-distance), Pitfall 5 (Overture re-publishes OSM data — run own deduplication regardless of Overture's internal conflation), Pitfall 7 (data volume blowup — area filter already applied in Phase 2; add count cap before geometry generation if needed)

### Phase 4: Pipeline Integration and End-to-End Verification

**Rationale:** Once the three functional components are independently validated, wire them into `GenerateButton.tsx` with parallel fetching and graceful degradation, then verify the complete pipeline against real geographic areas with known characteristics.
**Delivers:** Modified `fetchOsmLayersStandalone()` using `Promise.allSettled()` for parallel OSM + Overture fetches; merged `BuildingFeature[]` flowing into the existing worker and STL export unchanged; graceful OSM-only fallback on Overture failure with no UI error shown.
**Verify against the "Looks Done But Isn't" checklist:** OSM-sparse area shows gap-fill buildings; OSM-dense area (Manhattan, central Berlin) shows no double-rendered buildings; Overture endpoint broken intentionally → app produces valid OSM-only STL without crashing; winding order check (no black/inverted-normal buildings in 3D preview); all 176 existing Vitest tests still pass; `npx tsc --noEmit` clean; `npx vite build` succeeds.

### Phase Ordering Rationale

- Phase 1 before Phase 2 because the MVT layer name and CORS behavior are unvalidated assumptions that could force parser rework. Discovering them first avoids rework.
- Phase 2 before Phase 3 because deduplication operates on `BuildingFeature[]` — unit-testing it requires the adapter to produce correctly structured inputs with known ring geometry.
- Phase 3 before Phase 4 because integrating unvalidated deduplication into the live pipeline makes bugs harder to isolate. Unit tests in Phase 3 make Phase 4 integration debugging minimal.
- Parallel fetch design (Phase 4) adds no additional latency — both OSM and Overture fetches start simultaneously and the merge waits only for whichever completes last.

### Research Flags

Phases needing empirical validation before proceeding:
- **Phase 1:** Verify the MVT layer name by fetching one tile at pmtiles.io with the Overture buildings URL and inspecting layer names. This is a 5-minute check but it is the only LOW-confidence fact in the milestone. Do not write the parser until it is confirmed.
- **Phase 1:** Test CORS from the actual production deployment domain (not localhost). The public Overture S3 bucket is expected to allow cross-origin range requests, but must be validated before committing to the PMTiles approach.

Phases with standard patterns (no additional research needed):
- **Phase 2:** Ring normalization, MultiPolygon handling, and property mapping follow RFC 7946 and the existing OSM parser conventions — both are well-documented.
- **Phase 3:** Bounding-box IoU is elementary arithmetic. The algorithm is fully specified in `ARCHITECTURE.md` with working TypeScript code.
- **Phase 4:** `Promise.allSettled()` parallel fetch with graceful degradation is a standard JavaScript pattern with no unknowns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | `pmtiles`, `@mapbox/vector-tile`, and `@turf/boolean-intersects` verified via npm registry, official docs, and Azure Maps reference implementation. Version compatibility with Vite 6 confirmed. |
| Features | HIGH | Overture schema verified via official docs. Feature boundaries (P1/P2/v2+) are clear. Anti-features are specifically confirmed impossible (no confidence score field in the buildings theme). |
| Architecture | HIGH | Integration seam identified via direct codebase inspection of `GenerateButton.tsx`, `mapStore.ts`, and the full buildings pipeline. Component boundaries and property mapping are fully specified. One LOW-confidence item: MVT layer name. |
| Pitfalls | MEDIUM-HIGH | 10 pitfalls documented with prevention strategies. Most verified against official Overture docs and the Azure Maps PMTiles implementation. Roofprint displacement and performance traps are inferred from Overture's documented data sources and standard computational geometry principles. |

**Overall confidence:** HIGH

### Gaps to Address

- **MVT layer name inside Overture PMTiles archive (LOW confidence):** Expected `"building"` based on Azure Maps sample code and STACK.md source-layer documentation, but not confirmed in PMTiles typedoc. Resolve in Phase 1 by fetching one tile at [pmtiles.io](https://pmtiles.io) with the Overture buildings URL. This is the only unresolved technical unknown in the milestone.
- **CORS from production deployment domain:** The Overture S3 bucket's CORS policy allows cross-origin range requests for their own hosted explorer, but whether the MapMaker production domain is covered requires a live test. Resolve in Phase 1.
- **IoU threshold tuning with real data:** The 0.3 bounding-box IoU threshold is derived from Overture's own 0.5 polygon IoU threshold, adjusted conservatively for raw coordinate differences between OSM and ML-derived footprints. Validate empirically in Phase 4 by testing against a known well-covered OSM city (central London) and confirming no visible duplicate buildings and no valid gap-fills incorrectly discarded.

## Sources

### Primary (HIGH confidence)
- [Overture Maps Buildings Schema Reference](https://docs.overturemaps.org/schema/reference/buildings/building/) — field types, nullability, geometry as Polygon/MultiPolygon
- [Overture Maps Buildings Overview](https://docs.overturemaps.org/guides/buildings/) — conflation methodology, IoU deduplication, OSM source priority
- [Overture Maps PMTiles Documentation](https://docs.overturemaps.org/examples/overture-tiles/) — PMTiles URL format, zoom levels
- [Overture Maps STAC Catalog (2026)](https://docs.overturemaps.org/blog/2026/02/11/stac/) — dynamic URL discovery via `latest` field
- [Overture Data Retention Policy](https://docs.overturemaps.org/blog/2025/09/24/release-notes/) — 60-day retention window, two most recent releases kept
- [Azure Maps Overture Buildings PMTiles Sample](https://github.com/Azure-Samples/AzureMapsCodeSamples/blob/main/Samples/PMTiles/Overture%20Building%20Theme/Buildings.html) — confirms source-layer `"building"`, CORS pattern, `height` property from browser-side PMTiles
- [pmtiles npm@4.4.0](https://www.npmjs.com/package/pmtiles) — ES module, no WASM, `getZxy(z, x, y)` API
- [PMTiles TypeDoc: PMTiles class](https://pmtiles.io/typedoc/classes/PMTiles.html) — `getZxy()` is the only tile fetch method
- [@mapbox/vector-tile npm@2.0.4](https://www.npmjs.com/package/@mapbox/vector-tile) — MVT decode, `toGeoJSON()` method, `pbf` peer dependency
- [@turf/boolean-intersects npm@7.3.1](https://www.npmjs.com/package/@turf/boolean-intersects) — 13.4KB, ES module with `sideEffects: false`
- [Protomaps: Cloud Storage CORS Requirements](https://docs.protomaps.com/cloud-storage) — `range` in AllowedHeaders, `etag` in ExposeHeaders
- [RFC 7946: GeoJSON](https://www.rfc-editor.org/rfc/rfc7946) — exterior ring CCW, hole rings CW, no closing vertex duplicate
- MapMaker v1.0 codebase (direct inspection) — `GenerateButton.tsx`, `BuildingFeature` interface, `buildAllBuildings()`, `meshBuilder.worker.ts`, `terrainRaycaster.ts`, `height.ts`

### Secondary (MEDIUM confidence)
- [DuckDB-WASM + Overture (Camptocamp blog)](https://dev.to/camptocamp-geo/querying-overture-maps-geoparquet-directly-in-the-browser-with-duckdb-wasm-4jn4) — confirms HTTPFS not available in WASM; S3 GeoParquet not browser-accessible
- [HeiGIT: OSM Completeness with Overture Maps Data](https://heigit.org/osm-completeness-with-overture-maps-data/) — gap-fill coverage analysis and methodology
- [Overture vs OSM Building Footprints Analysis](https://milanjanosov.substack.com/p/overture-vs-osm-building-footprints) — third-party coverage comparison across regions

### Tertiary (LOW confidence)
- MVT layer name `"building"` — inferred from Azure Maps sample and STAC docs but not confirmed in PMTiles typedoc; requires empirical verification in Phase 1

---
*Research completed: 2026-02-28*
*Ready for roadmap: yes*
