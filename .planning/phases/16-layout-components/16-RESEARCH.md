# Phase 16: Layout Components - Research

**Researched:** 2026-03-02
**Domain:** Mobile bottom sheet (vaul), view toggle button, touch gesture UX
**Confidence:** HIGH

## Summary

Phase 16 introduces the two primary mobile UI components: a draggable bottom sheet (using the already-decided `vaul` library) and a full-screen map/preview toggle button. These replace the current `MobileSidebar` (fixed-position, no drag) in `Sidebar.tsx` and the `MobileTabBar` (tab bar, visible only when `showPreview`) in `SplitLayout.tsx`.

The vaul library (`v1.1.2`) is already selected. It supports snap points via `snapPoints` prop (pixel strings or 0–1 fractions), `modal={false}` for non-blocking background interaction, `dismissible={false}` for an always-visible sheet, velocity-aware snap skipping (built-in, no configuration needed), and a `Drawer.Handle` component with a `[vaul-handle-hitarea]` CSS selector defaulting to 44×44px on mobile. Snap animation uses `cubic-bezier(0.32, 0.72, 0, 1)` at 500ms — this is vaul's built-in snap physics; no external spring library is needed for SHEET-04.

The key architecture challenge is the three-way touch-event conflict: vaul captures vertical drag, MapLibre captures pan/zoom, and R3F OrbitControls captures 3D orbit. At peek and half snap heights, the map pane sits below the sheet and must remain interactive (SHEET-03). The `modal={false}` prop on `Drawer.Root` is the primary mechanism — it removes the overlay's `pointer-events: none` from the background. There is a known bug (Issue #509) where controlled `open` prop + `modal={false}` incorrectly applies `pointer-events: none` to `document.body`. This was addressed in vaul v1.1.0 ("Improved non-modal drawers' body pointer event handling"), but needs validation on real iOS hardware (already noted as a blocker in STATE.md).

**Primary recommendation:** Install vaul, build `BottomSheet.tsx` as a mobile-only wrapper around `Drawer.Root` (always controlled-open with `dismissible={false}`, `modal={false}`, three snap points), and build `MobileViewToggle.tsx` as a floating button reading/writing `showPreview` from the Zustand store. Replace `MobileSidebar` and `MobileTabBar` in `Sidebar.tsx` and `SplitLayout.tsx` respectively.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SHEET-01 | User can drag between peek (~80px), half (~45vh), full (~88dvh) snap heights | `snapPoints={['80px', '45vh', '88dvh']}` — vaul accepts pixel strings and viewport units; or use window.innerHeight math to convert to fractions |
| SHEET-02 | Visible pill drag handle with ≥44px touch target | `<Drawer.Handle />` renders a pill; `[vaul-handle-hitarea]` CSS selector defaults to 44×44px on mobile; override min-height to guarantee 44px |
| SHEET-03 | Map visible and interactive at peek and half | `modal={false}` removes pointer-events block from the background; vaul v1.1.0 fixed controlled open + modal=false body pointer-events bug |
| SHEET-04 | Spring-like snap animation, not instant jump | vaul's built-in `cubic-bezier(0.32, 0.72, 0, 1)` at 500ms handles this — no additional animation library needed |
| SHEET-05 | Flick up/down jumps to next snap point (velocity-aware) | vaul velocity snapping is enabled by default; `snapToSequentialPoint` disables it — do NOT set that prop |
| LAYOUT-04 | Toggle button switches full-screen view between map and preview on mobile | Standalone `MobileViewToggle` component reading `showPreview` and `setShowPreview` from mapStore |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vaul | 1.1.2 | Bottom sheet with drag, snap points, modal=false | Already decided; only library with modal=false keeping R3F/MapLibre interactive behind sheet |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zustand | 5.0.3 (installed) | Store access for showPreview, deviceTier | Already in project; MobileViewToggle reads/writes store |
| tailwindcss v4 | installed | Utility classes for pill shape, touch target sizing | Already in project; prefer over inline styles for static layout |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| vaul | react-spring-bottom-sheet | More spring physics control, but larger bundle and not chosen |
| vaul | hand-rolled CSS drag with pointer events | Would need to re-implement velocity calc, snap logic, iOS Safari workarounds — vaul solves all of this |
| vaul | Base UI Drawer | Base UI is newer and feature-comparable but vaul is already decided |

