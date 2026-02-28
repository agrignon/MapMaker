# Phase 1: Foundation - Research

**Researched:** 2026-02-23
**Domain:** Interactive map UI, bounding box drawing, UTM coordinate projection, STL coordinate pipeline
**Confidence:** HIGH (core stack verified through official docs and npm registry)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**App layout & map style**
- Left sidebar (~300px wide), map fills remaining viewport
- Satellite/aerial imagery as the default map tile layer
- App theme follows system preference (light/dark auto-detect)
- Search bar floats as an overlay on the map, not in the sidebar
- Sidebar contains controls, selection info, and the generate action

**Location search experience**
- Live autocomplete dropdown — suggestions appear as user types with debounce
- Selecting a result triggers a smooth fly-to animation with auto-zoom appropriate to result type (city zooms wider, address zooms tighter)
- Supports both place name/address queries AND raw lat/lon coordinate input (e.g., "48.8566, 2.3522") — auto-detect format and handle accordingly

**Bounding box interaction**
- Click-and-drag to draw the initial rectangle (click one corner, drag to opposite corner)
- Free aspect ratio — no constraints, user draws whatever proportions they want
- Semi-transparent colored fill with solid border — area outside the selection could be dimmed
- After placement: drag edges or corners to resize, drag the center/interior to reposition
- Standard resize/move cursors for affordance

**Selection confirmation flow**
- Selection info displayed in the sidebar: real-world dimensions (e.g., "2.3 km x 1.8 km") and corner coordinates
- "Generate Preview" button in the sidebar — present but disabled in Phase 1 (functional in Phase 2)
- Soft warning when selection area is very large — non-blocking, informational (e.g., "This area may take a while to process")

### Claude's Discretion
- Map library/provider choice (Mapbox, Leaflet, MapLibre, etc.)
- Geocoding API provider for search
- Exact color scheme for bounding box overlay
- Transition animations and easing curves
- Responsive breakpoints and mobile handling
- Dimming style for area outside the bounding box

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| LOCS-01 | User can search for a location by city name, street address, or lat/lon coordinates | MapTiler Geocoding Control (`@maptiler/geocoding-control`) provides autocomplete, fly-to, and supports all input types; raw lat/lon needs client-side pre-detection before sending to API |
| LOCS-02 | User can define a bounding box by dragging on a 2D map to set the area of interest | Terra Draw (`terra-draw` + `terra-draw-maplibre-gl-adapter`) provides `TerraDrawRectangleMode` with click-and-drag drawing on MapLibre GL JS |
| LOCS-03 | User can resize and reposition the bounding box after initial placement | Terra Draw `TerraDrawSelectMode` supports dragging coordinates (corners/edges via midpoints) and full-feature reposition; `resizable: 'opposite'` for corner-based scaling |
| FNDN-01 | All geometry uses local meter-space coordinates (UTM projection), not Web Mercator | proj4 v2.20 provides WGS84→UTM zone projection; UTM zone auto-calculated from bbox centroid longitude; requires automated test asserting known bbox dimensions |
| FNDN-02 | STL export writes coordinates in millimeters (canonical unit for 3D printing) | Binary STL uses 32-bit floats; coordinate scale factor (meters × 1000 = mm) applied at serialization time; requires automated test asserting output dimensions |
</phase_requirements>

---

## Summary

Phase 1 establishes the interactive map foundation: users find a location, draw a bounding box, and the application captures those coordinates in UTM (flat-earth meter space). No 3D rendering, no terrain data, no export pipeline — only the selection UI and the coordinate projection pipeline that all later phases depend on.

The recommended stack centers on **MapLibre GL JS v5** (open-source, no proprietary license, actively maintained at v5.18.0) with **@vis.gl/react-maplibre** for React integration, **Terra Draw v1.25** for drawing and editing, **@maptiler/geocoding-control** for search autocomplete, and **proj4 v2.20** for UTM projection. This stack is completely open-source except for MapTiler's API key requirement (free tier available), avoids Mapbox's proprietary license introduced in v2+, and is verified against current npm registry and official documentation.

The most critical constraint is the UTM projection pipeline (FNDN-01, FNDN-02): all bounding box coordinates must be converted from WGS84 (lat/lon) to local UTM meter space before being used downstream. Web Mercator coordinates — what the map natively uses — introduce cos(latitude) distortion that makes distance measurements wrong. This correctness must be verified by automated tests before Phase 2 begins, as all terrain and geometry code builds on this foundation.

