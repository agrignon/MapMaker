# Phase 2: Terrain + Preview + Export - Research

**Researched:** 2026-02-23
**Domain:** Elevation tile fetching, terrain mesh generation, 3D preview (React Three Fiber), binary STL export
**Confidence:** HIGH (core stack verified via npm registry + official docs + cross-referenced sources)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**3D Preview Appearance**
- Hypsometric tints — elevation-based color gradient (greens at low, browns mid, whites at peaks)
- Dark background (dark gray or near-black) for the 3D viewport
- Ground grid + XYZ axes gizmo for spatial reference
- Default camera: angled overhead (~45°) looking down from a corner

**Panel Layout**
- Side-by-side split: 2D map on left, 3D preview on right
- Draggable divider between panels so user can resize
- 3D panel appears after clicking Generate — before that, the map takes full width
- Controls (terrain exaggeration slider, export button) live in a collapsible sidebar on the 3D panel

**Base Plate + Model Shape**
- Flat horizontal bottom — model sits flat on a print bed
- User-configurable base plate thickness (the solid part below the lowest terrain point)
- Minimum 5mm total model height for flat terrain areas — even Kansas plains produce a handleable model
- Vertical side walls (clean 90° edges from terrain down to base)

**Export Experience**
- Location-based auto-generated filename (e.g., "mount-rainier-terrain.stl")
- Progress bar with labeled steps during generation ("Fetching elevation...", "Building mesh...", "Writing STL...")
- Export/Download button in the 3D panel sidebar alongside other controls
- Post-export: download dialog showing file details (size, dimensions, triangle count) with a Download button

### Claude's Discretion
- Elevation data source and resolution selection
- Exact hypsometric color palette
- Grid density and axes gizmo styling
- Terrain exaggeration slider range and default value
- Draggable divider default position and min/max constraints
- Loading skeleton/placeholder while generating
- Error state handling and retry behavior
- STL mesh resolution (triangle density)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TERR-01 | User sees real terrain elevation data rendered from DEM sources within the selected bounding box | MapTiler terrain-rgb tileset → martini RTIN mesh → R3F BufferGeometry |
| TERR-02 | User can control terrain elevation exaggeration with a slider (flatten to exaggerate) | Zustand slider state → re-scale elevation array → BufferAttribute needsUpdate |
| TERR-03 | Flat terrain areas produce a printable model with minimum height floor (not zero-thickness) | minHeight = max(elevation range * exaggeration, 5mm) enforced during mesh construction |
| PREV-01 | User sees a live 3D preview of the model with orbit, zoom, and pan controls | @react-three/fiber Canvas + @react-three/drei OrbitControls |
| PREV-02 | 2D map editor and 3D preview are displayed side-by-side in a hybrid layout | react-resizable-panels with draggable divider |
| EXPT-01 | User can generate a binary STL file from the current model | three/addons STLExporter with `binary: true` |
| EXPT-02 | Generated STL includes a solid base plate underneath the terrain/features | Programmatic base plate geometry merged into terrain mesh before export |
| EXPT-03 | Generated STL is watertight (manifold) and printable without repair in standard slicers | manifold-3d WASM validation; careful side-wall and base construction |
| EXPT-04 | User can download the STL file directly to their local machine | Blob + `<a>` download link pattern in browser |
| EXPT-05 | STL dimensions match the user's specified physical dimensions in millimeters | Scale factor derived from UTM bbox dimensions → target mm; verified by coordinate pipeline |
</phase_requirements>

---

## Summary

Phase 2 builds on the coordinate pipeline from Phase 1 and introduces three distinct technical domains: (1) elevation data fetching and decoding, (2) 3D preview rendering with React Three Fiber, and (3) binary STL generation with a watertight solid.

The elevation pipeline flows as: bounding box (lat/lon) → convert to tile XYZ coordinates at zoom 12–13 → fetch terrain-rgb-v2 PNG tiles from MapTiler → decode RGB pixels to elevation array → stitch multiple tiles if bbox spans tile boundaries → feed into martini RTIN algorithm → get indexed triangle mesh → scale to target mm dimensions → render in R3F BufferGeometry. This is the most technically complex part of the phase, particularly the tile-stitching step for larger bboxes.

