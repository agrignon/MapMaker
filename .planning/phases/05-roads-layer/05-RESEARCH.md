# Phase 5: Roads Layer - Research

**Researched:** 2026-02-24
**Domain:** OSM road network fetch, centerline-to-ribbon geometry, terrain elevation sampling, 3D mesh integration
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Road Style**
- Default style: recessed (channels cut into terrain)
- Medium depth: 0.5–1.0mm range for the deepest roads
- Depth scales by road type: highways get full depth, residential ~60%, minor roads ~30%
- UI control: style toggle only (raised/recessed/flat) — no separate depth slider
- When raised style is selected, roads sit above terrain; when flat, roads are flush with terrain surface

**Road Geometry**
- Simplified segments — reduce OSM node density, roads follow general path with fewer vertices
- Intersections: simple overlap — recessed channels merge naturally, no special intersection geometry
- Bounding box clipping: roads trimmed cleanly at the selection boundary edge
- Dead-ends: flat termination — road geometry simply stops, no rounded caps

**Road Type Classification**
- Include: motorway, trunk, primary, secondary, tertiary, residential, unclassified
- Exclude: footpaths, cycleways, tracks, service roads
- 3 width tiers: Highway (widest), Main road (medium), Residential (narrowest)
- Bridges: interpolate elevation smoothly between start/end terrain heights — road spans above terrain below
- Tunnels: hidden entirely — road segments tagged as tunnels are not rendered

