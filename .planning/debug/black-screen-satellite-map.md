---
status: investigating
trigger: "launched the app, black screen where the map should be"
created: 2026-02-23T00:00:00Z
updated: 2026-02-23T00:00:00Z
---

## Current Focus

hypothesis: Missing .env file means VITE_MAPTILER_KEY is undefined, causing MapTiler style URL to have an empty key, which returns an auth error and no tiles render (black screen)
test: Check that .env file does not exist and trace how the key flows into the style URL
expecting: MAPTILER_KEY resolves to empty string, MAP_STYLE URL has key= with no value
next_action: Confirm this is the root cause and check for any secondary issues

## Symptoms

expected: Satellite map renders in the main viewport
actual: Black screen where the map should be
errors: Not reported by user (likely silent - MapTiler returns 403 for missing key)
reproduction: Launch the app with `npm run dev`
started: Unknown - possibly never worked (no .env file exists)

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-02-23T00:01:00Z
  checked: .env file existence
  found: NO .env file exists. Only .env.example with placeholder "your_key_here"
  implication: VITE_MAPTILER_KEY is undefined at runtime, nullish coalesce falls to empty string

- timestamp: 2026-02-23T00:02:00Z
  checked: src/components/Map/MapView.tsx line 6-8
  found: |
    const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY ?? '';
    const MAP_STYLE = `https://api.maptiler.com/maps/satellite-v2/style.json?key=${MAPTILER_KEY}`;
    Result: style URL becomes "...?key=" with empty key -> MapTiler rejects request
  implication: This is the primary cause. No API key = no tiles = black screen.

- timestamp: 2026-02-23T00:03:00Z
  checked: src/App.tsx layout
  found: Map container uses className="flex-1 relative" inside h-screen flex parent. MapView uses style={{ width: '100%', height: '100%' }}. Layout looks correct.
  implication: Layout is NOT the issue. Container dimensions are properly set.

- timestamp: 2026-02-23T00:04:00Z
  checked: maplibre-gl CSS import
  found: Imported in BOTH src/main.tsx (line 3) and src/components/Map/MapView.tsx (line 2). Redundant but not harmful.
  implication: CSS is NOT the issue. MapLibre GL stylesheet is loaded.

- timestamp: 2026-02-23T00:05:00Z
  checked: vite.config.ts
  found: Standard config with react() and tailwindcss() plugins. No issues.
  implication: Vite config is NOT the issue.

- timestamp: 2026-02-23T00:06:00Z
  checked: package.json dependencies
  found: maplibre-gl ^5.19.0, @vis.gl/react-maplibre ^8.1.0. Versions are compatible.
  implication: Dependencies are NOT the issue.

## Resolution

root_cause: The .env file is missing entirely. Only .env.example exists with a placeholder value "your_key_here". In MapView.tsx (line 6), `import.meta.env.VITE_MAPTILER_KEY` resolves to `undefined`, which the nullish coalesce on line 6 converts to an empty string. The MAP_STYLE URL (line 8) becomes "https://api.maptiler.com/maps/satellite-v2/style.json?key=" -- an unauthenticated request that MapTiler rejects. MapLibre GL receives no valid style/tiles and renders a black canvas.
fix: Create .env file from .env.example with a real MapTiler API key
verification: pending
files_changed: []