**Primary recommendation:** Use MapLibre GL JS + @vis.gl/react-maplibre + Terra Draw + MapTiler Geocoding Control + proj4. Do not use Mapbox GL JS (proprietary license). Do not hand-roll drawing or coordinate projection.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| maplibre-gl | 5.18.0 | Interactive WebGL map renderer | Open-source fork of Mapbox GL JS; actively maintained; v5 stable; used by MapLibre ecosystem |
| @vis.gl/react-maplibre | 8.1.0 | React wrapper for maplibre-gl | Official vis.gl React bindings; first-party support for MapLibre v4+ and v5; same team as deck.gl |
| terra-draw | 1.25.0 | Map drawing (rectangle + select/resize) | Officially listed in MapLibre plugins; actively maintained; supports MapLibre v4/v5 via adapter; has TerraDrawRectangleMode and TerraDrawSelectMode |
| terra-draw-maplibre-gl-adapter | (bundled with terra-draw) | MapLibre-specific adapter for Terra Draw | Required companion; maintained alongside terra-draw |
| @maptiler/geocoding-control | 2.1.7 | Place search autocomplete + fly-to | First-party MapTiler control; React component available; supports autocomplete, proximity, lat/lon; integrates directly with maplibre-gl map instance |
| proj4 | 2.20.0 | WGS84 ↔ UTM coordinate projection | Standard library for coordinate transforms in JS; v2.20 ships built-in WGS84 UTM zones 1–60 N/S; TypeScript types included in v2.19+ |
| zustand | 5.0.11 | Client-side app state (bbox, coordinates) | Lightweight; no provider wrapper needed; widely adopted in React ecosystem; fits single-page selection UI |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tailwindcss | 4.x (latest) | Utility CSS with system dark mode | @tailwindcss/vite plugin; v4 requires zero postcss config; `prefers-color-scheme` media query handled via `dark:` variants |
| vitest | latest (^3.x) | Unit testing framework | Native Vite integration; Jest-compatible API; used to verify UTM projection and STL dimension tests (FNDN-01, FNDN-02) |
| @testing-library/react | latest | Component testing | Pairs with vitest for sidebar/selection UI tests |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| MapLibre GL JS | Mapbox GL JS v3+ | Mapbox v2+ requires proprietary license and billing; reject |
| MapLibre GL JS | Leaflet | Leaflet lacks WebGL; no satellite raster performance at scale; does not match Phase 2 terrain needs |
| Terra Draw | mapbox-gl-draw | mapbox-gl-draw is not officially maintained for MapLibre v5; rectangle mode requires third-party plugin (`mapbox-gl-draw-rectangle-mode`) with uncertain maintenance |
| Terra Draw | Custom canvas overlay | Rectangle drawing with resize handles is complex to implement correctly (cursor management, hit-testing, coordinate math); Terra Draw solves this |
| @maptiler/geocoding-control | Nominatim public API | Nominatim hard-capped at 1 req/sec across all users; unacceptable for a public app; self-hosting requires significant infra |
| @maptiler/geocoding-control | Mapbox Geocoding API | Requires Mapbox account + billing after free tier; MapTiler free tier is more generous for this use case |
| Zustand | React Context | Context triggers full subtree re-renders on bbox updates; Zustand is selective |
| Tailwind v4 | Tailwind v3 | v4 has breaking changes but is the current standard; zero postcss config is simpler for new projects |

**Installation:**
```bash
npm create vite@latest mapmaker -- --template react-ts
npm install maplibre-gl @vis.gl/react-maplibre
npm install terra-draw terra-draw-maplibre-gl-adapter
npm install @maptiler/geocoding-control
npm install proj4
npm install zustand
npm install -D tailwindcss @tailwindcss/vite
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── components/
│   ├── Map/
│   │   ├── MapView.tsx         # MapLibre map container, Terra Draw init
│   │   ├── SearchOverlay.tsx   # Geocoding control floating overlay
│   │   └── BboxLayer.tsx       # Optional: custom dimming layer outside bbox
│   └── Sidebar/
│       ├── Sidebar.tsx         # Container
│       ├── SelectionInfo.tsx   # Real-world dimensions, corner coords
│       └── GenerateButton.tsx  # Disabled in Phase 1
├── hooks/
│   ├── useTerradraw.ts         # Terra Draw lifecycle (init, mode switching, events)
│   └── useUTMProjection.ts     # proj4 UTM zone calculation + WGS84→UTM transform
├── store/
│   └── mapStore.ts             # Zustand store: bbox coords, selection state, map ref
├── lib/
│   ├── utm.ts                  # Pure functions: zone detection, WGS84→UTM, dimensions
│   └── stl.ts                  # Stub: STL serializer (skeleton only in Phase 1)
├── types/
│   └── geo.ts                  # BoundingBox, UTMCoords, WGS84Coords types
└── App.tsx                     # Layout: sidebar + map flex container
```

