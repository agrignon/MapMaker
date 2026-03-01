# Phase 13: Pipeline Integration - Research

**Researched:** 2026-02-28
**Domain:** Async orchestration, React state wiring, TypeScript
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Fetch orchestration:**
- Overture fetch fires in parallel with the OSM Overpass request inside `fetchOsmLayersStandalone`, not alongside elevation
- Both fetches use `Promise.all` or equivalent — wait for both to resolve before setting `buildingFeatures`
- Single combined status text: "Fetching buildings..." while loading, then total merged count ("47 buildings found") — user doesn't see two sources
- Shared AbortController signal: new bbox selection cancels both OSM and Overture in-flight requests. `fetchOvertureTiles` already accepts `callerSignal`

**Merge + store strategy:**
- Run `deduplicateOverture(osmBuildings, overtureBuildings)` to get gap-fill list, then concat `osmBuildings + gapFill` into `buildingFeatures`
- No separate store slices — `buildingFeatures` holds the merged list directly. BuildingMesh and ExportPanel read it unchanged
- Building count displayed to user is the total merged count only — no source breakdown
- Building geometry stays on the main thread (BuildingMesh uses `buildAllBuildings` directly). No worker changes
- STL export needs no special handling — Overture gap-fills are BuildingFeature just like OSM, flow through the same watertight shell pipeline

**Fallback behavior:**
- Completely silent fallback: if Overture fails, user gets OSM-only with no warning or degraded state indicator
- `overtureAvailable` flag in store tracks availability internally (already exists from Phase 10)
- Always retry Overture on Regenerate — each generation is a fresh attempt. The 5-second timeout keeps it bounded
- Empty Overture tiles (available: true, no buildings) — just show OSM total count, no mention of Overture
- Keep existing `console.warn` for Overture failures — useful for debugging, invisible to users

### Claude's Discretion
- Exact `Promise.all` vs sequential-with-early-start pattern for parallel fetching
- Whether to add AbortController to `fetchOsmLayersStandalone` (currently has none) or manage it at the caller level
- How to structure the dedup + concat logic within `fetchOsmLayersStandalone` or a new helper
- Test strategy for integration (unit tests on the wiring, or relying on Phase 10-12 unit tests + manual verification)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INTEG-01 | OSM and Overture fetches run in parallel (no added latency) | `Promise.allSettled` pattern — OSM resolves via `fetchAllOsmData`, Overture via `fetchOvertureTiles`; both launched from `fetchOsmLayersStandalone` before either `await` |
| INTEG-02 | Gap-fill buildings from Overture appear in 3D preview alongside OSM buildings | `deduplicateOverture(osmBuildings, overtureBuildings)` gap-fill concat'd onto `osmBuildings`, set via `setBuildingFeatures` — `BuildingMesh` reads `buildingFeatures` unchanged, no consumer modifications needed |
| INTEG-03 | Gap-fill buildings from Overture are included in STL export as watertight geometry | Same store slot as INTEG-02; `ExportPanel` reads `buildingFeatures`, passes to `buildAllBuildings` — no export-side changes needed; Overture `BuildingFeature` is type-compatible |
</phase_requirements>

## Summary

Phase 13 is a pure wiring phase. All implementation components exist and are individually tested: `fetchOvertureTiles`, `parseOvertureTiles`, and `deduplicateOverture` are implemented, exported, and verified in isolation. The store already has `buildingFeatures`, `setBuildingFeatures`, `overtureAvailable`, and `setOvertureAvailable`. `BuildingMesh` and `ExportPanel` already consume `buildingFeatures`. Nothing in the preview or export stack needs to change.

The entire phase reduces to one function modification: `fetchOsmLayersStandalone` in `src/components/Sidebar/GenerateButton.tsx` must fire `fetchOvertureTiles(bbox, signal)` in parallel with `fetchAllOsmData(bbox)`, parse the Overture result, dedup it, merge with OSM buildings, and set the combined list in the store. The milestone audit confirms exactly three orphaned exports (`fetchOvertureTiles`, `parseOvertureTiles`, `setOvertureAvailable`) that are never called from production code — this phase closes all three gaps.

The one genuine discretion area is the parallel fetch mechanism. `Promise.allSettled` is the correct choice because `fetchAllOsmData` throws on HTTP error while `fetchOvertureTiles` never throws (it returns `{ available: false }` on any failure). Using `allSettled` treats both paths uniformly while preserving the existing OSM error-propagation behavior.

