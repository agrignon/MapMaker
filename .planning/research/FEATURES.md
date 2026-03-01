# Feature Research

**Domain:** Responsive UI redesign — mobile bottom sheet, three-tier layout, contextual sidebar, view transitions (MapMaker v1.2)
**Researched:** 2026-02-28
**Confidence:** HIGH — bottom sheet patterns verified via NN/G, Material Design 3, Apple HIG, and live app behavior; breakpoint conventions confirmed via BrowserStack + Tailwind CSS docs; animation library assessed via official Motion docs; touch target sizes confirmed via WCAG 2.5.8 + Apple/Google HIG.

---

> **Scope note:** v1.0 and v1.1 shipped all pipeline features (terrain, buildings, roads, water, vegetation, STL export, Overture gap-fill). This file covers only the NEW features needed for v1.2: responsive three-tier layout, mobile bottom sheet, contextual sidebar, and transitions. Existing pipeline features are unchanged.
>
> **Existing layout baseline (before v1.2):**
> - Binary 768px breakpoint (`useIsMobile()` in both `SplitLayout.tsx` and `Sidebar.tsx`)
> - Mobile: tab bar switching between Map/3D Preview screens; fixed-height bottom sheet (static 45vh, no snap heights); `MobileSidebar` and `MobileTabBar` components
> - Desktop: floating overlay `PreviewSidebar` (absolute-positioned, collapsible toggle); `DesktopSidebar` (floating panel bottom-left); draggable split divider (25%–75%)
> - CSS: `index.css` uses Tailwind v4, `dvh`, `touch-action: manipulation`, `overscroll-behavior: none`; no CSS custom properties for layout, no container queries

---

## Responsive UI in Map/3D Web Apps — What the Ecosystem Expects

Map tools with controls panels (Google Maps, Apple Maps, Mapbox Studio, ArcGIS, Felt, Placemark) have converged on a consistent interaction model across device classes. Users of these apps arrive at MapMaker expecting that same interaction vocabulary. Deviating from it creates friction.

### The Dominant Pattern (HIGH confidence)

**Mobile:** Full-screen map is the primary surface. Controls live in a draggable bottom sheet that snaps to defined heights: peek (just enough to see a handle and title), half (useful content visible), full (all controls). The map is always behind the sheet and remains interactive unless the sheet is at full height.

**Tablet:** Split layout. Map takes 55–65% of width; persistent sidebar takes 35–45%. No tab bar, no bottom sheet. Controls and map coexist simultaneously. This is the "desktop-lite" mode — side-by-side is expected and natural at this width.

