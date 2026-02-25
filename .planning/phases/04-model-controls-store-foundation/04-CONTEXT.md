# Phase 4: Model Controls + Store Foundation - Context

**Gathered:** 2026-02-24
**Status:** Ready for planning

<domain>
## Phase Boundary

All layer state fields exist in the Zustand store and the UI exposes fully wired layer toggles, physical dimension inputs, unit switching, and contextual control visibility. This phase does NOT add new geometry layers (roads, water, vegetation) — it adds the store fields and UI controls so every subsequent phase can immediately plug in.

</domain>

<decisions>
## Implementation Decisions

### Control panel layout
- Stacked collapsible sections, each with a toggle header
- A top-level "Model Size" section above all layer sections for dimensions and unit toggle
- Layer sections in pipeline order: Terrain → Buildings → Roads → Water → Vegetation
- Collapsed sections show a brief summary of current values (e.g., "Terrain — 1.5x exag, 3mm base")

### Dimension & unit inputs
- Width (X) input with auto-calculated depth (Y) that maintains bbox aspect ratio
- Separate Z height input for max terrain height
- Exaggeration slider kept alongside Z height — both control vertical scale
- Segmented control (mm | in) for unit toggle, inline with dimension inputs
- Switching units converts existing values (150mm → 5.91in), not reset

### Layer toggle behavior
- Toggling a layer off instantly hides its geometry in the Three.js scene (no regeneration)
- Export matches the preview — toggled-off layers are excluded from STL
- Future layers (roads, water, vegetation) shown as visible but disabled toggles ("Coming soon" or greyed out)
- Terrain is always on — no toggle for terrain (it's the base mesh everything sits on)
- Built layer toggles (buildings) default to ON

### Default values
- Free-form number inputs only, no size presets
- Default max width: 150mm (current value, fits most consumer printers)
- Default Z height: auto-calculated from actual terrain elevation range, scaled proportionally to X/Y dimensions
- All existing layer toggles default to ON

### Claude's Discretion
- Exact collapse/expand animation style
- Toggle switch visual design (matching the existing dark glass sidebar aesthetic)
- Input field validation ranges and step increments
- How "Coming soon" disabled toggles are visually differentiated
- Exact spacing, typography, and section divider styling

</decisions>

<specifics>
## Specific Ideas

- Collapsed section summaries should let you see the full model config at a glance without expanding anything
- The segmented mm/in control should feel like a native toggle, not a dropdown
- Disabled future-layer toggles signal what's coming without cluttering the UI with dead controls

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-model-controls-store-foundation*
*Context gathered: 2026-02-24*
