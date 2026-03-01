# Phase 10: Overture Access - Research

**Researched:** 2026-02-28
**Domain:** PMTiles HTTP range requests, Overture Maps data access, CORS configuration
**Confidence:** HIGH — all critical claims verified empirically against live endpoints

## Summary

Phase 10 fetches Overture Maps building footprints for the user's selected bounding box using
PMTiles HTTP range requests from the browser, returning raw `ArrayBuffer` tile data for later
MVT decoding in Phase 11. The `pmtiles` npm package (v4.4.0, ships its own TypeScript types)
exposes a `PMTiles` class with a `getZxy(z, x, y, signal?)` method that issues HTTP range requests
against any PMTiles URL. The canonical Overture buildings endpoint is
`https://tiles.overturemaps.org/{RELEASE}/buildings.pmtiles`.

CORS is already fully configured on `tiles.overturemaps.org` (verified empirically): the server
returns `Access-Control-Allow-Origin: *` and `Access-Control-Expose-Headers: ETag, ...` for range
requests from any origin including `localhost`. No Vite proxy or CORS workaround is needed. A
silent fallback (catch-all, `console.warn`, set `overtureAvailable: false` in Zustand) is still
required per the CONTEXT decisions, because the endpoint could fail for other reasons (network,
timeout, unavailable release).

The current release is `2026-02-18.0`. The STAC catalog at `https://stac.overturemaps.org/`
exposes a machine-readable `latest` field, but v1.1 pins a specific release and documents the STAC
URL for manual update — dynamic STAC discovery is deferred to RMGT-01 (v2). The MVT layer name
inside the archive is `"building"` (not `"buildings"`) — confirmed by reading the PMTiles metadata
directly from the live file.

**Primary recommendation:** Use `pmtiles@4.4.0` + `@mapbox/tile-cover@3.0.2` (with
`@types/mapbox__tile-cover@3.0.4`) to enumerate tiles covering the bbox at zoom 14, call
`getZxy()` for each, and pass one shared `AbortSignal` (from a 5-second `AbortController`) to
each call for unified timeout and bounding-box-change cancellation.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Fallback transparency:**
- Any failure type (network, CORS, HTTP error, timeout, malformed response) triggers silent fallback to OSM-only
- Log a `console.warn` with details (URL, error type) on Overture failure — developers can diagnose, users never see it
- Store an `overtureAvailable: boolean` flag in the Zustand store (`mapStore`) so future phases can optionally surface Overture status in UI
- Empty Overture response (no buildings in area) counts as successful (`overtureAvailable: true`) — it's valid data, not a failure

**Fetch timeout & retry:**
- 5-second timeout for the entire Overture fetch operation (all tile requests combined)
- Fail fast — single attempt, no retry on transient failures
- Use `AbortController` so the Overture fetch can be cleanly cancelled if the user changes the bounding box mid-fetch

**Large-area data limits:**
- No bounding box size limit for Overture fetching — same policy as OSM
- The 5-second timeout acts as a natural safety valve for large areas
- Phase 10 passes raw tile data through as-is — Phase 11 (MVT Parser) handles all filtering and validation

**Deployment & CORS:**
- Overture PMTiles are served from a public third-party bucket (Overture Maps Foundation) — we do not control CORS configuration
- If CORS headers block browser range requests, the silent fallback handles it gracefully — defer CORS workarounds (proxy, own bucket copy) to a future effort
- Must work from localhost during development — if CORS blocks localhost, set up a Vite dev proxy as a workaround

### Claude's Discretion

