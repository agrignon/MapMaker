---
phase: 01-foundation
plan: 02
subsystem: ui
tags: [terra-draw, maplibre, zustand, bbox, utm, tailwind, react, typescript]

# Dependency graph
requires:
  - 01-01 (Zustand store with setBbox/clearBbox, UTM projection pipeline, MapView scaffold)
provides:
  - Terra Draw rectangle and select modes on the satellite map (click-and-drag bbox drawing)
  - useTerradraw custom hook for TerraDraw lifecycle management with MapLibre GL adapter
  - Sidebar SelectionInfo component (dimensions in km/m, corner coordinates, UTM zone, area warning)
  - Sidebar GenerateButton component (disabled, Phase 2 placeholder)
  - Reactive sidebar updates when bbox is drawn, resized, or repositioned
affects:
  - 01-foundation/02 (Phase 2 can read bbox from store and generate terrain mesh)
  - All phases consuming bbox state (coordinate pipeline fully wired)

# Tech tracking
tech-stack:
  added:
    - terra-draw-maplibre-gl-adapter@1.3.0 (MapLibre GL adapter for Terra Draw — separate package, not bundled in terra-draw)
  patterns:
    - useTerradraw hook called inside a child component of <Map> to satisfy useMap() context requirement
    - TerraDraw change listener extracts min/max lon/lat from polygon ring for WGS84 SW/NE bbox
    - Auto-switch to select mode after rectangle creation for frictionless resize/reposition UX
    - Single-rectangle enforcement: on 'create' with >1 rectangles, remove older ones via draw.removeFeatures()
    - Sidebar uses flex-col layout with flex-1 body and pinned footer for GenerateButton
    - Dimension display: meters if <1000m, km with 1 decimal if >= 1000m
    - Large area warning: amber alert when either dimension exceeds 5km

key-files:
  created:
    - src/hooks/useTerradraw.ts
    - src/components/Sidebar/SelectionInfo.tsx
    - src/components/Sidebar/GenerateButton.tsx
  modified:
    - src/components/Map/MapView.tsx
    - src/components/Sidebar/Sidebar.tsx
    - src/App.tsx
    - package.json (terra-draw-maplibre-gl-adapter added)
    - package-lock.json

key-decisions:
  - "terra-draw-maplibre-gl-adapter@1.3.0 installed separately — adapter is not bundled in terra-draw 1.25.0; confirmed via npm search"
  - "MapInteractions inner component pattern: useTerradraw must be called inside a <Map> child so useMap() has context"
  - "Auto-switch to select mode after 'create' event: users never need a manual mode toggle after drawing"
  - "Sidebar owns its own w-[300px] h-screen layout; App.tsx wrapper div simplified"

# Metrics
duration: 2min
completed: 2026-02-24
---

# Phase 01 Plan 02: Terra Draw Bbox Selection Summary

**Terra Draw rectangle and select modes on MapLibre satellite map with reactive sidebar showing dimensions, coordinates, UTM zone, and disabled Generate Preview button**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-24T01:27:36Z
- **Completed:** 2026-02-24T01:29:38Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Terra Draw initialised with TerraDrawMapLibreGLAdapter (installed terra-draw-maplibre-gl-adapter@1.3.0 — separate package not bundled in terra-draw)
- Click-and-drag rectangle drawing via TerraDrawRectangleMode with blue fill (20% opacity) and solid border (80% opacity, 2px)
- Auto-switch to select mode after rectangle creation — users immediately get resize/reposition handles
- Select mode configured with draggable:true, midpoints:true, resizable:'opposite' for full edge/corner/interior manipulation
- Single-rectangle enforcement: older rectangles removed when a new one is created
- WGS84 SW/NE coordinates extracted from polygon ring (min/max lon/lat), written to Zustand store via setBbox on every change
- SelectionInfo component: dimensions (km/m threshold at 1000m), SW/NE coords (4 decimal places), UTM zone with hemisphere, amber large-area warning (>5km either axis)
- GenerateButton: disabled throughout Phase 1, reactive label ("Select an area first" vs "Generate Preview"), "Available after Phase 2" subtitle
- All 14 automated UTM/STL tests continue to pass; zero TypeScript errors