**Visual Appearance**
- Color: uniform dark gray (#555 range) for all road types — asphalt-like
- No color variation by road type — differentiation comes from width and depth
- Bridges: same dark gray color, visually distinct only by elevation
- Toggle off behavior: terrain fills in completely where roads were — clean on/off, no residual channels

### Claude's Discretion
- Exact vertex simplification algorithm and threshold
- Precise width values for each tier (in model-space mm)
- Exact gray hex value within the #555 range
- Bridge interpolation curve shape
- How road geometry integrates with the existing TerrainMesh/BuildingMesh pipeline

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ROAD-01 | User sees OSM road network rendered as 3D geometry within the selected area | Overpass QL query for highway ways with `out geom;` + osmtogeojson (already installed) → geometry-extrude extrudePolyline → Three.js BufferGeometry |
| ROAD-02 | User can choose road style: recessed channels, raised surfaces, or flat at terrain level | `roadStyle` enum in Zustand store, already pre-planned in Phase 4; style toggle UI in RoadsSection component replacing LayerPlaceholderSection; sign-flip on depth parameter to switch raised/recessed |
| ROAD-03 | Road width reflects road type (highway wider than residential street) | 3-tier width classification at data parse time; `lineWidth` parameter in extrudePolyline per road type |
</phase_requirements>

---

## Summary

Phase 5 builds the roads layer on top of the complete Phase 4 infrastructure. The data pipeline mirrors buildings exactly: fetch OSM road ways via Overpass API, parse with osmtogeojson (already installed), project coordinates to UTM/mm space, build Three.js geometry, store features in Zustand, render in a RoadMesh component, and include in STL export.

The critical geometry question — vertex displacement vs CSG — was already resolved in Phase 4 planning (STATE.md): **use vertex displacement, not CSG**. Roads are rendered as ribbon meshes that float above (raised), indent below (recessed), or sit at (flat) terrain Z, where the terrain Z is sampled per road vertex using the existing `sampleElevationAtLonLat`. This avoids the quadratic CSG cost on dense city road networks. Roads are separate geometry from terrain in both preview and export; they are simply merged with `mergeGeometries` (not CSG union) into the STL.

The road ribbon geometry is produced by `geometry-extrude@0.2.1` (already decided in Phase 4), using `extrudePolyline`. The function accepts arrays of `[x, y]` polylines in 2D and returns `position`, `normal`, `indices`, `uv` TypedArrays ready for Three.js `BufferGeometry.setAttribute`. Road centerlines from OSM (in WGS84) are projected to local mm space using the same `wgs84ToUTM` → center-subtract → `horizontalScale` pipeline used by buildings, then Z is assigned per-vertex by sampling `sampleElevationAtLonLat` and applying the style offset.

**Primary recommendation:** Follow the established buildings pipeline: Overpass fetch → osmtogeojson parse → store features in Zustand → RoadMesh component using geometry-extrude → merge into export. Do not attempt CSG. Do not build a custom ribbon generator.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| geometry-extrude | 0.2.1 | Centerline → ribbon mesh (extrudePolyline) | Decided in Phase 4; handles miter joins, depth, lineWidth; returns TypedArrays directly usable by Three.js |
| osmtogeojson | 3.0.0-beta.5 | Convert Overpass JSON → GeoJSON FeatureCollection | Already installed; used by buildings pipeline; ways with `out geom` become LineString features |
| Overpass API | (HTTP) | Fetch OSM road way geometries | Already used by buildings; same endpoint, same fetch pattern |
| Three.js (three) | 0.183.1 | Ribbon geometry rendering | Already installed; mergeGeometries from three/addons for multi-road merge |
| Zustand (zustand) | 5.0.3 | State management for road features and style | Already installed; store extended in Phase 4 with `roadStyle` slot |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| simplify-js | 1.2.4 | Polyline vertex reduction (Ramer-Douglas-Peucker) | Before extrudePolyline to reduce OSM node count; tolerance ~2–5m in UTM space |
| proj4 / wgs84ToUTM | (in-house) | WGS84 → UTM coordinate projection | Already used; same pipeline as buildings |
| sampleElevationAtLonLat | (in-house) | Bilinear terrain elevation sampling at road vertex | Already used by buildings; same function, same signature |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| geometry-extrude | Three.js TubeGeometry | TubeGeometry requires a CatmullRomCurve3 path and produces round tubes — not flat road ribbons; geometry-extrude handles flat ribbon with configurable depth natively |
| geometry-extrude | Custom ribbon builder | Miter joint math at corners is subtle (T-intersections, sharp turns); geometry-extrude already handles this correctly |
| mergeGeometries (for export) | CSG union (three-bvh-csg) | CSG on dense road networks is O(n²) and has caused timeouts on buildings; STATE.md explicitly chose vertex displacement + merge for roads |
| simplify-js | geometry-extrude built-in `simplify` option | geometry-extrude's built-in simplify operates in 2D screen space; pre-simplify in UTM meter space for accurate tolerance control |

**Installation:**
```bash
npm install geometry-extrude@0.2.1 simplify-js
```

Note: `geometry-extrude` is already the decided library per STATE.md. `simplify-js` may not need installation if geometry-extrude's built-in `simplify` option suffices at scale, but per-component simplification in UTM is more accurate.

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/
│   └── roads/
│       ├── overpass.ts       # fetchRoadData(bbox) — Overpass QL query for highway ways
│       ├── parse.ts          # parseRoadFeatures(osmJson) — osmtogeojson + classify + filter
│       ├── types.ts          # RoadFeature, RoadStyle, RoadTier types
│       └── roadMesh.ts       # buildRoadGeometry(features, bbox, elevData, params) → BufferGeometry
├── components/
│   └── Preview/
│       ├── RoadMesh.tsx      # R3F mesh component (mirrors BuildingMesh.tsx pattern)
│       └── RoadsSection.tsx  # Sidebar section with style toggle (mirrors BuildingsSection.tsx)
└── store/
    └── mapStore.ts           # Already has roads slot; add roadFeatures, roadStyle, roadGenerationStatus
```

### Pattern 1: Overpass Road Fetch (mirrors buildings/overpass.ts)
**What:** Fetch highway ways from Overpass API with `out geom` for inline coordinates
**When to use:** Same trigger as buildings — when generation is kicked off

```typescript
// Source: mirrors src/lib/buildings/overpass.ts
// IMPORTANT: Overpass bbox order is south,west,north,east
export async function fetchRoadData(bbox: BoundingBox): Promise<unknown> {
  const { sw, ne } = bbox;

  // Include motorway, trunk, primary, secondary, tertiary, residential, unclassified
  // Exclude: service, footway, cycleway, path, track, steps
  // Also fetch bridge and tunnel tags to handle those separately
  const query = `[out:json][timeout:60][maxsize:33554432][bbox:${sw.lat},${sw.lon},${ne.lat},${ne.lon}];
(
  way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|residential|unclassified)$"];
);
out geom;`;

  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!response.ok) throw new Error(`Overpass API error: ${response.status}`);
  return response.json();
}
```

**Confidence:** HIGH — mirrors working buildings fetch pattern exactly; same Overpass endpoint, same `out geom` mode

### Pattern 2: Road Feature Parsing
**What:** osmtogeojson converts Overpass JSON → GeoJSON FeatureCollection; then filter + classify
**Key details:**
- osmtogeojson ways with `out geom` → GeoJSON LineString features
- `feature.properties.highway` gives the highway tag value
- `feature.properties.bridge === 'yes'` flags bridges
- `feature.properties.tunnel === 'yes'` flags tunnels (SKIP these)
- Three width tiers: `motorway|trunk` → Highway, `primary|secondary|tertiary` → Main, `residential|unclassified|*_link` → Residential

```typescript
// Source: osmtogeojson pattern (established in Phase 3)
import osmtogeojson from 'osmtogeojson';