- PMTiles zoom level selection (fixed vs dynamic based on bbox size)
- Tile fetch concurrency strategy (parallel with limit vs sequential)
- PMTiles library choice and integration approach
- Specific Vite proxy configuration for localhost dev

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DATA-01 | User's selected area fetches building footprints from Overture Maps via PMTiles in addition to OSM | PMTiles class `getZxy()` + tile-cover bbox → ZXY mapping → raw ArrayBuffer tiles returned |
| DATA-02 | App silently falls back to OSM-only when Overture data is unavailable (no error shown to user) | `try/catch` around `Promise.allSettled()`, `console.warn` on failure, `overtureAvailable` Zustand flag |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `pmtiles` | 4.4.0 | PMTiles archive reader for browser — HTTP range request driver | Only browser-native PMTiles library; ships own TypeScript types; used by Overture Maps official examples |
| `@mapbox/tile-cover` | 3.0.2 | Convert GeoJSON bbox polygon to list of ZXY tiles at a given zoom | Standard tile-cover utility; active ecosystem use (56k weekly downloads); covers minimum tiles for any geometry |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@types/mapbox__tile-cover` | 3.0.4 | TypeScript types for tile-cover | Required since tile-cover ships no bundled types |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@mapbox/tile-cover` | `@mapbox/tilebelt` (bboxToTile + getChildren recursive) | tile-cover is simpler one-call API for covering a bbox; tilebelt requires manual recursion |
| `pmtiles` directly | Custom range fetch with fetch() | pmtiles handles directory lookup, decompression, caching, ETag validation — huge complexity to replicate |
| Fixed zoom 14 | Dynamic zoom based on bbox area | Fixed zoom 14 is where all Overture building properties are present (confirmed from metadata: minzoom=5, maxzoom=14); dynamic zoom adds complexity for no gain in this context |

**Installation:**
```bash
npm install pmtiles @mapbox/tile-cover @types/mapbox__tile-cover
```

## Architecture Patterns

### Recommended Project Structure

```
src/
├── lib/
│   └── overture/              # New module (parallel to buildings/, roads/, etc.)
│       ├── index.ts           # Public API: fetchOvertureTiles(bbox, signal)
│       ├── tiles.ts           # PMTiles class wrapper + tile enumeration
│       ├── constants.ts       # OVERTURE_PMTILES_URL, OVERTURE_ZOOM, STAC docs
│       └── __tests__/
│           └── tiles.test.ts  # Unit tests for tile enumeration, fallback logic
├── store/
│   └── mapStore.ts            # Add overtureAvailable: boolean
```

### Pattern 1: PMTiles Tile Fetch

**What:** Open a PMTiles archive by URL, enumerate ZXY tiles for a bbox, fetch each tile's raw bytes, collect as `Map<string, ArrayBuffer>` keyed by `"z/x/y"`.

**When to use:** Any time a bbox needs building tile data from a remote PMTiles archive.

```typescript
// Source: pmtiles TypeDoc https://pmtiles.io/typedoc/classes/PMTiles.html
// Source: @mapbox/tile-cover README https://github.com/mapbox/tile-cover

import { PMTiles } from 'pmtiles';
import cover from '@mapbox/tile-cover';

const OVERTURE_ZOOM = 14;

// bbox: [minLon, minLat, maxLon, maxLat]
function bboxToGeoJSON(bbox: [number, number, number, number]) {
  const [w, s, e, n] = bbox;
  return {
    type: 'Polygon' as const,
    coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]]
  };
}

async function fetchOvertureTiles(
  bbox: [number, number, number, number],
  signal: AbortSignal
): Promise<Map<string, ArrayBuffer>> {
  const archive = new PMTiles(OVERTURE_BUILDINGS_URL);

  const zxyTiles = cover.tiles(bboxToGeoJSON(bbox), {
    min_zoom: OVERTURE_ZOOM,
    max_zoom: OVERTURE_ZOOM,
  });

  const results = new Map<string, ArrayBuffer>();

  await Promise.all(
    zxyTiles.map(async ([x, y, z]) => {
      const response = await archive.getZxy(z, x, y, signal);
      if (response) {
        results.set(`${z}/${x}/${y}`, response.data);
      }
    })
  );

  return results;
}
```

### Pattern 2: AbortController for 5-Second Timeout + Cancellation

