---
phase: 03-buildings
verified: 2026-02-24T17:46:00Z
status: human_needed
score: 4/5 must-haves verified (automated); 1 requires human
re_verification: false
human_verification:
  - test: "Roof shapes rendered distinctly in 3D preview"
    expected: "A European city area (e.g., Munich old town 48.135,11.573 to 48.140,11.580) shows gabled roofs with a visible ridgeline, hipped roofs with four sloped faces, and pyramidal roofs meeting at a point — each visually distinct from flat-topped buildings"
    why_human: "Geometry logic is unit-tested but correct visual rendering of non-flat roof shapes in the Three.js scene requires human confirmation — winding, normals, and face orientation cannot be fully validated without rendering"
  - test: "Buildings in exported STL open without repair warnings in a slicer"
    expected: "Export STL of an area with buildings opens in PrusaSlicer or Bambu Studio without a 'repair required' dialog; slicing produces valid G-code; buildings are visible as protrusions on terrain"
    why_human: "The buildingSolid.test.ts manifold test logs isManifold=false for the CSG-union test case in the unit test environment (boundary-edge-fallback: 26/70 edges). The test passes (WASM-tolerant assertion), but the actual manifold quality of real terrain+buildings exports needs slicer verification. The SUMMARY notes human approval was given — this confirms the outcome but the approval predates the final non-manifold seam fix (9a96f9d)."
---

# Phase 3: Buildings Verification Report

**Phase Goal:** Users can see OSM buildings rendered with real heights on top of terrain, including correct placement on slopes and estimated heights where OSM data is missing

**Verified:** 2026-02-24T17:46:00Z
**Status:** human_needed (automated checks pass; roof visual correctness and slicer manifold quality need human confirmation)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User sees building footprints from OSM extruded to real heights — a dense urban area shows clearly distinct buildings | VERIFIED | `BuildingMesh.tsx` calls `buildAllBuildings()` and renders as `<mesh>` in `PreviewCanvas`; `GenerateButton.tsx` fetches from Overpass and stores in Zustand; 115 tests pass |
| 2 | Buildings with detailed OSM roof geometry (gabled, hipped, flat) render with the correct roof shape | VERIFIED (automated) / ? (visual) | `buildRoofForShape` dispatcher implemented and unit-tested (21 tests); `buildGabledRoof`, `buildHippedRoof`, `buildPyramidalRoof` all produce non-empty Float32Array with apex Z > wall top Z; **visual correctness needs human** |
| 3 | Buildings missing OSM height tags still render with plausible heights from fallback hierarchy (levels, footprint-area, type default) | VERIFIED | Full 4-tier cascade in `height.ts`; 19 passing tests explicitly cover: direct height tag, height+units, feet conversion, building:levels, footprint-area heuristic (4 area ranges), type defaults, cascade priority |
| 4 | Buildings sit exactly at terrain level at their geographic location — a building on a slope has its base flush with the slope | VERIFIED | `sampleElevationAtLonLat()` per-vertex elevation sampling confirmed correct (10 tests); `buildWalls()` accepts per-vertex `baseZmm[]`; `merge.ts` computes `baseZmm[i] = (sampledElevationM - minElevationM) * zScale` using same formula as `terrain.ts` |
| 5 | Exported STL includes buildings and opens without slicer repair warnings | VERIFIED (automated) / ? (slicer) | `ExportPanel.tsx` calls `buildAllBuildings` + `mergeTerrainAndBuildings`; `buildingSolid.test.ts` 6 tests pass; CSG union uses three-bvh-csg ADDITION with merge fallback; **slicer manifold quality needs human** |

**Score:** 4/5 truths fully verified by automated checks; 1 truth (roof visual + slicer quality) needs human

---

## Required Artifacts

### Plan 03-01 Artifacts

