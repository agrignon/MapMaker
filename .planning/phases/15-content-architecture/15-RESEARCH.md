# Phase 15: Content Architecture - Research

**Researched:** 2026-03-02
**Domain:** React component extraction, layout-agnostic composition, view-driven content switching
**Confidence:** HIGH

## Summary

Phase 15 is a pure structural refactor. The two sidebar content sets — map controls (`SelectionInfo`, `GenerateButton`) and model controls (`ModelSizeSection`, layer sections, `ExportPanel`) — are currently welded to their container components (`Sidebar.tsx` and `PreviewSidebar.tsx`). This phase extracts the content into standalone "panel" components that carry no positioning, no container styling, and no knowledge of where they are rendered. Containers become thin shells that decide layout; panels remain pure content.

The primary driver is LAYOUT-03: sidebar content must switch based on active view (map controls when viewing the map, model controls when viewing the preview). In the current architecture `SplitLayout` always renders both sidebars simultaneously — `Sidebar` is positioned over the map panel and `PreviewSidebar` is positioned over the preview panel. This works today but fails in Phase 17 when both views share a single persistent sidebar column: the same container must host map controls on map view and model controls on preview view. Extracting the content now, while Phase 15 is small and focused, makes Phase 17 a wiring task rather than a rewrite.

The refactor involves no new npm packages, no new state, no behavior changes, and no visual changes. All 264 tests must continue to pass. The only non-trivial question is where to put the extracted components (`src/components/Panels/` is the recommended location) and how to wire the view switch (read `showPreview` from Zustand store — already available).

**Primary recommendation:** Create `src/components/Panels/MapControlsPanel.tsx` and `src/components/Panels/ModelControlsPanel.tsx`, each containing exactly the content currently inline in their respective sidebars. Then update `Sidebar.tsx` and `PreviewSidebar.tsx` to import and render these panels. Add a `SidebarContent.tsx` component that reads `showPreview` from the store and renders the correct panel — this is the single insertion point that satisfies LAYOUT-03 and serves Phase 17.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| LAYOUT-03 | User sees sidebar content switch between map controls and model controls based on the active view | `showPreview` boolean in Zustand store is the existing view-switch signal; extract map controls and model controls into separate panel components; add `SidebarContent` that conditionally renders based on `showPreview`; containers (sidebar, bottom sheet) render `SidebarContent` with no duplication |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React 19 | 19.x | Component composition | Already the framework; extraction is a React component pattern |
| Zustand | 5.0.11 | `showPreview` read for view switching | `useMapStore(s => s.showPreview)` already works; no changes needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vitest + jsdom | 3.2.4 | Regression protection | `npx vitest run` must continue to report 264/264 passing |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `SidebarContent` reads `showPreview` from store | Pass `activePanel: 'map' \| 'model'` prop down from parent | Prop-passing is fine but the store is already the authoritative view source; makes Phase 17 wiring simpler since any container can render `SidebarContent` without needing the active view passed down |
| Single `SidebarContent` component | Keep two separate sidebars and just import content | Single `SidebarContent` satisfies SC-2 (no duplicated content) and makes the Phase 17 wiring trivial — Phase 17 just renders `<SidebarContent />` in the new persistent sidebar column |

**Installation:** No new packages needed.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── components/
│   ├── Panels/                     # NEW: layout-agnostic content
│   │   ├── MapControlsPanel.tsx    # NEW: SelectionInfo + GenerateButton content
│   │   ├── ModelControlsPanel.tsx  # NEW: ModelSizeSection + layers + ExportPanel content
│   │   └── SidebarContent.tsx      # NEW: showPreview switch — renders one panel at a time
│   ├── Sidebar/
│   │   └── Sidebar.tsx             # MODIFY: render <SidebarContent /> instead of inline content
│   └── Preview/
│       └── PreviewSidebar.tsx      # MODIFY: render <SidebarContent /> instead of inline content (optional — see notes)
```

### Pattern 1: Layout-Agnostic Panel Component
**What:** A panel component renders only its content — zero positional or container CSS. The container decides size, scroll, padding.
**When to use:** Every component in `src/components/Panels/`. These components must be renderable inside any container (sidebar, bottom sheet, modal) without modification.
**Example:**
```typescript
// src/components/Panels/MapControlsPanel.tsx
import { useMapStore } from '../../store/mapStore';
import { SelectionInfo } from '../Sidebar/SelectionInfo';
import { GenerateButton } from '../Sidebar/GenerateButton';