**Primary recommendation:** Modify `fetchOsmLayersStandalone` to launch both fetches simultaneously via `Promise.allSettled`, parse and dedup inside that function, and set the merged list via `setBuildingFeatures`. One plan, one commit.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Native `Promise.allSettled` | ES2020 (built-in) | Parallel async with heterogeneous error handling | OSM throws; Overture never throws — `allSettled` avoids short-circuit that `Promise.all` would cause |
| `fetchOvertureTiles` | project (overture/index.ts) | Fetch + timeout + abort support | Already implemented in Phase 10; accepts `callerSignal` |
| `parseOvertureTiles` | project (overture/parse.ts) | MVT → BuildingFeature[] | Already implemented in Phase 11 |
| `deduplicateOverture` | project (overture/dedup.ts) | AABB IoU filter | Already implemented in Phase 12 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `AbortController` | Web API (built-in) | Cancel in-flight Overture request on bbox change | Add to `fetchOsmLayersStandalone` — currently has no abort support; Overture already accepts `callerSignal` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `Promise.allSettled` | `Promise.all` | `Promise.all` short-circuits on first rejection — OSM error would skip Overture processing; incorrect behavior |
| `Promise.allSettled` | Sequential start (fire Overture, then await OSM) | Functionally equivalent parallelism if Overture is fired before `await osmData`, but harder to reason about; `allSettled` is clearer intent |
| AbortController inside function | AbortController at caller level | Function-level AbortController gives each call site a cancellable handle without leaking controller to callers; simpler |

**Installation:** No new packages required — all dependencies already installed.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── components/Sidebar/GenerateButton.tsx  # ONLY file modified — fetchOsmLayersStandalone
├── lib/overture/index.ts                  # fetchOvertureTiles (already exists, no changes)
├── lib/overture/parse.ts                  # parseOvertureTiles (already exists, no changes)
├── lib/overture/dedup.ts                  # deduplicateOverture (already exists, no changes)
└── store/mapStore.ts                      # setBuildingFeatures, setOvertureAvailable (no changes)
```

### Pattern 1: Parallel Fetch with allSettled

**What:** Launch both async operations before awaiting either. Use `Promise.allSettled` to wait for both regardless of individual outcomes.

**When to use:** When one fetch can succeed independently of the other, and failures in one should not block the other.

**Example:**
```typescript
// Source: MDN Promise.allSettled + project existing pattern
async function fetchOsmLayersStandalone(bbox: BoundingBox, s: ReturnType<typeof useMapStore.getState>) {
  s.setBuildingGenerationStatus('fetching', 'Fetching buildings...');
  s.setRoadGenerationStatus('fetching', 'Fetching OSM data...');
  s.setWaterGenerationStatus('fetching', 'Fetching OSM data...');
  s.setVegetationGenerationStatus('fetching', 'Fetching OSM data...');

  // AbortController for cancelling Overture on bbox change or error
  const controller = new AbortController();

  // Launch both fetches in parallel — do NOT await before the other is started
  const [osmResult, overtureResult] = await Promise.allSettled([
    fetchAllOsmData(bbox),
    fetchOvertureTiles(bbox, controller.signal),
  ]);

  // --- OSM branch ---
  if (osmResult.status === 'rejected') {
    const message = osmResult.reason instanceof Error ? osmResult.reason.message : 'OSM fetch failed';
    s.setBuildingGenerationStatus('error', message);
    s.setRoadGenerationStatus('error', message);
    s.setWaterGenerationStatus('error', message);
    s.setVegetationGenerationStatus('error', message);
    controller.abort(); // cancel any in-flight Overture work
    return;
  }
  const osmData = osmResult.value;

  // Parse OSM layers (roads, water, vegetation unchanged)
  const osmBuildings = parseBuildingFeatures(osmData);
  const roads = parseRoadFeatures(osmData);
  // ... set roads/water/vegetation as before ...

  // --- Overture branch (fetchOvertureTiles never throws — allSettled always 'fulfilled') ---
  let gapFill: BuildingFeature[] = [];
  if (overtureResult.status === 'fulfilled') {
    const { tiles, available } = overtureResult.value;
    s.setOvertureAvailable(available);
    if (available && tiles.size > 0) {
      const overtureBuildings = parseOvertureTiles(tiles);
      gapFill = deduplicateOverture(osmBuildings, overtureBuildings);
    }
  }

  // Merge and set — single combined list
  const mergedBuildings = [...osmBuildings, ...gapFill];
  s.setBuildingFeatures(mergedBuildings);
  s.setBuildingGenerationStatus('ready', `${mergedBuildings.length} buildings found`);
}
```

### Pattern 2: Status Text — Single Combined Message

**What:** User sees a single "Fetching buildings..." status during the parallel fetch, and a single count afterward. No indication of two sources.

**When to use:** Per locked decision — user does not see two sources.

**Example:**
```typescript
// Before fetches start:
s.setBuildingGenerationStatus('fetching', 'Fetching buildings...');

