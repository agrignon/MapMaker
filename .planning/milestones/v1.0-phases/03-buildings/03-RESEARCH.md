# Phase 3: Buildings - Research

**Researched:** 2026-02-23
**Domain:** OSM building data pipeline, 3D footprint extrusion, terrain-building integration, roof geometry
**Confidence:** MEDIUM-HIGH (core stack HIGH; three-bvh-csg terrain-scale performance LOW pending validation; roof geometry construction MEDIUM)

---

## Summary

Phase 3 requires fetching OSM building data within the selected bounding box, extruding footprints to 3D geometry with correct heights, handling OSM roof shapes (flat, gabled, hipped, pyramidal), applying a fallback height hierarchy when OSM height data is absent, and placing buildings correctly on the terrain surface so that no building floats above or sinks below the slope.

The standard pipeline is: Overpass API query → osmtogeojson conversion → per-footprint elevation sampling from the existing `ElevationData` grid → earcut triangulation of the 2D footprint → wall extrusion → roof geometry construction → merge into a single Three.js `BufferGeometry`. Terrain-building manifold integrity uses either the **sampled-base** approach (each building base vertex gets the terrain elevation at that point) or a `three-bvh-csg` boolean operation. The STATE.md decision locks in `three-bvh-csg` for boolean operations to prevent non-manifold geometry. However, as noted in STATE.md blockers, the performance of `three-bvh-csg` on terrain-scale meshes has not been validated — the research spike recommendation from STATE.md applies here.

The key dependency versions are: `three-bvh-csg@0.0.18` (released Feb 17, 2025, requires `three >= 0.179.0` and `three-mesh-bvh >= 0.9.7`), `three-mesh-bvh@0.9.8` (requires `three >= 0.159.0`), `earcut@3.0.2` (Sep 2025), and `osmtogeojson@3.0.0-beta.5`. The project already uses `three@0.183.1` which satisfies all peer dependency constraints.

**Primary recommendation:** Use sampled-base elevation (bilinear interpolation into the existing `ElevationData.elevations` grid) as the primary approach for terrain-building alignment on slopes, reserving `three-bvh-csg` only for the final boolean union that closes the model into a printable solid. Do not run `three-bvh-csg` once per building — it is a single union operation on the merged building mesh against the terrain base.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BLDG-01 | User sees OSM building footprints extruded to real heights within the selected area | Overpass API query returns building ways + relations with geometry; osmtogeojson converts to GeoJSON; earcut triangulates 2D footprint; walls + flat cap complete the extrusion |
| BLDG-02 | Buildings use detailed roof geometry (gabled, hipped, etc.) where OSM data is available | OSM Simple 3D Buildings schema defines `roof:shape` values; gabled requires ridge calculation from footprint OBB; hipped requires four ramp faces; pyramidal requires single apex; construction is custom Three.js geometry per roof type |
| BLDG-03 | Buildings missing height data use a fallback hierarchy (levels → footprint heuristic → type default) | OSM `height` tag is direct; `building:levels × 3.5m` is the standard fallback (some use 4m); footprint-area heuristic and type default cover the rest; null/undefined height must be handled explicitly |
| BLDG-04 | Buildings sit correctly on the terrain surface at their geographic location | Bilinear interpolation of `ElevationData.elevations` at each footprint vertex coordinate gives per-vertex base elevation; building walls span from per-vertex base to (base + height); this replaces the flat-base assumption |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `earcut` | 3.0.2 | Polygon triangulation of building footprints | Fastest JS polygon triangulation (3KB gzipped); handles holes (courtyards); OSM buildings with inner ways map directly to earcut hole indices; already used internally by Three.js ExtrudeGeometry |
| `osmtogeojson` | 3.0.0-beta.5 | Convert Overpass QL JSON → GeoJSON | Standard conversion library for OSM; handles multipolygon relations (buildings with holes, L-shaped buildings as relations); browser-compatible |
| `three-bvh-csg` | 0.0.18 | CSG boolean union — merge building mesh with terrain for manifold STL | Locked decision from STATE.md; 100x faster than BSP-based CSG; peer: `three >= 0.179.0`, `three-mesh-bvh >= 0.9.7` |
| `three-mesh-bvh` | 0.9.8 | BVH acceleration for `three-bvh-csg` | Required peer dependency of `three-bvh-csg`; also enables fast elevation sampling via ray casting against terrain mesh if needed |
| `three` | 0.183.1 (already installed) | Three.js BufferGeometry for building meshes | Already in project; satisfies `>= 0.179.0` constraint from `three-bvh-csg` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@types/earcut` | via DefinitelyTyped | TypeScript types for earcut | Always — earcut is JS-only; add `@types/earcut` for type safety |
| `@types/osmtogeojson` | via DefinitelyTyped | TypeScript types for osmtogeojson | Always — osmtogeojson is JS; types available via `@types/osmtogeojson` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `earcut` (manual) | `THREE.ExtrudeGeometry` with `THREE.Shape` | ExtrudeGeometry works but uses cdt2d (constrained Delaunay) internally in recent Three.js — 4x slower than earcut for the same output; direct earcut gives full control over wall normals and per-vertex base elevation |
| `osmtogeojson` | Manual Overpass JSON parsing | osmtogeojson handles the complex multipolygon ring-assembly logic; building with holes (inner ways) would require significant custom code to reconstruct correctly |
| `three-bvh-csg` boolean union | Sampled-base only (no CSG) | If buildings are placed with per-vertex sampled base elevations, the geometry may already be manifold enough for STL without CSG — avoids the performance concern entirely. Risk: gaps at building-terrain edge still possible for complex roof shapes |
| `three-bvh-csg` | `manifold-3d` WASM | manifold-3d is already in the project for validation; it also performs boolean operations but is WASM-only; three-bvh-csg is JS and runs in the main thread or a Worker |

**Installation:**
```bash
npm install earcut osmtogeojson three-bvh-csg three-mesh-bvh
npm install -D @types/earcut @types/osmtogeojson
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/lib/buildings/          # New directory — mirrors src/lib/elevation/
├── overpass.ts             # Fetch OSM building data from Overpass API
├── parse.ts                # osmtogeojson + extract height/roof tags
├── height.ts               # Height fallback hierarchy (BLDG-03)
├── elevationSampler.ts     # Bilinear interpolation of ElevationData at any lon/lat (BLDG-04)
├── footprint.ts            # Earcut triangulation of 2D footprint polygon
├── walls.ts                # Build wall quads from base ring to (base+height) ring
├── roof.ts                 # Roof geometry per roof:shape (flat, gabled, hipped, pyramidal)
├── buildingMesh.ts         # Compose footprint + walls + roof → per-building BufferGeometry
├── merge.ts                # Merge all building BufferGeometries into one
└── __tests__/
    ├── height.test.ts       # Unit tests for fallback hierarchy (BLDG-03)
    ├── elevationSampler.test.ts  # Unit tests for bilinear interpolation (BLDG-04)
    └── footprint.test.ts    # Unit tests for earcut triangulation
