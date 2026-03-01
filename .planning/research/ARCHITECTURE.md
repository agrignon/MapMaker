# Architecture Research

**Domain:** Responsive UI integration — React/R3F/Zustand/Tailwind v4 app
**Researched:** 2026-02-28
**Confidence:** HIGH

---

## Context: What Already Exists

The app ships a working but rough responsive system:

- `SplitLayout.tsx` — owns layout orchestration, contains an inline `useIsMobile(768)` hook, binary mobile/desktop branch, `display:none` for the preview column when hidden (mobile path), `visibility:hidden` for the preview column on desktop (WebGL preservation)
- `Sidebar.tsx` — owns map controls; contains its own `useIsMobile(768)` copy, switches between `MobileSidebar` (fixed bottom) and `DesktopSidebar` (floating overlay)
- `PreviewSidebar.tsx` — owns 3D model controls; always rendered as a `position:absolute` overlay inside the preview column; no mobile-awareness
- `MobileTabBar` (inside `SplitLayout`) — simple tab bar, shown only when `showPreview === true`
- All sizing/spacing/colours are inline styles throughout

The constraint that defines everything: **the R3F `<Canvas>` must never unmount**. Unmounting it triggers a WebGL context loss that cannot be recovered without a full page reload. The current `visibility:hidden` approach on the desktop preview column works correctly. The mobile path currently conditionally mounts/unmounts the preview `<div>` based on `showPreview`, which is safe because `showPreview` gates on the Generate action — but tab-switching must NOT use mount/unmount.

---

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         App.tsx (100dvh)                         │
├─────────────────────────────────────────────────────────────────┤
│                   SplitLayout (rewritten)                        │
│                                                                  │
│  mobile tier:                                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  [map view]   visibility:visible/hidden                  │   │
│  │  ┌──────────────────────────────────────────────────┐   │   │
│  │  │  MapView + SearchOverlay + DrawButton             │   │   │
│  │  └──────────────────────────────────────────────────┘   │   │
│  │  [preview view]  visibility:visible/hidden               │   │
│  │  ┌──────────────────────────────────────────────────┐   │   │
│  │  │  PreviewCanvas (R3F) — ALWAYS MOUNTED            │   │   │
│  │  └──────────────────────────────────────────────────┘   │   │
│  │  [bottom sheet] fixed position, always mounted           │   │
│  │  ┌──────────────────────────────────────────────────┐   │   │
│  │  │  BottomSheet  [peek | half | full snap points]   │   │   │
│  │  │  content: map controls OR model controls         │   │   │
│  │  └──────────────────────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  tablet/desktop tier:                                            │
│  ┌────────────────────┐  ┌──────────────────────────────────┐   │
│  │  ContextualSidebar │  │  Map | Preview columns (split)   │   │
│  │  ─────────────     │  │  ┌────────────┐  ┌───────────┐  │   │
│  │  map controls OR   │  │  │  MapView   │  │ PreviewC. │  │   │
│  │  model controls    │  │  │            │  │ (R3F)     │  │   │
│  │  (based on active  │  │  └────────────┘  └───────────┘  │   │
│  │   view)            │  └──────────────────────────────────┘   │
│  └────────────────────┘                                          │
├─────────────────────────────────────────────────────────────────┤
│                         Zustand Stores                           │
│  mapStore (existing) + activeView field   |   uiStore (new)     │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Status |
|-----------|----------------|--------|
| `SplitLayout` | Three-tier layout switching; WebGL column visibility; resizable split | Rewrite |
| `useBreakpoint` | Single source of truth for `mobile / tablet / desktop` tier | New hook |
| `BottomSheet` | Mobile-only draggable sheet with 3 snap heights (peek/half/full) | New component |
| `ContextualSidebar` | Persistent sidebar (tablet/desktop) showing map OR model controls by view | New component |
| `MobileViewToggle` | Full-screen map/preview switcher for mobile | New component |
| `MapSidebarContent` | Map controls content (SelectionInfo + GenerateButton) — layout-agnostic | Extracted |
| `PreviewSidebarContent` | Model controls content (layer sections + export) — layout-agnostic | Extracted |
| `Sidebar` | Thin wrapper — delegates to layout system | Refactor |
| `PreviewSidebar` | Thin wrapper — delegates to layout system | Refactor |
| `StaleIndicator` | Unchanged; overlay inside preview column | No change |
| `uiStore` | Sheet snap height, sidebar collapsed state | New store slice |

