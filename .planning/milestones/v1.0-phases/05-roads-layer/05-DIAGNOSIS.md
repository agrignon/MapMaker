---
phase: 05-roads-layer
diagnosed: 2026-02-25T08:40:00Z
status: root_cause_found
uat_failures: 6/6
root_causes: 2
---

# Phase 5: Roads Layer Diagnosis

**UAT Result:** 6/6 tests failed. User reported "no roads appear on the model."

**Investigation Method:** Full pipeline trace from Overpass API through rendering, with real-data validation tests and git diff analysis of committed vs working-tree code.

---

## Root Cause Summary

There are **two independent root causes**, both of which must be fixed:

### Root Cause 1: Z-fighting makes roads invisible in 3D preview (CONFIRMED)

**Severity:** Critical (blocks all 6 UAT tests)
**Files:** `src/components/Preview/RoadMesh.tsx`

The default road style is `recessed` (mapStore.ts line 107). In recessed mode, the road ribbon geometry sits BELOW the terrain surface with its top face at EXACT terrain Z. The terrain mesh also has faces at the same Z value. Without `polygonOffset` or a Z-position offset, the GPU depth buffer creates Z-fighting and the terrain wins -- roads are completely invisible.

**Evidence:**
- Committed RoadMesh.tsx renders `<mesh ref={meshRef} visible={roadsVisible}>` with no position offset and no polygonOffset on the material
- Recessed roads: `styleOffset = -ROAD_DEPTH_MM[tier]` means the ribbon extends downward from terrain Z
- The top face of recessed roads sits at `terrainZ + (-depth) + depth = terrainZ` -- the exact same Z as the terrain surface
- For `flat` style: `styleOffset = 0`, top face at `terrainZ + 0 + depth = terrainZ + depth` -- slightly above, but bottom face at terrainZ = Z-fighting
- Only `raised` style would be partially visible: `styleOffset = +depth`, entire ribbon above terrain

**Working-tree fix attempt:** The uncommitted changes add `position={[0, 0, 0.1]}` and `polygonOffset` with `polygonOffsetFactor={-4}` -- this is the correct approach but may not have been applied before UAT testing, or may need adjustment.

### Root Cause 2: Overpass API rate limiting (PROBABLE)

**Severity:** High (would prevent road data from loading at all)
**Files:** `src/components/Sidebar/GenerateButton.tsx`

Both `fetchBuildings()` and `fetchRoads()` fire simultaneously (lines 88-89: `void fetchBuildings(); void fetchRoads();`) hitting the same Overpass API server. The Overpass API enforces strict rate limiting (2 concurrent slots per IP). While 2 concurrent requests should be within the limit, the API can return HTTP 429 or timeout if:
- The user has other Overpass requests in flight (e.g., from a previous generation)
- The server is under load
- The previous request hasn't fully completed

The error is silently caught in the try/catch at line 66-70, setting `roadGenerationStatus` to `'error'` with a message. The user reported "Road Generation Status -- fail" which is consistent with the status area showing an error rather than "X roads found."

**Evidence:**
- Both requests fire with zero delay between them
- Error handling silently catches and displays the error in a small text area below the Generate button
- The full data pipeline was validated end-to-end with real Overpass data: 325 roads fetched, 324 parsed, 324 geometry meshes built successfully -- the pipeline itself works perfectly

---

## What Was Verified (Pipeline Health)

| Pipeline Stage | Tested With | Result |
|---|---|---|
| Overpass API query | Real curl request to overpass-api.de | 325 elements returned for a London bbox |
| osmtogeojson conversion | Real 325-element response | 325 LineString features, all with highway tags |
| parseRoadFeatures logic | Real data through classification | 324 features kept, 1 tunnel excluded, 0 unknown types |
| geometry-extrude | All 324 real road features | 324/324 geometries built, 0 failures |
| TypeScript compilation | `npx tsc --noEmit` | Zero errors |
| Unit tests | `npx vitest run` | 160/160 pass (14 road-specific) |
| Production build | `npx vite build` | Success, no errors |

**Conclusion:** The data pipeline (fetch -> parse -> geometry build) works correctly. The issue is in rendering (Root Cause 1) and possibly data fetching reliability (Root Cause 2).