export function MapControlsPanel() {
  const hasBbox = useMapStore((s) => s.bbox !== null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {hasBbox ? (
        <SelectionInfo />
      ) : (
        <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
          Tap <strong>Draw Area</strong> and drag on the map to select a region.
        </p>
      )}
      <GenerateButton />
    </div>
  );
}
```

```typescript
// src/components/Panels/ModelControlsPanel.tsx
import { useMapStore } from '../../store/mapStore';
import { ModelSizeSection } from '../Preview/ModelSizeSection';
import { TerrainSection } from '../Preview/TerrainSection';
import { BuildingsSection } from '../Preview/BuildingsSection';
import { RoadsSection } from '../Preview/RoadsSection';
import { WaterSection } from '../Preview/WaterSection';
import { VegetationSection } from '../Preview/VegetationSection';
import { ExportPanel } from '../Preview/ExportPanel';

export function ModelControlsPanel() {
  const setShowPreview = useMapStore((s) => s.setShowPreview);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <button
        onClick={() => setShowPreview(false)}
        style={{ /* same Back to Edit styling currently in PreviewSidebar */ }}
      >
        ← Back to Edit
      </button>
      <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600, fontSize: '13px' }}>
        Model Controls
      </span>

      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px', paddingTop: '8px' }}>
        <ModelSizeSection />
      </div>

      <div style={{ paddingTop: '10px', paddingBottom: '4px' }}>
        <span style={{ color: '#6b7280', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Layers
        </span>
      </div>

      <TerrainSection />
      <BuildingsSection />
      <RoadsSection />
      <WaterSection />
      <VegetationSection />

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: '8px' }} />
      <ExportPanel />
    </div>
  );
}
```

### Pattern 2: SidebarContent Switch Component
**What:** A single React component that reads `showPreview` from the Zustand store and renders the correct panel. This is the single content insertion point that satisfies LAYOUT-03 and enables Phase 17.
**When to use:** Any container that needs contextual sidebar content renders `<SidebarContent />`.
**Example:**
```typescript
// src/components/Panels/SidebarContent.tsx
import { useMapStore } from '../../store/mapStore';
import { MapControlsPanel } from './MapControlsPanel';
import { ModelControlsPanel } from './ModelControlsPanel';

export function SidebarContent() {
  const showPreview = useMapStore((s) => s.showPreview);
  return showPreview ? <ModelControlsPanel /> : <MapControlsPanel />;
}
```

### Pattern 3: Updated Sidebar.tsx (container)
**What:** `Sidebar.tsx` keeps its positional and container CSS but replaces the inline content with `<SidebarContent />`.
**When to use:** This is the Phase 15 update to the existing sidebar containers.
**Example:**
```typescript
// src/components/Sidebar/Sidebar.tsx (after Phase 15)

function MobileSidebar() {
  return (
    <div style={{ /* ...same container styles... */ }}>
      <div style={{ padding: '10px 14px 6px', flexShrink: 0 }}>
        <span>MapMaker</span>
      </div>
      <div style={{ padding: '0 14px 6px', overflowY: 'auto', flexShrink: 1, minHeight: 0 }}>
        <SidebarContent />
      </div>
    </div>
  );
}

