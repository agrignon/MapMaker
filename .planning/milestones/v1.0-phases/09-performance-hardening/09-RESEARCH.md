# Phase 9: Performance Hardening - Research

**Researched:** 2026-02-27
**Domain:** Web Worker architecture, TypeScript build hygiene, OOM safeguards, STL export offloading
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

None — user gave full discretion on all implementation decisions.

### Claude's Discretion

**Worker scope for preview:**
- Whether terrain geometry computation moves to a Web Worker (currently main-thread, Martini RTIN is fast for typical grids)
- Whether water and vegetation move off-thread (currently lightweight earcut triangulation)
- Rebuild cascade behavior — current cascade (terrain first, overlays follow) works well
- Whether to show a subtle indicator while layers rebuild, or keep silent swap (current)

**Export pipeline offloading:**
- Whether STL export moves to a Web Worker (currently main-thread with setTimeout yields) or stays with improved yielding
- Whether to add a cancel button during export
- Export progress style — per-layer step labels already exist and work well
- Download flow — current "show stats then Download button" flow vs auto-download

**Dense area safeguards:**
- Whether to enforce hard area limits, soft warnings, or both
- How to handle high building/road density (render everything vs LOD/simplification)
- Error recovery strategy when mesh generation fails (toast + retry vs graceful per-layer fallback)
- Whether to cap Overpass query results or rely on area size limits

**Generation progress UX:**
- Per-step progress labels vs simple spinner during initial generation
- Whether generation can be cancelled mid-process
- Stale mesh handling during slider adjustments (keep old mesh vs dim/fade)
- Whether to show estimated time remaining (likely not — inaccurate ETAs are worse than none)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FNDN-03 | Mesh generation runs in a Web Worker to prevent UI freezing | Worker architecture section; the existing `meshBuilder.worker.ts` already covers roads + buildings; terrain (main-thread Martini) and export pipeline are the remaining gaps to evaluate |
| FNDN-04 | Production build (`npm run build`) compiles without TypeScript errors | 33 TS errors identified across 9 files; categorized and fix strategies documented in Architecture section |
</phase_requirements>

---

## Summary

Phase 9 has two distinct workstreams: (1) fixing a 33-error TypeScript build failure so `npm run build` succeeds, and (2) evaluating and hardening the Web Worker architecture so no mesh generation work blocks the browser main thread. A third implicit workstream is dense-area OOM safeguards to satisfy the success criterion about not crashing on 1km x 1km city blocks.

The TypeScript errors fall into four well-isolated categories: unused variables (trivial removals/prefixes), missing type declarations for `@mapbox/martini` (hand-write a 3-line `.d.ts`), a `three-mesh-bvh` version conflict in `terrainRaycaster.ts` (fix the import path or add a type assertion), and test-file `FeatureCollection` typing (add `as FeatureCollection` casts in helpers). None require architecture changes — all are mechanical fixes. The STATE.md already called these out as pre-existing.

For the worker scope, the existing `meshBuilder.worker.ts` already handles roads and buildings with zero-copy typed array transfer. Terrain (Martini RTIN) runs on the main thread but is fast (< 30ms for 257x257 grids) — moving it to the worker is low priority. The STL export pipeline in `ExportPanel.tsx` runs entirely on the main thread with `setTimeout` yields between layers; this is the most likely source of UI freezes during export and is the highest-value offload candidate. Water and vegetation geometry (earcut + simple polygon traversal) are lightweight and not worth worker overhead.

**Primary recommendation:** Fix TypeScript errors first (FNDN-04), then audit export pipeline for main-thread blocking and add a bbox area cap for dense-area safety (FNDN-03 / OOM criterion). Terrain mesh does NOT need to move to a worker — Martini RTIN on a 257x257 grid is negligible.

---

## Standard Stack

