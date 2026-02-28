# Phase 8: Edit-Iterate + Export Polish - Context

**Gathered:** 2026-02-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can navigate between editing and preview without losing state, the preview reflects setting changes live (already working), bbox changes show a stale indicator with manual regenerate, and exported STL filenames include the searched (or reverse-geocoded) location name.

</domain>

<decisions>
## Implementation Decisions

### Back-to-edit navigation
- "Back to Edit" button placed in the **preview sidebar header** (top of the right-side controls panel)
- Clicking it hides the preview panel, expanding the map to full width (same `showPreview` toggle mechanism)
- Split layout is preserved — map stays visible on the left while previewing on the right
- Bounding box remains **editable while previewing** — user can drag/resize bbox on the map with the preview open

### Bbox change + stale indicator
- When the user moves or resizes the bbox while preview is open, the old preview stays visible but a **stale indicator** appears (e.g., "Area changed — Regenerate")
- Only bbox changes trigger the stale indicator — settings like exaggeration, smoothing, layer toggles, road style, and dimensions continue updating the preview live as they do today
- Success criterion #2 ("preview updates automatically without manual regenerate") is satisfied by the existing live reactivity for settings; bbox changes require manual regenerate via the stale indicator

### STL filename — location name
- Wire the geocoding search result name into `setLocationName()` in the store (currently never called)
- When the user doesn't use search (draws bbox manually), **reverse geocode the bbox center** at generate time to always provide a location-based filename
- Filename format: location + layer suffixes (no physical dimensions in filename). Existing `generateFilename()` function handles this
- Coordinate-based fallback only if reverse geocode fails

### Claude's Discretion
- Preview teardown vs hide-in-memory on "Back to Edit" — choose based on performance/complexity
- Stale indicator visual treatment — banner vs overlay, whatever fits existing UI style
- Which part of geocoding result to use for filename (place name, place+country, full text) — pick best balance of specificity and filename length

</decisions>

<specifics>
## Specific Ideas

- Reverse geocode should happen at generate time (when user clicks Generate Preview), not at export time — the name is stored in the store and ready when they eventually export
- Stale indicator should include a clickable "Regenerate" action, not just a passive label

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `generateFilename()` in `src/lib/export/stlExport.ts` — already handles location name slugification, layer suffixes, and coordinate fallback. Just needs to be fed a non-null `locationName`
- `locationName` field and `setLocationName()` action already exist in the Zustand store (`mapStore.ts:32, 72, 191`) — never called from any component
- `showPreview` boolean in store already controls split layout visibility — "Back to Edit" just needs to call `setShowPreview(false)`
- `SplitLayout.tsx` already handles show/hide of preview panel based on `showPreview`

### Established Patterns
- Zustand store preserves all state across view switches — no state is lost when toggling `showPreview`
- Settings (exaggeration, smoothing, toggles, dimensions, road style) already trigger live preview updates via React reactivity
- `RebuildOverlay` component in `PreviewCanvas.tsx` shows indeterminate progress during expensive rebuilds — similar pattern could inform stale indicator
- `GeocodingControl` from `@maptiler/geocoding-control/react` has an `onPick` callback that receives structured result data including place name

### Integration Points
- `SearchOverlay.tsx` — wire `onPick` callback to extract place name and call `setLocationName()`
- `GenerateButton.tsx:handleGenerate()` — add reverse geocode call when `locationName` is null
- `PreviewSidebar.tsx` header area — add "Back to Edit" button
- `PreviewCanvas.tsx` or `SplitLayout.tsx` — add stale indicator when bbox changes after generation
- MapTiler reverse geocoding API — `https://api.maptiler.com/geocoding/{lon},{lat}.json?key={key}`

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-edit-iterate-export-polish*
*Context gathered: 2026-02-27*
