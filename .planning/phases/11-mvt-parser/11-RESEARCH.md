# Phase 11: MVT Parser - Research

**Researched:** 2026-02-28
**Domain:** Mapbox Vector Tile (MVT) decoding, Overture Maps property schema, BuildingFeature adaptation
**Confidence:** HIGH — all critical claims verified empirically against the live Overture endpoint

## Summary

Phase 11 decodes the raw `ArrayBuffer` tiles produced by Phase 10 into `BuildingFeature[]` objects
that the existing buildings pipeline (merge.ts / buildAllBuildings) already understands. The entire
decode pipeline uses libraries **already installed** in the project: `@mapbox/vector-tile@2.0.4`
(bundled transitively by maplibre-gl) and `pbf@4.0.1` (bundled transitively by maplibre-gl). No
new npm dependencies are required.

The `VectorTile` constructor accepts a `Pbf` instance wrapping the raw `ArrayBuffer`. The layer
named `"building"` (singular, confirmed in Phase 10) contains all building features as type-3
(Polygon) features. `VectorTileFeature.toGeoJSON(x, y, z)` converts tile-space coordinates to
WGS84 lon/lat. The resulting GeoJSON geometry is either `Polygon` or (rarely) `MultiPolygon`; the
parser must flatten `MultiPolygon` into individual entries, matching the OSM parser's behavior.

Two critical winding/area findings confirmed empirically against live tile data (NYC at z=14):

1. **Winding (PARSE-03):** `toGeoJSON()` consistently produces **clockwise** outer rings in lon/lat
   (negative signed area using the same shoelace formula as walls.ts `computeSignedArea`). OSM's
   `parseBuildingFeatures()` produces CCW outer rings. If CW rings reach earcut unchanged, floor and
   roof cap triangles have inverted face normals, producing black/inside-out geometry in the
   preview. **Fix:** compute signed area on the outer ring; if negative (CW), reverse it before
   returning `BuildingFeature`. The hole rings from `toGeoJSON` are already CCW and need no change.

2. **Area/filtering (PARSE-04):** In ML-heavy regions (Lagos, Nigeria at z=14), 16.5% of features
   have footprints below 15 m² (confirmed empirically). These are ML artifacts: kiosks, sheds,
   solar panel outlines. The area must be computed in m² using UTM projection (same
   `computeFootprintAreaM2` used in merge.ts), not a lon/lat approximation, because the threshold
   is tight (15 m²) and areas near the poles or equator differ materially.

**Primary recommendation:** Create `src/lib/overture/parse.ts` that iterates the
`Map<string, ArrayBuffer>` tiles, decodes each with `VectorTile` + `Pbf`, calls `toGeoJSON` per
feature, normalizes CW outer rings to CCW, maps Overture properties to OSM-style keys, filters
below-15m² artifacts, and returns a flat `BuildingFeature[]`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PARSE-01 | Overture building footprints decoded from MVT and converted to BuildingFeature format | `VectorTile` + `Pbf` decode → `toGeoJSON(x,y,z)` → map Overture properties to OSM-style keys → `BuildingFeature[]` |
| PARSE-02 | MultiPolygon Overture buildings render correctly as individual buildings | `toGeoJSON` returns `MultiPolygon`; parser loops over `coordinates` array, creates one `BuildingFeature` per polygon — matches OSM parser's MultiPolygon handling |
| PARSE-03 | Overture building geometry has correct face normals (ring winding order normalized to match OSM pipeline) | Empirically confirmed: `toGeoJSON` produces CW outer rings; fix is `if signedArea(outer) < 0: outer.reverse()` before building `BuildingFeature` |
| PARSE-04 | Small ML artifacts (< 15m²) filtered out from Overture results | Confirmed 16.5% of ML-heavy tile features below 15m²; filter using `computeFootprintAreaM2` (UTM projection) before creating `BuildingFeature` |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@mapbox/vector-tile` | 2.0.4 | MVT tile decode: `VectorTile` parses protobuf binary into layers + features | Already installed (maplibre-gl dep); provides `toGeoJSON()` for coordinate projection to lon/lat |
| `pbf` | 4.0.1 | Protobuf binary decoder underlying `@mapbox/vector-tile` | Already installed (maplibre-gl dep); `new Pbf(arrayBuffer)` wraps raw tile bytes |

### Supporting

No additional libraries needed. All supporting utilities are project-internal:

| Utility | Source | Purpose | Why Reuse |
|---------|--------|---------|-----------|
| `computeSignedArea` | `src/lib/buildings/walls.ts` | Detect CW outer ring | Same formula used by buildWalls — consistency guaranteed |
| `computeFootprintAreaM2` | `src/lib/buildings/merge.ts` | Area filter in m² | Exact UTM-projected area — required for accurate 15m² threshold |
| `OVERTURE_BUILDING_LAYER` | `src/lib/overture/constants.ts` | Layer name `"building"` | Defined in Phase 10; single source of truth |
| `BuildingFeature` | `src/lib/buildings/types.ts` | Target format | Existing pipeline contract; no changes needed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@mapbox/vector-tile` toGeoJSON | Custom protobuf decode | @mapbox/vector-tile is already installed and battle-tested; custom decode needs 400+ lines of protobuf handling |
| `computeFootprintAreaM2` (UTM) | Spherical haversine approximation | UTM is exact for small polygons; haversine area approximation accumulates error for non-convex polygons at any lat |
| Normalizing winding in parser | Letting buildWalls handle CW walls | buildWalls reverses CW walls, but earcut in triangulateFootprint does NOT — floor/roof caps have inverted normals without parser-side normalization |

