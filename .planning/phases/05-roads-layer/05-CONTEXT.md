# Phase 5: Roads Layer - Context

**Gathered:** 2026-02-24
**Status:** Ready for planning

<domain>
## Phase Boundary

OSM road network rendered as 3D geometry within the selected area. Users can choose a road style (raised/recessed/flat), roads have type-based widths, and roads are included in the exported STL. Bridges are elevated, tunnels are hidden.

</domain>

<decisions>
## Implementation Decisions

### Road Style
- Default style: recessed (channels cut into terrain)
- Medium depth: 0.5–1.0mm range for the deepest roads
- Depth scales by road type: highways get full depth, residential ~60%, minor roads ~30%
- UI control: style toggle only (raised/recessed/flat) — no separate depth slider
- When raised style is selected, roads sit above terrain; when flat, roads are flush with terrain surface

### Road Geometry
- Simplified segments — reduce OSM node density, roads follow general path with fewer vertices
- Intersections: simple overlap — recessed channels merge naturally, no special intersection geometry
- Bounding box clipping: roads trimmed cleanly at the selection boundary edge
- Dead-ends: flat termination — road geometry simply stops, no rounded caps

### Road Type Classification
- Include: motorway, trunk, primary, secondary, tertiary, residential, unclassified
- Exclude: footpaths, cycleways, tracks, service roads
- 3 width tiers: Highway (widest), Main road (medium), Residential (narrowest)
- Bridges: interpolate elevation smoothly between start/end terrain heights — road spans above terrain below
- Tunnels: hidden entirely — road segments tagged as tunnels are not rendered

### Visual Appearance
- Color: uniform dark gray (#555 range) for all road types — asphalt-like
- No color variation by road type — differentiation comes from width and depth
- Bridges: same dark gray color, visually distinct only by elevation
- Toggle off behavior: terrain fills in completely where roads were — clean on/off, no residual channels

### Claude's Discretion
- Exact vertex simplification algorithm and threshold
- Precise width values for each tier (in model-space mm)
- Exact gray hex value within the #555 range
- Bridge interpolation curve shape
- How road geometry integrates with the existing TerrainMesh/BuildingMesh pipeline

</decisions>

<specifics>
## Specific Ideas

- Road depth varies by type to create visual hierarchy on the print — highways are deeper and wider, residential streets are shallower and narrower
- Bridge elevation interpolated between endpoints for realistic spanning geometry (not just a fixed offset)
- The 3-tier width system (highway/main/residential) keeps things simple and visually distinguishable at typical print scales

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-roads-layer*
*Context gathered: 2026-02-24*
