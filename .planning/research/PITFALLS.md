# Pitfalls Research

**Domain:** Adding Overture Maps building footprints as fallback to an existing OSM-based 3D building pipeline (MapMaker v1.1)
**Researched:** 2026-02-28
**Confidence:** MEDIUM-HIGH (Overture official docs + PMTiles/protomaps docs verified; some integration pitfalls are MEDIUM from training data + search corroboration)

---

## Critical Pitfalls

### Pitfall 1: No Browser-Native REST API — Wrong Access Pattern

**What goes wrong:**
The developer assumes Overture Maps has a REST endpoint like Overpass (POST a query, get GeoJSON back). It does not. Overture's official distribution is GeoParquet files on S3/Azure (230+ GB total for buildings). Calling S3 GeoParquet directly from a browser produces CORS errors and massive downloads. The app silently fetches nothing, or downloads hundreds of MB per request.

**Why it happens:**
Overpass has trained developers to expect "send a bbox query, get features back." Overture docs emphasize DuckDB, Python CLI, and BigQuery — server-side tools. Browser-friendly access options are buried in the PMTiles and Fused examples, not the main "Getting Data" page.

**How to avoid:**
Use one of exactly two viable browser-accessible approaches:
1. **PMTiles via HTTP Range Requests**: Overture publishes buildings as PMTiles archives at `https://overturemaps-tiles-us-west-2-beta.s3.amazonaws.com/<RELEASE>/buildings.pmtiles`. Use the `pmtiles` npm package to decode specific tiles via HTTP Range Requests — no server, no full download. The library handles the range request math and MVT decoding.
2. **Third-party bbox API (overturemapsapi.com)**: A community REST API wrapping Overture data. Requires an API key. Returns GeoJSON. Simpler to call but introduces a key management dependency and a third-party rate limit not under your control.

Do not attempt to fetch GeoParquet from S3 directly in the browser. Do not build a server proxy unless the above two options are ruled out.

**Warning signs:**
- Search results returning large (>50 MB) responses for a modest bounding box
- CORS preflight failures in the browser console on S3/Azure URLs
- Network tab showing "content-type: application/octet-stream" for what you expected to be JSON

**Phase to address:**
Phase 1 (Overture fetch strategy) — must be resolved before any other work; it determines the entire integration architecture.

---

### Pitfall 2: PMTiles S3 CORS Misconfiguration Silently Fails

**What goes wrong:**
PMTiles HTTP Range Requests require specific CORS headers from the S3 bucket. If `range` is not in `AllowedHeaders` and `etag` is not in `ExposeHeaders`, the browser's `pmtiles` library either hangs, throws a cryptic fetch error, or returns corrupted tile data. The failure mode is non-obvious — no "CORS blocked" error appears because the preflight OPTIONS may succeed while the actual range request fails.

**Why it happens:**
Overture's S3 bucket has CORS configured for their own hosted explorer domain. If you're developing on localhost or a different domain, the `AllowedOrigins` in their bucket policy may not include your origin. The PMTiles docs note that S3 only supports HTTP/1.1 (not HTTP/2), which affects how connections are reused. Developers configure `AllowedOrigins: ["*"]` but forget `AllowedHeaders: ["range", "if-match"]` and `ExposeHeaders: ["etag"]`.

**How to avoid:**
If self-hosting a PMTiles extract: Set S3 CORS policy to exactly:
```json
[{
  "AllowedOrigins": ["*"],
  "AllowedMethods": ["GET", "HEAD"],
  "AllowedHeaders": ["range", "if-match"],
  "ExposeHeaders": ["etag"],
  "MaxAgeSeconds": 3000
}]
```
If relying on Overture's public S3 bucket: Test from your actual deployment domain before launch — the bucket CORS may allow `*` origins but future policy changes could break it. Cache a local extract to avoid runtime dependency on Overture's bucket policy.

**Warning signs:**
- `pmtiles` library throws "ETag mismatch" or "416 Range Not Satisfiable"
- Network tab shows OPTIONS succeeds but GET returns 403
- Tiles load in production but not on localhost (origin-specific CORS)

**Phase to address:**
Phase 1 (Overture fetch strategy) — test CORS from localhost and from the production deployment domain before committing to PMTiles approach.

---

### Pitfall 3: Roofprint vs. Footprint Geometry Displacement