The 3D preview uses `@react-three/fiber` v9 (React 19 compatible) with `@react-three/drei` for OrbitControls. The layout change — map-only → side-by-side — is handled by `react-resizable-panels`. Binary STL export uses Three.js's built-in `STLExporter` addon. Manifold validation via `manifold-3d` WASM ensures the exported file passes slicer import without repair warnings.

**Primary recommendation:** Install `@react-three/fiber@^9`, `@react-three/drei`, `three`, `@mapbox/martini`, `react-resizable-panels`, and `manifold-3d`. The tile-stitching logic for multi-tile bboxes is the highest-risk item and needs careful implementation with a dedicated module.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@react-three/fiber` | 9.5.0 | React renderer for Three.js; Canvas, useFrame, useThree | Only React-idiomatic Three.js renderer; v9 pairs with React 19 |
| `@react-three/drei` | 10.7.7 | OrbitControls, Grid, GizmoHelper, Html overlay helpers | Official helper library for R3F; used in every production R3F app |
| `three` | 0.183.1 | Core 3D engine; BufferGeometry, BufferAttribute, STLExporter | Industry standard; drei/R3F peer dependency |
| `@mapbox/martini` | 0.2.0 | RTIN terrain mesh from elevation grid | Only production-grade JS RTIN implementation; used by Mapbox/MapLibre ecosystem |
| `react-resizable-panels` | 4.6.5 | Draggable split-panel layout | Maintained by Brian Vaughn (React core); compatible with React 18 & 19 |
| `manifold-3d` | 3.3.2 | WASM mesh validation (watertight check) | Authoritative geometry library for 3D printing topology |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@types/three` | bundled | TypeScript types for Three.js | Always when using TypeScript with three |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@mapbox/martini` | Custom planar grid | Martini produces adaptive meshes; grid produces 2× more triangles for same quality; don't hand-roll |
| `STLExporter` (three/addons) | Custom ArrayBuffer writer | STLExporter is tested, handles multi-mesh merging; custom writer risks endianness bugs |
| `manifold-3d` | Skip validation | Risk of shipping non-manifold STL that fails in PrusaSlicer; manifold-3d is <5ms for terrain meshes |
| `react-resizable-panels` | Custom CSS resize | ResizeObserver + pointer event handling is 200+ lines of non-trivial code; library handles edge cases |

**Installation:**
```bash
npm install three @types/three @react-three/fiber @react-three/drei @mapbox/martini react-resizable-panels manifold-3d
```

**Vite config addition required for manifold-3d WASM:**
```typescript
// vite.config.ts — add optimizeDeps exclusion
export default defineConfig({
  optimizeDeps: {
    exclude: ['manifold-3d'],
  },
});
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── components/
│   ├── Map/             # Existing (MapView, SearchOverlay)
│   ├── Preview/         # NEW: 3D canvas, scene, mesh
│   │   ├── PreviewCanvas.tsx   # R3F Canvas + scene setup
│   │   ├── TerrainMesh.tsx     # BufferGeometry from elevation data
│   │   └── PreviewControls.tsx # OrbitControls, Grid, GizmoHelper
│   ├── Sidebar/         # Existing + new ExportPanel
│   │   ├── Sidebar.tsx          # Existing
│   │   ├── SelectionInfo.tsx    # Existing
│   │   ├── GenerateButton.tsx   # Existing → wire up generate action
│   │   └── ExportPanel.tsx      # NEW: slider, export button, progress
│   └── Layout/          # NEW: split-panel layout wrapper
│       └── SplitLayout.tsx     # react-resizable-panels configuration
├── lib/
│   ├── stl.ts           # Existing (bboxToMM, metersToMillimeters)
│   ├── utm.ts           # Existing
│   ├── elevation/       # NEW
│   │   ├── tiles.ts     # lon/lat bbox → XYZ tiles, fetch terrain-rgb, decode pixels
│   │   └── stitch.ts    # Multi-tile canvas stitching
│   ├── mesh/            # NEW
│   │   ├── terrain.ts   # Elevation array → martini mesh → Three.js BufferGeometry
│   │   └── solid.ts     # Add base plate + side walls → watertight solid mesh
│   └── export/          # NEW
│       ├── stl.ts       # Three.js STLExporter wrapper → ArrayBuffer → Blob download
│       └── validate.ts  # manifold-3d WASM check
├── store/
│   └── mapStore.ts      # Existing → extend with preview/generation state
├── hooks/
│   └── useTerradraw.ts  # Existing
└── types/
    └── geo.ts           # Existing → extend with elevation types