### Pattern 1: MapLibre Map with React

**What:** Use `@vis.gl/react-maplibre`'s `<Map>` component as the root map container; access the underlying maplibre-gl instance via `useMap()` hook for Terra Draw initialization.

**When to use:** Every interaction that requires imperative map API access (Terra Draw, flyTo, event listeners).

```typescript
// Source: https://visgl.github.io/react-maplibre/docs/get-started
import { Map, useMap } from '@vis.gl/react-maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

function MapView() {
  return (
    <Map
      mapStyle="https://api.maptiler.com/maps/satellite-v2/style.json?key=YOUR_KEY"
      initialViewState={{ longitude: 0, latitude: 20, zoom: 2 }}
      style={{ width: '100%', height: '100vh' }}
    >
      <TerraDrawControl />
      <SearchOverlay />
    </Map>
  );
}
```

### Pattern 2: Terra Draw Rectangle Mode + Select Mode

**What:** Initialize Terra Draw with two modes — `TerraDrawRectangleMode` (draw) and `TerraDrawSelectMode` (resize/move). Switch modes via Terra Draw's `start()` / `changeMode()` API. Listen to `onChange` events to extract the completed rectangle's coordinates.

**When to use:** After the map mounts; re-initialize only if the map instance changes.

```typescript
// Source: https://maplibre.org/maplibre-gl-js/docs/examples/draw-geometries-with-terra-draw/
import { TerraDraw, TerraDrawRectangleMode, TerraDrawSelectMode } from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';

function initTerradraw(map: maplibregl.Map) {
  const draw = new TerraDraw({
    adapter: new TerraDrawMapLibreGLAdapter({ map }),
    modes: [
      new TerraDrawRectangleMode(),
      new TerraDrawSelectMode({
        flags: {
          rectangle: {
            feature: {
              draggable: true,
              coordinates: {
                midpoints: true,
                draggable: true,
                resizable: 'opposite', // corner-based resize
              },
            },
          },
        },
      }),
    ],
  });
  draw.start();
  return draw;
}
```

### Pattern 3: UTM Zone Detection and WGS84→UTM Projection

**What:** Compute the UTM zone from the bbox centroid longitude, build a proj4 projection string, and transform all four bbox corners from WGS84 to UTM meters.

**When to use:** Every time the bbox changes. Output is the canonical coordinate representation for all downstream phases.

```typescript
// Source: proj4js README + USGS UTM documentation
import proj4 from 'proj4';

function getUTMZone(longitude: number): number {
  return Math.floor((longitude + 180) / 6) + 1;
}

function wgs84ToUTM(lon: number, lat: number): { x: number; y: number; zone: number } {
  const zone = getUTMZone(lon);
  const hemisphere = lat >= 0 ? '' : ' +south';
  const projDef = `+proj=utm +zone=${zone}${hemisphere} +datum=WGS84 +units=m +no_defs`;
  const [x, y] = proj4('WGS84', projDef, [lon, lat]);
  return { x, y, zone };
}

// Compute real-world bbox dimensions in meters
function bboxDimensionsMeters(
  sw: [number, number],  // [lon, lat]
  ne: [number, number]
): { widthM: number; heightM: number } {
  const zone = getUTMZone((sw[0] + ne[0]) / 2);
  const hemisphere = sw[1] >= 0 ? '' : ' +south';
  const projDef = `+proj=utm +zone=${zone}${hemisphere} +datum=WGS84 +units=m +no_defs`;
  const [x1, y1] = proj4('WGS84', projDef, sw);
  const [x2, y2] = proj4('WGS84', projDef, ne);
  return { widthM: Math.abs(x2 - x1), heightM: Math.abs(y2 - y1) };
}
```

