# Phase 12: Deduplication - Research

**Researched:** 2026-02-28
**Domain:** Spatial overlap detection, axis-aligned bounding box IoU, building feature deduplication
**Confidence:** HIGH — algorithm is mathematically simple and fully self-contained; all inputs/outputs are existing project types; no new libraries needed

## Summary

Phase 12 implements a deduplication filter that takes two `BuildingFeature[]` lists — one from OSM (authoritative detail, variable coverage) and one from Overture (global ML coverage, may overlap OSM) — and returns the Overture features that do NOT overlap any OSM building. OSM buildings always win on overlap; Overture buildings with no OSM counterpart pass through unchanged as gap-fill.

The approach locked in STATE.md is **axis-aligned bounding box (AABB) IoU at threshold 0.3**. This means: for each Overture building, compute its lon/lat bounding box; for each OSM building, compute its lon/lat bounding box; if `intersection_area / union_area >= 0.3`, discard the Overture building. This is an O(N×M) scan where N = Overture count and M = OSM count. For typical MapMaker bounding boxes (hundreds to low thousands of buildings total), this is fast enough without a spatial index.

AABB IoU was chosen over centroid distance (STATE.md) because it handles L-shaped and courtyard buildings correctly — a large building's centroid may be far from a smaller building that overlaps its arm. IoU at 0.3 is a standard non-maximum-suppression threshold widely used in object detection; it tolerates up to ~30% overlap before treating two footprints as duplicates. The implementation requires no new npm packages — all math uses plain TypeScript arithmetic on the existing `BuildingFeature.outerRing: [number, number][]` data.

**Primary recommendation:** Create `src/lib/overture/dedup.ts` with a single exported `deduplicateOverture(osmFeatures, overtureFeatures)` function. The function computes AABB for each building on both sides and runs an IoU scan. Any Overture building whose bbox overlaps any OSM building bbox at IoU ≥ 0.3 is dropped. The returned array contains only Overture gap-fill candidates.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DEDUP-01 | Overture buildings overlapping existing OSM buildings are removed via bbox IoU (OSM detail preserved) | AABB IoU ≥ 0.3 threshold (locked in STATE.md); pure TypeScript arithmetic on `BuildingFeature.outerRing`; no new deps; returns Overture gap-fill list only |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| None (plain TypeScript) | — | AABB computation + IoU formula | Algorithm is 15–20 lines of arithmetic; adding a spatial library would add bundle weight for no gain at this scale |

### Supporting

No new libraries. All supporting utilities are project-internal or built-in:

| Utility | Source | Purpose | Why Reuse |
|---------|--------|---------|-----------|
| `BuildingFeature` | `src/lib/buildings/types.ts` | Input/output type for both OSM and Overture building lists | Existing pipeline contract; dedup function is a pure `BuildingFeature[]` → `BuildingFeature[]` transform |
| Plain `Math.min / Math.max` | TypeScript built-ins | AABB extraction from `outerRing` coordinates | No projection needed; lon/lat AABB is valid for IoU comparison within a small bounding box |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| AABB IoU (lon/lat) | Polygon IoU (shapefile intersection) | Polygon IoU is exact but requires a computational geometry library (e.g. `@turf/intersect` or `polygon-clipping`). For small urban bounding boxes, AABB IoU at 0.3 gives the same deduplication outcome; complex polygons (L-shapes, courtyards) pass success criterion 3 because their AABB still overlaps an OSM building's AABB. AABB approach adds zero dependencies. |
| AABB IoU (lon/lat) | Centroid distance threshold | STATE.md explicitly rejected centroid distance — L-shaped buildings have centroids far from their arms. IoU is more robust to elongated footprints. |
| O(N×M) scan | R-tree spatial index | R-tree would be needed at 10,000+ buildings; for MapMaker bounding boxes (typical 100–2,000 buildings per side), O(N×M) is < 4 million comparisons, each taking ~100ns = < 0.4ms. Not a concern at this scale. |
| IoU threshold 0.3 | 0.1 or 0.5 | 0.3 is the locked decision (STATE.md). For reference: 0.1 would be too aggressive (adjacent buildings could false-match), 0.5 would miss genuine duplicates from slightly misaligned sources. |

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Project Structure