**Installation:**

```bash
# No new packages needed — @mapbox/vector-tile and pbf are already installed
npm list @mapbox/vector-tile pbf  # confirms 2.0.4 and 4.0.1
```

## Architecture Patterns

### Recommended Project Structure

```
src/
├── lib/
│   └── overture/
│       ├── constants.ts       # Phase 10 — OVERTURE_BUILDING_LAYER = 'building'
│       ├── tiles.ts           # Phase 10 — fetchTilesFromArchive
│       ├── index.ts           # Phase 10 — fetchOvertureTiles public API
│       ├── parse.ts           # NEW Phase 11 — parseOvertureTiles(tiles) → BuildingFeature[]
│       └── __tests__/
│           ├── tiles.test.ts  # Phase 10 tests
│           └── parse.test.ts  # NEW Phase 11 tests
```

### Pattern 1: MVT Tile Decode

**What:** Wrap each `ArrayBuffer` in a `Pbf` instance, pass to `VectorTile` constructor, extract
the `"building"` layer, iterate features.

**When to use:** Core of `parseOvertureTiles()`.

```typescript
// Source: @mapbox/vector-tile node_modules/.../@mapbox/vector-tile/index.d.ts
//         pbf node_modules/pbf/index.d.ts
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
import { OVERTURE_BUILDING_LAYER } from './constants';

function decodeTile(tileKey: string, buffer: ArrayBuffer): BuildingFeature[] {
  const [zStr, xStr, yStr] = tileKey.split('/');
  const z = parseInt(zStr, 10);
  const x = parseInt(xStr, 10);
  const y = parseInt(yStr, 10);

  const pbf = new Pbf(buffer);
  const tile = new VectorTile(pbf);
  const layer = tile.layers[OVERTURE_BUILDING_LAYER];
  if (!layer) return [];

  const features: BuildingFeature[] = [];
  for (let i = 0; i < layer.length; i++) {
    const vtFeature = layer.feature(i);
    const geoJSON = vtFeature.toGeoJSON(x, y, z);
    // ... process geoJSON (see patterns below)
  }
  return features;
}
```

**Key detail:** The tile key from Phase 10 is stored as `"${z}/${x}/${y}"`. Parsing uses
`split('/')` to recover `z`, `x`, `y` for `toGeoJSON(x, y, z)` — note argument order: x first,
z last.

### Pattern 2: GeoJSON Polygon / MultiPolygon Flattening

**What:** `toGeoJSON()` returns `type: "Polygon"` (single ring set) or `type: "MultiPolygon"` (multiple ring sets). Each must produce a separate `BuildingFeature`.

**When to use:** Handling every feature from the decoded layer.

```typescript
// Source: empirical test against live tile, 2026-02-28
// @mapbox/vector-tile/index.d.ts — toGeoJSON return type is GeoJSON.Feature
import type { Feature, Polygon, MultiPolygon } from 'geojson';

function extractPolygons(
  geoJSON: Feature,
  props: Record<string, string | undefined>
): BuildingFeature[] {
  const geometry = geoJSON.geometry;
  const results: BuildingFeature[] = [];

  if (geometry.type === 'Polygon') {
    const feature = polygonToBuilding(geometry.coordinates, props);
    if (feature) results.push(feature);
  } else if (geometry.type === 'MultiPolygon') {
    for (const polygonCoords of geometry.coordinates) {
      const feature = polygonToBuilding(polygonCoords, props);
      if (feature) results.push(feature);
    }
  }
  // Other geometry types (Point, LineString) are skipped — buildings are always polygons

  return results;
}
```

