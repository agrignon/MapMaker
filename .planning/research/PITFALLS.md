# Pitfalls Research

**Domain:** Adding responsive UI (bottom sheet, animations, three-tier layout) to an existing React 19 + Three.js R3F + MapLibre GL JS map/3D app (MapMaker v1.2)
**Researched:** 2026-02-28
**Confidence:** HIGH for touch/WebGL interaction pitfalls (verified via Three.js issue tracker, R3F discussion threads, MDN); MEDIUM for animation/layout shift pitfalls (multiple corroborating sources, MDN + community patterns); LOW flagged individually where only single sources available.

---

## Critical Pitfalls

### Pitfall 1: R3F Canvas Mounted in `display: none` Initializes at 300x150px and Never Recovers

**What goes wrong:**
When the R3F `<Canvas>` is first mounted inside a container that has `display: none`, Three.js reads the container dimensions at mount time and gets 0 (or the W3C default canvas size of 300x150). Even after the container becomes visible, the canvas does not automatically resize to fill its parent. The 3D scene renders at 300x150 and appears as a tiny square. The `visibility: hidden` pattern the app already uses for desktop (in SplitLayout.tsx) avoids this because the container still occupies layout space and has real dimensions — `display: none` removes the element from layout.

**Why it happens:**
R3F's `<Canvas>` resolves the WebGL viewport from the DOM container's `getBoundingClientRect()` at mount time. A `display: none` parent returns `{width: 0, height: 0}`. R3F uses these dimensions to set the renderer size. The R3F renderer does not poll for size changes — it relies on a ResizeObserver that fires when the container dimensions change, but if the container was already rendered at 0 and then becomes `display: block`, the ResizeObserver fires and the canvas recovers only if R3F re-mounts the Canvas at that point (which it does not by default).

**How to avoid:**
Never use `display: none` on the container holding the R3F `<Canvas>`. Use `visibility: hidden` + `position: absolute` + `pointer-events: none` to hide it while preserving layout dimensions. This is exactly what the desktop SplitLayout branch already does correctly. The mobile branch in SplitLayout.tsx uses `display: block/none` on the container div — for v1.2, extend the `visibility:hidden` pattern to mobile as well. If the canvas must be conditionally mounted, unmount it entirely (conditional render) rather than `display: none`, so it re-mounts fresh when shown.

**Warning signs:**
- R3F canvas renders a tiny 300x150 square in the corner of the preview panel on first open
- `gl.getParameter(gl.VIEWPORT)` in browser console returns `[0, 0, 300, 150]` after the panel becomes visible
- The issue disappears on second open of the preview (after the canvas has unmounted and remounted)

**Phase to address:**
Phase 1 (Layout restructure) — apply `visibility: hidden` pattern consistently across all breakpoints; audit every conditional show/hide of the canvas container.

---

### Pitfall 2: OrbitControls Sets `touch-action: none` on the Canvas, Blocking Bottom Sheet Drag