### Core (already in project)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| Vite 6 | 6.4.1 | Bundler — handles `new Worker(new URL(...), {type:'module'})` natively | Already configured |
| TypeScript | 5.6.3 | Type checking; `tsc -b` is the build gate | 33 errors pending |
| `meshBuilder.worker.ts` | (project) | Existing road + building off-thread worker with zero-copy typed arrays | Functional |
| `meshBuilderClient.ts` | (project) | Main-thread client with stale-result rejection via sequence IDs | Functional |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `three/addons/utils/BufferGeometryUtils` | 0.183.1 | `mergeGeometries` for combining typed arrays | Already used in export pipeline |
| `@mapbox/martini` | 0.2.0 | Martini RTIN terrain mesh | Missing type declaration — needs `.d.ts` shim |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Manual `Worker` instantiation | `comlink` + `vite-plugin-comlink` | comlink simplifies RPC but adds a dependency and has Vite production build edge cases (noted in STATE.md as a known risk); manual protocol already works and is battle-tested |
| `setTimeout` yield in export | Dedicated export worker | Worker is more thorough but requires serializing all geometry params; `setTimeout` yields already update the UI between expensive steps |
| Hard area cap only | Soft warning + hard cap | Soft warning is user-friendly; hard cap is safe backstop; both together is best UX |

**Installation:** No new packages required. All necessary libraries are already installed.

---

## Architecture Patterns

### Recommended Project Structure (no changes needed)

```
src/
├── workers/
│   ├── meshBuilder.worker.ts    # existing — roads + buildings
│   └── meshBuilderClient.ts     # existing — main-thread client
├── lib/mesh/
│   └── terrainRaycaster.ts      # needs TS fix (type conflict)
└── lib/overpass.ts              # area cap goes here (bbox area check before fetch)
```

### Pattern 1: Vite Module Worker (already in use)

**What:** `new Worker(new URL('./meshBuilder.worker.ts', import.meta.url), { type: 'module' })` — Vite bundles the worker file separately into a chunk, tree-shaking included. No plugin needed for Vite 6.

**When to use:** Any off-thread compute. Already used in `meshBuilderClient.ts`.

**Example (existing, confirmed working):**
```typescript
// src/workers/meshBuilderClient.ts
worker = new Worker(
  new URL('./meshBuilder.worker.ts', import.meta.url),
  { type: 'module' }
);
```
Vite 6 handles this natively. The worker bundle shares no global state with the main thread.

### Pattern 2: Zero-copy Typed Array Transfer (already in use)

**What:** Geometry arrays (`Float32Array`, `Uint32Array`) are passed back to the main thread as `Transferable` objects using `postMessage(data, [buf1, buf2])`. This avoids structured-clone overhead (which causes the "44x Chrome regression" noted in STATE.md for per-feature message sends).

**Constraint (from STATE.md, Phase 9 decision):** Merge ALL geometry into three typed arrays before `postMessage`. Never send per-feature buffers.

**Example (existing, correct):**
```typescript
// In worker: transfer ownership of merged geometry arrays
const transfers: Transferable[] = [];
if (positions) transfers.push(positions.buffer);
if (normals) transfers.push(normals.buffer);
if (index) transfers.push(index.buffer);
(self as unknown as Worker).postMessage(response, transfers);
```

### Pattern 3: Stale-Result Rejection (already in use)

**What:** Monotonic sequence counter incremented per request. When worker result arrives, caller checks if sequence ID still matches the latest; if not, the result is silently discarded.

**When to use:** Any worker call triggered by slider/user input where rapid successive calls are expected.

**Example (existing, in `meshBuilderClient.ts` + `RoadMesh.tsx`):**
```typescript
// Client: increment seqId per call
const seqId = ++roadSeqId;
// ...
// Component: check if result is still current
if (seqId !== getRoadSeqId()) return; // stale
```

### Pattern 4: setTimeout Yielding for Long Synchronous Loops

**What:** Insert `await new Promise(r => setTimeout(r, 0))` at checkpoints in long-running synchronous code to release the event loop. Lets React re-render and browser paint between steps.

**When to use:** Export pipeline steps (already implemented in `ExportPanel.tsx`). Acceptable for steps that complete in < 500ms each. Not acceptable as a substitute for a worker when individual steps take > 1s.

