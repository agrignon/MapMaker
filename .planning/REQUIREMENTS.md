# Requirements: MapMaker

**Defined:** 2026-03-01
**Core Value:** Users can turn any place in the world into a physical 3D-printed model with full control over features and dimensions

## v1.2 Requirements

Requirements for responsive UI milestone. Each maps to roadmap phases.

### Layout

- [x] **LAYOUT-01**: User sees a mobile layout below 768px, tablet layout at 768–1023px, and desktop layout at 1024px+
- [ ] **LAYOUT-02**: User sees a persistent sidebar on tablet (220px) and desktop (260px) that is part of the layout flow, not a floating overlay
- [ ] **LAYOUT-03**: User sees sidebar content switch between map controls and model controls based on the active view
- [ ] **LAYOUT-04**: User sees the map or preview fill the full screen on mobile, with a toggle button to switch between them

### Bottom Sheet

- [ ] **SHEET-01**: User can drag the mobile bottom sheet between peek (~80px), half (~45vh), and full (~88dvh) snap heights
- [ ] **SHEET-02**: User sees a visible drag handle (pill) with at least 44px touch target area
- [ ] **SHEET-03**: User sees the map remain visible and interactive at peek and half snap heights
- [ ] **SHEET-04**: User sees a spring-like snap animation (not instant jumps) when the sheet settles to a snap point
- [ ] **SHEET-05**: User can flick the sheet up or down quickly to jump to the next snap point (velocity-aware)

### Touch & Accessibility

- [ ] **TOUCH-01**: User can reliably tap all interactive controls (sliders, toggles, buttons, section headers) with a minimum 44px touch target
- [x] **TOUCH-02**: User sees correct spacing around the iOS notch and home bar via safe area insets on sheet, sidebar, and bottom controls
- [ ] **TOUCH-03**: User sees the bottom sheet adjust position when the virtual keyboard opens on mobile

### Animation & Polish

- [ ] **ANIM-01**: User sees a crossfade transition (200–300ms) when switching between map and preview on mobile
- [ ] **ANIM-02**: User sees a smooth reveal animation when the sidebar appears or its content switches
- [ ] **ANIM-03**: User sees "Regenerate" styling in the mobile sheet's generate button area when the bounding box changes after generation

## Future Requirements

Deferred to future release. Tracked but not in current roadmap.

### Layout

- **LAYOUT-05**: Sidebar collapses to icon-only mode (48px) on small tablets (768–900px)
- **LAYOUT-06**: User can drag to resize the persistent sidebar on desktop

### Animation

- **ANIM-04**: Full View Transitions API integration for navigation between views

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Swipe left/right between map and preview | MapLibre and R3F intercept horizontal pan — cannot distinguish from map pan/3D orbit |
| Pull-to-refresh gesture on bottom sheet | Conflicts with drag-to-dismiss; "refresh" has no meaning in MapMaker's model |
| Bottom sheet on tablet | Sheet blocks too much map area at tablet widths; always use persistent sidebar |
| Animating height of sheet content area | Triggers layout reflow every frame; use transform: translateY() instead |
| Hiding the map entirely at full sheet height | Core value is spatial context while adjusting controls |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| LAYOUT-01 | Phase 14 | Complete |
| LAYOUT-02 | Phase 17 | Pending |
| LAYOUT-03 | Phase 15 | Pending |
| LAYOUT-04 | Phase 16 | Pending |
| SHEET-01 | Phase 16 | Pending |
| SHEET-02 | Phase 16 | Pending |
| SHEET-03 | Phase 16 | Pending |
| SHEET-04 | Phase 16 | Pending |
| SHEET-05 | Phase 16 | Pending |
| TOUCH-01 | Phase 18 | Pending |
| TOUCH-02 | Phase 14 | Complete |
| TOUCH-03 | Phase 18 | Pending |
| ANIM-01 | Phase 18 | Pending |
| ANIM-02 | Phase 18 | Pending |
| ANIM-03 | Phase 18 | Pending |

**Coverage:**
- v1.2 requirements: 15 total
- Mapped to phases: 15
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-01*
*Last updated: 2026-03-01 after roadmap creation*