```
src/
├── lib/
│   └── overture/
│       ├── constants.ts       # Phase 10
│       ├── tiles.ts           # Phase 10
│       ├── index.ts           # Phase 10
│       ├── parse.ts           # Phase 11
│       ├── dedup.ts           # NEW Phase 12 — deduplicateOverture()
│       └── __tests__/
│           ├── tiles.test.ts  # Phase 10 tests
│           ├── parse.test.ts  # Phase 11 tests
│           └── dedup.test.ts  # NEW Phase 12 tests
```

### Pattern 1: AABB Extraction

**What:** Given a `BuildingFeature.outerRing` (array of `[lon, lat]` pairs in WGS84), compute the axis-aligned bounding box as `{ minLon, maxLon, minLat, maxLat }`.

**When to use:** Called once per building on each side; results cached to avoid repeated scans.

```typescript
// Source: project codebase — BuildingFeature.outerRing is [number, number][] in [lon, lat] order
// Confirmed in src/lib/buildings/types.ts and src/lib/buildings/parse.ts

interface AABB {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

function computeAABB(ring: [number, number][]): AABB {
  let minLon = Infinity, maxLon = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;
  for (const [lon, lat] of ring) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLon, maxLon, minLat, maxLat };
}
```

**Key detail:** `outerRing` may or may not include a closing vertex (Overture rings from `toGeoJSON` include a closing vertex `[A,B,C,D,A]`; OSM rings from `parseBuildingFeatures` also include the closing vertex). The AABB computation is safe either way — duplicating the first vertex as last does not affect min/max.

### Pattern 2: AABB IoU Computation

**What:** Given two AABBs, compute their intersection area divided by their union area. Returns 0 if they do not intersect.

**When to use:** Called for each (Overture building, OSM building) pair.

```typescript
// Source: standard IoU formula for axis-aligned rectangles
// Confidence: HIGH — standard algorithm, no library dependency

function bboxIoU(a: AABB, b: AABB): number {
  // Compute intersection rectangle
  const interMinLon = Math.max(a.minLon, b.minLon);
  const interMaxLon = Math.min(a.maxLon, b.maxLon);
  const interMinLat = Math.max(a.minLat, b.minLat);
  const interMaxLat = Math.min(a.maxLat, b.maxLat);

  // No intersection
  if (interMaxLon <= interMinLon || interMaxLat <= interMinLat) return 0;

  const interArea = (interMaxLon - interMinLon) * (interMaxLat - interMinLat);
  const areaA = (a.maxLon - a.minLon) * (a.maxLat - a.minLat);
  const areaB = (b.maxLon - b.minLon) * (b.maxLat - b.minLat);
  const unionArea = areaA + areaB - interArea;

  return unionArea <= 0 ? 0 : interArea / unionArea;
}
```

**Key detail:** Area units are degrees² (lon × lat). This is valid for IoU ratio computation because it is the same unit on both sides — the ratio is dimensionless. No UTM projection is needed because IoU is a ratio, not an absolute area measurement. The 0.3 threshold is scale-invariant.

### Pattern 3: Main Dedup Function

**What:** For each Overture building, check whether its AABB overlaps any OSM building's AABB at IoU ≥ 0.3. Keep only Overture buildings that do NOT match any OSM building.

**When to use:** Called after `parseOvertureTiles()` in Phase 13's integration code, before passing the combined building list to `buildAllBuildings()`.

```typescript
// Source: algorithm design from DEDUP-01 requirement + STATE.md locked decision
// IoU threshold 0.3 locked in STATE.md: "Bounding-box IoU at 0.3 threshold"

const DEDUP_IOU_THRESHOLD = 0.3;

/**
 * Remove Overture buildings that overlap existing OSM buildings via bbox IoU.
 *
 * OSM buildings are authoritative — any Overture building whose bbox overlaps
 * an OSM building bbox at IoU >= 0.3 is discarded. Overture buildings with
 * no OSM counterpart (gap-fill) pass through unchanged.
 *
 * @param osmFeatures - BuildingFeature[] from parseBuildingFeatures() (OSM)
 * @param overtureFeatures - BuildingFeature[] from parseOvertureTiles() (Overture)
 * @returns Overture gap-fill buildings that do NOT overlap any OSM building
 */
export function deduplicateOverture(
  osmFeatures: BuildingFeature[],
  overtureFeatures: BuildingFeature[],
): BuildingFeature[] {
  if (osmFeatures.length === 0) return overtureFeatures;
  if (overtureFeatures.length === 0) return [];

  // Pre-compute OSM AABBs once
  const osmAABBs = osmFeatures.map(f => computeAABB(f.outerRing));

  return overtureFeatures.filter(overtureFeature => {
    const overtureAABB = computeAABB(overtureFeature.outerRing);
    // Keep this Overture building only if it does NOT overlap any OSM building
    return !osmAABBs.some(osmAABB => bboxIoU(overtureAABB, osmAABB) >= DEDUP_IOU_THRESHOLD);
  });
}
```