**Desktop:** Wide persistent sidebar (240–320px), always visible, anchored to one edge. No floating overlay panels. The sidebar is contextual — it changes its content based on what the user is doing (map editing vs. model preview).

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that map/3D-tool users assume exist. Missing = product feels broken or unfinished on that device class.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Bottom sheet with drag handle on mobile | Every map app (Google Maps, Apple Maps, Waze, Citymapper) uses this. Users reach for it instinctively. | MEDIUM | Needs pointer event handling, CSS transform-based position, snap-to-defined-heights logic. Existing static 45vh sheet is not draggable. |
| Three distinct snap heights: peek / half / full | Bottom sheet with only one stop feels broken — no way to reveal more without taking over the full screen. Users expect to pull partway. | MEDIUM | Peek ≈ 80–100px (handle + title + generate button visible); half ≈ 45–50vh (settings visible); full ≈ 85–92dvh (all controls). Values should clear iOS safe area at bottom. |
| Sheet does not cover the full map at peek and half | If the sheet covers the map, users can't see their selection. Map must remain usable at any snap height. | LOW | CSS positioning: sheet is `position: fixed; bottom: 0`. Map height stays 100dvh; sheet overlays it. Already works in current static sheet — confirm at new snap heights. |
| Drag handle with adequate touch target | Affordance that the sheet is draggable. Users won't discover drag-to-dismiss without a visible handle. Material Design requires a pill-shaped indicator centered at the top of the sheet. | LOW | 36px wide × 4px tall pill, centered. Touch target for the whole header should be ≥ 44px tall (Apple HIG minimum). |
| Persistent sidebar on tablet and desktop (not floating overlay) | At ≥ 768px, a floating overlay panel that can be dismissed is awkward. Users expect a persistent side panel. ArcGIS, Mapbox Studio, Felt all use this pattern. | MEDIUM | Replace `PreviewSidebar` (absolute-positioned floating panel with toggle button) with a sidebar that is always visible and part of the layout flow — not overlaid. |
| Contextual sidebar: map controls vs. model controls | Sidebar content should match the current view. Showing "Back to Edit" and model settings while the map is active is confusing. | MEDIUM | Two sidebar content trees: (1) map-view sidebar with location search, bbox info, Generate; (2) preview sidebar with model size, layers, export. Active view drives which is shown. Requires store state to determine active context. |
| Touch-optimized control sizing | Sliders, toggles, and buttons too small for reliable touch. Apple HIG: 44×44pt minimum. WCAG 2.5.8: 24×24px minimum. Current controls are desktop-sized. | MEDIUM | Audit all interactive elements in the control tree (`TerrainSection`, `BuildingsSection`, etc.). Add `min-height: 44px` or equivalent to touch targets. Increase slider thumb size on mobile via CSS. |
| Full-screen map and full-screen preview on mobile | At peek/half sheet, the map fills the rest of the screen. When the sheet is closed or at peek, the 3D preview should be equally accessible as a full-screen view — not hidden behind a tab bar that disappears. | MEDIUM | Current implementation hides the tab bar when no preview exists yet. The tab/toggle should be always accessible once the user has generated a model. |
| Safe area insets respected (iOS notch / home bar) | Bottom sheet and controls that clip behind the home indicator or notch feel broken on iPhone. | LOW | Use `env(safe-area-inset-bottom)` for bottom padding on sheet and sidebar. Already partially done in existing `MobileSidebar` with `max(8px, env(safe-area-inset-bottom, 8px))`. Needs extension to new snap system. |
| Clean three-tier breakpoints replacing binary 768px | Single 768px breakpoint produces jarring behavior on tablets (768–1024px). At 768px many tablets show a phone UI that is too cramped. | LOW | Define: mobile `< 768px`, tablet `768px–1199px`, desktop `≥ 1200px`. Remove duplicate `useIsMobile()` definitions from `SplitLayout.tsx` and `Sidebar.tsx`; centralize as a store value or context. |
| Smooth view transitions (not instant DOM swaps) | Instant appearance/disappearance of panels reads as a glitch. Users expect panels to animate in/out. The current `showPreview` toggle is instant. | MEDIUM | CSS transitions on `transform` (sheet snapping), `opacity` (panel fades), and `width` (sidebar reveal). Avoid animating `height` directly — use `transform: translateY()` for sheet, `transform: scaleX()` or `width` with `overflow: hidden` for sidebar. |

### Differentiators (Competitive Advantage)