function DesktopSidebar() {
  return (
    <div style={{ /* ...same container styles... */ }}>
      <div style={{ padding: '12px 14px', /* header */ }}>
        <h1>MapMaker</h1>
      </div>
      <div style={{ padding: '12px 14px', flex: 1, overflowY: 'auto' }}>
        <SidebarContent />
      </div>
    </div>
  );
}
```

### Pattern 4: PreviewSidebar.tsx decision
**What:** `PreviewSidebar.tsx` currently contains the model controls inline. After Phase 15, it can either (a) import `ModelControlsPanel` directly (because it only ever shows model controls), or (b) import `SidebarContent` (which will also show model controls when `showPreview === true`).
**When to use:** Option (a) is correct for `PreviewSidebar` in Phase 15 — it is a preview-specific container that logically always shows model controls. Option (b) would create a subtle issue: if `showPreview` is somehow false while `PreviewSidebar` is visible, it would show map controls inside the preview pane, which is wrong.
**Recommended:** `PreviewSidebar` imports `ModelControlsPanel` directly. This keeps the component semantically correct and avoids the `showPreview` edge case. The Phase 17 persistent sidebar uses `SidebarContent`.

### Anti-Patterns to Avoid
- **Leaving container styles in panel components:** Panels must contain zero `position: absolute/fixed`, zero `width` constraints, zero `maxHeight`, zero `overflow` rules. Those belong exclusively in the container.
- **Duplicating `hasBbox` reads in both `Sidebar` and `MapControlsPanel`:** Move the `hasBbox` read into `MapControlsPanel` itself. The container does not need to pass it as a prop. Every panel reads from the store directly.
- **Passing `setShowPreview` as prop to `ModelControlsPanel`:** The "Back to Edit" button in `ModelControlsPanel` calls `setShowPreview(false)`. Get it from the store directly inside `ModelControlsPanel` — no props needed. This keeps the panel self-contained and host-agnostic.
- **Creating a new `activeView` store field:** `showPreview` is already the canonical view toggle signal. Do not add a separate `activeView: 'map' | 'preview'` field — it would duplicate state and create sync bugs.
- **Adding `display: none` toggling:** Do not conditionally hide panels with CSS. The `SidebarContent` component renders one panel at a time via conditional rendering — the other panel does not mount, which is correct (no stale state accumulation).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| View state tracking | Custom `activeView` enum in store | `showPreview` boolean already in `mapStore` | It's already there; adding new state creates sync risk |
| Panel registry | Dynamic panel registry with keys | Simple `if/else` in `SidebarContent` | Only two panels; a registry adds complexity with no benefit |
| Layout-aware panels | Panels that check their container context | Panels export pure content; containers apply layout | Inversion of control is cleaner and easier to test |

**Key insight:** The entire phase is a mechanical extraction. Nothing algorithmic is being built. Every line of logic already exists — it's just being moved to a better location.

## Common Pitfalls

### Pitfall 1: Bleeding Container Styles Into Panels
**What goes wrong:** `ModelControlsPanel` ends up with `padding: '14px'`, `overflow: 'auto'`, `width: 'min(240px, ...)'` copied from `PreviewSidebar`. The panel then breaks when placed in a narrower container in Phase 16 (bottom sheet).
**Why it happens:** Developers instinctively copy all the styles from the original container when extracting, including the structural ones.
**How to avoid:** Extract only the element hierarchy and content logic. Leave all positional, sizing, overflow, and padding-outer styles in the container. The panel starts at the first "semantic content" div, not the outermost wrapper.
**Warning signs:** Panel contains any of: `position`, `width`, `max-height`, `overflow: auto`, `box-shadow`, `border-radius`, `backdrop-filter`, `z-index`.

### Pitfall 2: hasBbox as a Prop Instead of Store Read
**What goes wrong:** `Sidebar.tsx` still reads `hasBbox` and passes it to the panel as `<MapControlsPanel hasBbox={hasBbox} />`. This ties the panel to its container's interface, defeating the layout-agnostic goal.
**Why it happens:** The original `Sidebar` passes `hasBbox` to `MobileSidebar` and `DesktopSidebar` as a prop — it's tempting to carry that pattern forward.
**How to avoid:** `MapControlsPanel` reads `const hasBbox = useMapStore((s) => s.bbox !== null)` internally. No props needed. The Zustand store is the single source of truth.

### Pitfall 3: PreviewSidebar Toggle Button Left Behind
**What goes wrong:** The `PreviewSidebar` collapse toggle button (`isOpen` state, `›`/`‹` chevron) is left in `PreviewSidebar.tsx` but is not part of the panel content. After extraction, `PreviewSidebar` should still own the toggle, while `ModelControlsPanel` only contains the model controls content (not the toggle).
**Why it happens:** The toggle and the content are interleaved in `PreviewSidebar.tsx`'s JSX — easy to accidentally include the toggle in the panel.
**How to avoid:** The toggle button and the `isOpen` state stay entirely in `PreviewSidebar.tsx`. Only the inner `<div>` content (the `isOpen && <div>...` block's contents) moves to `ModelControlsPanel`. The `isOpen` condition stays in `PreviewSidebar`.

### Pitfall 4: Sidebar.tsx Still Has `hasBbox` Conditional
**What goes wrong:** After extracting content to `MapControlsPanel`, `Sidebar.tsx` still has dead `hasBbox` logic (the outer guard) that was previously used to choose which elements to render.
**Why it happens:** The `hasBbox` conditional currently drives what `MobileSidebar` and `DesktopSidebar` render. After extraction, this moves into `MapControlsPanel` — `Sidebar.tsx` no longer needs it.
**How to avoid:** After moving content to `MapControlsPanel`, audit `Sidebar.tsx` for any now-dead conditional logic and remove it. The containers become truly thin shells.

### Pitfall 5: Test Breakage from Import Path Changes
**What goes wrong:** The 264-test suite imports `triggerRegenerate` from `../GenerateButton` — if `GenerateButton.tsx` is moved or renamed during extraction, this import breaks.
**Why it happens:** `GenerateButton.tsx` currently lives at `src/components/Sidebar/GenerateButton.tsx`. The test imports from `../GenerateButton` (relative path from `__tests__`).
**How to avoid:** Do NOT move `GenerateButton.tsx`, `SelectionInfo.tsx`, or any leaf components. Only create new files in `src/components/Panels/`. The panel files import the leaf components using their existing paths. This preserves all test import paths unchanged.

### Pitfall 6: SidebarContent Renders Both Panels Simultaneously
**What goes wrong:** Developer writes `{showPreview && <ModelControlsPanel />}{!showPreview && <MapControlsPanel />}` which is fine, but then adds a CSS `display: none` guard "just to be safe," causing both panels to mount and accumulate state.
**Why it happens:** Over-engineering the visibility.
**How to avoid:** Use plain conditional rendering: `return showPreview ? <ModelControlsPanel /> : <MapControlsPanel />`. Only one panel mounts at a time. This is idiomatic React.

## Code Examples

### SidebarContent — Complete Implementation
```typescript
// src/components/Panels/SidebarContent.tsx
// Source: design derived from existing showPreview usage in SplitLayout.tsx:121-219