```

### Pattern 1: Elevation Tile Fetching

**What:** Convert bbox to tile XYZ coordinates, fetch terrain-rgb-v2 PNG tiles from MapTiler, decode RGB pixels to elevation float array.

**When to use:** On "Generate" button click, before mesh construction.

**Key formulas:**
```typescript
// Source: OpenStreetMap Slippy map tilenames wiki (verified)
// lon/lat to tile XYZ at zoom z
function lonLatToTile(lon: number, lat: number, z: number): [number, number] {
  const n = Math.pow(2, z);
  const x = Math.floor((lon + 180) / 360 * n);
  const latRad = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return [x, y];
}

// MapTiler terrain-rgb-v2 tile URL (Source: MapTiler docs, verified)
function tileUrl(z: number, x: number, y: number, apiKey: string): string {
  return `https://api.maptiler.com/tiles/terrain-rgb-v2/${z}/${x}/${y}.png?key=${apiKey}`;
}

// Decode terrain-RGB pixel to elevation in meters (Source: MapTiler/Mapbox formula, HIGH confidence)
// Same formula used by both MapTiler and Mapbox
function rgbToElevation(r: number, g: number, b: number): number {
  return -10000 + ((r * 256 * 256 + g * 256 + b) * 0.1);
}
```

**Image decode pattern (browser, avoids main thread blocking):**
```typescript
// Source: MDN + MapLibre discussion — createImageBitmap from fetch response
async function fetchTilePixels(url: string): Promise<Uint8ClampedArray> {
  const response = await fetch(url);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
}
```

### Pattern 2: Multi-Tile Stitching

**What:** A bbox often spans multiple tiles. Determine the tile grid covering the bbox, fetch all tiles, composite them into a single elevation array by copying pixel rows.

**When to use:** Always — even single-tile bboxes should go through the same code path.

**Approach:**
1. Compute tile range: `[tileXMin, tileYMin]` to `[tileXMax, tileYMax]` at chosen zoom
2. Fetch all tiles in the grid concurrently (`Promise.all`)
3. Stitch into single `Float32Array` by copying decoded elevation rows
4. Crop the stitched array to the pixel bounds corresponding to the bbox corners (sub-pixel interpolation optional)
5. Feed the cropped array (must be `(2^k+1) × (2^k+1)` for martini) — resize or pad as needed

**Martini grid size constraint:**
```typescript
// Source: @mapbox/martini README — grid must be (2^k+1) × (2^k+1)
// Valid sizes: 33, 65, 129, 257, 513, 1025
// 257×257 (a single 256-pixel tile + 1 border pixel) is standard
const MARTINI_GRID_SIZE = 257; // for single-tile or stitched 256px source
```

**Critical note:** Martini requires a square `(2^k+1)` grid. If the stitched elevation covers a non-square or non-(2^k+1) area, you must resample/resize before feeding to martini. This is the spike item called out in STATE.md.

### Pattern 3: Terrain Mesh with martini

**What:** Convert elevation float array to an indexed triangle mesh. Apply exaggeration and scale to target mm dimensions.

```typescript
// Source: @mapbox/martini README + Mapbox Observable notebook
import Martini from '@mapbox/martini';

