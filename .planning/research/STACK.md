# Stack Research

**Domain:** Responsive UI — three-tier layout, bottom sheet with snap heights, touch gestures, view transition animations
**Researched:** 2026-02-28
**Confidence:** HIGH for vaul + motion (verified via npm + official docs); HIGH for Tailwind v4 breakpoints (verified via official docs); MEDIUM for CSS-only animation approach (verified via MDN + Tailwind docs, but requires integration validation)

---

> **Scope note:** This document covers ONLY the new stack additions for the v1.2 milestone.
> The existing validated stack (React 19, Three.js R3F, Zustand, Vite 6, Vitest, Tailwind CSS v4,
> MapLibre GL JS 5, react-resizable-panels, terra-draw, pmtiles, manifold-3d, three-bvh-csg)
> is not re-researched here.

---

## Recommended Stack — New Additions

### 1. Bottom Sheet with Snap Points: vaul

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| `vaul` | `^1.1.2` | Unstyled drawer/bottom sheet with iOS-style snap points, drag gesture, keyboard dismiss | The correct tool for a peek/half/full snap sheet. Built by Emil Kowalski (shadcn/ui collaborator). Used in production by Linear and Vercel. React 19 explicitly in peer dependencies (`^16.8 || ^17.0 || ^18.0 || ^19.0.0`). Ships a `Drawer.Root` with `snapPoints` array (pixel strings or 0–1 numbers), `activeSnapPoint`/`setActiveSnapPoint` for controlled state, `modal={false}` for non-blocking overlay that doesn't prevent R3F canvas interaction, and `dismissible` prop. No CSS-in-JS, no peer framework required beyond React. ~7 KB. |

**Why NOT a custom hook + CSS:** A bottom sheet with real snap physics (velocity-based snap, overscroll elasticity, keyboard repositioning on iOS) requires ~300+ lines of non-trivial pointer/touch event math to match native feel. Vaul handles all of this correctly. Custom implementations consistently get iOS momentum scrolling wrong.

**Why NOT react-spring-bottom-sheet:** Last commit 2022, unmaintained. Peer dependency on `react-spring` v9 which conflicts with `motion` (our animation library). No snap points — only open/closed.

**Why NOT gorhom/react-native-bottom-sheet:** React Native only. Not applicable to web.

**Critical integration note for MapMaker:** Use `modal={false}` on `Drawer.Root` so the R3F WebGL canvas (3D preview) remains interactive while the sheet is open. Without this, vaul installs a pointer-events blocker on the document that prevents Three.js orbit controls.

**Snap point configuration for MapMaker:**
```typescript
const SNAP_POINTS = ['80px', '45%', 1] as const;
// peek: 80px = just the handle + location name visible
// half: 45% = controls readable, map still visible above
// full: 1 = full height, controls fill screen
```

**API pattern:**
```typescript
import { Drawer } from 'vaul';

const [snap, setSnap] = useState<number | string | null>('80px');

<Drawer.Root
  snapPoints={SNAP_POINTS}
  activeSnapPoint={snap}
  setActiveSnapPoint={setSnap}
  modal={false}
  dismissible={false}
>
  <Drawer.Portal>
    <Drawer.Content>
      <Drawer.Handle />
      {/* controls content */}
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>
```