**Installation:**
```bash
npm install vaul@1.1.2
```

## Architecture Patterns

### Recommended Project Structure
```
src/components/
├── BottomSheet/
│   ├── BottomSheet.tsx          # Drawer.Root wrapper, snap logic
│   └── __tests__/
│       └── BottomSheet.test.tsx
├── MobileViewToggle/
│   └── MobileViewToggle.tsx     # Floating toggle button
└── Sidebar/
    └── Sidebar.tsx              # Updated: renders BottomSheet on mobile instead of MobileSidebar
```

`SplitLayout.tsx` gets `MobileTabBar` removed (replaced by `MobileViewToggle`).

### Pattern 1: Always-Open Controlled Sheet (dismissible=false + modal=false)

**What:** The sheet is always visible on mobile, never dismissed. Controlled via `open={true}` permanently.
**When to use:** Persistent UI overlays like this one (map controls always accessible).

```tsx
// Source: vaul.emilkowal.ski/api + github.com/emilkowalski/vaul/issues/184
import { Drawer } from 'vaul';
import { useState } from 'react';

const SNAP_POINTS = ['80px', '45vh', '88dvh'] as const;

export function BottomSheet({ children }: { children: React.ReactNode }) {
  const [snap, setSnap] = useState<string | number | null>('80px');

  return (
    <Drawer.Root
      open={true}
      modal={false}
      dismissible={false}
      snapPoints={SNAP_POINTS}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
      // fadeFromIndex: fade overlay starting from last snap point
      fadeFromIndex={2}
    >
      <Drawer.Portal>
        {/* Overlay only visible at full snap; at peek/half map is interactive */}
        <Drawer.Overlay style={{ pointerEvents: 'none' }} />
        <Drawer.Content>
          <Drawer.Handle />
          {children}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
```

**Critical:** Do NOT include `<Drawer.Trigger>` when using `open={true}` permanently.

### Pattern 2: Snap Point Values — Pixels vs. Fractions

Vaul accepts snap point values as:
- **Pixel strings** (`'80px'`) — absolute height, good for peek position
- **Number fractions 0–1** (`0.45`) — fraction of viewport height, but this is `vh` not `dvh`
- **The value `1`** — shorthand for full height

For `45vh` and `88dvh` targets, the safest approach is to pre-compute pixel values using `window.innerHeight` (which accounts for dynamic viewport on iOS), or express them as fractions knowing vaul uses window height internally. **Do not rely on vaul parsing CSS viewport units as strings** — only `px` strings and 0–1 fractions and `1` are confirmed documented values.

```tsx
// Safe approach: compute from window.innerHeight at mount
function getSnapPoints() {
  const h = window.innerHeight;
  return [
    80,                        // peek: 80px fixed
    Math.round(h * 0.45),     // half: ~45vh in px
    Math.round(h * 0.88),     // full: ~88dvh in px — approximation
  ] as const;
}
```

Alternatively, use vaul's confirmed support for `'148px'`, `'355px'`, `1` pattern from the snap-points docs.

### Pattern 3: Drag Handle with 44px Touch Target

```tsx
// Source: WebSearch — vaul-handle-hitarea selector
<Drawer.Handle
  style={{
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    margin: '10px auto 0',
  }}
/>
```

The `[vaul-handle-hitarea]` pseudo-element is an invisible expanded touch zone around the visible pill. It defaults to 44px tall on mobile. Override with:
```css
[vaul-handle-hitarea] {
  min-height: 44px;  /* SHEET-02 compliance */
}
```

The handle also supports tap-to-cycle (tapping cycles through snap points) and double-tap-to-close (double tapping closes if `dismissible` is true). With `dismissible={false}`, double-tap cycling is the behavior.

### Pattern 4: MobileViewToggle — Floating Action Button

