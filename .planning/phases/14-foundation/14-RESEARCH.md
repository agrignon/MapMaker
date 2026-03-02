# Phase 14: Foundation - Research

**Researched:** 2026-03-01
**Domain:** Responsive breakpoint infrastructure, CSS safe area insets, Zustand store extension
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Width-only detection using matchMedia at 768px and 1024px breakpoints
- Three tiers: 'mobile' (<768px), 'tablet' (768-1023px), 'desktop' (1024px+)
- No device sniffing, no touch capability detection, no user-agent checks
- A narrow desktop browser window (e.g., 600px) gets mobile layout — breakpoints are law
- An iPad in landscape (1024px+) gets desktop layout — correct, it has the screen real estate
- Support all four safe area insets: top, bottom, left, right
- Both portrait and landscape orientations supported — no orientation locking
- Fix existing MobileSidebar to use the new safe area system (currently only uses env(safe-area-inset-bottom))
- Foundation sets up the system; downstream phases apply it to new components
- useBreakpoint hook detects the tier and syncs it into Zustand mapStore
- Components use the hook; non-React code reads the store directly
- Initialize on app mount (in App.tsx or a provider) — no flash of wrong layout
- Replace both existing duplicated useIsMobile hooks immediately (SplitLayout.tsx and Sidebar.tsx)
- Defer R3F canvas resize handling to Phase 17 (SplitLayout Rewrite)
- Add a dev-mode badge visible only in development mode

### Claude's Discretion
- Hook API shape (tier string only vs. tier + width vs. object with helpers)
- Whether to track orientation in the store or leave it derivable
- matchMedia vs. ResizeObserver for the listener implementation
- Debounce timing on tier switches (instant vs. brief delay)
- Whether rotation needs special handling beyond the breakpoint hook firing
- CSS strategy for safe area values (custom properties on :root vs. direct env() calls)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| LAYOUT-01 | User sees a mobile layout below 768px, tablet layout at 768–1023px, and desktop layout at 1024px+ | `useBreakpoint` hook with matchMedia at 768 and 1024 breakpoints; tier synced to Zustand store; existing `useIsMobile` hooks in SplitLayout.tsx and Sidebar.tsx replaced |
| TOUCH-02 | User sees correct spacing around the iOS notch and home bar via safe area insets on sheet, sidebar, and bottom controls | CSS env() safe area insets on :root as custom properties; `viewport-fit=cover` already set; MobileSidebar paddingBottom fix to use all four insets |
</phase_requirements>

## Summary

Phase 14 is a pure infrastructure refactor: no new visual features beyond a dev-mode tier badge and safe area fixes. The goal is to consolidate all breakpoint detection into a single `useBreakpoint` hook backed by `window.matchMedia`, extend the Zustand `mapStore` with a `deviceTier` field, and establish CSS custom properties for safe area insets. All 264 existing tests must continue passing — this phase introduces no behavior changes visible to users beyond the MobileSidebar safe area correction.

The codebase already has the necessary foundations in place: `viewport-fit=cover` is set in `index.html`, `100dvh` with `@supports` fallback is in `index.css`, and both duplicate `useIsMobile` hooks use the exact same `matchMedia` implementation (lines 6-16 of Sidebar.tsx and lines 11-21 of SplitLayout.tsx). The refactor is mechanical: extract into one shared hook at `src/hooks/useBreakpoint.ts`, wire it into the store, and replace call sites. The safe area CSS work is additive to `index.css`.

**Primary recommendation:** Use `window.matchMedia` (not ResizeObserver) to match the proven pattern already in the codebase. Add `deviceTier: 'mobile' | 'tablet' | 'desktop'` to mapStore, initialize in App.tsx via a `useEffect` call on the hook, and define four CSS custom properties on `:root` for safe area insets. No new npm packages are needed.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Zustand | 5.0.11 | Global device tier state | Already the app's store; non-React code reads it via `useMapStore.getState()` |
| Vitest | 3.2.4 + jsdom | Test environment | Already configured; `window.matchMedia` requires mocking in jsdom |
| Tailwind CSS v4 | 4.2.1 | CSS utilities | Already in use via `@import "tailwindcss"` in index.css |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @testing-library/react | 16.1.0 | React hook testing | If useBreakpoint gets a unit test wrapping it in a component |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| matchMedia listeners | ResizeObserver on document.body | ResizeObserver fires on any dimension change; matchMedia fires only at defined breakpoints — cleaner for discrete tiers |
| matchMedia | window.innerWidth polling | Polling is fragile; matchMedia event-driven and already used in codebase |
| CSS custom properties on :root | Direct `env()` calls at every use site | Custom properties create a single source; direct calls scatter the values across components |