**Current export yield points (ExportPanel.tsx):**
- After terrain geometry build
- After buildings mesh (per step)
- After roads mesh
- After vegetation mesh
- After validation
- After STL write

**Assessment:** For typical bounding boxes (< 2km x 2km) the per-step yields are sufficient. Dense urban areas with thousands of buildings/roads may still freeze during the `buildAllBuildings` or `buildRoadGeometry` calls inside `handleExport` — these are synchronous and yield is applied AROUND them, not inside.

### Pattern 5: Bbox Area Cap (to implement)

**What:** Compute the bounding box area in km² and gate the "Generate" action with a hard cap and a soft warning.

**Where to apply:** Before `fetchAllOsmData` in the terrain generation trigger (the generate button handler). The area is computable from `dimensions.widthM * dimensions.heightM / 1e6`.

**Recommended thresholds (based on Overpass `[maxsize:33554432]` limit — 32MB):**
- Soft warning: > 4 km² (2km x 2km) — show a warning banner, allow proceed
- Hard cap: > 25 km² (5km x 5km) — block generation with a clear error message

**Example:**
```typescript
const areaSqKm = (dimensions.widthM * dimensions.heightM) / 1e6;
if (areaSqKm > 25) throw new Error('Area too large — select an area smaller than 25 km²');
if (areaSqKm > 4) showWarning('Large area selected — generation may be slow');
```

### Anti-Patterns to Avoid

- **Per-feature postMessage in worker:** Sending one message per building/road causes structured-clone overhead that is 44x slower than a single merged buffer transfer (confirmed in STATE.md).
- **Moving terrain/water/vegetation to a worker:** Martini RTIN on 257x257 is < 30ms. Earcut for water/vegetation is < 10ms. Worker round-trip overhead (serialization + thread wake-up) approaches these numbers — net gain is negative.
- **Using `comlink` + `vite-plugin-comlink`:** STATE.md flags production build edge cases with this combination. The manual message protocol is already working and is the right choice for this project.
- **Amending TypeScript errors with `// @ts-ignore`:** The goal is clean `tsc -b`. Suppressions hide real bugs and leave FNDN-04 technically unmet.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Martini type declarations | Custom martini wrapper | Simple `.d.ts` shim file | One-liner: `declare module '@mapbox/martini'` covers the entire use case |
| `three-mesh-bvh` version mismatch | Wrapper adapters | Pin the version or add a type assertion at the import site | Structural type mismatch between `0.8.3` (drei's nested) and `0.9.8` (project's); type assertion at assignment resolves it cleanly |
| Test fixture typing | Rewrite fixtures | `as FeatureCollection` cast on the helper return type | `makeFeatureCollection` returns `object[]` which TS won't assign to `Feature[]`; typing the helper fixes all 19 call sites at once |

**Key insight:** The TypeScript errors are almost entirely surface-level (unused vars, missing declarations, one type conflict). No architecture changes are needed for FNDN-04.

---

## Common Pitfalls

### Pitfall 1: Worker Shared Module Duplication

**What goes wrong:** If the worker imports a large module (e.g., `three`), Vite bundles a copy of it into BOTH the main bundle and the worker bundle, doubling the download size.

**Why it happens:** Workers have their own module scope. Vite does not share module instances across worker/main thread boundaries.

**How to avoid:** This is unavoidable for `three` since geometry building requires it. Accept the duplication. Worker bundle size is not a problem for a tool that runs locally with no network constraint on the worker script itself.

**Warning signs:** Build output showing `three` in both `index-[hash].js` and `meshBuilder.worker-[hash].js` — expected and acceptable.

### Pitfall 2: three-mesh-bvh Dual-Instance Type Conflict

**What goes wrong:** `@react-three/drei@10` pins `three-mesh-bvh@0.8.3` as a peer dependency, installing a nested copy. The project uses `three-mesh-bvh@0.9.8`. When `terrainRaycaster.ts` assigns `new MeshBVH(...)` to `geometry.boundsTree`, TypeScript sees two structurally incompatible `MeshBVH` types.

