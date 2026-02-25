---
status: resolved
trigger: "Terra Draw rectangle drawing doesn't work - lone marker drags instead of drawing rectangle"
created: 2026-02-23T00:00:00Z
updated: 2026-02-23T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - useMap()['main-map'] returns undefined because no MapProvider wraps the app
test: Traced code flow through @vis.gl/react-maplibre internals
expecting: N/A - root cause confirmed
next_action: Return diagnosis

## Symptoms

expected: Click-and-drag draws a rectangle on the map
actual: A lone marker appears and clicking/dragging moves it around. No box drawn. Screen is black.
errors: Unknown - need to check console
reproduction: Load app, try to draw rectangle
started: Unknown - may have never worked correctly

## Eliminated

- hypothesis: terra-draw / terra-draw-maplibre-gl-adapter version incompatibility
  evidence: terra-draw@1.25.0 and adapter@1.3.0 are compatible (adapter peerDep is ^1.0.0)
  timestamp: 2026-02-23

- hypothesis: TerraDrawMapLibreGLAdapter constructor API mismatch
  evidence: Adapter constructor signature matches usage: { map: MapType } - confirmed from d.ts
  timestamp: 2026-02-23

- hypothesis: TerraDraw constructor or mode configuration error
  evidence: API signatures match usage. TerraDrawRectangleMode styles, TerraDrawSelectMode flags are valid.
  timestamp: 2026-02-23

- hypothesis: DOM event listener conflict between react-maplibre and terra-draw
  evidence: Terra-draw attaches raw pointerdown/pointermove/pointerup to canvas element directly. react-maplibre intercepts maplibre's event system, not raw DOM events. No conflict.
  timestamp: 2026-02-23

## Evidence

- timestamp: 2026-02-23
  checked: @vis.gl/react-maplibre Map component source (node_modules/.../map.tsx)
  found: Map component uses MountedMapsContext from useContext(MountedMapsContext) to register by id. Without MapProvider, mountedMapsContext is null.
  implication: maps['main-map'] only works if MapProvider is in the tree

- timestamp: 2026-02-23
  checked: useMap() hook source (node_modules/.../use-map.tsx)
  found: useMap returns {...maps, current: currentMap?.map}. When MountedMapsContext is null (no MapProvider), maps is undefined. Spreading undefined yields {}. Only 'current' key is populated from MapContext.
  implication: useMap()['main-map'] is undefined; only useMap().current works

- timestamp: 2026-02-23
  checked: MapView.tsx line 17
  found: const mapInstance = maps['main-map']?.getMap() ?? null — this evaluates to null
  implication: useTerradraw(null) is called, effect bails out immediately on if (!map) return

- timestamp: 2026-02-23
  checked: App.tsx and main.tsx
  found: No <MapProvider> wrapping the component tree
  implication: MountedMapsContext is never provided, confirming maps['main-map'] is undefined

- timestamp: 2026-02-23
  checked: Simulated useMap() return value without MapProvider
  found: Returns { current: mapRef } only. result['main-map'] is undefined.
  implication: Confirms the exact failure path

## Resolution

root_cause: useTerradraw never receives a map instance because useMap()['main-map'] returns undefined. The @vis.gl/react-maplibre <Map> component registers maps by id into MountedMapsContext, but this context requires a <MapProvider> ancestor. No MapProvider exists in the component tree (App.tsx, main.tsx). Without it, useMap() only populates the 'current' key (from MapContext), not id-based lookups.
fix:
verification:
files_changed: []