### Pattern 4: Geocoding Control Float Overlay

**What:** Mount `@maptiler/geocoding-control`'s `<GeocodingControl>` as an absolutely positioned element inside the map container. Pass a `mapController` reference so it can trigger `flyTo` on selection.

**When to use:** Standard pattern from MapTiler docs for React + MapLibre.

```typescript
// Source: https://docs.maptiler.com/react/maplibre-gl-js/geocoding-control/
import { GeocodingControl } from '@maptiler/geocoding-control/react';
import '@maptiler/geocoding-control/style.css';

// Inside map component (after map mount):
<div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 1 }}>
  <GeocodingControl
    apiKey={import.meta.env.VITE_MAPTILER_KEY}
    mapController={mapController}
    country={undefined}  // global search
  />
</div>
```

**Lat/lon input detection:** The geocoding API will not auto-detect `"48.8566, 2.3522"` format. Add client-side pre-processing: detect the pattern `/^-?\d+\.?\d*\s*,\s*-?\d+\.?\d*$/`, parse directly to a `[lon, lat]` coordinate pair, and call `map.flyTo()` directly instead of routing through the geocoding API.

### Pattern 5: STL Coordinate Pipeline Skeleton (FNDN-02)

**What:** A pure function that accepts UTM-projected bbox dimensions in meters and converts to millimeters. This is the testable unit — a 1:1 scale factor (meters × 1000 = mm).

```typescript
// lib/stl.ts — skeleton for Phase 1 (tested but no actual STL output yet)
export function metersToMillimeters(meters: number): number {
  return meters * 1000;
}

export interface BboxMM {
  widthMM: number;
  heightMM: number;
}

export function bboxToMM(widthM: number, heightM: number): BboxMM {
  return {
    widthMM: metersToMillimeters(widthM),
    heightMM: metersToMillimeters(heightM),
  };
}
```

### Anti-Patterns to Avoid

- **Using Web Mercator coordinates for dimension calculation:** MapLibre's `map.getBounds()` returns WGS84 lon/lat — never compute widths/heights directly from these. Always project to UTM first.
- **Computing UTM zone from a single corner:** Use the bbox centroid longitude for zone selection to minimize distortion for all four corners.
- **Different UTM zones per corner:** All four corners must use the same UTM zone (derived from centroid). Cross-zone inconsistency breaks the flat-earth assumption.
- **Coupling geocoding control to the Terra Draw state:** The search flyTo and the bbox draw are independent user actions. Do not auto-draw a bbox when a search result is selected; they are separate interactions.
- **Using Mapbox GL JS:** License changed in v2.0 (December 2020) from BSD to proprietary. MapLibre GL JS is the BSD-licensed fork.
- **Using mapbox-gl-draw with MapLibre v5:** Community reports compatibility issues; `maplibre-gl-draw` (npm) is 2 years unmaintained; Terra Draw is the officially recommended replacement per MapLibre's own plugin page.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rectangle drawing with drag | Custom SVG/canvas overlay on map | Terra Draw TerraDrawRectangleMode | Coordinate-to-pixel projection, event handling, map-move sync, and WebGL layer ordering are all non-trivial |
| Corner/edge resize handles | Custom pointer event tracking | Terra Draw TerraDrawSelectMode | Hit testing handles at correct map zoom, cursor state machine, coordinate snapping |
| Place search with autocomplete | Direct Nominatim API calls | @maptiler/geocoding-control | Nominatim hard-capped at 1 req/sec for all users combined; MapTiler provides autocomplete, proximity weighting, and flyTo integration |
| WGS84→UTM projection math | Haversine or manual trig | proj4 | Edge cases: UTM zone boundaries, southern hemisphere, special zones (Norway, Svalbard); proj4 handles all |
| UTM zone boundary handling | Zone-splitting logic | proj4 + centroid-based zone | Proj4's accuracy spec: < 1m error within each zone when using the correct zone |
| STL binary serialization | Manual ArrayBuffer writes | Phase 2 concern — stub only in Phase 1 | Binary STL requires correct IEEE 754 float32 packing, triangle winding order, and normal calculation |