**What goes wrong:**
Overture buildings schema states geometry is "the most outer footprint or roofprint if traced from satellite/aerial imagery." ML-derived buildings (Google Open Buildings, Microsoft ML Buildings) are traced from above-nadir satellite imagery — the outlined polygon is a **roofprint**, not the ground footprint. For tall buildings at high latitudes or steep off-nadir imagery, the roofprint can be displaced 5–20 meters horizontally from the actual ground footprint. When these buildings are placed on terrain and extruded downward, the base sits in the wrong location. In 3D printing this means buildings that visibly don't sit where they should, and potential floating/sunken artifacts.

**Why it happens:**
Developers treat all Overture geometry as ground-truth footprints, the same way OSM `way["building"]` geometries always represent the ground plan. OSM mappers draw footprints from street-level knowledge or near-nadir imagery. Overture's ML sources use raw satellite imagery where parallax displacement is uncompensated.

**How to avoid:**
- Accept the displacement as a known limitation of ML-derived data — it only affects the gap-fill buildings (Overture-only, not in OSM). OSM buildings in the app are correct.
- Add a note in the UI or documentation that Overture gap-fill buildings are approximate positions.
- Do NOT attempt to correct displacement: you don't have building height + imagery metadata needed to compute the correction vector. The cost exceeds the benefit for 3D printing at typical model scales (4 km² → ~40mm × 40mm model; a 10m displacement = ~0.1mm error — below print resolution).
- At small model scales (< 1 km²), consider suppressing Overture gap-fill if the displacement would be more noticeable.

**Warning signs:**
- Gap-fill buildings appear offset from roads or parcel lines in the 3D preview
- Buildings from `sources[0].dataset = "microsoftMLBuildings"` or `"googleOpenBuildings"` cluster around a displaced zone

**Phase to address:**
Phase 2 (data quality and parser) — document this in code comments when parsing Overture source properties.

---

### Pitfall 4: Spatial Deduplication False Negatives — Buildings Rendered Twice

**What goes wrong:**
Overture already includes OSM data internally. If you fetch Overture buildings AND OSM buildings for the same area, many buildings appear in both datasets. Naive deduplication by centroid proximity or bounding box overlap fails to catch all duplicates — especially for large irregular buildings (L-shaped, U-shaped, courtyard buildings) where centroid distance is large despite 100% footprint overlap. The result is buildings rendered twice on top of each other, doubling wall thickness and making the STL non-manifold.

**Why it happens:**
Developers pick an "obvious" deduplication heuristic: "if centers are within X meters, they're the same building." This works for rectangular buildings but fails badly for complex shapes. Overture's own internal deduplication uses IoU ≥ 50% (Intersection over Union), which requires polygon intersection area computation — a more expensive operation that developers skip for performance.

**How to avoid:**
Use IoU-based spatial deduplication. For each Overture footprint, compute intersection area with each OSM footprint in the same spatial neighborhood (grid-bucketed for performance). If `intersection_area / union_area > 0.5`, the Overture feature is a duplicate of the OSM feature. Drop the Overture feature (OSM preferred per the project spec).

Implementation shortcut: Use a bounding box pre-filter to narrow candidates, then run Sutherland-Hodgman polygon clipping only on candidate pairs. Libraries: `polygon-clipping` (npm) handles GeoJSON polygon intersection and difference. Avoid full O(n²) comparison — bucket OSM buildings by a spatial grid first.

**Warning signs:**
- Dense urban areas show suspiciously thick building walls in the STL
- STL non-manifold errors reported by slicer on buildings in well-covered OSM areas
- `manifold-3d` reports internal intersecting faces at building positions

**Phase to address:**
Phase 3 (deduplication logic) — this is the highest complexity phase; requires unit tests with known duplicate/non-duplicate building pairs.

---

### Pitfall 5: Overture Includes OSM Data — IoU Deduplication Still Misses Edge Cases

**What goes wrong:**
Overture re-publishes OSM buildings as part of their dataset (OSM is their highest-priority source). You might think: "since Overture already deduped against OSM, I can trust Overture is only gap-fills." This is wrong. Overture's IoU threshold is 50% — buildings with 40% overlap (e.g., neighboring buildings sharing a party wall) survive as distinct features in Overture even though they're in OSM. When you stack your OSM query result on top of Overture data without your own deduplication, you'll double-render OSM buildings that Overture kept as separate from themselves.