## Task Commits

Each task committed atomically:

1. **Task 1: Initialize Terra Draw with rectangle and select modes, wire bbox to store** - `62821e7` (feat)
2. **Task 2: Display selection info in sidebar with dimensions, coordinates, and generate button** - `b8890b7` (feat)

## Files Created/Modified

- `src/hooks/useTerradraw.ts` (created, 149 lines) — TerraDraw lifecycle hook with adapter, modes, change handler, cleanup
- `src/components/Map/MapView.tsx` (modified) — Added MapInteractions child component with useMap() + useTerradraw call
- `src/components/Sidebar/SelectionInfo.tsx` (created, 93 lines) — Bbox dimensions, coordinates, UTM zone, area warning
- `src/components/Sidebar/GenerateButton.tsx` (created, 30 lines) — Disabled Phase 1 generate button with reactive label
- `src/components/Sidebar/Sidebar.tsx` (modified) — Flex-col layout with header, scrollable body, pinned footer
- `src/App.tsx` (modified) — Simplified: removed redundant wrapper div, Sidebar now self-contained with w-[300px] h-screen
- `package.json` / `package-lock.json` — terra-draw-maplibre-gl-adapter@1.3.0 added

## Decisions Made

- **terra-draw-maplibre-gl-adapter installed separately:** The `terra-draw` package (1.25.0) does not bundle a MapLibre GL adapter. The adapter exists as `terra-draw-maplibre-gl-adapter@1.3.0` on npm — confirmed via `npm search terra-draw`. Installed as a runtime dependency.
- **MapInteractions inner component:** `useMap()` from `@vis.gl/react-maplibre` requires a component to be a descendant of `<Map>`. Created a `MapInteractions` component rendered inside `<Map>` to satisfy this. The `useTerradraw` hook receives the live map instance via `maps['main-map']?.getMap() ?? null`.
- **Auto-switch to select mode on create:** After a rectangle is drawn, Terra Draw is switched to 'select' mode automatically. Users get resize/reposition handles immediately without any UI gesture to change modes.
- **Sidebar layout ownership:** Moved `w-[300px] h-screen` from App.tsx wrapper div into Sidebar component. Sidebar is now self-contained — cleaner component boundaries.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Package Installation

`terra-draw-maplibre-gl-adapter@1.3.0` was installed (not pre-installed). The plan noted "if package not found separately, try importing from `terra-draw` directly" — the separate package exists and was installed. This is expected setup, not a deviation.

## Issues Encountered

- None.

## Next Phase Readiness

- Bbox state flows completely from map drawing to Zustand store; Phase 2 can read `bbox`, `dimensions`, and `utmZone` without any changes to the store
- Sidebar infrastructure in place; Phase 2 can add terrain controls and model parameters between SelectionInfo and GenerateButton
- Generate Preview button can be wired to Phase 2 mesh generation by removing the `disabled` attribute in `GenerateButton.tsx`
- Dev server: `npm run dev` at http://localhost:5173

## Self-Check: PASSED

- `src/hooks/useTerradraw.ts` — present (149 lines, minimum 40)
- `src/components/Sidebar/SelectionInfo.tsx` — present (93 lines, minimum 25)
- `src/components/Sidebar/GenerateButton.tsx` — present (30 lines, minimum 8)
- `src/components/Map/MapView.tsx` — modified (contains useTerradraw call)
- `src/components/Sidebar/Sidebar.tsx` — modified (contains SelectionInfo and GenerateButton)
- `npx tsc --noEmit` — 0 errors
- `npx vitest run src/lib/__tests__/` — 14/14 tests pass
- Task commits: 62821e7 (Task 1), b8890b7 (Task 2) — both in git log
- Key links satisfied: useTerradraw->setBbox, SelectionInfo->useMapStore, MapView->useTerradraw

---
*Phase: 01-foundation*
*Completed: 2026-02-24*
