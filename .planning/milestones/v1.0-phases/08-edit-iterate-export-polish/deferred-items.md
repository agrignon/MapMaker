# Deferred Items — Phase 08

## Pre-existing test failure (out of scope for 08-01)

**File:** `src/lib/mesh/__tests__/solid.test.ts`
**Test:** `buildSolidMesh > produces a watertight mesh with no boundary edges`
**Failure:** `expected 0.21621621621621623 to be less than 0.01`
**Context:** This failure exists on the committed codebase before any Phase 08 changes were applied (confirmed via git stash). The `solid.ts` file is not touched by Phase 08 work.
**Scope:** Pre-existing regression from Phase 08-02 STL export hardening work. Not introduced by this plan.
**Action needed:** Investigate `buildSolidMesh` boundary edge algorithm in a future plan.
