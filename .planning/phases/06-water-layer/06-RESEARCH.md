# Phase 6: Water Layer - Research

**Researched:** 2026-02-25
**Domain:** OSM water feature parsing, elevation grid manipulation, terrain mesh integration
**Confidence:** HIGH

## Summary

The water layer has two distinct concerns that must be architecturally separated: (1) baking a physical depression into the elevation grid before terrain mesh generation, so the STL correctly shows water as a recessed area; and (2) rendering a visual overlay mesh in the 3D preview. The locked architectural decision from STATE.md is clear: water depression is applied to the elevation grid BEFORE `buildTerrainGeometry()`, making the STL physically accurate. The `WaterMesh.tsx` component is visual only.

OSM provides water bodies as closed polygon ways or multipolygon relations tagged `natural=water`. These are area features (not polylines), so parsing produces GeoJSON `Polygon` or `MultiPolygon` output from `osmtogeojson`. The Overpass query is a single bbox fetch for `natural=water` areas. The deprecated `waterway=riverbank` tag (down from 300k to ~1,400 uses as of 2022) should also be queried for backward compatibility with older-mapped areas, but `natural=water` is the primary and nearly universal tag today.

Coastal/ocean handling is explicitly called out in STATE.md as an open blocker for Phase 6. `natural=coastline` from Overpass returns raw, potentially unclosed ways that require pre-processing (the planet-wide osmdata.openstreetmap.de dataset is not queryable by bbox as a REST API — it is a static bulk download). The v1 decision must be made before implementation: scope coastline out, use an elevation-zero raster fallback (if elevation at grid cells is ~0m, treat as ocean), or accept the limitation that coastal models will show ocean at the DEM's minimum elevation rather than as a true depression. Research strongly recommves scoping coastline/ocean to v2 and documenting the limitation, since the primary use case (rivers, lakes) is fully achievable via Overpass.

The depression bake algorithm works by: for each water polygon, rasterize its boundary mask onto the elevation grid (point-in-polygon test for each grid cell), then set matching cells' elevation to `min(surroundingElevation) - DEPRESSION_DEPTH_M`. Islands inside lake polygons (holes in multipolygons) must be excluded from the mask. This requires earcut-compatible hole handling — `osmtogeojson` correctly produces GeoJSON `Polygon` with holes as subsequent coordinate rings, matching the pattern already used in `src/lib/buildings/` (which uses earcut with hole indices).

**Primary recommendation:** Use Overpass `natural=water` + `waterway=riverbank` polygon fetch → osmtogeojson → rasterize polygon mask onto elevation grid → apply depression → pass modified elevations to `buildTerrainGeometry()`. WaterMesh.tsx renders a flat blue overlay at the depression Z for visual distinction in preview. Scope coastline/ocean to v2.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| WATR-01 | User sees water bodies (rivers, lakes, ocean) rendered as flat depressions at water level within the selected area | OSM `natural=water` polygon fetch via Overpass + elevation grid depression bake before `buildTerrainGeometry()`. Ocean scoped to v2 (see coastline blocker). Visual overlay via WaterMesh.tsx component following RoadMesh/BuildingMesh pattern. |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| osmtogeojson | ^3.0.0-beta.5 | Convert Overpass API JSON to GeoJSON | Already in project (used by roads layer); handles `natural=water` polygons and multipolygon relations with holes correctly |
| earcut | ^3.0.2 | Triangulate water polygon for visual WaterMesh | Already in project (used by buildings); handles holes for island-in-lake cases |
| three | ^0.183.1 | BufferGeometry for WaterMesh visual overlay | Already in project |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| three-mesh-bvh | ^0.9.8 | Not needed for water | Water uses elevation-grid approach, not raycasting |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Elevation grid depression bake | CSG boolean subtract water volumes from terrain | CSG is O(n²) on dense meshes — this is the exact cost that motivated the vertex-displacement strategy locked in Phase 5. Elevation grid mutation is O(grid_cells) — trivially fast. |
| Overpass `natural=water` | osmdata.openstreetmap.de pre-processed polygons | osmdata.openstreetmap.de water polygons are only ocean/sea (coastline-derived); it is a static bulk download, not a bbox-queryable REST API. Overpass is the correct source for inland water. |
| Simple flat colored plane overlay | Three.js ShapeGeometry from polygon | ShapeGeometry correctly handles polygon holes (earcut-based internally). Either approach works — flat colored plane is simpler; ShapeGeometry gives exact polygon boundary. Use ShapeGeometry for accuracy. |

