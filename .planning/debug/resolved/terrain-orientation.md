---
status: resolved
trigger: "terrain geographic orientation wildly wrong in 3D preview and STL export"
created: 2026-02-23T00:00:00Z
updated: 2026-02-23T00:00:00Z
---

## Current Focus

hypothesis: Stitching off-by-one bug in destCol/destRow formula causes 1px data shift at tile boundaries plus zero-elevation edge strips, but this alone may not explain "wildly wrong" orientation. Full pipeline otherwise traces correct.
test: Traced complete data path from tile fetch through stitch through Martini to mesh
expecting: Found the stitch bug; other components verify correct
next_action: Report diagnosis

## Symptoms

expected: 3D terrain preview and exported STL match real-world geographic orientation
actual: Terrain geographic orientation is "wildly wrong"
errors: None (visual orientation mismatch)
reproduction: Generate preview for any known geographic area, compare to real-world
started: Persists after Y-axis inversion fix in plan 02-04 (commit c75f3bc)

## Eliminated

- hypothesis: Y-axis inversion (vy=0 mapping to south instead of north)
  evidence: Fix already applied in terrain.ts line 118 — vy=0 now maps to positive Y (north). Test validates this.
  timestamp: 2026-02-23 (prior fix, commit c75f3bc)

- hypothesis: X-axis inversion (east-west mirror)
  evidence: vx=0 (west column) maps to x=-widthMM/2 (negative X = west). Col 0 of stitched array is westernmost tile's col 0 = geographic west. No mirror found.
  timestamp: 2026-02-23

- hypothesis: Tile fetch ordering puts tiles in wrong geographic positions
  evidence: Traced for Mount Rainier bbox at zoom 12. getTileRange produces yMin=1441 (north), row=0 fetches tileY=yMin=northernmost. Tile fetch loop correctly assigns row 0 = north, col 0 = west.
  timestamp: 2026-02-23

- hypothesis: Martini vertex coordinate system conflicts with elevation array indexing
  evidence: Martini uses terrain[ay * size + ax] internally and outputs vertices as (ax, ay) pairs. Our code reads vx=ax (column), vy=ay (row) and samples elevations[vy * gridSize + vx]. Both row-major. Correct.
  timestamp: 2026-02-23

- hypothesis: Triangle winding reversal from Y-flip causes wrong normals
  evidence: Analytically verified that Y-flip consistently reverses all Martini triangles from CW to CCW, producing correct upward-facing normals in 3D. DoubleSide rendering also mitigates any winding issues.
  timestamp: 2026-02-23

- hypothesis: Camera/scene setup misrepresents geographic orientation
  evidence: Camera at [200,-300,250] with up=[0,0,1] gives a southeast viewpoint looking northwest. OrbitControls allows rotation. Not a data orientation issue.
  timestamp: 2026-02-23

- hypothesis: X/Y swap somewhere in the pipeline
  evidence: Column index (vx) consistently maps to X position, row index (vy) consistently maps to Y position, throughout all stages. No swap found.
  timestamp: 2026-02-23

- hypothesis: Bounding box corners (SW/NE) swapped or misinterpreted
  evidence: useTerradraw normalizes with Math.min/max. setBbox passes to fetchElevationForBbox correctly. No swap.
  timestamp: 2026-02-23

## Evidence

- timestamp: 2026-02-23
  checked: stitchTileElevations destCol formula for non-first tiles
  found: Off-by-one bug. For col>0, destCol = destColOffset + srcCol - 1, but destColOffset = col * (tileSize-1) already accounts for border overlap. The -1 double-counts the overlap, shifting all non-first tile data 1 pixel left. Same bug exists for rows. Last column and last row of stitched grid are never written (stay at 0).
  implication: Multi-tile scenarios have: (1) 1px data shift at each tile boundary, (2) zero-elevation strip at east/south edges. Verified with simulation: expected [A,B,C,D,E,F,G] but got [A,B,C,E,F,G,_].

- timestamp: 2026-02-23
  checked: Complete data pipeline from tile fetch through mesh generation
  found: All orientation mappings are correct: row 0 = north throughout pipeline, col 0 = west throughout pipeline, Y-axis fix correctly maps north to positive Y, X mapping correctly maps west to negative X.
  implication: No geographic orientation flip or rotation found in the pipeline. The Y-axis fix appears correct.

- timestamp: 2026-02-23
  checked: Regression test coverage
  found: stitch-terrain.test.ts only tests single-grid scenarios (synthetic elevation data). Does NOT test multi-tile stitching pipeline. Does NOT verify against real geographic data.
  implication: Test validates terrain.ts Y-flip but cannot catch stitching bugs or full-pipeline orientation issues.

## Resolution

root_cause: Primary confirmed bug is in stitchTileElevations (stitch.ts lines 44-49): the destCol/destRow formula for non-first tiles double-counts the border overlap, shifting tile data by 1 pixel and leaving zero-elevation strips at the east and south edges. However, this is a SUBTLE bug (1px shift) and alone may not explain "wildly wrong" orientation. Full pipeline orientation traces correct after the Y-axis fix. The remaining orientation perception issue may require visual verification with a known geographic location and comparison screenshots to diagnose further.
fix:
verification:
files_changed: []
