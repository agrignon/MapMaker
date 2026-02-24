# Phase 1: Foundation - Context

**Gathered:** 2026-02-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Interactive map interface where users can search for any location, draw a bounding box to select an area, and have that selection captured in correct UTM coordinate projection ready for mesh generation. This phase delivers the core selection UI — no 3D preview, no terrain data, no export.

</domain>

<decisions>
## Implementation Decisions

### App layout & map style
- Left sidebar (~300px wide), map fills remaining viewport
- Satellite/aerial imagery as the default map tile layer
- App theme follows system preference (light/dark auto-detect)
- Search bar floats as an overlay on the map, not in the sidebar
- Sidebar contains controls, selection info, and the generate action

### Location search experience
- Live autocomplete dropdown — suggestions appear as user types with debounce
- Selecting a result triggers a smooth fly-to animation with auto-zoom appropriate to result type (city zooms wider, address zooms tighter)
- Supports both place name/address queries AND raw lat/lon coordinate input (e.g., "48.8566, 2.3522") — auto-detect format and handle accordingly

### Bounding box interaction
- Click-and-drag to draw the initial rectangle (click one corner, drag to opposite corner)
- Free aspect ratio — no constraints, user draws whatever proportions they want
- Semi-transparent colored fill with solid border — area outside the selection could be dimmed
- After placement: drag edges or corners to resize, drag the center/interior to reposition
- Standard resize/move cursors for affordance

### Selection confirmation flow
- Selection info displayed in the sidebar: real-world dimensions (e.g., "2.3 km x 1.8 km") and corner coordinates
- "Generate Preview" button in the sidebar — present but disabled in Phase 1 (functional in Phase 2)
- Soft warning when selection area is very large — non-blocking, informational (e.g., "This area may take a while to process")

### Claude's Discretion
- Map library/provider choice (Mapbox, Leaflet, MapLibre, etc.)
- Geocoding API provider for search
- Exact color scheme for bounding box overlay
- Transition animations and easing curves
- Responsive breakpoints and mobile handling
- Dimming style for area outside the bounding box

</decisions>

<specifics>
## Specific Ideas

No specific references — open to standard approaches for map interfaces and selection tools.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-02-23*