**What:** A single `AbortController` controls both the 5-second timeout (via `setTimeout`) and
caller-requested cancellation (new bbox selection). Pass the same signal to every `getZxy()` call.

**When to use:** All Overture fetch calls — both timeout and bbox-change cancellation share the
same signal.

```typescript
// Source: Web Platform spec — AbortController/AbortSignal

export async function fetchOvertureTilesWithTimeout(
  bbox: [number, number, number, number],
  callerSignal?: AbortSignal
): Promise<{ tiles: Map<string, ArrayBuffer>; available: boolean }> {
  const controller = new AbortController();

  // 5-second wall-clock timeout
  const timeoutId = setTimeout(() => controller.abort(new Error('timeout')), 5000);

  // If caller cancels (bbox changed), propagate to our controller
  callerSignal?.addEventListener('abort', () => controller.abort(callerSignal.reason));

  try {
    const tiles = await fetchOvertureTiles(bbox, controller.signal);
    return { tiles, available: true };
  } catch (err) {
    console.warn('[Overture] fetch failed, falling back to OSM-only:', err);
    return { tiles: new Map(), available: false };
  } finally {
    clearTimeout(timeoutId);
  }
}
```

### Pattern 3: Silent Fallback + Zustand Flag

**What:** Wrap the entire Overture fetch in a `try/catch`. On any error, log a `console.warn` and
return `available: false`. The caller sets `overtureAvailable` in Zustand. No error is surfaced to
the user.

**When to use:** In the public `fetchOvertureTiles` API — always. Empty result (no tiles for
sparsely populated area) is `available: true`; error is `available: false`.

```typescript
// In mapStore.ts — add field:
interface MapState {
  // ...existing fields...
  overtureAvailable: boolean;
}

// Usage at call site (Phase 13 will wire this in):
const { tiles, available } = await fetchOvertureTilesWithTimeout(bboxArray, signal);
useMapStore.getState().setOvertureAvailable(available);
```

### Anti-Patterns to Avoid

- **Fetching zoom != 14:** The Overture buildings PMTiles minzoom is 5, maxzoom is 14. At zoom < 14,
  features are simplified/dropped. Always use zoom 14 for complete building footprints.
- **Using layer name `"buildings"` (plural):** The MVT layer is named `"building"` (singular) —
  confirmed from live metadata. Using the wrong name returns zero features with no error.
- **Treating empty tile result as failure:** `getZxy()` returns `undefined` for tiles with no data.
  That is normal for unpopulated tiles — do not count it as a fetch error.
- **Pinning to the S3 beta bucket URL:** The canonical production URL is
  `https://tiles.overturemaps.org/{RELEASE}/buildings.pmtiles` served via CloudFront, not the raw
  S3 beta bucket. The beta bucket URL format does not match current release versions.
- **Ignoring tile-cover's `[x, y, z]` order:** `tile-cover` returns `[x, y, z]`, but PMTiles
  `getZxy(z, x, y)` takes `z` first. Argument order must be transposed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP range request + directory lookup | Custom fetch with byte arithmetic | `pmtiles` PMTiles class | PMTiles v3 directory structure requires two-level directory traversal, decompression (gzip/zstd), ETag caching, and 416 mismatch handling — hundreds of lines |
| Bbox to tile list | Nested loop with lon/lat arithmetic | `@mapbox/tile-cover` | Off-by-one at tile boundaries, anti-meridian wrapping, minimum tile count optimization are all handled |
| MVT protobuf decode | Custom protobuf parser | Phase 11 concern — not Phase 10 | Phase 10 returns raw ArrayBuffer only |

**Key insight:** The hardest part of PMTiles is not the HTTP request — it is the two-level
directory lookup that maps a ZXY tile ID to a byte range within the multi-gigabyte archive.
`PMTiles.getZxy()` handles this entirely; calling raw `fetch()` with a range header would require
reimplementing the full directory traversal.

## Common Pitfalls

### Pitfall 1: Wrong MVT Layer Name

