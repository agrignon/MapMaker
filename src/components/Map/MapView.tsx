import { Map } from '@vis.gl/react-maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { SearchOverlay } from './SearchOverlay';

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY ?? '';

const MAP_STYLE = `https://api.maptiler.com/maps/satellite-v2/style.json?key=${MAPTILER_KEY}`;

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
      <SearchOverlay />
    </Map>
  );
}
