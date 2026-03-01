# Phase 13: Pipeline Integration - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire OSM and Overture parallel fetching and their merged building list into the existing 3D preview and STL export pipeline. No new UI surface — gap-fill buildings appear alongside OSM buildings seamlessly.

</domain>

<decisions>
## Implementation Decisions

### Fetch orchestration
- Overture fetch fires in parallel with the OSM Overpass request inside `fetchOsmLayersStandalone`, not alongside elevation
- Both fetches use `Promise.all` or equivalent — wait for both to resolve before setting `buildingFeatures`
- Single combined status text: "Fetching buildings..." while loading, then total merged count ("47 buildings found") — user doesn't see two sources
- Shared AbortController signal: new bbox selection cancels both OSM and Overture in-flight requests. `fetchOvertureTiles` already accepts `callerSignal`

### Merge + store strategy
- Run `deduplicateOverture(osmBuildings, overtureBuildings)` to get gap-fill list, then concat `osmBuildings + gapFill` into `buildingFeatures`
- No separate store slices — `buildingFeatures` holds the merged list directly. BuildingMesh and ExportPanel read it unchanged
- Building count displayed to user is the total merged count only — no source breakdown
- Building geometry stays on the main thread (BuildingMesh uses `buildAllBuildings` directly). No worker changes
- STL export needs no special handling — Overture gap-fills are BuildingFeature just like OSM, flow through the same watertight shell pipeline

### Fallback behavior
- Completely silent fallback: if Overture fails, user gets OSM-only with no warning or degraded state indicator. This was v1.0 behavior
- `overtureAvailable` flag in store tracks availability internally (already exists from Phase 10)
- Always retry Overture on Regenerate — each generation is a fresh attempt. The 5-second timeout keeps it bounded
- Empty Overture tiles (available: true, no buildings) — just show OSM total count, no mention of Overture
- Keep existing `console.warn` for Overture failures — useful for debugging, invisible to users

### Claude's Discretion
- Exact `Promise.all` vs sequential-with-early-start pattern for parallel fetching
- Whether to add AbortController to `fetchOsmLayersStandalone` (currently has none) or manage it at the caller level
- How to structure the dedup + concat logic within `fetchOsmLayersStandalone` or a new helper
- Test strategy for integration (unit tests on the wiring, or relying on Phase 10-12 unit tests + manual verification)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `fetchOvertureTiles(bbox, callerSignal)` in `src/lib/overture/index.ts`: Returns `OvertureResult { tiles, available }`, already has timeout + abort support
- `parseOvertureTiles(tiles)` in `src/lib/overture/parse.ts`: Converts raw MVT tiles to `BuildingFeature[]`
- `deduplicateOverture(osm, overture)` in `src/lib/overture/dedup.ts`: Filters overlapping buildings at IoU >= 0.3
- `overtureAvailable` flag in `mapStore.ts`: Already exists with setter, defaults to false, resets on clear

### Established Patterns
- `fetchOsmLayersStandalone(bbox, s)` in `GenerateButton.tsx`: Single function fetches OSM, parses all layers, sets store. Integration point for adding Overture parallel fetch
- `setBuildingFeatures(features)` in store: Takes `BuildingFeature[] | null`, used by both BuildingMesh and ExportPanel
- Fire-and-forget pattern: `void fetchOsmLayersStandalone(bbox, s)` called after elevation completes — building fetch doesn't block terrain preview

### Integration Points
- `GenerateButton.tsx:fetchOsmLayersStandalone` — add Overture fetch + dedup + merge here
- `mapStore.ts:buildingFeatures` — receives merged OSM + Overture list
- `mapStore.ts:setOvertureAvailable` — set based on `OvertureResult.available`
- No changes needed in: BuildingMesh, ExportPanel, meshBuilder.worker, or any other preview components

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. The integration should be invisible to the user: same UI, same export, just more buildings in areas where OSM has gaps.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 13-pipeline-integration*
*Context gathered: 2026-03-01*