Features beyond what users expect that make the interaction feel polished compared to other map/3D tools.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Sheet velocity-aware snap (flick gesture) | A fast upward flick snaps to the next higher stop; a fast downward flick snaps to the next lower stop. Without this, users must drag all the way to a position — feels sluggish. iOS Maps, Google Maps both do this. | HIGH | Requires tracking pointer velocity during drag (delta position / delta time over last N events). Snap target chosen by velocity threshold, not just final position. |
| Backdrop blur on bottom sheet | The frosted-glass look behind the bottom sheet makes the underlying map readable while the sheet is in focus. Already partially present in current `MobileSidebar` (`backdropFilter: blur(12px)`). | LOW | Extend to new snap-height system. Ensure performance: `backdrop-filter` on a large surface can be expensive on older devices. Test on mid-range Android. |
| Spring physics on sheet snap | Instead of a linear CSS transition, a spring-eased animation (e.g., `cubic-bezier(0.34, 1.56, 0.64, 1)`) on sheet snap feels like the sheet has weight. Differentiates from apps that just use `transition: transform 200ms linear`. | LOW | Pure CSS achievable with a well-tuned easing curve. No animation library required for this effect. |
| Sheet remains at last snap after navigation | If the user drags the sheet to "half" and then taps a layer toggle, the sheet should remain at "half" when they return — not reset to peek. This requires persisting snap height in component state (or store). | LOW | Local component state in the bottom sheet component. `useState<SnapHeight>('peek' or 'half' or 'full')`. Do NOT put snap height in Zustand — it is purely UI state. |
| Stale model indicator in sidebar (not just banner) | When the bbox changes after generation, the current `StaleIndicator` shows a banner in the preview area. On mobile, the indicator should appear in the bottom sheet itself — in the Generate button area — because the user is on the map, not the preview. | MEDIUM | Wire `generatedBboxKey` comparison to the Generate button display logic in `MobileSidebar`. Show "Regenerate" styling when stale, not just a banner in the preview canvas area. |
| Keyboard avoidance on mobile | When a text input (location search) is focused, the bottom sheet and/or map should shift to avoid the virtual keyboard. Without this, the keyboard covers the search field on some devices. | MEDIUM | Use `visualViewport` API to detect keyboard height and adjust layout. Alternative: `env(keyboard-inset-height)` CSS variable (Chrome 110+, not Safari). For safety, use the JavaScript `visualViewport.onresize` approach. |
| Sidebar collapse on tablet (icon-only mode) | On smaller tablets (768–900px), a full sidebar may be too wide. Collapsing to icon-only (48px wide with tooltips) lets users access controls without giving up too much map space. | HIGH | This pattern exists in ArcGIS and VS Code. Significant complexity: requires icon representation for every sidebar section, tooltip positioning, and two-state layout. Likely P3 for v1.2. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem like good responsive UI ideas but create real problems for a map/3D tool.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Pull-to-refresh gesture on bottom sheet | Users familiar with native apps expect pull-down to refresh | Conflicts with downward drag-to-dismiss on the sheet; impossible to distinguish intent without complex heuristics; also confusing because "refresh" has no meaning in MapMaker's model | No pull-to-refresh. Map bbox change + Regenerate button is the correct refresh affordance. |
| Swipe-left/right between Map and Preview on mobile | Natural gesture on mobile; used in many photo/map apps | MapLibre GL JS and Three.js R3F both intercept horizontal pan events for map panning and 3D orbit. A horizontal swipe gesture cannot be reliably distinguished from a map pan or 3D rotation. Causes accidental view switches while interacting with map/preview. | Use explicit tab/toggle buttons for switching between Map and Preview. Gesture-based switching only if both canvases are disabled/frozen during the swipe — too complex. |
| Real-time CSS breakpoint from `window.resize` | Seems like the reactive way to handle breakpoints in React | `window.resize` fires at extremely high frequency; can cause 50+ re-renders per second during a resize drag; can cause flickering on the layout system; current `useIsMobile` uses MediaQueryList which fires once at breakpoint crossing | Use `window.matchMedia()` with `addEventListener('change', ...)`. Already used in existing `useIsMobile` — extend this pattern to three breakpoints; do not add resize listeners. |
| Animate height of the bottom sheet content area | Seems necessary for expanding/collapsing sections inside the sheet | `height` animation is expensive (triggers layout reflow on every frame). Combined with a sheet that is already animating position, this causes jank on mobile, especially on mid-range Android GPUs. | Animate `max-height` with `overflow: hidden` for internal collapsibles (acceptable for single elements). For the sheet snap animation itself, animate only `transform: translateY()` — no height animation. |
| Bottom sheet on tablet landscape | Seems like a natural thing to keep across breakpoints | At tablet landscape (1024px+), the sheet blocks too much of the map. This breakpoint should use the sidebar layout, not the sheet. | Sheet is mobile-only (`< 768px`). Tablet always uses persistent sidebar regardless of orientation. |
| Framer Motion / react-spring as animation dependency | Polished spring animations; used in many React apps | Adds 30–50KB+ to bundle. MapMaker already has Three.js (R3F), MapLibre, and several large dependencies. For the animations needed (slide, fade, snap), CSS transitions with well-tuned easing curves (`cubic-bezier`) achieve equivalent results without a dependency. | CSS custom properties + `transition` + `transform: translateY()` for the sheet. `transition: opacity, transform` for sidebars. Only consider an animation library if CSS proves insufficient for a specific interaction (e.g., gesture-integrated spring). |
| Hiding the map entirely on mobile at full sheet | Some apps show only the sheet content in "full" mode | MapMaker's core value is the map — the user needs spatial context while adjusting controls. If the map is completely hidden, the user can't see what their Generate button will produce. | At full snap height, the sheet covers most of the map but the map remains rendered beneath (for context). Or: at full snap, show a slim map thumbnail at the top, then full controls. Do not completely unmount the map. |

