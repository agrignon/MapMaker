# Phase 10: Overture Access - Context

**Gathered:** 2026-02-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish PMTiles-based fetching of Overture Maps building footprints for the user's selected bounding box. Validate CORS for browser range requests. Provide silent fallback to OSM-only when Overture is unavailable. Document the 60-day URL rotation and STAC catalog URL.

This phase delivers raw tile data only — decoding MVT into BuildingFeature format is Phase 11.

</domain>

<decisions>
## Implementation Decisions

### Fallback transparency
- Any failure type (network, CORS, HTTP error, timeout, malformed response) triggers silent fallback to OSM-only
- Log a `console.warn` with details (URL, error type) on Overture failure — developers can diagnose, users never see it
- Store an `overtureAvailable: boolean` flag in the Zustand store (`mapStore`) so future phases can optionally surface Overture status in UI
- Empty Overture response (no buildings in area) counts as successful (`overtureAvailable: true`) — it's valid data, not a failure

### Fetch timeout & retry
- 5-second timeout for the entire Overture fetch operation (all tile requests combined)
- Fail fast — single attempt, no retry on transient failures
- Use `AbortController` so the Overture fetch can be cleanly cancelled if the user changes the bounding box mid-fetch

### Large-area data limits
- No bounding box size limit for Overture fetching — same policy as OSM
- The 5-second timeout acts as a natural safety valve for large areas
- Phase 10 passes raw tile data through as-is — Phase 11 (MVT Parser) handles all filtering and validation

### Deployment & CORS
- Overture PMTiles are served from a public third-party bucket (Overture Maps Foundation) — we do not control CORS configuration
- If CORS headers block browser range requests, the silent fallback handles it gracefully — defer CORS workarounds (proxy, own bucket copy) to a future effort
- Must work from localhost during development — if CORS blocks localhost, set up a Vite dev proxy as a workaround

### Claude's Discretion
- PMTiles zoom level selection (fixed vs dynamic based on bbox size)
- Tile fetch concurrency strategy (parallel with limit vs sequential)
- PMTiles library choice and integration approach
- Specific Vite proxy configuration for localhost dev

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches for PMTiles access.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `fetchAllOsmData()` in `src/lib/overpass.ts`: Pattern for bbox-based data fetching (POST with encoded query). Overture fetch follows similar structure but uses HTTP range requests instead
- `BuildingFeature` interface in `src/lib/buildings/types.ts`: Target format for Phase 11 — Phase 10 returns raw tile data, not BuildingFeature
- `mapStore` (Zustand): Will host the `overtureAvailable` flag alongside existing state

### Established Patterns
- Combined data fetching: Single `fetchAllOsmData()` call for all OSM features — Overture fetch will be a separate parallel call
- Error handling: Current Overpass fetch throws on HTTP failure — Overture fetch must catch and fallback instead of throwing
- Web Worker: `meshBuilder.worker.ts` receives `BuildingFeature[]` — Overture buildings will eventually flow through the same worker (Phase 13)
- Sequence IDs: Worker uses message IDs for stale rejection — similar pattern useful for Overture fetch cancellation

### Integration Points
- New Overture fetch module: `src/lib/overture/` directory (parallel to `src/lib/buildings/`)
- Zustand store: Add `overtureAvailable` boolean to existing `mapStore.ts`
- Phase 13 will wire Overture fetch to run parallel with `fetchAllOsmData()` — Phase 10 just provides the fetch function

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-overture-access*
*Context gathered: 2026-02-28*
