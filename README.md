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

### 1. Install Node.js

You need **Node.js 18 or newer**. If you don't have it installed:

- **macOS** — `brew install node` (via [Homebrew](https://brew.sh/)), or download from [nodejs.org](https://nodejs.org/)
- **Windows** — download the installer from [nodejs.org](https://nodejs.org/) (pick the LTS version)
- **Linux** — `sudo apt install nodejs npm` (Ubuntu/Debian) or see [nodejs.org](https://nodejs.org/)

Verify it's installed by opening a terminal and running:

```bash
node --version   # should print v18.x.x or higher
npm --version    # should print 9.x.x or higher
```

### 2. Get a MapTiler API Key (free)

MapMaker uses [MapTiler](https://www.maptiler.com/) for satellite map tiles and elevation data. You need a free API key:

1. Go to [cloud.maptiler.com/auth/widget](https://cloud.maptiler.com/auth/widget?next=https://cloud.maptiler.com) and create an account (email or Google/GitHub sign-in)
2. After signing in, go to [API Keys](https://cloud.maptiler.com/account/keys/) in your dashboard
3. You'll see a default key already created — copy it

That's it. The free tier is more than enough for personal use.

### 3. Clone and install

```bash
git clone https://github.com/your-username/MapMaker.git
cd MapMaker
npm install
```

`npm install` downloads all dependencies — this may take a minute the first time.

### 4. Add your API key

```bash
cp .env.example .env
```

Open the `.env` file in any text editor and replace `your_key_here` with the MapTiler API key you copied:

```
VITE_MAPTILER_KEY=abc123yourActualKeyHere
```

Save the file. Never share this key or commit the `.env` file (it's already in `.gitignore`).

### 5. Start the app

```bash
npm run dev
```

Open [http://localhost:5000](http://localhost:5000) in your browser. You should see the map editor.

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server at localhost:5000 |
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
