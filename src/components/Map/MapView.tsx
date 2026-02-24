import { useState, useCallback } from 'react';
import { Map, useMap } from '@vis.gl/react-maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { SearchOverlay } from './SearchOverlay';
import { useTerradraw } from '../../hooks/useTerradraw';
import type { MapEvent } from '@vis.gl/react-maplibre';

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY as string | undefined;

const MAP_STYLE = `https://api.maptiler.com/maps/satellite/style.json?key=${MAPTILER_KEY ?? ''}`;

/**
 * Inner component rendered as a child of <Map> so that useMap() works.
 * Initialises Terra Draw for bbox drawing and wires other map interactions.
 * Only mounted after the map's style is fully loaded (controlled by parent).
 */
function MapInteractions() {
  const maps = useMap();
  const mapInstance = maps.current?.getMap() ?? null;

  useTerradraw(mapInstance);

  return <SearchOverlay />;
}

/** Renders the full-viewport MapLibre satellite map with geocoding search overlay. */
export function MapView() {
  const [mapReady, setMapReady] = useState(false);
  const handleLoad = useCallback((_e: MapEvent) => setMapReady(true), []);

  if (!MAPTILER_KEY) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900 text-white p-8">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-bold mb-2">MapTiler API Key Missing</h2>
          <p className="text-gray-400 mb-4">
            Copy <code className="text-amber-400">.env.example</code> to{' '}
            <code className="text-amber-400">.env</code> and set your MapTiler API key.
          </p>
          <code className="block bg-gray-800 p-3 rounded text-sm text-left">
            cp .env.example .env<br />
            # Edit .env and set VITE_MAPTILER_KEY=your_key
          </code>
        </div>
      </div>
    );
  }

  return (
    <Map
      id="main-map"
      initialViewState={{
        longitude: 0,
        latitude: 20,
        zoom: 2,
      }}
      style={{ width: '100%', height: '100%' }}
      mapStyle={MAP_STYLE}
      onLoad={handleLoad}
    >
      {mapReady && <MapInteractions />}
    </Map>
  );
}