Additionally, OSM data has changed since the last Overture release (Overture releases ~monthly). Newly added OSM buildings won't be in the Overture dataset yet, but the older version of those buildings may be in Overture under a slightly different geometry.

**Why it happens:**
Trusting Overture's internal deduplication as a substitute for your own. Overture is designed for map rendering, not for feeding a secondary OSM-merge pipeline.

**How to avoid:**
Always run your own IoU deduplication pass after fetching both datasets, regardless of what Overture has done internally. Treat any Overture feature with `sources[0].dataset == "OpenStreetMap"` with extra skepticism — flag it and prefer the raw OSM version from your Overpass query which is more current.

**Warning signs:**
- Buildings in OSM-dense areas (central London, Manhattan) appear in both datasets with slightly different geometries
- Overture features tagged with dataset "OpenStreetMap" that have slightly different ring vertices from your Overpass result

**Phase to address:**
Phase 3 (deduplication logic) — add a `sources` property check: prefer Overpass result whenever Overture's source is OpenStreetMap.

---

### Pitfall 6: Height Property Is Null for the Majority of ML-Derived Buildings

**What goes wrong:**
The Overture `height` property is optional (`float64 | null`). For ML-derived buildings (Microsoft and Google), height is almost universally null — these are 2D footprints only. The app's existing height fallback cascade (`height` → `building:levels * 3m` → `4m default`) was designed for OSM data where `building:levels` is often present. Overture ML buildings have neither `height` nor `num_floors`. Every gap-fill building falls through to the default height, resulting in a uniform 4m stub across the entire gap-fill layer.

This is acceptable (the spec says "flat roof, default height") but developers often don't realize it happens for 99%+ of Overture features and try to implement more complex height logic that finds nothing.

**How to avoid:**
Explicitly document in the parser that Overture gap-fill buildings default to a single configurable height constant (e.g., 4m). Do NOT implement complex height inference for Overture buildings — it won't find data that doesn't exist.

Apply the default height directly in the Overture parser, before it reaches the shared building geometry pipeline. This makes it explicit and keeps the shared pipeline clean.

**Warning signs:**
- All Overture buildings render at exactly 4m height regardless of building type
- Height inference code returns the same fallback for >95% of Overture features
- Significant time spent debugging "why is height null" when the answer is simply "it's ML data"

**Phase to address:**
Phase 2 (Overture parser) — hardcode the gap-fill height constant clearly and document why.

---

### Pitfall 7: Data Volume Blowup in Dense Cities

**What goes wrong:**
Overture has 2.3+ billion building footprints globally, with very high density in urban areas. A 4 km² bounding box over central Tokyo or Manhattan could return 5,000–15,000 Overture buildings. Combined with OSM buildings (already dense in these areas), the merged feature array may reach 20,000+ features. The existing browser memory cap (25 km² hard limit) was designed for OSM density, which is lower than Overture density in covered areas. Processing 20,000 buildings in the Web Worker causes:
- Worker postMessage transfer of enormous ArrayBuffers
- Three.js `mergeGeometries` slow on 20,000+ geometries
- Total VRAM for the merged BufferGeometry exceeds WebGL limits

**Why it happens:**
Overture gap-fill only adds buildings where OSM is absent. In practice, the OSM coverage "gaps" at the scale of a 4 km² bbox are often in moderate-density areas. But in cities where OSM has good coverage of main buildings but misses small structures (sheds, garages, kiosks), Overture can add thousands of small ML-detected features.

**How to avoid:**
- Apply a minimum area threshold when parsing Overture buildings. Overture already excludes features below their internal minimum, but applying an explicit area filter (e.g., skip buildings with footprint area < 15 m²) removes the shed/kiosk noise that doesn't matter at 3D printing scale.
- Cap total combined feature count before mesh generation. If OSM + Overture exceeds the soft limit (e.g., 8,000 buildings for a 4 km² box), sample the Overture gap-fills down rather than reject the entire request.
- Run deduplication before merging geometry (not after) to remove duplicates early.

**Warning signs:**
- `buildAllBuildings` call takes > 3 seconds in the Web Worker for dense areas
- Browser tab memory climbs above 1.5 GB on Manhattan or Tokyo bounding boxes
- `mergeGeometries` throws "WebGL: INVALID_OPERATION: drawElements: no buffer is bound to enabled attribute" (buffer size overflow)

