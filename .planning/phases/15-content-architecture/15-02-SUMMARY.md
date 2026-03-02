---
phase: 15-content-architecture
plan: 02
subsystem: ui
tags: [react, zustand, responsive, layout, splitlayout, mobile]

# Dependency graph
requires:
  - phase: 15-01
    provides: Panel components extracted as layout-agnostic shells; SidebarContent thin wrapper; PreviewSidebar unconditionally renders ModelControlsPanel
provides:
  - SidebarContent unconditionally renders MapControlsPanel (no ternary, no showPreview read)
  - SplitLayout useLayoutEffect handles isMobile false-to-true transition when showPreview is active
  - Mobile layout uses visibility:hidden + absolute stacking (not display:none) to preserve WebGL context
  - Both UAT gaps from 15-UAT.md resolved
affects: [16-layout-components, 17-persistent-sidebar, 18-polish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Left sidebar (SidebarContent) is map-only — model controls belong exclusively to PreviewSidebar in right pane"
    - "Use prevRef pattern for both showPreview and isMobile in SplitLayout useLayoutEffect to track transitions"
    - "Mobile tab panes use visibility:hidden + absolute stacking to preserve WebGL context (matching desktop pattern)"

key-files:
  created: []
  modified:
    - src/components/Panels/SidebarContent.tsx
    - src/components/Layout/SplitLayout.tsx

key-decisions:
  - "SidebarContent no longer reads showPreview — it is unconditionally a map-controls host; the ternary that showed ModelControlsPanel was incorrect architecture"
  - "SplitLayout tracks both prevShowPreview and prevIsMobile refs to handle all transition cases for tab switching"

patterns-established:
  - "Panel location contract: left sidebar = map controls only; right pane = model controls only"
  - "Transition tracking: use useRef to capture previous values for multi-dependency useEffect logic"

requirements-completed: [LAYOUT-03]

# Metrics
duration: 5min
completed: 2026-03-02
---

# Phase 15 Plan 02: UAT Gap Closure Summary

**Fixed duplicate model controls (desktop) and black screen on mobile resize by removing SidebarContent ternary and adding prevIsMobile transition detection in SplitLayout**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-02T01:31:00Z
- **Completed:** 2026-03-02T01:36:30Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Removed ModelControlsPanel from SidebarContent — left sidebar now exclusively shows map controls, eliminating duplicate controls on desktop split layout
- Added prevIsMobile ref to SplitLayout useLayoutEffect — when viewport crosses mobile breakpoint while showPreview is active, preview tab activates immediately (no black screen)
- Changed mobile tab panes from display:none/block to visibility:hidden/visible with absolute stacking — preserves R3F WebGL context across tab switches (matching the desktop layout pattern)
- Switched useEffect → useLayoutEffect for tab switching to prevent visual flash on transition
- All 264 tests pass, TypeScript compiles clean, production build succeeds

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix duplicate controls — SidebarContent always renders MapControlsPanel** - `4e56aba` (fix)
2. **Task 2: Fix mobile black screen — handle isMobile transition while showPreview is active** - `4cf3877` (fix)
3. **Task 2 (cont): Preserve WebGL context on mobile tab switch** - `f36872e` (fix) — root cause was display:none destroying Canvas context

## Files Created/Modified
- `src/components/Panels/SidebarContent.tsx` - Simplified to unconditionally render MapControlsPanel; removed showPreview read and ModelControlsPanel import
- `src/components/Layout/SplitLayout.tsx` - Added prevIsMobile ref and Case 2 condition in useLayoutEffect; mobile panes use visibility:hidden + absolute stacking instead of display:none

## Decisions Made
- SidebarContent ternary was a design error: ModelControlsPanel belongs only in PreviewSidebar (right pane). The left sidebar should never render model controls regardless of preview state.
- Three-case useEffect structure makes the logic explicit and easy to extend: Case 1 (showPreview turns on mobile), Case 2 (viewport goes mobile with active preview), Case 3 (showPreview turns off mobile).

## Deviations from Plan

- **Additional fix needed:** The plan's Task 2 (prevIsMobile ref) addressed the tab-switching logic but not the root cause: mobile layout used `display:none` which destroyed the R3F WebGL context. Added `visibility:hidden` + absolute stacking and switched from `useEffect` to `useLayoutEffect`. Identified after UAT re-testing showed the black screen persisted.

## Issues Encountered

- The initial prevIsMobile fix was necessary but insufficient — the real culprit was `display:none` on the Canvas container destroying the WebGL context during tab transitions.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Both UAT gaps are resolved; Phase 15 Content Architecture is complete
- Phase 16 Layout Components can proceed: SidebarContent is the clean insertion point for BottomSheet and future containers
- Panel location contract is now enforced: left sidebar = map controls, right pane = model controls

---
*Phase: 15-content-architecture*
*Completed: 2026-03-02*