```tsx
// Reads showPreview from store; renders only on mobile
import { useMapStore } from '../../store/mapStore';
import { useBreakpoint } from '../../hooks/useBreakpoint';

export function MobileViewToggle() {
  const tier = useBreakpoint();
  const showPreview = useMapStore((s) => s.showPreview);
  const setShowPreview = useMapStore((s) => s.setShowPreview);

  if (tier !== 'mobile') return null;

  return (
    <button
      onClick={() => setShowPreview(!showPreview)}
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 20,
        // ... styling
      }}
    >
      {showPreview ? 'Map' : '3D Preview'}
    </button>
  );
}
```

This replaces `MobileTabBar` in `SplitLayout.tsx`. The toggle button must only appear when `showPreview` has been activated (i.e., a model has been generated), or always — decision is needed. Looking at existing `MobileTabBar`: it returns `null` if `!showPreview`, so the toggle only shows after a model is generated.

### Pattern 5: Sidebar.tsx Integration

The current `MobileSidebar` is a fixed div at `bottom: 0`. Replace it entirely with `<BottomSheet>`:

```tsx
// Sidebar.tsx — updated mobile branch
export function Sidebar() {
  const tier = useBreakpoint();
  if (tier !== 'mobile') return <DesktopSidebar />;
  return (
    <BottomSheet>
      <SidebarContent />
    </BottomSheet>
  );
}
```

DesktopSidebar is unchanged for Phase 16. Phase 17 handles tablet/desktop sidebar restructure.

### Anti-Patterns to Avoid

- **Setting `snapToSequentialPoint`:** This disables velocity-based flick behavior, violating SHEET-05. Never set it.
- **Setting `dismissible={true}` (default):** The sheet would close when dragged below peek position, removing it from the screen. Must be `false`.
- **Using `display: none` to hide the map behind the sheet:** Project rule — always use `visibility: hidden` to preserve R3F WebGL context.
- **Rendering `Drawer.Overlay` with `pointer-events: auto` at peek/half:** The overlay would intercept map touches. Use `pointer-events: none` on the overlay or rely on vaul's `modal={false}` removing the overlay's interception entirely.
- **Nesting vaul inside another vaul:** Not needed here; single sheet instance.
- **String viewport units as snap points** (`'45vh'`, `'88dvh'`): Not documented as supported by vaul — use computed pixel values or fractional numbers.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag gesture with velocity | Custom pointer event handler | vaul | Velocity calc, spring easing, iOS Safari touch intercept, Android Chrome differences — hundreds of edge cases |
| Snap animation | CSS transition manually | vaul built-in | vaul's `cubic-bezier(0.32, 0.72, 0.0, 1)` + 500ms matches iOS sheet exactly per author's blog post |
| Touch target expansion | Pseudo-element hacks | `[vaul-handle-hitarea]` selector | vaul ships this as a documented pattern |
| Scroll inside sheet vs. drag detection | Manual gesture disambiguation | vaul | vaul handles the critical "is this a scroll or a drag?" question internally |

**Key insight:** vaul was built specifically to replicate the iOS Maps bottom sheet experience. Every hard problem (velocity, spring, scroll disambiguation, iOS Safari touch quirks) is already solved internally. The only integration work is configuring snap points and ensuring `modal={false}` keeps the map interactive.

## Common Pitfalls

### Pitfall 1: `modal={false}` + controlled `open` applying `pointer-events: none` to body
**What goes wrong:** When `open` is controlled (not via `Drawer.Trigger`) and `modal={false}`, vaul < 1.1.0 incorrectly applied `pointer-events: none` to `document.body`, blocking all map interaction.
**Why it happens:** Internal state management bug in `useControllableState` in older vaul versions.
**How to avoid:** Use vaul 1.1.2 (already decided). Verify in browser dev tools that `body` has no `pointer-events: none` style when the sheet is open.
**Warning signs:** Map tiles not responding to touch/click despite `modal={false}`.