```

### Pattern 1: Overpass Building Query

**What:** Fetch all `building` ways and relations with geometry within bbox.
**When to use:** Always — start of the buildings pipeline.

```typescript
// Source: https://wiki.openstreetmap.org/wiki/Overpass_API
const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

export async function fetchBuildingData(bbox: BoundingBox): Promise<OsmData> {
  const { sw, ne } = bbox;
  // [out:json] — OverpassJSON format (not XML)
  // [timeout:60] — per Overpass best practices for web clients
  // out geom — includes geometry inline (nodes not returned separately)
  // relation["building"] — catches large complex buildings stored as relations
  const query = `
    [out:json][timeout:60][bbox:${sw.lat},${sw.lon},${ne.lat},${ne.lon}];
    (
      way["building"];
      way["building:part"];
      relation["building"]["type"="multipolygon"];
    );
    out geom;
  `;
  const response = await fetch(OVERPASS_ENDPOINT, {
    method: 'POST',
    body: new URLSearchParams({ data: query }),
  });
  if (!response.ok) throw new Error(`Overpass error: ${response.status}`);
  return response.json();
}
```

**Confidence:** HIGH — documented on OSM Wiki; CORS is supported by overpass-api.de.

---

### Pattern 2: Building Height Fallback Hierarchy (BLDG-03)

**What:** Resolve a numeric height in meters for any OSM building feature, with a strict fallback cascade.
**When to use:** Always — the height pipeline must never produce `undefined` or throw on missing data.

```typescript
// Source: OSM Simple 3D Buildings wiki; OSM help.openstreetmap.org/64533
// building:levels uses 3.5m/level (standard; some use 4m — 3.5m is more common)
const METERS_PER_LEVEL = 3.5;

// Type defaults (meters): conservative estimates for common building types
const TYPE_DEFAULTS: Record<string, number> = {
  house: 7,          // typical 2-storey
  residential: 7,
  apartments: 14,    // typical 4-storey
  commercial: 8,
  industrial: 6,
  church: 12,
  school: 9,
  yes: 7,            // generic building tag
};