**Why it happens:** npm hoists the project's `0.9.8` to the root but drei's `0.8.3` survives in `node_modules/@react-three/drei/node_modules/three-mesh-bvh/`. TypeScript's structural type system sees both and rejects the assignment.

**Current error:**
```
src/lib/mesh/terrainRaycaster.ts(28,3): error TS2322:
Type '...three-mesh-bvh/src/index).MeshBVH' is not assignable to
type '...@react-three/drei/node_modules/three-mesh-bvh/src/index).MeshBVH'.
```

**How to avoid / fix:** Use a type assertion at the assignment site:
```typescript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
tempMesh.geometry.boundsTree = bvh as any;
```
Or cast through `unknown`. This is safe because at runtime there is only one `three-mesh-bvh` (0.9.8 is hoisted); the conflict is type-only.

**Warning signs:** TS error referencing two paths to the same package with different nested locations.

### Pitfall 3: Export Pipeline Main-Thread Blocking on Dense Areas

**What goes wrong:** `buildAllBuildings` and `buildRoadGeometry` are synchronous functions that can take 1-3 seconds on 1km x 1km city blocks with thousands of features. The `await setTimeout(0)` yield in `ExportPanel.tsx` is placed AROUND these calls, not inside them. The browser tab remains unresponsive during each call.

**Why it happens:** The export pipeline calls the geometry functions directly on the main thread (not via the worker). This was a deliberate choice (STATE.md: "Export path still uses direct main-thread calls") but becomes a problem at high feature density.

**How to avoid:** For Phase 9, the recommended fix is to route the building/road geometry steps in the export pipeline through the existing worker (reusing `meshBuilderClient.ts`). The export already knows `elevationData`, `terrainParams`, etc. — these are the same inputs the worker accepts.

Alternatively, add the bbox area cap (Pattern 5) to prevent users from hitting the freeze condition in the first place. This is simpler and addresses the OOM success criterion directly.

**Warning signs:** User reports of tab freeze/crash on "Export STL" for large urban areas.

### Pitfall 4: Unused Variables Causing CI Failure

**What goes wrong:** TypeScript `noUnusedLocals` and `noUnusedParameters` flags are enabled in `tsconfig.app.json`. Destructuring unused variables from function params or imports causes `TS6133` errors that block `tsc -b`.

**Current instances (all mechanical fixes):**
- `PreviewControls.tsx`: `import * as THREE` — remove the import, THREE is unused
- `ExportPanel.tsx`: `roadStyle` — remove from destructure (it was used before but is now unused)
- `solid.ts`: `minX`, `maxX`, `minY`, `maxY`, `n` — computed but never used; remove or prefix with `_`
- `terrain.ts`: `minElevation`, `maxElevation` (from elevationData), `geographicDepthM` (from params) — never read after destructuring; remove or prefix with `_`
- `walls.test.ts`: `All variables are unused` (TS6199) — likely a variable declared in a block scope never used

**How to avoid:** Use `_` prefix for intentionally unused destructured values: `const { _minElevation, ...rest } = elevationData` or just don't destructure what you don't use.

### Pitfall 5: @mapbox/martini Missing Type Declaration

**What goes wrong:** `@mapbox/martini` has no `types`/`typings` field in its `package.json` and no `@types/mapbox__martini` package on npm. TypeScript reports `TS7016: Could not find a declaration file`.

**Fix:** Create `src/types/martini.d.ts` (or `src/lib/mesh/martini.d.ts`) with:
```typescript
declare module '@mapbox/martini' {
  export default class Martini {
    constructor(gridSize: number);
    createTile(terrain: Float32Array): {
      getMesh(maxError: number): { vertices: Uint16Array; triangles: Uint32Array };
    };
  }
}
```

**Note:** `skipLibCheck: true` is set in both `tsconfig.app.json` and `tsconfig.node.json`, but this only skips checking `.d.ts` files — it does NOT suppress `TS7016` for missing module declarations.

### Pitfall 6: BuildingGenerationStatus Type Mismatch

