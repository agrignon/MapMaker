# Phase 2: Terrain + Preview + Export - Context

**Gathered:** 2026-02-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Terrain-only end-to-end pipeline: fetch elevation data for the selected bounding box, render it in a live 3D preview, and export a printable binary STL file. No buildings, roads, or layer toggles — those are later phases. This phase validates the complete output contract (bbox in → STL out) for the terrain-only case.

</domain>

<decisions>
## Implementation Decisions

### 3D Preview Appearance
- Hypsometric tints — elevation-based color gradient (greens at low, browns mid, whites at peaks)
- Dark background (dark gray or near-black) for the 3D viewport
- Ground grid + XYZ axes gizmo for spatial reference
- Default camera: angled overhead (~45°) looking down from a corner

### Panel Layout
- Side-by-side split: 2D map on left, 3D preview on right
- Draggable divider between panels so user can resize
- 3D panel appears after clicking Generate — before that, the map takes full width
- Controls (terrain exaggeration slider, export button) live in a collapsible sidebar on the 3D panel

### Base Plate + Model Shape
- Flat horizontal bottom — model sits flat on a print bed
- User-configurable base plate thickness (the solid part below the lowest terrain point)
- Minimum 5mm total model height for flat terrain areas — even Kansas plains produce a handleable model
- Vertical side walls (clean 90° edges from terrain down to base)

### Export Experience
- Location-based auto-generated filename (e.g., "mount-rainier-terrain.stl")
- Progress bar with labeled steps during generation ("Fetching elevation...", "Building mesh...", "Writing STL...")
- Export/Download button in the 3D panel sidebar alongside other controls
- Post-export: download dialog showing file details (size, dimensions, triangle count) with a Download button

### Claude's Discretion
- Elevation data source and resolution selection
- Exact hypsometric color palette
- Grid density and axes gizmo styling
- Terrain exaggeration slider range and default value
- Draggable divider default position and min/max constraints
- Loading skeleton/placeholder while generating
- Error state handling and retry behavior
- STL mesh resolution (triangle density)

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-terrain-preview-export*
*Context gathered: 2026-02-23*