**Source:** [vaul npm](https://www.npmjs.com/package/vaul) version 1.1.2 confirmed; [vaul snap points docs](https://vaul.emilkowal.ski/snap-points) confirmed API; React 19 peer dependency confirmed via `npm view vaul peerDependencies`.

---

### 2. View Transition Animations: motion (formerly Framer Motion)

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| `motion` | `^12.34.3` | Animate layout changes, tab switches, sidebar slide-in/out, loading states, micro-interactions | `motion` is framer-motion rebranded and independent. The `motion` npm package is identical to `framer-motion` — both point to the same code. React 19 is in peer dependencies (`^18.0.0 || ^19.0.0`). The `motion` package name is preferred going forward. Provides `<motion.div>` with `animate`, `initial`, `exit`, `layout` props. `AnimatePresence` enables exit animations. `layout` prop handles panel resize and reflow animations automatically. |

**Why NOT CSS transitions only:** CSS transitions work for simple opacity/translate but cannot:
  - Animate layout changes (sidebar becoming persistent vs. overlay) — requires `layout` animations
  - Handle conditional rendering exit animations (element removed from DOM before CSS transition plays)
  - Coordinate enter/exit sequences across multiple elements (tab bar, panel, preview)

  `AnimatePresence` + `layout` prop solves all three without custom JavaScript.

**Why NOT React View Transitions API (`<ViewTransition>`):** The React team announced `<ViewTransition>` as experimental in April 2025 (react@canary only). It is NOT stable in React 19 production. Browser support is Chrome 111+ / Safari 18+ / Firefox 133+, but the React API for it remains experimental with design changes expected. Defer until React 20 stable.

**Why NOT CSS `@starting-style` + `transition-behavior: discrete`:** A valid pure-CSS approach for simple enter/exit animations, but requires careful manual orchestration across the three breakpoints. `motion` provides the same output with less code and handles the React reconciliation lifecycle automatically.

**Use cases in MapMaker v1.2:**
```typescript
import { motion, AnimatePresence } from 'motion/react';

// Sidebar slide animation
<AnimatePresence>
  {isOpen && (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
    >
      {/* sidebar content */}
    </motion.div>
  )}
</AnimatePresence>

// Tab switch content fade
<motion.div
  key={activeTab}
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ duration: 0.15 }}
>
  {activeTabContent}
</motion.div>

// Layout-aware panel resize (desktop split → preview occupies panel)
<motion.div layout className="...">
  {children}
</motion.div>
```

**Source:** [motion npm](https://www.npmjs.com/package/motion) version 12.34.3 confirmed; peer dependencies confirmed via `npm view motion peerDependencies`; rebranding confirmed at [motion.dev/blog](https://motion.dev/blog/framer-motion-is-now-independent-introducing-motion).

---

### 3. Breakpoint System: Tailwind CSS v4 `@theme` variables (no new library)

No new library needed. Tailwind CSS v4 (already in the project as `@tailwindcss/vite@^4.2.1`) supports custom breakpoints via CSS-first `@theme` configuration.

**Current state:** The app uses a hardcoded `768px` binary mobile/desktop check (`useIsMobile` hook with `window.matchMedia`) scattered in `SplitLayout.tsx` and `Sidebar.tsx`. Three-tier layout requires three named breakpoints.

**Recommended breakpoints for MapMaker:**

```css
/* in src/index.css, inside @theme block */
@import "tailwindcss";

@theme {
  --breakpoint-sm: 480px;   /* large phones landscape */
  --breakpoint-md: 768px;   /* tablet portrait */
  --breakpoint-lg: 1024px;  /* tablet landscape / small desktop */
  --breakpoint-xl: 1280px;  /* desktop */
}
```

Then in components:
```tsx
// mobile-first, class-based — prefer this over inline style
<div className="flex-col md:flex-row lg:flex-row">
  {/* stacks on mobile, side-by-side on tablet+ */}
</div>
```

**`useBreakpoint` hook to replace scattered `useIsMobile`:**
```typescript
// src/hooks/useBreakpoint.ts
// No library needed — matchMedia is built in
type Breakpoint = 'mobile' | 'tablet' | 'desktop';

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(() => {
    if (window.innerWidth >= 1024) return 'desktop';
    if (window.innerWidth >= 768) return 'tablet';
    return 'mobile';
  });

  useEffect(() => {
    const tablet = window.matchMedia('(min-width: 768px)');
    const desktop = window.matchMedia('(min-width: 1024px)');
    const update = () => {
      if (desktop.matches) setBp('desktop');
      else if (tablet.matches) setBp('tablet');
      else setBp('mobile');
    };
    tablet.addEventListener('change', update);
    desktop.addEventListener('change', update);
    return () => {
      tablet.removeEventListener('change', update);
      desktop.removeEventListener('change', update);
    };
  }, []);

  return bp;
}
```

**Why NOT `react-responsive`:** 3 KB library that wraps the same `matchMedia` API. Adds a dependency for logic we can write in 25 lines. Avoid.

**Why NOT `usehooks-ts` `useMediaQuery`:** Another wrapper library. Zero value over a direct matchMedia hook for this use case.

**Source:** [Tailwind CSS v4 responsive design docs](https://tailwindcss.com/docs/responsive-design) — confirmed `--breakpoint-*` theme variables; [Tailwind v4 breakpoints guide](https://bordermedia.org/blog/tailwind-css-4-breakpoint-override) — confirmed CSS-first override syntax.

---

### 4. Touch-Optimized Interactions: CSS + Tailwind (no new library)

Touch optimization for controls (larger tap targets, better spacing) and the view toggle (tab bar) requires NO additional library. Tailwind utility classes cover all cases:

**Touch target sizing:**
```tsx
// Minimum 44px touch targets (Apple HIG recommendation)
<button className="min-h-[44px] min-w-[44px] px-4 py-3 ...">
```

**Touch-specific Tailwind utilities in v4 (built-in):**
- `touch-manipulation` — disables double-tap zoom, enables fast tap
- `select-none` — prevents text selection during swipe
- `active:scale-95` — tactile feedback on tap
- `cursor-pointer` on interactive elements for hybrid devices

**Safe area insets (already partially implemented, should be formalized):**
```css
/* Tailwind v4 CSS variable pattern */
padding-bottom: env(safe-area-inset-bottom, 8px);
```

Tailwind v4 exposes `pb-safe` via the `@supports` block pattern. Define once in `@theme`:
```css
@theme {
  --spacing-safe-bottom: env(safe-area-inset-bottom, 0px);
}
```

**Why NOT `@use-gesture/react`:** `@use-gesture/react` is powerful for custom drag/fling/pinch gestures, but vaul handles all gesture logic for the bottom sheet. The tab bar toggle uses simple click/tap — no library needed. The only remaining gesture is the split-panel drag handle (desktop), which already works with pointer events in the existing code. Adding `@use-gesture` would be over-engineering.

**Exception:** If a custom swipe-to-switch gesture between map/preview tabs is desired on mobile (swipe left/right to change tab without tapping the tab bar), `@use-gesture/react@10.3.1` can be added at that point. Do not add it speculatively.

---

## Installation

```bash
# Bottom sheet with snap points
npm install vaul

# Animation library (if not already installed)
npm install motion
```

No other dependencies needed. Breakpoints and touch optimization are handled by existing Tailwind CSS v4 and custom hooks.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `vaul` | CSS scroll-snap bottom sheet (pure CSS) | If the project had zero tolerance for JS dependencies. CSS scroll-snap sheets work but lose velocity-based snapping and iOS keyboard repositioning. Vaul's modal={false} is also a critical blocker for CSS-only approaches — CSS cannot make the R3F canvas interactive through a scroll-snap overlay. |
| `vaul` | `@radix-ui/react-dialog` + custom sheet | If you need a modal dialog AND a bottom sheet in the same UI. Vaul is a drawer, not a dialog. For a future "confirm export" modal, Radix Dialog would be appropriate. Do not use vaul for dialogs. |
| `motion` | CSS transitions + Tailwind `transition-*` classes | For simple single-property animations (opacity fade, translate in/out that don't require exit). Use CSS for things like hover states and loading spinner rotations. Use `motion` only when: (a) exit animations are needed, (b) layout changes need coordinating, or (c) spring physics are desired. |
| `motion` | React View Transitions API | When React 19 stable adds `<ViewTransition>`. Not ready in Feb 2026 — API still experimental and canary-only. |
| `useBreakpoint` custom hook | `react-responsive` npm | Only if the team wants to avoid writing and maintaining the hook themselves. The hook is 25 lines and has no edge cases in this CSR-only app. |
| `@use-gesture/react` | Pointer events directly on tab bar | If a swipe-to-switch gesture between map/preview is added to the mobile tab bar. Do not add upfront. |

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `react-spring-bottom-sheet` | Unmaintained since 2022, peer dependency on react-spring v9 which conflicts with motion | `vaul` |
| `framer-motion` | Renamed to `motion` — `framer-motion` npm still works but is the old package name; prefer `motion` for new installs | `motion` |
| `@use-gesture/react` (upfront) | Vaul already handles all bottom sheet gestures. Tab bar works with onClick. Only add if swipe-tab gesture is explicitly in scope. | Native pointer events for the split handle; vaul gestures for the sheet |
| `tailwindcss-animate` | Deprecated for Tailwind v4 projects. Replaced by `tw-animate-css`. However, neither is needed here — motion handles enter/exit animations. | `motion` for enter/exit; Tailwind `transition-*` utilities for hover/focus states |
| `react-spring` | Adds ~50 KB for animation physics that `motion` already provides | `motion` |
| `headlessui` | Radix primitives are lighter and better maintained; dialog/popover primitives from headlessui conflict with vaul's focus management | `vaul` for bottom sheet; `@radix-ui/react-dialog` if a modal dialog is ever needed |
| `@radix-ui/react-dialog` | Not needed for v1.2. No modal dialogs in scope. | — |
| Floating UI / Popper.js | No floating dropdowns or tooltips in scope for v1.2 | — |
| `react-responsive` | Wraps `matchMedia` in a 3 KB library we can implement in 25 lines | Custom `useBreakpoint` hook |

## Stack Patterns by Variant

**If building the mobile bottom sheet:**
- Use `vaul` with `modal={false}`, `dismissible={false}`, `snapPoints={['80px', '45%', 1]}`
- Store `activeSnapPoint` in Zustand (not local state) so other components react to sheet height changes
- Set `snapToSequentialPoint={true}` so users can't fling past the half-snap to full immediately

**If building desktop persistent sidebar:**
- No vaul — sidebar is a CSS flex column at fixed width
- Use `motion.div` with `layout` prop on the container so the map/preview panels smoothly resize when sidebar appears/disappears
- Width: `280px` fixed; `lg:w-[280px]` in Tailwind

**If building the mobile view toggle (map ↔ preview):**
- Use `motion.div` with `key={activeTab}` + `AnimatePresence` for a cross-fade on content swap
- Tab bar itself uses Tailwind `transition-colors` + `active:scale-95` — no motion needed for the buttons themselves

**If adding loading states and micro-interactions:**
- Spinner: Tailwind `animate-spin`
- Progress pulse: Tailwind `animate-pulse`
- Generate button in-progress state: `motion` scale + opacity (connects the button to mesh generation status in Zustand)
- Stale indicator banner: `motion` slide-down from top — 150ms ease-out

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `vaul@1.1.2` | React 19, React DOM 19 | Explicitly listed in peerDependencies. Tested against React 19 rc since v1.1.1. |
| `motion@12.34.3` | React 18, React 19 | Peer dependency: `react: "^18.0.0 || ^19.0.0"`. Confirmed via `npm view motion peerDependencies`. |
| `vaul@1.1.2` | `react-resizable-panels@4.6.5` | No overlap — vaul is bottom-anchored on mobile; react-resizable-panels handles desktop split. No z-index or event conflicts expected. |
| `motion@12.34.3` | R3F (`@react-three/fiber@9.5.0`) | motion animates DOM elements; R3F animates a WebGL canvas. No conflict. R3F's own animation loop (`useFrame`) is separate from motion's. |
| `vaul@1.1.2` | MapLibre GL JS / R3F canvas | With `modal={false}`, vaul does NOT intercept pointer events outside the sheet. MapLibre pan/zoom and R3F orbit controls remain functional while the sheet is open. Verified from vaul's `modal` prop docs. |

## Sources

- [vaul npm registry](https://www.npmjs.com/package/vaul) — version 1.1.2, React 19 peer dependency (HIGH confidence)
- [vaul snap points documentation](https://vaul.emilkowal.ski/snap-points) — `snapPoints`, `activeSnapPoint`, `setActiveSnapPoint` API (HIGH confidence, official docs)
- [vaul API reference](https://vaul.emilkowal.ski/api) — `modal`, `dismissible`, `direction`, `snapToSequentialPoint` props (HIGH confidence, official docs)
- [motion npm registry](https://www.npmjs.com/package/motion) — version 12.34.3, React 19 peer dependency (HIGH confidence)
- [motion rebranding announcement](https://motion.dev/blog/framer-motion-is-now-independent-introducing-motion) — confirmed `motion` is framer-motion renamed (HIGH confidence, official blog)
- [Tailwind CSS v4 responsive design docs](https://tailwindcss.com/docs/responsive-design) — `--breakpoint-*` custom theme variables (HIGH confidence, official docs)
- [Tailwind v4 breakpoints override guide](https://bordermedia.org/blog/tailwind-css-4-breakpoint-override) — CSS-first `@theme` override syntax (MEDIUM confidence, third-party verified against official docs)
- [React ViewTransition labs post](https://react.dev/blog/2025/04/23/react-labs-view-transitions-activity-and-more) — confirmed experimental/canary status (HIGH confidence, official React blog)
- [@use-gesture/react npm](https://www.npmjs.com/package/@use-gesture/react) — version 10.3.1, React 16+ compatible (HIGH confidence, npm)

---
*Stack research for: MapMaker v1.2 — Responsive UI (bottom sheet, breakpoints, animations, touch)*
*Researched: 2026-02-28*