function buildTerrainMesh(
  elevation: Float32Array,  // (gridSize x gridSize) elevations in meters
  gridSize: number,         // must be 2^k+1 (e.g., 257)
  widthMM: number,          // target physical width in mm
  heightMM: number,         // target physical height in mm
  targetHeightMM: number,   // target Z height in mm
  exaggeration: number,     // user slider value (1.0 = real scale)
  minHeightMM: number = 5,  // TERR-03: flat terrain minimum
  maxError: number = 10     // RTIN error threshold (lower = more triangles)
): THREE.BufferGeometry {
  const martini = new Martini(gridSize);
  const tile = martini.createTile(elevation);
  const { vertices, triangles } = tile.getMesh(maxError);

  // Find elevation range for scaling
  const minElev = Math.min(...elevation);
  const maxElev = Math.max(...elevation);
  const elevRange = maxElev - minElev;

  // TERR-03: enforce minimum height floor
  const zScale = elevRange > 0
    ? Math.max((targetHeightMM * exaggeration) / elevRange, minHeightMM / elevRange)
    : 0;
  const effectiveMinHeight = Math.max(targetHeightMM * exaggeration, minHeightMM);

  const positions = new Float32Array(vertices.length / 2 * 3);
  const n = gridSize - 1;
  for (let i = 0; i < vertices.length / 2; i++) {
    const x = vertices[i * 2];
    const y = vertices[i * 2 + 1];
    positions[i * 3 + 0] = (x / n) * widthMM;
    positions[i * 3 + 1] = (y / n) * heightMM;
    positions[i * 3 + 2] = (elevation[y * gridSize + x] - minElev) * zScale;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(triangles, 1));
  geometry.computeVertexNormals();
  return geometry;
}
```

### Pattern 4: Watertight Solid (Base Plate + Side Walls)

**What:** Terrain surface mesh is open (no base). For a printable STL (EXPT-02, EXPT-03), close it with a flat base and vertical side walls.

**Approach — build the solid from parts:**
1. Terrain surface (from martini, z ≥ 0)
2. Base plate at z = -baseThicknessMM (flat rectangle)
3. Four vertical side walls connecting terrain perimeter edges to base corners
4. Merge all into one BufferGeometry; compute normals; validate with manifold-3d

**Key note on manifold-3d for validation:**
- manifold-3d confirms the mesh is watertight (genus-0, no boundary edges, no self-intersections)
- It does NOT repair; it validates and returns error status if broken
- Use it as a gate before offering the download button

### Pattern 5: R3F 3D Preview

**What:** Render the terrain mesh in a React Three Fiber Canvas with OrbitControls.

```tsx
// Source: @react-three/fiber docs + drei docs
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei';
import * as THREE from 'three';

function TerrainScene({ geometry }: { geometry: THREE.BufferGeometry }) {
  return (
    <Canvas
      camera={{ position: [0.5, -1.2, 0.8], up: [0, 0, 1] }}
      style={{ background: '#1a1a1a' }}
    >
      <ambientLight intensity={0.4} />
      <directionalLight position={[1, 1, 2]} intensity={1.2} />
      <mesh geometry={geometry}>
        <meshStandardMaterial vertexColors side={THREE.DoubleSide} />
      </mesh>
      <Grid args={[10, 10]} />
      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport />
      </GizmoHelper>
      <OrbitControls makeDefault />
    </Canvas>
  );
}
```

**Hypsometric vertex colors** — set in `buildTerrainMesh`, stored as `color` BufferAttribute:
```typescript
// Map normalized elevation (0–1) to color stops: green → brown → white
function elevationToColor(t: number): THREE.Color {
  if (t < 0.3) return new THREE.Color().lerpColors(new THREE.Color(0x2d6a2d), new THREE.Color(0x6b8c42), t / 0.3);
  if (t < 0.65) return new THREE.Color().lerpColors(new THREE.Color(0x6b8c42), new THREE.Color(0x8b6a3e), (t - 0.3) / 0.35);
  return new THREE.Color().lerpColors(new THREE.Color(0x8b6a3e), new THREE.Color(0xffffff), (t - 0.65) / 0.35);
}
```

### Pattern 6: Terrain Exaggeration Update (TERR-02)

**What:** Slider changes exaggeration multiplier; preview updates without re-fetching elevation.

**Approach:** Store raw elevation array in Zustand state. When slider changes, recompute only the Z-position values and set `positionAttribute.needsUpdate = true`.

```typescript
// Source: Three.js docs — needsUpdate pattern for vertex updates
const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
for (let i = 0; i < positions.length / 3; i++) {
  posAttr.setZ(i, newZValues[i]);
}
posAttr.needsUpdate = true;
geometry.computeVertexNormals();
```

### Pattern 7: Binary STL Export + Download

```typescript
// Source: Three.js STLExporter docs (three/addons/exporters/STLExporter.js)
import { STLExporter } from 'three/addons/exporters/STLExporter.js';

