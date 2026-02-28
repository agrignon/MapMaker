# Phase 9: Performance Hardening - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Mesh generation runs off the main thread so the UI never freezes during generation or export. Production build compiles clean. Dense urban areas don't crash the browser. This phase does NOT add new features — it hardens existing functionality for reliability and responsiveness.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

User gave full discretion on all implementation decisions. Claude should evaluate tradeoffs and pick the best approach for each area based on the existing architecture, typical usage patterns, and complexity-vs-benefit ratio.

**Worker scope for preview:**
- Whether terrain geometry computation moves to a Web Worker (currently main-thread, Martini RTIN is fast for typical grids)
- Whether water and vegetation move off-thread (currently lightweight earcut triangulation)
- Rebuild cascade behavior — current cascade (terrain first, overlays follow) works well
- Whether to show a subtle indicator while layers rebuild, or keep silent swap (current)

**Export pipeline offloading:**
- Whether STL export moves to a Web Worker (currently main-thread with setTimeout yields) or stays with improved yielding
- Whether to add a cancel button during export
- Export progress style — per-layer step labels already exist and work well
- Download flow — current "show stats then Download button" flow vs auto-download

**Dense area safeguards:**
- Whether to enforce hard area limits, soft warnings, or both
- How to handle high building/road density (render everything vs LOD/simplification)
- Error recovery strategy when mesh generation fails (toast + retry vs graceful per-layer fallback)
- Whether to cap Overpass query results or rely on area size limits

**Generation progress UX:**
- Per-step progress labels vs simple spinner during initial generation
- Whether generation can be cancelled mid-process
- Stale mesh handling during slider adjustments (keep old mesh vs dim/fade)
- Whether to show estimated time remaining (likely not — inaccurate ETAs are worse than none)

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. User trusts Claude to make the right engineering calls across all four areas.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `meshBuilder.worker.ts`: Existing Web Worker for roads + buildings with zero-copy typed array transfer. Can be extended to handle terrain, water, vegetation, and export.
- `meshBuilderClient.ts`: Main-thread client with stale-result rejection via monotonic sequence IDs. Pattern can be reused for new worker message types.
- `smoothElevations` / `buildTerrainGeometry`: Already imported and used in both main-thread components and the worker.
- `ExportPanel.tsx`: Export pipeline with step-labeled progress bar — already has the UI scaffolding for progress reporting.

### Established Patterns
- **Worker message protocol**: Typed `WorkerMessage` union with `id` field for request correlation. Results transfer typed arrays as `Transferable` for zero-copy.
- **Stale-result rejection**: `roadSeqId` / `buildingSeqId` counters prevent outdated worker results from overwriting newer state.
- **Debounced rebuilds**: RoadMesh and BuildingMesh debounce worker requests (250ms) to keep slider responsive. Same pattern needed for any new worker calls.
- **Caller-side smoothing**: All terrain consumers must smooth elevation data before use. Worker already handles this with `smoothingLevel` param.
- **Store-driven rebuilds**: Components subscribe to Zustand store slices and rebuild geometry in `useEffect` when deps change.

### Integration Points
- `generationStatus` in Zustand store (`idle` → `generating` → `ready`) — needs extension for finer-grained progress
- `rebuildingLayers` store field — currently used for roads/buildings spinner, could extend to other layers
- `exportStatus` / `exportStep` / `exportResult` — existing export progress state in store
- `PreviewCanvas.tsx` — R3F Canvas that hosts all mesh components
- `overpass.ts` — single Overpass fetch for all OSM data, where query caps would be applied

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 09-performance-hardening*
*Context gathered: 2026-02-27*