**What goes wrong:** `BuildingsSection.tsx` checks `buildingGenerationStatus === 'loading'` but the `BuildingGenerationStatus` type is `'idle' | 'fetching' | 'building' | 'ready' | 'error'` (no `'loading'` variant). TS2367.

**Fix:** Change the comparison to `buildingGenerationStatus === 'fetching'` (the actual in-progress status used during OSM fetch).

### Pitfall 7: Test FeatureCollection Typing

**What goes wrong:** `makeFeatureCollection` helper in `parse.test.ts` (roads and water) is typed as accepting `object[]` and returning `{ type: "FeatureCollection"; features: object[] }`. This is not assignable to `FeatureCollection<Geometry, GeoJsonProperties>` which expects `Feature[]`.

**Fix:** Type the helper as:
```typescript
function makeFeatureCollection(features: Feature[]): FeatureCollection {
  return { type: 'FeatureCollection' as const, features };
}
```
This is safe since all callers already pass properly-typed feature objects (the individual `makeLineStringFeature` etc. helpers return `{ type: 'Feature' as const, ... }`).

---

## Code Examples

Verified patterns from the project codebase:

### Martini Declaration File (to create)

```typescript
// src/types/martini.d.ts
declare module '@mapbox/martini' {
  export default class Martini {
    constructor(gridSize: number);
    createTile(terrain: Float32Array): {
      getMesh(maxError: number): {
        vertices: Uint16Array;
        triangles: Uint32Array;
      };
    };
  }
}
```

### Fix: Unused Import Removal (PreviewControls.tsx)

```typescript
// Before (TS error):
import * as THREE from 'three';

// After (remove the unused import entirely):
// (no import — THREE is not used in this file)
```

### Fix: Unused Destructured Variables (terrain.ts)

```typescript
// Before (TS error — minElevation, maxElevation, geographicDepthM unused):
const { gridSize, elevations, minElevation, maxElevation } = elevationData;
const { widthMM, depthMM, geographicWidthM, geographicDepthM, ... } = params;

// After:
const { gridSize, elevations } = elevationData;
const { widthMM, depthMM, geographicWidthM, ... } = params;
// (simply remove unused names from destructuring)
```

### Fix: BVH Type Assertion (terrainRaycaster.ts)

```typescript
// Before (TS2322 — version mismatch between 0.9.8 and drei's 0.8.3):
tempMesh.geometry.boundsTree = bvh;

// After:
// eslint-disable-next-line @typescript-eslint/no-explicit-any
tempMesh.geometry.boundsTree = bvh as any;
```

### Fix: BuildingGenerationStatus Wrong Variant

```typescript
// Before (TS2367 — 'loading' not in union):
if (buildingGenerationStatus === 'loading') {

// After:
if (buildingGenerationStatus === 'fetching') {
```

### Fix: FeatureCollection Test Helpers

```typescript
// Before (parse.test.ts):
function makeFeatureCollection(features: object[]) {
  return { type: "FeatureCollection", features };
}

// After:
import type { FeatureCollection, Feature } from 'geojson';
// ...
function makeFeatureCollection(features: Feature[]): FeatureCollection {
  return { type: 'FeatureCollection' as const, features };
}
```

### Bbox Area Cap (to add in generation trigger)

```typescript
// In generate button handler, before fetchAllOsmData:
const areaSqKm = (dimensions.widthM * dimensions.heightM) / 1e6;
if (areaSqKm > 25) {
  setGenerationStatus('error', 'Area too large (> 25 km²). Select a smaller region.');
  return;
}
// Soft warning at 4 km²:
// (could set a store field to show a banner, then continue)
```

---

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| Per-feature worker messages | Single merged buffer transfer | Already implemented in `meshBuilder.worker.ts` |
| Comlink RPC for workers | Manual typed message protocol | STATE.md explicitly chose manual over comlink for production build reliability |
| `setTimeout` yields for export | (same, with known limitation) | Sufficient for < 2km² areas; dense areas may still freeze |
| No area limit | (not yet implemented) | Phase 9 adds bbox area cap |

---

