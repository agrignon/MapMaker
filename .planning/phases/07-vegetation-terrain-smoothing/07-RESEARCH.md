# Phase 7: Vegetation + Terrain Smoothing — Research

**Researched:** 2026-02-25
**Domain:** OSM polygon geometry / DEM smoothing / earcut triangulation / Three.js mesh overlay
**Confidence:** HIGH — both features extend well-established patterns already in the codebase

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Vegetation appearance**
- Raised plateau geometry — thin elevated platform above surrounding terrain (inverted water depression concept)
- Height: 0.3-0.5mm physical elevation above terrain — subtle, tactile, catches light differently
- Preview color: muted green — clearly "park", distinct from gray terrain and blue water
- Edge smoothing: Chaikin corner-cutting (same approach as WaterMesh) for natural-looking boundaries

**Vegetation scope**
- Core OSM tags only: leisure=park, natural=wood, landuse=forest
- Fetched through the existing combined Overpass query (add vegetation tags to single request)
- Minimum area threshold to filter tiny pocket parks — Claude determines sensible cutoff based on model scale
- Full multipolygon support: outer + inner rings properly handled

**Smoothing slider**
- Default: ~25% (light smoothing) — gentle pass to reduce worst SRTM step artifacts
- Maximum: moderate — smooths artifacts but preserves major topographic features
- Update: real-time debounced — same pattern as exaggeration slider
- UI location: under the Terrain toggle in the sidebar

**Layer stacking**
- Vegetation extends under buildings — buildings sit on top
- Vegetation extends under roads — roads sit on top
- Water wins at overlaps — vegetation clipped at water edges
- Same clipping plane system as buildings/roads/water

### Claude's Discretion
- Exact minimum area threshold for filtering small vegetation polygons
- Smoothing algorithm choice (Gaussian, bilateral, etc.)
- Exact slider range mapping (what "25%" and "100%" translate to in algorithm parameters)
- Vegetation Z sampling strategy (terrain raycaster vs elevation grid)
- Number of Chaikin smoothing iterations for vegetation edges

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| VEGE-01 | User sees parks and forested areas rendered as a toggleable vegetation layer with distinct geometry | VegetationMesh follows WaterMesh pattern: earcut triangulation, Chaikin smoothing, clipping planes, toggle + count display. OSM tags leisure=park + natural=wood + landuse=forest added to combined Overpass query. |
| TERR-04 | User can control mesh smoothing with a slider to interpolate rough elevation transitions into smooth surfaces | `smoothElevations()` already exists in terrain.ts (Gaussian, separable 1D passes). Phase adds `smoothingLevel` store field, slider UI in TerrainSection, and passes radius param to the existing function. |
</phase_requirements>

---

## Summary

Phase 7 has two features: a vegetation overlay layer and a smoothing slider. Both have clear implementation templates in the existing codebase. Vegetation is architecturally identical to WaterMesh — replace water depression logic with vegetation elevation and substitute OSM tags. Smoothing is even simpler: `smoothElevations()` already exists in `terrain.ts` with a Gaussian kernel; the only work is exposing its `radius` parameter through a store field and a slider UI.

The critical constraint (from STATE.md Phase 7 decision) is that smoothing must be applied to the DEM `Float32Array` **before** `buildTerrainGeometry()` runs — and before `applyWaterDepressions()` as well. Getting the pipeline order wrong destroys building bases and road Z alignment. The existing `smoothElevations()` call in `buildTerrainGeometry()` uses fixed radii (6 and 2); Phase 7 replaces these with a single user-controlled radius.

Vegetation in the STL export needs a flat raised patch geometry — earcut-triangulated polygons placed at `terrainZ + VEGE_HEIGHT_MM` using the terrain raycaster (same as buildings/roads) for accurate Z sampling. The export pipeline in `ExportPanel.tsx` follows the same merge-with-roads pattern (additive merge, not CSG).

**Primary recommendation:** Implement vegetation as a direct port of the WaterMesh pattern with sign-flipped Z offset. Expose smoothing by surfacing the existing `smoothElevations` radius as a store field, replacing the two hardcoded passes in `buildTerrainGeometry` and `updateTerrainElevation`.

---

## Standard Stack