**Installation:** No new packages needed. All required tools already installed.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── hooks/
│   └── useBreakpoint.ts          # NEW: single breakpoint hook (replaces 2 useIsMobile copies)
├── components/
│   ├── Layout/
│   │   └── SplitLayout.tsx       # MODIFY: consume useBreakpoint, remove local useIsMobile
│   ├── Sidebar/
│   │   └── Sidebar.tsx           # MODIFY: consume useBreakpoint, remove local useIsMobile
│   └── DevBadge/
│       └── DevBadge.tsx          # NEW: dev-mode tier indicator (optional, small component)
├── store/
│   └── mapStore.ts               # MODIFY: add deviceTier field + setDeviceTier action
├── App.tsx                       # MODIFY: call useBreakpoint() here to initialize store
└── index.css                     # MODIFY: add safe area CSS custom properties to :root
```

### Pattern 1: matchMedia Breakpoint Hook
**What:** Uses `window.matchMedia` with `addEventListener('change')` to reactively report the current tier. Reads initial state synchronously (no flash).
**When to use:** This is the only breakpoint detection mechanism in Phase 14.
**Example:**
```typescript
// src/hooks/useBreakpoint.ts
// Based on the exact pattern proven in SplitLayout.tsx:11-21 and Sidebar.tsx:6-16

export type DeviceTier = 'mobile' | 'tablet' | 'desktop';

function getTier(): DeviceTier {
  if (window.matchMedia('(min-width: 1024px)').matches) return 'desktop';
  if (window.matchMedia('(min-width: 768px)').matches) return 'tablet';
  return 'mobile';
}

export function useBreakpoint(): DeviceTier {
  const [tier, setTier] = useState<DeviceTier>(getTier);

  useEffect(() => {
    const mqTablet = window.matchMedia('(min-width: 768px)');
    const mqDesktop = window.matchMedia('(min-width: 1024px)');

    const handleChange = () => setTier(getTier());

    mqTablet.addEventListener('change', handleChange);
    mqDesktop.addEventListener('change', handleChange);

    return () => {
      mqTablet.removeEventListener('change', handleChange);
      mqDesktop.removeEventListener('change', handleChange);
    };
  }, []);

  return tier;
}
```

**Critical note:** The existing `useIsMobile` in both files initializes with `useState(() => window.innerWidth < breakpoint)` as a fallback. The new hook should use `matchMedia.matches` from the start — it reads the correct value synchronously before any effects fire, avoiding the flash risk.

### Pattern 2: Zustand Store Extension
**What:** Add `deviceTier` field and `setDeviceTier` action using the existing store pattern.
**When to use:** Enables non-React code (e.g., workers, utility functions) to read the device tier without hooks.
**Example:**
```typescript
// Addition to src/store/mapStore.ts MapState interface
deviceTier: DeviceTier;  // 'mobile' | 'tablet' | 'desktop'

// Addition to MapActions interface
setDeviceTier: (tier: DeviceTier) => void;

// Addition to store initialization
deviceTier: getTier(),  // Initialize synchronously — no flash