export type RoadTier = 'highway' | 'main' | 'residential';

export interface RoadFeature {
  coordinates: [number, number][]; // [lon, lat] pairs
  tier: RoadTier;
  isBridge: boolean;
  // tunnels are filtered out at parse time
}

export function parseRoadFeatures(osmJson: unknown): RoadFeature[] {
  const geojson = osmtogeojson(osmJson as Parameters<typeof osmtogeojson>[0]);
  const features: RoadFeature[] = [];

  for (const feature of geojson.features) {
    if (feature.geometry.type !== 'LineString') continue;
    const props = feature.properties ?? {};
    const highway = props['highway'] as string | undefined;
    if (!highway) continue;

    // Skip tunnels entirely
    if (props['tunnel'] === 'yes') continue;

    const tier = classifyTier(highway);
    if (!tier) continue; // filtered out type

    features.push({
      coordinates: (feature.geometry as GeoJSON.LineString).coordinates as [number, number][],
      tier,
      isBridge: props['bridge'] === 'yes',
    });
  }
  return features;
}

function classifyTier(highway: string): RoadTier | null {
  if (/^(motorway|trunk)(|_link)$/.test(highway)) return 'highway';
  if (/^(primary|secondary|tertiary)(|_link)$/.test(highway)) return 'main';
  if (/^(residential|unclassified)$/.test(highway)) return 'residential';
  return null; // service, footway, cycleway, track, etc.
}
```

**Confidence:** HIGH — osmtogeojson is already installed and used; GeoJSON LineString output for highway ways is confirmed behavior

### Pattern 3: Centerline → Ribbon Geometry (geometry-extrude)
**What:** Project road coordinates to mm space, sample terrain elevation, then use extrudePolyline
**Critical: Z placement depends on style (raised/recessed/flat)**

```typescript
// Source: geometry-extrude README + Three.js BufferGeometry docs
import { extrudePolyline } from 'geometry-extrude';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Width tiers in mm (model space) — Claude's discretion
const ROAD_WIDTH_MM: Record<RoadTier, number> = {
  highway: 1.8,  // widest
  main: 1.2,     // medium
  residential: 0.7, // narrowest
};

// Depth offsets in mm — signs control raised/recessed/flat
// Depth values within 0.5–1.0mm range for deepest roads
const ROAD_DEPTH_MM: Record<RoadTier, number> = {
  highway: 1.0,      // full depth
  main: 0.7,         // ~70%
  residential: 0.4,  // ~40% (between 30–60%)
};