| Artifact | Exists | Substantive | Wired | Status |
|----------|--------|-------------|-------|--------|
| `src/lib/buildings/types.ts` | Yes | Yes — BuildingFeature, ParsedBuilding, BuildingGeometryParams | Used by merge.ts, BuildingMesh.tsx, ExportPanel.tsx | VERIFIED |
| `src/lib/buildings/overpass.ts` | Yes | Yes — real Overpass QL POST with correct SW/NE bbox order | Imported in GenerateButton.tsx, called in fetchBuildings() | VERIFIED |
| `src/lib/buildings/parse.ts` | Yes | Yes — osmtogeojson conversion, Polygon + MultiPolygon handling | Imported in GenerateButton.tsx, called after fetchBuildingData | VERIFIED |
| `src/lib/buildings/height.ts` | Yes | Yes — 4-tier cascade: height tag, levels*3.5, footprint-area heuristic, type defaults; unit conversion for feet | Called in merge.ts buildAllBuildings() | VERIFIED |
| `src/lib/buildings/elevationSampler.ts` | Yes | Yes — bilinear interpolation, correct Y-axis convention (ty = (ne.lat - lat) / ...) | Called per-vertex in merge.ts sampleBaseZmm() | VERIFIED |
| `src/lib/buildings/footprint.ts` | Yes | Yes — earcut triangulation with hole support | Called in buildFlatRoof, buildFloorCap | VERIFIED |
| `src/lib/buildings/walls.ts` | Yes | Yes — per-vertex baseZmm, winding detection via signed area (reverses if area < 0) | Called in buildSingleBuilding | VERIFIED |
| `src/lib/buildings/roof.ts` | Yes | Yes — buildFlatRoof, buildFloorCap | Called in buildSingleBuilding | VERIFIED |
| `src/lib/buildings/buildingMesh.ts` | Yes | Yes — floor cap + walls + buildRoofForShape composed into BufferGeometry; wall-height clamping at 50% for non-flat roofs | Called in merge.ts buildAllBuildings() | VERIFIED |
| `src/lib/buildings/merge.ts` | Yes | Yes — full pipeline, zScale = horizontalScale * exaggeration (with MIN_HEIGHT_MM=5 floor for flat terrain), baseZmm = (elevM - minElevationM) * zScale | Called in BuildingMesh.tsx and ExportPanel.tsx | VERIFIED |

### Plan 03-02 Artifacts

| Artifact | Exists | Substantive | Wired | Status |
|----------|--------|-------------|-------|--------|
| `src/lib/buildings/roof.ts` (extended) | Yes | Yes — buildGabledRoof (OBB ridge, left/right slope), buildHippedRoof (inset ridge, pyramidal fallback), buildPyramidalRoof (centroid apex), buildRoofForShape dispatcher | Called in buildSingleBuilding via buildRoofForShape | VERIFIED |
| `src/lib/buildings/obb.ts` | Yes | Yes — Graham scan convex hull + rotating calipers, ~170 lines; returns center, halfExtents, axes (long axis first) | Used by buildGabledRoof and buildHippedRoof | VERIFIED |
| `src/components/Preview/BuildingMesh.tsx` | Yes | Yes — useMapStore subscriptions, useRef geometry, useEffect rebuild on features/elevation/exaggeration change, dispose on unmount | Rendered unconditionally in PreviewCanvas.tsx alongside TerrainMesh | VERIFIED |
| `src/store/mapStore.ts` (extended) | Yes | Yes — buildingFeatures, buildingGenerationStatus, buildingGenerationStep state + setBuildingFeatures, setBuildingGenerationStatus actions | Read in GenerateButton.tsx, BuildingMesh.tsx, ExportPanel.tsx | VERIFIED |

### Plan 03-03 Artifacts

| Artifact | Exists | Substantive | Wired | Status |
|----------|--------|-------------|-------|--------|
| `src/lib/mesh/buildingSolid.ts` | Yes | Yes — unionBuildingsWithTerrain (three-bvh-csg ADDITION with UV stripping) + mergeTerrainAndBuildings (try/catch + 10s timeout fallback to mergeGeometries) | Imported in ExportPanel.tsx | VERIFIED |
| `src/components/Preview/ExportPanel.tsx` (updated) | Yes | Yes — checks buildingFeatures, calls buildAllBuildings + mergeTerrainAndBuildings; non-manifold warning for buildings (non-blocking), hard block for terrain-only; generateFilename(bbox, locationName, hasBuildings) | Active export pipeline used by ExportPanel render | VERIFIED |