**Key insight:** The map drawing problem appears simple but has a deep implementation surface — pixel↔coordinate transforms at varying zoom levels, pointer capture, hit regions that scale with zoom, and WebGL layer z-ordering. Terra Draw encapsulates all of this.

---

## Common Pitfalls

### Pitfall 1: Web Mercator Distance Calculation

**What goes wrong:** Developer reads bbox from `map.getBounds()` or Terra Draw's GeoJSON output (both WGS84), computes width as `ne.lng - sw.lng` in degrees, then multiplies by some constant to get meters. Sidebar shows wrong dimensions.

**Why it happens:** MapLibre works in WGS84 lon/lat internally. The intuitive subtraction of coordinates gives degrees, not meters, and degree-to-meter ratio varies dramatically with latitude (cos(lat) factor).

**How to avoid:** Always use proj4 to project both corners to UTM before computing differences. Extract UTM conversion to a dedicated `utm.ts` module with unit tests.

**Warning signs:** Sidebar dimensions that look correct near the equator but shrink or grow oddly at higher latitudes (Norway, Alaska, etc.).

### Pitfall 2: UTM Zone Boundary Crossing

**What goes wrong:** User draws a bbox that crosses a UTM zone boundary (every 6° of longitude). The east and west corners land in different zones. Projecting with a single zone string distorts one side.

**Why it happens:** UTM divides the globe into 60 zones; each is a separate coordinate system. Projecting zone-12 coordinates with zone-13 parameters introduces hundreds of meters of error near boundaries.

**How to avoid:** Use the **centroid longitude** of the bbox to determine a single zone for all four corners. Accept that accuracy degrades slightly at zone edges, but the bbox will never span more than 6° of longitude in practice (that's ~667km at the equator — no user will select an area that large for 3D printing).

**Warning signs:** Automated test for a known bbox near longitude -180 or 0 or 180 yields wrong dimensions.

### Pitfall 3: Geocoding Control CSS Not Loaded

**What goes wrong:** The geocoding dropdown renders with no styling — invisible items, no autocomplete list, overlapping text.

**Why it happens:** `@maptiler/geocoding-control` requires its own stylesheet to be imported explicitly.

**How to avoid:** Add `import '@maptiler/geocoding-control/style.css';` in the component file or in `main.tsx`.

**Warning signs:** Search bar appears but dropdown suggestions are unstyled or invisible.

### Pitfall 4: MapLibre CSS Not Loaded

**What goes wrong:** Map controls (navigation, attribution), popups, and markers render without styles. Markers appear at wrong position.

**Why it happens:** Similar to above — maplibre-gl ships its own stylesheet.

**How to avoid:** Add `import 'maplibre-gl/dist/maplibre-gl.css';` at the top of the component or in `main.tsx`.

### Pitfall 5: Terra Draw Mode Not Started

**What goes wrong:** Calling `draw.changeMode('draw_rectangle')` throws an error or does nothing.

**Why it happens:** Terra Draw requires `draw.start()` to be called once after initialization before any mode changes.

**How to avoid:** Always call `draw.start()` after constructing the `TerraDraw` instance. Only call it once (calling twice throws).

### Pitfall 6: Environment Variables in Vite

**What goes wrong:** `process.env.MAPTILER_KEY` is undefined; map tiles fail to load.

**Why it happens:** Vite uses `import.meta.env` not `process.env`. Only variables prefixed with `VITE_` are exposed to client code.

**How to avoid:** Use `VITE_MAPTILER_KEY` in `.env` and reference via `import.meta.env.VITE_MAPTILER_KEY`. Never commit API keys.

### Pitfall 7: Terra Draw Select Mode Resizable Projection

**What goes wrong:** Resizing a rectangle via corners produces slightly skewed shapes at high latitudes.

**Why it happens:** Terra Draw's `resizable` option currently only supports Web Mercator projection (not geodesic). This means corner-drag scaling is in pixel space, not true geodesic space.

**How to avoid:** Accept this limitation for Phase 1 — the visual resizing is "good enough" for selection purposes. The canonical coordinates extracted via `draw.getSnapshot()` are always in WGS84 and then projected to UTM correctly. The visual shape on the map is just a selection aid.

---

## Code Examples

Verified patterns from official sources:

### MapLibre + React-MapLibre Map Init with Satellite Tiles

```typescript
// Source: https://visgl.github.io/react-maplibre/docs/get-started
import { Map } from '@vis.gl/react-maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY;

export function MapView() {
  return (
    <Map
      mapStyle={`https://api.maptiler.com/maps/satellite-v2/style.json?key=${MAPTILER_KEY}`}
      initialViewState={{
        longitude: -74.006,
        latitude: 40.7128,
        zoom: 10,
      }}
      style={{ width: '100%', height: '100vh' }}
    />
  );
}
```

### Extracting BBox Coordinates from Terra Draw

```typescript
// After Terra Draw fires onChange with 'create' or 'update' feature type
draw.on('change', (ids, type) => {
  if (type === 'create' || type === 'update') {
    const snapshot = draw.getSnapshot();
    const rectangles = snapshot.filter(
      f => f.geometry.type === 'Polygon' && f.properties?.mode === 'rectangle'
    );
    if (rectangles.length > 0) {
      const coords = rectangles[0].geometry.coordinates[0]; // ring of [lon, lat] pairs
      const lons = coords.map(c => c[0]);
      const lats = coords.map(c => c[1]);
      const sw: [number, number] = [Math.min(...lons), Math.min(...lats)];
      const ne: [number, number] = [Math.max(...lons), Math.max(...lats)];
      // → Project to UTM
    }
  }
});
```

### Zustand Store for Bbox State

```typescript
// Source: https://zustand.docs.pmnd.rs/
import { create } from 'zustand';