**Installation:**
```bash
# No new packages needed — osmtogeojson, earcut, and three already installed
```

## Architecture Patterns

### Recommended Project Structure

```
src/
├── lib/
│   └── water/
│       ├── types.ts          # WaterFeature interface (polygon + holes)
│       ├── overpass.ts       # fetchWaterData(bbox) — Overpass query
│       ├── parse.ts          # parseWaterFeatures(osmJson) — osmtogeojson wrapper
│       ├── depression.ts     # applyWaterDepressions(elevData, features, ...) — grid mutation
│       └── __tests__/
│           ├── parse.test.ts       # unit: polygon + multipolygon parsing
│           └── depression.test.ts  # unit: grid cell masking + depression depth
├── components/Preview/
│   ├── WaterMesh.tsx         # R3F visual overlay (follows RoadMesh.tsx pattern)
│   └── WaterSection.tsx      # Sidebar toggle (follows RoadsSection.tsx pattern)
```

### Pattern 1: Elevation Grid Depression Bake

**What:** Before calling `buildTerrainGeometry()`, iterate all water polygons, rasterize each polygon's bbox onto the elevation grid, test each cell center for point-in-polygon containment (respecting holes), and set matching cells to a depression elevation value.

**When to use:** Always — this is the only way to get physical depressions in the exported STL.

**Example:**

```typescript
// src/lib/water/depression.ts
import type { ElevationData } from '../../types/geo';
import type { WaterFeature } from './types';

/** Depression depth in meters (rendered as ~0.5-1mm at typical scale) */
const WATER_DEPRESSION_M = 2.0;

/**
 * Mutates the elevations array in-place, setting water-covered cells to a depression.
 *
 * Algorithm:
 * 1. For each water feature polygon:
 *    a. Project polygon ring from WGS84 to grid coordinates (fraction of gridSize)
 *    b. Compute bbox of projected polygon for early culling
 *    c. For each grid cell in bbox, test cell center for point-in-polygon
 *       (respecting holes — cells inside inner rings are NOT depressed)
 *    d. Set matching cells to min(water_boundary_elevations) - WATER_DEPRESSION_M
 *       (ensures depression is below the water's lowest shoreline)
 *
 * CRITICAL: Must be called BEFORE buildTerrainGeometry(). The modified ElevationData
 * is then passed to buildTerrainGeometry() so the STL contains the physical depression.
 */
export function applyWaterDepressions(
  elevData: ElevationData,
  features: WaterFeature[],
  bbox: BoundingBox
): ElevationData {
  const modifiedElevations = new Float32Array(elevData.elevations);
  // ... rasterize each feature polygon onto the grid ...
  return { ...elevData, elevations: modifiedElevations };
}
```

### Pattern 2: Point-in-Polygon Rasterization (no library)

**What:** For each grid cell center, test containment using the ray casting algorithm. Holes are handled by XOR: a cell is inside the polygon if it is inside the outer ring AND NOT inside any hole ring.

**When to use:** This is hand-rolled because no existing project dependency provides grid-rasterization. The algorithm is ~20 lines; `point-in-polygon` npm package is not needed given earcut is already available and the algorithm is trivial.

```typescript
/** Ray-cast point-in-polygon test for a single ring. */
function pointInRing(px: number, py: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = ((yi > py) !== (yj > py)) &&
                      (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/** True if point is inside outer ring AND outside all hole rings. */
function pointInPolygon(
  px: number, py: number,
  outerRing: [number, number][],
  holes: [number, number][][]
): boolean {
  if (!pointInRing(px, py, outerRing)) return false;
  for (const hole of holes) {
    if (pointInRing(px, py, hole)) return false;
  }
  return true;
}
```

