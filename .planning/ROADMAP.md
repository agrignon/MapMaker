# Roadmap: MapMaker

## Milestones

- ✅ **v1.0 MVP** — Phases 1-9 (shipped 2026-02-28)
- ✅ **v1.1 Building Coverage** — Phases 10-13 (shipped 2026-03-01)
- 🚧 **v1.2 Responsive UI** — Phases 14-18 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-9) — SHIPPED 2026-02-28</summary>

- [x] Phase 1: Foundation (3/3 plans) — completed 2026-02-24
- [x] Phase 2: Terrain + Preview + Export (5/5 plans) — completed 2026-02-24
- [x] Phase 3: Buildings (3/3 plans) — completed 2026-02-25
- [x] Phase 4: Model Controls + Store Foundation (3/3 plans) — completed 2026-02-25
- [x] Phase 5: Roads Layer (3/3 plans) — completed 2026-02-26
- [x] Phase 6: Water Layer (2/2 plans) — completed 2026-02-26
- [x] Phase 7: Vegetation + Terrain Smoothing (2/2 plans) — completed 2026-02-26
- [x] Phase 8: Edit-Iterate + Export Polish (2/2 plans) — completed 2026-02-28
- [x] Phase 9: Performance Hardening (2/2 plans) — completed 2026-02-28

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.1 Building Coverage (Phases 10-13) — SHIPPED 2026-03-01</summary>

- [x] Phase 10: Overture Access (2/2 plans) — completed 2026-03-01
- [x] Phase 11: MVT Parser (1/1 plan) — completed 2026-03-01
- [x] Phase 12: Deduplication (1/1 plan) — completed 2026-03-01
- [x] Phase 13: Pipeline Integration (1/1 plan) — completed 2026-03-01

Full details: `.planning/milestones/v1.1-ROADMAP.md`

</details>

### 🚧 v1.2 Responsive UI (In Progress)

**Milestone Goal:** End-to-end responsive redesign so MapMaker works natively on mobile phones, tablets, and desktops — three-tier layout with draggable bottom sheet on mobile, persistent contextual sidebar on tablet/desktop, touch-optimized controls, and smooth view transitions throughout.

#### v1.2 Phase Summary

- [x] **Phase 14: Foundation** — Breakpoint hook, store fields, viewport meta, dvh fix, visibility pattern (completed 2026-03-02)
- [ ] **Phase 15: Content Architecture** — Extract layout-agnostic sidebar content components
- [ ] **Phase 16: Layout Components** — BottomSheet (vaul), ContextualSidebar, MobileViewToggle
- [ ] **Phase 17: SplitLayout Rewrite** — Orchestrate three-tier layout with persistent sidebar
- [ ] **Phase 18: Transitions & Polish** — Crossfades, spring animations, touch targets, safe area audit

## Phase Details

### Phase 14: Foundation
**Goal**: Users see correct layout tiers on all devices and safe area insets are respected on iOS
**Depends on**: Nothing (first v1.2 phase)
**Requirements**: LAYOUT-01, TOUCH-02
**Success Criteria** (what must be TRUE):
  1. On a device below 768px, app renders in mobile layout; at 768-1023px it renders tablet layout; at 1024px+ it renders desktop layout
  2. On an iPhone with notch/home bar, controls are not obscured by system UI elements
  3. The 264-test suite passes unchanged (pure foundation refactor with no behavior regression)
  4. No duplicate breakpoint values exist in the codebase — a single `useBreakpoint` hook is the only source
**Plans**: 2 plans (2/2 complete — Phase 14 DONE 2026-03-02)
- [x] 14-01-PLAN.md — Core infrastructure: useBreakpoint hook, Zustand deviceTier, matchMedia test mock, safe area CSS properties
- [x] 14-02-PLAN.md — Consumer migration: App.tsx wiring, replace useIsMobile in SplitLayout + Sidebar, MobileSidebar safe area fix, DevBadge

### Phase 15: Content Architecture
**Goal**: Sidebar content is extractable into layout-agnostic components that any container can host
**Depends on**: Phase 14
**Requirements**: LAYOUT-03
**Success Criteria** (what must be TRUE):
  1. When the user switches from map view to preview view, the sidebar content switches from map controls to model controls without page reload
  2. The same sidebar content appears correctly whether rendered inside the mobile bottom sheet or the desktop sidebar (no duplicated content)
  3. The 264-test suite passes unchanged (pure extraction refactor with no behavior regression)