---

## Recommended Project Structure

```
src/
├── components/
│   ├── Layout/
│   │   ├── SplitLayout.tsx          # Three-tier layout orchestrator (rewrite)
│   │   ├── BottomSheet.tsx          # Mobile sheet with snap points (new)
│   │   ├── ContextualSidebar.tsx    # Persistent sidebar for tablet/desktop (new)
│   │   └── MobileViewToggle.tsx     # Full-screen map/preview switcher (new)
│   ├── Sidebar/                     # Unchanged structure — holds map controls
│   │   ├── Sidebar.tsx              # Thin wrapper; content extracted below
│   │   ├── MapSidebarContent.tsx    # SelectionInfo + GenerateButton (extracted, new)
│   │   ├── SelectionInfo.tsx        # No changes
│   │   └── GenerateButton.tsx       # No changes
│   ├── Preview/                     # Unchanged structure — holds 3D model controls
│   │   ├── PreviewSidebar.tsx       # Thin wrapper; content extracted below
│   │   ├── PreviewSidebarContent.tsx # All layer sections + export (extracted, new)
│   │   └── ... (all mesh/section components unchanged)
│   └── Map/                         # No changes
├── hooks/
│   ├── useBreakpoint.ts             # NEW — mobile/tablet/desktop tier
│   └── useTerradraw.ts              # Unchanged
├── store/
│   ├── mapStore.ts                  # Add activeView: 'map' | 'preview' field
│   └── uiStore.ts                   # NEW — sheetSnap, sidebarCollapsed
└── index.css                        # Add @theme breakpoint vars + animation keyframes
```

### Structure Rationale

- **`Layout/`:** All layout-aware components live here. Control components (`Sidebar/`, `Preview/`) become layout-agnostic and render only their content.
- **`hooks/useBreakpoint.ts`:** Centralises the `window.matchMedia` logic currently duplicated in `SplitLayout.tsx` and `Sidebar.tsx`. Returns a typed tier rather than a boolean.
- **Content extraction:** `MapSidebarContent` and `PreviewSidebarContent` are the extracted pure-content components. The layout system (BottomSheet, ContextualSidebar) decides where to place them. This is the critical prerequisite for all layout work.
- **`store/uiStore.ts`:** Separates UI/layout state from app/domain state in `mapStore`. Prevents `mapStore` (already 64 fields) from growing further.

---

## Architectural Patterns

### Pattern 1: Single Breakpoint Hook with Typed Tiers

**What:** Replace both instances of `useIsMobile(768)` with a single `useBreakpoint()` hook that returns `'mobile' | 'tablet' | 'desktop'`.

**When to use:** Everywhere layout branches on screen size. Replaces boolean `isMobile` checks.

**Trade-offs:** Slightly more complex than a boolean, but eliminates the silent bug risk of mismatched breakpoint values between files. With three tiers, a boolean is insufficient anyway.

```typescript
// src/hooks/useBreakpoint.ts
type Tier = 'mobile' | 'tablet' | 'desktop';

const BREAKPOINTS = {
  tablet: 768,   // matches Tailwind md: — below this is mobile
  desktop: 1024, // matches Tailwind lg: — at/above this is desktop
} as const;

function getTier(width: number): Tier {
  if (width >= BREAKPOINTS.desktop) return 'desktop';
  if (width >= BREAKPOINTS.tablet) return 'tablet';
  return 'mobile';
}

export function useBreakpoint(): Tier {
  const [tier, setTier] = useState<Tier>(() => getTier(window.innerWidth));

  useEffect(() => {
    const tabletMq = window.matchMedia(`(min-width: ${BREAKPOINTS.tablet}px)`);
    const desktopMq = window.matchMedia(`(min-width: ${BREAKPOINTS.desktop}px)`);
    const update = () => setTier(getTier(window.innerWidth));

    tabletMq.addEventListener('change', update);
    desktopMq.addEventListener('change', update);
    return () => {
      tabletMq.removeEventListener('change', update);
      desktopMq.removeEventListener('change', update);
    };
  }, []);

  return tier;
}
```

