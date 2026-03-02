# Phase 14: Foundation - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish responsive infrastructure — breakpoint hook, Zustand store fields, viewport meta, dvh fix, safe area support, and visibility pattern — so all downstream phases (15-18) build on a single, consistent foundation. No visual layout changes beyond safe area fixes and a dev-mode badge. The 264-test suite must pass unchanged.

</domain>

<decisions>
## Implementation Decisions

### Device tier detection
- Width-only detection using matchMedia at 768px and 1024px breakpoints
- Three tiers: 'mobile' (<768px), 'tablet' (768-1023px), 'desktop' (1024px+)
- No device sniffing, no touch capability detection, no user-agent checks
- A narrow desktop browser window (e.g., 600px) gets mobile layout — breakpoints are law
- An iPad in landscape (1024px+) gets desktop layout — that's correct, it has the screen real estate

### Safe area coverage
- Support all four safe area insets: top (notch/Dynamic Island), bottom (home bar), left and right (landscape mode)
- Both portrait and landscape orientations supported — no orientation locking
- Fix existing MobileSidebar to use the new safe area system (currently only uses env(safe-area-inset-bottom))
- Foundation sets up the system; downstream phases (15-18) apply it to new components as they're built

### Global device state
- useBreakpoint hook detects the tier and syncs it into Zustand mapStore
- Components use the hook; non-React code reads the store directly
- Initialize on app mount (in App.tsx or a provider) — no flash of wrong layout
- Replace both existing duplicated useIsMobile hooks immediately (SplitLayout.tsx and Sidebar.tsx)
- Satisfies success criterion 4: no duplicate breakpoint values in the codebase

### Tier transition behavior
- Defer R3F canvas resize handling to Phase 17 (SplitLayout Rewrite) — its success criteria explicitly cover this
- Add a dev-mode badge (small floating indicator showing 'MOBILE' / 'TABLET' / 'DESKTOP') visible only in development mode — useful for testing breakpoints

### Claude's Discretion
- Hook API shape (tier string only vs. tier + width vs. object with helpers)
- Whether to track orientation in the store or leave it derivable
- matchMedia vs. ResizeObserver for the listener implementation
- Debounce timing on tier switches (instant vs. brief delay)
- Whether rotation needs special handling beyond the breakpoint hook firing
- CSS strategy for safe area values (custom properties on :root vs. direct env() calls)

</decisions>

<specifics>
## Specific Ideas

- Dev-mode badge should be a small floating element, not intrusive — just enough to see which tier is active during testing
- MobileSidebar safe area fix should be a visible improvement on iOS devices with notch/home bar

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useIsMobile` hook (duplicated in SplitLayout.tsx:11 and Sidebar.tsx:6): Same implementation, uses matchMedia. Will be replaced by useBreakpoint.
- `MobileSidebar` component (Sidebar.tsx:18): Already uses `env(safe-area-inset-bottom)` — needs updating to use new safe area system
- `mapStore` (store/mapStore.ts): Zustand store, central state for all app data. Device tier field will be added here.

### Established Patterns
- matchMedia with addEventListener('change') for responsive detection (proven pattern in both useIsMobile instances)
- Zustand with selector pattern for state access (`useMapStore((s) => s.field)`)
- CSS uses Tailwind v4 (`@import "tailwindcss"`) in index.css
- `100dvh` with `@supports` fallback already in index.css
- `viewport-fit=cover` already set in index.html meta tag
- Inline styles used extensively in layout components (SplitLayout, Sidebar)

### Integration Points
- `App.tsx`: Top-level component where useBreakpoint initialization should run
- `SplitLayout.tsx`: Uses useIsMobile to switch between mobile tab bar and desktop split pane — will consume useBreakpoint
- `Sidebar.tsx`: Uses useIsMobile to switch between MobileSidebar and DesktopSidebar — will consume useBreakpoint
- `index.css`: Where global CSS custom properties for safe areas would live
- `mapStore.ts`: Where device tier store field will be added

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 14-foundation*
*Context gathered: 2026-03-01*
