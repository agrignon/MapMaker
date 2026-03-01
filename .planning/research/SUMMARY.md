# Project Research Summary

**Project:** MapMaker v1.2 — Responsive UI
**Domain:** Responsive three-tier layout for a React 19 + Three.js R3F + MapLibre GL JS map/3D app
**Researched:** 2026-02-28
**Confidence:** HIGH

## Executive Summary

MapMaker v1.2 is a responsive UI overhaul of a shipped 3D terrain generator. The current layout is functional but crude: a binary 768px breakpoint, a static (non-draggable) bottom sheet, floating overlay sidebars on desktop, and two duplicated `useIsMobile` hooks. The goal is to bring the app in line with the interaction vocabulary established by Google Maps, Apple Maps, ArcGIS, and Mapbox Studio — all of which converge on a bottom sheet with snap points on mobile, a persistent split-panel sidebar on tablet, and a persistent contextual sidebar on desktop. Research confirms this is the correct model for a map/3D tool with controls panels, and that users arrive at MapMaker expecting this vocabulary. Deviating from it creates friction; implementing it makes the app feel native on every device class.

The recommended implementation approach is layered and dependency-ordered: first establish a single-source three-tier breakpoint system and fix the WebGL visibility pattern, then extract content from layout-coupled sidebar components, then build the new layout shell (vaul-based bottom sheet on mobile, ContextualSidebar on tablet/desktop), then rewrite SplitLayout to orchestrate all three tiers, and finally add transitions and touch polish. This order is dictated by hard architectural dependencies — the breakpoint hook is required by every layout component, and content extraction is required before any layout container can accept sidebar content. The new stack additions are minimal: `vaul@1.1.2` for the bottom sheet and `motion@12.34.3` for transitions, both confirmed compatible with React 19 and all existing dependencies.

The dominant risk in this milestone is the intersection of three concurrent touch event consumers: OrbitControls (`touch-action: none` on the R3F canvas), MapLibre DragPanHandler (`setPointerCapture` on first pointerdown), and the vaul bottom sheet gesture recognizer. On iOS, this conflict is not resolved by default and requires deliberate DOM z-layering and pointer-event gating. A second critical risk is the R3F canvas behavior under `display: none` — it initializes at 300x150px and cannot recover without a remount — meaning the `visibility: hidden` pattern must be extended consistently to the mobile layout path. Both of these must be addressed in Phases 1 and 2 before any polishing work begins. Both require validation on real iOS hardware, not Chrome DevTools touch simulation.

---

## Key Findings

### Recommended Stack

The existing stack (React 19, Three.js R3F, Zustand, Vite 6, Tailwind CSS v4, MapLibre GL JS, react-resizable-panels) requires only two new dependencies for v1.2. `vaul@1.1.2` provides the bottom sheet with iOS-style snap points, drag gestures, velocity-aware snapping, and a `modal={false}` prop that is critical for keeping the R3F canvas and MapLibre map interactive behind the sheet — no other bottom sheet library offers this combination. `motion@12.34.3` (formerly Framer Motion, now independent) provides `AnimatePresence` and the `layout` prop for coordinating enter/exit animations and panel resize reflows that CSS transitions alone cannot handle. Breakpoints and touch targets are handled by existing Tailwind v4 utilities and a new 25-line `useBreakpoint` custom hook — no additional libraries needed.

The stack research explicitly rules out: `react-spring-bottom-sheet` (unmaintained since 2022, conflicting peer deps), custom bottom sheet implementations from scratch (300+ lines of pointer math that consistently gets iOS momentum wrong), `@use-gesture/react` upfront (vaul handles all sheet gestures), `tailwindcss-animate` (deprecated in Tailwind v4), `react-responsive` (wraps matchMedia in 3 KB for what 25 lines achieves), and the React `<ViewTransition>` experimental API (canary-only as of Feb 2026, not stable in React 19 production).