**Phase to address:**
Phase 3 (deduplication) and Phase 4 (geometry generation) — add area filter in the Overture parser (Phase 2) and feature count cap before geometry generation (Phase 4).

---

### Pitfall 8: Ring Winding Order Inconsistency Between OSM and GeoJSON

**What goes wrong:**
The existing OSM building parser produces rings in OSM's winding convention (first vertex repeated at the end, removed by `stripClosingVertex`). Overture buildings arrive as GeoJSON Polygons/MultiPolygons following RFC 7946: exterior rings counter-clockwise, hole rings clockwise, no closing vertex duplication. If the Overture parser passes rings directly to the shared `buildAllBuildings` pipeline without ensuring consistent winding:
- Earcut may triangulate holes as exterior rings, producing inside-out caps
- The `computeSignedArea` sign check (used to detect clockwise vs. counter-clockwise) may flip, affecting hole detection
- STL faces have inverted normals for Overture-derived buildings

**Why it happens:**
OSM rings from Overpass `out geom` already include the closing duplicate vertex. GeoJSON does not include closing duplicates. Developers pass Overture GeoJSON rings directly to code written for OSM rings, bypassing `stripClosingVertex` (which is a no-op on GeoJSON rings since first != last vertex), and don't verify winding assumptions.

**How to avoid:**
- In the Overture parser, normalize all rings to the same convention used by the OSM parser before passing to shared geometry code.
- Specifically: GeoJSON exterior rings should be in CCW order per RFC 7946 — verify this and do NOT call `stripClosingVertex` (there is no closing vertex to strip in valid GeoJSON).
- Write a unit test with a known Overture polygon and verify that `computeSignedArea` returns positive for the exterior ring (CCW) and negative for holes (CW), matching the OSM pipeline's expectations.

**Warning signs:**
- Overture buildings have visually correct shapes but faces are dark/black (inverted normals)
- Earcut returns empty or wrong triangulation for Overture multi-polygon buildings
- `computeSignedArea` returns negative for what should be an exterior ring

**Phase to address:**
Phase 2 (Overture parser) — normalize rings immediately after GeoJSON parsing, before any shared geometry code is called.

---

### Pitfall 9: MultiPolygon Buildings Not Handled

**What goes wrong:**
Overture building geometry is declared as "Polygon or MultiPolygon." Simple rectangular buildings are Polygons. Complex buildings (campus buildings, buildings with multiple distinct footprints under one roof) are MultiPolygons. The existing OSM parser handles OSM `relation["building"]["type"="multipolygon"]` but converts them to individual `BuildingFeature` objects (one outer ring + holes). An Overture MultiPolygon building with disconnected rings passed as a single `BuildingFeature` will fail earcut triangulation and be silently skipped.

**Why it happens:**
Developers parse `feature.geometry.type === "Polygon"` and forget to handle `"MultiPolygon"`. The Overture schema allows both, and ML-derived buildings occasionally produce multi-part geometries for buildings that appear contiguous in imagery but are geometrically separated.

**How to avoid:**
In the Overture parser, explicitly check `geometry.type`. For `"MultiPolygon"`, emit one `BuildingFeature` per polygon ring group (each entry in `coordinates[]`). This matches how the OSM relation parser already decomposes building relations into separate features.

**Warning signs:**
- Some large complex buildings are missing from the Overture gap-fill layer
- Parser returns fewer features than expected for known campus/complex sites
- `buildSingleBuilding` throws on rings with coordinates embedded in a nested extra array

**Phase to address:**
Phase 2 (Overture parser) — MultiPolygon must be handled in the initial parse, not discovered later.

---

### Pitfall 10: Overture Release Version Drift

**What goes wrong:**
Overture releases new dataset versions approximately monthly. PMTiles URLs embed the release date: `https://overturemaps-tiles-us-west-2-beta.s3.amazonaws.com/2024-08-20/buildings.pmtiles`. If the app hardcodes a release date URL, it will eventually serve stale data — or worse, the URL 404s when Overture rotates old releases off S3. Requests for that URL return empty results or errors, and users see no gap-fill buildings with no explanation.

**Why it happens:**
Developers hardcode the PMTiles URL that works at development time. Overture does not guarantee permanent URL retention for old releases.

