---
phase: 16-layout-components
plan: "03"
subsystem: ui
tags: [react, mobile, bottom-sheet, integration, split-layout, vaul]

# Dependency graph
requires:
  - phase: 16-layout-components
    plan: "01"
    provides: BottomSheet component wrapping vaul Drawer.Root
  - phase: 16-layout-components
    plan: "02"
    provides: MobileViewToggle controlled component
  - phase: 15-content-architecture
    provides: SidebarContent panel component
  - phase: 14-foundation
    provides: useBreakpoint hook and deviceTier breakpoints
provides:
  - Sidebar.tsx mobile branch renders BottomSheet instead of fixed MobileSidebar panel
  - SplitLayout.tsx uses MobileViewToggle floating button instead of MobileTabBar tab bar
  - Full Phase 16 integration complete — bottom sheet + floating toggle wired into live layout
affects:
  - Phase 17 (SplitLayout restructure will build on this integrated base)
  - Phase 18 (polish will validate touch targets and animations in this layout)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "BottomSheet wraps SidebarContent directly — no extra header in sheet, drag handle serves as visual anchor"
    - "MobileViewToggle rendered as sibling to map/preview panes in content div — floats above both via position:absolute zIndex:20"
    - "handleViewToggle useCallback in SplitLayout toggles activeTab between map/preview"
    - "visibility:hidden pattern preserved on map/preview panes for WebGL context continuity"

key-files:
  created: []
  modified:
    - src/components/Sidebar/Sidebar.tsx
    - src/components/Layout/SplitLayout.tsx

key-decisions:
  - "BottomSheet wraps SidebarContent with no extra header — the drag handle (pill) replaces the MobileSidebar MapMaker branding header"
  - "MobileViewToggle placed as sibling to map/preview panes (not inside map pane) so it remains visible when map is visibility:hidden"
  - "handleViewToggle uses useCallback to provide stable toggle fn to MobileViewToggle"
  - "MobileTabBar function removed entirely — replaced by floating MobileViewToggle pattern"

requirements-completed: [SHEET-01, SHEET-02, SHEET-03, SHEET-04, SHEET-05, LAYOUT-04]

# Metrics
duration: 1min
completed: "2026-03-02"
---

# Phase 16 Plan 03: Layout Integration Summary

**MobileSidebar replaced by BottomSheet (vaul) and MobileTabBar replaced by MobileViewToggle (floating button) — Phase 16 mobile layout integration complete**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-02T21:52:07Z
- **Completed:** 2026-03-02T21:53:14Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Replaced `MobileSidebar` (fixed bottom panel) with `BottomSheet` wrapping `SidebarContent` — mobile users now get a draggable sheet with snap points instead of a fixed div
- Replaced `MobileTabBar` (fixed tab bar at top) with `MobileViewToggle` (floating button) — cleaner UX with no dead tab bar space
- `MobileViewToggle` placed as sibling to map/preview panes in the content div so it remains visible regardless of which pane is active (`visibility:hidden` on a parent would have hidden a child button)
- All 281 tests pass, TypeScript compiles cleanly, production build succeeds

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace MobileSidebar with BottomSheet in Sidebar.tsx** - `165e4a0` (feat)
2. **Task 2: Replace MobileTabBar with MobileViewToggle in SplitLayout.tsx** - `7afd6c4` (feat)

## Files Created/Modified

- `src/components/Sidebar/Sidebar.tsx` — Removed `MobileSidebar` function (34 lines); mobile branch now renders `<BottomSheet><SidebarContent /></BottomSheet>`; added `BottomSheet` import
- `src/components/Layout/SplitLayout.tsx` — Removed `MobileTabBar` function (51 lines) and its `{isMobile && <MobileTabBar ... />}` render; added `MobileViewToggle` import; added `handleViewToggle` useCallback; `MobileViewToggle` rendered as sibling inside content div

## Decisions Made

- **No header inside BottomSheet:** The `MobileSidebar` had a "MapMaker" branding header. The `BottomSheet` component uses vaul's `Drawer.Handle` pill as the visual anchor — no duplicate header needed. This follows the plan decision.
- **MobileViewToggle as pane sibling:** The plan's "WAIT" note correctly identified that placing the toggle inside the map pane would hide it when `visibility:hidden`. Placing it as a sibling inside the `key="content"` div (which has `position:relative`) lets its `position:absolute` + `zIndex:20` float above both panes.
- **handleViewToggle via useCallback:** Stable toggle function passed to `MobileViewToggle.onToggle` — avoids unnecessary re-renders.
- **useLayoutEffect preserved unchanged:** The automatic tab transition logic (generate → switch to preview, orientation change → switch to preview, model cleared → back to map) is critical UX. The toggle button adds a manual control point but does not replace the automatic transitions.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 16 is complete. All three plans (BottomSheet, MobileViewToggle, integration) are done.
- Requirements SHEET-01 through SHEET-05 and LAYOUT-04 are satisfied.
- Manual verification items from the plan (snap behavior, spring animation, iOS touch conflict) remain for UAT.
- Phase 17 (SplitLayout restructure) can proceed — the integrated mobile layout provides the foundation.

---
*Phase: 16-layout-components*
*Completed: 2026-03-02*

## Self-Check: PASSED

- FOUND: src/components/Sidebar/Sidebar.tsx
- FOUND: src/components/Layout/SplitLayout.tsx
- FOUND: .planning/phases/16-layout-components/16-03-SUMMARY.md
- FOUND commit: 165e4a0 (feat(16-03): replace MobileSidebar with BottomSheet in Sidebar.tsx)
- FOUND commit: 7afd6c4 (feat(16-03): replace MobileTabBar with MobileViewToggle in SplitLayout.tsx)