**Core technologies:**
- `vaul@1.1.2`: Bottom sheet with snap points — only library that provides `modal={false}` (essential for R3F/MapLibre interactivity), velocity-aware snap, and iOS rubber-band physics without custom implementation
- `motion@12.34.3`: View transition animations — needed for exit animations and layout-change coordination that CSS transitions cannot express (conditional rendering exit, spring physics on panel resize)
- Tailwind CSS v4 `@theme` (existing): Three-tier breakpoints via `--breakpoint-md: 48rem` and `--breakpoint-lg: 64rem`; no new library
- Custom `useBreakpoint` hook (new, no library): Typed `'mobile' | 'tablet' | 'desktop'` return; MediaQueryList-based, not window.resize

See `.planning/research/STACK.md` for version compatibility matrix, alternatives analysis, and pattern-by-layout-variant implementation guides.

### Expected Features

Map/3D tool users arrive with clear expectations set by Google Maps, Apple Maps, ArcGIS, and Mapbox Studio. All four converge on the same interaction vocabulary across device classes. Research confirms that deviating from this vocabulary creates friction, and that implementing it for MapMaker v1.2 is achievable within a single milestone.

**Must have (P1 — table stakes for v1.2 launch):**
- Draggable bottom sheet with peek (~80px) / half (~45dvh) / full (~85dvh) snap heights on mobile — the static 45vh sheet in v1.1 fails user expectation
- Sheet drag handle with minimum 44px touch target — affordance that the sheet is draggable; users will not discover drag without it
- Full-screen map visible at peek and half snap heights — map must remain usable behind the sheet
- Persistent contextual sidebar on tablet (768–1199px) and desktop (≥1200px) — floating overlay panels are an anti-pattern at these widths
- Contextual sidebar content switching: map controls vs. model controls driven by existing `showPreview` state
- Three-tier breakpoint hook replacing binary `useIsMobile` — foundation for all layout work
- Touch target audit: 44px minimum tap targets across all interactive controls (sliders, toggles, section headers)
- Safe area inset compliance (iOS notch/home bar) via `env(safe-area-inset-bottom)` and `viewport-fit=cover`
- Smooth view transitions (200–300ms crossfade) replacing instant DOM swaps between map and preview

**Should have (P2 — after core works, polish):**
- Velocity-aware flick snap on bottom sheet (upward fling jumps to next snap point)
- Keyboard avoidance via `visualViewport.onresize` when search input receives focus
- Stale model indicator surfaced in bottom sheet Generate button area on mobile

**Defer (v2+):**
- Full View Transitions API (`document.startViewTransition()`) — limited browser support and complex R3F canvas coordination
- Sidebar icon-only collapse mode on small tablets (768–900px) — significant implementation complexity, P3
- Drag-to-resize persistent sidebar on desktop

**Anti-features (confirmed problematic, do not implement):**
- Pull-to-refresh gesture on bottom sheet — conflicts with downward drag-to-dismiss; intent is ambiguous
- Swipe left/right between Map and Preview on mobile — MapLibre and R3F both intercept horizontal pan events; cannot reliably distinguish from map pan and 3D orbit
- Bottom sheet on tablet — sheet blocks too much map area; tablet always uses persistent sidebar regardless of orientation
- Animating `height` of the bottom sheet content area — triggers layout reflow on every frame; use `transform: translateY()` for all sheet position changes

See `.planning/research/FEATURES.md` for feature dependency diagram, competitor analysis table, and implementation notes per feature.

### Architecture Approach

The architecture is a layer-by-layer replacement of the existing layout system through a deliberate sequence of refactors. The core insight is that `Sidebar.tsx` and `PreviewSidebar.tsx` currently own both their content AND their positioning — this coupling prevents content from being placed in different layout containers. The prerequisite for all layout work is extracting `MapSidebarContent` and `PreviewSidebarContent` as pure, positioning-agnostic components. Once extracted, the layout system decides where to place them based on the active breakpoint tier.

The R3F canvas visibility constraint runs through every layout decision: never use `display: none` on any ancestor of the R3F `<Canvas>` — always use `visibility: hidden + pointer-events: none` to preserve WebGL context. This must be extended to the mobile layout path in Phase 1 before any other layout work begins.