### Pattern 3: Winding Normalization (PARSE-03)

**What:** `toGeoJSON()` outer rings are **always clockwise** in lon/lat (negative shoelace area).
OSM outer rings are CCW (positive area). Normalize to CCW before creating `BuildingFeature`.

**Why:** `earcut` in `triangulateFootprint` produces face normals based on input winding. CW outer
ring → floor and roof cap triangles face inward → black geometry in Three.js preview, malformed
watertight geometry in STL export.

**When to use:** Every outer ring extracted from `toGeoJSON()` output.

```typescript
// Source: empirical test of 400 features across NYC + Lagos tiles, 2026-02-28
// Consistent result: 100% of outer rings are CW (negative area), 100% of holes are CCW (positive)
import { computeSignedArea } from '../buildings/walls';

function normalizeOuterRing(ring: [number, number][]): [number, number][] {
  // computeSignedArea: positive = CCW, negative = CW (same convention as walls.ts)
  const area = computeSignedArea(ring);
  if (area < 0) {
    return [...ring].reverse(); // CW → CCW
  }
  return ring; // already CCW (defensive — not observed in practice, but safe)
}

// Holes from toGeoJSON are already CCW (positive area) — no normalization needed.
// Verified: all 10 hole rings in NYC tile had positive area.
```

### Pattern 4: Overture → OSM Property Mapping (PARSE-01)

**What:** Map Overture MVT property names to the OSM-style keys that `resolveHeight()` and
`resolveRoofHeight()` consume.

**When to use:** Building every `BuildingFeature.properties` from Overture feature data.

```typescript
// Source: live tile inspection — properties seen in NYC tile, 2026-02-28
// Source: Overture schema https://docs.overturemaps.org/schema/reference/buildings/building/
//         columns: height (float64), num_floors (int32), roof_shape (string), roof_height (float64)

type OvertureProps = Record<string, number | string | boolean>;

function mapOvertureProperties(
  vtProps: OvertureProps,
): Record<string, string | undefined> {
  const mapped: Record<string, string | undefined> = {};

  // height (float64, meters) → 'height'
  // parseHeightString in height.ts handles plain float strings (e.g. "60", "7.4")
  if (typeof vtProps.height === 'number') {
    mapped['height'] = String(vtProps.height);
  }

  // num_floors (int32) → 'building:levels'
  if (typeof vtProps.num_floors === 'number') {
    mapped['building:levels'] = String(vtProps.num_floors);
  }

  // roof_shape (string) → 'roof:shape'
  // Overture values match OSM: flat, gabled, hipped, pyramidal, etc.
  if (typeof vtProps.roof_shape === 'string') {
    mapped['roof:shape'] = vtProps.roof_shape;
  }

  // roof_height (float64, meters) → 'roof:height'
  if (typeof vtProps.roof_height === 'number') {
    mapped['roof:height'] = String(vtProps.roof_height);
  }

  // Always set building=yes so resolveHeight fallback cascade works
  // (Overture has no building tag; height.ts uses it for type defaults and ultimate fallback)
  mapped['building'] = 'yes';

  return mapped;
}
```

**Property coverage in live data (NYC tile, 749 features):**
- `height` present: 90% of features — covers most urban buildings
- `num_floors` present: 43% of features — supplementary fallback
- Neither present: 8% — these get area-heuristic height (PARSE-04 / resolveHeight tier 3)
- `roof_shape` present: varies — only when OSM source had it

**Roof shape values in Overture:** dome, flat, gabled, gambrel, half_hipped, hipped, mansard,
onion, pyramidal, round, saltbox, sawtooth, skillion, spherical. All match OSM `roof:shape`
vocabulary; `resolveRoofHeight` already handles flat/gabled/hipped/pyramidal.

### Pattern 5: Area Filter (PARSE-04)

**What:** Discard features with footprint area < 15 m² (ML artifacts: kiosks, sheds, rooftop
equipment).

**When to use:** After ring extraction, before creating `BuildingFeature`.

