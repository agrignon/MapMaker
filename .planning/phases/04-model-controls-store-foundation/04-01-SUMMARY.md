---
phase: 04-model-controls-store-foundation
plan: 01
subsystem: store
tags: [zustand, state-management, layer-toggles, units, visibility]
dependency_graph:
  requires: []
  provides: [layerToggles, units, targetHeightMM, setLayerToggle, setUnits, setTargetWidth, setTargetHeightMM, BuildingMesh-visibility, ExportPanel-layer-gating]
  affects: [src/store/mapStore.ts, src/components/Preview/BuildingMesh.tsx, src/components/Preview/ExportPanel.tsx]
tech_stack:
  added: []
  patterns: [Zustand functional set with spread for nested state, Three.js mesh.visible for instant geometry hide/show]
key_files:
  created: []
  modified:
    - src/store/mapStore.ts
    - src/components/Preview/BuildingMesh.tsx
    - src/components/Preview/ExportPanel.tsx
decisions:
  - LayerToggles interface exported from mapStore.ts for Plan 02 UI components to import
  - setTargetWidth uses get() to read dimensions for aspect-ratio-preserving depth calculation
  - Terrain has no toggle — always on, per user decision
  - setUnits is display-only — store always holds mm values, no value conversion on switch
  - Three.js mesh.visible=false hides geometry without destroying or regenerating it
metrics:
  duration: 2 min
  completed: 2026-02-25
  tasks_completed: 2
  files_modified: 3
---

# Phase 4 Plan 01: Store Foundation for Layer Toggles, Units, and Dimensions Summary

**One-liner:** Zustand store extended with LayerToggles (4 booleans), units ('mm'|'in'), and targetHeightMM fields wired to BuildingMesh visibility and ExportPanel building-inclusion gate.

## What Was Built

Extended `src/store/mapStore.ts` with all new Phase 4 state fields, then wired existing 3D mesh components to respect layer visibility:

### Task 1: Extend Zustand Store (commit: ab8499a)

Added to `mapStore.ts`:

- `LayerToggles` interface exported for Plan 02 UI reuse: `{ buildings: boolean; roads: boolean; water: boolean; vegetation: boolean }`
- `layerToggles` field in `MapState` — all 4 values default to `true`; terrain intentionally has no toggle (always on)
- `units` field — `'mm' | 'in'`, default `'mm'`; display-only, no value conversion on switch
- `targetHeightMM` field — `number`, default `0` (0 = auto-calculate from elevation range)
- `setLayerToggle(layer, enabled)` — functional set with spread preserves other toggle values
- `setUnits(units)` — simple set
- `setTargetWidth(widthMM)` — reads `get()` for current `dimensions`, auto-calculates `targetDepthMM = widthMM * (heightM / widthM)` to preserve aspect ratio; falls back to width-only if no dimensions set
- `setTargetHeightMM(value)` — simple set
- Updated `create<MapStore>()` signature from `(set)` to `(set, get)` so `setTargetWidth` can read current state
- Kept `setTargetDimensions(widthMM, depthMM)` intact — still used by ExportPanel until Plan 02 migrates dimension inputs

### Task 2: Wire Mesh Visibility and Gate Export (commit: 8766894)

**BuildingMesh.tsx:**
- Added `buildingsVisible = useMapStore((s) => s.layerToggles.buildings)` selector
- Added `visible={buildingsVisible}` prop to `<mesh>` element — Three.js `mesh.visible=false` hides geometry without destroying it; toggle-back is instant with no regeneration

**ExportPanel.tsx:**
- Added `buildingsVisible = useMapStore((s) => s.layerToggles.buildings)` selector
- Updated `hasBuildings` check to also require `buildingsVisible`: `Boolean(buildingFeatures && buildingFeatures.length > 0 && utmZone && buildingsVisible)`
- When buildings are toggled off: excluded from STL geometry and filename drops `-buildings` suffix

## Verification Results

- `npx tsc --noEmit`: PASS (no errors)
- `npx vitest run`: 115/115 tests pass across 11 test files
- All plan success criteria met

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| `LayerToggles` exported from `mapStore.ts` | Plan 02 UI components import type directly without circular deps |
| `setTargetWidth` uses `get()` for aspect-ratio calculation | Zustand 5 `(set, get)` pattern; depth auto-follows width changes |
| Terrain has no toggle | User decision: terrain is always rendered |
| `setUnits` is display-only | Store always holds mm; conversion happens at display layer |
| `mesh.visible=false` for hiding | No geometry disposal — instant hide/show without regeneration cost |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| src/store/mapStore.ts | FOUND |
| src/components/Preview/BuildingMesh.tsx | FOUND |
| src/components/Preview/ExportPanel.tsx | FOUND |
| .planning/phases/04-model-controls-store-foundation/04-01-SUMMARY.md | FOUND |
| commit ab8499a (store extension) | FOUND |
| commit 8766894 (mesh visibility + export gate) | FOUND |