**Major components:**
1. `useBreakpoint` hook (new) — single source of truth for `'mobile' | 'tablet' | 'desktop'` tier; replaces two duplicated `useIsMobile(768)` definitions in `SplitLayout.tsx` and `Sidebar.tsx`
2. `BottomSheet` (new, mobile only) — vaul-based, 3 snap points, `modal={false}`, `dismissible={false}`; renders `MapSidebarContent` or `PreviewSidebarContent` based on `showPreview`; snap height as local state
3. `ContextualSidebar` (new, tablet/desktop) — persistent sidebar column (220px tablet / 260px desktop); same contextual content switching via `showPreview`
4. `MobileViewToggle` (new) — replaces `MobileTabBar`; sets `activeView` in mapStore; drives `visibility` toggling for WebGL preservation
5. `SplitLayout` (rewrite) — orchestrates three-tier layout; mobile: absolute-position view stack + BottomSheet portal; tablet/desktop: flex row with ContextualSidebar + split columns
6. `MapSidebarContent` / `PreviewSidebarContent` (extracted) — pure content components; no positioning logic; used by both BottomSheet (mobile) and ContextualSidebar (tablet/desktop)
7. `uiStore` (new Zustand slice) — `sidebarCollapsed` for future use; keeps `sheetSnap` local in BottomSheet to avoid polluting mapStore's 64 fields
8. `mapStore` additions — `activeView: 'map' | 'preview'` field; `setActiveView` action; auto-switches to `'preview'` when `showPreview` transitions false → true

**MapLibre resize coordination:** Call `map.resize()` with a 150–200ms delay after any layout change (view toggle, sidebar open/close, tier change) to let CSS transitions settle before MapLibre redraws tiles.

See `.planning/research/ARCHITECTURE.md` for full data flow diagrams, build order, anti-pattern analysis, and implementation code samples per pattern.

### Critical Pitfalls

1. **R3F canvas initializes at 300x150 under `display: none`** — Never use `display: none` on any ancestor of the R3F canvas. The current mobile branch in SplitLayout uses display toggling; this must be converted to `visibility: hidden + pointer-events: none` in Phase 1. Verify by tab-switching on a real mobile device and confirming the canvas fills the panel on return.

2. **OrbitControls sets `touch-action: none` on canvas, blocking bottom sheet drag** — Confirmed upstream issue in drei #1233 and three.js #16254; no opt-out. The bottom sheet drag handle must sit above the canvas in DOM z-order with `pointer-events: auto` and call `e.stopPropagation()`. Additionally, toggle `pointer-events: none` on the canvas container via Zustand state during active sheet drag. Test only on real iOS hardware — Chrome DevTools does not enforce `touch-action` the same way.

3. **MapLibre DragPanHandler races with bottom sheet drag for the same touch stream** — MapLibre calls `setPointerCapture` on first `pointerdown`, claiming exclusive ownership of the touch sequence. The sheet drag handle must call `e.stopPropagation()` before MapLibre's listener fires. Disable MapLibre `dragPan` when the sheet is in full-height position (map invisible). Design this gesture boundary explicitly before wiring gesture detection in Phase 2.

4. **iOS Safari `100vh` overflow and safe area insets require explicit setup** — `100vh` includes browser chrome on iOS Safari; use `100dvh` with `100vh` fallback everywhere. Add `viewport-fit=cover` to `<meta name="viewport">` in `index.html` — without it, all `env(safe-area-inset-*)` values return 0. This setup belongs in Phase 1 as a global foundation, not Phase 2.

5. **Animating `width`/`height` on the MapLibre container triggers per-frame tile reloads** — MapLibre v3+'s ResizeObserver fires on every frame of a width/height CSS transition, causing continuous tile re-renders and jank on mobile. Use `transform: translateX()` for sidebar slide animations (compositor thread only). Call `map.resize()` once on `transitionend` if container dimensions genuinely change. Never animate map container layout dimensions.