### Anti-Patterns to Avoid

- **Using centroid distance instead of IoU:** STATE.md explicitly rejected this. An L-shaped building's centroid can be far from its arm; a smaller Overture footprint overlapping that arm would not be caught by centroid distance.

- **Filtering OSM features:** The function only filters Overture features. OSM features always pass through untouched — DEDUP-01 says "OSM detail preserved."

- **Projecting to UTM before IoU:** Unnecessary. IoU is a dimensionless ratio; degrees² / degrees² = valid ratio. UTM projection would add complexity and the `wgs84ToUTM` call overhead for no accuracy gain in the ratio.

- **Returning `[...osmFeatures, ...filteredOvertureFeatures]`:** The dedup function's responsibility is only to return the filtered Overture gap-fill list. Merging with OSM features is a Phase 13 concern (the integration point). Keeping them separate makes the function easier to test.

- **Mutating the input arrays:** Return a new filtered array; do not modify `overtureFeatures` in place.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| AABB IoU | Nothing — it's 15 lines of arithmetic | Plain TypeScript math | There is no meaningfully simpler approach; the algorithm is self-contained |
| Spatial index for overlap queries | R-tree or k-d tree | O(N×M) scan | For < 2000 buildings per side (typical MapMaker bbox), the O(N×M) scan is < 0.4ms. A spatial index would add bundle weight and complexity for no user-visible benefit |
| Polygon-level exact overlap | `@turf/intersect` or `polygon-clipping` | AABB IoU | Full polygon intersection is correct but 10–100× slower and requires a new dependency. AABB IoU at 0.3 produces the same deduplication outcome for success criteria 1–3. |

**Key insight:** The locked decision (STATE.md) of bbox IoU is precisely the right tool for this problem: simple, fast, dependency-free, and handles L-shaped buildings correctly via the AABB approximation.

## Common Pitfalls

### Pitfall 1: Forgetting to Handle Empty Input Lists

**What goes wrong:** `osmFeatures = []` (Overture-only area) or `overtureFeatures = []` (OSM-only area) causes the filter to scan an empty array and return `[]` in both cases.

**Why it happens:** The `.filter()` + `.some()` pattern naturally returns `[]` when `overtureFeatures = []` (correct), but when `osmFeatures = []`, pre-computing `osmAABBs = []` makes `.some()` always return `false`, which means ALL Overture features pass through (correct — no OSM to match against). This is actually the correct behavior, but it must be verified explicitly in tests.

**How to avoid:** Add early return for the `osmFeatures.length === 0` case to skip AABB computation entirely, and add a test case for it.

**Warning signs:** In OSM-sparse areas, Overture buildings are not appearing (all wrongly filtered).

### Pitfall 2: IoU Always Returns 0 Due to Coordinate Order

**What goes wrong:** All Overture buildings pass through even when they clearly overlap OSM buildings.

**Why it happens:** `BuildingFeature.outerRing` stores coordinates as `[lon, lat]` (index 0 = longitude, index 1 = latitude). If the AABB computation accidentally reads them as `[lat, lon]`, the min/max values will be swapped axes, producing an AABB in the wrong space but with the same numeric values — IoU calculations will still work numerically. However, if the outer ring has a closing vertex (`[A,B,C,D,A]`) and the dedup function checks `ring.length < 2` for degenerate detection, ensure the check allows at least the closing vertex.

**How to avoid:** Use destructuring `for (const [lon, lat] of ring)` and name variables explicitly. Add a test with two identical rectangles (expected IoU = 1.0).

**Warning signs:** A test case of two identical buildings returns IoU = 0.

### Pitfall 3: Threshold Off-by-One (> vs >=)

**What goes wrong:** The DEDUP-01 requirement says "overlapping OSM buildings are removed." The threshold is 0.3; buildings with IoU exactly equal to 0.3 should be removed (they count as overlapping).

