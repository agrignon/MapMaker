---
status: resolved
trigger: "Tile stitching bug — hard cliff-like seam lines at tile boundaries in terrain mesh"
created: 2026-02-23T12:00:00Z
updated: 2026-02-23T12:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — stitchTileElevations assumes 1-pixel border overlap between adjacent tiles, but MapTiler terrain-rgb-v2 tiles are standard 256x256 raster tiles with NO overlap
test: Traced destination index math with concrete 2-column example; found off-by-one gaps and data misalignment
expecting: N/A — root cause confirmed
next_action: Return diagnosis

## Symptoms

expected: Smooth, continuous terrain surface across tile boundaries in 3D mesh
actual: Hard cliff-like seam lines forming a grid pattern at tile boundaries
errors: None (visual artifact, not runtime error)
reproduction: Generate terrain for any bbox that spans multiple tiles; observe mesh in 3D preview
started: From initial implementation

## Eliminated

(none needed — root cause found on first hypothesis)

## Evidence

- timestamp: 2026-02-23T12:00:00Z
  checked: stitch.ts stitchTileElevations — border deduplication logic
  found: Code assumes adjacent tiles share a 1-pixel border (comment on line 18: "Adjacent tiles share a 1-pixel border") and skips srcCol=0 / srcRow=0 for non-first tiles
  implication: If tiles do NOT share borders, this skips real data and creates gaps

- timestamp: 2026-02-23T12:01:00Z
  checked: MapTiler terrain-rgb-v2 tile format and web Mercator standard
  found: Standard XYZ raster tiles are 256x256 with NO overlap. Only Mapbox terrain-DEM-v1 has 1px buffer (producing 258x258 tiles). MapTiler terrain-rgb-v2 uses standard 256x256 tiles.
  implication: The entire stitching approach is built on a false assumption

- timestamp: 2026-02-23T12:02:00Z
  checked: Destination index math in stitchTileElevations with 2x1 grid, tileSize=4
  found: For tile(1,0), destCol maps srcCol [1,2,3] to destCol [3,4,5] but stitchedWidth=7 means column 6 is never written. The skipping of srcCol=0 on non-first tiles causes (a) a lost column of real data from each tile, (b) the last column of the stitched grid is never populated (defaults to 0.0 elevation), and (c) the destCol offset double-counts the "shared" border, creating misalignment.
  implication: Each tile boundary has elevation data dropped on one side, creating a cliff to 0 or to misaligned data

- timestamp: 2026-02-23T12:03:00Z
  checked: stitchedWidth formula: cols * tileSize - (cols - 1)
  found: For 2 cols of 256px tiles with NO overlap, correct width is 2 * 256 = 512 pixels. The code computes 2 * 256 - 1 = 511. This means the output grid is 1 pixel too narrow per tile boundary, AND the skip-first-pixel logic drops another pixel of real data.
  implication: Grid dimensions are wrong AND data is misaligned

- timestamp: 2026-02-23T12:04:00Z
  checked: Martini mesh builder (terrain.ts) for secondary seam causes
  found: Martini operates on a single resampled grid — no per-tile awareness. If the input elevation grid has discontinuities (which the stitching bug creates), Martini faithfully reproduces them. The mesh builder itself is correct.
  implication: Martini is not contributing to the problem; the input data is bad

## Resolution

root_cause: |
  PRIMARY BUG: stitchTileElevations in stitch.ts (lines 18-55) assumes that adjacent
  MapTiler terrain-rgb-v2 tiles share a 1-pixel border and must be deduplicated.
  This assumption is FALSE. Standard XYZ raster tiles (including MapTiler terrain-rgb-v2)
  are exactly 256x256 pixels with NO overlap between adjacent tiles.

  The false assumption causes three compounding errors:

  1. WRONG GRID DIMENSIONS (line 28-29): stitchedWidth = cols * tileSize - (cols - 1)
     computes 511 for a 2x1 grid of 256px tiles. Correct value is 512.
     Each tile boundary shrinks the grid by 1 pixel.

  2. DROPPED DATA (lines 40-41): srcColStart = col === 0 ? 0 : 1 and
     srcRowStart = row === 0 ? 0 : 1 skip the first column/row of non-first tiles.
     These pixels contain unique elevation data (not duplicates), so real data is lost.

  3. MISALIGNED DEST INDICES (line 46-47): The dest offset calculation subtracts 1
     for non-first tiles to account for the "skipped border." Combined with the wrong
     grid dimensions, this leaves the last column/row of the stitched grid unwritten
     (defaulting to 0.0 elevation), which creates a hard cliff at the far edge.

  Net effect: At every tile boundary, one column/row of real elevation data is dropped
  and replaced with data from the wrong position or zero. This produces the visible
  cliff-like seams in the mesh at tile boundary locations.

fix: (not applied — research only)
verification: (not applied — research only)
files_changed: []