import { useMapStore } from '../../store/mapStore';
import { MapControlsPanel } from './MapControlsPanel';
import { ModelControlsPanel } from './ModelControlsPanel';

/**
 * Layout-agnostic content switcher.
 * Renders MapControlsPanel when on map view, ModelControlsPanel when on preview view.
 * Any container (sidebar, bottom sheet) renders <SidebarContent /> to get contextual content.
 */
export function SidebarContent() {
  const showPreview = useMapStore((s) => s.showPreview);
  return showPreview ? <ModelControlsPanel /> : <MapControlsPanel />;
}
```

### MapControlsPanel — Complete Implementation
```typescript
// src/components/Panels/MapControlsPanel.tsx
// Content extracted from Sidebar.tsx MobileSidebar + DesktopSidebar inner content

import { useMapStore } from '../../store/mapStore';
import { SelectionInfo } from '../Sidebar/SelectionInfo';
import { GenerateButton } from '../Sidebar/GenerateButton';

/**
 * Map view controls panel — layout-agnostic.
 * Reads store directly; no props. Can be hosted by any container.
 */
export function MapControlsPanel() {
  const hasBbox = useMapStore((s) => s.bbox !== null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {hasBbox ? (
        <SelectionInfo />
      ) : (
        <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
          Search for a location, then tap <strong>Draw Area</strong> and drag on the map to select
          a region. On desktop you can also <strong>Shift+drag</strong>.
        </p>
      )}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '6px' }}>
        <GenerateButton />
      </div>
    </div>
  );
}
```

### ModelControlsPanel — Key Structure
```typescript
// src/components/Panels/ModelControlsPanel.tsx
// Content extracted from PreviewSidebar.tsx isOpen && <div> block

import { useMapStore } from '../../store/mapStore';
import { ModelSizeSection } from '../Preview/ModelSizeSection';
import { TerrainSection } from '../Preview/TerrainSection';
import { BuildingsSection } from '../Preview/BuildingsSection';
import { RoadsSection } from '../Preview/RoadsSection';
import { WaterSection } from '../Preview/WaterSection';
import { VegetationSection } from '../Preview/VegetationSection';
import { ExportPanel } from '../Preview/ExportPanel';

/**
 * Model controls panel — layout-agnostic.
 * Contains Back-to-Edit nav, model size, layer sections, export.
 * Reads store directly; no props.
 */
