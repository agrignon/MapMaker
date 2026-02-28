---
status: resolved
phase: 02-terrain-preview-export
source: [02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md, 02-04-SUMMARY.md]
started: 2026-02-23T12:00:00Z
updated: 2026-02-23T12:15:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Generate Terrain Preview
expected: Draw a bounding box on the map, click "Generate" in the left sidebar. A loading spinner appears. After loading, the screen splits into map (left) and 3D terrain preview (right).
result: issue
reported: "the 3d block part is fine but there are hard terrain lines from tile boundaries - visible seams forming a grid where tiles meet with elevation discontinuities that don't exist in real terrain. This is a zoomed in area around my house with no real terrain cliffs."
severity: major

### 2. 3D Terrain Visualization
expected: The 3D preview shows a terrain mesh with green-to-brown-to-white elevation coloring (hypsometric tinting). You can rotate, zoom, and pan the view with the mouse. A grid plane and axes gizmo helper are visible in the scene.
result: pass

### 3. Exaggeration Slider
expected: A collapsible sidebar appears on the right edge of the 3D preview panel. It contains an exaggeration slider (range 0.5x to 5x). Dragging it updates the terrain height in real-time without a full remesh or delay.
result: pass

### 4. Base Plate Thickness Control
expected: The preview sidebar also has a base plate thickness input (in mm). The value can be changed and is used during STL export.
result: pass

### 5. Export STL with Progress
expected: Click "Export STL" in the export panel (inside the preview sidebar). A labeled progress bar advances through stages: building → validating → writing. When complete, a download dialog appears showing file size, triangle count, and model dimensions.
result: pass

### 6. STL File Validity
expected: The downloaded .stl file opens in a slicer (e.g. Bambu Studio, PrusaSlicer) without mesh repair warnings. The model slices successfully and could be printed.
result: pass

### 7. Terrain Geographic Orientation
expected: The terrain in both the 3D preview and exported STL correctly matches real-world geography — north is at the top, south at the bottom. Features (mountains, valleys) appear in the correct positions, not rotated or mirrored into quadrants.
result: issue
reported: "there is something wildly wrong with this aspect"
severity: major

## Summary

total: 7
passed: 5
issues: 2
pending: 0
skipped: 0

## Gaps

- truth: "Terrain mesh should be smooth and continuous with no artificial seams at tile boundaries"
  status: resolved
  reason: "User reported: hard terrain lines from tile boundaries - visible seams forming a grid where tiles meet with elevation discontinuities that don't exist in real terrain. Zoomed-in area with no real cliffs shows cliff-like artifacts at tile edges."
  severity: major
  test: 1
  root_cause: "stitchTileElevations in stitch.ts is built on a false assumption that MapTiler terrain-rgb-v2 tiles share a 1-pixel border overlap. Standard XYZ raster tiles are exactly 256x256 with NO overlap. This causes: (1) wrong grid dimensions (cols*256-(cols-1) instead of cols*256), (2) first col/row of non-first tiles skipped (srcColStart=1), dropping real elevation data, (3) misaligned destination indices leaving last col/row as zero."
  artifacts:
    - path: "src/lib/elevation/stitch.ts"
      issue: "False border-overlap assumption in stitchTileElevations (lines 18-55) and fetchElevationForBbox (lines 141-142)"
  missing:
    - "Replace border-dedup stitching with simple concatenation: grid = cols*tileSize x rows*tileSize, copy all pixels, dest offset = col*tileSize / row*tileSize"
    - "Add multi-tile stitching regression test verifying no discontinuities at tile boundaries"
  debug_session: ".planning/debug/tile-boundary-seams.md"

- truth: "Terrain correctly matches real-world geography — north at top, south at bottom, features in correct positions"
  status: resolved
  reason: "User reported: there is something wildly wrong with this aspect"
  severity: major
  test: 7
  root_cause: "Same stitching bug as Gap 1 causes zero-elevation strips at east and south edges, creating false cliffs that distort geographic features. The Y-axis fix in terrain.ts is confirmed correct. The stitching off-by-one shifts tile data and leaves unwritten zero-elevation strips on east/south edges, which combined with the camera viewing from southeast makes terrain appear wildly wrong compared to the map."
  artifacts:
    - path: "src/lib/elevation/stitch.ts"
      issue: "Off-by-one in destCol/destRow (lines 46-48) leaves zero strips at east/south edges"
    - path: "src/lib/elevation/__tests__/stitch-terrain.test.ts"
      issue: "Only tests single-grid; no coverage of multi-tile stitching"
  missing:
    - "Fix stitch.ts (same fix as Gap 1 resolves this)"
    - "Add multi-tile stitching test with known corner values to verify full grid population"
  debug_session: ".planning/debug/terrain-orientation.md"
