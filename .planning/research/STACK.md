# Stack Research

**Domain:** Map-to-3D-printable-STL web application — Milestone additions (roads, water, vegetation, mesh smoothing, Web Workers)
**Researched:** 2026-02-24
**Confidence:** HIGH for Web Worker approach; HIGH for road geometry; MEDIUM for mesh smoothing (implementation is custom, no dominant library)

---

> **Scope note:** This document covers ONLY the new stack additions for the current milestone.
> The existing validated stack (Vite 6, React 19, TypeScript, Tailwind v4, MapLibre GL JS, Three.js 0.183, Zustand, @mapbox/martini, earcut 3, proj4, osmtogeojson, three-bvh-csg, manifold-3d) is not re-researched here.

---

## Recommended Stack — New Additions

### Roads: Polyline-to-Mesh Extrusion

| Library | Version | Purpose | Why Recommended |
|---------|---------|---------|-----------------|
| `geometry-extrude` | `^0.2.1` | Convert OSM road LineString coordinates to extruded 3D ribbon meshes with configurable width | Returns `{indices, position, normal, uv}` TypedArrays that wire directly into `THREE.BufferGeometry` with no intermediate conversion. Handles miter joints at road bends automatically. The `extrudePolyline(coords, { lineWidth, miterLimit })` API matches exactly the OSM road use case. earcut is its only dependency (already in the project). |

**Integration pattern:**
```typescript
import { extrudePolyline } from 'geometry-extrude';

const { indices, position, normal } = extrudePolyline(roadCoords, {
  lineWidth: roadWidthInModelUnits,
  miterLimit: 2,
});
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
geo.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
geo.setIndex(new THREE.Uint32BufferAttribute(indices, 1));
```

**Earcut version note (HIGH confidence):** `geometry-extrude@0.2.1` declares `"earcut": "^2.1.3"` as a dependency. The project already has `earcut@3.0.2` installed. npm will install earcut 2.x separately inside `node_modules/geometry-extrude/node_modules/` to satisfy its peer constraint. This is normal npm deduplication behavior — no conflict, two copies. No action required.

### Water Bodies: No New Library Needed

Water body depressions (rivers, lakes, ocean) use the same OSM polygon pipeline that buildings already use:

1. Overpass query for `natural=water`, `waterway=riverbank`, `natural=coastline` within the bounding box (already done via `osmtogeojson`).
2. `earcut` triangulates the water polygon (already installed at 3.0.2).
3. Custom vertex displacement: find terrain mesh vertices within the polygon bounds, clamp their Z to a flat water-level elevation.
4. `three-bvh-csg` can perform a boolean subtraction if depression geometry is needed for STL watertightness (already installed).

**No new library required.** This is a data query + vertex manipulation problem, not a new geometry primitive problem.

### Vegetation/Parks: No New Library Needed

Parks and forest areas follow the same extruded-polygon pipeline as buildings:

1. Overpass query for `leisure=park`, `landuse=forest`, `landuse=grass` etc. (extend existing Overpass queries).
2. `earcut` triangulates the footprint polygon (already installed).
3. `geometry-extrude` `extrudePolygon()` builds a thin prism (low depth) placed on the terrain surface.

**No new library required.** The vegetation layer reuses road/building geometry infrastructure with different Overpass tags and extrusion depth.

### Terrain Mesh Smoothing: Custom Implementation (No Library)

There is no dominant npm library for height-field Gaussian smoothing that is maintained, TypeScript-native, and suitable for a Float32Array grid. The correct approach is a custom implementation:

| Technique | What It Is | Why Use It |
|-----------|-----------|-----------|
| Separable box/Gaussian filter on height grid | 2-pass 1D convolution (horizontal then vertical) on the raw elevation `Float32Array` before passing to `@mapbox/martini` | Operates directly on the existing elevation grid data structure. Zero new dependencies. Controllable via a single `radius` parameter (0 = raw DEM, 1–5 = progressively smoother). Separable passes are O(n·r) not O(n·r²) so stays fast for large grids. |

**Why NOT `three-subdivide`:** Loop subdivision works on triangle connectivity and applies curvature-based smoothing — it will cause noticeable tearing on flat grid geometries and is not designed for height field data. Published Aug 2023, no updates since. The problem it solves is organic model smoothing, not terrain DEM smoothing.

**Why NOT a general signal-processing library:** The height array is a simple 2D grid of `Float32` values. A custom 3×3 or 5×5 Gaussian kernel is 30 lines of TypeScript and runs in < 1ms for a 512×512 grid. Adding a dependency for this is unjustified.

**Implementation sketch:**
```typescript
function smoothHeightGrid(
  heights: Float32Array,
  width: number,
  height: number,
  radius: number   // 0 = off, 1-5 = strength
): Float32Array {
  if (radius === 0) return heights;
  const out = new Float32Array(heights.length);
  // Pass 1: horizontal box filter
  // Pass 2: vertical box filter on Pass 1 output
  // Each pass: for each cell, average neighbors within [-radius, +radius]
  return out;
}
```
The slider in the UI maps to `radius` (integer 0–5). This runs synchronously or can be offloaded to the Web Worker (see below).

