# Phase 7: Vegetation + Terrain Smoothing - Context

**Gathered:** 2026-02-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Two features: (1) Parks and forests rendered as a toggleable raised geometry layer on the terrain, and (2) a smoothing slider that interpolates rough 30m SRTM step artifacts into smoother surfaces for better print quality. Vegetation data comes from OSM (leisure=park, natural=wood, landuse=forest). Smoothing is applied to the DEM elevation grid before all feature placement.

</domain>

<decisions>
## Implementation Decisions

### Vegetation appearance
- Raised plateau geometry — thin elevated platform above surrounding terrain (inverted water depression concept)
- Height: 0.3-0.5mm physical elevation above terrain — subtle, tactile, catches light differently
- Preview color: muted green — clearly "park", distinct from gray terrain and blue water
- Edge smoothing: Chaikin corner-cutting (same approach as WaterMesh) for natural-looking boundaries

### Vegetation scope
- Core OSM tags only: leisure=park, natural=wood, landuse=forest — the obvious green spaces
- Fetched through the existing combined Overpass query (add vegetation tags to single request)
- Minimum area threshold to filter tiny pocket parks — Claude determines sensible cutoff based on model scale
- Full multipolygon support: outer + inner rings properly handled (holes where inner cutouts exist)

### Smoothing slider
- Default: ~25% (light smoothing) — gentle pass to reduce worst SRTM step artifacts without losing detail
- Maximum: moderate — smooths artifacts and softens transitions but preserves major topographic features (mountains still look like mountains)
- Update: real-time debounced — same pattern as exaggeration slider (drag and see terrain update)
- UI location: under the Terrain toggle in the sidebar — grouped with the layer it modifies

### Layer stacking
- Vegetation extends under buildings — the plateau is continuous, buildings sit on top (they're taller anyway)
- Vegetation extends under roads — roads sit on top of the plateau, no cutting/splitting
- Water wins at overlaps — vegetation clipped at water edges, water depression/overlay always visible
- Same clipping plane system as buildings/roads/water — vegetation clipped cleanly at terrain boundary edges

### Claude's Discretion
- Exact minimum area threshold for filtering small vegetation polygons
- Smoothing algorithm choice (Gaussian, bilateral, etc.)
- Exact slider range mapping (what "25%" and "100%" translate to in algorithm parameters)
- Vegetation Z sampling strategy (terrain raycaster vs elevation grid)
- Number of Chaikin smoothing iterations for vegetation edges

</decisions>

<specifics>
## Specific Ideas

- Vegetation plateau is conceptually the inverse of water depression — water lowers terrain, vegetation raises it
- Follow WaterMesh pattern closely: earcut triangulation, Chaikin smoothing, clipping planes, toggle + count display
- Smoothing slider should feel like the exaggeration slider — same debounce pattern, same rebuild flow via worker
- "Vegetation — 0 features found" shown when toggle is on but no parks/forests exist in selected area (per success criteria)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-vegetation-terrain-smoothing*
*Context gathered: 2026-02-25*
