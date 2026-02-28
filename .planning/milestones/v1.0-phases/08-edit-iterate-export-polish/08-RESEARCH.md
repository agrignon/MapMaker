# Phase 8: Edit-Iterate + Export Polish - Research

**Researched:** 2026-02-27
**Domain:** React state management, geocoding API integration, watertight mesh validation
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Back-to-edit navigation**
- "Back to Edit" button placed in the **preview sidebar header** (top of the right-side controls panel)
- Clicking it hides the preview panel, expanding the map to full width (same `showPreview` toggle mechanism)
- Split layout is preserved — map stays visible on the left while previewing on the right
- Bounding box remains **editable while previewing** — user can drag/resize bbox on the map with the preview open

**Bbox change + stale indicator**
- When the user moves or resizes the bbox while preview is open, the old preview stays visible but a **stale indicator** appears (e.g., "Area changed — Regenerate")
- Only bbox changes trigger the stale indicator — settings like exaggeration, smoothing, layer toggles, road style, and dimensions continue updating the preview live as they do today
- Success criterion #2 ("preview updates automatically without manual regenerate") is satisfied by the existing live reactivity for settings; bbox changes require manual regenerate via the stale indicator

**STL filename — location name**
- Wire the geocoding search result name into `setLocationName()` in the store (currently never called)
- When the user doesn't use search (draws bbox manually), **reverse geocode the bbox center** at generate time to always provide a location-based filename
- Filename format: location + layer suffixes (no physical dimensions in filename). Existing `generateFilename()` function handles this
- Coordinate-based fallback only if reverse geocode fails

**Watertight STL export**
- **Fix geometry construction** — audit and fix mesh construction (terrain solid, buildings, roads, vegetation) so they produce watertight geometry by construction
- **Post-export validation** — add a validation pass after STL generation that detects non-manifold edges, open boundaries, and holes
- **Block download on failure** — if validation detects non-manifold geometry, do NOT offer the download. Show error details. Only allow download of clean, watertight geometry
- Both approaches (fix construction + validate) — belt and suspenders

### Claude's Discretion
- Preview teardown vs hide-in-memory on "Back to Edit" — choose based on performance/complexity
- Stale indicator visual treatment — banner vs overlay, whatever fits existing UI style
- Which part of geocoding result to use for filename (place name, place+country, full text) — pick best balance of specificity and filename length
- Watertight validation algorithm and repair strategy — choose based on what's practical in-browser

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PREV-03 | User can go back from 3D preview to editing without losing selections or settings | Zustand store persists all state; `setShowPreview(false)` restores map-full-width layout. Stale indicator needs a `bboxVersion` counter to detect bbox changes after generation |
| PREV-04 | 3D preview updates when user toggles features or changes settings | Already working via React reactivity to Zustand store. Phase 8 only needs to verify and document this — no new implementation. Bbox changes go via stale indicator path |
| EXPT-06 | Exported STL filename includes the searched location name when available (not just coordinates) | `setLocationName()` and `generateFilename()` exist and are connected. Only wiring needed: GeocodingControl `onPick` callback → `setLocationName()`, and reverse geocode fetch in `handleGenerate()` |
</phase_requirements>

---

## Summary

Phase 8 is a UI polish and wiring phase, not a new feature phase. All the hard infrastructure exists: Zustand `locationName` + `setLocationName()` never called, `generateFilename()` handles slugification, `showPreview` toggle already controls layout. The three main work items are (1) wiring "Back to Edit" button + stale bbox indicator, (2) wiring location name from geocoding search + reverse geocode fallback, and (3) auditing + hardening the watertight export pipeline.

The biggest technical unknown is the watertight audit. The CONTEXT.md says "fix geometry construction", but the existing codebase already has `validateMesh()` (manifold-3d + boundary-edge fallback) and blocks terrain-only non-manifold exports. The validation currently allows feature-seam non-manifold with a warning. Phase 8 tightens this to block-on-failure for all geometry, and audits `buildSolidMesh`, `buildAllBuildings`, road mesh, and vegetation export for construction gaps. Given the CSG pipeline (`csgUnion`) is already in place, the main gaps are likely in vegetation side-wall winding and road cap geometry.

