# MapMaker

A web application that converts real-world map data into 3D printable STL models. Users select an area on a map, and the app generates a 3D mesh incorporating terrain elevation, buildings, roads, water, and vegetation.

## Architecture

- **Frontend**: React + TypeScript + Vite, running on port 5000
- **Styling**: Tailwind CSS v4 (via Vite plugin)
- **Map rendering**: MapLibre GL JS with MapTiler tiles
- **3D rendering**: Three.js via @react-three/fiber and @react-three/drei
- **Drawing**: Terra Draw for bounding box selection
- **State**: Zustand
- **Data sources**: OpenStreetMap (Overpass API), Overture Maps (PMTiles), MapTiler elevation tiles

## Key Dependencies

- `maplibre-gl` + `@vis.gl/react-maplibre` — 2D map view
- `terra-draw` — bounding box drawing on map
- `three` + `@react-three/fiber` — 3D mesh preview
- `manifold-3d` — 3D geometry operations (CSG)
- `@mapbox/martini` — terrain mesh generation from elevation rasters
- `proj4` — coordinate system transformations (WGS84 ↔ UTM)
- `earcut` — polygon triangulation

## Environment Variables

- `VITE_MAPTILER_KEY` — Required MapTiler API key for map tiles and elevation data

## Project Structure

```
src/
  App.tsx              — Root component with panel layout
  main.tsx             — Entry point
  components/
    Layout/            — App shell and panel layout
    Map/               — MapLibre map view + Terra Draw integration
    Preview/           — Three.js 3D preview
    Sidebar/           — Controls panel
  hooks/
    useTerradraw.ts    — Terra Draw hook
  lib/
    buildings/         — Building mesh generation
    elevation/         — Terrain elevation fetching and mesh
    export/            — STL export
    mesh/              — Shared mesh utilities
    roads/             — Road mesh generation
    vegetation/        — Vegetation mesh generation
    water/             — Water mesh generation
    overpass.ts        — OpenStreetMap Overpass API queries
    overture/          — Overture Maps MVT parser
    stl.ts             — STL file format writer
    utm.ts             — UTM coordinate utilities
  store/
    mapStore.ts        — Zustand global state
  types/               — TypeScript type definitions
  workers/
    meshBuilder.worker.ts    — Web worker for mesh building
    meshBuilderClient.ts     — Client-side worker interface
```

## Development

```bash
npm install
npm run dev        # starts on http://0.0.0.0:5000
npm run build      # TypeScript compile + Vite build → dist/
npm test           # Vitest unit tests
```

## Deployment

Configured as a static site deployment:
- Build command: `npm run build`
- Public directory: `dist`