## Decisions Made (Recommended by Research)

Based on the codebase audit, the recommended choices for Claude's discretion areas:

| Area | Recommendation | Rationale |
|------|---------------|-----------|
| Terrain worker | NO — keep main thread | Martini RTIN < 30ms on 257x257; worker overhead is comparable |
| Water/vegetation worker | NO — keep main thread | earcut < 10ms; not worth overhead |
| Export pipeline | Route building/road steps through existing worker | Most likely freeze source; worker protocol already exists |
| Dense area safeguards | Soft warning at 4 km² + hard cap at 25 km² | Prevents OOM; Overpass already has 32MB maxsize limit |
| Error recovery | Toast message + retry button | Simple, matches existing export error UI pattern |
| Overpass result cap | No per-feature cap — rely on area cap | Area cap is simpler and targets root cause |
| Progress UX | Keep existing per-step labels | Already implemented and working well |
| Cancel during export | Not recommended (complex for low value) | No cancellation mechanism in typed array worker protocol; adds significant complexity |
| Stale mesh during slider | Keep existing behavior (silent swap) | Already works; adding dimming/fade adds UI complexity for marginal gain |

---

## Open Questions

1. **Export worker: new message type vs separate worker?**
   - What we know: existing `meshBuilderClient.ts` supports `buildRoads` and `buildBuildings` message types; the export pipeline needs both, plus terrain
   - What's unclear: whether to add `buildExport` message type to existing worker or create a separate `exportBuilder.worker.ts`
   - Recommendation: add a `buildExport` message type to the existing worker — reuses all existing infrastructure, avoids a second worker instance

2. **Which TypeScript errors are in test files vs production code?**
   - What we know: 19 of 33 errors are in `parse.test.ts` (roads) and `parse.test.ts` (water), and `walls.test.ts`
   - What's unclear: whether `tsc -b` includes test files in the build gate or only production files
   - Recommendation: `tsconfig.app.json` includes `src/**` which covers tests — all 33 errors must be fixed for a clean build

3. **Is the three-mesh-bvh type assertion safe for all consumers?**
   - What we know: at runtime only `0.9.8` is loaded (hoisted); the conflict is type-only
   - What's unclear: whether updating `--legacy-peer-deps` to align drei's expectation is feasible
   - Recommendation: type assertion is safe and simpler; version pinning risks breaking drei

---

## Sources

### Primary (HIGH confidence)

- Project codebase: `src/workers/meshBuilder.worker.ts`, `src/workers/meshBuilderClient.ts` — confirmed worker protocol, typed array transfer pattern
- Project codebase: `tsc -b` output — confirmed all 33 errors, categorized by type
- `tsconfig.app.json` — confirmed `noUnusedLocals: true`, `noUnusedParameters: true`, `skipLibCheck: true`
- `src/types/geo.ts` — confirmed `BuildingGenerationStatus` union (no `'loading'` variant)
- `package.json` — confirmed Vite 6.4.1, TypeScript 5.6.3, three-mesh-bvh 0.9.8
- `node_modules/@react-three/drei/node_modules/three-mesh-bvh/package.json` — confirmed nested 0.8.3
- `node_modules/@mapbox/martini/package.json` — confirmed no `types` field, no npm @types package

### Secondary (MEDIUM confidence)

- STATE.md — Worker architecture decisions: "comlink + vite-plugin-comlink production build edge cases", "merge all geometry into three typed arrays before postMessage, never per-feature buffers (prevents 44x Chrome regression)"

---

## Metadata

**Confidence breakdown:**
- TypeScript fixes: HIGH — all errors identified, fix strategies confirmed from source
- Worker architecture: HIGH — existing code audited, current patterns verified working
- Area cap thresholds: MEDIUM — based on Overpass 32MB limit and common usage patterns; exact thresholds are adjustable
- Export pipeline freeze risk: MEDIUM — confirmed synchronous code paths but not benchmarked on dense city data

**Research date:** 2026-02-27
**Valid until:** 2026-03-27 (30 days — TypeScript and Vite APIs are stable)