---

## Feature Dependencies

```
[Three-Tier Breakpoint System]
    └──required by──> [Bottom Sheet (mobile only)]
    └──required by──> [Persistent Sidebar (tablet + desktop)]
    └──required by──> [Contextual Sidebar content routing]
    └──replaces──> [useIsMobile() binary hook in SplitLayout.tsx and Sidebar.tsx]

[Bottom Sheet — Three Snap Heights]
    └──requires──> [Drag handle with pointer event capture]
    └──requires──> [CSS transform: translateY() snap logic]
    └──requires──> [Snap height state (local component state)]
    └──enhances──> [Sheet velocity snap (flick gesture)]
    └──requires──> [Safe area inset padding at bottom]
    └──conflict──> [MobileTabBar (current) — tab bar replaced by sheet toggle]

[Contextual Sidebar]
    └──requires──> [showPreview store state (already exists)]
    └──requires──> [Persistent Sidebar layout (tablet + desktop)]
    └──content-branch-1──> [Map sidebar: search, bbox info, GenerateButton]
    └──content-branch-2──> [Preview sidebar: model size, layers, ExportPanel]
    └──replaces──> [PreviewSidebar floating overlay (current)]
    └──replaces──> [DesktopSidebar floating overlay (current)]

[View Transitions]
    └──requires──> [CSS transitions on transform, opacity, width]
    └──applied to──> [Bottom Sheet snap animation]
    └──applied to──> [Sidebar reveal/hide]
    └──applied to──> [Map/Preview view switch on mobile]
    └──conflict──> [Animating height — use translateY instead]

[Touch-Optimized Controls]
    └──requires──> [Audit of all interactive elements in TerrainSection, BuildingsSection, RoadsSection, WaterSection, VegetationSection, ExportPanel, ModelSizeSection]
    └──independent of──> [Layout breakpoint system — can be done separately]

[Mobile Full-Screen View Toggle]
    └──requires──> [Three-Tier Breakpoint System]
    └──requires──> [Bottom Sheet (sheet at peek = map is full-screen equivalent)]
    └──replaces──> [MobileTabBar component]

[Keyboard Avoidance]
    └──requires──> [visualViewport API integration]
    └──applies to──> [Bottom Sheet when search input is focused]
    └──independent of──> [Snap heights — additive adjustment on top]
```

### Dependency Notes

- **Breakpoint system must come first:** Both the bottom sheet (mobile-only) and the persistent sidebar (tablet/desktop) depend on the correct breakpoint being active. The current `useIsMobile()` hook must be replaced with a three-tier hook before any layout components are changed.
- **Bottom sheet replaces the static `MobileSidebar`:** Current `MobileSidebar` is a fixed `position: fixed; bottom: 0; max-height: 45vh` panel with no snapping. The new bottom sheet component completely replaces this. Content (location info, GenerateButton) moves into the sheet.
- **Persistent sidebar replaces the `PreviewSidebar` floating overlay:** The floating `PreviewSidebar` (absolute positioned, with the collapse toggle button `›`/`‹`) is an anti-pattern at tablet/desktop widths. The new sidebar is part of the layout flow, not a floating overlay.
- **Contextual sidebar depends on `showPreview` state:** The sidebar content switches based on `showPreview` in the Zustand store. This connection already exists (both old sidebars read `showPreview`). The new contextual sidebar is the same logic, applied to a persistent sidebar component.
- **Tab bar (`MobileTabBar`) is replaced, not extended:** The tab bar pattern works at a coarse level but does not integrate with a snap-height sheet. On mobile, the "switch to preview" affordance should be part of the sheet header or a floating FAB — not a fixed tab bar that competes for vertical space with the sheet.
- **`visibility: hidden` trick for PreviewCanvas must be preserved:** The existing behavior of keeping the R3F canvas rendered (with `visibility: hidden`) when switching Back to Edit must continue to work in the new layout. The layout restructuring must not change when `PreviewCanvas` mounts/unmounts.