For the stale indicator, the cleanest implementation is a `generatedBboxKey` stored in the store at generate time, compared against the current `bbox` at render time. When they differ and `showPreview === true`, render the stale banner.

**Primary recommendation:** Implement in three focused plans — (1) Back-to-Edit + stale indicator, (2) Location name wiring + reverse geocode, (3) Watertight audit + download gating.

---

## Standard Stack

### Core (all already installed — no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Zustand | ^5.0.3 | Store: `locationName`, `setLocationName`, `showPreview`, `setShowPreview`, `setBbox` | Already the project state layer; no additions needed |
| @maptiler/geocoding-control | ^2.1.7 | `GeocodingControl` `onPick` callback delivers `Feature` with `place_name` and `text` | Already installed; `onPick` receives `{ feature: Feature | undefined }` |
| manifold-3d | ^3.3.2 | Watertight validation — `Manifold.status()` returns 0 for clean mesh | Already in `validate.ts`; LazyLoaded |
| three-bvh-csg | ^0.0.18 | CSG union for watertight merging of terrain+features | Already used in `buildingSolid.ts` `csgUnion()` |
| MapTiler Reverse Geocoding REST API | N/A | `GET /geocoding/{lon},{lat}.json?key={key}` → JSON with `features[0].place_name` | No library needed; plain `fetch()` |

**Installation:** No new packages required for Phase 8.

---

## Architecture Patterns

### Recommended Project Structure

No new directories. All Phase 8 changes are in existing files:

```
src/
├── store/mapStore.ts           # Add: generatedBboxKey (string | null) field + action
├── components/
│   ├── Map/SearchOverlay.tsx   # Wire onPick → setLocationName()
│   ├── Preview/
│   │   ├── PreviewSidebar.tsx  # Add "Back to Edit" button in header
│   │   └── PreviewCanvas.tsx   # Add stale indicator component (or near SplitLayout)
│   └── Sidebar/GenerateButton.tsx  # Add reverse geocode call, set generatedBboxKey
└── lib/
    ├── export/
    │   └── validate.ts         # Tighten: block-on-failure for all geometry, not just terrain-only
    └── mesh/
        ├── solid.ts            # Audit side-wall winding for manifold correctness
        └── buildingSolid.ts    # Already robust; verify CSG path coverage
```

### Pattern 1: Back-to-Edit Button

**What:** A button in the PreviewSidebar header that calls `setShowPreview(false)`. The Zustand store already preserves all state — `bbox`, `elevationData`, `layerToggles`, `roadStyle`, `dimensions`, etc. The preview panel hides but nothing resets. When `showPreview` becomes false, `SplitLayout` renders the map at 100% width (existing behavior).

**When to use:** User is in preview mode and wants to return to editing.

**Implementation:**
```typescript
// In PreviewSidebar.tsx header section:
import { useMapStore } from '../../store/mapStore';

const setShowPreview = useMapStore((s) => s.setShowPreview);

// In JSX header:
<button
  onClick={() => setShowPreview(false)}
  style={{ /* fits existing dark theme */ }}
>
  ← Back to Edit
</button>
```

**Teardown vs hide-in-memory decision:** Keep the R3F Canvas mounted (hide-in-memory). Tearing down would require re-building BVH raycasters and re-running the worker on return. The current `SplitLayout` already conditionally renders the preview panel — switch to CSS `display:none` or keep the conditional render but add `visibility: hidden` to avoid teardown. Actually, the existing `showPreview && (...)` in SplitLayout already unmounts the panel. To preserve R3F canvas state, change to always-render with `visibility: hidden` / `pointer-events: none` when hidden. This avoids Three.js re-initialization.

**Confidence:** HIGH — pattern is straightforward, store already has all fields.

### Pattern 2: Stale Indicator

**What:** Track a "bbox snapshot at generate time" to compare against current bbox. When preview is open and bbox has changed since last generate, show a banner with "Area changed — Regenerate" and a clickable Regenerate button.