```typescript
// Source: empirical Lagos tile inspection — 16.5% of features below 15m², min 3.5m²
// Source: computeFootprintAreaM2 from src/lib/buildings/merge.ts (UTM projection, exact)
import { computeFootprintAreaM2 } from '../buildings/merge';

// Note: computeFootprintAreaM2 is currently not exported from merge.ts.
// It must be extracted to a shared location or the export added.
// Options:
// 1. Export computeFootprintAreaM2 from merge.ts
// 2. Inline a copy in parse.ts using wgs84ToUTM + computeSignedArea (same algorithm)
// Recommendation: export from merge.ts — DRY, no duplication.

const OVERTURE_MIN_AREA_M2 = 15;

function meetsAreaThreshold(outerRing: [number, number][]): boolean {
  const areaM2 = computeFootprintAreaM2(outerRing);
  return areaM2 >= OVERTURE_MIN_AREA_M2;
}
```

### Pattern 6: Full Parser Pipeline

**What:** Combining all patterns into the public `parseOvertureTiles()` function.

```typescript
// src/lib/overture/parse.ts
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
import type { BuildingFeature } from '../buildings/types';
import { computeSignedArea } from '../buildings/walls';
import { computeFootprintAreaM2 } from '../buildings/merge'; // export needed
import { OVERTURE_BUILDING_LAYER } from './constants';

const OVERTURE_MIN_AREA_M2 = 15;

type GeoJSONPosition = [number, number];
type GeoJSONRing = GeoJSONPosition[];

function normalizeOuterRing(ring: GeoJSONRing): GeoJSONRing {
  return computeSignedArea(ring) < 0 ? [...ring].reverse() : ring;
}

function polygonToBuilding(
  coords: GeoJSONRing[],
  properties: Record<string, string | undefined>
): BuildingFeature | null {
  const [rawOuter, ...rawHoles] = coords;

  // toGeoJSON returns closed rings [A,B,C,D,A]; merge.ts handles this via stripClosingVertex
  const outer = normalizeOuterRing(rawOuter.map(pos => [pos[0], pos[1]] as [number, number]));

  if (outer.length < 4) return null; // Need at least 3 unique vertices + closing vertex

  // Area filter: discard ML artifacts < 15m²
  if (!meetsAreaThreshold(outer)) return null;

  const holes: [number, number][][] = rawHoles
    .filter(ring => ring.length >= 4)
    .map(ring => ring.map(pos => [pos[0], pos[1]] as [number, number]));

  return { properties, outerRing: outer, holes };
}

/**
 * Parse Overture MVT tiles into BuildingFeature format.
 *
 * @param tiles - Map<"z/x/y", ArrayBuffer> from fetchOvertureTiles()
 * @returns Flat array of BuildingFeature in the same format as parseBuildingFeatures()
 */
export function parseOvertureTiles(tiles: Map<string, ArrayBuffer>): BuildingFeature[] {
  const features: BuildingFeature[] = [];

  for (const [tileKey, buffer] of tiles) {
    const [zStr, xStr, yStr] = tileKey.split('/');
    const z = parseInt(zStr, 10);
    const x = parseInt(xStr, 10);
    const y = parseInt(yStr, 10);

    const pbf = new Pbf(buffer);
    const tile = new VectorTile(pbf);
    const layer = tile.layers[OVERTURE_BUILDING_LAYER];
    if (!layer) continue;

    for (let i = 0; i < layer.length; i++) {
      const vtFeature = layer.feature(i);
      const geoJSON = vtFeature.toGeoJSON(x, y, z);
      const properties = mapOvertureProperties(vtFeature.properties);
      const geometry = geoJSON.geometry;

      if (geometry.type === 'Polygon') {
        const building = polygonToBuilding(geometry.coordinates as GeoJSONRing[], properties);
        if (building) features.push(building);
      } else if (geometry.type === 'MultiPolygon') {
        for (const polygonCoords of geometry.coordinates) {
          const building = polygonToBuilding(polygonCoords as GeoJSONRing[], properties);
          if (building) features.push(building);
        }
      }
    }
  }

  return features;
}
```

### Anti-Patterns to Avoid

- **Not reversing CW outer rings before earcut:** `buildWalls()` reverses CW rings for wall geometry, but `triangulateFootprint()` passes rings to earcut unchanged. If CW rings reach earcut, floor and roof caps have inverted face normals. The fix must be in the parser, not in buildWalls.

