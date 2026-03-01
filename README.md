# MapMaker

A web app that turns any real-world location into a 3D-printable terrain model. Select an area on a map, toggle geographic features (terrain, buildings, roads, water, vegetation), adjust dimensions, and export a watertight STL file ready for your printer.

![React](https://img.shields.io/badge/React_19-61DAFB?logo=react&logoColor=black)
![Three.js](https://img.shields.io/badge/Three.js-000?logo=threedotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)

## Features

- **Location search** — city name, street address, or coordinates
- **Bounding box selection** — draw, resize, and reposition on a satellite map
- **Real terrain elevation** — DEM tiles decoded into 3D mesh via Martini RTIN
- **Buildings** — OSM + Overture Maps with detailed roof geometry (gabled, hipped), height fallbacks, and spatial deduplication
- **Roads** — type-based widths, recessed/raised/flat styles
- **Water** — rivers and lakes as depressions baked into the terrain
- **Vegetation** — parks and forests as raised geometry
- **Layer toggles** — turn any feature on or off
- **Physical dimensions** — set X/Y/Z size in mm or inches
- **Terrain controls** — exaggeration slider, smoothing slider, minimum height floor
- **Live 3D preview** — orbit, zoom, and pan alongside the 2D map editor
- **STL export** — watertight solid with base plate, location name in filename
- **Client-side processing** — all mesh generation runs in a Web Worker, nothing leaves the browser

## Getting Started

### Prerequisites

- Node.js 18+
- A free [MapTiler](https://www.maptiler.com/) API key (for map tiles and elevation data)

### Setup

```bash
git clone https://github.com/your-username/MapMaker.git
cd MapMaker
npm install
cp .env.example .env
# Edit .env and add your MapTiler API key
npm run dev
```

The app starts at `http://localhost:5000`.

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | TypeScript check + production build |
| `npm run preview` | Serve production build locally |
| `npm test` | Run tests (Vitest) |
| `npm run test:watch` | Run tests in watch mode |

## Tech Stack

| Layer | Technology |
|-------|------------|
| UI | React 19, Tailwind CSS v4 |
| 3D | Three.js, React Three Fiber, React Three Drei |
| Map | MapLibre GL JS, Terra Draw |
| State | Zustand |
| Build | Vite, TypeScript |
| Test | Vitest, Testing Library, jsdom |
| Data | MapTiler (elevation), OpenStreetMap / Overpass API, Overture Maps (PMTiles) |

## Project Structure

```
src/
  App.tsx                  Root component with panel layout
  components/
    Layout/                App shell and resizable panels
    Map/                   MapLibre satellite map + Terra Draw
    Preview/               Three.js 3D preview + export panel
    Sidebar/               Controls (layers, dimensions, terrain)
  lib/
    buildings/             Building mesh generation + roof geometry
    elevation/             DEM tile fetching and decode
    mesh/                  Terrain mesh (Martini), raycaster, base plate
    roads/                 Road geometry generation
    water/                 Water body parsing and depression
    vegetation/            Vegetation geometry
    overture/              Overture Maps PMTiles fetch + MVT parser
    overpass.ts            Combined OSM Overpass query
    stl.ts                 Binary STL serializer
    utm.ts                 UTM coordinate projection
  store/
    mapStore.ts            Zustand global state
  workers/
    meshBuilder.worker.ts  Off-thread mesh generation
```

## How It Works

1. User searches for a location and draws a bounding box
2. Elevation tiles are fetched and decoded into a heightmap grid
3. The terrain grid is smoothed, water depressions are baked in, and a Martini RTIN mesh is built
4. Buildings, roads, water, and vegetation are fetched from OSM (+ Overture for buildings) and placed on the terrain via BVH raycasting
5. Each feature layer is a separate watertight shell — slicers compute the union automatically
6. The final STL is serialized with a solid base plate and downloaded

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_MAPTILER_KEY` | Yes | MapTiler API key for map tiles and elevation data |

## License

All rights reserved.