// Addition to store actions
setDeviceTier: (tier) => set({ deviceTier: tier }),
```

**Note:** `getTier()` can be imported from the hook file or inlined in the store. If inlined, keep it DRY — define the function once in a shared location (e.g., `src/lib/breakpoint.ts`) and import it from both the hook and the store.

### Pattern 3: App-Level Hook Mount
**What:** Call `useBreakpoint()` in `App.tsx` and sync to store via `useEffect`. This guarantees initialization runs once on mount before any children render.
**When to use:** Required to satisfy success criterion "no flash of wrong layout."
**Example:**
```typescript
// App.tsx
function App() {
  const tier = useBreakpoint();
  const setDeviceTier = useMapStore((s) => s.setDeviceTier);

  useEffect(() => {
    setDeviceTier(tier);
  }, [tier, setDeviceTier]);

  // ...
}
```

**Alternative:** Since the store is initialized with `getTier()` synchronously, children reading `useMapStore(s => s.deviceTier)` get the correct value even before the first render completes. The `useEffect` in App keeps it live when the user resizes.

### Pattern 4: CSS Safe Area Custom Properties
**What:** Declare four CSS custom properties on `:root` to capture `env()` safe area values. All components consume the custom properties, never `env()` directly.
**When to use:** Enables a single point of change if the strategy evolves (e.g., adding `max()` guards).
**Example:**
```css
/* src/index.css addition */
:root {
  --safe-top:    env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left:   env(safe-area-inset-left, 0px);
  --safe-right:  env(safe-area-inset-right, 0px);
}
```

**Usage at component level:**
```typescript
// In MobileSidebar inline styles — Phase 14 fix
paddingBottom: 'max(8px, var(--safe-bottom))',
paddingLeft:   'var(--safe-left)',
paddingRight:  'var(--safe-right)',
```

**Why custom properties over direct `env()` calls:** The current `MobileSidebar` already uses `env(safe-area-inset-bottom, 8px)` directly as an inline style. Switching to a custom property on `:root` centralizes the value. Downstream phases (15-18) will apply safe areas to new components — having a shared custom property ensures they all read from one source.

### Pattern 5: Dev-Mode Badge
**What:** A small floating div that shows the current tier. Rendered conditionally based on `import.meta.env.DEV`.
**When to use:** Development only — Vite strips `import.meta.env.DEV` as `false` in production builds.
**Example:**
```typescript
// src/components/DevBadge/DevBadge.tsx
import { useMapStore } from '../../store/mapStore';