**How to avoid:**
- Check Overture's STAC catalog (Overture adopted STAC in February 2026) to discover the latest release URL dynamically, rather than hardcoding.
- Alternatively, hardcode the URL but pin it to a known stable release, and add a comment marking it as "needs periodic review."
- Log a warning in the app if the PMTiles fetch returns 404, with a fallback to OSM-only mode rather than a hard failure.

**Warning signs:**
- PMTiles fetch returns HTTP 404 or 403 for a previously working URL
- Users report gap-fill buildings suddenly disappeared after an Overture release cycle

**Phase to address:**
Phase 1 (Overture fetch strategy) — implement URL discovery or fallback-to-OSM-only as part of the initial fetch design.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip IoU deduplication, use centroid distance | Simpler code, faster | Double-renders complex buildings; non-manifold STL in OSM-covered areas | Never — IoU is required for correctness |
| Trust Overture's internal OSM deduplication | No need for own dedup logic | Overture data lags OSM by up to 1 month; re-duplicate in areas with recent OSM edits | Never |
| Hardcode Overture PMTiles URL with release date | Works immediately | 404s when Overture rotates old releases; silent data failure | Acceptable as MVP with mandatory "needs review" comment and 404-fallback |
| Pass all Overture features to geometry pipeline without area filter | Simplest code | OOM on dense urban bounding boxes; 10k+ tiny sheds | Never — apply minimum 15 m² area filter |
| Use default 4m height for ALL Overture buildings without documenting why | Avoids complex height logic | Future developers re-investigate, waste time, find same null result | Acceptable — but MUST be documented with a comment explaining ML source lacks height data |
| Fetch both OSM and Overture unconditionally | Simpler control flow | Overture fetch may fail (CORS, 404) and break building layer entirely | Never — Overture must be a fallback that degrades gracefully to OSM-only |

---

## Integration Gotchas

Common mistakes when connecting Overture Maps data to the existing pipeline.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| PMTiles fetch | Fetching the full PMTiles archive file (230 GB) | Use `pmtiles` npm library with HTTP Range Requests — fetches only the tile(s) covering the bbox |
| Overture S3 CORS | Missing `range` in `AllowedHeaders`, `etag` in `ExposeHeaders` | Set exact S3 CORS policy per Protomaps docs; test from production domain, not just localhost |
| Ring parsing | Calling `stripClosingVertex` on GeoJSON rings (no-op but may reveal wrong assumptions) | GeoJSON rings have no closing vertex; skip `stripClosingVertex`; verify winding direction separately |
| MultiPolygon handling | Passing `geometry.coordinates` of a MultiPolygon directly as a ring array | Check `geometry.type`; for MultiPolygon, iterate `coordinates[]` and emit one `BuildingFeature` per polygon entry |
| Height resolution | Running existing OSM height fallback cascade on Overture features | Overture ML features have no `num_floors` or height tags; default to a flat constant immediately in the Overture parser |
| Deduplication | Running dedup after geometry generation | Dedup before geometry generation — cheaper to compare polygons than dispose BufferGeometries |
| Overture source check | Ignoring `sources[0].dataset` property | Check dataset name; features with `dataset == "OpenStreetMap"` should defer to the live Overpass result |
| Error handling | Throwing on Overture fetch failure | Overture fetch failure MUST fall back silently to OSM-only; buildings are a degraded-but-functional layer |

---

## Performance Traps