// After merge complete:
s.setBuildingGenerationStatus('ready', `${mergedBuildings.length} buildings found`);
```

### Pattern 3: Silent Overture Fallback

**What:** Overture failure results in OSM-only, with no user-visible state change. `overtureAvailable` is set to `false` internally but no UI reacts to it.

**When to use:** Always — locked decision.

**Example:**
```typescript
// fetchOvertureTiles always resolves (never rejects) — available=false on any error
// The existing console.warn inside fetchOvertureTiles handles debug logging
// Caller just checks available flag:
if (available) {
  // process tiles...
}
s.setOvertureAvailable(available); // store knows, but no UI reads it for error display
```

### Anti-Patterns to Avoid

- **Sequential fetch (await OSM then await Overture):** Adds Overture fetch latency on top of OSM latency. `fetchOvertureTiles` has a 5-second timeout — serial execution could add 5s to the worst case. INTEG-01 requires parallel.
- **Promise.all instead of Promise.allSettled:** `fetchAllOsmData` throws on HTTP error. `Promise.all` would fast-fail and skip `fetchOvertureTiles` handling entirely. `allSettled` is correct.
- **Separate buildingFeatures slice for Overture:** The locked decision is a single flat list. No new store state needed.
- **Modifying BuildingMesh or ExportPanel:** Both components already consume `buildingFeatures` — they work with any `BuildingFeature[]` regardless of source. Do not add source-awareness to consumers.
- **Worker changes:** Building geometry stays on main thread per locked decision. `meshBuilder.worker.ts` is untouched.
- **AbortController race on re-generate:** Each call to `fetchOsmLayersStandalone` should create a fresh AbortController. The controller is not shared across calls — it is scoped to one invocation.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parallel fetch | Custom queue/scheduler | Native `Promise.allSettled` | ES2020 built-in; handles heterogeneous error states correctly |
| MVT decode | Custom protobuf parser | `parseOvertureTiles` (Phase 11) | Already implemented, tested, winding-normalized, area-filtered |
| Duplicate removal | Custom centroid matching | `deduplicateOverture` (Phase 12) | Already implemented, tested, locked at IoU >= 0.3 |
| Building 3D geometry | Custom Overture geometry path | Existing `buildAllBuildings` pipeline | Overture `BuildingFeature` is type-compatible; no new geometry code needed |

**Key insight:** This phase is entirely wiring. The hard work is done. Any new implementation beyond wiring indicates scope creep.

## Common Pitfalls

### Pitfall 1: Awaiting Serially Instead of Parallel
**What goes wrong:** Writing `const osmData = await fetchAllOsmData(bbox); const overture = await fetchOvertureTiles(bbox)` — this is sequential, not parallel. Violates INTEG-01.
**Why it happens:** Sequential await is the default mental model for async/await code.
**How to avoid:** Always start both Promises before the first await. `Promise.allSettled([p1, p2])` or fire Overture first then `await osmData`.
**Warning signs:** If timing shows the total time equals OSM time + Overture time, it's sequential.

### Pitfall 2: Using Promise.all and Losing Overture Result on OSM Failure
**What goes wrong:** `Promise.all` rejects as soon as either promise rejects. OSM failure would prevent `setOvertureAvailable` from being called, leaving the store in a stale state.
**Why it happens:** `Promise.all` is the more familiar API.
**How to avoid:** Use `Promise.allSettled`. Check `.status === 'fulfilled'` for OSM before processing; `fetchOvertureTiles` always fulfills.
**Warning signs:** OSM error path that never calls `setOvertureAvailable`.

### Pitfall 3: Wrong Import Path for Overture Functions
**What goes wrong:** Importing `fetchOvertureTiles` from `../../lib/overture/tiles` instead of `../../lib/overture/index`.
**Why it happens:** `tiles.ts` is where the raw tile fetching lives; `index.ts` is the public API with timeout + silent fallback wrapper.
**How to avoid:** Always import `fetchOvertureTiles` from `../../lib/overture/index`. Import `parseOvertureTiles` from `../../lib/overture/parse`. Import `deduplicateOverture` from `../../lib/overture/dedup`.
**Warning signs:** Importing `fetchTilesFromArchive` directly — that's the low-level function without the 5-second timeout wrapper.

### Pitfall 4: Forgetting to Set overtureAvailable
**What goes wrong:** Overture result processed, buildings merged, but `setOvertureAvailable` never called. The milestone audit flags this as an orphaned action.
**Why it happens:** `overtureAvailable` has no visible UI effect, so it's easy to omit.
**How to avoid:** Call `s.setOvertureAvailable(available)` from `overtureResult.value.available` after `Promise.allSettled` resolves.
**Warning signs:** `overtureAvailable` remains `false` in all scenarios after generate.

### Pitfall 5: Breaking Existing 176 Tests
**What goes wrong:** Modifying function signatures, adding required parameters, or changing module exports in a way that breaks existing test mocks.
**Why it happens:** `fetchOsmLayersStandalone` is not currently tested (it's a private function inside the component module). But the functions it calls (`fetchAllOsmData`, `parseBuildingFeatures`, etc.) are tested.
**How to avoid:** Keep all existing function signatures unchanged. Add new imports only. The new code lives entirely inside `fetchOsmLayersStandalone`.
**Warning signs:** TypeScript errors in test files after the change.

### Pitfall 6: Status Text Regression During Parallel Fetch
**What goes wrong:** The old code set `setBuildingGenerationStatus('fetching', 'Fetching OSM data...')` — after this change the message should be `'Fetching buildings...'` (hiding the two-source nature). If the old string is left in, the UI implies only OSM.
**Why it happens:** Forgetting to update the status string.
**How to avoid:** Status text review: "Fetching buildings..." during fetch, `${total} buildings found` after, where total includes gap-fill.

## Code Examples

### Current fetchOsmLayersStandalone (baseline to modify)
```typescript
// Source: src/components/Sidebar/GenerateButton.tsx (current implementation)
async function fetchOsmLayersStandalone(bbox: BoundingBox, s: ReturnType<typeof useMapStore.getState>) {
  s.setBuildingGenerationStatus('fetching', 'Fetching OSM data...');
  // ... sets all 4 layer statuses

  try {
    const osmData = await fetchAllOsmData(bbox);

    const buildings = parseBuildingFeatures(osmData);
    s.setBuildingFeatures(buildings);
    s.setBuildingGenerationStatus('ready', `${buildings.length} buildings found`);

    const roads = parseRoadFeatures(osmData);
    s.setRoadFeatures(roads);
    s.setRoadGenerationStatus('ready', `${roads.length} roads found`);
    // ... water, vegetation ...
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OSM fetch failed';
    s.setBuildingGenerationStatus('error', message);
    // ... propagate to all 4 layers
  }
}
```

### Parallel fetch pattern (reference)
```typescript
// Source: MDN Web Docs, Promise.allSettled
const [result1, result2] = await Promise.allSettled([promise1, promise2]);
if (result1.status === 'fulfilled') { /* use result1.value */ }
if (result1.status === 'rejected') { /* use result1.reason */ }
// result2 from fetchOvertureTiles is ALWAYS 'fulfilled' — it never throws
```

### Imports to add to GenerateButton.tsx
```typescript
import { fetchOvertureTiles } from '../../lib/overture/index';
import { parseOvertureTiles } from '../../lib/overture/parse';
import { deduplicateOverture } from '../../lib/overture/dedup';
import type { BuildingFeature } from '../../lib/buildings/types';
```

### Merge logic
```typescript
// After allSettled resolves and OSM is confirmed successful:
const osmBuildings = parseBuildingFeatures(osmData);