export function buildRoadGeometry(
  features: RoadFeature[],
  bbox: BoundingBox,
  elevData: ElevationData,
  params: RoadGeometryParams
): THREE.BufferGeometry | null {
  const { widthMM, geographicWidthM, exaggeration, minElevationM, bboxCenterUTM, roadStyle, zScale } = params;
  const horizontalScale = widthMM / geographicWidthM;

  const geometries: THREE.BufferGeometry[] = [];

  for (const feature of features) {
    // 1. Project [lon, lat] → local mm XY
    const pts2D = projectToMM(feature.coordinates, bboxCenterUTM, horizontalScale);

    // 2. Simplify to reduce vertex count (tolerance ~2m in mm space)
    const simplified = simplifyPolyline(pts2D, 2 * horizontalScale);
    if (simplified.length < 2) continue;

    // 3. Sample terrain elevation for each vertex
    const terrainZs = feature.coordinates.map(([lon, lat]) => {
      const elevM = sampleElevationAtLonLat(lon, lat, bbox, elevData);
      return (elevM - minElevationM) * zScale;
    });

    // 4. Determine Z for road ribbon based on style
    // Recessed: road Z = terrainZ - depthMM (channels cut below terrain)
    // Raised:   road Z = terrainZ + depthMM (ribbon sits above terrain)
    // Flat:     road Z = terrainZ (flush with terrain)
    const depthMM = ROAD_DEPTH_MM[feature.tier];
    const styleOffset = roadStyle === 'recessed' ? -depthMM
      : roadStyle === 'raised' ? depthMM
      : 0; // flat

    // For bridges: interpolate Z linearly between endpoint terrain elevations
    // Road spans above whatever terrain exists below
    const roadZs = feature.isBridge
      ? interpolateBridgeZ(terrainZs, depthMM)
      : terrainZs.map(z => z + styleOffset);

    // 5. Use extrudePolyline to build ribbon mesh
    // extrudePolyline takes 2D XY polylines; depth controls the Z thickness of the ribbon
    // We use a shallow depth (ribbon height) and place the ribbon at the computed Z
    const lineWidth = ROAD_WIDTH_MM[feature.tier];
    const { position, indices, normal } = extrudePolyline(
      [simplified],  // array of polylines (MultiLineString format)
      { lineWidth, depth: 0.5, miterLimit: 2 }  // depth = ribbon thickness
    );

    // 6. Assign per-vertex Z from terrain sampling (override the extrudePolyline flat Z)
    // extrudePolyline produces Z in [0, depth]; we shift to actual road Z
    // Top face vertices have Z near `depth`, bottom near 0
    // We add roadZ per-vertex to lift the whole ribbon to correct terrain height
    const geo = buildGeometryFromExtruded(position, indices, normal, simplified, roadZs, lineWidth);
    geometries.push(geo);
  }

  if (geometries.length === 0) return null;
  const merged = mergeGeometries(geometries, false);
  merged.computeVertexNormals();
  geometries.forEach(g => g.dispose());
  return merged;
}
```

**Confidence:** MEDIUM — extrudePolyline API is verified; the Z assignment step after extrusion is a custom step that needs implementation (geometry-extrude produces flat Z; terrain-following Z must be applied per-vertex after the fact)

### Pattern 4: Z Assignment After Extrusion (Critical Implementation Detail)
**What:** geometry-extrude produces flat geometry in the XY plane. Road terrain Z must be applied by modifying the position array post-extrusion.
**Why this matters:** This is the "vertex displacement" approach called out in STATE.md — not CSG.

```typescript
// After extrudePolyline, position is Float32Array with [x, y, z] per vertex
// The ribbon sits at z=0..depth in a flat plane
// We need to assign z = terrain_elevation_at_(x,y) + style_offset

function applyTerrainZ(
  position: Float32Array,
  simplified2D: [number, number][],
  roadZs: number[],
  lineWidth: number,
  depth: number
): void {
  // For each vertex in the extrusion, find the nearest centerline point
  // and assign its Z value shifted by the vertex's local z (top/bottom face)
  const vertexCount = position.length / 3;
  for (let i = 0; i < vertexCount; i++) {
    const vx = position[i * 3];
    const vy = position[i * 3 + 1];
    const vz = position[i * 3 + 2]; // 0=bottom, depth=top

    // Find nearest centerline point
    const nearestZ = interpolateZAtXY(vx, vy, simplified2D, roadZs);

    // Bottom face stays at nearestZ, top face at nearestZ + depth (ribbon thickness)
    position[i * 3 + 2] = nearestZ + vz;
  }
}
```

**Alternative approach (simpler):** Set `depth` = full road depth/relief (recessed=0.5mm, raised=0.5mm), and position the ribbon at `terrainZ` for the top face of a recessed road. This avoids per-vertex Z lookup but requires knowing whether it's a top/bottom vertex.

**Recommended approach:** Use a constant base Z (average terrain Z for the road segment) and let extrusion depth handle the channel/ridge height. For winding roads on hilly terrain, sample per-segment midpoint elevation and apply to each segment chunk. This balances accuracy vs complexity.

**Confidence:** MEDIUM — the Z approach requires a design decision during implementation; both options are valid.

### Pattern 5: RoadMesh Component (mirrors BuildingMesh.tsx exactly)
**What:** R3F component that reads store state, calls buildRoadGeometry, assigns to mesh ref

```typescript
// Pattern from src/components/Preview/BuildingMesh.tsx
export function RoadMesh() {
  const roadFeatures = useMapStore((s) => s.roadFeatures);
  const roadStyle = useMapStore((s) => s.roadStyle);
  const roadsVisible = useMapStore((s) => s.layerToggles.roads);
  // ... same pattern as BuildingMesh

  useEffect(() => {
    // rebuild geometry when roadFeatures, roadStyle, elevationData, or dimensions change
  }, [roadFeatures, roadStyle, elevationData, ...]);

  return (
    <mesh ref={meshRef} visible={roadsVisible}>
      <meshStandardMaterial color="#555555" side={THREE.DoubleSide} clippingPlanes={clippingPlanes} />
    </mesh>
  );
}
```

### Pattern 6: Export Pipeline (mirrors ExportPanel.tsx buildings inclusion)
**What:** Roads geometry included in STL export alongside terrain and buildings
**Pattern:** Same approach as buildings — if `roadsVisible && roadFeatures?.length > 0`, rebuild road geometry and add to merge list before STL export.

Export merge order: terrainSolid → buildings (if enabled) → roads (if enabled) → STL
Use `mergeGeometries` (not CSG union) for roads — roads are additive, not boolean

**Confidence:** HIGH — established pattern; merge is simpler than CSG and STATE.md explicitly chose vertex displacement + merge for roads

### Pattern 7: Zustand Store Extension (roads state)
**What:** Add `roadFeatures`, `roadStyle`, `roadGenerationStatus` to mapStore.ts
**Note:** Phase 4 already added the `roads` layer toggle in `layerToggles` — that slot is ready.

```typescript
// Add to mapStore.ts
export type RoadStyle = 'recessed' | 'raised' | 'flat';
export type RoadGenerationStatus = 'idle' | 'fetching' | 'building' | 'ready' | 'error';