Patterns that work at small scale but fail with dense urban Overture data.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| O(n²) IoU deduplication | Dedup takes > 10 seconds for dense cities | Pre-bucket OSM features by spatial grid; only test Overture against OSM features in adjacent cells | ~500 OSM buildings + 500 Overture candidates → 250,000 comparisons |
| No area threshold on Overture features | 10,000+ tiny sheds/kiosks included; Worker OOM | Filter Overture features with footprint area < 15 m² before dedup or geometry generation | Any urban bbox with ML-derived data |
| Sequential OSM + Overture fetch (await one, then other) | Total fetch time = OSM time + Overture time | Run both fetches in parallel with `Promise.all`; either can fail independently | Always — serial fetch is always slower |
| Merging Overture and OSM geometries into one giant BufferGeometry pre-filtering | `mergeGeometries` slow; can't selectively discard duplicates | Deduplicate feature arrays first; only merge geometries for surviving features | > 2,000 buildings total |
| PMTiles tile over-fetch (fetching zoom level 0) | Downloads entire world or continent tile | Use zoom level 14–15 for building detail; `pmtiles` library picks correct zoom from bbox automatically | Any bbox request |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Embedding a third-party Overture API key in client-side JavaScript bundle | API key exposed; third party can rack up costs against your key | Use the official PMTiles approach (no key needed) or proxy the third-party API through a minimal server-side function that injects the key |
| Fetching from Overture S3 with `AllowedOrigins: ["*"]` in production | Any site can use your S3 bucket as a CORS proxy for Overture data | If self-hosting a PMTiles extract, restrict `AllowedOrigins` to your production domain + localhost for development |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Silently adding thousands of tiny shed/kiosk buildings from Overture ML data | Model looks cluttered with meaningless structures; STL quality degraded | Apply area threshold (≥ 15 m²) to filter out sub-scale features; user expects buildings, not every shed |
| No visual distinction between OSM buildings and Overture gap-fills in preview | User cannot identify data quality difference | Per spec, no UI changes are needed; but consider a subtle console log or dev-mode indicator during development |
| Overture fetch timeout blocks the Generate button | User waits indefinitely if Overture S3 is slow | Set a 5-second timeout on the Overture fetch; on timeout, proceed with OSM-only and log a warning |
| Gap-fill buildings appear in correct-coverage areas when OSM is used | User notices duplicates or double walls in STL | Confirm deduplication runs before geometry; test in a known well-covered OSM city (e.g., central Berlin) |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Overture fetch returns data:** Verify with an OSM-sparse area (rural Sub-Saharan Africa, rural India) — not just a well-mapped city where Overture and OSM fully overlap.
- [ ] **Deduplication works:** Verify with a bounding box containing a known complex (L-shaped or courtyard) building in both OSM and Overture; assert it appears only once in the STL.
- [ ] **Overture fetch failure gracefully degrades:** Kill the Overture endpoint (wrong URL, timeout); assert the app still produces a valid OSM-only STL without UI errors.
- [ ] **Height defaults to constant:** Verify that 100% of Overture features with `null` height use the documented default, not `NaN` or 0 (which would produce zero-height buildings).
- [ ] **MultiPolygon buildings present:** Check the output for a known campus or complex site; assert buildings from MultiPolygon geometry appear in the model.
- [ ] **Winding order correct for Overture rings:** Verify Overture buildings have correctly oriented face normals in the 3D preview (not black/inverted).
- [ ] **Area filter in place:** Log the count of Overture features before and after the area filter; confirm small features are excluded.
- [ ] **Existing OSM building tests still pass:** The Overture integration must not regress OSM building behavior; run `npx vitest run` before shipping.

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| PMTiles CORS failure in production | LOW | Add correct CORS headers to S3 bucket policy; no code change needed; deploy in minutes |
| Double-rendered buildings causing non-manifold STL | MEDIUM | Tighten IoU threshold or add source-ID matching; redeploy; no user migration needed |
| Overture URL 404 after release rotation | LOW | Update hardcoded URL to latest release; redeploy; add STAC discovery logic to prevent recurrence |
| OOM from too many Overture features | LOW | Lower area threshold; add feature count cap before geometry generation; redeploy |
| Roofprint displacement complaints | LOW | Document as known limitation; optionally suppress Overture gap-fills for small bbox scales |
| Inverted normals on Overture buildings | LOW | Fix winding normalization in Overture parser; rerun tests; redeploy |
| MultiPolygon buildings missing | LOW | Add MultiPolygon branch to Overture parser; add test case; redeploy |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| No browser-native Overture REST API | Phase 1: Overture fetch strategy | Confirm PMTiles or API-key approach fetches data in a browser devtools network tab |
| PMTiles S3 CORS misconfiguration | Phase 1: Overture fetch strategy | Fetch from localhost AND production domain; assert no CORS errors in console |
| Overture release version drift | Phase 1: Overture fetch strategy | Simulate 404 on Overture URL; assert app falls back to OSM-only without crashing |
| Height null for ML buildings | Phase 2: Overture parser | Assert 0 buildings with `NaN` or `0` height in the parsed feature array |
| MultiPolygon not handled | Phase 2: Overture parser | Unit test: parse a known MultiPolygon Overture feature; assert it produces 2+ `BuildingFeature` objects |
| Ring winding order inconsistency | Phase 2: Overture parser | Unit test: assert `computeSignedArea` returns positive for Overture exterior rings |
| Roofprint displacement | Phase 2: Overture parser | Document in code comment; accept as known limitation |
| Spatial deduplication false negatives | Phase 3: Deduplication logic | Test with L-shaped building present in both OSM and Overture; assert single STL output |
| Overture includes OSM re-published data | Phase 3: Deduplication logic | Test in OSM-dense area; assert Overpass-sourced building takes precedence over Overture OSM-sourced feature |
| Data volume blowup (dense cities) | Phase 2 (area filter) + Phase 3 (count cap) | Test 4 km² Manhattan bbox; assert browser memory < 1.5 GB; generation completes < 10 s |
| O(n²) deduplication performance | Phase 3: Deduplication logic | Benchmark with 1,000 OSM + 1,000 Overture features; assert dedup < 500 ms in Web Worker |
| Double-rendered buildings non-manifold STL | Phase 3: Deduplication logic + Phase 4: Geometry | Export STL for well-mapped OSM area; run `manifold-3d` check; assert 0 non-manifold edges |

