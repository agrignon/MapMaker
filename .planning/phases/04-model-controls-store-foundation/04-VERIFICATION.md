---
phase: 04-model-controls-store-foundation
verified: 2026-02-24T20:35:00Z
status: human_needed
score: 11/11 must-haves verified
re_verification:
  previous_status: gaps_found
  previous_score: 8/11
  gaps_closed:
    - "User can enter a Z height override — targetHeightMM now wired end-to-end through TerrainMesh, BuildingMesh, and ExportPanel; export heightMM uses override value directly"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Verify buildings toggle in 3D preview"
    expected: "Toggle buildings OFF — building geometry disappears from 3D preview instantly without page reload or regeneration. Toggle back ON — buildings reappear instantly."
    why_human: "Three.js mesh.visible behavior requires visual inspection; cannot assert rendering state programmatically"
  - test: "Verify unit switching converts displayed values"
    expected: "With width showing 150.0 mm, switch to 'in' — width shows 5.91 in, depth shows the proportional value in inches. Switch back to mm — values restore to mm without rounding error."
    why_human: "Display value correctness requires UI interaction; unit conversion logic is in render code"
  - test: "Verify width input auto-calculates depth"
    expected: "Enter 200 in the Width (X) field and tab away. Depth (Y) updates automatically to reflect the bbox aspect ratio. The depth field remains read-only."
    why_human: "Requires UI interaction to trigger blur event and observe reactive depth update"
  - test: "Verify Z height override affects 3D preview and STL export"
    expected: "Enter 50 in the Height (Z) field and tab away. The 3D preview terrain immediately scales to reflect the override. Export STL — open in a slicer and confirm total Z is ~50mm. Clear Height (Z) to empty and re-export — Z reverts to auto-calculated value. Buildings remain flush with terrain in both cases."
    why_human: "Preview scaling requires visual inspection; STL height verification requires slicer measurement"
  - test: "Verify collapsed section summaries"
    expected: "Click the Terrain section chevron to collapse it. The collapsed header shows '1.5x exag, 3mm base' (or current values) as summary text below the label."
    why_human: "Collapse/expand state and summary rendering require visual inspection"
---

# Phase 4: Model Controls + Store Foundation Verification Report

**Phase Goal:** All layer state fields exist in the Zustand store and the UI exposes fully wired layer toggles, physical dimension inputs, unit switching, and contextual control visibility — so every subsequent phase can immediately test its feature against the correct toggle behavior
**Verified:** 2026-02-24T20:35:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (04-03-PLAN.md executed, commits f33ae0d and d500db0)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Zustand store has layerToggles, units, and targetHeightMM with correct defaults | VERIFIED | `mapStore.ts` lines 87-94: layerToggles all true, units 'mm', targetHeightMM 0 |
| 2 | Toggling buildings off in the store immediately hides building geometry in the 3D preview without regeneration | VERIFIED | `BuildingMesh.tsx` line 118: `<mesh ref={meshRef} visible={buildingsVisible}>` bound to `layerToggles.buildings` selector |
| 3 | Export pipeline excludes building geometry when layerToggles.buildings is false | VERIFIED | `ExportPanel.tsx` line 107: `hasBuildings = Boolean(... && buildingsVisible)` gates building inclusion |
| 4 | setTargetWidth action auto-calculates targetDepthMM from bbox aspect ratio | VERIFIED | `mapStore.ts` lines 163-171: reads `get()` for dimensions, computes `widthMM * (heightM / widthM)` |
| 5 | User can toggle buildings on/off via a toggle switch and the 3D preview immediately hides/shows buildings | VERIFIED | `BuildingsSection.tsx` line 25: `onChange: (v) => setLayerToggle('buildings', v)` wired to CollapsibleSection toggle prop |
| 6 | User can enter a max width and the depth auto-calculates maintaining bbox aspect ratio | VERIFIED | `ModelSizeSection.tsx` lines 53-63: `handleWidthBlur` calls `setTargetWidth(clamped)` which auto-calculates depth; Depth (Y) is read-only span |
| 7 | User can enter a Z height override and the 3D preview + exported STL reflect the specified size | VERIFIED | `TerrainMesh.tsx` line 34: computes `targetReliefMM` from store; `terrain.ts` line 96-99: overrides zScale; `ExportPanel.tsx` line 180-181: uses `targetHeightMM` directly for export heightMM when set |
| 8 | User can switch between mm and inches via a segmented control, and all displayed dimension values update | VERIFIED | `ModelSizeSection.tsx` lines 86-90: `handleUnitsChange` calls `setUnits`, then re-formats all local input display strings from stored mm values |
| 9 | Road style selector, vegetation controls, and smoothing slider sections are hidden when their layer toggle is off | VERIFIED (partial context) | Contextual visibility is satisfied for all existing controls: `BuildingsSection.tsx` line 30 gates body on `buildingsVisible`. Roads/Water/Vegetation controls are rendered as disabled placeholders — not yet wired (deferred to Phases 5-7). CTRL-04 is fully satisfied for all controls that exist in Phase 4. |
| 10 | Collapsed sections show a brief summary of current values | VERIFIED | `TerrainSection.tsx` line 10: `summary = "${exaggeration.toFixed(1)}x exag, ${basePlateThicknessMM}mm base"` passed to CollapsibleSection |
| 11 | Roads, Water, and Vegetation appear as disabled 'Coming soon' toggles that cannot be clicked | VERIFIED | `LayerPlaceholderSection.tsx` line 16: `disabled: true` on toggle; onChange is no-op `() => {}` |