let gapFill: BuildingFeature[] = [];
if (overtureResult.status === 'fulfilled') {
  const { tiles, available } = overtureResult.value;
  s.setOvertureAvailable(available);
  if (available && tiles.size > 0) {
    const overtureBuildings = parseOvertureTiles(tiles);
    gapFill = deduplicateOverture(osmBuildings, overtureBuildings);
  }
}

const merged = [...osmBuildings, ...gapFill];
s.setBuildingFeatures(merged);
s.setBuildingGenerationStatus('ready', `${merged.length} buildings found`);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Sequential OSM-only building fetch | Parallel OSM + Overture with merge | Phase 13 (this phase) | Adds gap-fill with no latency penalty |
| `setBuildingFeatures(osmBuildings)` | `setBuildingFeatures([...osmBuildings, ...gapFill])` | Phase 13 | Same store slot, more buildings |
| `overtureAvailable` never set | `setOvertureAvailable(available)` called after each generate | Phase 13 | Closes orphaned store action |

**Deprecated/outdated:**
- Status message `'Fetching OSM data...'` for buildings: replaced by `'Fetching buildings...'` to hide dual-source nature.

## Open Questions

1. **AbortController placement — should fetchOsmLayersStandalone accept a callerSignal or create its own?**
   - What we know: `fetchOvertureTiles` accepts an optional `callerSignal`. The current caller (`triggerRegenerate`) fires `fetchOsmLayersStandalone` as fire-and-forget (`void fetchOsmLayersStandalone(...)`). No cancellation exists today.
   - What's unclear: Whether the planner wants to add bbox-change cancellation (the CONTEXT.md mentions it as a goal for "shared AbortController signal"), or whether this is sufficient for Phase 13 scope given the 5-second timeout backstop.
   - Recommendation: Create an internal AbortController inside `fetchOsmLayersStandalone` and pass its signal to `fetchOvertureTiles`. This gives Overture its timeout-bounded signal without requiring the caller to be modified. Full cross-request cancellation on bbox change is a future enhancement if needed — the 5-second timeout is sufficient protection for this phase.