- **Using approximate area (lon/lat²) for filtering:** The 15 m² threshold is too tight for degree-based approximation at high latitudes or equatorial regions to be accurate. Always use UTM-projected area via `computeFootprintAreaM2`.

- **Silently dropping MultiPolygon:** A feature with `type: "MultiPolygon"` has multiple sub-polygons. Treating it as a Polygon (only taking `coordinates[0]`) silently drops all but the first part. Campus clusters and underground transit stations commonly use MultiPolygon in Overture.

- **Not handling missing `toGeoJSON` geometry types gracefully:** Very rarely, features may have type 1 (Point) or type 2 (LineString) in the building layer due to data quality issues. Skip these silently — do not throw.

- **Treating `Pbf` as a one-shot stream:** A `Pbf` instance is stateful (cursor position). Always create a fresh `new Pbf(buffer)` for each tile; never reuse the same `Pbf` for multiple `VectorTile` decoders.

- **Using `@types/mapbox__vector-tile`:** No separate types package exists for `@mapbox/vector-tile` v2.x — it ships its own `index.d.ts`. Adding a non-existent `@types` package will install nothing and may cause confusion.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MVT protobuf decode | Custom protobuf parser | `@mapbox/vector-tile` + `pbf` (already installed) | MVT protobuf involves 2-level field parsing, zigzag encoding, geometry command decoding — ~500 lines minimum |
| Tile coord → lon/lat | Custom Mercator projection | `VectorTileFeature.toGeoJSON(x, y, z)` | One method call, already tested by maplibre-gl in production |
| Polygon area in m² | Spherical haversine approximation | `computeFootprintAreaM2` from merge.ts | UTM projection is exact for small polygons; haversine is approximate and inconsistent with the project's area calculations |
| Ring classification (exterior vs holes) | Custom signed area test on all rings | `classifyRings` (bundled in @mapbox/vector-tile) — used internally by `toGeoJSON` | `toGeoJSON` already classifies rings and returns them correctly ordered (outer first, holes after) |

**Key insight:** `@mapbox/vector-tile` + `pbf` are already in `node_modules` as transitive dependencies
of `maplibre-gl`. There is no install cost and no tree-shaking penalty — maplibre already bundles
them. The parser is pure glue code.

## Common Pitfalls

### Pitfall 1: Inverting All Buildings (Wrong Normals)

**What goes wrong:** All Overture buildings appear black or have no visible faces in the Three.js preview. STL export produces non-manifold geometry.

**Why it happens:** `toGeoJSON()` outer rings are clockwise (negative shoelace area). `earcut` in `triangulateFootprint()` produces triangles whose normals point INTO the building (floor cap faces up toward building interior, roof cap faces down). Three.js's default front-face culling hides these inverted faces.

**How to avoid:** In the parser, after extracting each outer ring, compute `computeSignedArea(outer)`. If negative, reverse the ring. Holes need no reversal — they are already CCW.

**Warning signs:** ALL Overture buildings are invisible in the 3D preview (not just some). OSM buildings still render correctly in the same scene.

### Pitfall 2: MultiPolygon Features Partially Missing

**What goes wrong:** Some campus complexes or underground stations appear as a single footprint when they should render as 2–3 separate buildings.

**Why it happens:** If the parser only handles `Polygon` and silently skips `MultiPolygon`, one part renders (the Polygon fallback sometimes takes just the first ring) or the whole feature is dropped.

**How to avoid:** Explicitly handle `geometry.type === 'MultiPolygon'` — loop over `geometry.coordinates` (an array of polygon coordinate arrays), creating one `BuildingFeature` per polygon.

**Warning signs:** Area comparison of Overture buildings in the preview shows known campus clusters with only one building rendered.

### Pitfall 3: Wrong toGeoJSON Argument Order

**What goes wrong:** Buildings appear in completely wrong locations (off-coast, wrong country), with no error thrown.

**Why it happens:** `VectorTileFeature.toGeoJSON(x, y, z)` takes `x` first, `y` second, `z` third. The tile key is stored as `"${z}/${x}/${y}"` (z first). Parsing the key and accidentally passing `(z, x, y)` to `toGeoJSON` silently produces garbage coordinates.