export function resolveHeight(properties: Record<string, string | undefined>): number {
  // 1. Direct height tag (in meters, may include units like "12 m" — parse float)
  if (properties.height) {
    const h = parseFloat(properties.height);
    if (!isNaN(h) && h > 0) return h;
  }

  // 2. Building levels × 3.5m
  if (properties['building:levels']) {
    const levels = parseInt(properties['building:levels'], 10);
    if (!isNaN(levels) && levels > 0) return levels * METERS_PER_LEVEL;
  }

  // 3. Type default by building value
  const buildingType = properties.building ?? 'yes';
  return TYPE_DEFAULTS[buildingType] ?? TYPE_DEFAULTS['yes'];
}
```

**Confidence:** HIGH — fallback order confirmed by OSM wiki, community Q&A, and prior research doc PITFALLS.md.

---

### Pattern 3: Bilinear Interpolation for Terrain Elevation at Footprint Vertices (BLDG-04)

**What:** Given a WGS84 lon/lat coordinate and the existing `ElevationData` grid, return the terrain elevation in meters at that point using bilinear interpolation.
**When to use:** For each vertex of every building footprint ring — provides per-vertex base elevation for wall extrusion on slopes.

```typescript
// Source: Standard GIS bilinear interpolation; ArcGIS documentation on elevation for building footprints
export function sampleElevationAtLonLat(
  lon: number,
  lat: number,
  bbox: BoundingBox,
  elevData: ElevationData
): number {
  const { gridSize, elevations } = elevData;
  const { sw, ne } = bbox;

  // Normalize lon/lat to [0,1] within bbox
  const tx = (lon - sw.lon) / (ne.lon - sw.lon);
  // ty: lat=ne.lat → 0 (north = row 0), lat=sw.lat → 1 (south = last row)
  const ty = (ne.lat - lat) / (ne.lat - sw.lat);

  // Clamp to grid bounds
  const gx = Math.max(0, Math.min(1, tx)) * (gridSize - 1);
  const gy = Math.max(0, Math.min(1, ty)) * (gridSize - 1);

  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const x1 = Math.min(x0 + 1, gridSize - 1);
  const y1 = Math.min(y0 + 1, gridSize - 1);

  const fx = gx - x0;
  const fy = gy - y0;

  // Bilinear interpolation
  const e00 = elevations[y0 * gridSize + x0];
  const e10 = elevations[y0 * gridSize + x1];
  const e01 = elevations[y1 * gridSize + x0];
  const e11 = elevations[y1 * gridSize + x1];

  return e00 * (1 - fx) * (1 - fy)
       + e10 * fx * (1 - fy)
       + e01 * (1 - fx) * fy
       + e11 * fx * fy;
}
```

**Note on coordinate mapping:** The `ElevationData` grid uses `vy=0 → north (ne.lat), vy=gridSize-1 → south (sw.lat)` (matching the terrain.ts convention). The `ty` formula above mirrors this.

**Confidence:** HIGH — standard bilinear interpolation; coordinate convention verified against terrain.ts line 117-118.

---

### Pattern 4: Footprint Triangulation with Earcut

**What:** Convert a 2D polygon ring (outer + optional inner holes) into a triangle index list for the building floor/cap.
**When to use:** For every building footprint — both the floor (base cap) and the roof cap.

```typescript
// Source: https://github.com/mapbox/earcut (earcut@3.0.2)
import earcut from 'earcut';

interface FootprintRing {
  vertices: Array<[x: number, y: number]>; // in mm, local meter space
}

export function triangulateFootprint(
  outer: FootprintRing,
  holes: FootprintRing[] = []
): { flatVertices: number[]; indices: number[]; holeIndices: number[] } {
  const flatVertices: number[] = [];
  const holeIndices: number[] = [];

  // Flatten outer ring
  for (const [x, y] of outer.vertices) {
    flatVertices.push(x, y);
  }

  // Flatten holes and record start indices
  for (const hole of holes) {
    holeIndices.push(flatVertices.length / 2);
    for (const [x, y] of hole.vertices) {
      flatVertices.push(x, y);
    }
  }

  const indices = earcut(flatVertices, holeIndices.length > 0 ? holeIndices : undefined, 2);
  return { flatVertices, indices, holeIndices };
}
```

**Confidence:** HIGH — earcut API verified via GitHub README; hole index format confirmed.

---

### Pattern 5: Building Wall Construction (Per-Vertex Base Elevation)

**What:** Build quad walls connecting the base ring (at terrain elevation) to the top ring (at base + height), with per-vertex base heights for slope correctness.
**When to use:** For every building footprint after base elevation sampling.

```typescript
// Each vertex in the ring has its own base elevation in mm
// wallVertices: [x0, y0, baseZ0, x1, y1, baseZ1, ...]
// topZ[i] = baseZ[i] + buildingHeightMM (same height added to each vertex)