**Implementation:**
```typescript
// In mapStore.ts — add to MapState:
generatedBboxKey: string | null;  // e.g. "48.85,2.35,48.86,2.36" snapshot at generate time

// In mapStore.ts — add to MapActions:
setGeneratedBboxKey: (key: string | null) => void;

// In GenerateButton.tsx — inside handleGenerate() after success:
const bboxKey = `${bbox.sw.lat.toFixed(5)},${bbox.sw.lon.toFixed(5)},${bbox.ne.lat.toFixed(5)},${bbox.ne.lon.toFixed(5)}`;
setGeneratedBboxKey(bboxKey);

// Stale detection logic (in PreviewCanvas or SplitLayout):
const generatedBboxKey = useMapStore((s) => s.generatedBboxKey);
const bbox = useMapStore((s) => s.bbox);
const showPreview = useMapStore((s) => s.showPreview);

const currentBboxKey = bbox
  ? `${bbox.sw.lat.toFixed(5)},${bbox.sw.lon.toFixed(5)},${bbox.ne.lat.toFixed(5)},${bbox.ne.lon.toFixed(5)}`
  : null;

const isStale = showPreview && generatedBboxKey !== null && currentBboxKey !== generatedBboxKey;
```

**Visual treatment:** A banner overlay at the top of the canvas area (not over the sidebar), similar to `RebuildOverlay` positioning. Yellow/amber color distinguishes from `RebuildOverlay`'s blue. Includes a clickable "Regenerate" button that calls `handleGenerate()` (same as GenerateButton).

**Confidence:** HIGH — clean approach, no new libraries.

### Pattern 3: Location Name Wiring

**What:** Two integration points:
1. `SearchOverlay.tsx` `onPick` callback — extract `feature.place_name` from the geocoding result and call `setLocationName()`
2. `GenerateButton.tsx` `handleGenerate()` — if `locationName` is null (no search), reverse geocode the bbox center using the MapTiler REST API

**GeocodingControl onPick type (VERIFIED from node_modules):**
```typescript
// @maptiler/geocoding-control DispatcherTypeCC:
pick: {
  feature: Feature | undefined;
};
// Feature has: text: string, place_name: string, center: Position, ...
```

The current `handlePick` in SearchOverlay only handles the `result === null` (lat/lon input) branch — the geocoding result branch returns early. Fix: when `result.feature` is defined, extract `result.feature.place_name` and call `setLocationName()`.

**Correct implementation:**
```typescript
// In SearchOverlay.tsx, update handlePick:
import { useMapStore } from '../../store/mapStore';
import type { DispatcherTypeCC } from '@maptiler/geocoding-control/types';

const setLocationName = useMapStore((s) => s.setLocationName);

const handlePick = useCallback(
  (event: DispatcherTypeCC['pick']) => {
    if (event.feature) {
      // Use place_name for specificity (e.g. "London, Greater London, England, United Kingdom")
      // Trim to avoid slugification blowout — use text (short name) or trim place_name
      setLocationName(event.feature.text || event.feature.place_name);
    }
    // lat/lon intercept path remains as-is
  },
  [mapRef, setLocationName]
);
```

**Geocoding result field choice:** Use `feature.text` (short name, e.g. "London") rather than `feature.place_name` (full path, e.g. "London, Greater London, England, United Kingdom"). Short name produces cleaner filenames like `london-terrain.stl` vs `london-greater-london-england-united-kingdom-terrain.stl`. This is Claude's discretion — the planner should confirm this preference.

**Reverse geocode at generate time:**
```typescript
// MapTiler API endpoint (from CONTEXT.md):
// GET https://api.maptiler.com/geocoding/{lon},{lat}.json?key={key}
// Response: GeoJSON FeatureCollection, features[0].place_name

async function reverseGeocode(lon: number, lat: number, apiKey: string): Promise<string | null> {
  try {
    const url = `https://api.maptiler.com/geocoding/${lon},${lat}.json?key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const feature = data.features?.[0];
    return feature?.text || feature?.place_name || null;
  } catch {
    return null;
  }
}