**What goes wrong:** `getZxy()` succeeds (returns ArrayBuffer), Phase 11 decodes MVT, but finds
zero features because it looks for layer `"buildings"` (plural) instead of `"building"` (singular).

**Why it happens:** Official Overture docs and examples sometimes say "buildings theme" loosely,
but the actual MVT layer ID is `"building"` — confirmed by reading the live metadata from
`tiles.overturemaps.org/2026-02-18.0/buildings.pmtiles`.

**How to avoid:** Define `OVERTURE_BUILDING_LAYER = 'building'` as a named constant in
`constants.ts`. Document the source (metadata read from live file, 2026-02-28).

**Warning signs:** Phase 11 returns zero buildings even for dense urban areas.

### Pitfall 2: tile-cover [x, y, z] vs PMTiles getZxy(z, x, y)

**What goes wrong:** Tiles come back as `undefined` (no data) or wrong tile data because x and z
are swapped.

**Why it happens:** `@mapbox/tile-cover` returns `[x, y, z]` arrays. `PMTiles.getZxy(z, x, y)`
takes z first.

**How to avoid:** Always destructure as `const [x, y, z] = tile` and call `getZxy(z, x, y)`.
Add a comment noting the order mismatch.

**Warning signs:** Suspiciously empty results for known dense-building areas.

### Pitfall 3: Treating undefined getZxy() as an Error

**What goes wrong:** Fetch is treated as failed when `getZxy()` returns `undefined`, triggering
silent fallback even when Overture is functioning correctly.

**Why it happens:** PMTiles `getZxy()` returns `undefined | RangeResponse` — `undefined` means
the tile exists in the range covered by the archive but has no data for that specific tile (ocean,
unpopulated areas). This is normal.

**How to avoid:** Only catch thrown errors as failures. Filter out `undefined` responses as "no
buildings in this tile" (valid data).

**Warning signs:** `overtureAvailable` is always `false`, even on retry.

### Pitfall 4: CORS Surprise on First Load (Race Condition)

**What goes wrong:** The very first PMTiles request from a cold browser fails CORS preflight
because the browser issues an OPTIONS preflight before the GET.

**Why it doesn't happen here:** `tiles.overturemaps.org` returns `Access-Control-Allow-Origin: *`
and `Access-Control-Allow-Methods: GET, HEAD` — no preflight needed for simple GET + Range requests
from a browser. Empirically tested (2026-02-28, Status 206 with `ACAO: *`).

**How to avoid:** If the URL ever changes to a different CDN, re-validate CORS empirically before
shipping.

### Pitfall 5: Concurrent Fetch Limit

**What goes wrong:** A large bbox at zoom 14 can generate dozens of tiles. Firing hundreds of
simultaneous `getZxy()` calls overwhelms the browser's connection pool (Chrome limits 6 concurrent
HTTP/2 streams per origin) and delays the 5-second timeout.

**How to avoid:** Use `p-limit` or a simple semaphore to cap concurrency at 6–12 simultaneous
tile fetches. Alternatively, since `tiles.overturemaps.org` uses HTTP/2, the browser manages
multiplexing — in practice, `Promise.all()` over ~30 tiles at zoom 14 for typical city-block
bboxes is fine. For very large bboxes, the 5-second timeout is the backstop.

**Recommendation:** Start without explicit concurrency limit (simple `Promise.all()`). The 5-second
timeout limits blast radius. Add `p-limit` only if empirical testing shows problems.

## Code Examples

Verified patterns from official sources and empirical testing:

### Opening a PMTiles Archive and Fetching One Tile

```typescript
// Source: pmtiles TypeDoc — https://pmtiles.io/typedoc/classes/PMTiles.html
import { PMTiles } from 'pmtiles';

const archive = new PMTiles('https://tiles.overturemaps.org/2026-02-18.0/buildings.pmtiles');

// getZxy(z, x, y, signal?): Promise<undefined | RangeResponse>
// RangeResponse.data: ArrayBuffer
const response = await archive.getZxy(14, 4823, 6183);
if (response) {
  const tileData: ArrayBuffer = response.data;
  // hand to MVT decoder in Phase 11
}
```