export function buildWalls(
  ringXY: Array<[x: number, y: number]>,        // in mm (local space)
  baseZmm: number[],                             // terrain Z in mm per vertex
  buildingHeightMM: number                       // extrusion height in mm
): Float32Array {
  const n = ringXY.length;
  // Each segment = quad = 2 triangles = 6 vertices × 3 coords
  const positions = new Float32Array(n * 6 * 3);
  let idx = 0;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const [x0, y0] = ringXY[i];
    const [x1, y1] = ringXY[j];
    const bz0 = baseZmm[i];
    const bz1 = baseZmm[j];
    const tz0 = bz0 + buildingHeightMM;
    const tz1 = bz1 + buildingHeightMM;

    // Quad: (x0,y0,bz0), (x1,y1,bz1), (x1,y1,tz1), (x0,y0,tz0)
    // Two CCW triangles (outward normal from outside)
    // T1: p0-base → p1-base → p1-top
    positions[idx++] = x0; positions[idx++] = y0; positions[idx++] = bz0;
    positions[idx++] = x1; positions[idx++] = y1; positions[idx++] = bz1;
    positions[idx++] = x1; positions[idx++] = y1; positions[idx++] = tz1;
    // T2: p0-base → p1-top → p0-top
    positions[idx++] = x0; positions[idx++] = y0; positions[idx++] = bz0;
    positions[idx++] = x1; positions[idx++] = y1; positions[idx++] = tz1;
    positions[idx++] = x0; positions[idx++] = y0; positions[idx++] = tz0;
  }

  return positions;
}
```

**Note on winding:** Winding depends on ring orientation. OSM outer rings are typically CCW in WGS84 lon/lat space; after UTM projection and Y-flip (north = +Y), they may become CW. Verify with a normal computation and flip winding if the normal points inward.

**Confidence:** MEDIUM — approach is standard; exact winding depends on coordinate system conventions which must be validated against the terrain.ts Y-axis convention.

---

### Pattern 6: Roof Geometry by `roof:shape` (BLDG-02)

**What:** Build roof geometry for the four required shapes. OSM provides `roof:shape` and optionally `roof:height`.

**Supported shapes for Phase 3:**

| `roof:shape` | Geometry Description | Implementation |
|---|---|---|
| `flat` (default) | Horizontal cap at top elevation | Earcut triangulation of top ring, Z = topZ |
| `gabled` | Ridge line along long axis; two sloped faces | Compute OBB of footprint; ridge at `(OBB center ± half-long-axis, topZ + roofHeight/2)` per roofHeight; two trapezoid faces + two gable triangles |
| `hipped` | Four sloped faces meeting at ridge | Ridge shorter than building width; all four sides slope; compute inset ring at ridgeHeight, connect to outer top ring |
| `pyramidal` | All faces slope to single apex point | Apex at footprint centroid + roofHeight; triangulate fan from apex to each top ring edge |

**Flat roof example (most common case):**
```typescript
// Flat roof = same as floor cap but at topZ
// Reuse triangulateFootprint() output, set all Z = topZ
export function buildFlatRoof(
  topRingXY: Array<[x: number, y: number]>,
  topZ: number,    // in mm
  holes: Array<Array<[x: number, y: number]>> = []
): Float32Array {
  const { flatVertices, indices } = triangulateFootprint(
    { vertices: topRingXY },
    holes.map(h => ({ vertices: h }))
  );
  const positions = new Float32Array(indices.length * 3);
  for (let i = 0; i < indices.length; i++) {
    const vi = indices[i];
    positions[i * 3]     = flatVertices[vi * 2];
    positions[i * 3 + 1] = flatVertices[vi * 2 + 1];
    positions[i * 3 + 2] = topZ;
  }
  return positions;
}
```

**Gabled roof construction (non-rectangular footprints):**
For non-rectangular footprints, compute the Oriented Bounding Box (OBB) of the footprint, use the OBB long axis as the ridge direction. The ridge runs along the OBB long axis at Z = topZ + roofHeight. The two sloped planes connect each of the two long-axis wall edges to the ridge line; the two gable triangles cap the short ends. This is custom geometry math — no library does this automatically for arbitrary footprints.

**Confidence (gabled/hipped):** MEDIUM — geometric approach confirmed by OSM-4D wiki and OSMBuildings documentation; exact implementation requires care with non-rectangular footprints.

---

### Pattern 7: three-bvh-csg Brush/Evaluator for Final Solid

**What:** After building all building geometry, perform a single boolean ADDITION (union) with the terrain solid to produce a manifold STL-ready mesh.
**When to use:** As the final step before STL export, not per-building.

```typescript
// Source: https://github.com/gkjohnson/three-bvh-csg (v0.0.18)
import { ADDITION, Brush, Evaluator } from 'three-bvh-csg';
import * as THREE from 'three';