// In MapState interface:
roadFeatures: RoadFeature[] | null;
roadStyle: RoadStyle;
roadGenerationStatus: RoadGenerationStatus;
roadGenerationStep: string;

// Defaults:
roadFeatures: null,
roadStyle: 'recessed',  // locked decision: default is recessed
roadGenerationStatus: 'idle',
roadGenerationStep: '',
```

### Anti-Patterns to Avoid
- **CSG union for roads + terrain:** O(n²) cost on dense road networks. STATE.md explicitly decided against this. Use mergeGeometries.
- **Fetching roads separately per render:** Fetch once on generation trigger, store in Zustand (same as buildings).
- **Custom ribbon geometry builder:** geometry-extrude handles miter joins at corners. Hand-rolling this is a multi-day spike.
- **Building road mesh in the render thread without useEffect:** R3F rebuilds on every frame if geometry is computed outside useEffect. Always use useEffect + ref pattern from BuildingMesh.tsx.
- **Using GeoJSON coordinates directly (lon/lat) as XY in extrudePolyline:** Must project to UTM first. extrudePolyline uses the coordinate values as-is; WGS84 degrees are not valid XY for mm-space geometry.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Polyline → ribbon mesh | Custom triangle strip code | geometry-extrude extrudePolyline | Miter join math at corners is subtle; handles it correctly with configurable miterLimit |
| OSM data → GeoJSON | Custom JSON parser | osmtogeojson | Already installed; handles Overpass `out geom` JSON → GeoJSON FeatureCollection correctly |
| Road fetching | Custom API wrapper | mirrors buildings/overpass.ts exactly | Same Overpass endpoint, same pattern — no new infrastructure needed |
| Polyline simplification | Custom RDP implementation | simplify-js or geometry-extrude `simplify` option | The RDP algorithm is 10 lines but edge cases (degenerate segments, single-point) cause crashes downstream |

**Key insight:** Every custom geometry problem in this phase already has a solution in the installed stack. The roads layer is architecturally identical to the buildings layer — fetch, parse, project, mesh, store, render, export.

---

## Common Pitfalls

### Pitfall 1: Z Coordinate from extrudePolyline is Flat
**What goes wrong:** geometry-extrude builds the ribbon in the XY plane at Z=0..depth. Terrain Z is not applied automatically.
**Why it happens:** extrudePolyline only knows about 2D centerline coordinates; it has no access to terrain elevation.
**How to avoid:** After calling extrudePolyline, iterate the position Float32Array and add per-vertex terrain Z (sampled from `sampleElevationAtLonLat` at the nearest centerline point). This is the "vertex displacement" approach.
**Warning signs:** All roads appear at Z=0 (flat base of model) in preview.

### Pitfall 2: extrudePolyline Input Format
**What goes wrong:** extrudePolyline expects `polylines` as an array-of-arrays: `[[pt0, pt1, pt2], ...]` (MultiLineString format). Passing a single flat array crashes.
**Why it happens:** The API mirrors GeoJSON MultiLineString geometry.
**How to avoid:** Wrap each road centerline: `extrudePolyline([roadCenterlinePoints], opts)` — note the outer array wrapping a single road.
**Warning signs:** `Cannot read properties of undefined (reading 'length')` from geometry-extrude internals.

### Pitfall 3: WGS84 Coordinates in extrudePolyline
**What goes wrong:** Passing `[lon, lat]` pairs directly to extrudePolyline produces microscopic geometry (degree-scale coordinates vs mm-scale model).
**Why it happens:** extrudePolyline treats the input coordinates as XY values directly; WGS84 degrees are ~0.00001 per meter.
**How to avoid:** Project all coordinates to UTM, subtract bbox center UTM, multiply by `horizontalScale` BEFORE calling extrudePolyline. Same pipeline as buildings/merge.ts `projectRingToMM`.
**Warning signs:** Roads visible only as a single pixel in preview; `lineWidth` appears to have no effect.

### Pitfall 4: osmtogeojson Road Ways as Polygons
**What goes wrong:** Some closed ways with `highway` tags (roundabouts) may be converted to Polygons instead of LineStrings by osmtogeojson.
**Why it happens:** osmtogeojson uses `polygonFeatures` configuration to decide whether closed ways become Polygon or LineString. Roundabouts (`junction=roundabout`) are typically kept as LineStrings.
**How to avoid:** Filter `feature.geometry.type === 'LineString'` in parseRoadFeatures — skip any Polygon features.
**Warning signs:** TypeScript error on `feature.geometry.coordinates` expecting 2D vs 3D coordinate array.

### Pitfall 5: Bridge Z Computation
**What goes wrong:** Bridge segments sampled naively from terrain elevation give the terrain Z below the bridge, making the bridge road look sunken into terrain instead of spanning above it.
**Why it happens:** `sampleElevationAtLonLat` returns the ground elevation — correct for normal roads, wrong for bridges which span above.
**How to avoid:** For `isBridge=true` features, interpolate Z linearly between the start-endpoint terrain Z and end-endpoint terrain Z, then add a bridge lift offset (e.g., +2mm in model space). The CONTEXT.md says "interpolate elevation smoothly between start/end terrain heights."
**Warning signs:** Bridge roads appear to dive through terrain on hilly ground.

### Pitfall 6: Road Toggle Off Leaves Channels
**What goes wrong:** After toggling roads off, the terrain preview still shows indentations where recessed roads were.
**Why it happens:** Recessed channels would only be "real" if the terrain mesh had been modified. Since we use vertex displacement (separate mesh, not CSG), toggling `mesh.visible = false` leaves terrain unchanged — no channels remain.
**How to avoid:** This is actually the CORRECT behavior with vertex displacement. The separate RoadMesh approach means toggling `visible` is sufficient. No cleanup needed.
**Warning signs:** N/A — this pitfall is avoided by the architecture choice.

### Pitfall 7: mergeGeometries Attribute Mismatch
**What goes wrong:** `mergeGeometries` fails or throws when road geometry has different attributes than terrain/buildings (e.g., has `uv` while others don't).
**Why it happens:** geometry-extrude returns `uv` arrays; terrain/buildings geometry may not have `uv`.
**How to avoid:** Before merging for export, delete the `uv` attribute from road geometry (same pattern as buildings/buildingSolid.ts which strips attributes to position+normal). Only `position` and `normal` needed for STL.
**Warning signs:** `mergeGeometries: BufferGeometry's .attributes do not match` console error.