interface BboxState {
  sw: [number, number] | null;  // WGS84 [lon, lat]
  ne: [number, number] | null;
  utmZone: number | null;
  widthM: number | null;
  heightM: number | null;
  setBbox: (sw: [number, number], ne: [number, number]) => void;
  clearBbox: () => void;
}

export const useMapStore = create<BboxState>((set) => ({
  sw: null, ne: null, utmZone: null, widthM: null, heightM: null,
  setBbox: (sw, ne) => {
    const { widthM, heightM } = bboxDimensionsMeters(sw, ne);
    const zone = getUTMZone((sw[0] + ne[0]) / 2);
    set({ sw, ne, utmZone: zone, widthM, heightM });
  },
  clearBbox: () => set({ sw: null, ne: null, utmZone: null, widthM: null, heightM: null }),
}));
```

### Tailwind v4 Dark Mode (System Preference)

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
});

// src/index.css
@import "tailwindcss";

// Usage in components — dark: variants respond to prefers-color-scheme automatically
// <div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
```

### Vitest Config for UTM Tests

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

### UTM Projection Test (FNDN-01 Verification)

```typescript
// src/lib/__tests__/utm.test.ts
import { describe, it, expect } from 'vitest';
import { bboxDimensionsMeters, wgs84ToUTM } from '../utm';

describe('UTM projection correctness', () => {
  it('computes correct dimensions for a known bbox in NYC', () => {
    // 1 degree of longitude at 40.7° N ≈ 85,394 m (verified via USGS)
    // 1 degree of latitude ≈ 111,320 m (roughly constant)
    const sw: [number, number] = [-74.006, 40.712];
    const ne: [number, number] = [-73.006, 41.712];
    const { widthM, heightM } = bboxDimensionsMeters(sw, ne);
    // ~85km wide, ~111km tall — verify within 1% tolerance
    expect(widthM).toBeCloseTo(85394, -3); // within 1000m
    expect(heightM).toBeCloseTo(111320, -3);
  });

  it('gives symmetric dimensions near the equator', () => {
    const sw: [number, number] = [-1.0, -0.5];
    const ne: [number, number] = [1.0, 0.5];
    const { widthM, heightM } = bboxDimensionsMeters(sw, ne);
    // Both 2° spans near equator should be close to 222km
    expect(Math.abs(widthM - heightM)).toBeLessThan(5000); // < 5km difference
  });
});
```

### STL Coordinate Pipeline Test (FNDN-02 Verification)

