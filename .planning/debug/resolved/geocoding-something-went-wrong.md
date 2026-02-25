---
status: resolved
trigger: "Start typing in geocoding search, popup appears with red text saying 'Something went wrong'"
created: 2026-02-23T00:00:00Z
updated: 2026-02-23T00:00:00Z
---

## Current Focus

hypothesis: Missing .env file means VITE_MAPTILER_KEY is undefined, fallback to empty string, which is falsy so API key never added to geocoding URL, causing 403 from MapTiler API
test: Confirmed no .env file exists; only .env.example with placeholder
expecting: Creating .env with valid key resolves the error
next_action: User must create .env with their MapTiler API key

## Symptoms

expected: Typing in geocoding search shows autocomplete suggestions from MapTiler
actual: Red popup with "Something went wrong" appears when typing
errors: "Something went wrong" (default errorMessage from @maptiler/geocoding-control)
reproduction: Start typing any text in the search overlay
started: Likely from initial setup (no .env file ever created)

## Eliminated

- hypothesis: Wrong import paths for geocoding-control react/maplibregl modules
  evidence: Package exports map confirms ./react and ./maplibregl are valid subpath exports in v2.1.7. Imports match exactly.
  timestamp: 2026-02-23

- hypothesis: createMapLibreGlMapController called with wrong arguments
  evidence: Type definition shows (map, maplibregl?) signature. Code passes (map, maplibregl) which matches. Second arg is optional anyway.
  timestamp: 2026-02-23

- hypothesis: Breaking API changes in @maptiler/geocoding-control v2.1.7
  evidence: Installed version matches package.json spec. Exports, types, and API surface all consistent with how code uses them.
  timestamp: 2026-02-23

## Evidence

- timestamp: 2026-02-23
  checked: .env files on disk
  found: Only .env.example exists (contains "VITE_MAPTILER_KEY=your_key_here"). No .env or .env.local file.
  implication: VITE_MAPTILER_KEY is undefined at runtime

- timestamp: 2026-02-23
  checked: SearchOverlay.tsx line 9
  found: "const API_KEY = import.meta.env.VITE_MAPTILER_KEY ?? ''" - fallback is empty string
  implication: API_KEY = '' (empty string)

- timestamp: 2026-02-23
  checked: Geocoding control source (react.js bundle)
  found: URL construction uses "f && ee.set('key', f)" where f = apiKey prop. Empty string is falsy in JS.
  implication: API key is NEVER appended to the geocoding request URL

- timestamp: 2026-02-23
  checked: Geocoding control fetch and error handling
  found: fetch() call checks !Y.ok and throws. Catch in caller does "t(19, re = x)" setting error state. Error state triggers display of errorMessage prop which defaults to "Something went wrong..."
  implication: 403 from MapTiler API (no key) triggers the error popup

- timestamp: 2026-02-23
  checked: MapView.tsx line 6
  found: Same pattern "const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY ?? ''" - map tiles also affected
  implication: Map tile loading may also be broken (but may silently fail or show different error)

## Resolution

root_cause: No .env file exists in the project. Only .env.example with placeholder value "your_key_here". This means import.meta.env.VITE_MAPTILER_KEY is undefined, which falls back to empty string via the ?? '' operator. The geocoding control's internal code uses `apiKey && urlParams.set('key', apiKey)` -- since empty string is falsy in JavaScript, the API key is never added to the geocoding request URL. MapTiler's API returns an error (likely 403), which the control catches and displays as "Something went wrong".
fix: Create .env file with a valid MapTiler API key
verification:
files_changed: []
