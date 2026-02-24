import { Map, useMap } from '@vis.gl/react-maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { SearchOverlay } from './SearchOverlay';
import { useTerradraw } from '../../hooks/useTerradraw';

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY ?? '';

const MAP_STYLE = `https://api.maptiler.com/maps/satellite-v2/style.json?key=${MAPTILER_KEY}`;

/**
 * Inner component rendered as a child of <Map> so that useMap() works.
 * Initialises Terra Draw for bbox drawing and wires other map interactions.
 */
function MapInteractions() {
  // useMap must be called inside a component that is a descendant of <Map>
  const maps = useMap();
  const mapInstance = maps['main-map']?.getMap() ?? null;

  useTerradraw(mapInstance);

  return (
    <>
      <SearchOverlay />
    </>
  );
}

/** Renders the full-viewport MapLibre satellite map with geocoding search overlay. */
export function MapView() {
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
    >
      <MapInteractions />
    </Map>
  );
}