### Enumerating Tiles for a BoundingBox

```typescript
// Source: @mapbox/tile-cover README — https://github.com/mapbox/tile-cover
import cover from '@mapbox/tile-cover';

const bbox: [number, number, number, number] = [-74.01, 40.70, -73.97, 40.75]; // [w, s, e, n]
const bboxPolygon = {
  type: 'Polygon' as const,
  coordinates: [[[bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[2], bbox[3]], [bbox[0], bbox[3]], [bbox[0], bbox[1]]]]
};

// Returns [x, y, z][] — note: z last in tile-cover output
const tiles = cover.tiles(bboxPolygon, { min_zoom: 14, max_zoom: 14 });

// Usage: getZxy takes (z, x, y) — z first
for (const [x, y, z] of tiles) {
  const response = await archive.getZxy(z, x, y, signal);
}
```

### Constants File Template

```typescript
// src/lib/overture/constants.ts

/**
 * Overture Maps buildings PMTiles URL.
 *
 * RELEASE ROTATION WARNING:
 * Overture releases monthly. This URL encodes the release date (2026-02-18.0).
 * To update: check https://stac.overturemaps.org/catalog.json → "latest" field,
 * then: https://stac.overturemaps.org/{LATEST}/buildings/catalog.json → pmtiles href.
 * STAC catalog: https://stac.overturemaps.org/
 *
 * MVT layer name inside archive: "building" (singular, confirmed 2026-02-28)
 * Zoom range in archive: minzoom 5, maxzoom 14
 * CORS: Access-Control-Allow-Origin: * (verified 2026-02-28, no proxy needed)
 */
export const OVERTURE_BUILDINGS_PMTILES_URL =
  'https://tiles.overturemaps.org/2026-02-18.0/buildings.pmtiles';

/** STAC catalog URL for finding future releases */
export const OVERTURE_STAC_CATALOG_URL = 'https://stac.overturemaps.org/catalog.json';

/** MVT layer name inside the buildings PMTiles archive */
export const OVERTURE_BUILDING_LAYER = 'building';

/** Zoom level for fetching Overture building tiles (maxzoom of archive) */
export const OVERTURE_FETCH_ZOOM = 14;

/** Timeout in milliseconds for the entire Overture fetch operation */
export const OVERTURE_FETCH_TIMEOUT_MS = 5000;
```

### CORS Verification (Empirical, 2026-02-28)

```
GET https://tiles.overturemaps.org/2026-02-18.0/buildings.pmtiles
Headers: Range: bytes=0-127, Origin: http://localhost:5173

Response: HTTP/2 206
access-control-allow-origin: *
access-control-allow-methods: GET, HEAD
access-control-expose-headers: ETag, Content-Length, Content-Range, Accept-Ranges
access-control-max-age: 3000
Server: AmazonS3 via CloudFront
Content-Length: 128
```

No Vite proxy required. CORS is a wildcard allow from any origin.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| S3 beta bucket URL (`overturemaps-tiles-us-west-2-beta.s3.amazonaws.com`) | CloudFront CDN (`tiles.overturemaps.org`) | ~2025, formalized with STAC 2026-02 | Better caching, cleaner URL, CORS properly configured |
| Hardcoded release date | STAC catalog `latest` field | 2026-02-11 (STAC blog post) | Machine-readable discovery; v1.1 pins manually, v2 will auto-discover |
| Separate theme PMTiles per release | Same — but STAC indexes them | 2026-02 | STAC provides canonical URL discovery without documentation hunting |

**Deprecated/outdated:**
- S3 beta bucket direct URL: current releases (2026-02-18.0) are not present in beta bucket — use `tiles.overturemaps.org` only.
- DuckDB WASM for browser PMTiles: DuckDB WASM has no HTTPFS support in browser context — the `pmtiles` npm package is the only viable browser option (confirmed decision in STATE.md).