**Plans**: 1 plan
Plans:
- [ ] 15-01-PLAN.md — Extract panel components, wire SidebarContent switcher, update containers

### Phase 16: Layout Components
**Goal**: Mobile users can interact with a draggable bottom sheet and toggle between full-screen map and preview views
**Depends on**: Phase 15
**Requirements**: SHEET-01, SHEET-02, SHEET-03, SHEET-04, SHEET-05, LAYOUT-04
**Success Criteria** (what must be TRUE):
  1. User can drag the bottom sheet and it snaps to peek (~80px), half (~45vh), and full (~88dvh) positions
  2. A visible pill-shaped drag handle is present and has at least a 44px tall touch target
  3. The map remains visible and fully interactive when the sheet is at peek or half height
  4. When released mid-drag the sheet animates with a spring-like ease to the nearest snap point (not an instant jump)
  5. Flicking the sheet upward quickly jumps it to the next snap point, not just the nearest one
  6. A toggle button lets the user switch the full-screen view between map and preview on mobile
**Plans**: TBD

### Phase 17: SplitLayout Rewrite
**Goal**: Users on tablet and desktop see a persistent sidebar that stays visible alongside the map and preview panels
**Depends on**: Phase 16
**Requirements**: LAYOUT-02
**Success Criteria** (what must be TRUE):
  1. On tablet (768-1023px) a 220px sidebar column is always visible alongside the map and preview, with no floating overlay
  2. On desktop (1024px+) a 260px sidebar column is always visible alongside the map and preview, with no floating overlay
  3. After any layout change (view toggle, orientation change), the map redraws tiles correctly with no gray tiles or misaligned canvas
  4. The R3F 3D canvas fills its container correctly on all three device tiers (no 300x150 initialization artifact)
**Plans**: TBD

### Phase 18: Transitions & Polish
**Goal**: View switches, sheet movement, and sidebar reveals all animate smoothly, controls are reliably tappable, and the keyboard does not obscure content on mobile
**Depends on**: Phase 17
**Requirements**: ANIM-01, ANIM-02, ANIM-03, TOUCH-01, TOUCH-03
**Success Criteria** (what must be TRUE):
  1. Switching between map and preview on mobile produces a visible crossfade animation (200-300ms), not an instant swap
  2. When the sidebar appears or its content switches, a smooth reveal animation plays
  3. When the bounding box changes after a model has been generated, the generate button area in the bottom sheet shows "Regenerate" styling
  4. Every interactive control (sliders, toggles, section headers, buttons) can be reliably tapped on a mobile device with no mis-taps on adjacent elements
  5. When the virtual keyboard opens on mobile (e.g., tapping the location search field), the bottom sheet shifts up so input fields remain visible
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 3/3 | Complete | 2026-02-24 |
| 2. Terrain + Preview + Export | v1.0 | 5/5 | Complete | 2026-02-24 |
| 3. Buildings | v1.0 | 3/3 | Complete | 2026-02-25 |
| 4. Model Controls + Store Foundation | v1.0 | 3/3 | Complete | 2026-02-25 |
| 5. Roads Layer | v1.0 | 3/3 | Complete | 2026-02-26 |
| 6. Water Layer | v1.0 | 2/2 | Complete | 2026-02-26 |
| 7. Vegetation + Terrain Smoothing | v1.0 | 2/2 | Complete | 2026-02-26 |
| 8. Edit-Iterate + Export Polish | v1.0 | 2/2 | Complete | 2026-02-28 |
| 9. Performance Hardening | v1.0 | 2/2 | Complete | 2026-02-28 |
| 10. Overture Access | v1.1 | 2/2 | Complete | 2026-03-01 |
| 11. MVT Parser | v1.1 | 1/1 | Complete | 2026-03-01 |
| 12. Deduplication | v1.1 | 1/1 | Complete | 2026-03-01 |
| 13. Pipeline Integration | v1.1 | 1/1 | Complete | 2026-03-01 |
| 14. Foundation | v1.2 | Complete    | 2026-03-02 | 2026-03-02 |
| 15. Content Architecture | v1.2 | 0/1 | Not started | - |
| 16. Layout Components | v1.2 | 0/? | Not started | - |
| 17. SplitLayout Rewrite | v1.2 | 0/? | Not started | - |
| 18. Transitions & Polish | v1.2 | 0/? | Not started | - |