---

## MVP Definition

### Launch With (v1.2)

Minimum set that makes MapMaker feel native on mobile, natural on tablet, and polished on desktop.

- [ ] **Three-tier breakpoint hook** — Replace `useIsMobile()` with `useBreakpoint()` returning `'mobile' | 'tablet' | 'desktop'`. Single implementation, used everywhere. Define: mobile `< 768px`, tablet `768–1199px`, desktop `≥ 1200px`.
- [ ] **Mobile bottom sheet with three snap heights** — Draggable sheet with peek (~80px), half (~45vh), full (~88dvh). Snap on release. Drag handle with ≥ 44px touch target. Sheet contains all map controls (search, bbox info, Generate).
- [ ] **Bottom sheet snap animation** — `transform: translateY()` transition with spring-like easing (`cubic-bezier(0.34, 1.56, 0.64, 1)`), ~250ms duration.
- [ ] **Full-screen map at peek/half on mobile** — At peek and half snap heights, the map fills the area above the sheet. No tab bar covering the map.
- [ ] **Full-screen preview toggle on mobile** — A button (or sheet-level control) that switches to the 3D preview as a full-screen view when a model has been generated. Back button returns to map + sheet.
- [ ] **Persistent contextual sidebar on tablet** — At 768–1199px, a fixed-width sidebar (280px) replaces the floating overlay. Content switches between map controls and model controls based on `showPreview`.
- [ ] **Persistent contextual sidebar on desktop** — At ≥ 1200px, wider sidebar (300–320px). Same contextual switching. Replaces both the floating `DesktopSidebar` and floating `PreviewSidebar`.
- [ ] **Touch target audit** — All controls (sliders, toggles, buttons, section headers) have min 44×44px touch area on mobile. Achieved via `min-height`, `padding`, or `touch-target` utility.
- [ ] **View switch transition** — When switching from Map to Preview on mobile, a crossfade or slide transition (200–300ms) replaces the instant DOM swap.
- [ ] **Safe area compliance** — `env(safe-area-inset-bottom)` applied consistently to sheet, sidebar footer, and any bottom-anchored controls.

### Add After Validation (v1.x)

- [ ] **Velocity-aware sheet snap (flick gesture)** — Upward flick jumps one snap point; downward flick snaps down. Trigger: user feedback that dragging slowly to each stop is tedious.
- [ ] **Keyboard avoidance** — `visualViewport.onresize` adjusts bottom sheet position when virtual keyboard appears. Trigger: reports of search field covered by keyboard on mobile.
- [ ] **Stale model indicator in sheet** — When bbox changes after generation, the Generate button area in the mobile sheet shows "Regenerate" styling instead of the existing banner-in-preview pattern. Trigger: user confusion about when to regenerate on mobile.
- [ ] **Sidebar collapse to icon-only on small tablet** — At 768–900px landscape, sidebar collapses to 48px icon rail. Trigger: users on small tablets reporting the sidebar is too wide.

### Future Consideration (v2+)