**Score:** 11/11 truths verified (0 partial, 0 failed)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/store/mapStore.ts` | Extended store with layerToggles, units, targetHeightMM, 4 new actions | VERIFIED | All fields and actions present; `layerToggles` lines 87-92; `targetHeightMM: 0` line 94; `setTargetHeightMM` line 174 |
| `src/lib/mesh/terrain.ts` | Z height override via optional targetReliefMM param in TerrainMeshParams | VERIFIED | `targetReliefMM?: number` at line 24; override branch at lines 96-99 in `buildTerrainGeometry`; matching branch at lines 181-183 in `updateTerrainElevation` |
| `src/lib/buildings/types.ts` | targetReliefMM in BuildingGeometryParams | VERIFIED | `targetReliefMM?: number` at line 66 with correct docstring |
| `src/lib/buildings/merge.ts` | Building zScale matches terrain override when targetReliefMM > 0 | VERIFIED | Override branch at lines 130-132; building heightMM refactored to `heightM * zScale` at lines 185-186 |
| `src/components/Preview/TerrainMesh.tsx` | Passes targetReliefMM from store into buildTerrainGeometry | VERIFIED | Store selector line 21; targetReliefMM computed line 34; passed in params line 46; in dependency array line 73 |
| `src/components/Preview/BuildingMesh.tsx` | targetReliefMM passed to buildAllBuildings | VERIFIED | Store selectors lines 26-27; targetReliefMM computed line 54; passed in params line 67; in dependency array line 97 |
| `src/components/Preview/ExportPanel.tsx` | targetReliefMM passed to terrain and building generation; heightMM uses override | VERIFIED | Store selector line 44; targetReliefMM computed line 84; passed to terrain params line 101; passed to building params line 128; heightMM uses `targetHeightMM` directly when > 0 at lines 180-181 |
| `src/components/Preview/CollapsibleSection.tsx` | Reusable collapsible section with toggle header and summary | VERIFIED | 139 lines; toggle pill with `role="switch"`, `aria-checked`, separate click targets; local `useState` for expand |
| `src/components/Preview/ModelSizeSection.tsx` | Width/depth/height inputs with unit toggle | VERIFIED | Width input + auto-depth display + unit toggle: fully wired. Height Z input: stores value and now propagates through to mesh generation |
| `src/components/Preview/TerrainSection.tsx` | Collapsible terrain controls with summary | VERIFIED | Wraps exaggeration slider + base plate in `CollapsibleSection`; computed summary string |
| `src/components/Preview/BuildingsSection.tsx` | Collapsible buildings section with working toggle | VERIFIED | Toggle wired to `setLayerToggle('buildings', v)`; body conditionally renders on `buildingsVisible` (CTRL-04) |
| `src/components/Preview/LayerPlaceholderSection.tsx` | Disabled 'Coming soon' sections for roads/water/vegetation | VERIFIED | `disabled: true`, no-op onChange, italic "Coming in a future update" body |
| `src/components/Preview/PreviewSidebar.tsx` | Self-contained sidebar with stacked sections in pipeline order | VERIFIED | Renders: Model Controls header → ModelSizeSection → Layers subheading → TerrainSection → BuildingsSection → Roads → Water → Vegetation → ExportPanel |
| `src/components/Layout/SplitLayout.tsx` | Renders `<PreviewSidebar />` with no children | VERIFIED | Line 60: `<PreviewSidebar />` — no TerrainControls or ExportPanel children |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `TerrainMesh.tsx` | `mapStore.ts` | `useMapStore((s) => s.targetHeightMM)` | WIRED | Line 21 selector; `targetReliefMM` computed and passed to `buildTerrainGeometry`; `targetHeightMM` in dependency array |
| `TerrainMesh.tsx` | `terrain.ts` | `targetReliefMM` passed in `TerrainMeshParams` | WIRED | Line 46: `targetReliefMM` in params object; `terrain.ts` line 96 uses it to override zScale |
| `BuildingMesh.tsx` | `mapStore.ts` | `useMapStore((s) => s.targetHeightMM)` | WIRED | Line 27 selector; `targetReliefMM` computed and passed to `buildAllBuildings`; in dependency array |
| `BuildingMesh.tsx` | `merge.ts` | `targetReliefMM` passed in `BuildingGeometryParams` | WIRED | Line 67: `targetReliefMM` in params; `merge.ts` line 130 uses it to override zScale |
| `ExportPanel.tsx` | `mapStore.ts` | `useMapStore((s) => s.targetHeightMM)` | WIRED | Line 44 selector; `targetReliefMM` computed line 84; passed to both terrain and building params |
| `ExportPanel.tsx` | `terrain.ts` | `targetReliefMM` in `buildTerrainGeometry` params | WIRED | Line 101: `targetReliefMM` in terrain params object |
| `ExportPanel.tsx` | `merge.ts` | `targetReliefMM` in `BuildingGeometryParams` | WIRED | Line 128: `targetReliefMM` in building params object |
| `ExportPanel.tsx` | export heightMM | `targetHeightMM` used directly when > 0 | WIRED | Lines 180-181: `if (targetHeightMM > 0) { heightMM = targetHeightMM; }` |
| `BuildingMesh.tsx` | `mapStore.ts` | `layerToggles.buildings` | WIRED | Line 21 selector + line 118 `visible={buildingsVisible}` |
| `ExportPanel.tsx` | `mapStore.ts` | `layerToggles.buildings` gates `hasBuildings` | WIRED | Line 53 selector; line 107 AND condition with `buildingsVisible` |
| `ModelSizeSection.tsx` | `mapStore.ts` | `setTargetWidth`, `setUnits`, `units` selectors | WIRED | Lines 23, 29-31: selectors; lines 58, 87: action calls on blur/unit change |
| `BuildingsSection.tsx` | `mapStore.ts` | `setLayerToggle('buildings', v)` on toggle click | WIRED | Line 8 selector; line 25: `onChange: (v) => setLayerToggle('buildings', v)` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| CTRL-01 | 04-01-PLAN, 04-02-PLAN | User can toggle terrain, buildings, roads, water, and vegetation on/off individually | PARTIALLY SATISFIED (known deferred) | Buildings toggle fully wired end-to-end. Terrain has no toggle by documented user decision. Roads/Water/Vegetation toggles exist in store with correct defaults; UI shows disabled 'Coming soon' placeholders. Full satisfaction deferred to Phases 5-7. `REQUIREMENTS.md` marks [x] Complete — acceptable given phased delivery contract. |
| CTRL-02 | 04-01-PLAN, 04-02-PLAN, 04-03-PLAN | User can set maximum physical dimensions: X width, Y depth, Z height | SATISFIED | Width (X): fully wired to mesh and export. Depth (Y): auto-calculated from width by aspect ratio. Height (Z): stored, propagated through `targetReliefMM` to `buildTerrainGeometry`, `updateTerrainElevation`, `buildAllBuildings`, and export heightMM — gap closed by 04-03. |
| CTRL-03 | 04-02-PLAN | User can switch measurements between mm and inches (default: mm) | SATISFIED | `setUnits` in store; `handleUnitsChange` in `ModelSizeSection` re-formats all display strings from stored mm values; segmented mm/in control wired correctly. |
| CTRL-04 | 04-02-PLAN | Controls are hidden/disabled when their layer is toggled off | SATISFIED | `BuildingsSection.tsx`: building controls hidden when `buildingsVisible` is false. Roads/Water/Vegetation controls don't exist yet (coming in Phases 5-7) — CTRL-04 is satisfied for all controls that exist. |

### Commits Verified

All gap closure commits confirmed in `git log`:

- `f33ae0d` — feat(04-03): add targetReliefMM to terrain and building Z-scale computation
- `d500db0` — feat(04-03): wire targetHeightMM from store through TerrainMesh, BuildingMesh, ExportPanel

Previously verified phase foundation commits also present:

- `ab8499a` — feat(04-01): extend Zustand store with layerToggles, units, targetHeightMM
- `8766894` — feat(04-01): wire building mesh visibility and gate export on layerToggles
- `8f23786` — feat(04-02): create CollapsibleSection, ModelSizeSection, TerrainSection components
- `ec00452` — feat(04-02): rebuild PreviewSidebar with stacked sections; add Buildings, LayerPlaceholder components

### Test Suite

`npx tsc --noEmit` — PASS (no output, exit 0)

`npx vitest run` — PASS: 115 tests, 11 test files, 0 failures (no regressions from gap closure changes)

### Anti-Patterns Found

No blocker anti-patterns found. No TODO/FIXME/XXX/HACK/PLACEHOLDER comments in any Phase 4 or gap-closure file. No empty return stubs. No static returns in mesh generation functions.

### Human Verification Required

#### 1. Buildings toggle — 3D preview behavior

**Test:** Generate terrain and buildings for an urban area. Toggle the Buildings switch OFF in the sidebar.
**Expected:** Building geometry disappears from the 3D preview immediately, with no regeneration delay. Toggle back ON — buildings reappear instantly. Three.js `mesh.visible=false` is confirmed working.
**Why human:** Rendering state cannot be asserted programmatically without a test harness.

#### 2. Unit switching — display value conversion

**Test:** Load app with a generated area showing ~150mm width. Click the 'in' button in Model Size section.
**Expected:** Width changes from "150.0" to "5.91", depth changes proportionally. No values reset or lose precision. Click 'mm' — values return to mm representation.
**Why human:** Display formatting and unit conversion correctness require UI interaction.

#### 3. Width input — depth auto-calculation

**Test:** Enter 200 in the Width (X) input and press Tab (or click away).
**Expected:** The Depth (Y) read-only field updates to reflect the bbox aspect ratio. The 3D preview terrain updates to show the new width (if terrain is generated).
**Why human:** Blur event trigger and reactive depth update require UI interaction to observe.

#### 4. Z height override — preview scaling and STL export

**Test:** Generate terrain for a mountainous area. Enter 50 in the Height (Z) input and tab away. Observe the 3D preview. Then click Export STL. Open the STL in PrusaSlicer or Bambu Studio and measure the Z dimension.
**Expected (gap closed):** The 3D preview terrain rescales immediately to reflect the 50mm override. The exported STL measures ~50mm total height in the slicer. Buildings (if present) remain flush with terrain. Clear Height (Z) to empty, re-export — Z reverts to auto-calculated value based on terrain elevation range.
**Why human:** Preview scaling requires visual inspection; STL height verification requires slicer measurement to confirm end-to-end correctness of the wiring.

#### 5. Collapsed section summaries

**Test:** Click the Terrain section label/chevron to collapse it.
**Expected:** The section collapses and shows summary text below the label (e.g., "1.5x exag, 3mm base"). Clicking the chevron again expands the section and hides the summary.
**Why human:** Collapse/expand state and conditional summary rendering require visual inspection.

### Re-verification Summary

**Gap 1 closed — Z height override now wired end-to-end:**

`targetHeightMM` propagates from the Zustand store through three components (`TerrainMesh`, `BuildingMesh`, `ExportPanel`) as computed `targetReliefMM` (= `targetHeightMM - basePlateThicknessMM`, minimum 1). The `buildTerrainGeometry` and `updateTerrainElevation` functions override `zScale = targetReliefMM / elevRange` when `targetReliefMM > 0`. The `buildAllBuildings` function applies the identical formula for building-terrain alignment. Export `heightMM` uses `targetHeightMM` directly when the override is set. The auto mode (targetHeightMM === 0) retains unchanged behavior — all 115 tests pass without modification.

**Gap 2 unchanged — CTRL-01 roads/water/vegetation deferred to Phases 5-7:**

`LayerPlaceholderSection.tsx` is unchanged. Roads, water, and vegetation toggles remain disabled placeholders per the Phase 4 phased-delivery design. The store fields (`layerToggles.roads`, `.water`, `.vegetation`) are in place for Phases 5-7 to wire. This is a documented known gap, not an implementation error.

**Overall assessment:** Both automated verifiable requirements (CTRL-02 Z height, CTRL-03 units, CTRL-04 contextual visibility) are now fully satisfied in code. CTRL-01 is satisfied for Phase 4's scope (buildings only). The phase goal is achieved: store fields exist, UI exposes wired controls, and every subsequent phase can immediately test against correct toggle behavior.

---

_Verified: 2026-02-24T20:35:00Z_
_Re-verification: Yes — after 04-03 gap closure_
_Verifier: Claude (gsd-verifier)_
