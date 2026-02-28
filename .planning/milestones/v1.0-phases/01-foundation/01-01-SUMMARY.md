---
phase: 01-foundation
plan: 01
subsystem: ui
tags: [vite, react, typescript, maplibre-gl, tailwind, zustand, proj4, terra-draw, geocoding, utm, stl]

# Dependency graph
requires: []
provides:
  - Vite + React + TypeScript project scaffold with all Phase 1 dependencies installed
  - MapLibre GL satellite map rendering via @vis.gl/react-maplibre
  - MapTiler geocoding search overlay with lat/lon coordinate detection
  - Zustand store with bbox state management (setBbox/clearBbox)
  - UTM projection library (getUTMZone, wgs84ToUTM, bboxDimensionsMeters) using proj4
  - STL coordinate pipeline (metersToMillimeters, bboxToMM) for mm-space export
  - TypeScript geo type interfaces (WGS84Coords, BoundingBox, UTMCoords, BboxDimensions, BboxMM)
  - Tailwind v4 with system dark mode via @tailwindcss/vite plugin
  - Vitest test infrastructure with 14 passing tests (FNDN-01, FNDN-02)
affects:
  - 01-foundation/01-02 (bbox drawing will use Zustand store and UTM projection)
  - All phases requiring coordinate projection (UTM pipeline established here)

# Tech tracking
tech-stack:
  added:
    - maplibre-gl@5.19.0 (satellite map rendering)
    - "@vis.gl/react-maplibre@8.1.0 (React bindings for MapLibre)"
    - "@maptiler/geocoding-control@2.1.7 (geocoding search UI)"
    - proj4@2.12.0 (UTM coordinate projection)
    - zustand@5.0.3 (client state management)
    - terra-draw@1.25.0 (bbox drawing, used in Plan 02)
    - "@tailwindcss/vite@4.2.1 (Tailwind v4 Vite plugin)"
    - vitest@3.0.0 (unit test runner)
    - "@testing-library/react@16.1.0 (React component testing)"
  patterns:
    - Tailwind v4 via @tailwindcss/vite plugin (no tailwind.config.js, @import in CSS)
    - System dark mode via Tailwind dark: variant (no manual toggle)
    - Zustand store for cross-component state (bbox, utmZone, dimensions)
    - UTM projection always uses centroid longitude for zone selection (both corners same zone)
    - Separate vitest.config.ts from vite.config.ts for clean test configuration

key-files:
  created:
    - src/types/geo.ts
    - src/store/mapStore.ts
    - src/lib/utm.ts
    - src/lib/stl.ts
    - src/lib/__tests__/utm.test.ts
    - src/lib/__tests__/stl.test.ts
    - src/components/Map/MapView.tsx
    - src/components/Map/SearchOverlay.tsx
    - src/components/Sidebar/Sidebar.tsx
    - src/App.tsx
    - src/main.tsx
    - src/index.css
    - vite.config.ts
    - vitest.config.ts
    - tsconfig.json
    - tsconfig.app.json
    - tsconfig.node.json
    - package.json
  modified: []

key-decisions:
  - "Used @vis.gl/react-maplibre@8.1.0 (not 1.x — package jumped from alpha 1.x to 8.x major)"
  - "Used @maptiler/geocoding-control@2.1.7 (plan referenced 1.4.5 which did not exist; 2.x is stable)"
  - "UTM projection uses centroid longitude/hemisphere for both corners to ensure consistent meter-space arithmetic"
  - "SearchOverlay intercepts input events directly to detect lat/lon pattern, fires map.flyTo() immediately on match"
  - "Equator symmetry test fixed: test used 2°×1° bbox (asymmetric by design); corrected to 1°×1° for geometric correctness"

patterns-established:
  - "Coordinate pipeline: WGS84 lon/lat → UTM meters (proj4) → millimeters (×1000)"
  - "UTM zone always derived from centroid longitude, not SW or NE corner"
  - "Both bbox corners projected with the same UTM zone for valid meter arithmetic"
  - "MapLibre map accessed via useMap()['main-map'] with fallback to useMap().current"

requirements-completed: [LOCS-01, FNDN-01, FNDN-02]

# Metrics
duration: 5min
completed: 2026-02-24
---

# Phase 01 Plan 01: Foundation Scaffold Summary

**Vite + React + TypeScript app with MapLibre satellite map, MapTiler geocoding overlay, Zustand bbox store, and proj4 UTM projection pipeline with 14 passing tests**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-24T01:18:54Z
- **Completed:** 2026-02-24T01:23:55Z
- **Tasks:** 3
- **Files modified:** 22

## Accomplishments

- Complete project scaffold from empty directory: Vite, React 18, TypeScript strict mode, Tailwind v4, Vitest
- Satellite map rendering via @vis.gl/react-maplibre with 300px sidebar + flex-1 map layout matching design spec
- Geocoding search overlay with MapTiler autocomplete and direct lat/lon coordinate fly-to (e.g. "48.8566, 2.3522")
- UTM projection pipeline implemented and tested: getUTMZone, wgs84ToUTM, bboxDimensionsMeters verified for NYC, equator, southern hemisphere
- STL coordinate pipeline tested: metersToMillimeters and bboxToMM with exact arithmetic assertions
- All 14 automated tests pass; FNDN-01 and FNDN-02 requirements satisfied