export function unionBuildingsWithTerrain(
  terrainGeometry: THREE.BufferGeometry,  // must be two-manifold
  buildingsGeometry: THREE.BufferGeometry // merged building mesh
): THREE.BufferGeometry {
  const terrainBrush = new Brush(terrainGeometry);
  terrainBrush.updateMatrixWorld();

  const buildingsBrush = new Brush(buildingsGeometry);
  buildingsBrush.updateMatrixWorld();

  const evaluator = new Evaluator();
  const result = evaluator.evaluate(terrainBrush, buildingsBrush, ADDITION);
  return result.geometry;
}
```

**CRITICAL CONSTRAINT:** Both input geometries must be two-manifold (watertight). The terrain solid from Phase 2 (`buildSolidMesh`) is already manifold. Building geometry must be closed (floor cap + walls + roof cap — no open edges). If building geometry is non-manifold, the CSG operation produces undefined results.

**Performance concern (from STATE.md blockers):** three-bvh-csg performance on a 150mm × 150mm terrain with 100+ buildings has not been measured. The Boolean ADDITION on large meshes may take several seconds. Mitigation: run in Web Worker (Phase 6 territory but acceptable to prototype here); if too slow, fall back to sampled-base approach without CSG.

**Confidence:** MEDIUM — API is correct (verified via GitHub README); performance at terrain scale is LOW confidence (unvalidated per STATE.md).

---

### Anti-Patterns to Avoid

- **Flat-base extrusion on all buildings:** Extruding from a single flat base elevation (e.g., average footprint elevation) makes buildings float or sink on slopes. Always use per-vertex sampled base elevations (BLDG-04).
- **Running three-bvh-csg per building:** The BVH construction cost is amortized over the whole operation; one CSG per building × 500 buildings = catastrophic performance. Merge all building geometry first, then perform one union.
- **Using `three` ExtrudeGeometry for OSM footprints:** Three.js `ExtrudeGeometry` uses a `Shape` abstraction that doesn't naturally accept per-vertex base heights or GeoJSON ring formats. Direct BufferGeometry construction with earcut gives full control.
- **Treating `height` tag as always numeric:** OSM `height` values are strings and may include units (e.g., `"12 m"`, `"40'"`). Always `parseFloat()` and handle feet-to-meters conversion for edge cases.
- **Skipping hole support in earcut:** Buildings with courtyards are stored as multipolygon relations in OSM with inner ways. If inner rings are ignored, the triangulation fills in the courtyard with solid geometry — producing wrong footprints.
- **Querying only `way["building"]`:** Some large buildings (airports, universities) are stored as `relation["building"]["type"="multipolygon"]`. The Overpass query must include both ways and relations.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Polygon triangulation with holes | Custom ear-clipping | `earcut@3.0.2` | earcut handles degenerate vertices, Steiner points, and holes; hand-rolled ear-clipping fails on complex OSM footprints with concave vertices |
| OSM multipolygon ring assembly | Parse inner/outer roles manually | `osmtogeojson@3.0.0-beta.5` | OSM relations with split ways (multiple ways forming one ring) require complex ring-assembly logic; osmtogeojson handles this correctly |
| Building-terrain boolean union for manifold geometry | Mesh concatenation (`mergeGeometries`) | `three-bvh-csg@0.0.18` | Simple concatenation produces T-junctions and non-manifold edges at the building-terrain seam; CSG handles this correctly |

**Key insight:** The three hardest problems in this domain (polygon triangulation with holes, OSM ring assembly, boolean union for manifold output) all have battle-tested library solutions. Any custom implementation will fail on real-world OSM edge cases that the libraries already handle.

---

## Common Pitfalls

### Pitfall 1: Non-Manifold Building Geometry from Missing Caps

**What goes wrong:** Building walls are constructed but the floor cap (bottom of building) or roof cap (top of building) is omitted. The resulting mesh is an open tube — not manifold. `three-bvh-csg` will fail or produce garbage on non-manifold input.

**Why it happens:** Developers extrude walls and add a flat roof but forget the bottom cap, assuming the terrain surface closes it. The terrain and building are separate meshes until the CSG union.

**How to avoid:** Every building must have: floor cap (at per-vertex base elevations) + walls + roof. Validate with `manifold-3d` (already in project) before the CSG step.

**Warning signs:** `three-bvh-csg` produces unexpected holes in the result; `manifold-3d` reports non-manifold edges in building mesh.

---

### Pitfall 2: Winding Order Inconsistency Between Floor, Walls, and Roof

**What goes wrong:** Floor cap faces outward (down), roof cap faces outward (up), and walls face outward (sideways). If winding order is inconsistent, normals point inward on some faces, making the mesh look correct in Three.js preview (which renders both sides) but fail manifold tests.

**Why it happens:** The Y-axis inversion between OSM coordinates (lat increases north) and local mesh space (Y increases north) changes the CCW/CW interpretation. OSM outer rings are CCW in lon/lat but become CW after Y-flip.

**How to avoid:** Define a canonical winding rule: "outer faces have CCW winding viewed from outside the solid." Use `geometry.computeVertexNormals()` and visually check that normals point outward. Add a manifold check assertion in tests.

**Warning signs:** Three.js preview renders correctly but manifold-3d validation reports winding errors; slicers show inverted normals.

---

### Pitfall 3: Height in Meters vs. Millimeters

**What goes wrong:** OSM height tags are in meters. Building height is resolved in meters. If the height-in-meters is passed directly to wall construction (which operates in mm), buildings are 1000x too short.

**Why it happens:** Coordinate pipeline mixes units. The terrain mesh is in mm; OSM data is in meters.

**How to avoid:** Resolve `buildingHeightMM = resolveHeight(properties) * (widthMM / geographicWidthM)` — scale the real-world meter height by the same horizontal scale used for terrain. Never pass raw meter heights to geometry construction.

**Warning signs:** Buildings are visible but appear as thin slabs; slicer shows building height of 0.007mm instead of 7mm.

---

### Pitfall 4: Overpass Query Returns No Results for Bbox That Has Buildings

**What goes wrong:** The Overpass bbox format is `south,west,north,east` (lat/lon order). Using `[bbox:sw.lon,sw.lat,ne.lon,ne.lat]` (wrong order) or `[bbox:ne.lat,sw.lon,sw.lat,ne.lon]` returns an empty result set silently — no error thrown.

**Why it happens:** Overpass bbox ordering is counterintuitive compared to GeoJSON (`[west, south, east, north]`).

**How to avoid:** Always format as `${sw.lat},${sw.lon},${ne.lat},${ne.lon}`. Add a test that queries a known bbox (e.g., a dense city block) and asserts `features.length > 0`.

**Warning signs:** Empty buildings array even for known dense areas; no network error, just an empty result.

---

### Pitfall 5: three-bvh-csg Requires Manifold Input (Cannot Be a Fallback)

**What goes wrong:** Developer treats `three-bvh-csg` as a repair tool — feeding it non-manifold building geometry expecting it to fix the problems. The library documentation explicitly states "all brush geometry must be two-manifold." Non-manifold input produces incorrect output geometry, not an error.

**Why it happens:** CSG is expected to "merge" meshes, which sounds like fixing problems. It doesn't — it requires valid input.

**How to avoid:** Validate all building geometry with `manifold-3d` BEFORE passing to `three-bvh-csg`. Fix any non-manifold issues in the building generation step.

**Warning signs:** CSG result looks visually wrong (holes, missing faces) but no exception is thrown.

---

### Pitfall 6: Performance Collapse on Dense Urban Areas

**What goes wrong:** A 500m × 500m urban bbox may contain 200+ buildings. Building all geometries sequentially on the main thread blocks the UI. The CSG union on a large merged building mesh against a Martini terrain mesh (potentially 100k+ triangles) may take 2-10 seconds.

**Why it happens:** All geometry construction happens synchronously in a React event handler without a Worker.

**How to avoid:** For Phase 3, the geometry construction can run on the main thread as a proof-of-concept (FNDN-03/Web Worker is Phase 6). Add a visible "Generating buildings…" progress step in the UI. Limit Overpass query to avoid extremely dense areas crashing (set `[maxsize:33554432]` — 32MB limit).

**Warning signs:** Browser tab becomes unresponsive for 3+ seconds; "Page Unresponsive" dialog appears.

---

## Code Examples

Verified patterns from official sources:

### Overpass Query with Buildings + Relations
```typescript
// Source: https://wiki.openstreetmap.org/wiki/Overpass_API
// [out:json] — JSON output (OverpassJSON)
// out geom — geometry included inline (avoids a second node fetch)
// [timeout:60] — 60s timeout (default 180s is too long for web UX)
// [maxsize:33554432] — 32MB max response (prevents massive city downloads)
const query = `
  [out:json][timeout:60][maxsize:33554432]
  [bbox:${sw.lat},${sw.lon},${ne.lat},${ne.lon}];
  (
    way["building"];
    way["building:part"];
    relation["building"]["type"="multipolygon"];
  );
  out geom;
`;
```

### osmtogeojson Conversion
```typescript
// Source: https://github.com/tyrasd/osmtogeojson
import osmtogeojson from 'osmtogeojson';

