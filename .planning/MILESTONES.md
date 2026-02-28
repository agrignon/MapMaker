# Milestones

## v1.0 MVP (Shipped: 2026-02-28)

**Phases completed:** 9 phases, 25 plans, 6 tasks

**Key accomplishments:**
- Geographic foundation with location search, bounding box selection, and UTM projection pipeline
- Terrain pipeline: DEM elevation data → Martini RTIN mesh → watertight solid STL export
- OSM buildings with real heights, detailed roof geometry (gabled/hipped), and height fallback hierarchy
- Full model controls: layer toggles, physical dimensions (mm/inches), contextual UI visibility
- 3D road network with recessed/raised/flat styles and type-based widths on terrain
- Water body depressions baked into terrain grid + vegetation (parks/forests) as raised geometry
- Edit-iterate UX: state-preserving back-to-edit, live preview updates, location-name STL filenames
- Performance hardening: Web Worker mesh generation, bbox area cap, clean production TypeScript build

**Stats:**
- 12,191 lines of TypeScript
- 164 commits over 5 days (2026-02-23 → 2026-02-28)
- 34/34 v1 requirements satisfied

---

