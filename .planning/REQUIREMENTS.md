# Requirements: MapMaker

**Defined:** 2026-02-28
**Core Value:** Users can turn any place in the world into a physical 3D-printed model with full control over features and dimensions

## v1.1 Requirements

Requirements for Overture Maps building coverage gap-fill. Each maps to roadmap phases.

### Data Access

- [ ] **DATA-01**: User's selected area fetches building footprints from Overture Maps via PMTiles in addition to OSM
- [ ] **DATA-02**: App silently falls back to OSM-only when Overture data is unavailable (no error shown to user)

### Parsing

- [ ] **PARSE-01**: Overture building footprints are decoded from MVT and converted to the existing BuildingFeature format
- [ ] **PARSE-02**: Complex multi-part Overture buildings (MultiPolygon) render correctly as individual buildings
- [ ] **PARSE-03**: Overture building geometry has correct face normals (ring winding order normalized to match OSM pipeline)
- [ ] **PARSE-04**: Small ML artifacts (< 15m²) are filtered out from Overture results

### Deduplication

- [ ] **DEDUP-01**: Overture buildings overlapping existing OSM buildings are removed via bbox IoU (OSM detail preserved)

### Integration

- [ ] **INTEG-01**: OSM and Overture fetches run in parallel (no added latency)
- [ ] **INTEG-02**: Gap-fill buildings from Overture appear in 3D preview alongside OSM buildings
- [ ] **INTEG-03**: Gap-fill buildings from Overture are included in STL export as watertight geometry

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Enhanced Coverage

- **ECOV-01**: Overture building parts (building_part theme) provide detailed roof geometry for gap-fill buildings
- **ECOV-02**: LiDAR-derived height data from Overture sources[] array used where available (US coverage)
- **ECOV-03**: Alternative gap-fill sources (Microsoft Global ML Building Footprints) as regional supplement

### Release Management

- **RMGT-01**: Dynamic Overture release URL discovery via STAC catalog (auto-update on new releases)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Confidence-score filtering | Overture buildings theme has no confidence score field |
| Real-time STAC polling | Adds fragility; pin to known release, update per MapMaker release cycle |
| Overture building category styling | Conflicts with single-geometry STL merge; ML category coverage too sparse |
| Server-side proxy for Overture data | Breaks client-side architecture; PMTiles works from browser |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 10 | Pending |
| DATA-02 | Phase 10 | Pending |
| PARSE-01 | Phase 11 | Pending |
| PARSE-02 | Phase 11 | Pending |
| PARSE-03 | Phase 11 | Pending |
| PARSE-04 | Phase 11 | Pending |
| DEDUP-01 | Phase 12 | Pending |
| INTEG-01 | Phase 13 | Pending |
| INTEG-02 | Phase 13 | Pending |
| INTEG-03 | Phase 13 | Pending |

**Coverage:**
- v1.1 requirements: 10 total
- Mapped to phases: 10
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-28*
*Last updated: 2026-02-28 — traceability filled during roadmap creation*