The same values go into `index.css` as Tailwind v4 theme variables so CSS classes and JS logic stay in sync:

```css
/* src/index.css */
@theme {
  --breakpoint-md: 48rem;   /* 768px — tablet start */
  --breakpoint-lg: 64rem;   /* 1024px — desktop start */
}
```

### Pattern 2: WebGL Context Preservation via CSS Visibility (Maintain Existing Strategy)

**What:** The R3F `<Canvas>` inside `PreviewCanvas` must never unmount. On mobile, it stays mounted but hidden with `visibility: hidden` (not `display: none`) when the map view is active. On desktop, the existing `visibility: hidden` on the preview column when `showPreview === false` is preserved.

**When to use:** Any time the layout switches views — mobile tab toggle, desktop show/hide preview.

**Trade-offs:** `visibility: hidden` preserves layout space. On mobile, the full-screen stacked views are `position: absolute; inset: 0`, so both the map and preview occupy the same space — layout-space preservation is irrelevant.

**Why not `content-visibility: hidden`:** `content-visibility: hidden` achieved Baseline 2024 status but its interaction with WebGL canvas rendering state is not documented in the spec. The MDN documentation notes that the `contentvisibilityautostatechange` event is the mechanism for managing canvas rendering, introducing additional complexity. The existing `visibility: hidden` pattern is proven, simple, and correct. Do not change it.

**Why not `display: none`:** Destroys the WebGL context. Fatal for this app.

```typescript
// Mobile view stacking in SplitLayout
// Both views are always mounted; visibility toggles which is interactive
const mapStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  visibility: activeView === 'map' ? 'visible' : 'hidden',
  pointerEvents: activeView === 'map' ? 'auto' : 'none',
};

const previewStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  visibility: activeView === 'preview' ? 'visible' : 'hidden',
  pointerEvents: activeView === 'preview' ? 'auto' : 'none',
};
```

### Pattern 3: Bottom Sheet with Vaul — Three Snap Points

**What:** On mobile, replace the fixed `MobileSidebar` with a draggable bottom sheet using Vaul. Three snap points: peek (~80px, shows only Generate button), half (~45dvh, shows SelectionInfo + Generate), full (~85dvh, shows all model controls when in preview mode).

**When to use:** Mobile only (`tier === 'mobile'`). Not rendered on tablet or desktop.

**Trade-offs:** Vaul adds a dependency (~184KB package, Radix UI Dialog base) but provides gesture handling, snap-point physics, and keyboard accessibility that are expensive to build from scratch. Vaul v1.1.2 (Dec 2024) is the latest stable release. The author has noted the project is "unmaintained" but it has 355k dependent projects and is used in production by Vercel. The risk of abandonment is low given ecosystem adoption; a custom implementation is the fallback if Vaul becomes problematic.

**Snap point configuration:**

```typescript
import { Drawer } from 'vaul';

// Snap points: array of pixel strings or 0-1 fractions
const SNAP_POINTS = ['80px', '45dvh', 0.85] as const;

function MobileBottomSheet() {
  const [snap, setSnap] = useState<string | number>(SNAP_POINTS[0]);
  const showPreview = useMapStore((s) => s.showPreview);

  return (
    <Drawer.Root
      snapPoints={SNAP_POINTS}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
      modal={false}        // map and preview remain interactive behind the sheet
      dismissible={false}  // sheet never fully dismisses — always at least peek
    >
      <Drawer.Portal>
        <Drawer.Content
          style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom, 8px))' }}
        >
          <Drawer.Handle />
          {/* Peek state: always visible */}
          <GenerateButton />
          {/* Half/full: conditional on snap height */}
          {snap !== SNAP_POINTS[0] && (
            showPreview
              ? <PreviewSidebarContent />   // model controls
              : <MapSidebarContent />       // SelectionInfo + empty-state copy
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
```

**Contextual content switching:** When `showPreview === false`, the sheet shows map controls (SelectionInfo + GenerateButton). When `showPreview === true`, it shows model controls (all layer sections + ExportPanel). This is the "contextual" requirement from the milestone.

