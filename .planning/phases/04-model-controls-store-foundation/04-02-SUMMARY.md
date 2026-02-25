---
phase: 04-model-controls-store-foundation
plan: 02
subsystem: ui-controls
tags: [react, components, sidebar, collapsible, unit-toggle, layer-visibility]
dependency_graph:
  requires: [layerToggles, units, targetHeightMM, setLayerToggle, setUnits, setTargetWidth, setTargetHeightMM]
  provides: [CollapsibleSection, ModelSizeSection, TerrainSection, BuildingsSection, LayerPlaceholderSection, PreviewSidebar]
  affects:
    - src/components/Preview/CollapsibleSection.tsx
    - src/components/Preview/ModelSizeSection.tsx
    - src/components/Preview/TerrainSection.tsx
    - src/components/Preview/BuildingsSection.tsx
    - src/components/Preview/LayerPlaceholderSection.tsx
    - src/components/Preview/PreviewSidebar.tsx
    - src/components/Preview/ExportPanel.tsx
    - src/components/Layout/SplitLayout.tsx
tech_stack:
  added: []
  patterns:
    - CollapsibleSection with separate click targets for expand/collapse vs toggle pill
    - Local string state for keystroke buffering, committed to store on blur
    - Read-only computed depth derived from store (no stale local cache)
    - Auto-height with 0 sentinel value (0 = auto-calculate from elevation range)
    - Units stored always in mm, display conversion at render time
key_files:
  created:
    - src/components/Preview/CollapsibleSection.tsx
    - src/components/Preview/ModelSizeSection.tsx
    - src/components/Preview/TerrainSection.tsx
    - src/components/Preview/BuildingsSection.tsx
    - src/components/Preview/LayerPlaceholderSection.tsx
  modified:
    - src/components/Preview/PreviewSidebar.tsx
    - src/components/Preview/ExportPanel.tsx
    - src/components/Layout/SplitLayout.tsx
decisions:
  - CollapsibleSection uses local useState for expand/collapse (ephemeral UI state, not Zustand)
  - Toggle pill and section header are separate click targets to prevent accidental layer-off when collapsing
  - Depth (Y) is a read-only display derived from store, preventing stale local state divergence
  - Height Z uses empty string as 'auto' sentinel — 0 stored in Zustand triggers auto-calculation
  - PreviewSidebar is now self-contained; SplitLayout renders it with no children
  - ExportPanel dimension inputs removed — ModelSizeSection owns all dimension UX
metrics:
  duration: 2 min
  completed: 2026-02-25
  tasks_completed: 2
  files_modified: 8
---

# Phase 4 Plan 02: Rebuild PreviewSidebar with Collapsible Sections and Model Controls Summary

**One-liner:** Six new/rebuilt components deliver the full CTRL-01 through CTRL-04 control panel — CollapsibleSection primitives, ModelSizeSection with mm/in toggle, TerrainSection, BuildingsSection with live toggle, and LayerPlaceholderSection for coming-soon layers, assembled into a self-contained PreviewSidebar.

## What Was Built

### Task 1: CollapsibleSection, ModelSizeSection, TerrainSection (commit: 8f23786)