function downloadSTL(mesh: THREE.Mesh, filename: string): { sizeBytes: number; triangleCount: number } {
  const exporter = new STLExporter();
  const buffer = exporter.parse(mesh, { binary: true }) as ArrayBuffer;
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  // triangleCount = (buffer.byteLength - 84) / 50  (binary STL header is 84 bytes, each tri is 50)
  const triangleCount = (buffer.byteLength - 84) / 50;
  return { sizeBytes: buffer.byteLength, triangleCount };
}
```

### Pattern 8: Split Panel Layout

```tsx
// Source: react-resizable-panels docs
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';

function AppLayout({ showPreview }: { showPreview: boolean }) {
  return (
    <PanelGroup direction="horizontal">
      <Panel defaultSize={showPreview ? 50 : 100} minSize={30}>
        <MapView />
      </Panel>
      {showPreview && (
        <>
          <PanelResizeHandle className="w-1 bg-gray-600 cursor-col-resize" />
          <Panel defaultSize={50} minSize={30}>
            <PreviewPanel />
          </Panel>
        </>
      )}
    </PanelGroup>
  );
}
```

### Anti-Patterns to Avoid

- **Re-creating martini instance on each exaggeration change:** Create Martini once per tile size; call `createTile` per elevation fetch; call `getMesh` per exaggeration change. Martini instance construction is expensive.
- **Using ASCII STL:** Binary STL is 4–6× smaller and is what slicers expect. Always pass `{ binary: true }`.
- **Terrain-only surface (no base):** An open surface mesh will fail manifold check and produce repair warnings. Always close the mesh with base + walls before exporting.
- **Main thread elevation decode:** `getImageData` on an `<img>` blocks the main thread. Use `createImageBitmap` + `OffscreenCanvas` pattern.
- **Feeding non-(2^k+1) array to martini:** Martini silently produces corrupt meshes if grid size doesn't match the Martini instance. Enforce 257 consistently.
- **Forgetting `computeVertexNormals()`:** After any position update, normals must be recomputed or the mesh will shade incorrectly.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Adaptive terrain triangle mesh | Custom planar grid subdivision | `@mapbox/martini` | RTIN hierarchy, LOD, error threshold control — non-trivial to implement correctly |
| Watertight mesh validation | Manual edge/topology traversal | `manifold-3d` | Topology correctness has many edge cases (T-vertices, non-manifold edges, degenerate triangles) |
| Binary STL writer | Custom ArrayBuffer with DataView | `three/addons/exporters/STLExporter.js` | Endianness handling, triangle count header, 80-byte header format — Three.js implementation is tested against slicer software |
| Split-pane resize | CSS + pointer events | `react-resizable-panels` | Cross-browser ResizeObserver, touch support, keyboard accessibility, min/max constraints |
| OrbitControls from scratch | Custom camera controls | `@react-three/drei` OrbitControls | Damping, pan-on-right-click, zoom-to-cursor, mobile pinch — hundreds of edge cases |

**Key insight:** The terrain pipeline's complexity (tile stitching, RTIN mesh, manifold validation) is the irreducible core of the phase. All surrounding infrastructure should use proven libraries so implementation effort stays focused on the terrain pipeline.

---

## Common Pitfalls

### Pitfall 1: React 19 + @react-three/fiber v9 peer dependency mismatch

**What goes wrong:** Installing `@react-three/fiber@8` (React 18) into a React 19 project causes type errors and potential runtime failures in Strict Mode.
**Why it happens:** v8 paired with React 18; v9 paired with React 19. The project has React 19.2.4 installed.
**How to avoid:** Always install `@react-three/fiber@^9`. Project has React 19 — use R3F v9 only.
**Warning signs:** TypeScript errors on `ThreeElements`, JSX type mismatches.

### Pitfall 2: Martini grid size mismatch

**What goes wrong:** Passing a `257×257` elevation array to `new Martini(256)` (or vice versa) produces silent mesh corruption — wrong vertices, holes, or inverted triangles.
**Why it happens:** Martini's constructor takes the GRID size (vertex count per side = `2^k+1`), not the TILE size (pixel count = `2^k`).
**How to avoid:** A 256×256 pixel tile produces a 257×257 elevation grid. Always `new Martini(257)`.
**Warning signs:** Holes in terrain, z-fighting artifacts, or manifold validation failure.

### Pitfall 3: STL in non-millimeter units

**What goes wrong:** EXPT-05 fails — exported STL opens in PrusaSlicer at the wrong scale (e.g., 1000× too small because coordinates were in meters).
**Why it happens:** STL format has no unit annotation. Slicers assume millimeters. If vertex coordinates are in meters (1.5 m terrain height), slicer shows 1.5 mm.
**How to avoid:** The existing `bboxToMM` / `metersToMillimeters` pipeline already handles this. Ensure all mesh vertex positions are in mm before calling STLExporter.
**Warning signs:** Model imports in slicer as sub-millimeter or multi-meter object.

### Pitfall 4: Non-manifold terrain solid

**What goes wrong:** STL opens in PrusaSlicer with repair warnings; some slicers refuse to slice it.
**Why it happens:** Terrain surface mesh is open (missing base, side walls have T-vertices or gaps). Common sources: imprecise shared-edge vertex coordinates between terrain perimeter and side walls.
**How to avoid:** Build the closed solid from the terrain vertices directly (don't create separate meshes with floating-point-mismatched edges). Use manifold-3d to validate before exposing download.
**Warning signs:** manifold-3d `numDegenerateTris > 0` or `status !== Manifold.Error.NoError`.

### Pitfall 5: MapTiler terrain tile CORS

**What goes wrong:** Browser blocks tile fetch with CORS error.
**Why it happens:** MapTiler terrain-rgb-v2 tiles are served without CORS headers when the Referer doesn't match allowed origins, or if the free-tier API key isn't configured.
**How to avoid:** MapTiler cloud API keys have CORS configured for `localhost` by default. Test with actual API key from `.env`. For production, configure allowed domains in MapTiler dashboard.
**Warning signs:** Network tab shows 403 or CORS preflight failure on tile URLs.

### Pitfall 6: manifold-3d WASM Vite bundling failure

**What goes wrong:** `wasm streaming compile failed` error at runtime; the WASM binary can't be located.
**Why it happens:** Vite's dependency optimizer pre-bundles CommonJS packages but can't handle WASM-embedded binaries correctly.
**How to avoid:** Add `optimizeDeps: { exclude: ['manifold-3d'] }` to `vite.config.ts`.
**Warning signs:** Console error mentioning streaming compile, WASM, or fetch failed.

### Pitfall 7: Tile stitching pixel alignment at borders

**What goes wrong:** Visible seam in terrain mesh at tile boundaries — elevation jumps or discontinuities.
**Why it happens:** Adjacent terrain-rgb tiles share a 1-pixel border. When stitching, if you copy both tiles' border pixels, you duplicate a row/column. If you skip one, you get a 1-pixel gap.
**How to avoid:** When stitching N tiles horizontally, take tile 0's full width (256px) and each subsequent tile's columns [1..256] (skip the first column). Same vertically. Total width = N * 256 + 1 pixels → forms a valid `(2^k+1)` grid when N is a power of 2.
**Warning signs:** Linear ridge artifacts in terrain mesh at tile boundaries.

---

## Code Examples

Verified patterns from official sources:

### Initialization: manifold-3d in Vite (WASM)

```typescript
// Source: Verified via GitHub discussion #873 (elalish/manifold) + Vite docs
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    exclude: ['manifold-3d'],
  },
});