## Task Commits

Each task was committed atomically:

1. **Task 1: Scaffold Vite project with all dependencies and configuration** - `0838db9` (chore)
2. **Task 2: Render MapLibre satellite map with geocoding search overlay** - `95f8617` (feat)
3. **Task 3: Implement UTM projection and STL coordinate pipeline with TDD** - `2e3fd20` (test)

## Files Created/Modified

- `package.json` - All Phase 1 dependencies (maplibre-gl, proj4, zustand, terra-draw, geocoding-control, tailwind, vitest)
- `vite.config.ts` - Vite with @vitejs/plugin-react and @tailwindcss/vite
- `vitest.config.ts` - Separate vitest config with jsdom environment and jest-dom setup
- `tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json` - TypeScript strict mode
- `src/types/geo.ts` - WGS84Coords, BoundingBox, UTMCoords, BboxDimensions, BboxMM interfaces
- `src/store/mapStore.ts` - Zustand store with bbox, utmZone, dimensions state + setBbox/clearBbox actions
- `src/lib/utm.ts` - getUTMZone, wgs84ToUTM, bboxDimensionsMeters using proj4
- `src/lib/stl.ts` - metersToMillimeters, bboxToMM for STL coordinate conversion
- `src/lib/__tests__/utm.test.ts` - 10 tests verifying UTM projection correctness (FNDN-01)
- `src/lib/__tests__/stl.test.ts` - 4 tests verifying mm conversion exactness (FNDN-02)
- `src/components/Map/MapView.tsx` - MapLibre satellite-v2 map with @vis.gl/react-maplibre
- `src/components/Map/SearchOverlay.tsx` - GeocodingControl with createMapLibreGlMapController + lat/lon interception
- `src/components/Sidebar/Sidebar.tsx` - Sidebar shell with dark mode styles
- `src/App.tsx` - h-screen flex layout with 300px sidebar
- `src/main.tsx` - React 18 createRoot with CSS imports
- `src/index.css` - Tailwind v4 @import with dark mode body styles
- `.env.example` - VITE_MAPTILER_KEY placeholder
- `.gitignore` - Excludes .env, node_modules, dist

## Decisions Made

- Used @vis.gl/react-maplibre@8.1.0: plan referenced 1.x which jumped from alpha to 8.x major release; 8.1.0 is current stable
- Used @maptiler/geocoding-control@2.1.7: plan referenced 1.4.5 which did not exist in npm registry; 2.1.7 is current stable
- UTM projection uses centroid longitude for zone selection: ensures both SW and NE corners project into the same UTM zone, making meter-space arithmetic valid
- SearchOverlay intercepts DOM input events directly to detect lat/lon pattern and fires map.flyTo() immediately (no API call)
- Created utm.ts and stl.ts in Task 1 (alongside stubs) rather than waiting for Task 3, to keep TypeScript compilation valid throughout

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed equator symmetry test — incorrect bbox dimensions in test spec**
- **Found during:** Task 3 (UTM tests)
- **Issue:** Test used sw=[-1.0, -0.5], ne=[1.0, 0.5] (2° wide × 1° tall) but expected |widthM - heightM| < 5000. A 2°×1° bbox is asymmetric by definition — 2° lon ≈ 222km, 1° lat ≈ 111km, difference ~112km.
- **Fix:** Changed bbox to sw=[-0.5, -0.5], ne=[0.5, 0.5] (1°×1°) which is geometrically symmetric and tests the intent correctly
- **Files modified:** src/lib/__tests__/utm.test.ts
- **Verification:** Test passes with |widthM - heightM| well within 5000m
- **Committed in:** 2e3fd20 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug in test spec)
**Impact on plan:** Test intent preserved (verify UTM doesn't distort near equator); bbox corrected to geometrically valid square. No scope creep.

## Issues Encountered

- `npm create vite@latest . -- --template react-ts` cancelled because directory was non-empty (has .git and .planning). Created all Vite scaffold files manually — equivalent result.
- @maptiler/geocoding-control@1.4.5 and @vis.gl/react-maplibre@1.2.0 not found in npm registry; used latest stable 2.x and 8.x respectively.

## User Setup Required

A MapTiler API key is required for the satellite map tiles and geocoding to work:

1. Sign up at https://cloud.maptiler.com (free tier available)
2. Create a key at https://cloud.maptiler.com/account/keys
3. Copy `.env.example` to `.env` and set `VITE_MAPTILER_KEY=your_key_here`
4. Run `npm run dev` — satellite map should load with tiles

Without a key, the map will fail to load tiles (blank/error state) but the app will build and tests will pass.

## Next Phase Readiness

- All Phase 1 coordinate infrastructure in place; Plan 02 can build bbox drawing on top of mapStore
- terra-draw is installed and ready for bbox drawing implementation (Plan 02)
- Sidebar is a shell — Plan 02 adds SelectionInfo and GenerateButton
- Dev server ready: `npm run dev` at http://localhost:5173

## Self-Check: PASSED

- All 15 key files verified present on disk
- All 3 task commits verified in git log (0838db9, 95f8617, 2e3fd20)
- `npm run build` passes without errors
- `npx vitest run src/lib/__tests__/` — 14/14 tests pass
- `npx tsc --noEmit` — 0 errors

---
*Phase: 01-foundation*
*Completed: 2026-02-24*