export function DevBadge() {
  if (!import.meta.env.DEV) return null;
  const tier = useMapStore((s) => s.deviceTier);
  return (
    <div style={{
      position: 'fixed',
      bottom: 'calc(var(--safe-bottom) + 4px)',
      right: 'calc(var(--safe-right) + 4px)',
      zIndex: 9999,
      backgroundColor: 'rgba(0,0,0,0.6)',
      color: '#fff',
      fontSize: '10px',
      fontWeight: 700,
      padding: '2px 6px',
      borderRadius: '4px',
      pointerEvents: 'none',
      letterSpacing: '0.05em',
    }}>
      {tier.toUpperCase()}
    </div>
  );
}
```

### Anti-Patterns to Avoid
- **Duplicating getTier() logic:** The tier calculation uses two breakpoints. Define it once (a standalone function in `src/lib/breakpoint.ts` or at the top of `src/hooks/useBreakpoint.ts`), import it into both the hook and the store initializer.
- **Using `display: none` on canvas ancestors:** The SplitLayout already correctly uses `visibility: hidden + pointer-events: none` for R3F preservation. Do not introduce `display: none` when hiding tabs or panels.
- **Using `window.innerWidth` as initial state:** Both existing `useIsMobile` hooks do `useState(() => window.innerWidth < breakpoint)`. This risks a flash when the hook first runs. The new hook should use `matchMedia.matches` directly from the start.
- **Reading deviceTier from store in App.tsx (circular):** App calls `useBreakpoint()` and writes to store. Components should read from the store. App should not read from the store it's writing to.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| matchMedia mock in tests | Custom window.matchMedia stub | `vi.fn()` with `addEventListenerMock` pattern | jsdom has no matchMedia; needs one-time mock in vitest setup or per-test |
| Safe area fallbacks | Complex JS-based safe area detection | CSS `env()` with fallback value: `env(safe-area-inset-bottom, 0px)` | The fallback syntax is the standard; all modern browsers support it |
| Debouncing tier changes | Custom debounce implementation | None needed — matchMedia fires only at defined thresholds, not on every resize | matchMedia events are coalesced at breakpoints; no debounce required |
| Tier synchronization | setTimeout/polling to sync hook→store | Zustand `set()` is synchronous; `useEffect([tier])` is sufficient | React batches effects; no race conditions |

**Key insight:** matchMedia is already the proven pattern in this codebase. The refactor is purely mechanical — no new algorithms, no debouncing, no polling. The complexity budget for this phase is very low.

## Common Pitfalls

### Pitfall 1: jsdom matchMedia Not Implemented
**What goes wrong:** Tests that import `useBreakpoint` or any component using it throw `TypeError: window.matchMedia is not a function`.
**Why it happens:** jsdom (used by Vitest) does not implement `window.matchMedia`. The existing tests avoid this by testing non-React code (pure functions) or mocking the store directly.
**How to avoid:** Add a `window.matchMedia` mock to `src/test/setup.ts` — it already imports `@testing-library/jest-dom`, so it's the right place. A minimal mock:
```typescript
// src/test/setup.ts — add this
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,  // default: mobile
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
```
**Warning signs:** Any new test file that imports `useBreakpoint` (or a component using it) will fail immediately with `matchMedia is not a function`.

**Critical:** The mock must be added BEFORE any tests run. The setup file (`src/test/setup.ts`) is the correct location. The existing 264 tests do NOT test components that call `useIsMobile` — `GenerateButton.test.ts` tests the `triggerRegenerate` export directly. So the mock is not currently needed but will be required if the hook is tested.

### Pitfall 2: Flash of Wrong Layout on Initial Render
**What goes wrong:** The component renders with the wrong tier for one frame, causing a layout jump.
**Why it happens:** Using `useState(false)` or `useState('mobile')` as initial value, then reading matchMedia in `useEffect`.
**How to avoid:** Initialize `useState` with a function that reads `matchMedia.matches` synchronously: `useState<DeviceTier>(getTier)`. This runs before the first render.

**Also:** The store should be initialized with `getTier()` synchronously (not `'mobile'` as a hardcoded default), so components reading from the store also get the correct value on first render.

### Pitfall 3: Stale matchMedia Reference
**What goes wrong:** The cleanup function removes a listener that was added to a different MediaQueryList object, causing a memory leak or missed cleanup.
**Why it happens:** Creating a new `window.matchMedia(query)` in the cleanup closure instead of capturing the reference from the setup.
**How to avoid:** Capture `mqTablet` and `mqDesktop` as `const` in the effect body, use the same references in both `addEventListener` and `removeEventListener`.

### Pitfall 4: MobileSidebar Safe Area Not Working on iOS
**What goes wrong:** `env(safe-area-inset-bottom)` returns `0px` on iOS, so the home bar overlaps the bottom bar.
**Why it happens:** `viewport-fit=cover` must be set in the `<meta name="viewport">` tag for `env()` safe area values to be non-zero. The tag must include `viewport-fit=cover`.
**How to avoid:** Already resolved — `index.html` line 6 already has `viewport-fit=cover` in the viewport meta. The fix is only needed in the CSS/inline styles.

**Current state of MobileSidebar:** Uses `paddingBottom: 'max(8px, env(safe-area-inset-bottom, 8px))'` (Sidebar.tsx:32). This only handles the bottom inset. Phase 14 should switch this to `var(--safe-bottom)` and also apply `var(--safe-left)` and `var(--safe-right)` for landscape support.

### Pitfall 5: Tablet Tier Forgotten in Existing Components
**What goes wrong:** Existing code branched only on `isMobile` (boolean). The new `useBreakpoint` returns 'mobile' | 'tablet' | 'desktop'. If the conversion treats non-mobile as desktop, tablet behavior is wrong.
**Why it happens:** Mechanical substitution of `isMobile ? A : B` without considering the new tablet case.
**How to avoid:** In `SplitLayout.tsx`, the current `isMobile` branch shows mobile tab bar. After conversion: check `tier === 'mobile'` explicitly. Tablet should follow desktop layout for now (per phase scope — Phase 17 handles SplitLayout rewrite). So `tablet` and `desktop` map to the same branch in Phase 14, which is correct behavior.

### Pitfall 6: Tests Break Due to Store State Not Reset
**What goes wrong:** One test sets `deviceTier: 'desktop'` in the store, the next test reads `'desktop'` when it expects `'mobile'`.
**Why it happens:** Zustand store state persists across tests unless explicitly reset. The existing test pattern in `GenerateButton.test.ts` uses `useMapStore.setState({ ... })` in `beforeEach` to reset relevant fields.
**How to avoid:** If any test touches `deviceTier`, add it to the `beforeEach` reset. The default tier in tests should be 'mobile' (since matchMedia mock returns `matches: false`).

## Code Examples

Verified patterns from official sources (confirmed against existing codebase):

### Zustand Store Field Addition Pattern
```typescript
// Pattern from existing mapStore.ts — adding deviceTier follows identical structure

