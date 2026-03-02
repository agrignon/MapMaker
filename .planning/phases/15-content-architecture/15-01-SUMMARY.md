---
phase: 15-content-architecture
plan: 01
subsystem: ui
tags: [react, zustand, sidebar, panels, refactor]

# Dependency graph
requires:
  - phase: 14-foundation
    provides: useBreakpoint hook, SplitLayout structure, Zustand store with showPreview/bbox selectors
provides:
  - Layout-agnostic MapControlsPanel (SelectionInfo + GenerateButton, zero container styles)
  - Layout-agnostic ModelControlsPanel (model controls content, zero container styles)
  - SidebarContent view-driven content switcher (reads showPreview, conditionally mounts panel)
  - Thin container shells: Sidebar.tsx, PreviewSidebar.tsx
affects: [16-layout-components, 17-split-layout, 18-polish]

# Tech tracking
tech-stack:
  added: []
  patterns: [layout-agnostic panel pattern, view-driven content switcher, thin container shell]

key-files:
  created:
    - src/components/Panels/MapControlsPanel.tsx
    - src/components/Panels/ModelControlsPanel.tsx
    - src/components/Panels/SidebarContent.tsx
  modified:
    - src/components/Sidebar/Sidebar.tsx
    - src/components/Preview/PreviewSidebar.tsx

key-decisions:
  - "Panel components have ZERO container styles — no position, width, maxHeight, overflow, backdrop, shadow, or zIndex; container concerns belong to shell components"
  - "SidebarContent uses conditional ternary rendering (not display:none) so only one panel mounts at a time"
  - "GenerateButton.tsx and SelectionInfo.tsx remain at original paths to preserve test import paths"
  - "ModelControlsPanel reads setShowPreview directly from store — not passed as prop from container"

patterns-established:
  - "Layout-agnostic panel: component provides content only, zero positional/container styles"
  - "View-driven content switcher: reads showPreview from store, returns ternary of panels"
  - "Thin container shell: handles position/size/scroll/backdrop, delegates content to panel component"

requirements-completed: [LAYOUT-03]

# Metrics
duration: 2min
completed: 2026-03-02
---

# Phase 15 Plan 01: Content Architecture Summary

**Extracted sidebar content into layout-agnostic MapControlsPanel and ModelControlsPanel, wired SidebarContent view-driven switcher reading showPreview from Zustand store**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-02T00:50:28Z
- **Completed:** 2026-03-02T00:51:43Z
- **Tasks:** 2
- **Files modified:** 5 (3 created, 2 updated)

## Accomplishments
- Created `src/components/Panels/` directory with three new files: MapControlsPanel, ModelControlsPanel, SidebarContent
- Refactored Sidebar.tsx into a thin container shell — removed inline SelectionInfo/GenerateButton, replaced with SidebarContent
- Refactored PreviewSidebar.tsx into a thin container shell — removed all inline model controls, replaced with ModelControlsPanel
- All 264 existing tests pass unchanged; TypeScript compiles with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Create layout-agnostic panel components** - `daa3634` (feat)
2. **Task 2: Update Sidebar.tsx and PreviewSidebar.tsx to be thin container shells** - `a74e693` (feat)

## Files Created/Modified
- `src/components/Panels/MapControlsPanel.tsx` - Layout-agnostic map view controls (SelectionInfo + GenerateButton), reads hasBbox from store
- `src/components/Panels/ModelControlsPanel.tsx` - Layout-agnostic model view controls (Back to Edit, ModelSizeSection, layer sections, ExportPanel), reads setShowPreview from store
- `src/components/Panels/SidebarContent.tsx` - View-driven content switcher: reads showPreview from store, ternary renders MapControlsPanel or ModelControlsPanel
- `src/components/Sidebar/Sidebar.tsx` - Now thin container shell: removed hasBbox prop and SelectionInfo/GenerateButton imports, delegates to SidebarContent
- `src/components/Preview/PreviewSidebar.tsx` - Now thin container shell: removed all section imports and setShowPreview read, delegates to ModelControlsPanel

## Decisions Made
- Panel components have zero container styles (no position, width, maxHeight, overflow, backdrop, shadow, zIndex) — container concerns belong to shell components
- SidebarContent uses conditional ternary rendering, not display:none, so only one panel mounts at a time
- GenerateButton.tsx and SelectionInfo.tsx remain at original paths — test at src/components/Sidebar/__tests__/GenerateButton.test.ts imports from '../GenerateButton' which must stay valid
- ModelControlsPanel reads setShowPreview directly from Zustand store rather than receiving it as a prop from PreviewSidebar

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- SidebarContent insertion point ready for any container to render
- Panel components are fully decoupled from layout — Phase 17 persistent sidebar can render SidebarContent without modification
- Foundation for Phase 16 Layout Components established

## Self-Check: PASSED

- FOUND: src/components/Panels/MapControlsPanel.tsx
- FOUND: src/components/Panels/ModelControlsPanel.tsx
- FOUND: src/components/Panels/SidebarContent.tsx
- FOUND: src/components/Sidebar/GenerateButton.tsx (preserved)
- FOUND: src/components/Sidebar/SelectionInfo.tsx (preserved)
- FOUND: commit daa3634 (Task 1)
- FOUND: commit a74e693 (Task 2)

---
*Phase: 15-content-architecture*
*Completed: 2026-03-02*