**What goes wrong:**
Three.js `OrbitControls` (and therefore `@react-three/drei`'s `<OrbitControls>`) sets `touch-action: none` on its DOM element (the canvas) unconditionally and without an opt-out mechanism. On mobile, any touch that starts over the R3F canvas is completely consumed by OrbitControls — the browser never fires `pointermove`/`touchmove` upward to ancestor elements. If the bottom sheet sits above the canvas in z-order and the user touches a drag handle that visually overlaps the canvas, the drag gesture is intercepted by OrbitControls and the sheet does not move. This is a known upstream issue filed against both three.js and drei.

**Why it happens:**
OrbitControls calls `event.preventDefault()` on all touch events to prevent iOS Safari from triggering its default pan/scroll behavior on the page body, which would conflict with 3D orbit. The CSS `touch-action: none` is the companion declarative instruction that tells the browser to hand all touch coordinates to JavaScript without attempting native scroll. This is correct behavior for a 3D viewport, but incorrect when the sheet drag handle needs to intercept vertical drags over the same screen region.

**How to avoid:**
- Structure the z-order so the bottom sheet sits in the DOM above the canvas and uses `pointer-events: auto` on its drag handle with a high z-index. Touch events that start on the drag handle are captured by the sheet before reaching the canvas/OrbitControls.
- Use `pointer-events: none` on the canvas container when a gesture is active in the sheet (toggle via Zustand state during sheet drag).
- Alternatively, on mobile when the bottom sheet is at half or full height, call `controls.enabled = false` on the OrbitControls instance to stop it consuming events during sheet interaction.
- Do NOT attempt to patch OrbitControls internals or remove `touch-action: none` from the canvas — this breaks pinch-to-zoom on the 3D view.

**Warning signs:**
- Dragging the bottom sheet handle over the canvas area does nothing; the 3D view orbits instead
- Sheet gesture listeners fire `touchstart` but never `touchmove`
- `event.cancelable` is false on touch events that start over the canvas (browser has already decided due to `touch-action: none`)

**Phase to address:**
Phase 2 (Bottom sheet implementation) — design the DOM layering and pointer-event toggling before wiring gesture detection. Test on real iOS hardware, not just Chrome DevTools touch simulation (DevTools does not emulate `touch-action` enforcement the same way).

---

### Pitfall 3: MapLibre Pan Gestures and Bottom Sheet Drag Conflict on Single-Touch

**What goes wrong:**
On mobile, when the bottom sheet is in peek or half height, the visible map area beneath the sheet can still receive touch events if the sheet's drag handle has `pointer-events: none` or if the user touches the sheet body area where the map is partially visible. MapLibre's `DragPanHandler` consumes single-finger drag events for map panning. A bottom sheet that uses `pointermove` to detect vertical drag direction will race with MapLibre for the same touch stream. The result: either the sheet never drags (MapLibre wins), or the map never pans when the user intends to move it (sheet wins), or the behavior flickers unpredictably.

**Why it happens:**
Both handlers listen at the `document` or container level. The sheet drag handler tries to detect "is this drag predominantly vertical?" before deciding to handle it, but MapLibre's pan handler has already called `setPointerCapture` on the first `pointerdown`, claiming exclusive ownership of the touch sequence. Once pointer capture is set, `pointermove` events only go to the capturing element — the sheet's gesture detector receives nothing.

**How to avoid:**
- Give the sheet drag handle its own dedicated element with sufficient hit area (44px minimum per Apple HIG) that sits above the map in z-order and stops event propagation at the handle level (`e.stopPropagation()`). Only the drag handle element should initiate sheet movement; touching the sheet body should pass through to the map.
- For the sheet body area: use `touch-action: pan-y` so the browser natively distinguishes vertical scroll (sheet content scroll) from the map below.
- When the sheet is in full-height position, disable MapLibre's drag pan (`map.dragPan.disable()`) since the map is invisible; re-enable when sheet returns to peek.
- Consider MapLibre's `cooperative gestures` mode during sheet animation to suppress accidental map panning.

**Warning signs:**
- Tapping and dragging upward on the sheet initiates a map pan instead of expanding the sheet
- `pointercancel` fires on the sheet drag gesture handler immediately after `pointerdown` (MapLibre claimed capture)
- Map pans wildly when user intends to drag the bottom sheet closed

**Phase to address:**
Phase 2 (Bottom sheet implementation) — the gesture boundary between sheet and map must be explicitly designed, not left to chance event propagation.

---

### Pitfall 4: iOS Safari Viewport Height Causes Layout Overflow or Bottom Sheet Clipping

**What goes wrong:**
On iOS Safari, `100vh` computes to the full screen height including the browser chrome (address bar + bottom toolbar). When the toolbar collapses on scroll, `100vh` is larger than the visual viewport, causing layout overflow — the bottom sheet peek position appears below the fold and the user never sees it. Additionally, the bottom safe area inset (`env(safe-area-inset-bottom)`) is non-zero on devices with home indicator but only works when `viewport-fit=cover` is set in the `<meta viewport>` tag. Without it, the sheet's bottom edge sits behind the home indicator bar.

**Why it happens:**
Safari's handling of viewport height is inconsistent with other browsers. The `100vh` unit is calculated from the "layout viewport" which includes dynamic browser chrome. The `100dvh` (dynamic viewport height) unit was introduced specifically to fix this, computing height based on the currently visible viewport. Developers who test on desktop Chrome or Android miss these iOS-specific behaviors entirely.

**How to avoid:**
- The app already uses `height: 100dvh` with a `100vh` fallback in `src/index.css` — this is correct for the root. Ensure the same pattern applies to the sheet's height calculations, not hardcoded pixel values.
- Add `viewport-fit=cover` to the `<meta name="viewport">` tag in `index.html`.
- Use `padding-bottom: env(safe-area-inset-bottom, 0px)` (or `max(8px, env(safe-area-inset-bottom, 8px))`) on the sheet's inner content — already partially done in the current MobileSidebar. Apply this consistently in the new bottom sheet component.
- Set snap height percentages relative to `100dvh`, not `100vh` or pixel values.
- Test on a real iPhone with Safari, not just Chrome DevTools device simulation (DevTools does not simulate the bottom toolbar dynamic behavior or home indicator safe area).

**Warning signs:**
- On iPhone 14/15 in Safari, the bottom of the sheet is cut off or appears behind the home indicator
- Layout overflow causes a faint scrollbar to appear on the body (which should be `overflow: hidden`)
- Sheet peek position is not visible when the Safari toolbar is in its expanded state

**Phase to address:**
Phase 1 (Layout restructure) — set up `viewport-fit=cover` and safe area inset variables as a global foundation before any sheet geometry is calculated. Phase 2 (Bottom sheet) — apply `dvh`-relative snap points.

---

### Pitfall 5: CSS Transitions on Map/Canvas Container Cause Rendering Glitch During Resize

**What goes wrong:**
When animating the width or height of the MapLibre container (e.g., the map pane shrinking to make room for a sidebar, or a tab-switch animation), the map canvas internally renders at the old dimensions during the CSS transition. MapLibre's ResizeObserver fires on every frame of the transition, calling internal `resize()` continuously. This causes the map to "stutter" — tiles re-render at intermediate sizes, the canvas flickers, and satellite imagery tiles reload for the new viewport. On low-power mobile devices this can cause visible frame drops (< 20 fps) for the duration of the 300ms transition.

**Why it happens:**
MapLibre GL v3+ uses a ResizeObserver to automatically resize its canvas when the container element changes size. This is correct behavior for programmatic resize, but it was not designed for animated CSS transitions where the container changes size on every rendered frame. The map's WebGL render loop runs at 60fps and must regenerate draw calls at each intermediate size, which is expensive.

**How to avoid:**
- Avoid animating `width`, `height`, or `flex` values on the map container directly. Instead, animate an overlay or a sibling element and use `transform: translateX()` on the canvas container — `transform` changes do not trigger layout and do not fire ResizeObserver.
- If width/height animation is unavoidable (e.g., sidebar slide-in pushes the map), wait for the CSS transition to complete before calling `map.resize()` once: attach a `transitionend` listener and call `map.resize()` inside it.
- Consider using `visibility` toggling with instant layout changes (no transition on the map container) and only animate UI elements that don't contain WebGL canvases.

**Warning signs:**
- During view-switch animation (map to preview), the map canvas flickers or shows tearing
- Satellite imagery tiles appear at incorrect zoom levels during the animation
- MapLibre fires `movestart`/`moveend` events during what should be a static viewport transition

**Phase to address:**
Phase 3 (Transitions and animations) — design all animation keyframes to avoid triggering MapLibre ResizeObserver. Test transitions on mid-range Android hardware, not just desktop.

---

### Pitfall 6: iOS Safari Rubber Banding Breaks Bottom Sheet Dismissal Gesture

**What goes wrong:**
iOS Safari applies elastic overscroll ("rubber banding") to any element — including the document body. When a bottom sheet is open and the user drags upward past the sheet's maximum extent, or drags down from the sheet to dismiss it past the fully-closed position, iOS rubber banding kicks in and the body bounces. The gesture handler loses track of where "zero" is, causing the sheet to spring back to a random position rather than snap to a defined stop point. The sheet can also remain stuck in a mid-state that its gesture logic does not recognize.

**Why it happens:**
iOS Safari does not fully honor `overscroll-behavior: none` on the document body in all versions. The rubber banding effect is a native layer above CSS — it applies to the visual viewport itself, not the scroll container. When the user's gesture extends beyond the sheet's drag range, the visual viewport starts to shift, which the sheet's gesture logic interprets as continued drag movement.

**How to avoid:**
- Set `overscroll-behavior: none` on `body` (already in `src/index.css`) and additionally on the sheet container element itself.
- Clamp the sheet's `translateY` transform in the gesture handler — do not allow it to go above 0 (fully expanded) or below the peek position when dismissing. Clamp to valid snap-point range before updating the DOM.
- When implementing gesture velocity for snap-to-stop: measure velocity over the last 100ms window, not the full gesture distance, to avoid overscroll frames inflating the perceived velocity.
- Avoid using `scroll` events to drive the sheet position — use `pointer` or `touch` events directly where you have full control over coordinate clamping.

**Warning signs:**
- Sheet snaps to wrong position after fast swipe-to-dismiss on iPhone
- After dismissal, a faint visual shift of the body is visible (rubber band recovery)
- Sheet appears to "jump" when the drag overshoots the minimum extent

**Phase to address:**
Phase 2 (Bottom sheet implementation) — velocity clamping and overscroll containment must be part of the initial gesture design, not a post-launch fix.

---

### Pitfall 7: Two Instances of `useIsMobile` Hook Create Hydration-Style Inconsistency

**What goes wrong:**
The codebase currently has `useIsMobile` defined identically in both `SplitLayout.tsx` and `Sidebar.tsx`. Each instance independently reads `window.innerWidth` on initial render and then subscribes to `matchMedia` changes. If these two components are ever in different React render batches at a breakpoint boundary (e.g., during a resize animation or a fast orientation change), they can briefly return different values — one saying "mobile" while the other says "desktop." This causes layout conflicts: the Sidebar renders its mobile bottom sheet while SplitLayout renders the desktop side-by-side view.

**Why it happens:**
Duplicated state that should be a single source of truth. The two hooks are independent React state instances, so React's reconciliation cannot guarantee they update atomically. On a device rapidly crossing the 768px threshold (e.g., iOS split-view mode), this becomes a real edge case.

**How to avoid:**
- Extract breakpoint state into the Zustand store or a single shared context/hook at the app root level.
- For v1.2, the migration to a three-tier breakpoint system should define breakpoints once (e.g., in a `useBreakpoint` hook or as Zustand state) and import it everywhere. All layout components read from one source.
- Alternatively, drive layout with CSS media queries only (no JavaScript at all for breakpoints) using CSS custom properties and `@media` queries. Reserve JavaScript breakpoint detection for behaviors that cannot be done in CSS (e.g., disabling MapLibre pan on mobile).

**Warning signs:**
- Brief flash of incorrect layout at breakpoint boundary (e.g., mobile sheet appears while side-by-side layout is active)
- Console warnings about state update batching during rapid window resize
- Different components disagreeing about layout tier at the same moment

**Phase to address:**
Phase 1 (Layout restructure) — consolidate all breakpoint detection into a single source before building the three-tier system on top of it.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Use `display: none` to hide the R3F canvas on mobile | Simple conditional render logic | Canvas initializes at 300x150; requires remount cycle to recover; kills the instant-preview UX | Never — use `visibility: hidden` pattern |
| Hardcode breakpoints as magic numbers (768, 1024) in multiple files | Works immediately | Two independent copies diverge during refactor; breakpoint changes require grep-and-replace | MVP only, with a follow-up task to consolidate |
| Animate `width/height` on MapLibre container | Familiar CSS pattern | ResizeObserver fires on every frame; map flickers and re-renders tiles; janky on mobile | Never for map container — use `transform` or instant swap |
| Drive sheet position from `scroll` events | Easy to hook into native scroll | `scroll` events are passive by default and cannot call `preventDefault`; cannot prevent body scroll chaining | Never for bottom sheet gesture |
| Disable OrbitControls globally on mobile | Fixes touch conflict immediately | Removes 3D orbit entirely on mobile; 3D preview becomes unusable | Acceptable as a temporary workaround during sheet-gesture development only |
| Use `window.innerWidth` synchronously in component initialization | Simple, no hook needed | Server/SSR risks aside, fires before CSS layout is ready; misreads at subpixel boundaries | Never in a component that renders layout — use `matchMedia` |
| Apply `will-change: transform` to every animated element | Promotes to GPU layer | Excessive GPU layers on mobile cause OOM; on old iPhones even 8 will-change elements can crash the tab | Only on elements actively animating, removed after transition ends |

---

## Integration Gotchas

Common mistakes when adding responsive features to the existing MapLibre + R3F stack.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| R3F `<Canvas>` + CSS hide | Hiding canvas container with `display: none` | Use `visibility: hidden` + `pointer-events: none`; never `display: none` on a mounted canvas |
| OrbitControls + touch | Expecting touch events to bubble past canvas | Structure DOM so sheet drag handle is above canvas in z-order and stops propagation at handle |
| MapLibre + sheet drag | Letting both handlers compete for the same pointerdown | Disable MapLibre pan during sheet gesture; use `setPointerCapture` on the sheet handle exclusively |
| MapLibre + CSS transition | Animating the map container's width/height | Animate a wrapper via `transform: translateX`; call `map.resize()` once on `transitionend` |
| iOS safe areas | Forgetting `viewport-fit=cover` in `<meta viewport>` | Add to `index.html`; all safe-area `env()` values return 0 without this |
| iOS 100dvh | Using `100vh` for full-height sheet | Use `100dvh` with `100vh` fallback; test on real Safari; DevTools device sim does not reproduce the toolbar dynamic height |
| iOS rubber banding | Relying on `overscroll-behavior: none` alone to stop body bounce | Also clamp sheet transform in gesture handler; `overscroll-behavior` is partially unsupported on iOS |
| Breakpoint JS + CSS | Duplicating breakpoint value (768) in multiple hooks and CSS | Define breakpoints once; use CSS `@media` for layout, single JS hook for behavior-only logic |
| Animation + WebGL | Running CSS keyframe animations on elements that overlap the WebGL canvas | Keep animated elements on separate GPU layers (`transform/opacity` only); avoid `filter`, `box-shadow`, `clip-path` near the canvas |

---

## Performance Traps

Patterns that work fine on desktop but degrade on mobile with WebGL running alongside.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| CSS `filter` or `backdrop-filter` on elements overlapping WebGL canvas | Severe jank (< 20 fps) on mid-range Android during animations; causes compositor to rasterize layers containing the canvas | Use `background-color` with opacity instead of `backdrop-filter` for sheet background; or accept that backdrop-filter is desktop-only | Any mobile device with a GPU budget shared between WebGL and compositing |
| Too many `will-change` promotions | Tab crashes on older iPhones (2GB RAM devices); excessive VRAM use | Only apply `will-change: transform` immediately before animation starts; remove it immediately after | More than ~6 promoted layers on an iPhone 12 or older |
| Animating `height` for snap transitions | Triggers layout on every frame; 300ms transition causes 18 reflows | Use `transform: translateY()` for sheet snap animation — translate does not trigger layout | Every frame during animation |
| Sheet gesture using passive scroll events | Cannot call `preventDefault`; body scrolls behind the sheet during drag | Use `pointerdown/pointermove` with `{passive: false}` for the gesture; keep content scroll passive | Always — passive scroll cannot prevent body scroll chain |
| Framer Motion animating too many elements while WebGL renders | Both share the main thread rAF; when mesh generation Worker finishes and posts result, React's state update + Framer Motion's animations all queue in same frame | Use CSS transitions for layout-level animations (not Framer Motion); reserve Framer Motion for micro-interactions only | During mesh generation → preview transition |
| `window.addEventListener('resize', handler)` without debounce | MapLibre resize fires hundreds of times per second during animation; map re-renders at every intermediate size | Use ResizeObserver (already in MapLibre v3+) or debounce window resize handler to 100ms | Any animated layout change |

---

## UX Pitfalls

Common user experience mistakes when adding responsive features to a tool-heavy map app.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Bottom sheet covers the bounding box draw button on mobile | Users cannot draw a selection area with the sheet open | At peek height, sheet must not overlap the MapLibre map's interactive controls; design snap heights with button clearance in mind |
| Sheet half-open state blocks map interaction without providing controls | User is stuck: map is covered, controls aren't visible | Either make the sheet fully scrollable at half height with all controls, or go directly from peek to full; do not leave a useless intermediate state |
| Tab switch (Map/Preview) while mesh is generating clears visual feedback | User switches to map thinking generation failed; spinner disappears | Persist generation progress indicator in a persistent location (top bar) outside the tab content area |
| Orbit controls with default settings allow camera to go underground | On mobile with one-finger pan enabled, users accidentally flip the terrain upside down | Set `minPolarAngle` and `maxPolarAngle` on OrbitControls to prevent camera going below terrain plane; already important on desktop but especially noticeable on touch |
| Sheet drag handle target too small for fat fingers | Users miss the handle and accidentally pan the map | Minimum 44x44pt hit target (Apple HIG); use a wide invisible touch target above the visible handle bar |
| No visual feedback during sheet snap | Sheet jumps to snap position; feels broken | Use CSS `transition: transform 250ms ease-out` when releasing drag; only disable transition during active drag |

---

## "Looks Done But Isn't" Checklist

Things that appear complete in desktop browser testing but fail on real mobile devices.

- [ ] **Canvas hide/show:** Open Preview tab on mobile, switch to Map tab, switch back — verify the canvas is at full size and rendering correctly (not 300x150).
- [ ] **Sheet gesture on canvas overlap:** When bottom sheet is at peek height with canvas visible behind it, drag the sheet handle upward — verify the sheet expands and the 3D view does not orbit.
- [ ] **Map pan vs sheet dismiss:** With sheet at half height, finger-drag downward on the map area below the sheet — verify the map pans, not the sheet dismisses.
- [ ] **iOS safe area:** On iPhone with home indicator, verify the sheet's bottom edge and the peek-height handle are fully above the home indicator bar (not clipped by it).
- [ ] **iOS 100dvh:** On Safari iPhone, verify no body scrollbar appears and the layout exactly fills the visual viewport without overflow.
- [ ] **Rubber banding:** Fast swipe-to-dismiss on iPhone — verify the sheet snaps cleanly to peek/closed without body bounce visible behind it.
- [ ] **Breakpoint consistency:** Resize browser window through 768px rapidly — verify no flash of both mobile sheet and desktop sidebar simultaneously.
- [ ] **Animation + generation:** Start mesh generation, then immediately switch to Preview tab — verify the loading indicator is still visible and animation does not drop below 30fps.
- [ ] **MapLibre after layout change:** After sidebar slide-in on tablet, verify the map tiles fill the correct viewport (no gray area on the right edge from stale canvas dimensions).
- [ ] **will-change cleanup:** After sheet snap animation completes, verify the sheet element no longer has `will-change: transform` in computed styles (not a GPU memory leak).

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Canvas 300x150 on mobile (display:none) | MEDIUM | Replace `display: none` with `visibility: hidden` pattern; audit all canvas container conditionals; redeploy |
| Sheet gesture fights OrbitControls | MEDIUM | Add `pointer-events: none` toggle on canvas container during sheet drag; wire to Zustand sheet drag state |
| Map pan conflicts with sheet drag | MEDIUM | Audit gesture handler order; add `stopPropagation` on sheet drag handle; add `map.dragPan.disable()` during sheet gesture |
| iOS rubber banding corrupts sheet position | LOW | Add transform clamping in gesture handler; test with `overscroll-behavior: none` on sheet container; redeploy |
| MapLibre canvas stale after layout animation | LOW | Add `transitionend` listener calling `map.resize()` once; already supported in MapLibre v3+ via ResizeObserver |
| Breakpoint flash between mobile/desktop | LOW | Move breakpoint state to Zustand or shared context; remove duplicate `useIsMobile` definitions |
| Animation jank from backdrop-filter near canvas | LOW | Replace `backdrop-filter: blur()` on sheet with `background-color` with alpha; CSS compositing cost drops immediately |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| R3F canvas 300x150 from display:none | Phase 1 (Layout restructure) | Open Preview on mobile, tab-switch away, tab-switch back — assert canvas fills full panel |
| Duplicate `useIsMobile` inconsistency | Phase 1 (Layout restructure) | Single breakpoint source; grep for duplicate definitions confirms zero |
| iOS 100dvh / safe area missing | Phase 1 (Layout restructure) | Test on real iPhone Safari; assert no overflow scrollbar, sheet clear of home indicator |
| MapLibre canvas stale after animation | Phase 1 (Layout restructure) | Animate sidebar open; assert map tiles fill full width after transition |
| OrbitControls touch-action conflict | Phase 2 (Bottom sheet) | Drag sheet handle over canvas area on iOS — assert sheet moves, not 3D view |
| MapLibre pan vs sheet drag conflict | Phase 2 (Bottom sheet) | Drag map through sheet body area — assert map pans; drag handle — assert sheet moves |
| iOS rubber banding corrupts sheet snap | Phase 2 (Bottom sheet) | Fast swipe-to-dismiss on iPhone — assert clean snap with no body bounce |
| Animation jank near WebGL | Phase 3 (Transitions) | Run animations during active mesh generation; assert > 30fps on mid-range Android (Chrome DevTools Performance panel) |
| MapLibre ResizeObserver during animation | Phase 3 (Transitions) | Profile tab-switch transition in Chrome DevTools; assert zero tile reloads during animation |
| will-change GPU layer leak | Phase 3 (Transitions) | Inspect sheet element in Chrome DevTools Layers panel after animation completes; assert no promoted layer |

---

## Sources

- [pmndrs/drei Issue #1233 — OrbitControls blocks scroll on mobile without ability to opt-out](https://github.com/pmndrs/drei/issues/1233) — Confirmed upstream issue, no opt-out in three.js OrbitControls
- [three.js Issue #16254 — OrbitControls eats touch events](https://github.com/mrdoob/three.js/issues/16254) — `touch-action: none` set unconditionally on canvas
- [three.js Issue #8084 — Option to prevent preventDefault in OrbitControls](https://github.com/mrdoob/three.js/issues/8084) — Long-standing request, still unresolved
- [R3F Discussion #1151 — THREE.WebGLRenderer: Context Lost](https://github.com/pmndrs/react-three-fiber/discussions/1151) — Context loss on unmount; keep canvas mounted, route contents instead
- [R3F Discussion #672 — Initialize a hidden Canvas](https://github.com/pmndrs/react-three-fiber/discussions/672) — display:none prevents canvas initialization at correct size
- [technetexperts.com — Fix R3F Canvas Sizing 300x150 Issue](https://www.technetexperts.com/r3f-canvas-viewport-resize-fix/) — Canvas reverts to 300x150 when parent dimensions are zero at mount
- [bram.us — 100vh in Safari on iOS](https://www.bram.us/2020/05/06/100vh-in-safari-on-ios/) — 100vh includes browser chrome; 100dvh is the fix
- [Apple Developer Forums — safe-area-inset-bottom does not update for keyboard](https://webventures.rejh.nl/blog/2025/safe-area-inset-bottom-does-not-update/) — Known iOS 2025 behavior; safe area does not resize with keyboard
- [shadcn/ui Issue #8471 — iOS 26: Sheet leaves bottom gap in Safari](https://github.com/shadcn-ui/ui/issues/8471) — viewport-fit=cover required for safe area to function
- [MDN — touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action) — pan-y, pan-x, none semantics
- [MDN — overscroll-behavior](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overscroll-behavior) — contain vs none; iOS partial support
- [Motion.dev — Web Animation Performance Tier List](https://motion.dev/blog/web-animation-performance-tier-list) — transform/opacity GPU-accelerated; height/width trigger layout
- [Motion.dev — When browsers throttle requestAnimationFrame](https://motion.dev/blog/when-browsers-throttle-requestanimationframe) — Animation frame blocking when main thread is busy
- [MapLibre GL JS — Map.resize()](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/) — Must be called after container shown after CSS hidden; ResizeObserver in v3+
- [Mapbox PR #9083 — Use ResizeObserver to trigger canvas resize](https://github.com/mapbox/mapbox-gl-js/pull/9083) — Background on ResizeObserver integration
- [MDN — Animation performance and frame rate](https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/Animation_performance_and_frame_rate) — Main thread blocking causes animation jank
- [stripearmy.medium.com — I fixed a decade-long iOS Safari body scroll lock problem](https://stripearmy.medium.com/i-fixed-a-decade-long-ios-safari-problem-0d85f76caec0) — Definitive iOS body scroll + overscroll prevention patterns
- [chrome.dev/issues/40939743 — WebGL context limit of 16 in Chrome](https://issues.chromium.org/issues/40939743) — Do not create multiple canvases; Safari limit applies

---
*Pitfalls research for: Responsive UI (bottom sheet, animations, three-tier layout) on MapLibre + Three.js R3F app — MapMaker v1.2*
*Researched: 2026-02-28*