### Pitfall 2: Vaul overlay blocking map at peek/half
**What goes wrong:** `Drawer.Overlay` by default sits behind the sheet but in front of the map, capturing pointer events even with `modal={false}`.
**Why it happens:** The overlay's z-index and pointer-events interact with `modal` prop in complex ways.
**How to avoid:** Either (a) omit `Drawer.Overlay` entirely (no dimming backdrop), or (b) render it with `style={{ pointerEvents: 'none' }}` so it only dims visually without blocking touches.
**Warning signs:** Map zoom/pan only works when sheet is at full height (not at peek or half).

### Pitfall 3: iOS hardware validation required
**What goes wrong:** Chrome DevTools device emulation does NOT enforce `touch-action` the same way iOS Safari does. A sheet that appears to coexist with the map in DevTools may conflict on real hardware.
**Why it happens:** iOS enforces `touch-action` strictly; Chrome emulation is approximate.
**How to avoid:** Note as a validation step — must test on physical iPhone. This is already documented as a blocker in STATE.md.
**Warning signs:** Map pan broken on device but not in DevTools emulation.

### Pitfall 4: Snap point values — `vh` vs `dvh` vs fraction
**What goes wrong:** Using CSS unit strings like `'45vh'` that vaul does not parse.
**Why it happens:** vaul documentation shows pixel strings and numbers; viewport unit strings are not documented.
**How to avoid:** Compute snap points in pixels from `window.innerHeight` at component mount. Use a `useEffect` + `useState` or memo to handle window resize.
**Warning signs:** Sheet snaps to unexpected positions or ignores snap points.

