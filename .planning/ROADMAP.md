# Roadmap: MapMaker

## Milestones

- ✅ **v1.0 MVP** — Phases 1-9 (shipped 2026-02-28)
- 🚧 **v1.1 Building Coverage** — Phases 10-13 (in progress)

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

### 🚧 v1.1 Building Coverage (In Progress)

**Milestone Goal:** Fill building data gaps by merging Overture Maps footprints with existing OSM data so buildings appear everywhere, not just where OSM has coverage.

- [ ] **Phase 10: Overture Access** — Establish PMTiles fetch with validated CORS and graceful fallback
- [ ] **Phase 11: MVT Parser** — Decode and adapt Overture tiles into the existing BuildingFeature format
- [ ] **Phase 12: Deduplication** — Spatial merge that removes Overture footprints overlapping OSM buildings
- [ ] **Phase 13: Pipeline Integration** — Wire parallel fetching and merged buildings into preview and export

## Phase Details

### Phase 10: Overture Access
**Goal**: The app can fetch Overture Maps building footprints for the user's selected bounding box via PMTiles HTTP range requests, with CORS validated and silent fallback to OSM-only when Overture is unavailable
**Depends on**: Phase 9 (v1.0 complete)
**Requirements**: DATA-01, DATA-02
**Success Criteria** (what must be TRUE):
  1. Selecting a bounding box triggers a fetch against the Overture PMTiles URL that returns raw building tile data
  2. When Overture's URL is broken or returns an error, the app completes generation using OSM buildings only with no error shown to the user
  3. The Overture PMTiles URL constant is documented with the 60-day rotation warning and the STAC catalog URL for future updates
  4. Fetching from the production deployment domain succeeds without CORS errors (AllowedHeaders includes `range`, ExposeHeaders includes `etag`)
**Plans**: TBD

Plans:
- [ ] 10-01: TBD

### Phase 11: MVT Parser
**Goal**: Raw Overture MVT tile data is decoded, validated, and adapted into the same BuildingFeature format that the existing buildings pipeline already understands
**Depends on**: Phase 10
**Requirements**: PARSE-01, PARSE-02, PARSE-03, PARSE-04
**Success Criteria** (what must be TRUE):
  1. Overture buildings appear as correctly shaped footprints in the 3D preview, not as inverted or black-faced geometry
  2. Buildings defined as MultiPolygon in Overture (campus clusters, multi-part footprints) each render as an individual building, none silently missing
  3. Tiny ML artifacts (sheds, kiosks, solar panels under 15 m²) do not appear in the preview or export
  4. Gap-fill buildings with no height data use the area-heuristic height fallback, producing visible 3D geometry rather than flat planes
**Plans**: TBD

Plans:
- [ ] 11-01: TBD

### Phase 12: Deduplication
**Goal**: Overture footprints that spatially overlap existing OSM buildings are removed so no building is double-rendered, and Overture buildings with no OSM counterpart pass through unchanged
**Depends on**: Phase 11
**Requirements**: DEDUP-01
**Success Criteria** (what must be TRUE):
  1. In a well-mapped OSM area (central London, central Berlin), no building appears doubled in the 3D preview or produces doubled wall thickness in the STL
  2. In an OSM-sparse area (rural India, Sub-Saharan Africa), Overture gap-fill buildings appear where OSM has none
  3. L-shaped and courtyard buildings with OSM coverage are not double-rendered (bounding-box IoU handles complex shapes)
  4. The deduplication function is covered by unit tests with synthetic cases proving OSM-wins-on-overlap and gap-fill-passes-through behavior
**Plans**: TBD

Plans:
- [ ] 12-01: TBD

### Phase 13: Pipeline Integration
**Goal**: OSM and Overture fetches run in parallel and their merged building list flows seamlessly into the existing 3D preview and STL export with no new UI surface
**Depends on**: Phase 12
**Requirements**: INTEG-01, INTEG-02, INTEG-03
**Success Criteria** (what must be TRUE):
  1. Clicking Generate triggers both the OSM Overpass request and the Overture PMTiles fetch simultaneously, not sequentially
  2. Gap-fill buildings from Overture are visible in the 3D preview alongside OSM buildings, indistinguishable in form
  3. Exporting an STL from an OSM-sparse area produces a file containing gap-fill building geometry that slicers can process without manifold errors
  4. All 176 existing Vitest tests pass, `npx tsc --noEmit` is clean, and `npx vite build` succeeds after integration
**Plans**: TBD

Plans:
- [ ] 13-01: TBD

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
| 10. Overture Access | v1.1 | 0/? | Not started | - |
| 11. MVT Parser | v1.1 | 0/? | Not started | - |
| 12. Deduplication | v1.1 | 0/? | Not started | - |
| 13. Pipeline Integration | v1.1 | 0/? | Not started | - |