// In handleGenerate(), before setShowPreview(true):
if (!locationName) {
  const centerLon = (bbox.sw.lon + bbox.ne.lon) / 2;
  const centerLat = (bbox.sw.lat + bbox.ne.lat) / 2;
  const name = await reverseGeocode(centerLon, centerLat, apiKey);
  if (name) setLocationName(name);
}
```

**Confidence:** HIGH for wiring, MEDIUM for reverse geocode response shape (verified API URL from CONTEXT.md; response shape extrapolated from forward geocoding types in node_modules which show `text` and `place_name` on Feature).

### Pattern 4: Watertight Export Hardening

**What:** Audit mesh construction to ensure watertight geometry by construction, then tighten validation to block download on any non-manifold result.

**Current state (from code audit):**
- `buildSolidMesh()` in `solid.ts`: Uses `sampleTerrainEdge()` (nearest-vertex lookup) for side-wall construction. Risk: floating-point near-miss when terrain RTIN has sparse vertices near edges — wall top edge might not exactly coincide with terrain surface edge vertices. Produces tiny gaps between wall top and terrain perimeter.
- `buildAllBuildings()` in `merge.ts`: Each building is individually enclosed (floor + walls + roof); merged via `mergeGeometries`. Buildings don't CSG-union with terrain in preview — only in export. This is correct.
- `roadMesh.ts`: Builds road ribbons with top/bottom/walls. Road caps (at endpoints and intersections) may have winding issues at junctions.
- Vegetation export in `ExportPanel.tsx`: Builds top face + bottom face + side walls. Side wall winding uses `outward = true` for outer ring, `outward = false` for holes. This looks correct but should be verified with a manifold check.

**Validation tightening:** Current `ExportPanel.tsx` logic (line 408-422):
```
if (!validation.isManifold && !hasBuildings && !hasRoads && !hasVegetation) → block
if (!validation.isManifold && (hasBuildings || hasRoads || hasVegetation)) → warn but allow
```
Phase 8 changes this to always block:
```
if (!validation.isManifold) → always block, show error
```
The note about "slicers auto-repair" becomes moot once construction is fixed. Belt-and-suspenders: fix construction so validation always passes.

**Most likely gaps to fix:**
1. `solid.ts` side walls — nearest-vertex sampling creates float mismatch vs RTIN terrain edge. Fix: instead of nearest-vertex, walk the actual perimeter vertices of the terrain mesh in order (requires indexing perimeter from the RTIN output).
2. Vegetation side walls — the `topBase` and `botBase` index offsets need to use the same vertex indexing for the wall connections. Currently `topBase + ringStart + i` indexes into the `allVegePositions` array, but `botBase` is computed as a separate block. Verify that `ti`, `tj`, `bi`, `bj` correctly reference the same positions.
3. Road caps at endpoints — geometry-extrude generates ribbon geometry without caps at road endpoints. Road solid needs endpoint caps to close the ribbon.

**Confidence:** MEDIUM — code audit is complete but actual manifold correctness requires running tests with manifold-3d validation output. The gaps identified are the most likely candidates.

### Anti-Patterns to Avoid

- **Resetting store state on "Back to Edit":** Do NOT call `setElevationData(null)` or clear features when hiding preview. The whole point is state preservation. Only `setShowPreview(false)` is needed.
- **Calling reverse geocode at export time:** Reverse geocode runs at generate time (not export) so the name is ready when the user clicks Export. The CONTEXT.md specifies this explicitly.
- **Using `feature.place_name` for filename slugification:** Full place name (e.g. "London, Greater London, England, United Kingdom") produces a 60+ character filename prefix. Use `feature.text` (short name) instead.
- **Always-mounting vs conditional-mounting R3F Canvas:** If SplitLayout unmounts the canvas on `showPreview === false`, all Three.js state is destroyed. Change to preserve the DOM node (CSS hide) or accept the re-initialization cost. Evaluate based on performance.
- **Blocking export for all non-manifold:** The current CSG path in `csgUnion()` + `mergeTerrainAndBuildings()` already tries to produce manifold output. If construction is fixed, the boundary-edge fallback check should pass. Only block if the primary manifold-3d check fails (not the boundary-edge fallback with its 5% tolerance).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Reverse geocode | Custom geocoding logic | MapTiler `/geocoding/{lon},{lat}.json` REST endpoint | Direct URL call with `fetch()`, no library needed |
| Filename slugification | Custom slug logic | Existing `generateFilename()` in `stlExport.ts` | Already handles slug, layer suffixes, coordinate fallback |
| Manifold validation | Custom non-manifold detector | Existing `validateMesh()` in `validate.ts` | manifold-3d WASM + boundary-edge fallback already implemented |
| CSG union | Custom mesh merging | Existing `csgUnion()` in `buildingSolid.ts` | Already handles three-bvh-csg with attribute stripping |
| State persistence across view switch | Complex serialization | Zustand store (already persistent in-memory) | All state lives in the store; `showPreview` toggle is the only change needed |

**Key insight:** Phase 8 is almost entirely wiring existing pieces together. The hard work (store, validation, CSG, slugification) is already done.

---

## Common Pitfalls

### Pitfall 1: onPick Receives an Event Object, Not the Feature Directly

**What goes wrong:** The current `handlePick` in `SearchOverlay.tsx` is typed as `(result: unknown)` and checks `if (result !== null) return`. The actual GeocodingControl `onPick` receives `{ feature: Feature | undefined }` (the full `DispatcherTypeCC['pick']` event), not the feature directly.

**Why it happens:** The GeocodingControl React wrapper uses `CallbackProperties<DispatcherTypeCC>` which maps `pick` → `onPick` with event type `DispatcherTypeCC['pick']` = `{ feature: Feature | undefined }`.

**How to avoid:** Import and use the correct type:
```typescript
// WRONG (current code):
const handlePick = useCallback((result: unknown) => {
  if (result !== null) return; // This condition is never false — result is always { feature: ... }
}, [...]);