6. **iOS rubber banding corrupts bottom sheet snap position** — iOS's elastic overscroll applies above CSS `overscroll-behavior: none` in some versions. Clamp the sheet's `translateY` transform in the gesture handler to valid snap-point range before updating the DOM. Measure velocity over the last 100ms only (not full gesture) to avoid rubber-band frames inflating perceived velocity.

---

## Implications for Roadmap

Based on the combined research, the milestone maps to six phases ordered strictly by dependency. The first three phases are pure refactors with no visible user-facing change — they establish the foundation that every subsequent phase requires.

### Phase 1: Foundation — Breakpoints, Store Fields, CSS, Visibility Pattern
**Rationale:** All subsequent phases depend on the `useBreakpoint` hook, the `activeView` store field, the three-tier CSS theme variables, the `viewport-fit=cover` viewport meta tag, and the `visibility: hidden` pattern extended to mobile. These changes are invisible to users but are structural prerequisites for all layout work. Without them, every layout component will either use stale breakpoint values or risk WebGL context loss.
**Delivers:** `src/hooks/useBreakpoint.ts` with typed `'mobile' | 'tablet' | 'desktop'` tiers; `activeView: 'map' | 'preview'` field and `setActiveView` action in mapStore; `src/store/uiStore.ts` with `sidebarCollapsed`; `@theme` breakpoint variables in `index.css` (md: 48rem / lg: 64rem); `viewport-fit=cover` in `index.html`; `visibility: hidden + pointer-events: none` pattern confirmed on all mobile canvas container code paths
**Addresses:** Safe area inset foundation; iOS dvh fix; breakpoint consolidation prerequisite
**Avoids:** Pitfall 4 (iOS viewport/safe-area — must set `viewport-fit=cover` before sheet geometry is calculated); Pitfall 7 (duplicate `useIsMobile` inconsistency — hook established before migration in Phase 2); R3F 300x150 canvas bug on mobile

### Phase 2: Breakpoint Migration — Behaviour-Identical Refactor
**Rationale:** Before building new layout components, existing code must be migrated to consume `useBreakpoint()` in place of the two independent `useIsMobile(768)` definitions. This is a pure refactor with zero visible change — it allows the full 264-test suite to confirm nothing broke. Tablet still maps to the desktop layout at this stage. Consolidating breakpoints into a single source eliminates the risk of a brief layout flash at breakpoint boundaries during rapid resize or orientation change.
**Delivers:** `SplitLayout.tsx` and `Sidebar.tsx` both consume `useBreakpoint()`; no duplicate breakpoint values in codebase; all 264 tests pass unchanged
**Uses:** `useBreakpoint` hook from Phase 1
**Avoids:** Pitfall 7 (breakpoint inconsistency / flash of wrong layout at boundary)

### Phase 3: Content Extraction — Layout-Agnostic Sidebar Content
**Rationale:** `BottomSheet` and `ContextualSidebar` (built in Phase 4) must place the same sidebar content in different layout containers. Currently `Sidebar.tsx` and `PreviewSidebar.tsx` mix content and positioning. Extraction is a pure refactor with zero visible change — it unblocks Phase 4 without adding risk to the working app.
**Delivers:** `src/components/Sidebar/MapSidebarContent.tsx` (SelectionInfo + GenerateButton, no `position: fixed/absolute`); `src/components/Preview/PreviewSidebarContent.tsx` (all layer sections + ExportPanel, no positioning); existing wrappers become thin shells calling these new components
**Implements:** Content extraction pattern from ARCHITECTURE.md; eliminates Anti-Pattern 3 (control components owning their positioning)
**Avoids:** Requiring content duplication across BottomSheet (mobile) and ContextualSidebar (tablet/desktop)