**Auto-snap on generate:** When the user taps Generate and `showPreview` transitions `false → true`, the sheet should snap from peek to half. Wire this in a `useEffect` on `showPreview` inside `BottomSheet`:

```typescript
useEffect(() => {
  if (showPreview) setSnap(SNAP_POINTS[1]); // snap to half on generate
}, [showPreview]);
```

### Pattern 4: Contextual Sidebar for Tablet and Desktop

**What:** A persistent sidebar column that shows map controls while the map view is active (or `showPreview === false`), and model controls while the preview is active (`showPreview === true`). Replaces both the floating `DesktopSidebar` overlay and the floating `PreviewSidebar` overlay.

**When to use:** `tier === 'tablet'` or `tier === 'desktop'`.

**Trade-offs:** Changes the visual layout from glass overlays to a structured column. The sidebar column consumes fixed width (240px on desktop, 220px on tablet), reducing map/preview canvas area. On desktop this is a net improvement — the current overlay obscures part of the preview. On tablet, same improvement.

```typescript
function ContextualSidebar() {
  const showPreview = useMapStore((s) => s.showPreview);

  return (
    <aside className="w-[220px] lg:w-[260px] h-full flex flex-col bg-gray-900 border-r border-gray-800 shrink-0">
      <div className="flex-1 overflow-y-auto min-h-0">
        {showPreview
          ? <PreviewSidebarContent />
          : <MapSidebarContent />
        }
      </div>
    </aside>
  );
}
```

### Pattern 5: Content Extraction from Layout-Coupled Components

**What:** `Sidebar.tsx` and `PreviewSidebar.tsx` currently own both their content AND their positioning/layout. The new system places that content in different containers (bottom sheet on mobile, sidebar column on tablet/desktop). Extract content to pure components.

**When to use:** This is a prerequisite for patterns 3 and 4. Must happen before building new layout components.

**Trade-offs:** Adds one level of component nesting. The trade-off is marginal; the flexibility gain is substantial.

```
Before:
  Sidebar.tsx → [positions itself as fixed bottom / floating overlay] + [renders controls]

After:
  MapSidebarContent.tsx → [renders controls only — no positioning, no layout]
  BottomSheet.tsx → places MapSidebarContent in Vaul content (mobile)
  ContextualSidebar.tsx → places MapSidebarContent in sidebar column (tablet/desktop)
```

`SelectionInfo` and `GenerateButton` are already pure content components — they need no changes. Only the wrapper div with positioning is being removed and moved to the layout system.

---

## Data Flow

### Layout Decision Flow

```
window resize event
    ↓
useBreakpoint() → 'mobile' | 'tablet' | 'desktop'
    ↓
SplitLayout branches rendering:

  mobile  → full-screen view stack (position: absolute; inset: 0)
            + MobileViewToggle (tab bar or FAB)
            + BottomSheet (fixed, always mounted)
            visibility toggling for WebGL preservation

  tablet  → [ContextualSidebar 220px] + [split: map | preview]
            no bottom sheet

  desktop → [ContextualSidebar 260px] + [split: map | preview, resizable divider]
            no bottom sheet
```

### View Transition Flow (Mobile)

```
User taps [3D Preview] in MobileViewToggle
    ↓
setActiveView('preview')        ← mapStore action
    ↓
SplitLayout re-renders:
  map div:     visibility:hidden, pointerEvents:none
  preview div: visibility:visible, pointerEvents:auto
    ↓
PreviewCanvas remains mounted — WebGL context intact
MapLibre map remains mounted — no re-initialisation cost
    ↓
BottomSheet: showPreview === true → content switches to model controls
```

### Sheet Snap Flow (Mobile)

```
User drags bottom sheet upward
    ↓
Vaul gesture handler detects drag velocity + position
    ↓
Snaps to nearest point: '80px' → '45dvh' → 0.85
    ↓
setSnap(newSnapPoint)            ← local state in BottomSheet
    ↓
Content re-renders based on snap + showPreview:
  snap === '80px'  → peek: GenerateButton only
  snap === '45dvh' → half: SelectionInfo + GenerateButton (or partial model controls)
  snap === 0.85    → full: all controls scrollable
```

### State Management