**Why not use earcut:** earcut triangulates; it doesn't test containment. The ray-cast algorithm is the correct tool here.

### Pattern 3: WaterMesh.tsx Visual Overlay

**What:** A flat mesh at the depression Z level, clipped at terrain edges, rendered with a blue material. Follows the identical pattern to `RoadMesh.tsx` — reads `waterFeatures` from store, builds geometry off-thread via worker (or synchronously on main thread since flat polygon meshes are cheap), renders with `meshStandardMaterial` + clipping planes.

**When to use:** Preview only. Export does NOT need WaterMesh — the depression is already in the terrain geometry from the grid bake.

```typescript
// WaterMesh.tsx — follows RoadMesh.tsx pattern exactly
// Key differences:
// - color: '#3b82f6' (blue) instead of '#555555' (dark gray)
// - geometry: flat ShapeGeometry triangulated from water polygons at depression Z
// - no topFaceOnly distinction (always flat)
// - no roadStyle concept (always flat depression surface)
```

### Pattern 4: Modified ElevationData Flow in TerrainMesh.tsx

**What:** `TerrainMesh.tsx` currently calls `buildTerrainGeometry(elevationData, params)`. With water, it must call `applyWaterDepressions(elevationData, waterFeatures, bbox)` first, then pass the result to `buildTerrainGeometry`. The same modified elevation data goes to the export pipeline.

**Critical:** The store should expose `waterFeatures` (parallel to `buildingFeatures`, `roadFeatures`). The modified elevation data for terrain building is computed locally in TerrainMesh and ExportPanel — the raw `elevationData` in the store remains unmodified. This avoids double-modification if terrain is rebuilt.

```typescript
// In TerrainMesh.tsx useEffect:
const waterFeatures = useMapStore(s => s.waterFeatures);
const waterVisible = useMapStore(s => s.layerToggles.water);

const effectiveElevData = (waterFeatures && waterFeatures.length > 0 && waterVisible)
  ? applyWaterDepressions(elevationData, waterFeatures, bbox)
  : elevationData;

const newGeometry = buildTerrainGeometry(effectiveElevData, params);
```

### Pattern 5: Overpass Query for Water Polygons

**What:** Fetch all `natural=water` closed ways and relations, plus legacy `waterway=riverbank` ways, for the bbox. Use `out geom` so node coordinates are included in the response.

```
[out:json][timeout:60][maxsize:33554432][bbox:${sw.lat},${sw.lon},${ne.lat},${ne.lon}];
(
  way["natural"="water"];
  relation["natural"="water"];
  way["waterway"="riverbank"];
);
out geom;
>;
out skel qt;
```

**Note on `>;` and `out skel qt`:** For relations, Overpass needs the member ways and their nodes. The `>;` recursion fetches member objects so osmtogeojson can reconstruct the polygon geometry. Without this, multipolygon relations come back as empty geometry.

### Anti-Patterns to Avoid

- **Mutating the store's `elevationData` directly:** Set water depression on a copy. If the raw grid is mutated, toggling the water layer off cannot restore the original terrain.
- **Applying water depression in `buildTerrainGeometry()`:** The function has no knowledge of water features — keep it pure. Depression is a pre-processing step by the caller.
- **Using CSG to cut water volumes:** The locked decision from Phase 5 is vertex displacement / grid modification, not CSG, for water. CSG is O(n²) and was already rejected for this use case.
- **Fetching ocean via Overpass `natural=coastline`:** Coastline ways are not closed polygons; they require planet-scale stitching to be usable. Query yields ~20,000 disconnected ways for a coastal bbox — osmtogeojson cannot close them.
- **Skipping `>;` in the Overpass query for relations:** Without member recursion, `osmtogeojson` cannot reconstruct multipolygon geometry from relation data — it will silently produce empty coordinates arrays.
- **Not handling the `waterway=riverbank` legacy tag:** ~1,400 remaining uses worldwide. Worth a union query to avoid blank rivers in a handful of areas.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OSM JSON to GeoJSON | Custom parser for OSM relations/multipolygons | `osmtogeojson` (already in project) | Multipolygon role handling (outer/inner), tainted-feature detection, and ring closure are all solved and tested |
| Water polygon triangulation for visual mesh | Custom triangulator | `earcut` (already in project) | Hole support for islands already proven by buildings layer |
| Overpass rate-limit handling | Custom retry/backoff | Chain via `.finally()` pattern (established in Phase 5) | Stagger water fetch after buildings/roads fetch |

