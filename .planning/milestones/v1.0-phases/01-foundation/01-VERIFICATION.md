---
phase: 01-foundation
verified: 2026-02-24T16:41:00Z
status: passed
score: 9/9 must-haves verified
re_verification:
  previous_status: passed
  previous_score: 9/9
  gaps_closed: []
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Search autocomplete returns results and flies to location"
    expected: "Typing a city name shows dropdown suggestions; selecting one animates the map to that location"
    why_human: "Requires live MapTiler API key and browser interaction to verify geocoding network call and fly-to animation"
  - test: "Shift+drag draws a bounding box on the satellite map"
    expected: "Holding Shift and dragging draws a blue semi-transparent rectangle on the map; releasing the mouse commits the shape and the sidebar dimensions update immediately"
    why_human: "HTML overlay + pointer-event interaction cannot be verified programmatically without a browser"
  - test: "Dragging corners/edges resizes the bounding box"
    expected: "Hovering a corner or edge shows a resize cursor; dragging adjusts the rectangle and sidebar dimensions update in real time"
    why_human: "Requires browser pointer events and live hit-test verification"
  - test: "Dragging the interior repositions the bounding box"
    expected: "Hovering inside the rectangle shows a move cursor; dragging translates the entire bbox; sidebar corner coordinates update in real time"
    why_human: "Requires live browser interaction with the custom move-drag implementation"
  - test: "Lat/lon coordinate input flies the map (e.g. '48.8566, 2.3522')"
    expected: "Typing a valid lat,lon string navigates the map to that point at zoom 14 without hitting the geocoding API"
    why_human: "Requires browser to observe the input event listener and map animation"
  - test: "Sidebar shows real-world dimensions after bbox is drawn"
    expected: "SelectionInfo panel shows dimension string (e.g. '3.2 km x 5.1 km'), SW/NE coordinates with 4 decimal places, UTM zone with hemisphere, and amber warning for areas where width or height exceeds 5 km"
    why_human: "Requires drawing a bbox in the browser to trigger Zustand state update and sidebar reactive render"
---

# Phase 1: Foundation Verification Report

**Phase Goal:** Users can find any location in the world, define a precise bounding box on an interactive map, and the app captures that selection in a provably correct coordinate projection ready for mesh generation
**Verified:** 2026-02-24T16:41:00Z
**Status:** passed
**Re-verification:** Yes — initial verification 2026-02-23 passed (9/9); regression check triggered by changes to `MapView.tsx` and `useTerradraw.ts` during Phase 2 and Phase 3 work.

## Re-Verification Context

Two Phase 1 files changed after the initial 2026-02-23 verification:

- `src/components/Map/MapView.tsx` — modified in multiple Phase 1 fix commits and again in Phase 3 store wiring
- `src/hooks/useTerradraw.ts` — completely rewritten in commit `b29624a` ("fix(01-03): rewrite useTerradraw with HTML overlay") replacing Terra Draw library with a custom pointer-event and HTML overlay implementation