### Core (no new installs required)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `earcut` | 3.0.2 (already installed) | Triangulate vegetation polygons (with holes) | Already used for WaterMesh; handles hole indices correctly |
| `osmtogeojson` | 3.0.0-beta.5 (already installed) | Parse raw Overpass response to GeoJSON | Already used for water/building parsing |
| `three` | 0.183.1 (already installed) | BufferGeometry, clipping planes, mesh | R3F canvas layer; all other layers use this |
| Zustand | 5.0.3 (already installed) | `smoothingLevel` + `vegetationFeatures` store fields | All app state lives here |

### No New Dependencies

All required libraries are already installed. This phase adds no new `npm install` steps.

**Installation:**
```bash
# Nothing to install — all dependencies present
```

---

## Architecture Patterns

### Recommended Project Structure

New files follow the existing per-layer structure:

```
src/
├── lib/
│   └── vegetation/
│       ├── types.ts          # VegetationFeature interface (mirrors water/types.ts)
│       ├── parse.ts          # parseVegetationFeatures() (mirrors water/parse.ts)
│       └── elevation.ts      # applyVegetationElevation() (inverse of water depression)
├── components/Preview/
│   ├── VegetationMesh.tsx    # R3F mesh component (port of WaterMesh.tsx)
│   └── VegetationSection.tsx # Sidebar section (port of WaterSection.tsx)
```

The combined Overpass query lives in `src/lib/overpass.ts` — vegetation tags are appended there, not in a new file.

### Pattern 1: Vegetation Type and Parser (mirror water/types.ts + water/parse.ts)

**What:** VegetationFeature carries the same shape as WaterFeature — outerRing + holes.
The parser filters on `leisure=park`, `natural=wood`, `landuse=forest`.

**When to use:** Parse step is called once per Overpass response, same as water.

```typescript
// src/lib/vegetation/types.ts
export interface VegetationFeature {
  outerRing: [number, number][];
  holes: [number, number][][];
  /** Area in m² computed during parsing — used for minimum-area filter */
  areaM2: number;
}
```

```typescript
// src/lib/vegetation/parse.ts — modelled on water/parse.ts
import osmtogeojson from 'osmtogeojson';
import type { VegetationFeature } from './types';

/** Minimum polygon area in m² to include — filters pocket parks too small to print.
 *  At 150mm / 5km horizontal scale (~0.03mm per meter), a 30m × 30m park = 0.9mm × 0.9mm.
 *  Threshold of 2500 m² (50m × 50m) = ~1.5mm × 1.5mm — just printable.
 *  Recommendation: MIN_VEGE_AREA_M2 = 2500 */
export const MIN_VEGE_AREA_M2 = 2500;

function polygonAreaM2(ring: [number, number][]): number {
  // Shoelace formula on lon/lat — approximate but sufficient for threshold filtering.
  // At mid-latitudes 1 degree lat ≈ 111,000m, 1 degree lon ≈ 111,000m * cos(lat).
  // For filtering purposes, a raw shoelace in degrees * (111000)² gives order-of-magnitude area.
  let area = 0;
  const n = ring.length - 1; // closed ring
  for (let i = 0; i < n; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % n];
    area += x0 * y1 - x1 * y0;
  }
  return Math.abs(area / 2) * 111000 * 111000;
}

export function parseVegetationFeatures(osmJson: unknown): VegetationFeature[] {
  const geoJSON = osmtogeojson(osmJson as Parameters<typeof osmtogeojson>[0]);
  const features: VegetationFeature[] = [];

  for (const feature of geoJSON.features) {
    if (!feature.geometry || !feature.properties) continue;
    const props = feature.properties as Record<string, unknown>;
    const geom = feature.geometry;

    const isVege =
      props['leisure'] === 'park' ||
      props['natural'] === 'wood' ||
      props['landuse'] === 'forest';
    if (!isVege) continue;

    // Process Polygon and MultiPolygon (same as water parser)
    if (geom.type === 'Polygon') {
      const coords = geom.coordinates as number[][][];
      if (coords.length === 0 || coords[0].length < 3) continue;
      const outerRing = coords[0].map(p => [p[0], p[1]]) as [number, number][];
      const areaM2 = polygonAreaM2(outerRing);
      if (areaM2 < MIN_VEGE_AREA_M2) continue;
      features.push({
        outerRing,
        holes: coords.slice(1).map(ring => ring.map(p => [p[0], p[1]]) as [number, number][]),
        areaM2,
      });
    } else if (geom.type === 'MultiPolygon') {
      const polygons = geom.coordinates as number[][][][];
      for (const polygon of polygons) {
        if (polygon.length === 0 || polygon[0].length < 3) continue;
        const outerRing = polygon[0].map(p => [p[0], p[1]]) as [number, number][];
        const areaM2 = polygonAreaM2(outerRing);
        if (areaM2 < MIN_VEGE_AREA_M2) continue;
        features.push({
          outerRing,
          holes: polygon.slice(1).map(ring => ring.map(p => [p[0], p[1]]) as [number, number][]),
          areaM2,
        });
      }
    }
  }
  return features;
}
```

