---
status: diagnosed
phase: 05-roads-layer
source: [05-01-SUMMARY.md, 05-02-SUMMARY.md]
started: 2026-02-24T22:00:00Z
updated: 2026-02-25T08:45:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Road Ribbons in 3D Preview
expected: After generating a map for an area with roads, road ribbons appear on the terrain in the 3D preview. Roads are dark gray (#555555) with varying widths by tier (highways widest, residential narrowest).
result: issue
reported: "fail - no roads appear on the model"
severity: major

### 2. Road Style Toggle (Recessed / Raised / Flat)
expected: In the Roads sidebar section, three style buttons (recessed/raised/flat) are visible. Clicking each rebuilds the road mesh — recessed roads sit below terrain surface, raised roads sit above, flat roads are flush.
result: issue
reported: "fail"
severity: major

### 3. Road Layer Toggle
expected: The Roads sidebar section has a layer toggle. Toggling it off hides road ribbons from the 3D preview. Toggling it back on shows them again.
result: issue
reported: "fail - there is a toggle but it does nothing"
severity: major

### 4. Road Generation Status
expected: After clicking Generate, road generation progress appears below the Generate button (alongside building status). Terrain is visible immediately while roads load in the background.
result: issue
reported: "fail"
severity: major

### 5. Roads in STL Export
expected: Clicking Export STL produces a file that includes road geometry merged with the terrain. Opening the STL in a slicer or viewer shows road features on the terrain surface.
result: issue
reported: "fail"
severity: major

### 6. Export Filename Includes Roads
expected: When roads are present, the exported STL filename includes "-roads" in the suffix (e.g., "mapmaker-terrain-buildings-roads.stl" or "mapmaker-terrain-roads.stl").
result: issue
reported: "fail"
severity: major

## Summary

total: 6
passed: 0
issues: 6
pending: 0
skipped: 0

## Gaps

- truth: "Road ribbons appear on the terrain in the 3D preview after generating a map"
  status: failed
  reason: "User reported: fail - no roads appear on the model"
  severity: major
  test: 1
  root_cause: "Z-fighting: recessed road ribbon top face sits at exact terrain Z, GPU depth buffer picks terrain over road. No polygonOffset or position offset on RoadMesh."
  artifacts:
    - path: "src/components/Preview/RoadMesh.tsx"
      issue: "No Z-offset or polygonOffset on mesh/material — roads invisible under terrain"
  missing:
    - "Add position={[0, 0, 0.15]} to mesh element"
    - "Add polygonOffset, polygonOffsetFactor={-4}, polygonOffsetUnits={-4} to material"
  debug_session: ".planning/phases/05-roads-layer/05-DIAGNOSIS.md"
- truth: "Road style toggle (recessed/raised/flat) is visible and rebuilds road mesh on click"
  status: failed
  reason: "User reported: fail"
  severity: major
  test: 2
  root_cause: "Cascading from Root Cause 1 — roads are built but invisible due to Z-fighting regardless of style mode"
  artifacts:
    - path: "src/components/Preview/RoadMesh.tsx"
      issue: "Z-fighting in all three style modes"
  missing:
    - "Fix Z-fighting (same fix as Test 1)"
  debug_session: ".planning/phases/05-roads-layer/05-DIAGNOSIS.md"
- truth: "Road layer toggle hides/shows road ribbons in the 3D preview"
  status: failed
  reason: "User reported: fail - there is a toggle but it does nothing"
  severity: major
  test: 3
  root_cause: "Cascading from Root Cause 1 — toggle works (sets visible prop) but roads are invisible due to Z-fighting, so toggling has no visible effect"
  artifacts:
    - path: "src/components/Preview/RoadMesh.tsx"
      issue: "visible prop is set correctly but roads invisible anyway"
  missing:
    - "Fix Z-fighting (same fix as Test 1)"
  debug_session: ".planning/phases/05-roads-layer/05-DIAGNOSIS.md"
- truth: "Road generation progress appears below Generate button while roads load in background"
  status: failed
  reason: "User reported: fail"
  severity: major
  test: 4
  root_cause: "Concurrent Overpass API requests (buildings + roads fired simultaneously) may trigger rate limiting, causing road fetch to fail silently. Error caught but status shows error instead of progress."
  artifacts:
    - path: "src/components/Sidebar/GenerateButton.tsx"
      issue: "Both fetchBuildings() and fetchRoads() fire simultaneously with no stagger"
  missing:
    - "Stagger road fetch after building fetch by ~1 second, or chain sequentially"
  debug_session: ".planning/phases/05-roads-layer/05-DIAGNOSIS.md"
- truth: "STL export includes road geometry merged with the terrain"
  status: failed
  reason: "User reported: fail"
  severity: major
  test: 5
  root_cause: "Cascading from Root Cause 2 — if road fetch fails due to rate limiting, no roadFeatures in store, export has no road geometry to merge"
  artifacts:
    - path: "src/components/Preview/ExportPanel.tsx"
      issue: "No road data to merge if fetch failed"
  missing:
    - "Fix road fetch reliability (same fix as Test 4)"
  debug_session: ".planning/phases/05-roads-layer/05-DIAGNOSIS.md"
- truth: "Export filename includes -roads suffix when roads are present"
  status: failed
  reason: "User reported: fail"
  severity: major
  test: 6
  root_cause: "Cascading from Root Cause 2 — hasRoads check depends on roadFeatures being loaded, which fails if fetch was rate-limited"
  artifacts:
    - path: "src/lib/export/stlExport.ts"
      issue: "generateFilename hasRoads is false when no road data loaded"
  missing:
    - "Fix road fetch reliability (same fix as Test 4)"
  debug_session: ".planning/phases/05-roads-layer/05-DIAGNOSIS.md"