- [ ] **Full View Transitions API integration** — Use `document.startViewTransition()` for navigation between views. Currently limited browser support and complex coordination with R3F canvas. Defer.
- [ ] **Tablet landscape special layout** — Different split ratio (70/30 map/sidebar) at landscape tablet. Low priority — sidebar at 280px already works acceptably at 768px.
- [ ] **Drag-to-resize sidebar on desktop** — Allow user to drag the sidebar/map border. Exists today in the split view. For the persistent sidebar, this adds complexity without clear user demand.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Three-tier breakpoint hook | HIGH | LOW | P1 |
| Mobile bottom sheet (3 snap heights) | HIGH | MEDIUM | P1 |
| Bottom sheet drag + snap animation | HIGH | MEDIUM | P1 |
| Full-screen map at peek/half | HIGH | LOW | P1 |
| Preview toggle on mobile | HIGH | LOW | P1 |
| Persistent contextual sidebar (tablet + desktop) | HIGH | MEDIUM | P1 |
| Touch target audit across all controls | HIGH | MEDIUM | P1 |
| View switch transition (Map ↔ Preview) | MEDIUM | LOW | P1 |
| Safe area insets | HIGH | LOW | P1 |
| Velocity-aware flick snap | HIGH | MEDIUM | P2 |
| Keyboard avoidance | MEDIUM | MEDIUM | P2 |
| Stale model indicator in sheet | MEDIUM | LOW | P2 |
| Sidebar icon-only collapse (small tablet) | MEDIUM | HIGH | P3 |
| Full View Transitions API | LOW | HIGH | P3 |
| Drag-to-resize persistent sidebar | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for v1.2 launch
- P2: Add when core works; polish
- P3: Future consideration

---

## Competitor / Reference App Analysis

| Pattern | Google Maps (mobile) | Apple Maps (mobile) | ArcGIS Instant Apps | MapMaker v1.2 plan |
|---------|---------------------|--------------------|--------------------|-------------------|
| Mobile controls location | Bottom sheet | Bottom sheet | Bottom sheet | Bottom sheet |
| Sheet snap heights | 3 (peek/half/full) | 3 (peek/half/full) | 2 (collapsed/expanded) | 3 (peek/half/full) |
| Velocity-aware snap (flick) | Yes | Yes | No | P2 |
| Tablet layout | Split (map + sidebar) | Split (map + sidebar) | Split (map + sidebar) | Split (map + sidebar) |
| Desktop sidebar | Persistent, left-anchored | Persistent, left-anchored | Persistent, right-anchored | Persistent, right-anchored |
| Contextual sidebar content | Yes (search vs. place detail) | Yes (search vs. route vs. place) | Yes (map tools vs. layer panel) | Yes (map controls vs. model controls) |
| Touch targets | 44px+ | 44px+ | 44px+ | 44px+ (after audit) |
| Backdrop blur on sheet | Yes | Yes | No | Yes (already partial) |
| Transition on view switch | Slide/fade | Slide/fade | Instant | Fade (v1.2) |

---

## Implementation Notes

### Bottom Sheet Implementation Strategy

**Recommended approach: CSS transform + pointer events, no animation library**

```css
.bottom-sheet {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  border-radius: 14px 14px 0 0;
  transform: translateY(calc(100% - var(--snap-height)));
  transition: transform 250ms cubic-bezier(0.34, 1.56, 0.64, 1);
  will-change: transform;
}
```

Snap heights as CSS custom properties on the sheet element:
- `--snap-peek: calc(100% - 88px)` (handle + title + generate button)
- `--snap-half: calc(100% - 45vh)`
- `--snap-full: calc(100% - 88dvh)`

During drag: temporarily disable `transition` and update `transform` directly via JS. On pointer-up: re-enable `transition`, set `transform` to the nearest snap point.

**Why not Framer Motion / react-spring:**
- Adds 30–50KB to an already large bundle (Three.js + MapLibre = ~1.5MB)
- CSS transitions achieve equivalent results for this use case
- No dependency upgrade risk
- Works on older Android WebView where JS animation performance is poor

**Why not CSS scroll snap:**
- Scroll snap is designed for scroll containers; the sheet is not a scroll-snapping container — it contains a scrollable area inside it
- Mixing scroll-snap-based sheet position with internal scrollable content (the controls list) requires complex nested scroll handling
- Pointer event capture approach is more straightforward and widely tested

### Breakpoint Strategy

Three-tier, MediaQueryList-based, centralized:

```typescript
// src/hooks/useBreakpoint.ts
type Breakpoint = 'mobile' | 'tablet' | 'desktop';

export function useBreakpoint(): Breakpoint {
  // MediaQueryList listeners, not window.resize
  // mobile: < 768px
  // tablet: 768–1199px
  // desktop: >= 1200px
}
```