### Pitfall 8: Dense Road Networks Performance
**What goes wrong:** Large cities (NYC, London) can have thousands of road segments → extrudePolyline on each → JS main thread freeze.
**Why it happens:** No web worker yet (Phase 9). Road geometry build is synchronous.
**How to avoid:** Apply simplify-js before extrudePolyline with tolerance ~2m in UTM space. The CONTEXT.md already requires "simplified segments." Accept that Phase 5 runs on main thread (Phase 9 adds workers).
**Warning signs:** UI unresponsive for 5-10 seconds on large urban bboxes.

---

## Code Examples

Verified patterns from official sources and project codebase:

### Three.js BufferGeometry from geometry-extrude output
```typescript
// Source: geometry-extrude README (verified) + Three.js docs
import { extrudePolyline } from 'geometry-extrude';
import * as THREE from 'three';

function buildRibbonGeometry(
  points2D: [number, number][],
  lineWidth: number,
  depth: number
): THREE.BufferGeometry {
  const { position, indices, normal } = extrudePolyline(
    [points2D],  // MultiLineString format: array of polylines
    { lineWidth, depth, miterLimit: 2, excludeBottom: false }
  );

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  return geo;
}
```

Note: `addAttribute` used in old examples is deprecated. Use `setAttribute`. geometry-extrude README shows `addAttribute` but Three.js 0.183+ requires `setAttribute`.

### Overpass Road Query
```typescript
// Bbox order: south,west,north,east (matches existing buildings/overpass.ts)
const query = `[out:json][timeout:60][maxsize:33554432][bbox:${sw.lat},${sw.lon},${ne.lat},${ne.lon}];
(
  way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|residential|unclassified)$"];
);
out geom;`;
```