---

## Key Link Verification

### Plan 03-01 Key Links

| From | To | Via | Status | Evidence |
|------|----|-----|--------|----------|
| `overpass.ts` | Overpass API | HTTP POST to overpass-api.de with `[out:json][bbox:sw.lat,sw.lon,ne.lat,ne.lon]` | WIRED | Line 31: `fetch('https://overpass-api.de/api/interpreter', { method: 'POST', ... })` |
| `parse.ts` | osmtogeojson | `osmtogeojson(overpassData)` | WIRED | Line 7: `import osmtogeojson from 'osmtogeojson'`; Line 59: `osmtogeojson(overpassData...)` |
| `elevationSampler.ts` | ElevationData | bilinear interpolation of `elevations[y0*gridSize+x0]` | WIRED | Lines 62-65: four surrounding cells read from `elevations[y0 * gridSize + x0]` etc. |
| `buildingMesh.ts` | `walls.ts` | `buildWalls(outerRingMM, baseZmm, wallHeightMM)` | WIRED | Line 67: `buildWalls(outerRingMM, baseZmm, wallHeightMM)` |
| `merge.ts` | `src/lib/utm.ts` | `wgs84ToUTM` for coordinate projection | WIRED | Line 21: `import { wgs84ToUTM } from '../utm'`; used in projectRingToMM and computeFootprintAreaM2 |

### Plan 03-02 Key Links

| From | To | Via | Status | Evidence |
|------|----|-----|--------|----------|
| `BuildingMesh.tsx` | `merge.ts` | `buildAllBuildings()` called with store data | WIRED | Line 14: import; Line 64: `buildAllBuildings(buildingFeatures, bbox, elevationData, params)` — result set on mesh geometry |
| `GenerateButton.tsx` | `overpass.ts` | `fetchBuildingData(bbox)` after elevation fetch | WIRED | Lines 15, 40: import and call inside `fetchBuildings()`, fired via `void fetchBuildings()` after terrain ready |
| `BuildingMesh.tsx` | `mapStore.ts` | `useMapStore` reading `buildingFeatures` | WIRED | Lines 19-27: 8 store selectors; `buildingFeatures` read on line 19 and used in useEffect guard |

### Plan 03-03 Key Links

| From | To | Via | Status | Evidence |
|------|----|-----|--------|----------|
| `ExportPanel.tsx` | `buildingSolid.ts` | `mergeTerrainAndBuildings(terrainSolid, buildingsGeometry)` | WIRED | Line 14 import; Line 137 call; result replaces `exportSolid` |
| `buildingSolid.ts` | three-bvh-csg | `evaluator.evaluate(terrainBrush, buildingsBrush, ADDITION)` | WIRED | Line 14: `import { ADDITION, Brush, Evaluator } from 'three-bvh-csg'`; Line 77: `evaluator.evaluate(...)` |

---

## Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|-------------|--------|----------|
| BLDG-01 | 03-01, 03-02, 03-03 | User sees OSM building footprints extruded to real heights | SATISFIED | Full pipeline: Overpass fetch → parse → height resolve → triangulate → extrude → merge → render in BuildingMesh.tsx; export in ExportPanel.tsx |
| BLDG-02 | 03-02 | Buildings use detailed roof geometry where OSM data available | SATISFIED (automated) / ? (visual) | buildGabledRoof, buildHippedRoof, buildPyramidalRoof implemented and unit-tested (21 tests); buildRoofForShape dispatches on OSM roof:shape tag; visual quality needs human |
| BLDG-03 | 03-01 | Buildings missing height data use fallback hierarchy | SATISFIED | resolveHeight: height tag → levels*3.5 → footprint-area heuristic (<60m²=5m, <200m²=7m, <600m²=10m, >=600m²=14m) → type defaults → 7m ultimate fallback; 19 passing unit tests |
| BLDG-04 | 03-01, 03-02, 03-03 | Buildings sit correctly on terrain at their geographic location | SATISFIED | Per-vertex elevation sampling (sampleElevationAtLonLat), per-vertex baseZmm in buildWalls, zScale = horizontalScale * exaggeration matching terrain.ts; 10 elevation sampler tests + 9 wall tests |