// CORRECT:
const handlePick = useCallback((event: { feature: { text: string; place_name: string } | undefined }) => {
  if (event.feature) {
    setLocationName(event.feature.text || event.feature.place_name);
  }
}, [setLocationName]);
```

**Warning signs:** `setLocationName` is never called despite searching for locations.

### Pitfall 2: SplitLayout Unmounts Preview Canvas on `showPreview === false`

**What goes wrong:** Current `SplitLayout.tsx` conditionally renders the preview panel: `{showPreview && (<div>...</div>)}`. When user clicks "Back to Edit" and `showPreview` becomes false, React unmounts `<PreviewCanvas>` and `<PreviewSidebar>` — destroying the Three.js scene, WebGL context, BVH raycaster, and all mesh geometry. When user generates again, everything re-builds from scratch.

**Why it happens:** React's conditional rendering unmounts components.

**How to avoid:** Two options:
1. Keep the conditional render but accept re-build cost (simpler, may be acceptable if re-build is fast enough — ~2-3 seconds for typical areas)
2. Switch to always-render + CSS hide: `style={{ display: showPreview ? 'block' : 'none' }}`. The R3F Canvas continues running in the background but is hidden and pointer-events disabled.

**Decision for planner:** Option 2 (CSS hide) is recommended to avoid re-build cost and provide instant "Back to Edit" → "Back to Preview" transitions. The canvas still renders frames (minor GPU cost) but this is acceptable for a desktop app.

**Warning signs:** 3D preview takes 2-3 seconds to rebuild after returning from edit mode.

### Pitfall 3: Stale Indicator Triggers on Every Exaggeration Change

**What goes wrong:** If stale detection uses the full store `bbox` object for comparison, and some other state change causes a re-render, the comparison might produce false positives.

**Why it happens:** Object equality (`bbox !== generatedBbox`) in React always returns true unless the same reference. Using the serialized bbox key string avoids this.

**How to avoid:** Use a string key computed from lat/lon coordinates (toFixed(5)), not the bbox object reference. This is what Pattern 2 above prescribes.

**Warning signs:** Stale indicator appears when user changes exaggeration slider, not just when they resize the bbox.

### Pitfall 4: Reverse Geocode Overwrites Named Location

**What goes wrong:** User searches for "London" → `locationName` is set to "London". User then clicks "Regenerate Preview". The reverse geocode runs and may return a different string (e.g. "City of London") or overwrite with a less-precise name.

**Why it happens:** The generate flow runs reverse geocode when `locationName` is null. If it runs when `locationName` is already set (from search), it overwrites the user's explicit search term.

**How to avoid:** Only run reverse geocode when `locationName` is null (not when it's already populated from search). The condition in `handleGenerate()` must be `if (!locationName)`.

**Warning signs:** After searching "London" and regenerating, the filename changes to "city-of-london-terrain.stl".

### Pitfall 5: Vegetation Side-Wall Index Offset Bug

**What goes wrong:** In ExportPanel.tsx vegetation export, `topBase` and `botBase` are computed by tracking `vegeVertexOffset`. The `buildWalls` function indexes into the combined `allVegePositions` array using `topBase + ringStart + i`. If the number of points in `coords2d` doesn't match what `buildWalls` expects (due to outer ring + holes merged into one flat array), wall triangles reference wrong vertices.

**Why it happens:** `coords2d.length / 2` includes all rings (outer + holes). `topBase` points to the start of this feature's vertices in the global `allVegePositions`. If `outerLen` (which is `feature.outerRing.length`) doesn't account for the closing vertex strip (if any), `ringStart` offsets will be off.

**How to avoid:** Verify that `outerLen = feature.outerRing.length` matches the number of vertices pushed to `coords2d` for the outer ring. The current code pushes `feature.outerRing.length` vertices (no strip on OSM input here — stripping happens upstream in buildAllBuildings). Cross-check by ensuring `holeStart` at the end equals `numPts`.

**Warning signs:** Manifold validation fails specifically for vegetation geometry even when terrain-only passes.

---

## Code Examples

Verified patterns from existing codebase and type definitions:

### GeocodingControl onPick Correct Usage

```typescript
// Source: node_modules/@maptiler/geocoding-control/types.d.ts — DispatcherTypeCC['pick']
// The event type is { feature: Feature | undefined }
// Feature has: text (short name), place_name (full path), center (lon/lat)