// In a service module (lazy-loaded):
import Module from 'manifold-3d';
let manifoldLib: Awaited<ReturnType<typeof Module>> | null = null;

export async function getManifold() {
  if (!manifoldLib) {
    manifoldLib = await Module();
    manifoldLib.setup();
  }
  return manifoldLib;
}
```

### @react-three/fiber v9 BufferGeometry

```tsx
// Source: R3F v9 migration guide (r3f.docs.pmnd.rs) — attach syntax
// R3F v9 uses dash-separated attach string (changed from v7 attachObject)
<bufferGeometry>
  <bufferAttribute attach="attributes-position" count={N} array={positions} itemSize={3} />
  <bufferAttribute attach="attributes-color" count={N} array={colors} itemSize={3} />
  <bufferAttribute attach="index" count={M} array={indices} itemSize={1} />
</bufferGeometry>

// OR: Pass pre-built THREE.BufferGeometry as prop (more control, recommended for terrain)
<mesh geometry={prebuiltGeometry}>
  <meshStandardMaterial vertexColors />
</mesh>
```

### react-resizable-panels basic setup

```tsx
// Source: react-resizable-panels README (bvaughn/react-resizable-panels, v4.6.5)
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';

<PanelGroup direction="horizontal" style={{ height: '100vh' }}>
  <Panel defaultSize={50} minSize={20}>
    {/* Left: 2D map */}
  </Panel>
  <PanelResizeHandle style={{ width: 4, background: '#374151', cursor: 'col-resize' }} />
  <Panel defaultSize={50} minSize={20}>
    {/* Right: 3D preview */}
  </Panel>