### osmtogeojson to LineString features
```typescript
// Source: osmtogeojson installed package behavior (confirmed for buildings; same for roads)
import osmtogeojson from 'osmtogeojson';

const geojson = osmtogeojson(osmApiJson);
// geojson.features: highway ways → geometry.type === 'LineString'
// feature.properties.highway === 'motorway' | 'trunk' | 'primary' | etc.
// feature.properties.bridge === 'yes' for bridges
// feature.properties.tunnel === 'yes' for tunnels
// feature.geometry.coordinates: [lon, lat][] (GeoJSON coordinate order)
```

### Elevation Z assignment for road ribbon
```typescript
// Source: mirrors src/lib/buildings/elevationSampler.ts pattern
import { sampleElevationAtLonLat } from '../elevation/elevationSampler';

// For each road vertex in 2D mm space, find corresponding lon/lat
// and sample terrain elevation to compute Z
function assignRoadZ(
  position: Float32Array,
  lonlatCoords: [number, number][],
  bbox: BoundingBox,
  elevData: ElevationData,
  minElevationM: number,
  zScale: number,
  styleOffset: number
): void {
  // position has vertices from extrudePolyline: [x, y, z] triplets
  // We lift each vertex's Z by: terrainZ(nearest_centerline_point) + styleOffset + local_z
  // For simplicity: compute average terrain Z per segment, shift the whole ribbon
}
```