### Phase 4: New Layout Components — BottomSheet, ContextualSidebar, MobileViewToggle
**Rationale:** With content extracted and the breakpoint hook available, the three new layout containers can be built in isolation against the extracted content components. Each is independently testable before wiring into SplitLayout in Phase 5. This limits the blast radius — a bug in BottomSheet does not affect ContextualSidebar or the working SplitLayout.
**Delivers:** `src/components/Layout/BottomSheet.tsx` (vaul, 3 snap points, `modal={false}`, `dismissible={false}`, `snap` as local state, auto-snaps to half on generate); `src/components/Layout/ContextualSidebar.tsx` (persistent, 220px tablet / 260px desktop, reads `showPreview` for content); `src/components/Layout/MobileViewToggle.tsx` (replaces MobileTabBar, sets `activeView`)
**Uses:** `vaul@1.1.2` (BottomSheet); `useBreakpoint` (all three); `showPreview` + `activeView` from mapStore
**Implements:** Patterns 3, 4, and 5 from ARCHITECTURE.md
**Avoids:** Pitfall 1 (display:none canvas — mobile views use `visibility: hidden + pointer-events: none`); Pitfall 2 (OrbitControls touch — DOM z-order and pointer-events gating on canvas during sheet drag); Pitfall 3 (MapLibre pan vs sheet drag — stopPropagation on drag handle, dragPan.disable at full snap); Pitfall 6 (rubber banding — transform clamping in gesture handler)
**Research flag:** The OrbitControls vs. MapLibre vs. vaul three-way touch conflict must be validated on real iOS hardware before Phase 4 is considered complete — Chrome DevTools does not reproduce `touch-action` enforcement accurately.

### Phase 5: SplitLayout Rewrite
**Rationale:** With all new layout components built and independently validated, SplitLayout can be rewritten to orchestrate the three tiers. This is the highest-impact change — it removes `MobileSidebar`, `DesktopSidebar`, `MobileTabBar`, and the floating `PreviewSidebar` overlay in favour of the new layout system. Deferring this to Phase 5 ensures that each component being wired together has already been verified independently.
**Delivers:** `SplitLayout.tsx` fully rewritten to branch on `useBreakpoint()` tier: mobile (full-screen absolute-position view stack + BottomSheet as portal) / tablet (ContextualSidebar 220px + split map|preview, no resizer) / desktop (ContextualSidebar 260px + split map|preview, resizable divider); removal of `MobileSidebar`, `DesktopSidebar`, `MobileTabBar`, floating `PreviewSidebar` wrapper; `map.resize()` called with 150ms delay after layout changes
**Implements:** System overview architecture from ARCHITECTURE.md; MapLibre resize coordination; `StaleIndicator` moved inside preview column (unchanged logic)
**Avoids:** Pitfall 5 (MapLibre ResizeObserver during animation — no width/height animation on map container; `map.resize()` called once on `transitionend`)

### Phase 6: Transitions, Touch Polish, and Accessibility Audit
**Rationale:** Animations and touch polish add zero core functionality but significant test surface area on diverse hardware. Placing this phase last ensures the layout is confirmed working before adding performance-sensitive animation code. Performance testing on mid-range Android must happen here before the milestone is considered done.
**Delivers:** `transform: translateY()` snap animation on BottomSheet (vaul handles this internally — verify easing is spring-like); `motion` `AnimatePresence` crossfade on mobile map/preview toggle; 44px minimum touch targets audited across TerrainSection, BuildingsSection, RoadsSection, WaterSection, VegetationSection, ModelSizeSection, ExportPanel, CollapsibleSection, DrawButton, SearchOverlay; `env(safe-area-inset-bottom)` applied consistently to sheet, sidebar footer, and bottom-anchored controls; `will-change: transform` applied only during active animation, removed after `transitionend`
**Uses:** `motion@12.34.3` (AnimatePresence for view toggle crossfade); Tailwind `min-h-[44px]` across all interactive elements
**Avoids:** Pitfall 5 extension (only `transform` and `opacity` animated, never `width`/`height`); GPU layer leak (cleanup `will-change` after animation); performance trap of backdrop-filter near WebGL canvas (use alpha background or restrict to desktop only after profiling)
**Research flag:** Touch target audit may reveal controls needing structural changes (not just CSS) to reach 44px. Scope may expand during implementation — budget time for CollapsibleSection and slider components which are likely to require the most work.