**Why it happens:** Using `> DEDUP_IOU_THRESHOLD` (strict greater-than) instead of `>= DEDUP_IOU_THRESHOLD` passes a building with exactly 0.3 IoU through as gap-fill when it should be removed.

**How to avoid:** Always use `>= DEDUP_IOU_THRESHOLD`. Add a test case with a synthetic pair producing exactly 0.3 IoU (or verify boundary behavior at 0.29999 vs 0.30000).

**Warning signs:** Test cases at the exact threshold boundary fail.

### Pitfall 4: Zero-Area AABB (Degenerate Ring)

**What goes wrong:** A building ring with all identical points, or a single point, produces an AABB with `maxLon === minLon` or `maxLat === minLat`. The union area becomes 0, causing division-by-zero in the IoU formula.

**Why it happens:** Such rings should not exist in the pipeline (the area filter in parse.ts removes buildings < 15 m²; `parseBuildingFeatures` requires ≥ 4 coordinates). However, defensive programming prevents NaN from propagating.

**How to avoid:** In `bboxIoU`, guard `if (unionArea <= 0) return 0`. This covers the degenerate case without special-casing the caller.

**Warning signs:** IoU returns `NaN` in certain test cases.

### Pitfall 5: OSM Rings May Have Closing Vertex

**What goes wrong:** Both OSM rings from `parseBuildingFeatures` and Overture rings from `parseOvertureTiles` include a closing vertex `[A,B,C,D,A]`. For AABB computation this is harmless (repeating the first vertex does not affect min/max). For any vertex-counting logic (e.g., trying to compute area from ring length), the extra vertex would cause off-by-one errors.

**How to avoid:** The AABB computation uses only min/max of coordinates, not vertex count. No special handling of closing vertex needed.

## Code Examples

### Complete dedup.ts Implementation

```typescript
// src/lib/overture/dedup.ts
import type { BuildingFeature } from '../buildings/types';

/** Axis-aligned bounding box in WGS84 degree coordinates. */
interface AABB {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

/** IoU threshold below which two buildings are NOT considered duplicates. */
export const DEDUP_IOU_THRESHOLD = 0.3;

/**
 * Compute the AABB of a building outer ring in lon/lat space.
 */
function computeAABB(ring: [number, number][]): AABB {
  let minLon = Infinity, maxLon = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;
  for (const [lon, lat] of ring) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLon, maxLon, minLat, maxLat };
}

/**
 * Compute Intersection over Union (IoU) of two axis-aligned bounding boxes.
 * Returns 0 if the boxes do not intersect.
 */
function bboxIoU(a: AABB, b: AABB): number {
  const interMinLon = Math.max(a.minLon, b.minLon);
  const interMaxLon = Math.min(a.maxLon, b.maxLon);
  const interMinLat = Math.max(a.minLat, b.minLat);
  const interMaxLat = Math.min(a.maxLat, b.maxLat);

  if (interMaxLon <= interMinLon || interMaxLat <= interMinLat) return 0;

  const interArea = (interMaxLon - interMinLon) * (interMaxLat - interMinLat);
  const areaA = (a.maxLon - a.minLon) * (a.maxLat - a.minLat);
  const areaB = (b.maxLon - b.minLon) * (b.maxLat - b.minLat);
  const unionArea = areaA + areaB - interArea;

  return unionArea <= 0 ? 0 : interArea / unionArea;
}

/**
 * Remove Overture buildings that overlap existing OSM buildings via bbox IoU.
 *
 * OSM buildings win on overlap. Any Overture building whose bbox overlaps
 * any OSM building bbox at IoU >= DEDUP_IOU_THRESHOLD is discarded.
 * Overture buildings with no OSM counterpart (gap-fill) pass through unchanged.
 *
 * @param osmFeatures - BuildingFeature[] from parseBuildingFeatures()
 * @param overtureFeatures - BuildingFeature[] from parseOvertureTiles()
 * @returns Filtered Overture gap-fill buildings (no OSM overlap)
 */
export function deduplicateOverture(
  osmFeatures: BuildingFeature[],
  overtureFeatures: BuildingFeature[],
): BuildingFeature[] {
  if (osmFeatures.length === 0) return overtureFeatures;
  if (overtureFeatures.length === 0) return [];

  const osmAABBs = osmFeatures.map(f => computeAABB(f.outerRing));

  return overtureFeatures.filter(overtureFeature => {
    const overtureAABB = computeAABB(overtureFeature.outerRing);
    return !osmAABBs.some(osmAABB => bboxIoU(overtureAABB, osmAABB) >= DEDUP_IOU_THRESHOLD);
  });
}
```

