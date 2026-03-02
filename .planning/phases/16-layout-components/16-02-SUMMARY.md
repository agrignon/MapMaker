---
phase: 16-layout-components
plan: 02
subsystem: ui
tags: [react, mobile, toggle, breakpoint, touch-target, vitest]

# Dependency graph
requires:
  - phase: 16-layout-components
    provides: useBreakpoint hook for mobile tier detection
  - phase: 14-foundation
    provides: matchMedia mock setup in src/test/setup.ts
provides:
  - MobileViewToggle controlled component (activeView/onToggle props)
  - Unit tests covering rendering, toggle callback, aria labels, tier guard, touch target
affects: [16-03-SplitLayout, 17-split-layout, phase-18-polish]

# Tech tracking
tech-stack:
  added: ["@vitejs/plugin-react added to vitest.config.ts for JSX transform in test files"]
  patterns:
    - "Controlled toggle component: accepts activeView and onToggle as props, not store-driven"
    - "Tier guard: returns null for non-mobile tiers via useBreakpoint()"
    - "matchMedia mock restoration: save defaultMatchMedia before describe block, restore in afterEach"

key-files:
  created:
    - src/components/MobileViewToggle/MobileViewToggle.tsx
    - src/components/MobileViewToggle/__tests__/MobileViewToggle.test.tsx
  modified:
    - vitest.config.ts

key-decisions:
  - "MobileViewToggle is a controlled component (activeView + onToggle props) not store-driven — SplitLayout manages activeTab state and will wire it in Plan 03"
  - "Button text shows the destination view ('3D Preview' when on map, 'Map' when on preview)"
  - "Added @vitejs/plugin-react to vitest.config.ts to enable JSX automatic runtime transform in test files"
  - "matchMedia mock restoration uses explicit window.matchMedia = defaultMatchMedia in afterEach instead of vi.restoreAllMocks() which breaks Object.defineProperty-based mocks"

patterns-established:
  - "Floating toggle button: position absolute, top-right corner, zIndex 20, floats above map/preview pane"
  - "Touch target compliance: minHeight 44 + minWidth 44 + touchAction manipulation"
  - "Test isolation for matchMedia: save the default mock before tests, restore in afterEach"

requirements-completed: [LAYOUT-04]

# Metrics
duration: 3min
completed: 2026-03-02
---

# Phase 16 Plan 02: MobileViewToggle Summary

**Floating mobile toggle button (44px touch target, mobile-only, controlled via activeView/onToggle props) with 9 passing unit tests**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-02T13:45:48Z
- **Completed:** 2026-03-02T13:49:23Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- MobileViewToggle component: floating button that switches between map and 3D preview on mobile only
- Controlled component design with activeView/onToggle props — ready for SplitLayout wiring in Plan 03
- 9 unit tests covering all plan requirements: rendering, text labels, click callback, aria-labels, mobile-only guard (desktop/tablet return null), 44px touch target
- Fixed vitest.config.ts to include React plugin for reliable JSX transform in test files

## Task Commits

Each task was committed atomically:

1. **Task 1: Build MobileViewToggle component** - `70770c0` (feat)
2. **Task 2: Write MobileViewToggle unit tests** - `e82fbc0` (feat)

## Files Created/Modified
- `src/components/MobileViewToggle/MobileViewToggle.tsx` - Floating toggle button, mobile-only, controlled component with 44px touch target
- `src/components/MobileViewToggle/__tests__/MobileViewToggle.test.tsx` - 9 unit tests covering rendering, text, callbacks, aria, tier guard, touch target
- `vitest.config.ts` - Added @vitejs/plugin-react plugin for JSX transform in test files

## Decisions Made
- **Controlled component pattern:** MobileViewToggle accepts `activeView` and `onToggle` as props rather than reading/writing directly from the store. SplitLayout will manage the `activeTab` state and pass it through in Plan 03.
- **Button text convention:** Shows the destination view — "3D Preview" when currently on map, "Map" when currently on preview. Matches standard UX convention for toggle buttons.
- **React plugin in vitest.config.ts:** The existing config used `vitest/config` without the React plugin, which meant JSX in test files was not transformed through the automatic runtime. Adding `@vitejs/plugin-react` fixed this globally for all test files.
- **matchMedia mock restoration:** `vi.restoreAllMocks()` is incompatible with `Object.defineProperty`-based mocks (it restores to undefined, breaking subsequent tests). The fix: save `defaultMatchMedia` before the describe block and assign it back in `afterEach`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added @vitejs/plugin-react to vitest.config.ts for JSX transform**
- **Found during:** Task 2 (MobileViewToggle unit tests)
- **Issue:** vitest.config.ts used `vitest/config` without the React plugin — JSX in test files was not processed through the automatic runtime, causing "React is not defined" errors. The BottomSheet tests worked by coincidence (no component re-render triggered after spy changes).
- **Fix:** Added `import react from '@vitejs/plugin-react'` and `plugins: [react()]` to vitest.config.ts
- **Files modified:** vitest.config.ts
- **Verification:** All 9 new tests pass; full 281-test suite passes with no regressions
- **Committed in:** e82fbc0 (Task 2 commit)

**2. [Rule 1 - Bug] Fixed matchMedia mock restoration pattern in tests**
- **Found during:** Task 2 (MobileViewToggle unit tests)
- **Issue:** The plan's test template used `vi.restoreAllMocks()` after `vi.spyOn(window, 'matchMedia')`. When spies are restored, `window.matchMedia` becomes undefined (the `Object.defineProperty` original is not preserved by `vi.spyOn`). Tests after the spy tests would crash with "Cannot read properties of undefined (reading 'matches')".
- **Fix:** Save `const defaultMatchMedia = window.matchMedia` before the describe block; use `afterEach(() => { window.matchMedia = defaultMatchMedia; })` to reliably restore after each test. Use direct `window.matchMedia = vi.fn().mockImplementation(...)` instead of `vi.spyOn`.
- **Files modified:** src/components/MobileViewToggle/__tests__/MobileViewToggle.test.tsx
- **Verification:** All 9 tests pass in correct order with clean isolation
- **Committed in:** e82fbc0 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking infrastructure fix, 1 bug in test mock pattern)
**Impact on plan:** Both auto-fixes were necessary for tests to run. No scope creep — the component itself matches the plan specification exactly.

## Issues Encountered
- matchMedia spy restoration incompatibility with Object.defineProperty mocks required adjusting the test template pattern. The plan's suggested template used `vi.spyOn` + `vi.restoreAllMocks()` which is unreliable for window properties set via Object.defineProperty. The fix (explicit save/restore) is now established as the project pattern for matchMedia overrides in tests.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- MobileViewToggle is ready for integration in Plan 03 (SplitLayout refactor)
- Component is a controlled component — SplitLayout will provide `activeView` and `onToggle` when replacing MobileTabBar
- The 44px touch target and positioning work is complete — Plan 03 only needs to wire up the callbacks
- Blocker: OrbitControls/MapLibre/vaul touch event conflict still needs real iOS validation (documented in STATE.md)

---
*Phase: 16-layout-components*
*Completed: 2026-03-02*

## Self-Check: PASSED

- src/components/MobileViewToggle/MobileViewToggle.tsx: FOUND
- src/components/MobileViewToggle/__tests__/MobileViewToggle.test.tsx: FOUND
- .planning/phases/16-layout-components/16-02-SUMMARY.md: FOUND
- Commit 70770c0 (Task 1): FOUND
- Commit e82fbc0 (Task 2): FOUND