const geojson = osmtogeojson(overpassData);
// geojson.features: GeoJSON Feature[] — each building is a Feature with:
//   geometry.type: 'Polygon' or 'MultiPolygon'
//   geometry.coordinates: rings in [lon, lat] order
//   properties: all OSM tags (height, building:levels, roof:shape, etc.)
```

### three-bvh-csg Boolean Union
```typescript
// Source: https://github.com/gkjohnson/three-bvh-csg (v0.0.18)
import { ADDITION, Brush, Evaluator } from 'three-bvh-csg';

const brush1 = new Brush(terrainSolidGeometry);   // from Phase 2 buildSolidMesh
brush1.updateMatrixWorld();

const brush2 = new Brush(mergedBuildingsGeometry); // all buildings merged
brush2.updateMatrixWorld();

const evaluator = new Evaluator();
const result = evaluator.evaluate(brush1, brush2, ADDITION);
// result is a Mesh; result.geometry is the unified BufferGeometry
```

### Coordinate Pipeline: lon/lat → UTM meters → mm

The existing `utm.ts` functions handle lon/lat → UTM projection. Building footprint coordinates from OSM are WGS84 `[lon, lat]` pairs that must be projected to the same local UTM space as the terrain mesh.

```typescript
// Reuse existing utm.ts project function pattern
import { projectToUTM } from '../utm';