2. **TypeScript type for Promise.allSettled result destructuring**
   - What we know: `Promise.allSettled` returns `PromiseSettledResult<T>[]` — each element is either `PromiseFulfilledResult<T>` or `PromiseRejectedResult`.
   - What's unclear: Whether tsconfig targets ES2020+ where `Promise.allSettled` is native, or needs polyfill.
   - Recommendation: Check existing tsconfig. The project is a Vite + React 19 app targeting modern browsers — `allSettled` is available natively since 2020 (all modern browsers). No polyfill needed.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (jsdom environment) |
| Config file | `/Users/agrignon/projects/MapMaker/vitest.config.ts` |
| Quick run command | `npx vitest run` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INTEG-01 | OSM and Overture fetches run simultaneously (neither awaited before other starts) | unit | `npx vitest run src/components/Sidebar/__tests__/GenerateButton.test.ts` | ❌ Wave 0 |
| INTEG-02 | Gap-fill buildings enter `buildingFeatures` store alongside OSM buildings | unit | `npx vitest run src/components/Sidebar/__tests__/GenerateButton.test.ts` | ❌ Wave 0 |
| INTEG-03 | Overture gap-fills flow through STL export unchanged (via store slot) | unit (store) | `npx vitest run src/components/Sidebar/__tests__/GenerateButton.test.ts` | ❌ Wave 0 |

**Note on INTEG-03:** The STL export path does not need a new test. `ExportPanel` already reads `buildingFeatures` without modification. The guarantee is that `setBuildingFeatures` is called with the merged list — testing the store write covers INTEG-03. If a direct export test is desired, it would be a manual/smoke test (requires browser + WebGL), not a Vitest unit test.

### Sampling Rate
- **Per task commit:** `npx vitest run`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/components/Sidebar/__tests__/GenerateButton.test.ts` — covers INTEG-01, INTEG-02, INTEG-03

**What these tests must cover:**
1. Both `fetchAllOsmData` and `fetchOvertureTiles` are called when `fetchOsmLayersStandalone` runs (parallelism is verified by checking both are called, not by timing)
2. When Overture returns gap-fill buildings, `setBuildingFeatures` receives the merged OSM + gap-fill list
3. When Overture fails (available: false), `setBuildingFeatures` receives OSM-only list
4. `setOvertureAvailable` is called with `true` when Overture returns available tiles
5. `setOvertureAvailable` is called with `false` when Overture returns available: false

**Test setup notes:**
- Mock `fetchAllOsmData` to return synthetic OSM data
- Mock `fetchOvertureTiles` to return `OvertureResult` with controlled `tiles` and `available`
- Mock `parseOvertureTiles` and `deduplicateOverture` to return controlled arrays
- Use `useMapStore.getState()` to assert store mutations
- Pattern: vitest's `vi.mock` on module level (see `tiles.test.ts` as reference)

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection (`src/components/Sidebar/GenerateButton.tsx`) — exact function to modify identified
- Direct codebase inspection (`src/store/mapStore.ts`) — all required actions already exist
- Direct codebase inspection (`src/lib/overture/index.ts`, `parse.ts`, `dedup.ts`) — all required functions exist and are ready
- `.planning/v1.1-MILESTONE-AUDIT.md` — confirms orphaned exports and exact integration gaps
- `.planning/phases/13-pipeline-integration/13-CONTEXT.md` — locked decisions

### Secondary (MEDIUM confidence)
- MDN Promise.allSettled API documentation — well-known ES2020 standard API

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries are existing project code; no new dependencies
- Architecture: HIGH — single function to modify, confirmed by milestone audit and context
- Pitfalls: HIGH — derived directly from reading the actual code and audit findings

**Research date:** 2026-02-28
**Valid until:** Indefinite — no external API dependencies; all findings are from the project codebase itself