**CollapsibleSection.tsx:**
- Reusable expand/collapse wrapper with optional toggle pill in the header
- Separate click areas: chevron/label expands section; toggle pill changes layer visibility
- Toggle pill: `role="switch"`, `aria-checked`, blue (#2563eb) active / gray (#374151) inactive, `disabled` prop prevents clicks at 50% opacity
- Shows `summary` prop as muted text below label when collapsed
- Local `useState` for ephemeral expand state — NOT in Zustand

**ModelSizeSection.tsx:**
- Unit segmented control: mm/in pill at top, calls `setUnits`. Switching converts display values without mutating stored mm values.
- Width (X) input: free-form, blur-commits to `setTargetWidth()` which auto-calculates depth
- Depth (Y): read-only span derived from `targetDepthMM` (prevents stale cached value divergence)
- Height (Z): input with `placeholder` showing auto-calculated value when `targetHeightMM === 0`; clearing to empty reverts to auto (stores 0)
- Auto-height computed inline: `(elevRange * horizontalScale * exaggeration) + basePlateThicknessMM` matching terrain.ts TERR-03 floor logic
- Summary line below inputs: "150.0 × 112.5 × 23.4 mm" updates reactively

**TerrainSection.tsx:**
- Wraps TerrainControls content in `<CollapsibleSection label="Terrain">` with no toggle (terrain always on)
- Summary: `"${exaggeration.toFixed(1)}x exag, ${basePlateThicknessMM}mm base"`
- Identical exaggeration slider and base plate input to former TerrainControls.tsx

### Task 2: BuildingsSection, LayerPlaceholderSection, PreviewSidebar rebuild, SplitLayout update (commit: ec00452)

**BuildingsSection.tsx:**
- `toggle={{ checked: buildingsVisible, onChange: (v) => setLayerToggle('buildings', v) }}`
- Summary computed from `buildingGenerationStatus` and `buildingFeatures.length`
- Body only renders when `buildingsVisible === true` (CTRL-04: controls hidden when layer toggled off)
- Defaults collapsed (`defaultOpen={false}`)

**LayerPlaceholderSection.tsx:**
- Generic disabled placeholder for Roads, Water, Vegetation
- `toggle={{ checked: true, onChange: () => {}, disabled: true }}` — toggle visible but unclickable
- Body shows italic "Coming in a future update"

**PreviewSidebar.tsx (rebuilt):**
- Self-contained; removed `children` prop entirely
- Renders: "Model Controls" header → ModelSizeSection → "Layers" subheading → TerrainSection → BuildingsSection → Roads → Water → Vegetation → ExportPanel
- Outer shell and toggle button preserved from original

**ExportPanel.tsx (updated):**
- Removed "Model Dimensions" section with Width/Depth inputs
- Removed `widthInput`, `depthInput` local state and `setTargetDimensions` selector
- Removed unused `labelStyle` and `inputStyle` objects
- Export logic unchanged — still reads `targetWidthMM`/`targetDepthMM` from store at export time

**SplitLayout.tsx (updated):**
- Removed imports for `TerrainControls` and `ExportPanel`
- Changed `<PreviewSidebar><TerrainControls /><ExportPanel /></PreviewSidebar>` to `<PreviewSidebar />`

## Verification Results

- `npx tsc --noEmit`: PASS (no errors)
- `npx vitest run`: 115/115 tests pass across 11 test files
- All plan success criteria met

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| CollapsibleSection uses local `useState` | Collapse state is ephemeral UI — storing in Zustand would unnecessarily persist UI state across sessions |
| Separate click targets for header vs toggle | Prevents accidental layer toggle when user intends to expand/collapse section (Research Open Question #3) |
| Depth (Y) is read-only span | No stale local state cache; depth auto-follows width via store (Research Pitfall 2) |
| Height Z uses empty string as auto | Natural UX: clear field = revert to auto; 0 sentinel in store is clean, no magic null |
| PreviewSidebar is self-contained | Removes inversion-of-control complexity; sidebar owns its content layout |
| Dimension inputs migrated from ExportPanel | ModelSizeSection is the canonical location for all dimension UX (user decision) |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| src/components/Preview/CollapsibleSection.tsx | FOUND |
| src/components/Preview/ModelSizeSection.tsx | FOUND |
| src/components/Preview/TerrainSection.tsx | FOUND |
| src/components/Preview/BuildingsSection.tsx | FOUND |
| src/components/Preview/LayerPlaceholderSection.tsx | FOUND |
| src/components/Preview/PreviewSidebar.tsx | FOUND |
| src/components/Preview/ExportPanel.tsx | FOUND |
| src/components/Layout/SplitLayout.tsx | FOUND |
| commit 8f23786 (CollapsibleSection, ModelSizeSection, TerrainSection) | FOUND |
| commit ec00452 (BuildingsSection, LayerPlaceholderSection, PreviewSidebar, SplitLayout) | FOUND |
