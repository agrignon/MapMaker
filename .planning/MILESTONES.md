# Milestones

## v1.1 Building Coverage (Shipped: 2026-03-01)

**Phases completed:** 4 phases, 5 plans, 0 tasks

**Key accomplishments:**
- Overture Maps PMTiles fetch with silent OSM-only fallback and 5-second timeout
- MVT tile decoder with winding normalization, MultiPolygon flattening, and 15m² area filter
- AABB IoU deduplication removing overlapping Overture footprints (OSM detail preserved)
- Parallel OSM + Overture fetch wired into generation pipeline via Promise.allSettled
- 88 new tests added (264 total across 21 files), zero regressions

**Stats:**
- 13,994 lines of TypeScript
- 35 commits in 1 day (2026-02-28)
- 10/10 v1.1 requirements satisfied

---

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

