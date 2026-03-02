---
status: diagnosed
phase: 15-content-architecture
source: [15-01-SUMMARY.md]
started: 2026-03-02T01:00:00Z
updated: 2026-03-02T01:15:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Map View Sidebar Content
expected: In map/edit view, the sidebar shows SelectionInfo (area info or "Draw a rectangle" prompt) and the Generate button. All content renders correctly with no visual differences from before.
result: pass

### 2. Preview Sidebar Content
expected: After generating a model, the preview sidebar shows: Back to Edit button, Model Size section, layer toggle sections (Buildings, Roads, Water, Vegetation), and Export panel. All controls render and function.
result: issue
reported: "when I resize the browser window to reflect that of a mobile device, the entire display goes black"
severity: blocker

### 3. View Switching
expected: Clicking Generate switches sidebar from map controls to model controls. Clicking "Back to Edit" switches back to map controls. Content swaps cleanly with no flash or layout shift.
result: issue
reported: "fail - I have duplicate sets of controls on both sides of the screen"
severity: major

### 4. Layer Toggles in Preview
expected: In preview view, toggling layer checkboxes (Buildings, Roads, Water, Vegetation) shows/hides the corresponding 3D layers on the model. Controls respond normally.
result: pass

## Summary

total: 4
passed: 2
issues: 2
pending: 0
skipped: 0

## Gaps

- truth: "Preview sidebar renders correctly at mobile viewport sizes"
  status: failed
  reason: "User reported: when I resize the browser window to reflect that of a mobile device, the entire display goes black"
  severity: blocker
  test: 2
  root_cause: "SplitLayout.tsx useEffect (lines 148-156) does not handle isMobile transitioning from false to true while showPreview is already true — activeTab stays at 'map', preview pane stays display:none, dark body background shows as black screen"
  artifacts:
    - path: "src/components/Layout/SplitLayout.tsx"
      issue: "useEffect sync missing condition for isMobile transition while showPreview is already true"
  missing:
    - "Add prevIsMobile ref and condition: if (isMobile && !prevIsMobile.current && showPreview) setActiveTab('preview')"
  debug_session: ""

- truth: "View switching shows single set of controls — map controls in edit view, model controls in preview view"
  status: failed
  reason: "User reported: fail - I have duplicate sets of controls on both sides of the screen"
  severity: major
  test: 3
  root_cause: "SidebarContent.tsx switches to ModelControlsPanel when showPreview=true (left pane via Sidebar), while PreviewSidebar.tsx unconditionally renders its own ModelControlsPanel (right pane) — both panes visible in desktop split layout produces duplicate controls"
  artifacts:
    - path: "src/components/Panels/SidebarContent.tsx"
      issue: "Ternary renders ModelControlsPanel when showPreview=true, duplicating PreviewSidebar's copy"
    - path: "src/components/Preview/PreviewSidebar.tsx"
      issue: "Unconditionally renders ModelControlsPanel — this is the intended location"
  missing:
    - "SidebarContent.tsx should always render MapControlsPanel (remove showPreview ternary) — model controls belong exclusively to PreviewSidebar in the right pane"
  debug_session: ""