---

## Recommended Fixes

### Fix 1: Z-fighting in RoadMesh.tsx (Required)

Apply Z-offset and polygonOffset to make roads visible regardless of style:

```tsx
// In the return JSX:
<mesh ref={meshRef} visible={roadsVisible} position={[0, 0, 0.15]}>
  <meshStandardMaterial
    color={ROAD_COLOR}
    side={THREE.DoubleSide}
    clippingPlanes={clippingPlanes}
    polygonOffset
    polygonOffsetFactor={-4}
    polygonOffsetUnits={-4}
  />
</mesh>
```

The 0.15mm Z-offset lifts the road mesh above the terrain surface. Combined with `polygonOffset`, this ensures roads are always drawn on top of terrain in the depth buffer. The offset is small enough to not be visually noticeable at model scale.

Note: The working-tree already has a version of this fix with `position={[0, 0, 0.1]}`. This should work but may need to be verified visually.

### Fix 2: Stagger Overpass requests (Recommended)

Add a small delay between building and road fetches to avoid rate limiting:

```tsx
// In handleGenerate():
void fetchBuildings();
// Stagger road fetch to avoid Overpass rate limiting
setTimeout(() => void fetchRoads(), 1000);
```

Alternatively, chain them sequentially:
```tsx
void fetchBuildings().then(() => void fetchRoads());
```

### Fix 3: Add error resilience to RoadMesh useEffect (Recommended)

Wrap `buildRoadGeometry` in try/catch inside the useEffect to prevent silent failures:

```tsx
try {
  const newGeometry = buildRoadGeometry(roadFeatures, bbox, elevationData, params);
  // ... handle geometry
} catch (err) {
  console.error('[RoadMesh] Failed to build road geometry:', err);
  // Optionally set an error state
}
```

---

## Cascading Failure Analysis

All 6 UAT failures trace back to the same two root causes:

| UAT Test | Root Cause | Explanation |
|---|---|---|
| 1. Road Ribbons in 3D Preview | RC1 (Z-fighting) | Roads built but invisible due to Z-fighting with terrain |
| 2. Road Style Toggle | RC1 (Z-fighting) | All three styles (recessed/raised/flat) have some degree of Z-fighting; recessed is worst |
| 3. Road Layer Toggle | RC1 + RC2 | Toggle exists and works but no visible roads to show/hide |
| 4. Road Generation Status | RC2 (rate limiting) | If fetch fails, status shows error instead of "X roads found" |
| 5. Roads in STL Export | RC1 or RC2 | If roads invisible in preview, user may not have roads data; export uses same `hasRoads` check |
| 6. Export Filename | RC1 or RC2 | Filename uses `hasRoads = Boolean(roadFeatures && roadFeatures.length > 0 && roadsVisible)` -- if no road data loaded, hasRoads is false |

---

## Files Involved

| File | Issue | Fix Needed |
|---|---|---|
| `src/components/Preview/RoadMesh.tsx` | No Z-offset or polygonOffset in committed version | Add position offset + polygonOffset material props |
| `src/components/Sidebar/GenerateButton.tsx` | Concurrent Overpass requests may rate-limit | Stagger road fetch or add retry logic |
| `src/components/Preview/ExportPanel.tsx` | Depends on road data being loaded (cascading from RC2) | No direct fix needed -- resolves when RC2 is fixed |
| `src/lib/export/stlExport.ts` | generateFilename depends on hasRoads (cascading from RC2) | No direct fix needed -- resolves when RC2 is fixed |

---

## Uncommitted Changes Assessment

The working tree contains uncommitted changes that partially address these issues:

1. **RoadMesh.tsx** (+9/-0): Adds `position={[0, 0, 0.1]}` and `polygonOffset` -- this is the correct fix for Root Cause 1
2. **ExportPanel.tsx** (+34/-2): Adds `clipGeometryToFootprint` for export clipping -- this is a new feature, not a bug fix
3. **merge.ts** (+10/-10): Changes building base Z from `Math.max` to `Math.min` -- unrelated building fix

These changes should be committed after verification, but Root Cause 2 (rate limiting / request reliability) is NOT addressed by any uncommitted change.