```
mapStore (existing — app/domain state):
  showPreview: boolean          ← existing; controls content switch
  activeView: 'map'|'preview'  ← ADD THIS; controls mobile view visibility
  bbox, elevationData, ...      ← existing, unchanged

uiStore (new — pure UI/layout state):
  sheetSnap: string | number    ← current snap point (local to BottomSheet, not store)
  sidebarCollapsed: boolean     ← for future collapse affordance on desktop
```

**Note on `sheetSnap`:** Keep `sheetSnap` as local state inside `BottomSheet.tsx` via `useState`. Only elevate to `uiStore` if another component needs to read or set the snap height (e.g., the generate button auto-expanding the sheet on success). If auto-expansion is needed, put snap control in `uiStore` and have `BottomSheet` subscribe to it.

**Note on `activeView`:** Place in `mapStore` (not `uiStore`) because it is coupled to `showPreview` — when `showPreview` transitions `false → true` (Generate succeeds), `activeView` should automatically switch to `'preview'` on mobile. This coupling is cleaner in one store.

---

## Integration Points

### Existing → New Component Mapping

| Existing Component | Action | Result |
|--------------------|--------|--------|
| `useIsMobile()` in `SplitLayout` | Delete | Replaced by `useBreakpoint()` |
| `useIsMobile()` in `Sidebar` | Delete | Replaced by `useBreakpoint()` |
| `MobileTabBar` (inside SplitLayout) | Replace | `MobileViewToggle.tsx` |
| `MobileSidebar` (inside Sidebar) | Replace | `BottomSheet.tsx` renders `MapSidebarContent` |
| `DesktopSidebar` (inside Sidebar) | Replace | `ContextualSidebar.tsx` renders `MapSidebarContent` |
| `PreviewSidebar.tsx` outer wrapper | Refactor | Extract content; `ContextualSidebar` renders `PreviewSidebarContent` on mobile it goes in `BottomSheet` |
| `StaleIndicator` (in SplitLayout) | Move | Stays inside preview column — logic unchanged |
| Split resizer divider | Keep | Desktop only; move inside SplitLayout desktop branch |

### Internal Boundaries

| Boundary | Communication | Constraint |
|----------|---------------|------------|
| `SplitLayout` ↔ `PreviewCanvas` | CSS `visibility` only | Never unmount Canvas |
| `SplitLayout` ↔ `MapView` | DOM containment + resize coordination | MapLibre needs `map.resize()` after container size changes |
| `BottomSheet` ↔ content components | Direct render inside `Drawer.Content` | Content is stateless; sheet owns snap/positioning |
| `ContextualSidebar` ↔ content components | Direct render inside sidebar column | Same stateless content pattern |
| `uiStore` ↔ `mapStore` | Both read independently | No cross-store writes; subscribe to each separately |
| `useBreakpoint` ↔ layout components | Hook return value | Only `SplitLayout`, `ContextualSidebar`, `BottomSheet` should branch on tier |

### MapLibre Resize Coordination