All Phase 1 source files were re-read in full. All automated tests were re-run. All 9 truths were re-verified against the current codebase. Zero regressions found.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can type a city name, address, or lat/lon coordinates into a search field and the map flies to that location | VERIFIED | `SearchOverlay.tsx`: `GeocodingControl` with `mapController` wired at line 98; `flyTo()` called at lines 48 and 73 in lat/lon interception paths; `onPick` handler at line 37 |
| 2 | UTM projection produces correct meter-space dimensions for known bbox at multiple latitudes (automated test passes) | VERIFIED | 10/10 UTM tests pass: NYC bbox width 80-90 km, equatorial box symmetric within 5 km, southern hemisphere positive dimensions |
| 3 | STL coordinate pipeline converts meters to millimeters exactly (automated test passes) | VERIFIED | 4/4 STL tests pass: `metersToMillimeters(1) === 1000`, `bboxToMM(2300, 1800)` returns `{widthMM: 2300000, heightMM: 1800000}` |
| 4 | App renders with satellite map filling the viewport alongside a sidebar | VERIFIED | `App.tsx` uses `h-screen flex` with `<SplitLayout>` containing `<MapView />` and `<Sidebar />`; sidebar is `position:absolute` overlay inside the map container; `SplitLayout.tsx` line 38: map panel width is `100%` when `showPreview` is false |
| 5 | User can draw a bounding box on the map via Shift+drag | VERIFIED (human needed) | `useTerradraw.ts` line 160: `if (e.shiftKey)` enters drawing mode; `map.dragPan.disable()` at line 165; HTML overlay div created and positioned at lines 171-175; `map.unproject()` converts pixel coords to geo at lines 303-307; `updateStore()` called at line 318 |
| 6 | User can resize the bounding box by dragging its edges or corners | VERIFIED (human needed) | `hitTest()` function (lines 33-71) detects 8 zones (nw/ne/sw/se/n/s/e/w); `onPointerMove` resize branch (lines 215-231) updates `rectSW`/`rectNE` per zone and calls `syncOverlay` + `updateStore` live |
| 7 | User can reposition the bounding box by dragging its interior | VERIFIED (human needed) | `hitTest()` zone `'inside'` triggers `moving = true` at line 189; geo-offset computed at lines 191-192; `onPointerMove` move branch (lines 235-244) translates both corners with offset and calls `syncOverlay` + `updateStore` |
| 8 | Sidebar displays real-world dimensions and corner coordinates when a bbox is selected | VERIFIED (human needed) | `SelectionInfo.tsx` reads `bbox`, `dimensions`, `utmZone` from `useMapStore` (lines 38-40); renders `{widthM} x {heightM}` (line 55), SW/NE at 4 decimal places (lines 62-66), UTM zone with hemisphere (line 72), amber warning when either dimension exceeds 5000 m (lines 76-82) |
| 9 | Generate Preview button is visible and disabled when no bbox is selected | VERIFIED | `GenerateButton.tsx`: `hasBbox = bbox !== null` (line 32); `isDisabled = !hasBbox \|\| isLoading` (line 88); `disabled={isDisabled}` (line 98); label is `'Select an area first'` when `!hasBbox` (line 76). Button now has a real `handleGenerate` handler for Phase 2 — the Phase 1 truth (disabled without bbox) is intact |