All 4 required requirements are satisfied. No orphaned requirements found (REQUIREMENTS.md shows BLDG-01 through BLDG-04 all mapped to Phase 3).

---

## Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| None found | — | — | — |

Scanned all 13 library files in `src/lib/buildings/`, `BuildingMesh.tsx`, `ExportPanel.tsx`, `buildingSolid.ts`, `GenerateButton.tsx`. No TODO/FIXME/placeholder comments, no empty implementations, no stub returns. All handler functions perform real API calls and state updates.

**Note:** The `return null` on line 103 of `BuildingMesh.tsx` is a legitimate conditional render guard (`if (buildingGenerationStatus !== 'ready') return null`) — not a stub.

---

## Test Suite Summary

| Test File | Tests | Status |
|-----------|-------|--------|
| `buildings/__tests__/height.test.ts` | 19 | All pass |
| `buildings/__tests__/elevationSampler.test.ts` | 10 | All pass |
| `buildings/__tests__/footprint.test.ts` | 8 | All pass |
| `buildings/__tests__/walls.test.ts` | 9 | All pass |
| `buildings/__tests__/roof.test.ts` | 21 | All pass |
| `mesh/__tests__/buildingSolid.test.ts` | 6 | All pass |
| All other existing tests | 42 | All pass (no regressions) |
| **Total** | **115** | **All pass** |

TypeScript: `npx tsc --noEmit` — zero errors.

---

## Human Verification Required

### 1. Roof Shape Visual Correctness

**Test:** Start dev server (`npm run dev`). Draw a bbox over Munich old town (48.135,11.573 to 48.140,11.580). Click "Generate Preview". Wait for buildings to load (status indicator below button shows "N buildings found"). Orbit the 3D preview.

**Expected:** Buildings with `roof:shape=gabled` have a visible ridgeline running along their long axis. Buildings with `roof:shape=hipped` have four sloping faces meeting two ridge endpoints. Buildings with `roof:shape=pyramidal` have a pointed apex at their center. These should be visually distinct from flat-topped buildings.

**Why human:** Geometry buffers for gabled/hipped/pyramidal roofs are unit-tested to have correct apex Z and non-empty Float32Array output. But face winding, normal direction, and visual appearance in a rendered scene cannot be verified without running the app. OBB long-axis detection relies on convex hull accuracy which is tested but not for specific OSM shapes.

### 2. Slicer Manifold Quality

**Test:** After generating a preview of a dense urban area (e.g., downtown Manhattan: 40.705,-74.015 to 40.715,-74.005), click "Export STL". Download the resulting `*-terrain-buildings.stl`. Open it in PrusaSlicer or Bambu Studio.

**Expected:** The STL opens without a "repair required" dialog. The building footprints are visible as protrusions on the terrain surface. Slicing produces valid G-code. If a non-manifold warning appears in the app UI, the slicer should auto-repair it without user intervention.

**Why human:** The `buildingSolid.test.ts` manifold validation test uses a WASM-tolerant assertion that accepts isManifold=false as a passing state (the test outputs "Manifold check: boundary-edge-fallback → isManifold=false"). The three-bvh-csg CSG union is expected to produce a manifold result on real geometry, but whether it succeeds or falls back to mergeGeometries on real terrain-scale meshes can only be confirmed with an actual export. The SUMMARY claims human approval was given prior to the non-manifold seam fix commit (`9a96f9d`) — this should be re-confirmed with the final code.

---

## Gaps Summary

No automated gaps found. All library files exist and are substantive (no stubs). All key links are wired — functions are imported and called with real data, not logged or ignored. All 115 tests pass. TypeScript compiles with zero errors.

The two human verification items are quality-assurance checks, not gaps in implementation. The code is fully wired; the question is whether the visual output and slicer output meet the user-facing quality bar stated in the phase success criteria.

---

_Verified: 2026-02-24T17:46:00Z_
_Verifier: Claude (gsd-verifier)_