Replace all instances of `useIsMobile()` (currently in `SplitLayout.tsx` and `Sidebar.tsx`) with `useBreakpoint()`. Consider putting the resolved breakpoint in Zustand if more than ~4 components need it, to avoid many parallel MediaQueryList listeners.

### Touch Target Audit — Components to Update

Every interactive element in these files needs to be checked for `min-height: 44px` compliance on mobile:

- `src/components/Preview/CollapsibleSection.tsx` — section headers are tap targets
- `src/components/Preview/TerrainSection.tsx` — toggles, sliders
- `src/components/Preview/BuildingsSection.tsx` — toggles, sliders
- `src/components/Preview/RoadsSection.tsx` — toggles, style selector
- `src/components/Preview/WaterSection.tsx` — toggles
- `src/components/Preview/VegetationSection.tsx` — toggles
- `src/components/Preview/ModelSizeSection.tsx` — number inputs, unit switcher
- `src/components/Preview/ExportPanel.tsx` — export button (probably fine), format options
- `src/components/Map/DrawButton.tsx` — map control button
- `src/components/Map/SearchOverlay.tsx` — search input and results

CSS approach: Tailwind utility class `touch-target` or explicit `min-h-[44px]` on all interactive elements. Do not rely on the element's visual size alone — add padding to reach 44px without changing visual layout.

---

## Sources

- [NN/G Bottom Sheets: Definition and UX Guidelines](https://www.nngroup.com/articles/bottom-sheet/) — HIGH confidence, authoritative UX research
- [Material Design 3 — Transitions](https://m3.material.io/styles/motion/transitions) — HIGH confidence, official Google design spec
- [Material Design — Bottom Sheets](https://m1.material.io/components/bottom-sheets.html) — HIGH confidence, established component spec
- [LogRocket — How to design bottom sheets for optimized UX](https://blog.logrocket.com/ux-design/bottom-sheets-optimized-ux/) — MEDIUM confidence, verified against NN/G
- [Native-like bottom sheets on the web — CSS scroll snap](https://viliket.github.io/posts/native-like-bottom-sheets-on-the-web/) — MEDIUM confidence, implementation reference
- [BrowserStack — Responsive Design Breakpoints 2025](https://www.browserstack.com/guide/responsive-design-breakpoints) — MEDIUM confidence, verified against Tailwind docs
- [Tailwind CSS — Responsive Design](https://tailwindcss.com/docs/responsive-design) — HIGH confidence, official docs
- [Motion for React (Framer Motion) — Get Started](https://motion.dev/docs/react) — HIGH confidence, official docs (used to evaluate and rule out)
- [react-modal-sheet (GitHub)](https://github.com/Temzasse/react-modal-sheet) — MEDIUM confidence, reference for what a full-featured sheet library provides
- [Accessible Tap Target Sizes — Smashing Magazine](https://www.smashingmagazine.com/2023/04/accessible-tap-target-sizes-rage-taps-clicks/) — HIGH confidence, comprehensive standards reference
- [WCAG 2.5.8 Target Size Minimum](https://www.allaccessible.org/blog/wcag-258-target-size-minimum-implementation-guide) — HIGH confidence, W3C standard
- [ArcGIS Instant Apps Sidebar](https://doc.arcgis.com/en/instant-apps/latest/create-apps/sidebar.htm) — HIGH confidence, direct reference for contextual sidebar in map tools
- [View Transitions API — patterns.dev](https://www.patterns.dev/vanilla/view-transitions/) — MEDIUM confidence, evaluated and deferred to v2+
- MapMaker v1.1 codebase (`src/components/Layout/SplitLayout.tsx`, `src/components/Sidebar/Sidebar.tsx`, `src/components/Preview/PreviewSidebar.tsx`) — HIGH confidence, direct source of current layout constraints and integration points

---
*Feature research for: MapMaker v1.2 — Responsive UI redesign (mobile bottom sheet, three-tier layout, contextual sidebar, view transitions)*
*Researched: 2026-02-28*