### Pitfall 5: Focus trap with `dismissible={false}` + `modal={false}`
**What goes wrong:** When the sheet is always open and non-dismissible, keyboard focus gets trapped inside the drawer (GitHub Issue #497).
**Why it happens:** vaul inherits Radix Dialog's focus management; with `modal={false}` the dialog still traps focus in some configurations.
**How to avoid:** This is a known open issue in vaul. For Phase 16, the app is touch-first (mobile). Tab key navigation in a mobile sheet is low-risk. Monitor but don't block phase on this.
**Warning signs:** Tab key cannot navigate from sheet content to map controls on desktop-sized emulation.

### Pitfall 6: Double-tap on handle closes with `dismissible={false}`
**What goes wrong:** Double-tapping the `Drawer.Handle` closes the drawer even when `dismissible={false}` (GitHub Issue #362).
**Why it happens:** The handle has built-in double-tap-to-close behavior; `dismissible` only governs drag/overlay-click dismiss.
**How to avoid:** Accept as a known quirk for now, or set `handleOnly={false}` (already the default) and add a custom `onDoubleClick` that calls `setActiveSnapPoint('80px')` to snap back to peek instead of closing. The sheet being closed would leave the mobile app with no controls — a bad UX failure.
**Warning signs:** Sheet vanishes on double-tap; no way to reopen it (since there is no Trigger).

## Code Examples

Verified patterns from official sources:

### Full BottomSheet component skeleton
```tsx
// Source: vaul.emilkowal.ski/snap-points + vaul.emilkowal.ski/api
import { useState } from 'react';
import { Drawer } from 'vaul';

const PEEK_PX = 80;

export function BottomSheet({ children }: { children: React.ReactNode }) {
  // Compute snap points from window height at first render
  // Using 'number' type (0–1 fractions) + 1 for full
  const snapPoints = [PEEK_PX, 0.45, 1] as const;
  // Note: vaul uses window.innerHeight internally for fraction math
  // 0.45 ≈ 45vh, 1 = full height (≈88dvh not guaranteed — iOS chrome may differ)

  const [snap, setSnap] = useState<number | string | null>(PEEK_PX);

  return (
    <Drawer.Root
      open={true}
      modal={false}
      dismissible={false}
      snapPoints={snapPoints}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
      fadeFromIndex={2}
    >
      <Drawer.Portal>
        {/* No Drawer.Overlay, or render with pointerEvents: none */}
        <Drawer.Content
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 10,
            backgroundColor: 'rgba(17, 24, 39, 0.95)',
            borderRadius: '14px 14px 0 0',
            paddingBottom: 'max(8px, var(--safe-bottom))',
          }}
        >
          <Drawer.Handle /> {/* pill + 44px hitarea */}
          <div style={{ overflowY: 'auto', /* height calc from snap */ }}>
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
```

### MobileViewToggle (replaces MobileTabBar)
```tsx
// Source: project pattern — reads showPreview from mapStore
import { useMapStore } from '../../store/mapStore';
import { useBreakpoint } from '../../hooks/useBreakpoint';

export function MobileViewToggle() {
  const tier = useBreakpoint();
  const showPreview = useMapStore((s) => s.showPreview);
  const setShowPreview = useMapStore((s) => s.setShowPreview);

  // Only render on mobile after a model exists (matches current MobileTabBar behavior)
  if (tier !== 'mobile' || !showPreview) return null;

  return (
    <button
      onClick={() => setShowPreview(!showPreview)}
      aria-label={showPreview ? 'Show map' : 'Show 3D preview'}
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 20,
        minHeight: 44,
        minWidth: 44,
        // ... styling
      }}
    >
      {showPreview ? 'Map' : '3D Preview'}
    </button>
  );
}
```

**Important:** `MobileViewToggle` must be placed inside the map pane (inside the `visibility: visible/hidden` managed div in `SplitLayout.tsx`) or at the app root level, not inside `BottomSheet`. A toggle button inside the sheet would scroll off screen when sheet is at peek position.

### Installing vaul
```bash
npm install vaul@1.1.2
```

vaul v1.1.2 is already listed as the decided version in STATE.md and is compatible with React 19 (added in v1.1.1).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Fixed-position MobileSidebar div | vaul Drawer.Root with snap points | Phase 16 | Drag gesture, spring animation, velocity flick — all handled by vaul |
| MobileTabBar tab switcher | MobileViewToggle floating button | Phase 16 | LAYOUT-04 — full-screen view with floating toggle rather than tab bar |
| `modal={true}` overlay blocking map | `modal={false}` non-blocking | Phase 16 | SHEET-03 — map remains interactive at peek/half |

**Deprecated/outdated:**
- `MobileSidebar` in `Sidebar.tsx`: Replaced by `BottomSheet`. The fixed-position div approach had no drag capability.
- `MobileTabBar` in `SplitLayout.tsx`: Replaced by `MobileViewToggle`. Tab bar consumed vertical space; floating button does not.

## Open Questions

1. **`'88dvh'` as a snap point string — does vaul parse it?**
   - What we know: vaul docs show pixel strings and 0–1 fractions. The `1` shorthand is full height.
   - What's unclear: Whether vaul parses `'88dvh'` as a CSS unit string internally.
   - Recommendation: Use `0.88` (fraction) or compute from `window.innerHeight * 0.88`. The value `1` snaps to `window.innerHeight` which on iOS Safari may not equal `100dvh` — prefer `0.88` fraction and accept it as "approximately 88dvh".

2. **Double-tap handle closes sheet — is it a real risk?**
   - What we know: GitHub Issue #362 confirms double-tap-to-close fires even with `dismissible={false}`.
   - What's unclear: Whether vaul 1.1.2 fixed this.
   - Recommendation: During implementation, test double-tap. If it closes the sheet, add an `onOpenChange` callback that immediately calls `setOpen(true)` or calls `setActiveSnapPoint('80px')` to snap back to peek. This is a safety net since there's no trigger to reopen.

3. **Content height inside sheet at different snap points**
   - What we know: vaul's `Drawer.Content` height changes as the user drags. The content div inside must be scrollable.
   - What's unclear: How to compute the available content height dynamically (sheet height minus handle height minus safe area).
   - Recommendation: Use `flex: 1; min-height: 0; overflow-y: auto` on the content wrapper, and let the browser handle it. Avoid hard-coding a `maxHeight` on inner content.

4. **MobileViewToggle positioning — inside sheet or outside?**
   - What we know: The toggle needs to be visible when viewing the map (not just preview). If it's inside the sheet content, it would not be visible at peek height.
   - Recommendation: Render `MobileViewToggle` as a sibling to `MapView` inside the map pane div in `SplitLayout.tsx` (or in `App.tsx`), not inside `BottomSheet`. This makes it always visible on the map layer regardless of sheet height.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.0 + @testing-library/react 16 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SHEET-01 | Snap points array contains peek/half/full values | unit | `npx vitest run src/components/BottomSheet/__tests__/BottomSheet.test.tsx` | ❌ Wave 0 |
| SHEET-02 | Drawer.Handle renders (pill + 44px target) | unit | same file | ❌ Wave 0 |
| SHEET-03 | modal={false} prop is set on Drawer.Root | unit | same file | ❌ Wave 0 |
| SHEET-04 | Spring animation is built into vaul (no test needed) | manual-only | N/A — vaul internals | N/A |
| SHEET-05 | snapToSequentialPoint is NOT set | unit | same file | ❌ Wave 0 |
| LAYOUT-04 | MobileViewToggle renders button when showPreview=true + mobile | unit | `npx vitest run src/components/MobileViewToggle/__tests__/MobileViewToggle.test.tsx` | ❌ Wave 0 |

**Manual-only justification for SHEET-04:** Spring animation quality cannot be unit-tested — it requires visual inspection. The physics are internal to vaul and not configurable. Verify during UAT by dragging and releasing at mid-points to confirm smooth ease (not instant jump).

**Manual-only items also requiring device validation:** SHEET-03 map interactivity (must test on real iOS), SHEET-05 flick velocity (must test on real touch device).

### Sampling Rate
- **Per task commit:** `npx vitest run`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before verification

### Wave 0 Gaps
- [ ] `src/components/BottomSheet/__tests__/BottomSheet.test.tsx` — covers SHEET-01, SHEET-02, SHEET-03, SHEET-05
- [ ] `src/components/MobileViewToggle/__tests__/MobileViewToggle.test.tsx` — covers LAYOUT-04

*(No framework install needed — vitest already configured)*

## Sources

### Primary (HIGH confidence)
- `vaul.emilkowal.ski/api` — Full Drawer.Root props table (snapPoints, modal, dismissible, handleOnly, snapToSequentialPoint, activeSnapPoint, setActiveSnapPoint)
- `vaul.emilkowal.ski/snap-points` — Snap point configuration, velocity behavior, sequential snap prop, non-modal + snap combination
- `emilkowal.ski/ui/building-a-drawer-component` — Internal animation: `cubic-bezier(0.32, 0.72, 0, 1)` at 500ms, translateY-based drag, velocity momentum
- `github.com/emilkowalski/vaul/releases` — v1.1.0: fixed non-modal body pointer events; v1.1.1: React 19 peer dep; v1.1.2: peer dep update

### Secondary (MEDIUM confidence)
- `github.com/emilkowalski/vaul/issues/184` — Confirmed `dismissible={false}` + `snapPoints` = always-open sheet (maintainer closed as completed)
- `github.com/emilkowalski/vaul/issues/509` — `modal={false}` + controlled `open` pointer-events bug; fixed in v1.1.0
- WebSearch — `[vaul-handle-hitarea]` CSS selector defaults to 44×44px on mobile

### Tertiary (LOW confidence)
- `github.com/emilkowalski/vaul/issues/362` — Double-tap handle closes despite `dismissible={false}` — version of fix unclear
- `github.com/emilkowalski/vaul/issues/497` — Focus trap with always-open + modal=false — open issue, resolution unclear
- `github.com/emilkowalski/vaul/issues/349` — iOS snap + modal=false + scroll issues; fix in PR #424 (v1.1.0 candidate)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — vaul is pre-decided; peer deps and version confirmed
- Architecture: HIGH — snap points, modal=false, dismissible=false patterns confirmed from official docs
- Pitfalls: MEDIUM — known GitHub issues documented; some fix status unclear (v1.1.0 vs open)
- iOS hardware validation: LOW — cannot be verified without physical device; noted as blocker

**Research date:** 2026-03-02
**Valid until:** 2026-04-02 (vaul is in low-maintenance mode per GitHub; API stable)