### Web Worker for Mesh Generation

| Approach | Recommended? | Why |
|----------|-------------|-----|
| Native Vite Web Worker (`new Worker(new URL(...), { type: 'module' })`) | Yes — base approach | Vite 6 handles this natively with no plugin. Workers compile TypeScript, support ESM imports, are bundled correctly for production. URL must be static string literal. |
| `comlink@4.4.2` + `vite-plugin-comlink@5.3.0` | Yes — add on top of native | Comlink eliminates the `postMessage`/`onmessage` boilerplate. Worker functions become async-callable from the main thread with proper TypeScript types. `vite-plugin-comlink@5.3.0` requires `comlink@^4.3.1` as a peer dep (satisfied by 4.4.2). Compatible with `vite>=2.9.6` (project uses Vite 6). |

**Recommended combination:** `comlink` + `vite-plugin-comlink`. The ergonomics improvement for this use case (calling async `generateMesh()` from a React component, receiving back `ArrayBuffer`s) is significant enough to justify the small dependency.

**What to offload to the worker:**
- Elevation grid smoothing (`smoothHeightGrid`)
- `@mapbox/martini` mesh generation
- Road/building/vegetation geometry computation (`geometry-extrude` calls, `earcut` triangulation)
- STL serialization (final `STLExporter` call, which serializes potentially large geometry)

**What stays on the main thread:**
- Overpass API fetch calls (HTTP is async by nature, no benefit to worker)
- MapTiler tile fetch + RGB decode (already async, minimal CPU)
- Three.js `BufferGeometry` object construction (Three.js objects are not `Transferable`; pass raw `ArrayBuffer` from worker, build geometry on main thread)

**Vite config addition:**
```typescript
// vite.config.ts
import comlink from 'vite-plugin-comlink';
export default {
  plugins: [comlink(), react()],
  worker: {
    plugins: () => [comlink()],
  },
};
```

**tsconfig addition:**
```json
// vite-env.d.ts (or global.d.ts)
/// <reference types="vite-plugin-comlink/client" />
```

## Installation

```bash
# Road geometry extrusion (only new runtime dependency)
npm install geometry-extrude

# Web Worker ergonomics
npm install comlink
npm install -D vite-plugin-comlink
```

No new libraries needed for water bodies, vegetation, or terrain smoothing — these use existing dependencies.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `geometry-extrude` for road mesh | Three.js `ExtrudeGeometry` with `Shape` + `Path` | `ExtrudeGeometry` works but requires converting polyline to `THREE.Shape` manually, does not handle miter joints at road bends, produces more vertices. Use if `geometry-extrude` causes build issues due to earcut version conflict. |
| `geometry-extrude` for road mesh | Custom ribbon mesh from scratch | Use only if road geometry needs to drape exactly on terrain surface (projected along Z from terrain height) — `geometry-extrude` produces flat XY ribbons that need post-processing elevation adjustment anyway. A custom implementation could do both in one pass. If draping complexity is high, go custom. |
| Custom Gaussian height-field smoothing | `three-subdivide@1.1.5` | Do not use — causes tearing on flat grid geometries, last updated Aug 2023, designed for organic mesh smoothing not height field DEM smoothing. |
| `comlink` + `vite-plugin-comlink` | Raw `postMessage` / `onmessage` | Use raw postMessage only if the worker API is trivially simple (single function, single return). For this project with multiple mesh generation functions and TypeScript types, Comlink is the correct choice. |
| `comlink` + `vite-plugin-comlink` | Vite native `?worker` import | Native `?worker` import works fine for basic cases. The difference is that `vite-plugin-comlink` additionally transforms the worker module to expose Comlink's `Remote<T>` types, eliminating manual `postMessage` serialization. |

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `three-geo` | Unmaintained (last release 2022), requires Mapbox tiles. | Already excluded; use Overpass API + custom geometry code. |
| `turf.js` | 68 KB+ bundle even tree-shaken. For this project the only needed geo operations are coordinate projection (proj4 already installed) and polygon bounding box checks (3 lines of math). Turf adds significant bundle size for minimal benefit. | proj4 (already installed) + inline math. |
| Any general-purpose mesh smoothing npm library | No maintained, TypeScript-native library exists that targets height-field DEM data specifically. Available options are Python-oriented (meshpro/optimesh), academic implementations (Laplacian-Mesh-Smoothing), or unmaintained. | Custom separable Gaussian convolution on the Float32Array height grid. |
| `worker-loader` (webpack) | Project uses Vite, not webpack. webpack plugins are incompatible. | Vite native worker support + `vite-plugin-comlink`. |
| `Workbox` / service worker libraries | Workbox is for offline PWA caching, not computation offloading. | `comlink` for computation offloading. |

## Stack Patterns by Feature