MapLibre GL JS uses a `ResizeObserver` internally but may not detect changes caused by CSS transitions or JS-driven `visibility` changes (since these do not change the element's layout dimensions). After any layout change that alters the map container's rendered size — sidebar opening/closing, split percent changing, view toggle on tablet — call `map.resize()`.

```typescript
// In MapView.tsx or a dedicated resize coordinator
const { current: mapRef } = useMap();
const activeView = useMapStore((s) => s.activeView);
const showPreview = useMapStore((s) => s.showPreview);
const tier = useBreakpoint();

useEffect(() => {
  // Allow CSS transitions to complete before resizing
  const id = setTimeout(() => {
    mapRef?.getMap().resize();
  }, 200);
  return () => clearTimeout(id);
}, [activeView, showPreview, tier, mapRef]);
```

---

## Build Order

Build in dependency order to avoid breaking the app at each step:

**Phase 1 — Foundation (no visible changes)**
1. Create `hooks/useBreakpoint.ts` with `mobile/tablet/desktop` tiers
2. Add `activeView: 'map' | 'preview'` field + `setActiveView` action to `mapStore`
3. Create `store/uiStore.ts` with `sidebarCollapsed` (sheetSnap stays local)
4. Update `index.css` `@theme` with correct breakpoint values + `@keyframes slide-up` for sheet animation

**Phase 2 — Replace `useIsMobile` (behaviour identical)**
5. Replace `useIsMobile` in `SplitLayout.tsx` with `useBreakpoint()` — `isMobile === true` maps to `tier === 'mobile'`; `isMobile === false` maps to `tier !== 'mobile'`. Tablet uses desktop layout for now.
6. Replace `useIsMobile` in `Sidebar.tsx` with `useBreakpoint()` — same mapping.
7. Run full test suite — all 264 tests should still pass.

**Phase 3 — Content extraction (no visible changes)**
8. Create `MapSidebarContent.tsx` — extract `SelectionInfo` + `GenerateButton` wrapper from `MobileSidebar`/`DesktopSidebar`. Both existing variants now call `MapSidebarContent`.
9. Create `PreviewSidebarContent.tsx` — extract all sections from `PreviewSidebar`'s inner panel div. `PreviewSidebar` wraps it in the existing absolute overlay.
10. Verify in browser — visually identical.

**Phase 4 — New layout components**
11. Build `BottomSheet.tsx` (mobile only, Vaul-based, 3 snap points, `modal={false}`, `dismissible={false}`)
12. Build `ContextualSidebar.tsx` (tablet/desktop, reads `showPreview` to switch content)
13. Build `MobileViewToggle.tsx` (replaces `MobileTabBar`, sets `activeView` in store)

**Phase 5 — SplitLayout rewrite**
14. Rewrite `SplitLayout.tsx` to branch on `useBreakpoint()` tier:
    - Mobile: `position: relative; overflow: hidden` container; two `position: absolute; inset: 0` children (map + preview) with `visibility` toggle; `BottomSheet` rendered outside the stack (fixed, portal)
    - Tablet: flex row — `ContextualSidebar` + split columns (map | preview) no resizer
    - Desktop: flex row — `ContextualSidebar` + split columns with resizer divider
15. Remove `MobileSidebar`, `DesktopSidebar`, `MobileTabBar` definitions from old files

**Phase 6 — Transitions and polish**
16. Add CSS `transition: transform` for sidebar content swap animation (slide left/right)
17. Add `map.resize()` coordination on layout changes
18. Touch target sizing: 44px minimum tap targets on mobile
19. Safe-area-inset padding on sheet and bottom elements

---

## Anti-Patterns

### Anti-Pattern 1: Using `display: none` on the Preview Column

**What people do:** Toggle `display: none / block` to hide/show the 3D preview, thinking it is equivalent to `visibility: hidden`.

**Why it's wrong:** `display: none` removes the element from the render tree. The browser destroys and recreates the WebGL context. React Three Fiber cannot survive this. The result is a permanently black canvas requiring a full page reload.

**Do this instead:** Always use `visibility: hidden` + `pointerEvents: none` on the container. The canvas stays alive, Three.js keeps its GPU state, and switching views is instant.

### Anti-Pattern 2: Duplicating `useIsMobile` Across Components

**What people do:** Each component that needs layout awareness copies its own `useIsMobile(768)` hook — as currently exists in both `SplitLayout.tsx` and `Sidebar.tsx`.

**Why it's wrong:** Two breakpoint values can drift independently. With three tiers, a boolean is insufficient. Three separate boolean checks for three tiers means six places that must agree on two threshold values.

**Do this instead:** Export one `useBreakpoint()` hook. All layout-branching components import it. Breakpoint values live in exactly one place and are also reflected in `index.css @theme`.

### Anti-Pattern 3: Control Components Owning Their Positioning

**What people do:** `Sidebar.tsx` and `PreviewSidebar.tsx` contain `position: fixed/absolute` wrappers around their content — both content AND layout in one component. The content cannot be reused in a different layout container.

**Why it's wrong:** On mobile the controls need to live inside Vaul's `Drawer.Content`. On desktop they live in a sidebar column. If a component positions itself, it can only live in one context.

**Do this instead:** Extract `MapSidebarContent` and `PreviewSidebarContent` as pure content components. The layout system (BottomSheet, ContextualSidebar) applies all positioning.

### Anti-Pattern 4: Mounting/Unmounting the Preview on Tab Switch

**What people do:** On mobile, wrap the preview view in `{activeView === 'preview' && <PreviewView />}` so it only mounts when visible.

**Why it's wrong:** This unmounts `PreviewCanvas` when switching to map view, destroying the WebGL context. The user returns to find a black screen.

**Do this instead:** Both views are always mounted. `visibility: hidden` hides the inactive one. `pointerEvents: none` prevents invisible interaction. MapLibre and R3F both stay alive.

### Anti-Pattern 5: Animating Layout with `width` or `height` Transitions

**What people do:** Animate a sidebar opening with `transition: width 0.3s ease`, causing the browser to recalculate layout on every animation frame.

**Why it's wrong:** Animating `width` or `height` triggers layout + paint on every frame. With a MapLibre map and a Three.js scene both rendering simultaneously, this causes visible frame drops on mid-range mobile devices.

**Do this instead:** Use `transform: translateX()` for slide-in animations (compositor thread only). Vaul uses `transform` internally for sheet dragging. The split-layout resizer drag is a forced exception (width change on user drag) but is not animated — it is direct and immediate, which is acceptable.

### Anti-Pattern 6: Sheet Snap State in `mapStore`

**What people do:** Put `sheetSnap` and other transient UI state directly in `mapStore` because it is globally accessible.

**Why it's wrong:** `mapStore` already has 64 fields covering domain state. Sheet snap height is ephemeral UI state that does not need persistence or coordination with app data. It pollutes the store and makes debugging harder.

**Do this instead:** Keep `sheetSnap` as local state inside `BottomSheet.tsx`. Elevate to `uiStore` only if another component needs to drive the snap programmatically (e.g., the Generate button auto-expanding the sheet on success).

---

## Scaling Considerations

This is a client-side tool. The relevant scaling concern is render performance on lower-powered mobile hardware.

| Concern | Approach |
|---------|---------|
| Animation on low-GPU mobile | Use `transform`-only animations. Avoid `width`/`height` transitions. Vaul handles sheet dragging on compositor thread. |
| Very small screens (<375px) | Use `dvh` units for snap points (`45dvh` not `45vh`) to handle iOS browser chrome. Test snap point pixel heights at iPhone SE size. |
| Tailwind class vs inline style | Replace inline styles with Tailwind classes where the value is static. Keep inline styles only for dynamic values (splitPercent %, snap pixel heights, visibility toggling). |
| MapLibre map resize | Call `map.resize()` after any layout change with a 150-200ms debounce to let CSS transitions settle before MapLibre re-renders tiles. |

---

## Sources

- Vaul snap points API: [vaul.emilkowal.ski/snap-points](https://vaul.emilkowal.ski/snap-points)
- Vaul GitHub (v1.1.2, Dec 2024, unmaintained note): [github.com/emilkowalski/vaul](https://github.com/emilkowalski/vaul)
- Tailwind v4 custom breakpoints via `@theme`: [tailwindcss.com/docs/responsive-design](https://tailwindcss.com/docs/responsive-design)
- CSS scroll snap for bottom sheets (native alternative reference): [viliket.github.io/posts/native-like-bottom-sheets-on-the-web](https://viliket.github.io/posts/native-like-bottom-sheets-on-the-web/)
- R3F canvas context loss on unmount (confirmed behavior): [github.com/pmndrs/react-three-fiber/discussions/1151](https://github.com/pmndrs/react-three-fiber/discussions/1151)
- `content-visibility: hidden` — Baseline 2024, WebGL interaction not documented: [developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/content-visibility](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/content-visibility)
- MapLibre GL JS `Map.resize()` API: [maplibre.org/maplibre-gl-js/docs/API/classes/Map/](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/)
- Motion library layout animations (sidebar pattern): [motion.dev/docs/react-layout-animations](https://motion.dev/docs/react-layout-animations)
- Existing codebase (HIGH confidence — direct inspection):
  - `src/components/Layout/SplitLayout.tsx`
  - `src/components/Sidebar/Sidebar.tsx`
  - `src/components/Preview/PreviewSidebar.tsx`
  - `src/components/Map/MapView.tsx`
  - `src/store/mapStore.ts`

---
*Architecture research for: MapMaker v1.2 Responsive UI*
*Researched: 2026-02-28*