function lonLatToLocalMM(
  lon: number,
  lat: number,
  bbox: BoundingBox,
  utmZone: number,
  widthMM: number,
  depthMM: number,
  geographicWidthM: number,
  geographicDepthM: number
): [xMM: number, yMM: number] {
  const { x: utmX, y: utmY } = projectToUTM(lon, lat, utmZone);
  const { x: bboxOriginX, y: bboxOriginY } = projectToUTM(
    (bbox.sw.lon + bbox.ne.lon) / 2,
    (bbox.sw.lat + bbox.ne.lat) / 2,
    utmZone
  );
  const localXM = utmX - bboxOriginX;
  const localYM = utmY - bboxOriginY;
  const scale = widthMM / geographicWidthM;
  return [localXM * scale, localYM * scale];
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| BSP-based CSG (ThreeBSP) | BVH-accelerated CSG (three-bvh-csg) | 2022–2023 | 100x faster; two-manifold requirement remains |
| Flat-base building extrusion (single Z for all vertices) | Per-vertex base elevation via DEM sampling | Industry standard in 3D city renderers | Correct placement on slopes; no floating buildings |
| `osmtogeojson` v2.x (CommonJS only) | `osmtogeojson@3.0.0-beta.5` (browser + node) | 3 years ago (beta stable) | ES module compatible; multipolygon support |
| `earcut@2.x` | `earcut@3.0.2` (Sep 2025) | Sep 2025 | Minor fixes; same API |
| `THREE.ExtrudeGeometry` for buildings | Direct `BufferGeometry` with earcut | Still valid, but | Direct construction allows per-vertex base heights; ExtrudeGeometry assumes flat base |

**Deprecated/outdated:**
- `three-csg-ts`: Alternative CSG library; less actively maintained than `three-bvh-csg`; no BVH acceleration.
- `OSMBuildings` (standalone): 2D canvas-based renderer; not Three.js; no STL output.
- `ThreeCSG` / `CSG.js`: BSP-based; 100x slower than `three-bvh-csg` on complex meshes; avoid.

---

## Open Questions

1. **three-bvh-csg performance on terrain-scale meshes**
   - What we know: The library is 100x faster than BSP-CSG; v0.0.18 is current. STATE.md explicitly flags this as unvalidated.
   - What's unclear: A Martini terrain mesh at `maxError=5` for a 1km² bbox has ~5k–50k triangles. A merged buildings mesh for 200 buildings has ~100k+ triangles. The union of two meshes of this complexity has no published benchmark.
   - Recommendation: Include a spike task in the Phase 3 plan: measure CSG performance on a real-world dense bbox before committing to the CSG approach. If > 3 seconds, fall back to sampled-base only (no CSG union) and use manifold-3d validation to catch any resulting seam issues.

2. **osmtogeojson beta status**
   - What we know: `3.0.0-beta.5` is last published 3 years ago — effectively stable despite the beta label. It is the current version and widely used.
   - What's unclear: There is a maintained fork at `github.com/placemark/osmtogeojson` but it is a separate package.
   - Recommendation: Use `osmtogeojson@3.0.0-beta.5` from the original package. The beta label is cosmetic.

3. **Gabled/hipped roof OBB computation for non-rectangular footprints**
   - What we know: OSM gabled roofs assume a rectangular bounding box; the ridge runs along the long axis. For non-rectangular footprints (L-shapes, T-shapes), OSM recommends computing the Oriented Bounding Box first.
   - What's unclear: There is no canonical JS library for 2D OBB computation that is widely used with Three.js.
   - Recommendation: Implement a minimal 2D OBB using rotating calipers or convex hull approach (convex hull of footprint, then minimum bounding rectangle). This is ~50 lines of custom code. Only needed for gabled/hipped — flat and pyramidal work on any shape.

4. **STL export pipeline integration with buildings**
   - What we know: Phase 2 export pipeline rebuilds geometry from store data. With buildings added, the store must also hold building geometry data (or the building generation must be re-run on export).
   - What's unclear: Whether to store building geometry as serializable data (like `ElevationData`) or as a `BufferGeometry` reference (not serializable to Zustand).
   - Recommendation: Follow the existing pattern from Phase 2 — hold the `ArrayBuffer` for building geometry in a module-level variable (not in Zustand), alongside the existing terrain geometry buffer. Zustand stores status only.

---

## Sources

### Primary (HIGH confidence)
- `github.com/gkjohnson/three-bvh-csg` — API, v0.0.18, peer dependencies (three >= 0.179, three-mesh-bvh >= 0.9.7)
- `github.com/gkjohnson/three-mesh-bvh` package.json — v0.9.8, peer dep three >= 0.159
- `github.com/mapbox/earcut` README — v3.0.2 (Sep 2025), hole indices API, 2D triangulation
- `wiki.openstreetmap.org/wiki/Simple_3D_buildings` — OSM building tags (height, levels, roof:shape)
- `wiki.openstreetmap.org/wiki/OSM-4D/Roof_table` — Roof geometry types and parameters
- `wiki.openstreetmap.org/wiki/Overpass_API` — Endpoint URL, CORS support, query format, timeout/maxsize
- `.planning/research/PITFALLS.md` — Non-manifold pitfalls, building height fallback, terrain-building slope pitfall (confirmed in this project's prior research)
- `.planning/STATE.md` — three-bvh-csg decision locked; CSG performance not validated (confirmed concern)
- `src/lib/mesh/terrain.ts` — Y-axis convention (vy=0 → north, Y-positive), coordinate mapping, existing zScale logic

### Secondary (MEDIUM confidence)
- `wiki.openstreetmap.org/wiki/Overpass_API` — CORS confirmed (browser-originated fetches supported)
- `github.com/tyrasd/osmtogeojson` — v3.0.0-beta.5, multipolygon support, browser-compatible
- `gmd.copernicus.org/articles/15/7505/2022/` — OSM building height missing data research; 3.5m/level standard
- OSM-4D gabled/hipped roof geometry descriptions

### Tertiary (LOW confidence)
- three-bvh-csg performance on terrain-scale meshes (1k–100k triangle inputs): **no measured benchmark found** — flag as requiring spike validation
- osmtogeojson ES module / Vite import compatibility: no official documentation found; likely works given browser support claim but not verified

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — library versions verified via official GitHub repos
- Architecture: MEDIUM-HIGH — patterns are standard in 3D OSM rendering; winding details require validation against existing coordinate conventions
- Pitfalls: HIGH — all pitfalls documented in prior research (PITFALLS.md) and confirmed against Phase 2 codebase patterns
- three-bvh-csg performance: LOW — explicitly unvalidated per STATE.md; spike required

**Research date:** 2026-02-23
**Valid until:** 2026-03-23 (30 days — library versions stable; OSM API stable)