const handlePick = useCallback(
  (event: { feature?: { text: string; place_name: string } }) => {
    if (event?.feature) {
      // Use text (short name) for cleaner filenames
      setLocationName(event.feature.text || event.feature.place_name);
    }
    // lat/lon coordinate interception remains unchanged
  },
  [setLocationName]
);
```

### MapTiler Reverse Geocoding

```typescript
// Source: CONTEXT.md (08-CONTEXT.md) — specifies the API endpoint
async function reverseGeocode(lon: number, lat: number, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.maptiler.com/geocoding/${lon.toFixed(6)},${lat.toFixed(6)}.json?key=${apiKey}`
    );
    if (!res.ok) return null;
    const data = await res.json() as { features?: Array<{ text?: string; place_name?: string }> };
    const feature = data.features?.[0];
    return feature?.text || feature?.place_name || null;
  } catch {
    return null;  // Silent fallback — coordinate-based filename used instead
  }
}
```

### Stale Bbox Detection

```typescript
// In mapStore.ts additions:
interface MapState {
  // ... existing fields ...
  generatedBboxKey: string | null;  // Snapshot of bbox at last successful generate
}
interface MapActions {
  setGeneratedBboxKey: (key: string | null) => void;
}

// Helpers
function bboxToKey(bbox: BoundingBox): string {
  return `${bbox.sw.lat.toFixed(5)},${bbox.sw.lon.toFixed(5)},${bbox.ne.lat.toFixed(5)},${bbox.ne.lon.toFixed(5)}`;
}

// In a StaleIndicator component:
const generatedBboxKey = useMapStore((s) => s.generatedBboxKey);
const bbox = useMapStore((s) => s.bbox);
const showPreview = useMapStore((s) => s.showPreview);

const isStale = showPreview
  && generatedBboxKey !== null
  && bbox !== null
  && bboxToKey(bbox) !== generatedBboxKey;
```

### Validation Block-on-Failure (Tightened)

```typescript
// In ExportPanel.tsx — replace current lenient validation with strict:
const validation = await validateMesh(exportSolid);

if (!validation.isManifold) {
  const errMsg = validation.error ?? 'Mesh is not watertight — please try again';
  setValidationError(errMsg);
  setExportStatus('error', errMsg);
  exportSolid.dispose();
  return;  // Block download always
}

// Only reach download offer if manifold check passes
```

---

## State of the Art

| Old Approach | Current Approach | Relevant to Phase 8 |
|--------------|------------------|---------------------|
| locationName wired from geocoding | locationName exists in store but `setLocationName()` never called from any component | Phase 8 wires this |
| Stale preview detection | No stale detection — user must click "Regenerate" manually | Phase 8 adds `generatedBboxKey` approach |
| Non-manifold: warn-and-allow for features | Terrain-only blocks; features warn-and-allow | Phase 8 tightens to always-block |
| "Back to Edit": no button | Preview panel has no navigation back | Phase 8 adds button to PreviewSidebar header |

**Nothing deprecated.** All patterns (Zustand, CSG, manifold-3d) are current.

---

## Open Questions

1. **Should R3F Canvas persist across view toggles?**
   - What we know: Current SplitLayout unmounts on `showPreview === false`; re-build takes 2-3 seconds
   - What's unclear: Whether users will frequently toggle back-and-forth (if rarely, re-build is acceptable)
   - Recommendation: Use CSS `display: none` to preserve canvas (Option 2 in Pitfall 2). Performance win is worth the minor complexity of changing the conditional render.

2. **Should stale indicator include a "Regenerate" action or just a passive label?**
   - What we know: CONTEXT.md says "should include a clickable Regenerate action, not just a passive label"
   - What's unclear: Should the Regenerate button in the stale indicator replace the separate GenerateButton, or call the same handler?
   - Recommendation: Extract `handleGenerate` from GenerateButton into a shared hook or call it from a store action. The stale indicator button calls the same function.

3. **Vegetation side-wall winding correctness**
   - What we know: The ExportPanel vegetation code uses `topBase` and `botBase` offsets for wall construction
   - What's unclear: Whether the closed-polygon assumption (`feature.outerRing[0] !== feature.outerRing[last]`) is always true for parsed OSM vegetation features
   - Recommendation: Add a targeted manifold-3d check in the watertight audit task by generating a simple vegetation slab and validating.

4. **Road caps at endpoints**
   - What we know: `buildRoadGeometry` uses `geometry-extrude` (patched) for ribbon generation; ribbon has top/bottom/side walls but the CONTEXT.md's Phase 5 decision says "Roads are closed solid ribbons"
   - What's unclear: Whether the existing road geometry closes at road endpoints (open endpoints = non-manifold holes)
   - Recommendation: Run manifold-3d validation against a sample road mesh export and check for open-boundary edges at endpoints.

---

## Sources

### Primary (HIGH confidence)

- `node_modules/@maptiler/geocoding-control/types.d.ts` — `DispatcherTypeCC['pick']` event type; `Feature.text` and `Feature.place_name` fields
- `node_modules/@maptiler/geocoding-control/react.d.ts` — `GeocodingControl` React props type; `onPick` callback signature via `CallbackProperties<DispatcherTypeCC>`
- `src/store/mapStore.ts` — `locationName: string | null` field and `setLocationName()` action exist; never called
- `src/lib/export/stlExport.ts` — `generateFilename()` fully implemented with slugification, layer suffixes, coordinate fallback
- `src/lib/export/validate.ts` — `validateMesh()` implemented with manifold-3d + boundary-edge fallback
- `src/lib/mesh/buildingSolid.ts` — `csgUnion()` and `mergeTerrainAndBuildings()` implemented
- `src/components/Preview/ExportPanel.tsx` — Full export pipeline; current validation is lenient for features
- `src/components/Map/SearchOverlay.tsx` — `handlePick` exists but `if (result !== null) return` skips geocoded results
- `src/components/Layout/SplitLayout.tsx` — `showPreview` conditional render confirmed; unmounts on hide
- `.planning/phases/08-edit-iterate-export-polish/08-CONTEXT.md` — MapTiler reverse geocode URL, all locked decisions

### Secondary (MEDIUM confidence)

- MapTiler Reverse Geocoding API URL from CONTEXT.md: `https://api.maptiler.com/geocoding/{lon},{lat}.json?key={key}` — consistent with MapTiler's forward geocoding URL pattern already in use in the app
- GeoJSON feature shape for reverse geocoding response extrapolated from forward geocoding type definitions (same MapTiler API family; response shape should be identical)

### Tertiary (LOW confidence)

- Vegetation side-wall winding correctness — assessed via code reading only, not runtime validation test
- Road endpoint cap geometry — assessed via code reading; needs runtime manifold check to confirm

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified from package.json; no new installs needed
- Architecture: HIGH — all integration points identified in existing code with exact line locations
- Pitfalls: HIGH for onPick type mismatch, canvas teardown, stale indicator false positives, and reverse geocode overwrite; MEDIUM for vegetation/road geometry gaps (needs runtime verification)

**Research date:** 2026-02-27
**Valid until:** 2026-03-27 (stable APIs; MapTiler and Zustand patterns don't change rapidly)
