---
status: resolved
phase: 01-foundation
source: [01-01-SUMMARY.md, 01-02-SUMMARY.md]
started: 2026-02-24T02:00:00Z
updated: 2026-02-24T02:10:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Satellite Map Loads
expected: Open the app (npm run dev). A satellite imagery map fills the right side of the screen. A dark sidebar (300px wide) is visible on the left.
result: issue
reported: "launched the app, black screen where the map should be"
severity: blocker

### 2. Geocoding Search
expected: Type a place name (e.g. "Paris") in the search box on the map. Autocomplete suggestions appear. Selecting one flies the map to that location.
result: issue
reported: "Start typing, popup appears with red text saying 'Something went wrong'"
severity: blocker

### 3. Lat/Lon Coordinate Fly-To
expected: Type coordinates like "48.8566, 2.3522" in the search box. The map flies directly to that location (Paris area) without showing autocomplete results.
result: issue
reported: "Again, I get a popup error with 'Something went wrong'"
severity: blocker

### 4. Draw Bounding Box
expected: Click and drag on the map to draw a rectangle. A blue semi-transparent rectangle appears with a solid border.
result: issue
reported: "the screen is all black, but there is a lone marker, and clicking and dragging moves the marker around the screen, no box being drawn"
severity: blocker

### 5. Resize and Reposition Rectangle
expected: After drawing a rectangle, grab an edge or corner to resize it, or drag its interior to reposition it. The rectangle updates smoothly.
result: issue
reported: "nothing is working"
severity: blocker

### 6. Single Rectangle Enforcement
expected: Draw a second rectangle on the map. The first rectangle disappears — only the newest one remains.
result: issue
reported: "nothing is working"
severity: blocker

### 7. Sidebar Selection Info
expected: After drawing a rectangle, the sidebar shows: width and height dimensions (in m or km), SW and NE corner coordinates (4 decimal places), and the UTM zone with hemisphere.
result: issue
reported: "nothing is working"
severity: blocker

### 8. Large Area Warning
expected: Draw a very large rectangle (>5km on either axis). An amber/yellow warning appears in the sidebar about the large area.
result: issue
reported: "nothing works"
severity: blocker

### 9. Generate Button State
expected: Without a selection, the sidebar footer shows a disabled button reading "Select an area first". After drawing a rectangle, the button changes to "Generate Preview" but remains disabled (greyed out, with "Available after Phase 2" subtitle).
result: issue
reported: "nothing works, whole step was a failure"
severity: blocker

## Summary

total: 9
passed: 0
issues: 9
pending: 0
skipped: 0

## Gaps

- truth: "Satellite imagery map renders filling the right side of the screen"
  status: resolved
  reason: "User reported: launched the app, black screen where the map should be"
  severity: blocker
  test: 1
  root_cause: "No .env file exists — only .env.example with placeholder. VITE_MAPTILER_KEY resolves to undefined, falls back to empty string via ?? '', MapTiler rejects unauthenticated request, MapLibre renders black canvas."
  artifacts:
    - path: "src/components/Map/MapView.tsx"
      issue: "Line 6-8: ?? '' silently converts undefined key to empty string — no error shown to user"
    - path: ".env.example"
      issue: "Only example file exists, no .env with real key"
  missing:
    - "Create .env file with valid VITE_MAPTILER_KEY"
    - "Add runtime guard in MapView.tsx to throw clear error when key is missing"
  debug_session: ".planning/debug/black-screen-satellite-map.md"

- truth: "Geocoding search shows autocomplete suggestions and flies to selected location"
  status: resolved
  reason: "User reported: Start typing, popup appears with red text saying 'Something went wrong'"
  severity: blocker
  test: 2
  root_cause: "Same missing .env file. GeocodingControl receives apiKey='' (empty string). Library's internal guard (f && ee.set('key', f)) treats empty string as falsy, omits key from API request. MapTiler returns 403."
  artifacts:
    - path: "src/components/Map/SearchOverlay.tsx"
      issue: "Line 9: ?? '' fallback produces falsy empty string"
  missing:
    - "Create .env file with valid VITE_MAPTILER_KEY (same fix as gap 1)"
  debug_session: ".planning/debug/geocoding-something-went-wrong.md"

- truth: "Typing lat/lon coordinates flies map directly to that location"
  status: resolved
  reason: "User reported: popup error with 'Something went wrong'"
  severity: blocker
  test: 3
  root_cause: "Same as gap 2 — geocoding control fails before lat/lon interception can trigger."
  artifacts:
    - path: "src/components/Map/SearchOverlay.tsx"
      issue: "Geocoding control error blocks all search input"
  missing:
    - "Fix .env (same as gap 1)"
  debug_session: ".planning/debug/geocoding-something-went-wrong.md"

- truth: "Click-and-drag draws a blue semi-transparent rectangle on the map"
  status: resolved
  reason: "User reported: black screen, lone marker, clicking and dragging moves marker around"
  severity: blocker
  test: 4
  root_cause: "useMap()['main-map'] returns undefined because no <MapProvider> wraps the component tree. @vis.gl/react-maplibre registers maps by id only when MountedMapsContext is provided via <MapProvider>. Without it, useMap() only has .current key. useTerradraw receives null map instance and bails at line 23 (if (!map) return)."
  artifacts:
    - path: "src/components/Map/MapView.tsx"
      issue: "Line 17: maps['main-map']?.getMap() returns undefined — no MapProvider in tree"
    - path: "src/hooks/useTerradraw.ts"
      issue: "Line 23: early return when map is null — TerraDraw never initializes"
  missing:
    - "Either wrap app in <MapProvider> from @vis.gl/react-maplibre, or change MapView.tsx to use maps.current instead of maps['main-map']"
  debug_session: ".planning/debug/terradraw-rectangle-broken.md"