### Phase Ordering Rationale

- Phases 1–3 are pure refactors; the 264-test suite should pass unchanged after each one, providing a built-in regression gate
- Phase 4 builds new components in isolation before they are wired together — a bug in BottomSheet does not break the working app
- Phase 5 (SplitLayout rewrite) is deferred until all components it orchestrates have been independently validated
- Phase 6 is intentionally last because animation correctness depends on stable layout, and performance regression is only meaningful to test against the final layout
- The gesture conflict (Phase 4 research flag) is the only significant unknown; if it requires architectural changes, they are isolated to BottomSheet and do not affect ContextualSidebar or the SplitLayout rewrite

### Research Flags

Phases needing deeper research or real-device validation before proceeding:
- **Phase 4 (BottomSheet — pointer event boundary on iOS):** The three-way conflict between OrbitControls, MapLibre DragPanHandler, and vaul must be tested on a real iPhone before the phase is considered complete. The DOM z-order solution is specified in PITFALLS.md but its sufficiency cannot be confirmed in DevTools alone. If DOM z-order is insufficient, Zustand-driven `pointer-events` toggling on the canvas container is the fallback strategy.
- **Phase 6 (Touch target audit):** The 10 component files to audit may contain controls requiring structural (not just CSS) changes to reach 44px. Budget for this before planning Phase 6 in detail.