**Score:** 9/9 truths verified (6 automated, 3 require human browser verification for interactive behavior)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/components/Map/MapView.tsx` | MapLibre GL JS satellite map rendering | VERIFIED | 64 lines; renders `<Map id="main-map">` with satellite style URL; `MapInteractions` gates `useTerradraw` and `SearchOverlay` on style load |
| `src/components/Map/SearchOverlay.tsx` | Geocoding search with autocomplete and lat/lon detection | VERIFIED | 103 lines; `GeocodingControl` with `mapController`, two `flyTo()` call sites, `LAT_LON_RE` regex, safety guard returns null without API key |
| `src/lib/utm.ts` | WGS84-to-UTM projection and bbox dimension calculation | VERIFIED | 47 lines; exports `getUTMZone`, `wgs84ToUTM`, `bboxDimensionsMeters`; uses proj4 with centroid-based zone |
| `src/lib/stl.ts` | Meters-to-millimeters coordinate conversion | VERIFIED | 20 lines; exports `metersToMillimeters`, `bboxToMM`; exact x1000 arithmetic |
| `src/lib/__tests__/utm.test.ts` | UTM projection correctness tests (FNDN-01) | VERIFIED | 59 lines; 10 tests — all pass |
| `src/lib/__tests__/stl.test.ts` | STL mm conversion tests (FNDN-02) | VERIFIED | 24 lines; 4 tests with exact value assertions — all pass |
| `src/store/mapStore.ts` | Zustand store for bbox state | VERIFIED | 129 lines; `setBbox` calls `getUTMZone` (line 74) and `bboxDimensionsMeters` (line 75); `clearBbox` resets to null (line 83); Phase 1 interface intact despite Phase 2/3 state additions |
| `src/hooks/useTerradraw.ts` | Custom bbox drawing with resize and move (HTML overlay implementation) | VERIFIED | 339 lines; full lifecycle: Shift+drag draw, 8-zone hit-test resize/move, `syncOverlay` on map move, `updateStore` on every change, complete cleanup on unmount |
| `src/components/Sidebar/SelectionInfo.tsx` | Bbox dimension and coordinate display | VERIFIED | 85 lines; `return null` when no bbox; full display when bbox present |
| `src/components/Sidebar/GenerateButton.tsx` | Generate button disabled without bbox | VERIFIED | 167 lines; `disabled={isDisabled}` where `isDisabled = !hasBbox \|\| isLoading` |

---

### Key Link Verification

**Plan 01-01 key links:**

| From | To | Via | Status | Evidence |
|------|----|-----|--------|---------|
| `SearchOverlay.tsx` | maplibre map instance | `mapController` + `map.flyTo()` | WIRED | Line 31: `createMapLibreGlMapController(map, maplibregl)` memoized; lines 48, 73: `map.flyTo()` in both lat/lon paths |
| `mapStore.ts` | `utm.ts` | `setBbox` calls `bboxDimensionsMeters` and `getUTMZone` | WIRED | Line 3: import; lines 74-76: both called inside `setBbox` action |
| `utm.test.ts` | `utm.ts` | import and assertion | WIRED | Line 2: import; 10 assertions exercising all three exports |

**Plan 01-02 key links:**

| From | To | Via | Status | Evidence |
|------|----|-----|--------|---------|
| `useTerradraw.ts` | `mapStore.ts` | `updateStore` function calls `setBbox` | WIRED | Line 3: `import { useMapStore }`; lines 136-141: `useMapStore.getState().setBbox(...)` in `updateStore`; called on draw complete (line 318), during resize (line 230), during move (line 243), and on resize finalize (line 272) |
| `SelectionInfo.tsx` | `mapStore.ts` | `useMapStore` selector reads bbox, dimensions, utmZone | WIRED | Line 1: import; lines 38-40: three `useMapStore` subscriptions |
| `MapView.tsx` | `useTerradraw.ts` | `useTerradraw` hook called with map instance | WIRED | Line 5: import; line 21: `useTerradraw(mapInstance)` inside `MapInteractions` child of `<Map>` |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| LOCS-01 | 01-01 | User can search for a location by city name, street address, or lat/lon coordinates | SATISFIED | `SearchOverlay.tsx`: `GeocodingControl` with autocomplete; lat/lon regex interception with `map.flyTo()` |
| LOCS-02 | 01-02 | User can define a bounding box by dragging on a 2D map to set the area of interest | SATISFIED | `useTerradraw.ts`: Shift+drag draws rectangle via pointer events; coordinates written to store on draw complete and during live resize/move |
| LOCS-03 | 01-02 | User can resize and reposition the bounding box after initial placement | SATISFIED | `useTerradraw.ts`: `hitTest()` detects 8 edge/corner zones for resize and interior zone for move; live `syncOverlay` + `updateStore` on every pointer move |
| FNDN-01 | 01-01 | All geometry uses local meter-space coordinates (UTM projection), not Web Mercator | SATISFIED | `utm.ts`: proj4-based UTM projection; `mapStore.ts`: `setBbox` computes UTM dimensions; 10 automated tests pass |
| FNDN-02 | 01-01 | STL export writes coordinates in millimeters (canonical unit for 3D printing) | SATISFIED | `stl.ts`: `metersToMillimeters` and `bboxToMM` with exact x1000 arithmetic; 4 automated tests pass with exact value assertions |

No orphaned requirements. All 5 Phase 1 requirements (LOCS-01, LOCS-02, LOCS-03, FNDN-01, FNDN-02) are claimed by plans and satisfied by implementation. REQUIREMENTS.md traceability table confirms all 5 marked Complete.

---

### Notable Implementation Change: useTerradraw Rewrite

The original verification described `useTerradraw.ts` as using the Terra Draw library (`TerraDrawRectangleMode`, `TerraDrawSelectMode`). The hook was completely rewritten (commit `b29624a`) to replace Terra Draw with a custom implementation using native MapLibre pointer events and HTML overlay divs. This change:

- Does not affect goal achievement — all three truths (draw, resize, move) are satisfied by the new implementation
- Improves reliability — eliminates Terra Draw adapter initialization bugs that caused Phase 1.3 fix commits
- Preserves the store interface — `setBbox()` is still called with the same `{ lon, lat }` coordinate format on draw, resize, and move
- Preserves Phase 1 behavior contract — Shift+drag draws, edge/corner drag resizes, interior drag moves

The LOCS-02 and LOCS-03 requirements are met by the new implementation with equivalent or better fidelity.

---

### Build Status Note

`npm run build` reports 4 TypeScript errors all in Phase 2/3 files:
- `src/components/Preview/PreviewControls.tsx` — unused `THREE` import (Phase 2)
- `src/lib/buildings/__tests__/walls.test.ts` — unused variable (Phase 3)
- `src/lib/mesh/terrain.ts` — missing `@mapbox/martini` type declaration (Phase 2)
- `src/lib/mesh/terrain.ts` — unused variable (Phase 2)

`npx tsc --noEmit` (project-level tsconfig) passes cleanly. Zero errors in any Phase 1 file. These errors are outside Phase 1 scope and do not affect Phase 1 goal achievement.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `SelectionInfo.tsx` | 42 | `return null` | INFO | Intentional conditional render — correct behavior when no bbox is selected; not a stub |

No blockers or warnings in any Phase 1 file. No TODO/FIXME/placeholder comments. No empty implementations.

---

### Human Verification Required

#### 1. Geocoding Autocomplete and Fly-To

**Test:** With a valid `VITE_MAPTILER_KEY` in `.env`, run `npm run dev`, open http://localhost:5173, type "Paris" into the search field
**Expected:** Dropdown suggestions appear; selecting "Paris, France" animates the map to Paris
**Why human:** Requires live MapTiler API key, network call, and browser observation of fly-to animation

#### 2. Lat/Lon Coordinate Input Navigation

**Test:** In the search field, type "48.8566, 2.3522"
**Expected:** Map flies to Paris (lat 48.8566, lon 2.3522) at zoom 14 immediately upon typing a valid lat,lon pattern — no selection needed
**Why human:** Requires browser to observe the input event listener firing and map animating

#### 3. Shift+Drag Bounding Box Drawing

**Test:** On the satellite map, hold Shift and click-drag to draw a rectangle
**Expected:** Cursor changes to crosshair; a blue semi-transparent rectangle (rgba(59,130,246,0.2) fill, rgba(59,130,246,0.8) border) appears as you drag; releasing the mouse commits the shape and the sidebar shows dimensions
**Why human:** Requires browser pointer events against the MapLibre canvas

#### 4. Bbox Resize via Corners and Edges

**Test:** After drawing a bbox, hover over a corner; then hover over an edge; drag each
**Expected:** Cursor changes to `nwse-resize`/`nesw-resize` at corners, `ns-resize`/`ew-resize` at edges; dragging adjusts the rectangle; sidebar dimensions update in real time
**Why human:** Requires live `hitTest` detection and pointer events in browser

#### 5. Bbox Reposition via Interior Drag

**Test:** After drawing a bbox, hover inside the rectangle; drag it
**Expected:** Cursor changes to `move`; the entire bbox translates; sidebar corner coordinates update in real time
**Why human:** Requires live browser interaction with the custom move-drag implementation

#### 6. Sidebar Selection Info Display

**Test:** Draw a bbox approximately 3 km x 5 km; then draw a new one approximately 8 km x 10 km
**Expected:** First bbox: dimensions show "3.X km x 5.X km", SW/NE coords at 4 decimal places, UTM zone with hemisphere — no amber warning. Second bbox: amber "Large area selected" warning appears
**Why human:** Requires drawing in browser to trigger Zustand state updates and sidebar reactive render

---

### Gaps Summary

No gaps. All 9 observable truths are verified against the current codebase. All 5 Phase 1 requirements (LOCS-01, LOCS-02, LOCS-03, FNDN-01, FNDN-02) have implementation evidence. No regressions were introduced by Phase 2/3 changes. The coordinate pipeline is intact and correct:

- WGS84 lon/lat captured by custom Shift+drag drawing via `useTerradraw`
- Coordinates flow to `useMapStore.getState().setBbox()` on draw complete, during resize, and during move
- `setBbox` calls `getUTMZone` and `bboxDimensionsMeters` (via proj4) to produce provably correct meter-space dimensions
- 14 automated tests confirm UTM projection correctness and STL mm conversion exactness
- All Phase 1 source files have zero TypeScript errors (`npx tsc --noEmit` passes)

The `useTerradraw` rewrite is a transparent implementation swap. The behavioral contract (draw, resize, move, store update) is preserved with equivalent semantics under a more reliable native-event implementation.

---

_Verified: 2026-02-24T16:41:00Z_
_Verifier: Claude (gsd-verifier)_