export function ModelControlsPanel() {
  const setShowPreview = useMapStore((s) => s.setShowPreview);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header with Back to Edit nav */}
      <div style={{ marginBottom: '4px' }}>
        <button
          onClick={() => setShowPreview(false)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#9ca3af',
            fontSize: '12px',
            padding: '4px 0',
            cursor: 'pointer',
            display: 'block',
            width: '100%',
            textAlign: 'left',
          }}
        >
          ← Back to Edit
        </button>
        <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600, fontSize: '13px' }}>
          Model Controls
        </span>
      </div>

      {/* Model size always visible above layers */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '12px', paddingTop: '8px' }}>
        <ModelSizeSection />
      </div>

      {/* Layers subheading */}
      <div style={{ paddingTop: '10px', paddingBottom: '4px' }}>
        <span style={{ color: '#6b7280', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Layers
        </span>
      </div>

      <TerrainSection />
      <BuildingsSection />
      <RoadsSection />
      <WaterSection />
      <VegetationSection />

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: '8px' }} />
      <ExportPanel />
    </div>
  );
}
```

### Updated Sidebar.tsx Container Pattern
```typescript
// src/components/Sidebar/Sidebar.tsx (after Phase 15)
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { SidebarContent } from '../Panels/SidebarContent';

function MobileSidebar() {
  return (
    <div style={{ /* same container styles — position, backdrop, safe area */ }}>
      <div style={{ padding: '10px 14px 6px', flexShrink: 0 }}>
        <span style={{ fontSize: '15px', fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
          MapMaker
        </span>
      </div>
      <div style={{ padding: '0 14px 6px', overflowY: 'auto', flexShrink: 1, minHeight: 0 }}>
        <SidebarContent />
      </div>
    </div>
  );
}

function DesktopSidebar() {
  return (
    <div style={{ /* same container styles */ }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
        <h1 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
          MapMaker
        </h1>
      </div>
      <div style={{ padding: '12px 14px', flex: 1, overflowY: 'auto' }}>
        <SidebarContent />
      </div>
    </div>
  );
}

export function Sidebar() {
  const tier = useBreakpoint();
  return tier === 'mobile' ? <MobileSidebar /> : <DesktopSidebar />;
}
```

### Updated PreviewSidebar.tsx Container Pattern
```typescript
// src/components/Preview/PreviewSidebar.tsx (after Phase 15)
// Toggle button + isOpen state stay here; inner content replaced by ModelControlsPanel

import { useState } from 'react';
import { ModelControlsPanel } from '../Panels/ModelControlsPanel';

export function PreviewSidebar() {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div style={{ /* same outer container styles */ }}>
      {/* Toggle button — stays in PreviewSidebar */}
      <button onClick={() => setIsOpen((prev) => !prev)} /* ... */ >
        {isOpen ? '›' : '‹'}
      </button>

      {/* Expandable panel */}
      {isOpen && (
        <div style={{ /* same panel container styles — width, maxHeight, padding, overflow */ }}>
          <ModelControlsPanel />
        </div>
      )}
    </div>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Content inline in container | Layout-agnostic panels in `src/components/Panels/` | This phase | Panels can be hosted by any container without modification |
| `Sidebar` owns `hasBbox` decision | `MapControlsPanel` reads store directly | This phase | Container is a thin shell; panel is self-sufficient |
| Two separate view-specific sidebars | `SidebarContent` routes to correct panel | This phase | Single insertion point satisfies LAYOUT-03 and enables Phase 17 |

**Deprecated/outdated after this phase:**
- Inline `hasBbox` logic in `Sidebar.tsx`: moves to `MapControlsPanel`
- Inline model controls content in `PreviewSidebar.tsx`: moves to `ModelControlsPanel`

## Open Questions

1. **Desktop vs mobile copy in MapControlsPanel**
   - What we know: `MobileSidebar` uses short copy ("Tap Draw Area and drag") while `DesktopSidebar` uses long copy ("Search for a location, then tap Draw Area... On desktop you can also Shift+drag").
   - What's unclear: Should `MapControlsPanel` show one version always, or detect tier and show appropriate copy?
   - Recommendation: The copy difference is cosmetic. Use the more complete desktop copy in `MapControlsPanel` for now — it works on mobile too, just longer. Phase 18 (polish) can refine copy if needed. Alternatively, `MapControlsPanel` can read `deviceTier` from the store to switch copy. Either is fine; the planner should decide.

2. **Whether to remove `hasBbox` guard from `Sidebar.tsx` containers**
   - What we know: Currently `MobileSidebar` and `DesktopSidebar` both receive `hasBbox` prop and conditionally render `SelectionInfo`. After Phase 15, `MapControlsPanel` handles this internally.
   - What's unclear: Nothing — the `hasBbox` prop definitely moves into the panel. The containers become prop-free.
   - Recommendation: Remove the `hasBbox` prop from both `MobileSidebar` and `DesktopSidebar`. `Sidebar.tsx` no longer reads from the store for content decisions.

3. **Whether `SidebarContent` handles the "Back to Edit" action or ModelControlsPanel does**
   - What we know: "Back to Edit" calls `setShowPreview(false)`. It's currently inside `PreviewSidebar.tsx`. Logically it belongs in `ModelControlsPanel` (it's model-view navigation). `SidebarContent` is a dumb router and should not handle navigation.
   - Recommendation: "Back to Edit" belongs in `ModelControlsPanel`, not `SidebarContent`. This keeps `SidebarContent` as a pure router.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.4 |
| Config file | `/Users/agrignon/projects/MapMaker/vitest.config.ts` |
| Environment | jsdom |
| Quick run command | `npx vitest run` |
| Full suite command | `npx vitest run` |

**Current suite:** 21 files, 264 tests — confirmed all passing (2026-03-02).

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Notes |
|--------|----------|-----------|-------|
| LAYOUT-03 | Sidebar content switches between map controls and model controls based on active view | Manual + regression | The view switch is driven by `showPreview` boolean. No new automated tests are required by the success criteria. SC-3 requires the 264-test suite passes unchanged — the extraction must not move or rename `GenerateButton.tsx` (the only component with a test). |

**Automated regression protection:**
- `GenerateButton.test.ts` imports `triggerRegenerate` from `../GenerateButton`. This path must remain unchanged — `GenerateButton.tsx` stays at `src/components/Sidebar/GenerateButton.tsx`.
- The test's `beforeEach` resets `useMapStore.setState(...)` — no `showPreview` is set, but the store initializes with `showPreview: false` as the default, so this is already correct.

### Wave 0 Gaps
None — existing test infrastructure covers the regression requirement. The phase is a pure extraction refactor. No new test files are required. The critical constraint is that `GenerateButton.tsx` must not be moved.

*(The 264-test baseline provides regression protection. Manual verification in the browser confirms SC-1 and SC-2.)*

## Sources

### Primary (HIGH confidence)
- Codebase direct inspection: `src/components/Sidebar/Sidebar.tsx` — current content structure, `hasBbox` prop flow, `MobileSidebar` and `DesktopSidebar` components
- Codebase direct inspection: `src/components/Preview/PreviewSidebar.tsx` — current model controls inline, `isOpen` toggle, `setShowPreview` usage
- Codebase direct inspection: `src/components/Layout/SplitLayout.tsx` — how both sidebars are currently rendered, `showPreview` consumption
- Codebase direct inspection: `src/store/mapStore.ts` — `showPreview` boolean, `setShowPreview` action confirmed
- Codebase direct inspection: `src/App.tsx` — component hierarchy: `SplitLayout > MapView + Sidebar`
- Codebase direct inspection: `src/components/Sidebar/__tests__/GenerateButton.test.ts` — import path `../GenerateButton` that must not break
- `npx vitest run` — confirmed 264/264 tests pass (2026-03-02)
- `.planning/ROADMAP.md` Phase 15 success criteria and Phase 17 dependency

### Secondary (MEDIUM confidence)
- React docs: conditional rendering with ternary (`condition ? <A /> : <B />`) — standard pattern; only one component mounts at a time
- Zustand docs: `useMapStore(selector)` in leaf components — already established pattern throughout codebase

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — React + Zustand already in use; no new packages
- Architecture: HIGH — `showPreview` is the existing signal; extraction patterns are mechanical; all paths verified in source
- Pitfalls: HIGH — test import paths confirmed by direct inspection; container/content separation patterns confirmed by examining all 5 existing components
- Test strategy: HIGH — test count and files confirmed by running `npx vitest run`; `GenerateButton.test.ts` import path verified

**Research date:** 2026-03-02
**Valid until:** 2026-04-02 (30 days — stable patterns, no fast-moving dependencies)