// In MapState interface:
deviceTier: DeviceTier;

// In MapActions interface:
setDeviceTier: (tier: DeviceTier) => void;

// In create() initial state (line 106+):
deviceTier: getTier(),   // synchronous — no flash

// In create() actions (line 159+):
setDeviceTier: (tier) => set({ deviceTier: tier }),
```

### matchMedia Mock for jsdom (Vitest)
```typescript
// src/test/setup.ts — append to existing file
import { vi } from 'vitest';

// Must run before any test imports components using matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),   // deprecated but some libs still call this
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
```

### Consumer Pattern: Using useBreakpoint in Components
```typescript
// Before (SplitLayout.tsx:134):
const isMobile = useIsMobile();
// if (isMobile) { ... }

// After:
const tier = useBreakpoint();
// For Phase 14 (Phase 17 will redo this completely):
if (tier === 'mobile') { ... }  // mobile tab bar
// else: desktop split pane (tablet also uses desktop layout in Phase 14)
```

### Consumer Pattern: Reading Tier in Non-React Code
```typescript
// Pattern from useTerradraw.ts:134-141 (reads store outside React)
const tier = useMapStore.getState().deviceTier;
// or subscribe:
const unsub = useMapStore.subscribe((state) => {
  // react to tier changes
});
```

### CSS Safe Area Custom Properties
```css
/* src/index.css — append after existing @keyframes spin */
:root {
  --safe-top:    env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left:   env(safe-area-inset-left, 0px);
  --safe-right:  env(safe-area-inset-right, 0px);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `window.innerWidth` polling | `matchMedia` event listeners | Widely adopted ~2015; was already in this codebase | No polling, event-driven, fires exactly at breakpoints |
| `100vh` only | `100dvh` with `@supports` fallback | Already in index.css | Correct mobile browser behavior (excludes browser chrome) |
| No safe-area-inset-* support | `viewport-fit=cover` + `env()` | Already in index.html | Required for iOS notch/home bar coverage |
| Single `isMobile` boolean | Three-tier: mobile/tablet/desktop | This phase introduces it | Enables tablet-specific layouts in Phase 17 |

**Deprecated/outdated:**
- `matchMedia.addListener()` / `matchMedia.removeListener()`: Deprecated in favor of `addEventListener('change', ...)` / `removeEventListener('change', ...)`. The new hook must use the `addEventListener` form. The jsdom mock should stub both to avoid warnings.

## Open Questions

1. **Hook API shape: tier string only vs. tier + isMobile convenience property**
   - What we know: Consumers currently use `isMobile` as boolean. After conversion, they'd use `tier === 'mobile'`.
   - What's unclear: Whether a convenience `isMobile` getter reduces friction or adds confusion.
   - Recommendation: Return tier string only (`DeviceTier`). The string is unambiguous. Add a `isMobile` computed helper only if the planner decides it reduces churn — it's easy to add and doesn't affect the store field.

2. **Where to define the shared `getTier()` function**
   - What we know: Both the hook and the store initializer need to call it. Duplicating is an anti-pattern.
   - What's unclear: Best location — `src/hooks/useBreakpoint.ts` (exported) or `src/lib/breakpoint.ts` (utility).
   - Recommendation: Export from `src/hooks/useBreakpoint.ts`. The store can import from there. If the hook ever becomes a more complex module, it can be refactored.

3. **matchMedia mock: global in setup.ts vs. per-test**
   - What we know: The mock must exist before any component importing `useBreakpoint` loads. The current `src/test/setup.ts` is the correct place.
   - What's unclear: Whether adding the mock globally will break any of the 264 existing tests.
   - Recommendation: Add the mock to `src/test/setup.ts`. Since current tests only test pure functions and don't call `window.matchMedia`, the global mock will have no effect on them. Verify by running `npx vitest run` after adding it.

## Validation Architecture

> nyquist_validation is NOT set in .planning/config.json — this section uses project test infrastructure instead.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.4 |
| Config file | `/Users/agrignon/projects/MapMaker/vitest.config.ts` |
| Environment | jsdom |
| Quick run command | `npx vitest run` |
| Full suite command | `npx vitest run` |

**Current suite:** 21 files, 264 tests — all pass as of research date.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Notes |
|--------|----------|-----------|-------|
| LAYOUT-01 | Mobile layout below 768px, tablet 768-1023px, desktop 1024px+ | Automated (unit) | `useBreakpoint` hook can be tested with matchMedia mock. SplitLayout/Sidebar rendering is harder — manual verification on real devices or with jsdom matchMedia mock. The success criterion "264 tests pass unchanged" means no regression, not new coverage. |
| TOUCH-02 | Correct spacing around iOS notch and home bar | Manual-only | CSS `env()` values are not computed in jsdom. Must verify on iOS Safari (real device or Xcode Simulator with `viewport-fit=cover`). |

**Automated test gaps (Wave 0):**
- [ ] `src/hooks/__tests__/useBreakpoint.test.ts` — unit test for tier detection logic (optional — depends on planner decision). Tests: initial tier from matchMedia, tier change on matchMedia event, store sync.
- [ ] `src/test/setup.ts` — add `window.matchMedia` mock (REQUIRED before any component test using the hook).

**Existing test protection:**
The 264 existing tests are all pure-function or store-based tests that do not call `window.matchMedia`. Adding the matchMedia mock to `setup.ts` is safe. The store extension (`deviceTier` field) requires updating `beforeEach` store resets in `GenerateButton.test.ts` to include `deviceTier: 'mobile'` — otherwise the field is undefined, which is currently not tested.

### Wave 0 Gaps
- [ ] `src/test/setup.ts` — add `window.matchMedia` mock (required if any component test imports the hook)
- [ ] `src/hooks/__tests__/useBreakpoint.test.ts` — optional unit test for hook (planner decides)

*(If planner elects not to unit test `useBreakpoint`, the only Wave 0 gap is the matchMedia mock — and only if a hook test is added. The 264 existing tests are self-sufficient for regression detection.)*

## Sources

### Primary (HIGH confidence)
- Codebase direct inspection: `src/components/Layout/SplitLayout.tsx` lines 11-21 — existing matchMedia pattern
- Codebase direct inspection: `src/components/Sidebar/Sidebar.tsx` lines 6-16 — identical duplicate pattern
- Codebase direct inspection: `src/store/mapStore.ts` — Zustand v5 store structure and patterns
- Codebase direct inspection: `src/index.css` — existing dvh, overscroll, touch-action setup
- Codebase direct inspection: `index.html` line 6 — `viewport-fit=cover` already present
- Codebase direct inspection: `src/test/setup.ts` — test setup file
- `npx vitest run` — confirmed 264/264 tests pass (2026-03-01)

### Secondary (MEDIUM confidence)
- MDN CSS env() with safe-area-inset-* — standard behavior confirmed by widespread iOS Safari adoption
- MDN matchMedia API — `addEventListener('change')` replaces deprecated `addListener()`
- Vitest jsdom environment — `window.matchMedia` not implemented, confirmed by jsdom issue tracker behavior

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries confirmed in package.json with exact versions
- Architecture: HIGH — patterns verified directly in existing codebase source files
- Pitfalls: HIGH — matchMedia/jsdom gap confirmed by setup.ts inspection (no mock present); safe area behavior confirmed by index.html/Sidebar.tsx inspection
- Test strategy: HIGH — existing 264 tests confirmed passing; gap analysis based on direct inspection of test files and vitest.config.ts

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (30 days — stable patterns, no fast-moving dependencies)