**How to avoid:** Always destructure the tile key as:
```typescript
const [zStr, xStr, yStr] = tileKey.split('/');
const z = parseInt(zStr, 10), x = parseInt(xStr, 10), y = parseInt(yStr, 10);
vtFeature.toGeoJSON(x, y, z); // x first, z last
```

**Warning signs:** Buildings render in the ocean or at (0°,0°). Preview shows no geometry at the user's selected location despite console showing features found.

### Pitfall 4: computeFootprintAreaM2 Not Exported

**What goes wrong:** TypeScript compile error: `computeFootprintAreaM2` is not exported from `merge.ts`.

**Why it happens:** `computeFootprintAreaM2` is currently a module-private function in `merge.ts`. The parser needs it for PARSE-04 area filtering.

**How to avoid:** Add `export` to `computeFootprintAreaM2` in `merge.ts` before writing the parser, and add an import in `parse.ts`. Alternatively, inline a copy using `wgs84ToUTM` + `computeSignedArea` (same math). The export approach is preferred for DRY.

**Warning signs:** `npx tsc --noEmit` fails with "not exported" error on the import line.

### Pitfall 5: Area Calculated on CW Ring (Pre-Normalization)

**What goes wrong:** Area filter rejects buildings that should pass (area comes back negative for CW rings using signed area; `< 15` comparison passes when area is `-50`).

**Why it happens:** `computeSignedArea` returns a negative value for CW rings. `Math.abs()` is required to get the magnitude, or area must be computed after normalizing the ring to CCW.