### Pattern 2: Vegetation Elevation (inverse of water depression)

**What:** Instead of lowering the elevation grid (depression), vegetation **raises** it.
The elevation module applies a terrain elevation bump for export STL integration.
For the preview VegetationMesh, the Z is computed inline — same as WaterMesh.

```typescript
// src/lib/vegetation/elevation.ts
// VEGE_HEIGHT_MM: physical height of plateau above terrain surface in mm.
// 0.4mm splits the 0.3–0.5mm range from the decision. Subtly tactile, visible under light.
export const VEGE_HEIGHT_MM = 0.4;
```

The preview mesh places each polygon at `terrainZ + VEGE_HEIGHT_MM`.
For terrain Z, the vegetation mesh uses the same elevation grid sampling as WaterMesh
(elevation grid approach — terrain raycaster is for buildings/roads which need per-vertex Z;
vegetation is a flat plateau so a single representative Z per polygon is sufficient).
The representative Z is the **average** elevation inside the polygon bounding box
(or the center point), not a min like water uses.

**Discretion decision:** Recommend elevation grid average sampling over terrain raycaster.
Rationale: vegetation is a flat plateau — a single Z per polygon is correct by design.
The terrain raycaster adds complexity without correctness benefit for flat overlays.

### Pattern 3: VegetationMesh (direct port of WaterMesh)

