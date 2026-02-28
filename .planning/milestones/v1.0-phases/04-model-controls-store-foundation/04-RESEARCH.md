# Phase 4: Model Controls + Store Foundation - Research

**Researched:** 2026-02-24
**Domain:** Zustand 5 state management, React UI controls, Three.js mesh visibility, unit conversion
**Confidence:** HIGH

## Summary

Phase 4 is primarily a Zustand store extension + UI component build. The core challenge is threefold: (1) extend the existing `mapStore.ts` with new state fields for layer toggles, units, and future-layer placeholders; (2) build a reorganized `PreviewSidebar` with collapsible sections matching the stacked-section design from CONTEXT.md; (3) wire layer toggles so disabling a layer's Three.js `<mesh visible={false}>` reflects immediately without re-generating geometry.

The project already uses Zustand 5.0.3 (`create<MapStore>()` pattern with typed state/actions interface), so the extension pattern is identical to what exists in `mapStore.ts`. No new libraries are required for this phase — unit conversion (mm ↔ inches) is trivial arithmetic (1 inch = 25.4 mm) and does not warrant a library. The collapsible section UI can be built purely in React with `useState` controlling expand/collapse, matching the existing dark glass aesthetic already used in `PreviewSidebar.tsx`.

The critical architectural decision from STATE.md: "Zustand store extended first — all new state fields (layerToggles, units, etc.) before any new mesh component reads them." This phase delivers that store foundation so Phases 5-7 can add roads/water/vegetation and immediately have correct toggle behavior.

**Primary recommendation:** Extend mapStore.ts with all new fields, rebuild PreviewSidebar as the top-level container with collapsible sections, then add `visible` prop on TerrainMesh/BuildingMesh, and wire the export pipeline to read layer toggles.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Control panel layout**
- Stacked collapsible sections, each with a toggle header
- A top-level "Model Size" section above all layer sections for dimensions and unit toggle
- Layer sections in pipeline order: Terrain → Buildings → Roads → Water → Vegetation
- Collapsed sections show a brief summary of current values (e.g., "Terrain — 1.5x exag, 3mm base")

**Dimension & unit inputs**
- Width (X) input with auto-calculated depth (Y) that maintains bbox aspect ratio
- Separate Z height input for max terrain height
- Exaggeration slider kept alongside Z height — both control vertical scale
- Segmented control (mm | in) for unit toggle, inline with dimension inputs
- Switching units converts existing values (150mm → 5.91in), not reset