### Synthetic Test Helper

```typescript
// Helper to build a minimal BuildingFeature from a rectangle (lon bounds)
// Source: test pattern from src/lib/overture/__tests__/parse.test.ts
function makeRectBuilding(
  minLon: number, maxLon: number,
  minLat: number, maxLat: number
): BuildingFeature {
  return {
    properties: { building: 'yes' },
    outerRing: [
      [minLon, minLat],
      [maxLon, minLat],
      [maxLon, maxLat],
      [minLon, maxLat],
      [minLon, minLat], // closing vertex
    ],
    holes: [],
  };
}
```

### IoU Verification — Known Cases

```typescript
// Identical rectangles: IoU = 1.0
const a = { minLon: 0, maxLon: 1, minLat: 0, maxLat: 1 };
bboxIoU(a, a) // → 1.0

// No overlap: IoU = 0.0
const b = { minLon: 2, maxLon: 3, minLat: 2, maxLat: 3 };
bboxIoU(a, b) // → 0.0

// 50% overlap (one box fully inside another side-by-side):
// a=[0,2]×[0,1], b=[1,3]×[0,1] → intersection=[1,2]×[0,1]=1, union=2+2-1=3, IoU=1/3≈0.333
const c = { minLon: 0, maxLon: 2, minLat: 0, maxLat: 1 };
const d = { minLon: 1, maxLon: 3, minLat: 0, maxLat: 1 };
bboxIoU(c, d) // → 0.333... (≥ 0.3 threshold → duplicate, removed)

// IoU just below threshold:
// If IoU = 0.29 → NOT a duplicate → passes through as gap-fill
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| OSM-only buildings | OSM + Overture gap-fill with deduplication | v1.1 (this milestone) | Global coverage; no double-rendering in well-mapped areas |
| Centroid distance deduplication | AABB IoU | Decided in STATE.md (Phase 12 planning) | Handles L-shaped buildings; scale-invariant threshold |

## Open Questions

1. **Should the dedup function be exported and tested in isolation, or as part of a larger pipeline?**
   - What we know: Phases 10–11 both created focused modules (`tiles.ts`, `parse.ts`) with isolated tests. Phase 13 wires them together.
   - What's unclear: Whether Phase 13 should import `deduplicateOverture` directly or whether it should be re-exported from `index.ts`.
   - Recommendation: Keep `dedup.ts` as a standalone module with its own tests. Phase 13 imports `deduplicateOverture` from `../overture/dedup` directly, same pattern as `parseOvertureTiles` from `../overture/parse`. The `index.ts` export can be updated in Phase 13 if needed.

2. **Is O(N×M) fast enough for large bounding boxes?**
   - What we know: Typical MapMaker bbox at zoom 14 contains ~200–2,000 buildings per side. At 2000×2000 = 4M comparisons, each taking ~200ns of arithmetic, the total is < 1 second.
   - What's unclear: Whether a user could select a very large bbox (city-scale) that generates 10,000+ buildings on each side.
   - Recommendation: Not a Phase 12 concern. The 5-second Overture fetch timeout (Phase 10) limits tile count and therefore building count. If performance becomes an issue, a simple spatial grid can be added as Phase 12 scope, but it is not needed for any stated success criterion.

3. **Coordinate space: lon/lat vs UTM for AABB?**
   - What we know: lon/lat AABB is valid for IoU ratio computation because IoU is dimensionless (degrees²/degrees²). UTM projection would give a more physically accurate AABB shape (especially near the poles), but the difference is negligible at city-scale bounding boxes.
   - What's unclear: Whether very high-latitude cities (Helsinki, Reykjavik) would have materially different results with UTM AABBs.
   - Recommendation: Use lon/lat AABB. The 0.3 threshold is calibrated for city-scale work where lon/lat AABBs are accurate enough. This keeps the implementation dependency-free and fast. Revisit only if real-world testing shows false negatives at high latitudes.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.0.0 |
| Config file | `vitest.config.ts` — `environment: 'jsdom'`, `globals: true` |
| Quick run command | `npx vitest run src/lib/overture/__tests__/dedup.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEDUP-01 | OSM buildings overlap Overture buildings at IoU ≥ 0.3 → Overture building removed | unit | `npx vitest run src/lib/overture/__tests__/dedup.test.ts` | ❌ Wave 0 |
| DEDUP-01 | Overture buildings with no OSM counterpart (IoU < 0.3) pass through unchanged | unit | `npx vitest run src/lib/overture/__tests__/dedup.test.ts` | ❌ Wave 0 |
| DEDUP-01 | Empty OSM list → all Overture features pass through (OSM-sparse area) | unit | `npx vitest run src/lib/overture/__tests__/dedup.test.ts` | ❌ Wave 0 |
| DEDUP-01 | L-shaped / large OSM buildings: AABB overlap still detected correctly | unit | `npx vitest run src/lib/overture/__tests__/dedup.test.ts` | ❌ Wave 0 |