**Key insight:** The hardest problem in this phase is the elevation-grid depression bake, and that is entirely hand-rolled math (~50 lines). Everything else reuses existing project patterns exactly.

## Common Pitfalls

### Pitfall 1: Overpass Multipolygon Relations Returning Empty Geometry

**What goes wrong:** Water bodies mapped as OSM relations (e.g., large lakes with islands) return zero coordinates from osmtogeojson.

**Why it happens:** The Overpass query returns the relation metadata but not the member ways/nodes unless `>;` (recurse down) is added to the query. osmtogeojson requires node coordinates to close polygon rings.

**How to avoid:** Always add `>;` followed by `out skel qt;` after the main query. Verify in parse.test.ts that multipolygon relations produce non-empty coordinate arrays.

**Warning signs:** Water features with `geometry.type === 'MultiPolygon'` but empty or single-point coordinate arrays.

### Pitfall 2: Island in Lake Not Handled (Filled Over Island)

**What goes wrong:** A lake with an island has the island's grid cells depressed along with the lake, causing the island to disappear into the water depression in the STL.

**Why it happens:** The depression rasterizer tests only outer ring containment, ignoring hole rings.

**How to avoid:** `applyWaterDepressions` must test point-in-polygon with full hole exclusion. GeoJSON `Polygon` produces `coordinates[0]` = outer ring, `coordinates[1..n]` = hole rings. `MultiPolygon` produces multiple polygons each with their own hole arrays. The point-in-polygon test must be: inside outerRing AND NOT inside any hole.

**Warning signs:** STL shows a flat depression where an island should be. Test: create a synthetic `ElevationData` with a known 5x5 grid, apply a water polygon with a center hole, and assert the center cell was NOT depressed.

### Pitfall 3: Raw elevationData Mutation Breaks Layer Toggle

**What goes wrong:** Toggling water layer off after toggling it on doesn't restore the original terrain — depressions remain.

**Why it happens:** `applyWaterDepressions` mutated the store's `elevationData.elevations` array in-place.

**How to avoid:** `applyWaterDepressions` must return a **new** `ElevationData` with a new `Float32Array`, never mutating the input. The store holds the immutable original. `TerrainMesh.tsx` computes the effective elevation data locally in each render cycle.

**Warning signs:** After toggling water layer off and rebuilding terrain, depressions are still visible.

### Pitfall 4: Depression Z Computed from Smoothed Elevations but Applied to Raw Grid

**What goes wrong:** The terrain mesh uses two-pass Gaussian smoothing inside `buildTerrainGeometry()`. If the depression is applied to the raw elevation grid but the smoothing radius (6, then 2) blurs it away, the final mesh shows no visible depression.

**Why it happens:** Smoothing in `buildTerrainGeometry()` averages out sharp transitions — a 1-cell depression gets dissolved into neighboring cells.

**How to avoid:** Make the depression large enough that smoothing doesn't eliminate it. Two strategies:
  1. Apply depression to a region slightly **larger** than the water polygon footprint (e.g., expand by 2 cells) so the smoothed result still shows a visible depression.
  2. Apply a **deeper** depression (e.g., 3-5m instead of 1m) so even after smoothing the water area is visibly lower.
  The WATER_DEPRESSION_M constant should be empirically tuned during UAT.

**Warning signs:** Water areas are visually indistinguishable from terrain in the 3D preview after generation.