```typescript
// src/lib/__tests__/stl.test.ts
import { describe, it, expect } from 'vitest';
import { bboxToMM } from '../stl';

describe('STL coordinate pipeline', () => {
  it('converts 1m × 1m bbox to 1000mm × 1000mm', () => {
    const result = bboxToMM(1.0, 1.0);
    expect(result.widthMM).toBe(1000);
    expect(result.heightMM).toBe(1000);
  });

  it('converts 2300m × 1800m to correct mm dimensions', () => {
    const result = bboxToMM(2300, 1800);
    expect(result.widthMM).toBe(2300000);
    expect(result.heightMM).toBe(1800000);
  });
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Mapbox GL JS (BSD) | MapLibre GL JS | Dec 2020 (Mapbox license change) | MapLibre is the open-source standard; Mapbox requires paid account |
| react-map-gl (unified) | @vis.gl/react-maplibre (dedicated) | 2024 (vis.gl split packages) | Dedicated MapLibre package; cleaner API; no Mapbox dependency |
| mapbox-gl-draw | Terra Draw | 2024-2025 | Terra Draw is actively maintained, MapLibre-native, officially listed |
| Tailwind CSS v3 (PostCSS) | Tailwind CSS v4 (Vite plugin) | Jan 2025 | Zero PostCSS config; first-party Vite plugin; simpler setup |
| Jest + Babel | Vitest | 2023-2024 | Native Vite/ESM; no transpilation config; faster |

**Deprecated/outdated:**
- `mapbox-gl-draw` for new MapLibre projects: Mapbox-gl-draw is not officially maintained against MapLibre v5; `maplibre-gl-draw` npm package is 2 years stale. Use Terra Draw.
- `react-map-gl` (unified package): Split into `@vis.gl/react-maplibre` and `@vis.gl/react-mapbox`; the unified package still works but the dedicated packages are preferred for new projects.
- `maplibre-geoman`: Listed as a MapLibre plugin but smaller community than Terra Draw; Terra Draw is the better choice for a pure rectangle selection workflow.

---

## Open Questions

1. **MapTiler free tier rate limits**
   - What we know: MapTiler free tier provides 1,000 monthly "elements" for development; satellite tiles require a valid API key
   - What's unclear: Whether the free tier is sufficient for development testing of satellite tiles, or whether daily limits hit quickly with active development
   - Recommendation: Sign up for MapTiler free account immediately; if tiles start returning 401/403, consider the Starter plan or use OpenStreetMap vector tiles (no key required) as a fallback for non-satellite development

2. **Terra Draw rectangle resize visual accuracy at high latitudes**
   - What we know: Terra Draw's `resizable` option uses Web Mercator projection for resize operations; official docs note this limitation
   - What's unclear: Whether this creates visually jarring distortion for users drawing bboxes in Scandinavia or Alaska
   - Recommendation: Accept for Phase 1 — the extracted WGS84 coordinates are always correct; the visual on-screen shape is just a selection aid. Flag for Phase 2 review if user testing reveals confusion.

3. **Terra Draw adapter package name**
   - What we know: The adapter is listed as `terra-draw-maplibre-gl-adapter` in documentation examples
   - What's unclear: Whether this is a separate npm package or bundled into `terra-draw` in v1.25+
   - Recommendation: Check npm registry for `terra-draw-maplibre-gl-adapter` at project setup; if not found as separate package, look for it re-exported from `terra-draw` directly

---

## Validation Architecture

> `nyquist_validation` is not present in `.planning/config.json` — this section is included because the phase has explicit automated test requirements embedded in the success criteria (FNDN-01, FNDN-02).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (latest ^3.x) |
| Config file | `vitest.config.ts` — does not exist yet (Wave 0 gap) |
| Quick run command | `npx vitest run src/lib/__tests__/` |
| Full suite command | `npx vitest run` |
| Estimated runtime | ~3–5 seconds |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LOCS-01 | Search accepts city/address/lat-lon | manual | — | N/A — UI behavior |
| LOCS-02 | Click-drag draws rectangle on map | manual | — | N/A — requires map render |
| LOCS-03 | Edges/corners resize and reposition bbox | manual | — | N/A — requires map render |
| FNDN-01 | UTM projection produces correct meter dimensions | unit | `npx vitest run src/lib/__tests__/utm.test.ts` | Wave 0 gap |
| FNDN-02 | STL coordinate pipeline writes mm values | unit | `npx vitest run src/lib/__tests__/stl.test.ts` | Wave 0 gap |

### Nyquist Sampling Rate
- **Minimum sample interval:** After any change to `utm.ts` or `stl.ts` → run: `npx vitest run src/lib/__tests__/`
- **Full suite trigger:** Before marking Phase 1 complete
- **Phase-complete gate:** Both FNDN-01 and FNDN-02 tests green
- **Estimated feedback latency per task:** ~3 seconds

### Wave 0 Gaps (must be created before implementation)

- [ ] `src/lib/__tests__/utm.test.ts` — covers FNDN-01 (UTM projection correctness at known latitudes)
- [ ] `src/lib/__tests__/stl.test.ts` — covers FNDN-02 (meters → millimeters coordinate pipeline)
- [ ] `vitest.config.ts` — Vitest configuration with jsdom environment
- [ ] `src/test/setup.ts` — testing-library/jest-dom matchers setup
- [ ] Framework install: `npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom`

*(LOCS-01, LOCS-02, LOCS-03 are manual-only: they require an interactive browser map with WebGL rendering — not automatable without full E2E infrastructure, which is out of scope for Phase 1)*

---

## Sources

### Primary (HIGH confidence)
- [MapLibre GL JS Docs](https://maplibre.org/maplibre-gl-js/docs/) — satellite tile example, plugin list, Terra Draw example
- [MapLibre Plugins Page](https://maplibre.org/maplibre-gl-js/docs/plugins/) — official listing of Terra Draw, maplibre-geoman, mapbox-gl-draw as endorsed plugins
- [npm: maplibre-gl 5.18.0](https://www.npmjs.com/package/maplibre-gl) — current version confirmed
- [@vis.gl/react-maplibre docs](https://visgl.github.io/react-maplibre/docs/get-started) — installation, Map component API
- [npm: @vis.gl/react-maplibre 8.1.0](https://www.npmjs.com/package/@vis.gl/react-maplibre) — current version confirmed
- [Terra Draw GitHub](https://github.com/JamesLMilner/terra-draw) — modes documentation, getting started guide
- [npm: terra-draw 1.25.0](https://www.npmjs.com/package/terra-draw) — current version confirmed
- [MapTiler Geocoding Control React docs](https://docs.maptiler.com/react/maplibre-gl-js/geocoding-control/) — React import pattern, installation
- [npm: @maptiler/geocoding-control 2.1.7](https://www.npmjs.com/package/@maptiler/geocoding-control) — current version confirmed
- [proj4js README](https://github.com/proj4js/proj4js/blob/master/README.md) — UTM zone calculation, WGS84→UTM transform API
- [npm: proj4 2.20.0](https://libraries.io/npm/proj4) — current version with built-in UTM zones
- [npm: zustand 5.0.11](https://www.npmjs.com/package/zustand) — current version confirmed
- [Tailwind CSS v4 blog post](https://tailwindcss.com/blog/tailwindcss-v4) — Vite plugin, zero PostCSS config
- [Vitest docs](https://vitest.dev/guide/) — setup, jsdom environment, test commands
- [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/) — 1 req/sec hard cap for public app (reject reason documented)
- [STL format specification (LOC)](https://www.loc.gov/preservation/digital/formats/fdd/fdd000505.shtml) — binary STL float32 structure, coordinate units arbitrary

### Secondary (MEDIUM confidence)
- [MapTiler satellite tiles docs](https://docs.maptiler.com/cloud/api/tiles/) — URL format for satellite-v2 tileset (verified with official docs)
- [Terra Draw Modes Guide](https://github.com/JamesLMilner/terra-draw/blob/main/guides/4.MODES.md) — TerraDrawSelectMode resizable options (fetched from GitHub)
- [UTM accuracy specification](https://gisgeography.com/utm-universal-transverse-mercator-projection/) — <1:1000 distortion within zone (corroborated by USGS)

### Tertiary (LOW confidence)
- Terra Draw `terra-draw-maplibre-gl-adapter` as a separate npm package: referenced in docs examples but exact package separation from `terra-draw` core not directly confirmed from npm registry in this research session — validate at project setup

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified against npm registry and official docs; versions confirmed
- Architecture: HIGH — patterns derived from official documentation examples
- Pitfalls: MEDIUM — UTM/projection pitfalls from USGS + GIS community documentation; Terra Draw-specific pitfalls from issue tracker search
- Test strategy: HIGH — Vitest setup from official docs; test cases derived directly from FNDN-01/FNDN-02 success criteria

**Research date:** 2026-02-23
**Valid until:** 2026-05-23 (90 days — stack is stable; maplibre-gl and terra-draw release frequently but API is stable)