## Open Questions

1. **Concurrency limit for large bboxes**
   - What we know: zoom 14 over a 1km² city block generates ~4–9 tiles; 10km² generates ~80–120 tiles
   - What's unclear: whether `Promise.all()` over 120 simultaneous `getZxy()` calls saturates the 5-second timeout or the browser connection pool in practice
   - Recommendation: implement without limit first; add `p-limit@6` capped at 12 if empirical testing shows stalls. The 5-second timeout is the primary safety valve.

2. **MVT layer name for future releases**
   - What we know: layer name is `"building"` (singular) in 2026-02-18.0 release, confirmed from live metadata
   - What's unclear: whether future releases could change the layer name
   - Recommendation: use `OVERTURE_BUILDING_LAYER` constant so a single-line change handles any future rename; document that it was verified on a specific date

3. **`tiles.overturemaps.org` long-term stability**
   - What we know: domain is CloudFront-fronted, used in official Overture STAC catalog since 2026-02; `Access-Control-Allow-Origin: *`
   - What's unclear: whether this domain is stable long-term or still "beta"
   - Recommendation: use it — it is what the STAC catalog officially vends; document the STAC URL for future updates

## Sources

### Primary (HIGH confidence)

- Live endpoint test — `curl -H "Range: bytes=0-127" -H "Origin: ..."  https://tiles.overturemaps.org/2026-02-18.0/buildings.pmtiles` — confirmed CORS, 206 response, 2026-02-28
- Live metadata read — `curl -H "Range: bytes={offset}-{end}" https://tiles.overturemaps.org/2026-02-18.0/buildings.pmtiles | gzip -d` — confirmed layer name `"building"`, zoom 5–14, field list, 2026-02-28
- STAC catalog — `https://stac.overturemaps.org/` — confirmed `latest: "2026-02-18.0"` and buildings PMTiles URL, 2026-02-28
- `pmtiles` TypeDoc — https://pmtiles.io/typedoc/classes/PMTiles.html — `getZxy(z, x, y, signal?)` → `Promise<undefined | RangeResponse>`, `RangeResponse.data: ArrayBuffer`, 2026-02-28

### Secondary (MEDIUM confidence)

- `@mapbox/tile-cover` README — https://github.com/mapbox/tile-cover — `tiles(geom, {min_zoom, max_zoom})` returns `[x, y, z][]` arrays
- Overture STAC blog post — https://docs.overturemaps.org/blog/2026/02/11/stac/ — monthly release cadence, `latest` field in catalog
- Azure Maps code sample — https://github.com/Azure-Samples/AzureMapsCodeSamples/blob/main/Samples/PMTiles/Overture%20Building%20Theme/Buildings.html — `sourceLayer: "building"` (corroborates empirical finding)

### Tertiary (LOW confidence)

- Protomaps cloud storage docs — required S3 CORS: `AllowedHeaders: ["range", "if-match"]`, `ExposeHeaders: ["etag"]` — this is the pattern for self-hosted; Overture's CDN already has equivalent (empirically verified)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — pmtiles is the only viable browser PMTiles library; tile-cover is the standard bbox→tiles utility; both verified against live Overture endpoint
- Architecture: HIGH — PMTiles API verified from TypeDoc; CORS verified empirically; layer name verified from live metadata
- Pitfalls: HIGH — layer name pitfall verified from live file; argument order pitfall from TypeDoc; CORS confirmed not an issue on this endpoint
- Open questions: MEDIUM — concurrency behavior under load is untested; domain stability is inferred from official STAC vending

**Research date:** 2026-02-28
**Valid until:** 2026-05-28 (30 days for release URL; CORS and API stable for longer; check STAC for new release when updating URL)

**Release URL expiry note:** Overture releases monthly. The pinned URL `2026-02-18.0` will remain
valid (the file stays up), but the URL will lag the latest data. The STAC catalog provides the
authoritative latest URL. Update policy: update with each MapMaker release.
