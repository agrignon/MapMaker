---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Responsive UI
status: unknown
last_updated: "2026-03-02T21:50:29.841Z"
progress:
  total_phases: 3
  completed_phases: 2
  total_plans: 7
  completed_plans: 6
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-28)

**Core value:** Users can turn any place in the world into a physical 3D-printed model with full control over features and dimensions
**Current focus:** Phase 16 — Layout Components (v1.2 Responsive UI)

## Current Position

Phase: 16 of 18 (Layout Components)
Plan: 02 complete — Phase 16 Plan 02 DONE
Status: In Progress
Last activity: 2026-03-02 — Plan 16-02 complete; MobileViewToggle floating toggle button with 9 tests; fixed vitest.config.ts JSX plugin

Progress: [████░░░░░░] 28%

## Performance Metrics

**Velocity:**
- Total plans completed: 2 (v1.2)
- Previous milestones: 30 plans across v1.0 + v1.1

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 14-foundation | 2 | 3 min | 4 files/plan |
| 15-content-architecture | 1 | 2 min | 5 files/plan |
| 16-layout-components | 2 | 6 min | 3.5 files/plan |

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

Recent decisions affecting v1.2:
- Use `vaul@1.1.2` for bottom sheet — only library with `modal={false}` keeping R3F/MapLibre interactive behind sheet
- Use `motion@12.34.3` for transitions — needed for exit animations and spring physics on panel resize
- Three-tier breakpoints: mobile <768px, tablet 768-1023px, desktop 1024px+
- Never use `display: none` on R3F canvas ancestors — always `visibility: hidden + pointer-events: none`
- Phase ordering is dependency-locked: Foundation → Content Architecture → Layout Components → SplitLayout → Polish
- [Phase 14-foundation]: Synchronous getTier() initialization in store avoids hydration flash
- [Phase 14-foundation]: matchMedia mock returns matches: false by default so getTier() returns mobile in all tests
- [Phase 14-foundation]: CSS custom properties on :root centralize safe area values for component consumption
- [Phase 14-foundation]: Both SplitLayout and Sidebar derive isMobile as tier === 'mobile'; tablet follows desktop layout until Phase 17
- [Phase 14-foundation]: DevBadge reads deviceTier from Zustand store rather than calling useBreakpoint — avoids duplicate hook instantiation
- [Phase 15-content-architecture]: Panel components have ZERO container styles — no position, width, maxHeight, overflow, backdrop, shadow, zIndex; container concerns belong to shell components
- [Phase 15-content-architecture]: SidebarContent uses conditional ternary rendering (not display:none) so only one panel mounts at a time
- [Phase 15-content-architecture]: GenerateButton.tsx and SelectionInfo.tsx remain at original paths to preserve test import paths
- [Phase 15-content-architecture]: ModelControlsPanel reads setShowPreview directly from store — not passed as prop from container
- [Phase 15-content-architecture]: SidebarContent unconditionally renders MapControlsPanel — left sidebar is map-only; model controls belong exclusively to PreviewSidebar
- [Phase 15-content-architecture]: SplitLayout tracks prevIsMobile ref alongside prevShowPreview to handle all tab-switching transition cases (isMobile false-to-true while showPreview active)
- [Phase 16-layout-components]: snapPoints=[80, 0.45, 1] uses numeric fractions not CSS strings — vaul only documents px strings and 0-1 fractions as valid values
- [Phase 16-layout-components]: No Drawer.Overlay rendered in BottomSheet — omitting avoids pointer-events interception at peek/half snap points
- [Phase 16-layout-components]: onOpenChange safety net re-snaps to peek on double-tap close (GitHub #362 vaul bug)
- [Phase 16-layout-components]: React.createElement in vi.mock factory — hoisted mocks run before module scope so JSX needs explicit React import
- [Phase 16-layout-components]: MobileViewToggle is a controlled component (activeView + onToggle props) not store-driven — SplitLayout manages activeTab state and will wire it in Plan 03
- [Phase 16-layout-components]: matchMedia mock restoration uses explicit window.matchMedia = defaultMatchMedia in afterEach instead of vi.restoreAllMocks() which breaks Object.defineProperty-based mocks

### Pending Todos

None.

### Blockers/Concerns

- [Phase 16]: OrbitControls/MapLibre/vaul three-way touch event conflict must be validated on real iOS hardware — Chrome DevTools does not enforce `touch-action` the same way
- [Phase 18]: Touch target audit may require structural (not just CSS) changes on CollapsibleSection and slider components

## Session Continuity

Last session: 2026-03-02
Stopped at: Completed 16-02-PLAN.md (Phase 16 Plan 02 complete)
Resume file: None
