# Phase 17: SplitLayout Rewrite - Context

**Gathered:** 2026-03-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Convert the sidebar from a floating overlay to a persistent column in the layout flow on tablet (220px) and desktop (260px). Ensure map tiles and R3F canvas resize correctly after layout changes. Mobile layout (BottomSheet + MobileViewToggle) is untouched.

</domain>

<decisions>
## Implementation Decisions

### Sidebar panel style
- Solid opaque dark background (e.g., rgb(17, 24, 39)) — no glassmorphism, no backdrop-blur, no transparency
- Edge-to-edge with no rounded corners — full-height column flush with viewport edges
- Keep the "MapMaker" header/branding bar at the top of the sidebar
- Sidebar content area scrolls independently (its own scrollbar) — map/preview are unaffected

### Sidebar position and boundary
- Sidebar positioned on the left side of the layout
- A subtle 1px vertical border line separates the sidebar from the map/preview content area (consistent with existing border style rgba(255,255,255,0.08))
- No shadow or gap — just the border line

### Map/preview split
- Draggable divider between map and preview remains on both tablet and desktop
- The divider splits the remaining space after the sidebar column
- Same split behavior as current desktop — user can resize map vs preview panes

### Tablet behavior
- All collapsible sections expanded by default (same as desktop) — scrolling handles overflow
- Sidebar always visible at 220px regardless of orientation (portrait or landscape)
- Draggable map/preview split on tablet, same as desktop — no full-width toggle mode
- Tablet and desktop differ only in sidebar width (220px vs 260px)

### Claude's Discretion
- PreviewSidebar (model controls overlay on right side of 3D preview) behavior on tablet — Claude evaluates available space and decides whether to keep the floating overlay or move model controls into the persistent sidebar on tablet
- Label/control layout adaptation at 220px width — Claude evaluates whether labels should stack above controls or wrap naturally on tablet

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useBreakpoint` hook (`src/hooks/useBreakpoint.ts`): Returns 'mobile' | 'tablet' | 'desktop' tier — already used by SplitLayout and Sidebar
- `SidebarContent` (`src/components/Panels/SidebarContent.tsx`): Layout-agnostic content switcher — can be hosted in any container
- `MapControlsPanel` / `ModelControlsPanel` (`src/components/Panels/`): Container-style-free panel components ready for any parent
- `BottomSheet` (`src/components/BottomSheet/BottomSheet.tsx`): Mobile-only, untouched by this phase
- `MobileViewToggle` (`src/components/MobileViewToggle/MobileViewToggle.tsx`): Controlled component with activeView + onToggle props

### Established Patterns
- `visibility: hidden` + `pointer-events: none` preserves R3F WebGL context across view transitions — must be maintained
- Panel components have ZERO container styles (Phase 15 decision) — container handles all positioning, padding, overflow
- `SidebarContent` renders `MapControlsPanel` unconditionally on non-mobile — left sidebar is map-only (Phase 15 decision)
- Model controls live exclusively in `PreviewSidebar` on tablet/desktop (Phase 15 decision)
- Zustand store tracks `deviceTier`, `mobileActiveView`, `showPreview` — all layout state is centralized

### Integration Points
- `SplitLayout.tsx`: Main layout orchestrator — needs rewrite to add sidebar column before map/preview split
- `Sidebar.tsx`: Currently renders `DesktopSidebar` (floating overlay) for non-mobile — must render persistent column instead
- `DesktopSidebar` inner component: position: absolute → layout flow column; loses glassmorphism, rounded corners, shadow
- `PreviewSidebar.tsx`: Floating overlay in preview pane — may need tablet-specific adjustment (Claude's discretion)
- MapLibre `resize()` must be called when sidebar column causes map container to resize
- R3F canvas must fill its container without 300x150 default artifact on any tier

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 17-splitlayout-rewrite*
*Context gathered: 2026-03-02*