Key differences from WaterMesh:
1. Z = `(avgElevation - elevationData.minElevation) * zScale + VEGE_HEIGHT_MM` instead of depression Z
2. Color = muted green (#4a7c59 or similar) instead of blue
3. `polygonOffsetFactor={-4}` (less than water's -6, sits below water in Z-fight priority)
4. position `[0, 0, 0.1]` (below water's 0.15)

```typescript
// src/components/Preview/VegetationMesh.tsx — structure mirrors WaterMesh.tsx exactly
const VEGE_COLOR = '#4a7c59';  // muted forest green, distinct from terrain browns
const CHAIKIN_ITERATIONS = 3;  // same as WaterMesh

// Z for each feature: average of elevation grid cells inside polygon bbox
// then raised by VEGE_HEIGHT_MM
```

### Pattern 4: Smoothing Slider Integration

**What:** `smoothingLevel` (0-100) maps to Gaussian radius (0-8). The existing
`smoothElevations()` in `terrain.ts` accepts a radius. Currently two hardcoded passes
(radius 6 + radius 2) run unconditionally. Phase 7 replaces these with a single
user-controlled pass.

**Slider mapping (Claude's discretion):**
- `smoothingLevel = 0` → radius 0 (no smoothing — raw 30m SRTM steps visible)
- `smoothingLevel = 25` (default) → radius 2 (light pass, removes worst artifacts)
- `smoothingLevel = 100` → radius 8 (heavy smooth, mountains still visible)
- Formula: `radius = Math.round(smoothingLevel / 100 * 8)`

**Why drop the two-pass approach:** The existing radius-6 + radius-2 passes were a
heuristic baked in during Phase 2. A single user-controlled radius is cleaner and
gives the user direct control. The Phase 2 rationale ("blur tile boundary seams") is
better solved by the user adjusting the slider.

**Pipeline order (CRITICAL — from STATE.md Phase 7 decision):**

```
elevationData (raw Float32Array)
  → smoothElevations(radius)         ← Phase 7: user-controlled, applied FIRST
  → applyWaterDepressions(...)       ← Phase 6: applied to smoothed grid
  → buildTerrainGeometry(...)        ← terrain mesh uses result
```

This ordering means water depressions are carved into an already-smoothed terrain,
which is correct — the shoreline transition is still gradual, not jagged.

**Store addition:**
```typescript
// mapStore.ts additions
smoothingLevel: number;   // 0-100, default 25
setSmoothingLevel: (value: number) => void;
```

**TerrainMesh.tsx and ExportPanel.tsx changes:**
- Both call `buildTerrainGeometry` which calls `smoothElevations` internally.
- After Phase 7, `buildTerrainGeometry` accepts an optional `smoothingRadius` param
  (or the smoothing is applied before passing elevData in — the latter is cleaner
  since it avoids changing TerrainMeshParams which is shared with workers).
- Recommendation: apply smoothing in TerrainMesh.tsx and ExportPanel.tsx **before**
  passing elevationData to `applyWaterDepressions` and `buildTerrainGeometry`.
  Remove the hardcoded two-pass call from inside `buildTerrainGeometry`.

**Debounce:** Same 250ms debounce pattern as exaggeration slider.
TerrainMesh rebuilds on `smoothingLevel` change — this is already inexpensive
because `buildTerrainGeometry` runs on main thread for terrain (no worker).
The rebuild shows through normal terrain geometry replacement.

### Pattern 5: Overpass Query Extension

Add vegetation tags to `fetchAllOsmData()` in `src/lib/overpass.ts`:

```typescript
// Addition to the union set in the Overpass query:
  way["leisure"="park"];
  relation["leisure"="park"]["type"="multipolygon"];
  way["natural"="wood"];
  relation["natural"="wood"]["type"="multipolygon"];
  way["landuse"="forest"];
  relation["landuse"="forest"]["type"="multipolygon"];
```

The relation recursion (`>;out skel qt;`) already present handles vegetation multipolygons.

### Pattern 6: Vegetation Export Path

In `ExportPanel.tsx`, vegetation follows the roads pattern (additive merge, not CSG):

```typescript
// After roads merge, before validation:
const hasVegetation = Boolean(vegetationFeatures && vegetationFeatures.length > 0 && vegetationVisible);
if (hasVegetation && vegetationFeatures) {
  // Build flat raised patch geometry (earcut triangulated polygons at terrain Z + VEGE_HEIGHT_MM)
  // Clip to footprint (same as roads)
  // mergeGeometries([exportSolid, vegetationGeom]) — additive merge
}
```

The vegetation export geometry is a flat raised mesh (no walls/base needed — the base
plate underneath covers it). Each polygon becomes a flat patch triangulated at
`terrainZ + VEGE_HEIGHT_MM` where `terrainZ` is sampled from the smoothed elevation grid.

### Anti-Patterns to Avoid

- **Applying smoothing AFTER feature placement:** Destroys building bases and road edges.
  Smoothing MUST run on the raw elevation grid before ANY feature geometry is built.
- **Applying smoothing inside `buildTerrainGeometry()` with a hardcoded radius:** Already
  the current approach — Phase 7 moves the smoothing call OUT of this function and
  into the callers, so the caller controls the radius and the smoothed data flows
  through to water depression correctly.
- **Using terrain raycaster for vegetation Z:** Overkill for flat plateau patches.
  Grid sampling (same as WaterMesh) is sufficient and simpler.
- **Building vegetation geometry in a worker:** WaterMesh (the template) runs earcut
  on the main thread. Vegetation is similar complexity — fast enough without worker overhead.
- **Vegetation in STL using CSG:** Roads and vegetation are both additive (sit above terrain).
  CSG is only for buildings. Use mergeGeometries for both.
- **Ignoring the `smoothingLevel` rebuild trigger on TerrainMesh:** TerrainMesh's
  `useEffect` dep array must include `smoothingLevel` to rebuild on slider change.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Polygon triangulation with holes | Custom triangle fan | `earcut` (already installed) | earcut handles arbitrary polygons with multiple hole rings; already used in WaterMesh |
| OSM data to GeoJSON | Raw element parsing | `osmtogeojson` (already installed) | Handles all OSM relation types including multipolygon; already used in every parser |
| Smoothing convolution | Naive 2D kernel | `smoothElevations()` in terrain.ts (already written) | Separable 1D passes are O(n·k) not O(n·k²); already tested; handles edge normalization |
| Point-in-polygon for area filter | Custom winding number | Shoelace for area + `pointInRing` from depression.ts | pointInRing already exists in the codebase for water |

**Key insight:** Every primitive needed for this phase is already written. The work is
wiring existing pieces together, not building new algorithms.

---

## Common Pitfalls

### Pitfall 1: Smoothing Applied After Water Depression
**What goes wrong:** Water shore artifacts — the taper zone created by `applyWaterDepressions`
gets blurred, causing water bodies to visually bleed into adjacent terrain.
**Why it happens:** Running `smoothElevations` after `applyWaterDepressions` smooths
across the sharp water-land boundary.
**How to avoid:** Always order: `smooth → water depression → buildTerrainGeometry`.
All three callers (TerrainMesh.tsx, ExportPanel.tsx, and any future paths) must follow
this order.
**Warning signs:** Water overlay floats above terrain because depression was applied
to raw grid but terrain mesh uses smoothed-then-depressed grid at different Z.

### Pitfall 2: smoothElevations Inside buildTerrainGeometry vs. Outside
**What goes wrong:** The current code applies two hardcoded smoothing passes INSIDE
`buildTerrainGeometry`. If Phase 7 adds a user-controlled radius ALSO inside, the
function gets two separate smoothing levels applied in sequence — user gets more
smoothing than expected.
**How to avoid:** Remove the hardcoded passes from `buildTerrainGeometry`. Move
smoothing to callers. Pass already-smoothed elevationData into the function.
This also means `updateTerrainElevation` must be updated or removed — it also
contains the hardcoded two-pass smooth.
**Warning signs:** Slider at "0%" still produces smoothed terrain.

### Pitfall 3: VegetationMesh Z-Fighting with Terrain
**What goes wrong:** Flat vegetation patches at terrain Z + VEGE_HEIGHT_MM flicker
against the terrain mesh because VEGE_HEIGHT_MM = 0.4mm is tiny.
**How to avoid:** Use `polygonOffset` material flags (same as RoadMesh/WaterMesh).
Additionally, the 0.1 world unit position offset already used by WaterMesh is correct
here too. Set `polygonOffsetFactor={-4}` to be above terrain but below water.
**Warning signs:** Green patches flickering or partially invisible in preview.

### Pitfall 4: Vegetation Overpass Query Rate Limit
**What goes wrong:** Adding 6 new clause lines to the combined query may exceed
Overpass `maxsize` limit for dense urban areas with many parks.
**How to avoid:** The current query already has `[maxsize:33554432]` (32MB). OSM
vegetation polygon data is lighter than building relations — this is unlikely to be
an issue. But verify with a dense test case (Manhattan, Amsterdam). If it is a
problem, add a smaller `maxsize` fallback or reduce other query terms.
**Warning signs:** Overpass returns 429 or `maxsize exceeded` error on export.

### Pitfall 5: MIN_VEGE_AREA_M2 Threshold vs. Model Scale
**What goes wrong:** A fixed area threshold in m² may be too large for small-scale
selections (1km × 1km) where even 50m parks are significant, or too small for large
selections (50km × 50km) where tiny parks produce noisy geometry.
**How to avoid:** The threshold is relative to model bbox area, not absolute. Consider
`minAreaM2 = max(2500, bboxAreaM2 * 1e-5)` for scale-adaptive filtering.
At 5km × 5km (25km² bbox): min = max(2500, 250) = 2500m²
At 50km × 50km (2500km² bbox): min = max(2500, 25000) = 25000m²
**Recommendation:** Start with fixed 2500m² threshold. Scale-adaptive is a v2 enhancement.
**Warning signs:** Too many tiny triangles in preview for large city bboxes.

### Pitfall 6: VegetationMesh Rebuild on Smoothing Change
**What goes wrong:** `smoothingLevel` changes → terrain rebuilds correctly, but
VegetationMesh Z values (which depend on the smoothed terrain Z) do not update.
**Why it happens:** VegetationMesh computes vegetation Z from raw `elevationData`,
not from the smoothed grid.
**How to avoid:** VegetationMesh must read from the post-smoothed elevation grid.
Option A: Store the smoothed elevData in the Zustand store (expensive — duplicates data).
Option B: VegetationMesh re-runs smoothing itself using `smoothingLevel` (simple, consistent).
Recommendation: Option B — same approach as WaterMesh which recomputes depressionZ inline.
VegetationMesh should apply `smoothElevations(elevations, gridSize, radius)` to get
the smoothed grid before computing vegetation Z.
**Warning signs:** Vegetation patches float above or sink into terrain after slider change.

### Pitfall 7: Export Pipeline Missing Vegetation
**What goes wrong:** VegetationMesh renders in preview, user exports, vegetation not in STL.
**How to avoid:** Follow the roads pattern — explicit vegetation block in `handleExport()`.
Check `vegetationFeatures && vegetationVisible`.
**Warning signs:** User reports "looks right in preview but not in STL".

---

## Code Examples

### Smoothing Radius Mapping

```typescript
// Recommended slider → radius mapping (Claude's discretion)
// smoothingLevel: 0-100 (store field, default 25)
// radius: 0-8 (passed to smoothElevations)
function smoothingLevelToRadius(level: number): number {
  return Math.round((level / 100) * 8);
}
// level=0  → radius 0 (no smoothing)
// level=25 → radius 2 (default, gentle)
// level=50 → radius 4 (moderate)
// level=100 → radius 8 (heavy)
```

### Smoothing in TerrainMesh.tsx (after Phase 7 refactor)

```typescript
// TerrainMesh.tsx — smoothing applied BEFORE water depression
const smoothingLevel = useMapStore((s) => s.smoothingLevel);

useEffect(() => {
  if (!elevationData || !dimensions) return;
  const radius = Math.round((smoothingLevel / 100) * 8);

  // 1. Smooth elevation grid (user-controlled)
  const smoothedElev: ElevationData = radius > 0
    ? {
        ...elevationData,
        elevations: smoothElevations(elevationData.elevations, elevationData.gridSize, radius),
      }
    : elevationData;

  // 2. Apply water depression to SMOOTHED grid
  const effectiveElevData = (waterFeatures && waterFeatures.length > 0 && waterVisible && bbox)
    ? applyWaterDepressions(smoothedElev, waterFeatures, bbox)
    : smoothedElev;

  // 3. Build terrain (no smoothing inside buildTerrainGeometry anymore)
  const newGeometry = buildTerrainGeometry(effectiveElevData, params);
  ...
}, [..., smoothingLevel]);
```

### VegetationMesh Z Computation

```typescript
// For each vegetation feature in VegetationMesh:
// Sample center point elevation from smoothed grid
const cx = (feature.outerRing.reduce((s, p) => s + p[0], 0) / feature.outerRing.length);
const cy = (feature.outerRing.reduce((s, p) => s + p[1], 0) / feature.outerRing.length);
const gx = Math.round(((cx - bbox.sw.lon) / lonRange) * (gridSize - 1));
const gy = Math.round((1 - (cy - bbox.sw.lat) / latRange) * (gridSize - 1));
const clampedGx = Math.max(0, Math.min(gridSize - 1, gx));
const clampedGy = Math.max(0, Math.min(gridSize - 1, gy));
const centerElev = smoothedElevations[clampedGy * gridSize + clampedGx];
const vegeZ = (centerElev - elevationData.minElevation) * zScale + VEGE_HEIGHT_MM;
```

### Overpass Query Extension (src/lib/overpass.ts)

```typescript
// Add inside the union set ( ... ):
  way["leisure"="park"];
  relation["leisure"="park"]["type"="multipolygon"];
  way["natural"="wood"];
  relation["natural"="wood"]["type"="multipolygon"];
  way["landuse"="forest"];
  relation["landuse"="forest"]["type"="multipolygon"];
```

### Store Addition (mapStore.ts)

```typescript
// State field additions:
smoothingLevel: number;       // 0-100, default 25
vegetationFeatures: VegetationFeature[] | null;
vegetationGenerationStatus: 'idle' | 'fetching' | 'ready' | 'error';
vegetationGenerationStep: string;

// Action additions:
setSmoothingLevel: (value: number) => void;
setVegetationFeatures: (features: VegetationFeature[] | null) => void;
setVegetationGenerationStatus: (status: ..., step?: string) => void;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Two hardcoded smooth passes in terrain.ts (radius 6 + 2) | Single user-controlled radius (Phase 7) | Phase 7 | User controls smoothing; old passes removed from buildTerrainGeometry |
| LayerPlaceholderSection for Vegetation | VegetationSection with real data | Phase 7 | Placeholder removed, real component added |

**Deprecated/outdated after Phase 7:**
- Hardcoded `smoothElevations(elevations, gridSize, 6)` + `smoothElevations(coarse, gridSize, 2)` calls in `buildTerrainGeometry()` — replaced by caller-side controlled smoothing
- `updateTerrainElevation()` also contains duplicate hardcoded smoothing — requires same refactor or removal (the in-place Z update path exists for exaggeration changes but may be simplified away since terrain rebuilds fully anyway)

---

## Open Questions

1. **Should `updateTerrainElevation()` be kept or removed?**
   - What we know: It performs in-place Z update to avoid re-running Martini on exaggeration changes. It also contains the hardcoded two-pass smooth.
   - What's unclear: Is the optimization still worthwhile? TerrainMesh.tsx currently calls `buildTerrainGeometry` (full rebuild) on every change, not `updateTerrainElevation`. Searching the codebase confirms `updateTerrainElevation` is exported but only tested — not used in the live component.
   - Recommendation: `updateTerrainElevation` appears unused in the live render path. Phase 7 can simply update `buildTerrainGeometry` to remove hardcoded smoothing. `updateTerrainElevation` can be deprecated (leave exported but note it's not called in Preview).

2. **Where does the vegetation generation get triggered?**
   - What we know: Buildings, roads, and water are all fetched as part of `fetchAllOsmData()` in the generation flow (triggered by `GenerateButton`).
   - What's unclear: The exact trigger point — it appears to be in `GenerateButton.tsx` or wherever `fetchAllOsmData` is called.
   - Recommendation: Vegetation fetch/parse is part of the same `fetchAllOsmData()` call. No new fetch step needed — `parseVegetationFeatures(osmJson)` is called alongside `parseWaterFeatures()` in the generation flow.

3. **What is the exact slider range label? "0 — No Smoothing" to "100 — Maximum"?**
   - What we know: Context says default ~25% with moderate maximum.
   - What's unclear: Label text not specified.
   - Recommendation: Label endpoints as "Raw" (0) and "Max" (100) with the current value as a percentage. Match TerrainSection style.

4. **Vegetation in export — flat patch only, or should it have walls?**
   - What we know: VEGE_HEIGHT_MM = 0.4mm above terrain. Water is a flat overlay only.
   - What's unclear: Whether a 0.4mm raised patch with no walls is printable/visible on STL.
   - Recommendation: Flat patch only (no walls) for simplicity. At 0.4mm height, walls would be too thin to print. The raised surface is what matters.

---

## Validation Architecture

`workflow.nyquist_validation` is absent from config.json — treated as false. Skipping Validation Architecture section.

---

## Sources

### Primary (HIGH confidence)
- **Codebase direct read** — `src/lib/water/` (types.ts, parse.ts, depression.ts), `WaterMesh.tsx`, `WaterSection.tsx`, `TerrainMesh.tsx`, `terrain.ts`, `overpass.ts`, `mapStore.ts`, `ExportPanel.tsx`, `meshBuilderClient.ts` — all implementation patterns verified by reading actual source
- **STATE.md** — Phase 7 decision: "Smooth DEM elevation Float32Array BEFORE all feature placement" — authoritative project record

### Secondary (MEDIUM confidence)
- **CONTEXT.md** — User decisions captured from `/gsd:discuss-phase` session — locked constraints followed exactly

### Tertiary (LOW confidence)
- **Shoelace area formula accuracy** — Using lat/lon degrees for area approximation is inaccurate at high latitudes (cos(lat) correction needed for longitude). For threshold filtering at scales we care about (2500m²), the error is acceptable. For production-quality area, use UTM coordinates.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed and used; no new tech
- Architecture: HIGH — VegetationMesh is a verified port of WaterMesh; smoothing function already written
- Pitfalls: HIGH — smoothing pipeline order verified against STATE.md and actual terrain.ts code; Z-fighting patterns verified from RoadMesh/WaterMesh existing solutions
- Export integration: HIGH — ExportPanel pattern followed from roads/water existing code

**Research date:** 2026-02-25
**Valid until:** 2026-03-25 (stable stack; no fast-moving dependencies)