**Layer toggle behavior**
- Toggling a layer off instantly hides its geometry in the Three.js scene (no regeneration)
- Export matches the preview — toggled-off layers are excluded from STL
- Future layers (roads, water, vegetation) shown as visible but disabled toggles ("Coming soon" or greyed out)
- Terrain is always on — no toggle for terrain (it's the base mesh everything sits on)
- Built layer toggles (buildings) default to ON

**Default values**
- Free-form number inputs only, no size presets
- Default max width: 150mm (current value, fits most consumer printers)
- Default Z height: auto-calculated from actual terrain elevation range, scaled proportionally to X/Y dimensions
- All existing layer toggles default to ON

### Claude's Discretion
- Exact collapse/expand animation style
- Toggle switch visual design (matching the existing dark glass sidebar aesthetic)
- Input field validation ranges and step increments
- How "Coming soon" disabled toggles are visually differentiated
- Exact spacing, typography, and section divider styling

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CTRL-01 | User can toggle terrain, buildings, roads, water, and vegetation on/off individually, and the 3D preview immediately reflects each toggle | Zustand layerToggles state field + Three.js `visible` prop on each mesh component + R3F prop binding pattern |
| CTRL-02 | User can set maximum physical dimensions: X width, Y depth, Z height | Extend existing `targetWidthMM`/`targetDepthMM` pattern; add `targetHeightMM`; auto-calculate depth from bbox aspect ratio; wire to existing TerrainMesh/BuildingMesh params |
| CTRL-03 | User can switch measurements between mm and inches (default: mm) | New `units: 'mm' \| 'in'` field in store; display layer converts on read (value_mm * (1/25.4)); no library needed; segmented control UI |
| CTRL-04 | Controls are hidden/disabled when their layer is toggled off (road style hidden when roads off, vegetation controls when vegetation off, smoothing slider when terrain off) | Conditional rendering based on `layerToggles.X` from store; contextual visibility per section |
</phase_requirements>

---

## Standard Stack

### Core (already installed — no new installs)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zustand | ^5.0.3 | Global state for all layer toggles, units, dimensions | Already in use throughout project |
| react | ^18.3 | Component state for local UI (collapse/expand per section) | Project foundation |
| @react-three/fiber | ^9.5.0 | `visible` prop on `<mesh>` for instant toggle | Already in use for TerrainMesh/BuildingMesh |
| three | ^0.183.1 | Three.js mesh visibility | Already in use |

### No New Libraries Required

Unit conversion is trivial: `inches = mm / 25.4`, `mm = inches * 25.4`. A dedicated library (`convert-units`, `mathjs`) adds dependency weight for two-line arithmetic. Collapsible UI is handled with local `useState`. No animation library needed — CSS `transition: max-height` or conditional rendering is sufficient for the dark glass aesthetic.

**Installation:**
```bash
# No new packages needed
```

---

## Architecture Patterns

### Existing Store Structure (mapStore.ts)
The project uses a single typed Zustand 5 store with `State` + `Actions` interfaces merged into a `Store` type:
```typescript
// Source: /src/store/mapStore.ts (existing pattern)
interface MapState { ... }
interface MapActions { ... }
type MapStore = MapState & MapActions;
export const useMapStore = create<MapStore>((set) => ({ ... }));
```

All components use individual selector calls (one field per `useMapStore` call) which is the project-established pattern. This is already correct for Zustand 5 — primitive-returning selectors do not need `useShallow`.

### Pattern 1: Store Extension for New Fields

Add to `MapState` interface, add default values to the `create()` initializer:

```typescript
// NEW fields to add to mapStore.ts MapState
interface LayerToggles {
  buildings: boolean;
  roads: boolean;      // placeholder — Phase 5
  water: boolean;      // placeholder — Phase 6
  vegetation: boolean; // placeholder — Phase 7
}
// Note: terrain has NO toggle (always on, per CONTEXT.md)

// In MapState:
layerToggles: LayerToggles;
units: 'mm' | 'in';
targetHeightMM: number;  // Z height, new — currently only X/Y exist

// In defaults:
layerToggles: { buildings: true, roads: true, water: true, vegetation: true },
units: 'mm',
targetHeightMM: 0, // 0 = auto-calculate from elevation range
```

### Pattern 2: Layer Toggle → Instant Three.js Visibility

In R3F, `<mesh visible={bool}>` maps directly to `THREE.Mesh.visible`. No geometry rebuild is required. This is the correct approach per the CONTEXT.md locked decision.

```tsx
// Source: R3F pattern — verified via WebSearch + GitHub discussion #2417
// In BuildingMesh.tsx:
const buildingsVisible = useMapStore((s) => s.layerToggles.buildings);
// ...
return (
  <mesh ref={meshRef} visible={buildingsVisible}>
    <meshStandardMaterial color="#c0c0c0" side={THREE.DoubleSide} />
  </mesh>
);
```

When `visible={false}`, the mesh is not rendered to the screen but the geometry remains in memory — toggle back on is instant.

### Pattern 3: Collapsible Section Component

Each layer section is a controlled collapse: header has toggle + section label + collapsed summary; body contains the controls. Local `useState` per section. No external library.

```tsx
// Collapsible section pattern (pure React)
function CollapsibleSection({
  label,
  summary,
  isExpanded,
  onToggle,
  children,
}: {
  label: string;
  summary: string;       // shown when collapsed
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      <button onClick={onToggle} style={{ /* header row */ }}>
        <span>{label}</span>
        {!isExpanded && <span style={{ color: '#9ca3af', fontSize: '11px' }}>{summary}</span>}
        <span>{isExpanded ? '▲' : '▼'}</span>
      </button>
      {isExpanded && <div style={{ padding: '12px 0' }}>{children}</div>}
    </div>
  );
}
```

### Pattern 4: Unit Conversion — Display Layer Only

The store always holds values in mm (canonical unit). Display components read from store and convert for display. On input, convert back to mm before writing to store.

```typescript
// Conversion constants
const MM_PER_INCH = 25.4;

// Reading for display
function toDisplayUnit(valueMM: number, units: 'mm' | 'in'): number {
  return units === 'in' ? valueMM / MM_PER_INCH : valueMM;
}

// Writing from input
function toStoreMM(displayValue: number, units: 'mm' | 'in'): number {
  return units === 'in' ? displayValue * MM_PER_INCH : displayValue;
}

// On unit switch: NO conversion of stored values needed.
// Just change `units`. Display components re-render and convert.
// Example: stored 150mm → units='in' → display shows 5.91
```

This is superior to converting stored values on toggle — it eliminates floating-point round-trip errors (150mm → 5.9055in → 149.99...mm).

### Pattern 5: Auto-Calculate targetDepthMM from Aspect Ratio

Width is the user-controlled input. Depth auto-updates to maintain the geographic bbox aspect ratio.

```typescript
// When user changes targetWidthMM:
setTargetDimensions: (widthMM: number) => {
  const state = get();
  if (state.dimensions) {
    const aspectRatio = state.dimensions.heightM / state.dimensions.widthM;
    const depthMM = widthMM * aspectRatio;
    set({ targetWidthMM: widthMM, targetDepthMM: depthMM });
  } else {
    set({ targetWidthMM: widthMM });
  }
}
```

Note: The existing `setTargetDimensions(widthMM, depthMM)` action takes both values explicitly. For Phase 4, we need a new action `setTargetWidth(widthMM)` that auto-calculates depth, OR keep separate depth input (per CONTEXT.md: "Width (X) input with auto-calculated depth (Y)"). The new action should access the store's `dimensions` field to compute the ratio.

### Pattern 6: Export Pipeline — Layer Toggle Gate

`ExportPanel.tsx` currently includes buildings in export via `hasBuildings = Boolean(buildingFeatures && ...)`. Adding toggle respect requires checking `layerToggles.buildings` as well:

```typescript
// In ExportPanel.tsx handleExport():
const buildingsVisible = layerToggles.buildings;
const hasBuildings = Boolean(buildingFeatures && buildingFeatures.length > 0 && utmZone && buildingsVisible);
```

Future phases (roads, water, vegetation) follow the same pattern: check `layerToggles.X` before including geometry in the export.

### Pattern 7: Model Size — Z Height Calculation

The CONTEXT.md decision: "Default Z height: auto-calculated from actual terrain elevation range, scaled proportionally to X/Y dimensions."

When `targetHeightMM === 0` (auto mode), derive Z from the elevation range and zScale:
```typescript
// In TerrainControls or a derived selector:
// zScale = targetWidthMM / geographicWidthM
// autoHeightMM = (elevRange * exaggeration * zScale) + basePlateThicknessMM
```
This matches the existing `buildTerrainGeometry` behavior. The UI should show the computed auto value as read-only, with an optional override input.

### Recommended Project Structure Changes

```
src/
├── store/
│   └── mapStore.ts          # ADD: layerToggles, units, targetHeightMM, setTargetWidth
├── components/Preview/
│   ├── PreviewSidebar.tsx    # REBUILD: stacked collapsible sections container
│   ├── ModelSizeSection.tsx  # NEW: Width/depth/height inputs + unit toggle
│   ├── TerrainSection.tsx    # NEW (rename TerrainControls): collapsible terrain controls
│   ├── BuildingsSection.tsx  # NEW: buildings toggle + collapsible controls placeholder
│   ├── RoadsSection.tsx      # NEW: disabled "Coming soon" toggle placeholder
│   ├── WaterSection.tsx      # NEW: disabled "Coming soon" toggle placeholder
│   ├── VegetationSection.tsx # NEW: disabled "Coming soon" toggle placeholder
│   ├── TerrainMesh.tsx       # MODIFY: add visible prop binding
│   ├── BuildingMesh.tsx      # MODIFY: add visible prop binding
│   └── ExportPanel.tsx       # MODIFY: gate buildings on layerToggles.buildings
```

### Anti-Patterns to Avoid

- **Storing display values in mm AND inches as separate fields:** Store only mm; convert on display. Avoids sync bugs and floating-point drift.
- **Regenerating geometry on layer toggle:** Use `<mesh visible={bool}>` only. Geometry stays in memory; no fetch, no rebuild.
- **Calling `useMapStore((s) => ({ a: s.a, b: s.b }))` without useShallow:** In Zustand 5, this creates a new object every render, causing infinite re-render loops. The existing codebase correctly uses one call per field. Maintain this pattern.
- **Putting collapse/expand state in the Zustand store:** Section collapse state is ephemeral UI state with no cross-component dependencies. Use local `useState` in each section component.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Unit conversion | Custom unit library / lookup table | Inline arithmetic (`/ 25.4`) | Only mm↔in needed; any library adds unused surface area |
| Accessible toggle switch | Custom toggle from scratch | Simple `<button role="switch" aria-checked>` | ARIA semantics are 3 lines; a library brings full component overhead |
| Collapsible animation | CSS `max-height` transition with dynamic height | Conditional render (no animation) or fixed max-height | Dynamic max-height animation has well-known height-auto gotcha; for dark glass panels, instant show/hide or CSS opacity fade is cleaner |

**Key insight:** The whole phase is fundamentally store fields + conditional rendering — keep it lean. The complexity is in the wiring, not the individual components.

---

## Common Pitfalls

### Pitfall 1: Object Selector in Zustand 5 (infinite re-render)
**What goes wrong:** `const { buildings, roads } = useMapStore(s => ({ buildings: s.layerToggles.buildings, roads: s.layerToggles.roads }))` — creates new object on every render, infinite loop in Zustand 5.
**Why it happens:** Zustand 5 removed the `shallow` default equality override; `create` no longer accepts custom equality.
**How to avoid:** Use individual field selectors: `const buildings = useMapStore(s => s.layerToggles.buildings)`. If multiple fields from a nested object are needed in one component, use `useShallow` from `zustand/react/shallow`.
**Warning signs:** "Maximum update depth exceeded" React error immediately on render.

### Pitfall 2: Depth Input Becoming Stale After Unit Switch
**What goes wrong:** User sets width=6in, switches to mm — depth shows a stale mm value that doesn't match the auto-calculated proportion.
**Why it happens:** Depth is auto-calculated from width and bbox aspect ratio. If the depth input caches a local state string (like `ExportPanel.tsx` does with `widthInput`/`depthInput`), it won't update on unit change.
**How to avoid:** Display inputs for auto-calculated depth as read-only computed values derived directly from the store. Only the width input (and height override) should be free-form user inputs.
**Warning signs:** Dimension inconsistencies between preview and export.

### Pitfall 3: targetHeightMM=0 (Auto) Not Propagating to TerrainMesh
**What goes wrong:** When `targetHeightMM` is 0 (auto mode), components that read `targetHeightMM` from the store may render 0mm height or NaN.
**Why it happens:** The existing `buildTerrainGeometry` derives Z height from elevation range + exaggeration + zScale. The new `targetHeightMM` field is for display and export naming — not passed directly as a geometry param.
**How to avoid:** `targetHeightMM === 0` means "auto" — don't pass it to `buildTerrainGeometry`. Calculate display value from `elevationData.maxElevation - elevationData.minElevation` * zScale + basePlate separately for the display label.
**Warning signs:** 3D preview shows flat terrain after adding the height field.

### Pitfall 4: ExportPanel Dimension Inputs Diverge from New ModelSizeSection
**What goes wrong:** `ExportPanel.tsx` currently has its own Width/Depth inputs with local string state (`widthInput`, `depthInput`). If ModelSizeSection adds new canonical dimension controls, both sets of inputs will fight over the store.
**Why it happens:** Duplication of dimension inputs in two components.
**How to avoid:** Move dimension inputs entirely into `ModelSizeSection.tsx` (the new canonical location). Remove them from `ExportPanel.tsx`. `ExportPanel` reads `targetWidthMM`/`targetDepthMM` from store but no longer owns the inputs.
**Warning signs:** Changing Width in ModelSizeSection doesn't update ExportPanel's display, or vice versa.

### Pitfall 5: "Coming Soon" Placeholder Toggles Accepting Clicks
**What goes wrong:** Roads/Water/Vegetation toggles are shown but disabled. If they can be toggled, they'll set `layerToggles.roads = false` etc., and when Phase 5 adds the roads mesh, it checks this value and finds it off.
**Why it happens:** Placeholder toggles initialized to `true` but rendered as disabled — if the disabled attr is missed, clicks toggle them.
**How to avoid:** Render placeholder layer sections with `disabled` attribute on the toggle button and no `onClick` handler. Their store values remain `true` (default). Comment explicitly that placeholder sections are display-only until their phase.
**Warning signs:** Store value is false for a layer that hasn't been built yet.

### Pitfall 6: Exaggeration Slider Inconsistency with Z Height Display
**What goes wrong:** Per CONTEXT.md, the exaggeration slider is "kept alongside Z height — both control vertical scale." If they're in different sections (Z in ModelSize, exaggeration in Terrain), changes to exaggeration won't update the Z height display and vice versa.
**Why it happens:** Exaggeration lives in the Terrain section; Z height is in the Model Size section. They're interdependent.
**How to avoid:** Display Z height as a derived value: `displayHeightMM = computedAutoHeight(elevationData, exaggeration, targetWidthMM, dimensions)`. When exaggeration changes, the Z height display updates automatically via the store read.

---

## Code Examples

Verified patterns from existing codebase and official sources:

### Store Extension (Zustand 5 — existing project pattern)
```typescript
// Source: /src/store/mapStore.ts (existing) + Zustand 5 docs
// Add to MapState interface:
layerToggles: {
  buildings: boolean;
  roads: boolean;
  water: boolean;
  vegetation: boolean;
};
units: 'mm' | 'in';
targetHeightMM: number; // 0 = auto

// Add to MapActions interface:
setLayerToggle: (layer: keyof LayerToggles, enabled: boolean) => void;
setUnits: (units: 'mm' | 'in') => void;
setTargetWidth: (widthMM: number) => void; // auto-computes depth

// Add to create() defaults:
layerToggles: { buildings: true, roads: true, water: true, vegetation: true },
units: 'mm',
targetHeightMM: 0,

// Implement setLayerToggle:
setLayerToggle: (layer, enabled) =>
  set((state) => ({
    layerToggles: { ...state.layerToggles, [layer]: enabled },
  })),

// Implement setTargetWidth (auto-calculates depth from aspect ratio):
setTargetWidth: (widthMM) =>
  set((state) => {
    if (!state.dimensions) return { targetWidthMM: widthMM };
    const aspectRatio = state.dimensions.heightM / state.dimensions.widthM;
    return { targetWidthMM: widthMM, targetDepthMM: widthMM * aspectRatio };
  }),
```

### Three.js Mesh Visibility Toggle (R3F)
```tsx
// Source: R3F documentation pattern — mesh.visible prop binding
// In BuildingMesh.tsx (modify existing):
const buildingsVisible = useMapStore((s) => s.layerToggles.buildings);
// ...
return (
  <mesh ref={meshRef} visible={buildingsVisible}>
    <meshStandardMaterial color="#c0c0c0" side={THREE.DoubleSide} />
  </mesh>
);
```

### Segmented Unit Control (pure React)
```tsx
// Source: Custom implementation — no library
function UnitToggle({ value, onChange }: { value: 'mm' | 'in'; onChange: (u: 'mm' | 'in') => void }) {
  return (
    <div style={{
      display: 'flex',
      backgroundColor: '#1f2937',
      borderRadius: '6px',
      border: '1px solid #374151',
      overflow: 'hidden',
    }}>
      {(['mm', 'in'] as const).map((unit) => (
        <button
          key={unit}
          onClick={() => onChange(unit)}
          style={{
            flex: 1,
            padding: '4px 10px',
            fontSize: '12px',
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            backgroundColor: value === unit ? '#2563eb' : 'transparent',
            color: value === unit ? '#fff' : '#9ca3af',
            transition: 'background-color 0.1s',
          }}
        >
          {unit}
        </button>
      ))}
    </div>
  );
}
```

### Layer Toggle Switch (accessible)
```tsx
// Source: WAI-ARIA switch pattern
function LayerToggle({ label, checked, onChange, disabled }: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        background: checked && !disabled ? '#2563eb' : '#374151',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        // ... toggle pill styles
      }}
    >
      <span style={{ /* thumb */ }} />
    </button>
  );
}
```

### Collapsible Section with Summary
```tsx
// Source: React local state pattern (project uses this in PreviewSidebar.tsx for isOpen)
function CollapsibleSection({ label, summary, children }: {
  label: string;
  summary?: string;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <div>
      <button
        onClick={() => setIsOpen(o => !o)}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', /* ... */ }}
      >
        <span style={{ color: '#e5e7eb', fontSize: '13px', fontWeight: 600 }}>{label}</span>
        {!isOpen && summary && (
          <span style={{ color: '#6b7280', fontSize: '11px' }}>{summary}</span>
        )}
        <span style={{ color: '#6b7280', fontSize: '12px' }}>{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && <div style={{ paddingTop: '10px' }}>{children}</div>}
    </div>
  );
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Zustand `create()` without type param | `create<MyStore>()` with full type | v4 → v5 (2024) | TypeScript now required for type inference |
| `shallow` imported from `zustand/shallow` | `useShallow` from `zustand/react/shallow` | v5 breaking | Object selectors must use `useShallow` or per-field selectors |
| Custom equality fn in `create` | Removed; use `createWithEqualityFn` | v5 breaking | Project uses per-field selectors — not affected |
| Both Width and Depth as free inputs | Width input + auto-depth from aspect ratio | Phase 4 decision | Prevents user accidentally breaking model proportions |

**Already correct in this project:**
- Per-field selectors (`useMapStore(s => s.fieldName)`) — no `useShallow` needed
- `create<MapStore>()` with TypeScript interface — already v5 compliant
- `set((state) => ({ ... }))` functional updater pattern — correct for computed updates

---

## Open Questions

1. **targetHeightMM override UI**
   - What we know: Default is auto-calculated from elevation range. CONTEXT.md says "Separate Z height input for max terrain height."
   - What's unclear: Should the user be able to override auto Z, or is Z always auto-calculated? CONTEXT.md says "Separate Z height input" which implies user-editable.
   - Recommendation: Show auto-calculated Z as the default input value; allow override. If user edits it, store the override. If user clears it, revert to auto (0 = auto sentinel).

2. **PreviewSidebar width for new content**
   - What we know: Current sidebar is 240px with many controls.
   - What's unclear: Five collapsible sections + Model Size section may need more height; horizontal width may be fine.
   - Recommendation: Keep 240px width, rely on `overflowY: auto` (already set) to handle tall content. Increase if visual testing shows crowding.

3. **Where does the section-level layer toggle button live?**
   - What we know: "Stacked collapsible sections, each with a toggle header." Terrain has no toggle (always on). Buildings has toggle default ON.
   - What's unclear: Is the toggle IN the collapsed header row (click to expand vs click to toggle is ambiguous), or is it a separate pill in the header alongside the expand/collapse affordance?
   - Recommendation: Place toggle pill on the RIGHT of the header row, expand/collapse chevron as a separate leftmost affordance. Two distinct click targets — toggle state vs expand/collapse. Clicking the row body expands; toggle pill changes layer visibility.

---

## Sources

### Primary (HIGH confidence)
- `/src/store/mapStore.ts` — Existing Zustand 5 store pattern (verified by reading source)
- `/src/components/Preview/BuildingMesh.tsx` — Existing R3F mesh pattern and store consumption
- `/src/components/Preview/TerrainMesh.tsx` — Existing R3F mesh geometry + visibility lifecycle
- `/src/components/Preview/ExportPanel.tsx` — Export pipeline, layer inclusion logic
- `/src/components/Preview/PreviewSidebar.tsx` — Existing sidebar collapse pattern
- `package.json` — Confirmed zustand@^5.0.3 already installed; no new packages needed

### Secondary (MEDIUM confidence)
- [Zustand v5 migration docs](https://zustand.docs.pmnd.rs/migrations/migrating-to-v5) — v5 breaking changes (per-field selector pattern already correct in this project)
- [Zustand useShallow](https://zustand.docs.pmnd.rs/hooks/use-shallow) — Object selector stability (not needed given existing single-field pattern)
- [R3F GitHub Discussion #2417](https://github.com/pmndrs/react-three-fiber/discussions/2417) — `visible={false}` on mesh verified for pointer event filtering
- [Zustand v5 selector best practices discussion](https://github.com/pmndrs/zustand/discussions/2867) — Confirms per-field selectors are correct v5 approach

### Tertiary (LOW confidence)
- None — all critical claims verified against source code or official docs

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — project already uses all required libraries; verified in package.json and source files
- Architecture: HIGH — patterns derived from existing codebase (store extension, R3F mesh, export pipeline) with confirmed Zustand 5 selector guidance
- Pitfalls: HIGH — derived from direct code analysis of existing components (ExportPanel dimension duplication, store selector patterns) and verified Zustand 5 breaking changes

**Research date:** 2026-02-24
**Valid until:** 2026-08-24 (stable libraries; Zustand 5, R3F 9, Three.js 0.183 — no churn expected)