### Pitfall 5: Overpass Rate Limiting on Sequential Fetches

**What goes wrong:** Buildings → Roads → Water fetches all fire sequentially, causing HTTP 429 from Overpass if all three complete rapidly.

**Why it happens:** Phase 5 solved buildings→roads staggering via `.finally()`. Water must use the same pattern: `roadFetch.finally(() => startWaterFetch())`.

**How to avoid:** Chain water fetch after roads fetch via `.finally()`, not `.then()`. Water fetch failure must not block roads from displaying. Use same pattern as established in `RoadMesh.tsx`/`BuildingMesh.tsx`.

### Pitfall 6: WaterMesh Z-fighting with Terrain

**What goes wrong:** The WaterMesh overlay flickers or disappears where it overlaps with the terrain surface.

**Why it happens:** The WaterMesh is rendered at the exact depression Z — same Z as the terrain surface at that location.

**How to avoid:** Apply the same dual fix used for roads (Phase 5): `position={[0, 0, 0.1]}` world-space offset + `polygonOffset / polygonOffsetFactor / polygonOffsetUnits` on the material. Water is always flat so this is simpler than roads (no per-vertex offset needed).

### Pitfall 7: Coastal Areas — Overpass Returns No Useful Polygons

**What goes wrong:** For a coastal city, the ocean area shows no water depression.

**Why it happens:** OSM ocean is `natural=coastline` (linear, not closed). Overpass returns ~thousands of raw line segments that cannot be assembled into a polygon without planet-scale stitching. osmtogeojson cannot close them.

**How to avoid:** Scope coastline/ocean to v2 explicitly. Document in WaterSection.tsx with a brief note ("Ocean areas not yet supported"). For WATR-01, rivers and lakes are sufficient for the v1 success criteria.

## Code Examples

Verified patterns from official sources and project codebase:

### Overpass Query for Water Polygons

```typescript
// src/lib/water/overpass.ts
export async function fetchWaterData(bbox: BoundingBox): Promise<unknown> {
  const { sw, ne } = bbox;

  // Include relation members via '>;' so osmtogeojson can reconstruct multipolygon geometry.
  // Without '>;', large lakes mapped as relations return empty coordinates.
  const query = `[out:json][timeout:60][maxsize:33554432][bbox:${sw.lat},${sw.lon},${ne.lat},${ne.lon}];
(
  way["natural"="water"];
  relation["natural"="water"];
  way["waterway"="riverbank"];
);
out geom;
>;
out skel qt;`;

  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    throw new Error(`Overpass water fetch failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}
```

### Water Feature Type

```typescript
// src/lib/water/types.ts

/**
 * A parsed water feature — a closed polygon with optional holes (islands).
 * Coordinates are in [lon, lat] order (WGS84).
 */
export interface WaterFeature {
  /** Outer boundary coordinates as [lon, lat] pairs (closed — first === last) */
  outerRing: [number, number][];
  /** Hole rings for islands within the water body */
  holes: [number, number][][];
}
```

### Parse Water Features from osmtogeojson

```typescript
// src/lib/water/parse.ts
import osmtogeojson from 'osmtogeojson';
import type { WaterFeature } from './types';

export function parseWaterFeatures(osmJson: unknown): WaterFeature[] {
  const geoJSON = osmtogeojson(osmJson as Parameters<typeof osmtogeojson>[0]);
  const features: WaterFeature[] = [];

  for (const feature of geoJSON.features) {
    if (!feature.geometry || !feature.properties) continue;

    const geom = feature.geometry;

    if (geom.type === 'Polygon') {
      // coordinates[0] = outer ring, coordinates[1..n] = holes
      const coords = geom.coordinates as number[][][];
      if (coords.length === 0 || coords[0].length < 3) continue;
      features.push({
        outerRing: coords[0].map(p => [p[0], p[1]]) as [number, number][],
        holes: coords.slice(1).map(ring => ring.map(p => [p[0], p[1]]) as [number, number][]),
      });
    } else if (geom.type === 'MultiPolygon') {
      // Each polygon in the multi is a separate water body
      const polygons = geom.coordinates as number[][][][];
      for (const polygon of polygons) {
        if (polygon.length === 0 || polygon[0].length < 3) continue;
        features.push({
          outerRing: polygon[0].map(p => [p[0], p[1]]) as [number, number][],
          holes: polygon.slice(1).map(ring => ring.map(p => [p[0], p[1]]) as [number, number][]),
        });
      }
    }
    // Skip LineString — waterway=river centerlines (not areas)
  }

  return features;
}
```

### Depression Bake Algorithm

```typescript
// src/lib/water/depression.ts
import type { ElevationData } from '../../types/geo';
import type { BoundingBox } from '../../types/geo';
import type { WaterFeature } from './types';