### Test Cases to Cover

```typescript
// Case 1: Identical buildings (IoU = 1.0) → Overture removed
// Case 2: No overlap (IoU = 0.0) → Overture passes through
// Case 3: Partial overlap below threshold (IoU ~ 0.2) → Overture passes through
// Case 4: Partial overlap at threshold (IoU = 0.3) → Overture removed
// Case 5: Partial overlap above threshold (IoU = 0.5) → Overture removed
// Case 6: Empty OSM list → all Overture features returned (gap-fill area)
// Case 7: Empty Overture list → returns empty array
// Case 8: Multiple OSM buildings; Overture building overlaps only one → removed
// Case 9: Multiple Overture buildings; only some overlap OSM → subset returned
// Case 10: OSM building and Overture building are same feature but slightly misaligned
//          (realistic scenario from OSM crowdsource vs Overture ML alignment error) → removed
```

### Sampling Rate

- **Per task commit:** `npx vitest run src/lib/overture/__tests__/dedup.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green (241 currently passing) before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/lib/overture/__tests__/dedup.test.ts` — covers DEDUP-01 (all behaviors)

*(No framework install needed — Vitest 3.0.0 already configured)*

## Sources

### Primary (HIGH confidence)

- `src/lib/buildings/types.ts` — `BuildingFeature` type definition; `outerRing: [number, number][]` confirmed as `[lon, lat]` order — inspected 2026-02-28
- `src/lib/overture/parse.ts` — confirmed Overture rings include closing vertex `[A,B,C,D,A]` from `toGeoJSON`; `outerRing` coordinate order matches OSM pipeline — inspected 2026-02-28
- `src/lib/buildings/parse.ts` — confirmed OSM rings include closing vertex and same `[lon, lat]` coordinate order — inspected 2026-02-28
- `.planning/STATE.md` — "Bounding-box IoU at 0.3 threshold for deduplication (polygon-level, not centroid-distance)" — locked decision, 2026-02-28
- `package.json` — confirmed no spatial geometry library installed; no new deps needed — inspected 2026-02-28
- `npx vitest run` — full test suite: 241 tests passing across 19 files — verified 2026-02-28

### Secondary (MEDIUM confidence)

- Standard IoU algorithm for axis-aligned bounding boxes — widely documented (PyImageSearch, v7labs, Wikipedia); formula is `interArea / (areaA + areaB - interArea)` — cross-referenced multiple sources; algorithm is unambiguous
- IoU threshold 0.3 for building deduplication — analogous to NMS threshold in object detection; 0.3 is the standard NMS threshold in most detection papers (Faster R-CNN, YOLO) for handling overlapping ground truth annotations — MEDIUM confidence that 0.3 is the correct value for this use case (confirmed locked in STATE.md)

### Tertiary (LOW confidence)

- Performance estimate (O(N×M) < 1 second for 2000×2000 buildings) — estimated from typical JavaScript arithmetic throughput; not benchmarked against MapMaker build pipeline — LOW, flag for validation if large bboxes used

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; existing types confirmed by source inspection
- Algorithm: HIGH — AABB IoU is a well-known, unambiguous formula; locked decision from STATE.md removes any choice uncertainty
- Architecture: HIGH — follows exact same module pattern as Phase 10 (`tiles.ts`) and Phase 11 (`parse.ts`); new file `dedup.ts` + `dedup.test.ts` in established locations
- Pitfalls: HIGH — identified from code inspection and known edge cases in the IoU formula; all are preventable with defensive guards

**Research date:** 2026-02-28
**Valid until:** 2026-06-28 (AABB IoU is a stable mathematical concept; `BuildingFeature` type is unlikely to change; threshold is project-locked)
