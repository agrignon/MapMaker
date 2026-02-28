---
phase: 08-edit-iterate-export-polish
plan: 01
subsystem: ui
tags: [react, zustand, three-js, r3f, geocoding, stl-export]

# Dependency graph
requires:
  - phase: 07-vegetation-terrain-smoothing
    provides: completed store architecture and OSM layer pipeline
  - phase: 02-terrain-preview-export
    provides: generateFilename with locationName slug support
provides:
  - Back-to-Edit button in PreviewSidebar (setShowPreview(false))
  - CSS-visibility-based canvas preservation (no WebGL teardown on toggle)
  - Stale bbox indicator with functional Regenerate button
  - generatedBboxKey in Zustand store for bbox change detection
  - Location name extraction from geocoding onPick (SearchOverlay)
  - Reverse geocode fallback at generate time for manual bbox draws
  - triggerRegenerate() exported function for external callers
affects: [09-web-worker, export, stl-filenames]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Zustand getState() for non-React caller access (triggerRegenerate)"
    - "CSS visibility:hidden instead of conditional render for WebGL preservation"
    - "Exported module-level async functions for cross-component orchestration"

key-files:
  created: []
  modified:
    - src/store/mapStore.ts
    - src/components/Layout/SplitLayout.tsx
    - src/components/Preview/PreviewSidebar.tsx
    - src/components/Sidebar/GenerateButton.tsx
    - src/components/Map/SearchOverlay.tsx

key-decisions:
  - "CSS visibility:hidden (not unmount) preserves R3F WebGL context when user goes Back to Edit"
  - "triggerRegenerate() exported from GenerateButton.tsx uses useMapStore.getState() outside React"
  - "generatedBboxKey is a 5-decimal coordinate string; compared after each bbox change"
  - "Reverse geocode only fires when locationName is null — search result is never overwritten"
  - "feature.text (short name) preferred over place_name (qualified) for clean STL filenames"

patterns-established:
  - "StaleIndicator as local component inside SplitLayout — reads store, no props"
  - "Module-level standalone helpers (fetchOsmLayersStandalone, reverseGeocode) for testability"

requirements-completed: [PREV-03, PREV-04, EXPT-06]

# Metrics
duration: 3min
completed: 2026-02-28
---

# Phase 08 Plan 01: Edit-Iterate UX Summary

**Back-to-Edit navigation, stale bbox indicator with Regenerate action, and location-based STL filenames via geocoding search + reverse geocode fallback**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-28T06:28:36Z
- **Completed:** 2026-02-28T06:32:29Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- "Back to Edit" button in PreviewSidebar returns to full-width map without losing any state; R3F Canvas stays mounted (CSS-hidden) to eliminate WebGL rebuild on re-entry
- Stale bbox indicator (amber banner) appears when user moves/resizes bbox while preview is open, with a Regenerate button that triggers full re-generation via `triggerRegenerate()`
- STL filenames now include location names: searching "London" sets `locationName="London"` via geocoding onPick; drawing bbox manually triggers reverse geocode at generate time; coordinate fallback when geocoding fails

## Task Commits

1. **Task 1: Back-to-Edit button, canvas preservation, stale indicator, and store extension** - `41bebb8` (feat)
2. **Task 2: Wire location name from geocoding search + reverse geocode fallback** - `e1beb25` (feat)

## Files Created/Modified

- `src/store/mapStore.ts` - Added `generatedBboxKey: string | null` state field and `setGeneratedBboxKey` action
- `src/components/Layout/SplitLayout.tsx` - Always-mounted preview panel (visibility toggle), StaleIndicator component, imports triggerRegenerate
- `src/components/Preview/PreviewSidebar.tsx` - Added Back to Edit button above "Model Controls" heading
- `src/components/Sidebar/GenerateButton.tsx` - Extracted `triggerRegenerate()` and `fetchOsmLayersStandalone()` as exported module-level functions; added `reverseGeocode()` helper; `handleGenerate` delegates to `triggerRegenerate()`
- `src/components/Map/SearchOverlay.tsx` - Replaced early-return `handlePick` with typed event handler that calls `setLocationName(feature.text)`

## Decisions Made

- CSS `visibility: hidden` (not conditional unmount) for the preview panel — preserves the R3F WebGL context so returning to preview is instant, not a full re-initialization. Width goes to `0%` to prevent layout interference.
- `triggerRegenerate()` exported from `GenerateButton.tsx` uses `useMapStore.getState()` — works outside React component trees (StaleIndicator uses it via onClick handler).
- `generatedBboxKey` is a 5-decimal lat/lon string: `${sw.lat},${sw.lon},${ne.lat},${ne.lon}`. Only bbox changes trigger the stale indicator — settings changes (exaggeration, smoothing, toggles) don't touch this key.
- Reverse geocode only fires when `locationName` is null. If user searched for "London" and regenerates, the existing name is preserved (not overwritten by a new reverse geocode result).
- `feature.text` is preferred over `feature.place_name` for location names — short names like "London" produce clean filenames vs "London, Greater London, England, United Kingdom".

## Deviations from Plan

None - plan executed exactly as written. The `triggerRegenerate` and `reverseGeocode` functions were implemented in Task 1 as specified; Task 2 wired SearchOverlay and confirmed the flow was complete.

## Issues Encountered

**Pre-existing test failure** (not caused by this plan): `src/lib/mesh/__tests__/solid.test.ts` - `buildSolidMesh > produces a watertight mesh with no boundary edges` fails with boundary ratio 0.216. Confirmed pre-existing via git stash. Logged to `deferred-items.md`. 178/179 tests pass.

## Next Phase Readiness

- Plan 08-01 complete: edit-iterate UX loop closed
- Plan 08-02 ready to execute (STL export hardening — watertight STL, per-shell validation)
- Pre-existing `solid.test.ts` failure should be investigated in 08-02 or as a standalone fix

---
*Phase: 08-edit-iterate-export-polish*
*Completed: 2026-02-28*