Phases with standard patterns (additional research not needed):
- **Phase 1:** React hook, Zustand slice, CSS @theme, HTML meta tag — all well-documented; no integration unknowns
- **Phase 2:** Mechanical find-and-replace refactor; no new patterns
- **Phase 3:** Mechanical content extraction; no new patterns
- **Phase 5:** Build order and component mapping are fully specified in ARCHITECTURE.md with implementation code samples
- **Phase 6 (transitions):** CSS `transform: translateY()` for sheet snap and `motion` crossfade are both fully documented in STACK.md with working code examples

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | `vaul@1.1.2` and `motion@12.34.3` versions confirmed via npm; React 19 peer deps verified for both; Tailwind v4 `@theme` breakpoint syntax confirmed in official docs; all alternatives explicitly evaluated and ruled out |
| Features | HIGH | Verified against NN/G, Material Design 3, Apple HIG, WCAG 2.5.8, and live competitor app behavior (Google Maps, Apple Maps, ArcGIS); feature boundaries (P1/P2/v2+) confirmed by research; anti-features confirmed problematic by architectural analysis |
| Architecture | HIGH | Based on direct codebase inspection (`SplitLayout.tsx`, `Sidebar.tsx`, `PreviewSidebar.tsx`, `mapStore.ts`); all component names, integration points, and build order fully specified; implementation code samples provided per pattern |
| Pitfalls | HIGH (critical), MEDIUM (performance traps) | Critical pitfalls verified via upstream issue trackers (drei #1233, three.js #16254, R3F #1151, R3F #672, bram.us iOS dvh, shadcn-ui #8471); iOS rubber banding and performance traps corroborated by multiple authoritative sources including MDN and motion.dev |

**Overall confidence:** HIGH

### Gaps to Address

- **Tablet breakpoint upper boundary discrepancy:** STACK.md uses 1024px as the desktop start; FEATURES.md uses 1200px; ARCHITECTURE.md uses 1024px. Recommend adopting 1024px (consistent with Tailwind's standard `lg:` breakpoint and ARCHITECTURE.md) and explicitly codifying this in Phase 1 before any component consumes the value.
- **Vaul "unmaintained" flag:** The author has flagged vaul as unmaintained (last release v1.1.2, Dec 2024) despite 355k dependents and production use by Vercel. The risk is low, but a custom CSS `transform: translateY()` + pointer-events fallback (~300 lines) should be documented in Phase 4 planning as a contingency.
- **OrbitControls touch conflict — requires real-device validation:** The DOM z-order solution for the OrbitControls/MapLibre/vaul gesture conflict cannot be confirmed in Chrome DevTools. This is not a research gap but a validation gate that must occur during Phase 4 before the phase is closed.

---

## Sources

### Primary (HIGH confidence)
- [vaul npm registry](https://www.npmjs.com/package/vaul) — v1.1.2, React 19 peer deps confirmed
- [vaul snap points docs](https://vaul.emilkowal.ski/snap-points) — `snapPoints`, `activeSnapPoint`, `setActiveSnapPoint`, `modal`, `dismissible` API
- [motion npm registry](https://www.npmjs.com/package/motion) — v12.34.3, React 19 peer deps confirmed
- [motion.dev rebranding announcement](https://motion.dev/blog/framer-motion-is-now-independent-introducing-motion) — `motion` is framer-motion renamed
- [Tailwind CSS v4 responsive design docs](https://tailwindcss.com/docs/responsive-design) — `--breakpoint-*` theme variables
- [pmndrs/drei Issue #1233](https://github.com/pmndrs/drei/issues/1233) — OrbitControls blocks scroll on mobile, no opt-out
- [three.js Issue #16254](https://github.com/mrdoob/three.js/issues/16254) — `touch-action: none` set unconditionally on canvas
- [R3F Discussion #1151](https://github.com/pmndrs/react-three-fiber/discussions/1151) — WebGL context loss on canvas unmount
- [R3F Discussion #672](https://github.com/pmndrs/react-three-fiber/discussions/672) — `display: none` prevents canvas initialization at correct size
- [NN/G Bottom Sheets: Definition and UX Guidelines](https://www.nngroup.com/articles/bottom-sheet/) — authoritative UX research on snap heights and map app patterns
- [WCAG 2.5.8 Target Size Minimum](https://www.allaccessible.org/blog/wcag-258-target-size-minimum-implementation-guide) — 44px touch target standard
- [React.dev labs blog](https://react.dev/blog/2025/04/23/react-labs-view-transitions-activity-and-more) — `<ViewTransition>` confirmed experimental/canary
- MapMaker v1.1 codebase (direct inspection) — `SplitLayout.tsx`, `Sidebar.tsx`, `PreviewSidebar.tsx`, `mapStore.ts`
- [MapLibre GL JS Map.resize() API](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/) — must be called after container shown after CSS hide

### Secondary (MEDIUM confidence)
- [BrowserStack responsive breakpoints guide 2025](https://www.browserstack.com/guide/responsive-design-breakpoints) — breakpoint conventions; verified against Tailwind docs
- [bram.us — 100vh in Safari on iOS](https://www.bram.us/2020/05/06/100vh-in-safari-on-ios/) — `100dvh` fix for iOS Safari toolbar behavior
- [shadcn/ui Issue #8471](https://github.com/shadcn-ui/ui/issues/8471) — `viewport-fit=cover` required for safe area to function
- [motion.dev Web Animation Performance Tier List](https://motion.dev/blog/web-animation-performance-tier-list) — `transform`/`opacity` GPU-accelerated; `height`/`width` trigger layout
- [ArcGIS Instant Apps sidebar](https://doc.arcgis.com/en/instant-apps/latest/create-apps/sidebar.htm) — contextual sidebar reference for map tools
- [Material Design 3 — Transitions](https://m3.material.io/styles/motion/transitions) — established component spec for map app motion patterns
- [technetexperts.com — R3F canvas 300x150 fix](https://www.technetexperts.com/r3f-canvas-viewport-resize-fix/) — corroborates R3F Discussion #672

### Tertiary (LOW confidence)
- [Tailwind v4 breakpoints override guide](https://bordermedia.org/blog/tailwind-css-4-breakpoint-override) — third-party; `@theme` override syntax verified against official docs but not a primary source
- [stripearmy.medium.com — iOS body scroll lock](https://stripearmy.medium.com/i-fixed-a-decade-long-ios-safari-problem-0d85f76caec0) — iOS overscroll patterns; corroborated by MDN `overscroll-behavior` docs

---
*Research completed: 2026-02-28*
*Ready for roadmap: yes*