**How to avoid:** In `computeFootprintAreaM2`, the function already uses `Math.abs(computeSignedArea(...))` — but it receives the ring BEFORE winding normalization in the proposed pipeline. The safest order: **normalize winding first, then compute area** (area will be positive for CCW, no `abs()` needed but it's still safe since `computeFootprintAreaM2` already uses `Math.abs`).

**Warning signs:** Area filter is too aggressive (valid buildings filtered out) or does nothing.

### Pitfall 6: Large Tile at Zoom 14 — Memory

**What goes wrong:** A large bounding box generates many tiles, each with hundreds of features. Accumulating all raw `Pbf` objects in memory simultaneously causes OOM in the browser.

**Why it doesn't happen in typical use:** The parser processes tiles one-at-a-time (synchronous loop over `Map` entries). `Pbf` instances are created and discarded per tile. JavaScript GC handles cleanup between tiles.

**How to avoid:** Never cache `VectorTile` or `Pbf` instances across tiles. Return a flat `BuildingFeature[]` that only holds lightweight data (rings + property strings).

## Code Examples

Verified patterns from live tile data and library inspection:

### Complete Decode: One Tile → BuildingFeature[]

```typescript
// Source: empirical test against live NYC + Lagos tiles, 2026-02-28
// Source: @mapbox/vector-tile/index.d.ts — VectorTile, VectorTileFeature, VectorTileLayer types
// Source: pbf/index.d.ts — Pbf constructor accepts ArrayBuffer

import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';

const tileKey = '14/4823/6160'; // z=14, x=4823, y=6160 (NYC)
const [zStr, xStr, yStr] = tileKey.split('/');
const z = parseInt(zStr, 10), x = parseInt(xStr, 10), y = parseInt(yStr, 10);

const buffer: ArrayBuffer = /* from fetchOvertureTiles() */;
const tile = new VectorTile(new Pbf(buffer));
const layer = tile.layers['building']; // OVERTURE_BUILDING_LAYER constant

// layer.length = 749 (NYC tile)
// layer.feature(i) → VectorTileFeature
// vtFeature.properties → Record<string, number|string|boolean>
// vtFeature.toGeoJSON(x, y, z) → GeoJSON.Feature with geometry in lon/lat
```

### Live Data Property Examples

```typescript
// Feature 1 (NYC, with all fields):
{ is_underground: false, height: 7.4, num_floors: 2, roof_shape: 'flat',
  roof_material: 'concrete', facade_color: '#F2F3EB', has_parts: false,
  id: '0787776e-...', version: 1 }
// → properties['height'] = '7.4', properties['building:levels'] = '2', properties['roof:shape'] = 'flat'

// Feature 30 (NYC, no height data — gap-fill case):
{ is_underground: false, has_parts: false, id: '374ba96d-...', version: 1 }
// → properties['building'] = 'yes' → resolveHeight uses area-heuristic fallback

// Feature 1 (Lagos, Microsoft ML Buildings, no height data):
{ is_underground: false, has_parts: false, id: '025b832b-...',
  '@geometry_source': 'Microsoft ML Buildings',
  sources: '[{"dataset":"Microsoft ML Buildings",...}]', version: 3 }
// → properties['building'] = 'yes' → resolveHeight uses area-heuristic fallback
```

### Winding Normalization

```typescript
// Source: empirical test — 100% of outer rings from toGeoJSON are CW (negative area)
import { computeSignedArea } from '../buildings/walls';

function normalizeOuterRing(ring: [number, number][]): [number, number][] {
  // computeSignedArea: positive = CCW (correct GeoJSON), negative = CW (Overture toGeoJSON output)
  return computeSignedArea(ring) < 0 ? [...ring].reverse() : ring;
}
```

### Property Mapping — Complete

```typescript
import type { VectorTileFeature } from '@mapbox/vector-tile';

function mapOvertureProperties(
  vtProps: Record<string, number | string | boolean>
): Record<string, string | undefined> {
  const props: Record<string, string | undefined> = {};

  if (typeof vtProps.height === 'number') props['height'] = String(vtProps.height);
  if (typeof vtProps.num_floors === 'number') props['building:levels'] = String(vtProps.num_floors);
  if (typeof vtProps.roof_shape === 'string') props['roof:shape'] = vtProps.roof_shape;
  if (typeof vtProps.roof_height === 'number') props['roof:height'] = String(vtProps.roof_height);
  props['building'] = 'yes'; // ensures resolveHeight fallback cascade runs

  return props;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual protobuf parsing for MVT | `@mapbox/vector-tile` + `pbf` | 2016 (Mapbox OSS) | Stable, zero-dep decode; `toGeoJSON` handles all projection math |
| GeoParquet for Overture access | MVT via PMTiles | 2024–2025 (Overture v2 tilesets) | Browser-native access without DuckDB/server; same MVT format as MapLibre |
| Building footprints: OSM only | OSM + Overture gap-fill | v1.1 (current milestone) | Global coverage, especially ML-dense developing regions |

**Deprecated/outdated:**
- DuckDB WASM for Overture: no HTTPFS browser support, cannot access PMTiles directly from browser (confirmed in Phase 10).
- Fetching Overture GeoParquet directly: requires server-side processing or WASM DuckDB (not viable).

## Open Questions

1. **`computeFootprintAreaM2` export from merge.ts**
   - What we know: function exists in merge.ts, currently unexported
   - What's unclear: whether the plan should modify merge.ts or inline the area calculation in parse.ts
   - Recommendation: export from merge.ts — single source of truth. The modification is trivial (add `export` keyword). Alternative: inline `wgs84ToUTM + computeSignedArea` in parse.ts to avoid any merge.ts change, keeping Phase 11 self-contained.

2. **Winding normalization placement**
   - What we know: outer rings must be CCW before reaching earcut; buildWalls also reverses CW rings (but it's for wall geometry, not floor/roof caps)
   - What's unclear: whether normalizing in the parser or in merge.ts is cleaner
   - Recommendation: normalize in the parser (parse.ts). The parser is the boundary where Overture data becomes `BuildingFeature`; winding is a property of the data, not the renderer. This keeps merge.ts unchanged.

3. **Memory footprint for large bboxes**
   - What we know: Lagos tile is 4MB and has 18,278 features. A large city bbox at zoom 14 could generate 50–100 tiles.
   - What's unclear: whether accumulating all `BuildingFeature[]` in memory before passing to `buildAllBuildings` causes OOM
   - Recommendation: not a Phase 11 concern. Phase 11 returns a flat array; streaming to `buildAllBuildings` is a Phase 13 concern. The 5-second Phase 10 timeout limits tile count in practice.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.0.0 |
| Config file | `vitest.config.ts` — `environment: 'jsdom'`, `globals: true` |
| Quick run command | `npx vitest run src/lib/overture/__tests__/parse.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PARSE-01 | Overture MVT tiles decoded → BuildingFeature[] with correct `height`, `building:levels`, `roof:shape` properties | unit | `npx vitest run src/lib/overture/__tests__/parse.test.ts` | ❌ Wave 0 |
| PARSE-02 | MultiPolygon feature → 2 separate BuildingFeature entries, no parts missing | unit | `npx vitest run src/lib/overture/__tests__/parse.test.ts` | ❌ Wave 0 |
| PARSE-03 | CW outer ring → reversed to CCW in output; CCW ring → unchanged; hole rings unchanged | unit | `npx vitest run src/lib/overture/__tests__/parse.test.ts` | ❌ Wave 0 |
| PARSE-04 | Features < 15m² filtered; features ≥ 15m² pass; edge case at exactly 15m² passes | unit | `npx vitest run src/lib/overture/__tests__/parse.test.ts` | ❌ Wave 0 |

All four requirements map to a single new test file using mocked MVT data. Mocking approach: create
synthetic `ArrayBuffer` tile bytes using `@mapbox/vector-tile` encoder, or (simpler) mock the
`VectorTile` constructor to return controlled feature data without touching protobuf encoding.

**Recommended mock strategy:** Use `vi.mock('@mapbox/vector-tile')` to return controlled
`VectorTile` / `VectorTileFeature` objects with synthetic geometry and properties. This avoids
needing a full protobuf encoder and keeps tests fast. Each test constructs a `Map<string,
ArrayBuffer>` with fake (empty) `ArrayBuffer`s — the mock intercepts `new VectorTile(pbf)` and
returns the desired fake tile structure.

### Sampling Rate

- **Per task commit:** `npx vitest run src/lib/overture/__tests__/parse.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/lib/overture/__tests__/parse.test.ts` — covers PARSE-01, PARSE-02, PARSE-03, PARSE-04
- [ ] Export `computeFootprintAreaM2` from `src/lib/buildings/merge.ts` (if that approach is chosen)

*(No framework install needed — Vitest 3.0.0 already configured)*

## Sources

### Primary (HIGH confidence)

- Live tile decode — `node` script against `tiles.overturemaps.org/2026-02-18.0/buildings.pmtiles` tile z=14/x=4823/y=6160 (NYC) — confirmed layer name, property names, feature count (749), height coverage (90%), MultiPolygon count (1), winding order (100% CW outer rings), 2026-02-28
- Live tile decode — Lagos tile z=14/x=8346/y=7895 — confirmed 18,278 features, 0% height coverage, 16.5% below 15m², Microsoft ML Buildings source, winding (100% CW outer rings), 2026-02-28
- `@mapbox/vector-tile` TypeScript types — `/node_modules/@mapbox/vector-tile/index.d.ts` — `VectorTile`, `VectorTileLayer`, `VectorTileFeature`, `toGeoJSON(x, y, z)`, `classifyRings` — verified 2026-02-28
- `pbf` TypeScript types — `/node_modules/pbf/index.d.ts` — `new Pbf(ArrayBuffer)` constructor — verified 2026-02-28
- Overture building schema — `https://stac.overturemaps.org/2026-02-18.0/buildings/building/collection.json` — confirmed columns: height, num_floors, roof_shape, roof_height, etc. — 2026-02-28
- Overture roof shape values — `https://docs.overturemaps.org/schema/reference/buildings/types/roof_shape/` — 14 values including flat, gabled, hipped, pyramidal (matches OSM vocabulary) — 2026-02-28

### Secondary (MEDIUM confidence)

- `maplibre-gl` vectortile_to_geojson.ts — `/node_modules/maplibre-gl/src/util/vectortile_to_geojson.ts` — confirms toGeoJSON projection math and classifyRings usage pattern — 2026-02-28
- Overture schema reference — `https://docs.overturemaps.org/schema/reference/buildings/building/` — field types confirmed: height float64 (meters), num_floors int32, geometry: Polygon | MultiPolygon

### Tertiary (LOW confidence)

- MVT spec winding order — `https://github.com/mapbox/vector-tile-spec` — spec says exterior rings CW in tile coords (y-down); however Overture data appears to be CCW in tile coords (CW in lon/lat after projection), which is non-conformant but consistent — LOW because spec conformance is inferred, not directly verified from spec document

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — @mapbox/vector-tile and pbf already installed, API verified from TypeScript defs + live decode
- Architecture: HIGH — all patterns verified against live Overture tile data; winding tested on 400 features across two geographic regions
- Pitfalls: HIGH — winding, area, and argument order issues all confirmed empirically, not theoretically
- Property mapping: HIGH — live data shows exact property names and types; coverage percentages measured empirically

**Research date:** 2026-02-28
**Valid until:** 2026-05-28 (Overture property schema stable; @mapbox/vector-tile v2.x API stable; winding behavior inherent to MVT spec — all are long-lived stable)
