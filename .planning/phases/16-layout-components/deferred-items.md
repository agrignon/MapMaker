# Deferred Items — Phase 16 Layout Components

## Pre-existing Issues (out of scope)

### Issue 1: MobileViewToggle test — matchMedia mock teardown bug
- **File:** `src/components/MobileViewToggle/__tests__/MobileViewToggle.test.tsx`
- **Test:** `has at least 44px touch target` (line 84)
- **Error:** `TypeError: Cannot read properties of undefined (reading 'matches')`
- **Root cause:** The `returns null on tablet tier` test (line 66) calls `vi.restoreAllMocks()` which removes the global `matchMedia` mock set in `src/test/setup.ts`. The subsequent test then calls `useBreakpoint()` which calls `window.matchMedia()` → returns `undefined` → crashes.
- **Fix needed:** Replace `vi.restoreAllMocks()` with `vi.restoreAllMocks()` scoped to the spy, or use `vi.spyOn` without global teardown, or add `afterEach` to re-apply the mock.
- **Discovered during:** Phase 16 Plan 01, Task 2 full suite run
- **Status:** Pre-existing (test file untracked, not introduced by 16-01)