---

## Sources

- [Overture Maps: Accessing the Data](https://docs.overturemaps.org/getting-data/) — No browser REST API; DuckDB/Python CLI/S3 only
- [Overture Maps: Buildings Overview](https://docs.overturemaps.org/guides/buildings/) — Data sources, height properties, IoU deduplication, quality considerations
- [Overture Maps: Building Schema Reference](https://docs.overturemaps.org/schema/reference/buildings/building/) — Property types including nullable `height`, `geometry` as Polygon/MultiPolygon
- [Overture Maps: PMTiles Access](https://docs.overturemaps.org/examples/overture-tiles/) — PMTiles archive URLs, HTTP access pattern
- [Protomaps: Cloud Storage for PMTiles](https://docs.protomaps.com/cloud-storage) — CORS requirements: `range` in AllowedHeaders, `etag` in ExposeHeaders
- [Protomaps: PMTiles Concepts](https://docs.protomaps.com/pmtiles/) — HTTP Range Request mechanism, browser Fetch API usage
- [pmtiles npm package](https://www.npmjs.com/package/pmtiles) — Client-side library for reading PMTiles archives
- [OpenSource Overture Maps API](https://www.overturemapsapi.com/) — Third-party API wrapper requiring API key authentication
- [Overture Maps STAC adoption (February 2026)](https://docs.overturemaps.org/blog/2026/02/11/stac/) — Dynamic release URL discovery
- [Overture Maps August 2025 Release Notes](https://docs.overturemaps.org/blog/2025/08/20/release-notes/) — Microsoft ML buildings `is_underground` bug discovered; patch released
- [Overture Buildings: 2.3B buildings with Google Open Buildings](https://overturemaps.org/blog/2023/overture-buildings-theme-hits-2-3b-buildings-with-addition-of-google-open-buildings-data/) — ML source quality issues (shipping containers, solar panels)
- [RFC 7946: GeoJSON Specification](https://www.rfc-editor.org/rfc/rfc7946) — Winding order convention: exterior CCW, holes CW, no closing vertex duplicate
- [Overture Maps: 3D Building Parts](https://docs.overturemaps.org/schema/concepts/by-theme/buildings/3d_buildings/) — building_part ambiguity with type=multipolygon
- [OSM Completeness with Overture Maps Data | HeiGIT](https://heigit.org/osm-completeness-with-overture-maps-data/) — Gap analysis methodology
- [Revisiting Overture's Global Geospatial Datasets | Mark's Blog](https://tech.marksblogg.com/overture-2024-revisit.html) — Data volume, GeoParquet size benchmarks
- [polygon-clipping npm](https://www.npmjs.com/package/polygon-clipping) — Polygon intersection for IoU computation in browser/Web Worker
- [Azure Samples: Overture Buildings PMTiles](https://github.com/Azure-Samples/AzureMapsCodeSamples/blob/main/Samples/PMTiles/Overture%20Building%20Theme/Buildings.html) — Browser-side PMTiles integration example

---
*Pitfalls research for: Overture Maps building footprint integration — MapMaker v1.1*
*Researched: 2026-02-28*