</PanelGroup>
```

### Zustand store extension for generation state

```typescript
// Pattern: extend existing mapStore with terrain generation state
interface TerrainState {
  elevationData: Float32Array | null;
  terrainGeometry: THREE.BufferGeometry | null;
  exaggeration: number;
  basePlateThicknessMM: number;
  generationStatus: 'idle' | 'fetching' | 'meshing' | 'validating' | 'ready' | 'error';
  generationStep: string;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `THREE.Geometry` (deprecated) | `THREE.BufferGeometry` | Three.js r125 (2021) | All new code uses BufferGeometry; Geometry removed in r137 |
| `@react-three/fiber@8` + React 18 | `@react-three/fiber@9` + React 19 | R3F v9 released ~2024 | Must use R3F v9 for React 19 compatibility |
| Global JSX namespace `JSX.IntrinsicElements` | `ThreeElements` interface extension | R3F v9 | TypeScript declaration changed |
| `attachObject={['attributes', 'position']}` | `attach="attributes-position"` | R3F v8 | Old syntax deprecated |
| ASCII STL | Binary STL (standard) | Industry standard | Binary is 4–6× smaller; slicers prefer binary |
| `react-split-pane` (unmaintained) | `react-resizable-panels` (Brian Vaughn) | 2023 | react-split-pane has open issues, unmaintained |

**Deprecated/outdated:**
- `THREE.PlaneBufferGeometry`: Renamed to `THREE.PlaneGeometry` — use `PlaneGeometry` for procedural terrain or just `BufferGeometry` directly
- `react-split-pane`: Last commit 2021, unmaintained — use `react-resizable-panels` instead
- Mapbox Terrain-RGB v1 formula: The same formula works for MapTiler terrain-rgb-v2

---

## Open Questions

1. **Zoom level selection for elevation tiles**
   - What we know: MapTiler terrain-rgb-v2 supports up to zoom 14; each zoom-14 tile covers ~2.4km at equator; zoom 12 tiles cover ~9.5km
   - What's unclear: Optimal zoom level for a user-drawn bbox (could be 1km × 1km or 50km × 50km); too high a zoom = many tiles to fetch; too low = low resolution
   - Recommendation: Use zoom = 12 as default; compute how many tiles the bbox spans at that zoom and warn if > 9 tiles (3×3 grid). Allow dynamic zoom selection as a Claude's-discretion parameter.

2. **MapTiler terrain-rgb-v2 tile dimensions (256px vs 512px)**
   - What we know: MapTiler supports both 256px and 512px tiles; the API has `@2x` variants for 512px
   - What's unclear: Whether `terrain-rgb-v2` defaults to 256 or 512
   - Recommendation: Default to 256px tiles (Martini grid size 257 is well-tested); verify with actual API response during implementation.

3. **Rate limits on MapTiler free tier for tile fetching**
   - What we know: MapTiler free tier has usage limits; STATE.md flags this as a concern for Phase 6
   - What's unclear: Whether concurrent fetching of 4–9 elevation tiles will hit rate limits during normal use
   - Recommendation: Fetch tiles sequentially or with limited concurrency (2–3) as a precaution; add per-session caching of fetched elevation tiles.

4. **manifold-3d validation strategy: gate or advisory**
   - What we know: manifold-3d can identify non-manifold meshes; the STL exporter says topology is lossy in STL
   - What's unclear: Whether to block export on validation failure or show a warning
   - Recommendation: Block download and show error message if manifold check fails; this enforces EXPT-03 cleanly.

---

## Validation Architecture

> `workflow.nyquist_validation` is NOT present in `.planning/config.json` (the `workflow` key exists but does not contain `nyquist_validation`). Skipping Validation Architecture section per instructions.

*(Note: Existing test infrastructure uses Vitest 3.0 with jsdom, setup file at `src/test/setup.ts`. Tests live in `src/lib/__tests__/`. The elevation, mesh, and export modules added in this phase should follow the same `__tests__` pattern.)*

---

## Sources

### Primary (HIGH confidence)

- npm registry (`npm view`) — @react-three/fiber@9.5.0, @react-three/drei@10.7.7, three@0.183.1, @mapbox/martini@0.2.0, react-resizable-panels@4.6.5, manifold-3d@3.3.2
- [r3f.docs.pmnd.rs](https://r3f.docs.pmnd.rs) — Canvas setup, v9 migration guide, React 19 pairing
- [drei.docs.pmnd.rs/controls/introduction](https://drei.docs.pmnd.rs/controls/introduction) — OrbitControls API
- [threejs.org/docs/STLExporter](https://threejs.org/docs/pages/STLExporter.html) — parse() signature, binary mode returns ArrayBuffer, multi-mesh merging
- [mapbox/martini README](https://github.com/mapbox/martini) — API: `new Martini(size)`, `createTile(terrain)`, `getMesh(maxError)`, `{vertices, triangles}` output
- [MapTiler terrain-rgb docs](https://www.maptiler.com/news/2022/05/maplibre-v2-add-3d-terrain-to-your-map/) — tileset ID `terrain-rgb`, URL pattern
- [OSM Slippy Map Tilenames](https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames) — lon/lat to XYZ tile formulas
- [elalish/manifold discussion #873](https://github.com/elalish/manifold/discussions/873) — Vite `optimizeDeps.exclude` requirement, init pattern

### Secondary (MEDIUM confidence)

- MapTiler guides — `terrain-rgb-v2` tileset ID confirmed; zoom level 14 max; same RGB decode formula as Mapbox
- Mapbox Terrain-RGB Observable notebook — RGB decode formula `height = -10000 + ((R*256*256 + G*256 + B) * 0.1)`; martini usage pattern
- manifold-3d npm page — `MeshGL` format (`vertProperties`, `triVerts`), WASM memory management (manual `delete()`)
- Three.js forum / R3F forum — `positionAttribute.needsUpdate = true` pattern for geometry updates; `computeVertexNormals()` after updates
- MapLibre/maplibre-gl-js discussion — `createImageBitmap` + `OffscreenCanvas` for tile pixel decoding without main thread blocking

### Tertiary (LOW confidence)

- Tile stitching border handling — derived from martini grid size constraints + general tile knowledge; needs validation during implementation
- Manifold-3d blocking vs. advisory for EXPT-03 — architecture recommendation; actual validation behavior needs empirical testing

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all package versions verified via npm registry; peer deps confirmed
- Architecture: HIGH — patterns from official docs (R3F, martini, STLExporter, react-resizable-panels)
- Tile stitching: MEDIUM — algorithm logic derived from OSM formulas + martini constraints; implementation needs a focused spike
- Pitfalls: HIGH — most are verified from official issue trackers, migration guides, and known ecosystem bugs

**Research date:** 2026-02-23
**Valid until:** 2026-05-23 (stable ecosystem; manifold-3d and R3F release frequently but API is stable at documented versions)