const WATER_DEPRESSION_M = 3.0; // meters below shoreline; tuned empirically

/** Ray-cast point-in-ring test. */
function pointInRing(px: number, py: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (((yi > py) !== (yj > py)) &&
        (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Apply water body depressions to the elevation grid.
 *
 * Returns a NEW ElevationData — does NOT mutate the input.
 * Must be called BEFORE buildTerrainGeometry().
 */
export function applyWaterDepressions(
  elevData: ElevationData,
  features: WaterFeature[],
  bbox: BoundingBox
): ElevationData {
  const { elevations, gridSize, minElevation, maxElevation } = elevData;
  const modifiedElevations = new Float32Array(elevations); // copy — never mutate input

  const { sw, ne } = bbox;
  const lonRange = ne.lon - sw.lon;
  const latRange = ne.lat - sw.lat;

  for (const { outerRing, holes } of features) {
    // Compute polygon bbox in grid coordinates for early culling
    let minGX = gridSize, maxGX = 0, minGY = gridSize, maxGY = 0;
    for (const [lon, lat] of outerRing) {
      const gx = ((lon - sw.lon) / lonRange) * (gridSize - 1);
      const gy = (1 - (lat - sw.lat) / latRange) * (gridSize - 1); // row 0 = north
      if (gx < minGX) minGX = gx;
      if (gx > maxGX) maxGX = gx;
      if (gy < minGY) minGY = gy;
      if (gy > maxGY) maxGY = gy;
    }

    // Clamp to grid bounds
    const x0 = Math.max(0, Math.floor(minGX));
    const x1 = Math.min(gridSize - 1, Math.ceil(maxGX));
    const y0 = Math.max(0, Math.floor(minGY));
    const y1 = Math.min(gridSize - 1, Math.ceil(maxGY));

    // Compute depression elevation from shoreline minimum
    let shorelineMin = Infinity;
    for (const [lon, lat] of outerRing) {
      const gx = Math.round(((lon - sw.lon) / lonRange) * (gridSize - 1));
      const gy = Math.round((1 - (lat - sw.lat) / latRange) * (gridSize - 1));
      const idx = Math.max(0, Math.min(gridSize * gridSize - 1, gy * gridSize + gx));
      shorelineMin = Math.min(shorelineMin, elevations[idx]);
    }
    const depressionElev = shorelineMin - WATER_DEPRESSION_M;

    // Rasterize: test each cell center in bbox
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        // Cell center in WGS84
        const lon = sw.lon + (gx / (gridSize - 1)) * lonRange;
        const lat = ne.lat - (gy / (gridSize - 1)) * latRange; // gy=0 = north = ne.lat

        // Point-in-polygon with hole exclusion
        if (!pointInRing(lon, lat, outerRing)) continue;
        let inHole = false;
        for (const hole of holes) {
          if (pointInRing(lon, lat, hole)) { inHole = true; break; }
        }
        if (inHole) continue;

        modifiedElevations[gy * gridSize + gx] = depressionElev;
      }
    }
  }

  // Recompute min/max from modified grid
  let newMin = Infinity, newMax = -Infinity;
  for (let i = 0; i < modifiedElevations.length; i++) {
    if (modifiedElevations[i] < newMin) newMin = modifiedElevations[i];
    if (modifiedElevations[i] > newMax) newMax = modifiedElevations[i];
  }

  return {
    elevations: modifiedElevations,
    gridSize,
    minElevation: newMin,
    maxElevation: newMax,
  };
}
```

### Store Extension (Water Fields)

```typescript
// Additions to mapStore.ts — parallel to roadFeatures/roadGenerationStatus

// State:
waterFeatures: WaterFeature[] | null;
waterGenerationStatus: 'idle' | 'fetching' | 'ready' | 'error';
waterGenerationStep: string;

// Actions:
setWaterFeatures: (features: WaterFeature[] | null) => void;
setWaterGenerationStatus: (status: ..., step?: string) => void;
```

### ExportPanel Extension

```typescript
// In handleExport(), before buildTerrainGeometry():
const effectiveElevData = (waterFeatures && waterFeatures.length > 0 && waterVisible)
  ? applyWaterDepressions(elevationData, waterFeatures, bbox)
  : elevationData;

// Pass effectiveElevData to buildTerrainGeometry() instead of elevationData
const terrainGeom = buildTerrainGeometry(effectiveElevData, { ... });
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `waterway=riverbank` for river areas | `natural=water` + `water=river` | 2019-2022 OSM modernization | `waterway=riverbank` down from 300k to ~1,400 uses; query both for backward compat |
| Coastline as closed polygon | `natural=coastline` raw open ways requiring planet-scale stitching | Fundamental OSM design | Ocean cannot be naively queried — must scope to v2 or use pre-processed dataset |

**Deprecated/outdated:**
- `waterway=riverbank`: Deprecated; replaced by `natural=water` + `water=river`. ~1,400 remaining uses globally (down from 300k+). Still worth querying via union for backward compatibility.

## Open Questions

1. **Coastal/Ocean Handling**
   - What we know: `natural=coastline` from Overpass yields raw, unclosed ways — not polygon-ready. osmdata.openstreetmap.de water polygons cover only ocean/coastline, are static bulk downloads (no bbox REST API), and not inland water. No clean bbox-queryable API exists for ocean polygons.
   - What's unclear: Whether v1 should silently omit ocean (simplest), show a note in the UI, or use an elevation-zero heuristic (cells at or below sea level = ocean, depress them by default).
   - Recommendation: Scope ocean/coastline to v2. Add a UI note in WaterSection.tsx: "Ocean areas require additional data sources and are not yet supported." Document in phase plan. This resolves the STATE.md blocker.

2. **WATER_DEPRESSION_M Depth Value**
   - What we know: Needs to survive Gaussian smoothing (radius 6 + radius 2 passes in `buildTerrainGeometry`). A 2m depression in a single-cell-wide river may be almost entirely smoothed away.
   - What's unclear: The correct empirical value. Different scales (city vs. mountain range) need different depths.
   - Recommendation: Start at 3-5m, make it a constant in `depression.ts`, and tune during UAT. Consider expanding the depression mask by 1-2 grid cells beyond the polygon boundary to make smoothing less destructive.

3. **Overpass `out geom` vs `out body` + `>;`**
   - What we know: For ways, `out geom` includes node coordinates inline. For relations, `out geom` returns member metadata but may not include member geometry. Adding `>;` + `out skel qt` recursively fetches members.
   - What's unclear: Whether Overpass's `out geom` already handles relation member geometry for typical lake relations, or if the `>;` recursion is always needed.
   - Recommendation: Always include both `out geom;` and `>;` + `out skel qt;` to be safe. The osmtogeojson library handles the merged output correctly. Test with a known multipolygon lake (e.g., a lake with an island) in Overpass Turbo before finalizing.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest ^3.0.0 |
| Config file | none — uses vite.config.ts |
| Quick run command | `npx vitest run src/lib/water/` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WATR-01 | `parseWaterFeatures` produces WaterFeature array from Polygon OSM data | unit | `npx vitest run src/lib/water/__tests__/parse.test.ts` | Wave 0 |
| WATR-01 | `parseWaterFeatures` produces holes array for multipolygon (island) | unit | `npx vitest run src/lib/water/__tests__/parse.test.ts` | Wave 0 |
| WATR-01 | `applyWaterDepressions` lowers elevation at water polygon cells | unit | `npx vitest run src/lib/water/__tests__/depression.test.ts` | Wave 0 |
| WATR-01 | `applyWaterDepressions` does NOT lower elevation inside hole (island) | unit | `npx vitest run src/lib/water/__tests__/depression.test.ts` | Wave 0 |
| WATR-01 | `applyWaterDepressions` returns new ElevationData (does not mutate input) | unit | `npx vitest run src/lib/water/__tests__/depression.test.ts` | Wave 0 |
| WATR-01 | Terrain mesh Z is lower at water area than adjacent terrain | integration (visual) | manual browser UAT | N/A |
| WATR-01 | Exported STL shows physical depression at water location | integration (STL) | manual UAT | N/A |
| WATR-01 | Island in lake: island cells NOT depressed, surrounding cells depressed | unit | `npx vitest run src/lib/water/__tests__/depression.test.ts` | Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run src/lib/water/`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/lib/water/__tests__/parse.test.ts` — covers WATR-01 parse behaviors
- [ ] `src/lib/water/__tests__/depression.test.ts` — covers WATR-01 grid mutation + island exclusion
- [ ] `src/lib/water/types.ts` — WaterFeature interface (needed by all water lib files)
- [ ] `src/lib/water/overpass.ts` — fetchWaterData (no tests needed — network, same pattern as roads)
- [ ] `src/lib/water/parse.ts` — parseWaterFeatures (tested by parse.test.ts)
- [ ] `src/lib/water/depression.ts` — applyWaterDepressions (tested by depression.test.ts)

## Sources

### Primary (HIGH confidence)

- OSM Wiki: Tag:natural=water — confirmed polygon/multipolygon geometry types, inland water scope
- OSM Wiki: Tag:waterway=riverbank — confirmed deprecated status, ~1,400 remaining uses, recommend `natural=water + water=river`
- OSM Wiki: Coastline — confirmed why Overpass is unsuitable for ocean; osmdata.openstreetmap.de is static download only
- Project codebase: `src/lib/roads/overpass.ts`, `src/lib/roads/parse.ts` — confirmed Overpass query pattern and osmtogeojson usage
- Project codebase: `src/lib/buildings/merge.ts` — confirmed elevation grid zScale formula and immutable ElevationData pattern
- Project codebase: `src/lib/mesh/terrain.ts` — confirmed two-pass Gaussian smoothing which requires deeper/wider depressions
- Project codebase: `src/store/mapStore.ts` — confirmed store pattern for water/vegetation fields already typed in LayerToggles
- Project STATE.md (Phase 6 decision) — confirms: water applied to elevation grid BEFORE buildTerrainGeometry(), WaterMesh is visual only
- Project STATE.md (Phase 5 decision) — confirms: vertex displacement / grid modification for water (NOT CSG)

### Secondary (MEDIUM confidence)

- osmtogeojson GitHub README — confirmed multipolygon relation support, outer/inner ring handling in GeoJSON output
- OSM Wiki: Overpass API Language Guide — confirmed `out geom` and recursion `>;` behavior for relation members

### Tertiary (LOW confidence)

- WebSearch for osmdata.openstreetmap.de REST API — confirmed no bbox-queryable REST endpoint exists for water polygons; bulk download only. (Needs validation against current osmdata.openstreetmap.de site.)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages needed; all relevant libraries already in project
- Architecture: HIGH — depression-bake-before-terrain-mesh approach is locked in STATE.md; implementation follows documented patterns
- Pitfalls: HIGH — most pitfalls identified from direct codebase analysis (smoothing pass, mutation, coastline); Overpass relation pitfall verified against osmtogeojson docs

**Research date:** 2026-02-25
**Valid until:** 2026-03-25 (OSM tagging conventions stable; libraries stable)