### zScale computation (must match terrain.ts and buildingMesh.ts exactly)
```typescript
// Source: src/lib/mesh/terrain.ts lines 86-111 and src/lib/buildings/merge.ts lines 120-145
// Road zScale MUST be identical to terrain and buildings or roads will float above/below terrain

const horizontalScale = widthMM / geographicWidthM;
const elevRange = elevData.maxElevation - elevData.minElevation;

let zScale: number;
if (elevRange === 0) {
  zScale = horizontalScale * exaggeration;
} else if (targetReliefMM && targetReliefMM > 0) {
  zScale = (targetReliefMM / elevRange) * exaggeration;
} else {
  const naturalHeightMM = elevRange * horizontalScale * exaggeration;
  zScale = naturalHeightMM < 5 ? 5 / elevRange : horizontalScale * exaggeration;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| CSG union for terrain+roads | vertex displacement + mergeGeometries | Phase 4 planning (STATE.md) | Avoid O(n²) CSG cost on dense networks |
| Manual ribbon triangulation | geometry-extrude extrudePolyline | Phase 4 planning (STATE.md) | Handles miter joints automatically |
| Per-feature geometry | Merge all roads into single BufferGeometry | Phase 3 (buildings established pattern) | One draw call; better memory management |

**Decided/locked (not alternatives):**
- geometry-extrude@0.2.1: chosen explicitly in STATE.md Phase 5 entry
- vertex displacement (not CSG): chosen explicitly in STATE.md Phase 5 entry
- mergeGeometries (not CSG union for export): follows STATE.md and Phase 3 fallback pattern

---

## Open Questions

1. **Z assignment implementation detail for geometry-extrude output**
   - What we know: extrudePolyline produces flat geometry at Z=0..depth; we need per-vertex terrain Z
   - What's unclear: Whether to do per-vertex nearest-centerline-point lookup (accurate but expensive) or per-segment average Z (simpler, good enough for short segments)
   - Recommendation: Use per-segment average Z for implementation simplicity. For each road segment pair [p0, p1], compute midpoint lon/lat, sample terrain elevation once, and use that Z for the entire segment's ribbon chunk. For the scale of this project (~0.5–1mm deep channels), sub-segment Z variation is not perceptible at print scale.

2. **simplify-js vs geometry-extrude built-in simplify**
   - What we know: geometry-extrude has a `simplify` option; simplify-js operates in 2D with configurable tolerance
   - What's unclear: geometry-extrude's built-in tolerance coordinate system (is it pre- or post-projection?)
   - Recommendation: Pre-simplify in UTM space with simplify-js for predictable meter-scale tolerance before projection, or just use geometry-extrude's `simplify` option in projected mm space. Given `simplify-js` is not yet installed, try geometry-extrude's built-in `simplify` option first and evaluate quality.

3. **Road depth values in mm and tile width considerations**
   - What we know: CONTEXT.md specifies 0.5–1.0mm depth range for deepest roads; 3 tiers
   - What's unclear: Exact width values in mm for each tier at a typical 150mm model size
   - Recommendation: Highway=1.8mm, Main=1.2mm, Residential=0.7mm at 150mm model width (these should be visible at typical print scales). These are Claude's discretion per CONTEXT.md — validate in preview.

4. **Bridge Z interpolation specifics**
   - What we know: "Interpolate elevation smoothly between start/end terrain heights — road spans above terrain below"
   - What's unclear: How far above terrain should bridges hover (to look like a real bridge vs road on flat terrain)?
   - Recommendation: Use linear interpolation of terrain Z at the two endpoints for the bridge centerline Z, then add a fixed lift of ~2x the road depth (e.g., +1.0–2.0mm in model space) so the bridge span is visually above the terrain below it.

---

## Validation Architecture

> `workflow.nyquist_validation` is **not set** in `.planning/config.json` — the `workflow` key exists but only contains `research`, `plan_check`, and `verifier` keys, not `nyquist_validation`. Skipping Validation Architecture section per instructions.

Actually, re-reading config.json — `workflow.nyquist_validation` is absent (not `false`). The instruction says "skip if false". Since it's absent (not explicitly false), applying judgment: the project uses Vitest and has 115 passing tests, so including the test map is useful to the planner.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.0.0 |
| Config file | vitest.config.ts |
| Quick run command | `npx vitest run` |
| Full suite command | `npx vitest run --reporter=verbose` |
| Estimated runtime | ~1.1 seconds (current 115 tests) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ROAD-01 | parseRoadFeatures correctly classifies highway types and excludes tunnels/footways | unit | `npx vitest run src/lib/roads/__tests__/parse.test.ts` | No — Wave 0 gap |
| ROAD-01 | buildRoadGeometry produces BufferGeometry with position attribute for a simple road | unit | `npx vitest run src/lib/roads/__tests__/roadMesh.test.ts` | No — Wave 0 gap |
| ROAD-02 | roadStyle='recessed' produces negative Z offset; roadStyle='raised' produces positive | unit | `npx vitest run src/lib/roads/__tests__/roadMesh.test.ts` | No — Wave 0 gap |
| ROAD-03 | highway tier road is wider than residential tier road in output geometry | unit | `npx vitest run src/lib/roads/__tests__/roadMesh.test.ts` | No — Wave 0 gap |
| ROAD-01/Export | Road geometry included in STL export when roads layer is enabled | integration/manual | visual verification in slicer | Manual only |

### Wave 0 Gaps (must be created before implementation)
- [ ] `src/lib/roads/__tests__/parse.test.ts` — covers ROAD-01 (parsing, filtering, classification)
- [ ] `src/lib/roads/__tests__/roadMesh.test.ts` — covers ROAD-01, ROAD-02, ROAD-03 (geometry, style, width)
- [ ] `src/lib/roads/` directory — full roads lib module

---

## Sources

### Primary (HIGH confidence)
- geometry-extrude GitHub README (fetched 2026-02-24) — extrudePolyline API, options, return values
- src/lib/buildings/ (project codebase) — established pattern for Overpass fetch, osmtogeojson, projection, mesh build, store integration
- src/store/mapStore.ts (project codebase) — Phase 4 added `roads` toggle; confirmed slot exists
- src/lib/buildings/elevationSampler.ts (project codebase) — bilinear elevation sampling function ready to reuse
- .planning/STATE.md — Phase 5 planning decisions: geometry-extrude@0.2.1, vertex displacement, no CSG for roads
- Three.js docs (setAttribute, BufferGeometry) — confirmed setAttribute API for Three.js 0.183+

### Secondary (MEDIUM confidence)
- Overpass API OSM Wiki — highway query syntax, `out geom` mode, bbox order (south,west,north,east)
- osmtogeojson GitHub — way to GeoJSON LineString conversion, `bridge`/`tunnel` property names
- geometry-extrude npm search results — version 0.2.1 confirmed as latest; last published ~3 years ago

### Tertiary (LOW confidence)
- Width/depth values (1.8mm highway, 1.2mm main, 0.7mm residential, 1.0mm max depth) — from Claude's training + print-scale reasoning; validate in preview
- Bridge lift offset (+1.0–2.0mm) — reasoned from context, no authoritative source; validate visually

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — geometry-extrude, osmtogeojson, and Overpass all verified; buildings pipeline is proven reference
- Architecture: HIGH — pattern established by Phase 3 buildings; roads pipeline is structurally identical
- Z assignment (vertex displacement): MEDIUM — approach is correct per STATE.md; exact implementation detail (per-vertex vs per-segment) deferred to implementation
- Width/depth values: LOW — reasonable estimates; require visual validation in preview

**Research date:** 2026-02-24
**Valid until:** 2026-03-24 (library versions stable; no fast-moving dependencies in this domain)