**Roads (OSM highway ways):**
- Overpass query → `osmtogeojson` → `GeoJSON.MultiLineString.coordinates` → `geometry-extrude.extrudePolyline()` → `THREE.BufferGeometry` (width driven by `highway` tag value)
- Road style (recessed/raised/flat) controlled by Z-offset applied after mesh generation, before terrain CSG

**Water (OSM natural=water, waterway=riverbank):**
- Overpass query → `osmtogeojson` → `GeoJSON.MultiPolygon.coordinates` → earcut triangulation → flat mesh at water-level Z
- For STL export: use `three-bvh-csg` boolean subtraction to cut depression into terrain mesh (same pattern as buildings)
- Alternative simpler: stamp water-level Z onto terrain vertices inside polygon bounds (no new geometry, less watertight but simpler)

**Vegetation (OSM landuse=forest, leisure=park):**
- Overpass query → `osmtogeojson` → `GeoJSON.MultiPolygon.coordinates` → `geometry-extrude.extrudePolygon({ depth: 1-3mm equivalent })` → thin prism mesh placed on terrain surface
- Toggled as a layer (Zustand store flag)

**Terrain smoothing:**
- DEM elevation `Float32Array` → `smoothHeightGrid(heights, w, h, radius)` → `@mapbox/martini` mesh generation
- Slider (0–5) maps to `radius` parameter; 0 bypasses smoothing entirely for performance
- Run inside Web Worker alongside martini call

**Web Worker wiring:**
```
React component → comlink ComlinkWorker → worker.ts exposes { generateMesh }
generateMesh({ bbox, features, smoothing, dimensions }) →
  [fetch elevation, fetch OSM data] →
  smoothHeightGrid → martini → extrudePolyline/extrudePolygon → earcut →
  returns { terrainBuffer, buildingBuffer, roadBuffer, waterBuffer, vegetationBuffer }
→ main thread builds THREE.BufferGeometry from ArrayBuffers →
→ STLExporter serializes merged geometry
```

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `geometry-extrude@0.2.1` | `earcut@^2.1.3` (installs its own) | Project has earcut@3.0.2 at root; geometry-extrude will get earcut 2.x in its own node_modules. npm handles this automatically. Earcut 3.x is ESM-only; 2.x is CJS — different module systems, no conflict. |
| `comlink@4.4.2` | `vite-plugin-comlink@5.3.0` | vite-plugin-comlink requires `comlink@^4.3.1` — satisfied by 4.4.2. |
| `vite-plugin-comlink@5.3.0` | `vite>=2.9.6` | Project uses Vite 6.0.5 — compatible. Plugin must appear before React plugin in `plugins` array. |
| `geometry-extrude@0.2.1` | `three@0.183.x` | No direct three.js dependency in geometry-extrude. Output TypedArrays are agnostic to Three.js version. Compatible. |

## Sources

- [geometry-extrude GitHub README](https://github.com/pissang/geometry-extrude) — extrudePolyline/extrudePolygon API, TypedArray output format (HIGH confidence, official repo)
- `npm info geometry-extrude` — v0.2.1 latest, last modified 2022-07-21, `earcut@^2.1.3` dependency (HIGH confidence, direct npm registry query)
- `npm info comlink` — v4.4.2 latest, last modified 2024-11-07 (HIGH confidence, direct npm registry query)
- `npm info vite-plugin-comlink` — v5.3.0 latest, peer deps `comlink@^4.3.1`, `vite>=2.9.6` (HIGH confidence, direct npm registry query)
- [Vite Web Workers docs](https://vite.dev/guide/features.html) — native `new Worker(new URL(...))` pattern, TypeScript support, production build behavior (HIGH confidence, official Vite docs)
- [vite-plugin-comlink GitHub](https://github.com/mathe42/vite-plugin-comlink) — plugin config pattern, vite.config.ts setup, TypeScript types path (MEDIUM confidence, WebSearch verified)
- [earcut GitHub Releases](https://github.com/mapbox/earcut/releases) — 3.0.0 is ESM-only, breaks CJS consumers; 2.2.4 last CJS release (HIGH confidence, official repo)
- `npm info three-subdivide` — v1.1.5, last modified 2023-08-03; unsuitable for height-field terrain (HIGH confidence — metadata confirmed, suitability assessed from documentation)
- [THREE.Terrain GitHub](https://github.com/IceCreamYou/THREE.Terrain) — includes height field smoothing reference implementation (MEDIUM confidence — WebSearch, older project)
- [Box Filtering Height Maps for Smooth Rolling Hills — GameDev.net](https://www.gamedev.net/tutorials/programming/general-and-gameplay-programming/box-filtering-height-maps-for-smooth-rolling-hills-r2164/) — separable box filter for height field smoothing rationale (MEDIUM confidence — WebSearch, classic technique article)

---
*Stack research for: MapMaker milestone — roads, water, vegetation, mesh smoothing, Web Workers*
*Researched: 2026-02-24*
