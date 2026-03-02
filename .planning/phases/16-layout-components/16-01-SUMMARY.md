---
phase: 16-layout-components
plan: "01"
subsystem: ui
tags: [vaul, bottom-sheet, mobile, react, snap-points, drag-gesture]

# Dependency graph
requires:
  - phase: 14-foundation
    provides: deviceTier store and useBreakpoint hook
  - phase: 15-content-architecture
    provides: SidebarContent panel component for sheet children
provides:
  - vaul@1.1.2 installed as bottom sheet library
  - BottomSheet component with three snap points (peek/half/full)
  - Drawer.Handle pill drag handle with 44px touch target
  - modal=false non-blocking map interaction configuration
  - Unit tests covering SHEET-01, SHEET-02, SHEET-03, SHEET-05
affects:
  - 16-03 (Sidebar.tsx wiring — will import BottomSheet and replace MobileSidebar)

# Tech tracking
tech-stack:
  added: [vaul@1.1.2]
  patterns:
    - Always-open controlled sheet (open=true + dismissible=false) for persistent mobile UI
    - modal=false prevents pointer-events block on background map layer
    - onOpenChange safety net re-snaps to peek to prevent accidental sheet close
    - vaul mock pattern using vi.mock to capture Drawer.Root props for assertion
    - React.createElement in vi.mock factory to avoid React reference error in hoisted mock

key-files:
  created:
    - src/components/BottomSheet/BottomSheet.tsx
    - src/components/BottomSheet/__tests__/BottomSheet.test.tsx
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "snapPoints=[80, 0.45, 1] uses numeric fractions (not CSS strings) — vaul only documents px strings and 0-1 fractions"
  - "No Drawer.Overlay rendered — omitting avoids any pointer-events interception at peek/half snap points"
  - "onOpenChange safety net: if vaul fires onOpenChange(false) (GitHub #362 double-tap), re-snap to peek instead of closing"
  - "React.createElement in vi.mock factory — hoisted mocks run before module scope so JSX needs explicit React import"

patterns-established:
  - "vaul mock pattern: use React.createElement in vi.mock factory to avoid 'React is not defined' in hoisted scope"
  - "BottomSheet is container-style-free — Drawer.Content provides positioning; inner content uses flex:1 min-height:0 overflow-y:auto"

requirements-completed: [SHEET-01, SHEET-02, SHEET-03, SHEET-04, SHEET-05]

# Metrics
duration: 3min
completed: "2026-03-02"
---

# Phase 16 Plan 01: BottomSheet Component Summary

**vaul@1.1.2 draggable bottom sheet with three snap points (80px/45vh/full), non-blocking modal=false map interaction, and pill drag handle with 44px touch target**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-02T21:45:41Z
- **Completed:** 2026-03-02T21:48:47Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Installed vaul@1.1.2 — the pre-decided library for mobile bottom sheet drag/snap
- Built BottomSheet.tsx wrapping Drawer.Root with snap points [80, 0.45, 1], modal=false, dismissible=false, and Drawer.Handle for pill drag
- Added onOpenChange safety net preventing double-tap sheet close (GitHub #362)
- Wrote 8 unit tests covering all unit-testable SHEET requirements (SHEET-01 through SHEET-05 except SHEET-04 which requires visual inspection)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install vaul and build BottomSheet component** - `db28c0b` (feat)
2. **Task 2: Write BottomSheet unit tests** - `2126f68` (test)

**Plan metadata:** (pending — final docs commit)

## Files Created/Modified

- `src/components/BottomSheet/BottomSheet.tsx` - Drawer.Root wrapper with snap points, modal=false, dismissible=false, Drawer.Handle, onOpenChange safety net
- `src/components/BottomSheet/__tests__/BottomSheet.test.tsx` - 8 unit tests covering snap point config, handle presence, modal prop, snapToSequentialPoint absence
- `package.json` - Added vaul@1.1.2 dependency
- `package-lock.json` - Updated lock file for vaul and its transitive dependencies

## Decisions Made

- **Numeric fractions for snap points:** Used `[80, 0.45, 1]` rather than CSS unit strings (`'45vh'`, `'88dvh'`). vaul only documents pixel strings and 0-1 fractions as valid snap point values — CSS viewport unit strings are not confirmed supported.
- **No Drawer.Overlay:** Omitting the overlay entirely avoids any pointer-events interception at peek/half snap positions. fadeFromIndex=2 handles the full-snap dimming without needing an explicit overlay element.
- **onOpenChange safety net:** Double-tap on Drawer.Handle can fire onOpenChange(false) even with dismissible=false (GitHub #362). Safety net re-snaps to peek position so the sheet never disappears without a way to reopen it.
- **React.createElement in vi.mock factory:** Vitest hoists vi.mock() calls before imports. JSX in the factory would fail because React is not yet in scope. Using React.createElement() explicitly avoids the reference error.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed React reference error in vi.mock factory**
- **Found during:** Task 2 (BottomSheet unit tests)
- **Issue:** The plan specified JSX syntax in the vi.mock factory. Vitest hoists vi.mock() before module imports, so `React` is not in scope when the factory runs. Tests failed with `ReferenceError: React is not defined`.
- **Fix:** Added `import React from 'react'` at top of test file and replaced JSX in vi.mock factory with `React.createElement()` calls — the same JSX but in a form that doesn't depend on implicit React scope.
- **Files modified:** `src/components/BottomSheet/__tests__/BottomSheet.test.tsx`
- **Verification:** All 8 tests pass after fix.
- **Committed in:** `2126f68` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug fix)
**Impact on plan:** Necessary fix for tests to run in Vitest's hoisted mock environment. No scope change.

## Issues Encountered

- **Pre-existing MobileViewToggle test failure:** `src/components/MobileViewToggle/__tests__/MobileViewToggle.test.tsx` has a `has at least 44px touch target` test that fails because `vi.restoreAllMocks()` in a prior test removes the global matchMedia mock. This is pre-existing (test file was untracked before this plan). Documented in `deferred-items.md`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- BottomSheet component ready for integration in Phase 16 Plan 03 (Sidebar.tsx wiring)
- vaul installed and configured; no additional setup needed
- SHEET-04 (spring animation) requires visual inspection during UAT — not unit-testable
- SHEET-03 and SHEET-05 require real iOS hardware validation (noted as STATE.md blocker)

---
*Phase: 16-layout-components*
*Completed: 2026-03-02*

## Self-Check: PASSED

- FOUND: src/components/BottomSheet/BottomSheet.tsx
- FOUND: src/components/BottomSheet/__tests__/BottomSheet.test.tsx
- FOUND: .planning/phases/16-layout-components/16-01-SUMMARY.md
- FOUND commit: db28c0b (feat(16-01): install vaul@1.1.2 and create BottomSheet component)
- FOUND commit: 2126f68 (test(16-01): add BottomSheet unit tests)
