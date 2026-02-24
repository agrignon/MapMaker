import { useRef, useEffect, useMemo, useCallback } from 'react';
import { useMap } from '@vis.gl/react-maplibre';
import { GeocodingControl } from '@maptiler/geocoding-control/react';
import { createMapLibreGlMapController } from '@maptiler/geocoding-control/maplibregl';
import maplibregl from 'maplibre-gl';
import type { MapController } from '@maptiler/geocoding-control/types';
import '@maptiler/geocoding-control/style.css';

const API_KEY = import.meta.env.VITE_MAPTILER_KEY ?? '';

/** Pattern for "lat, lon" input (e.g. "48.8566, 2.3522"). */
const LAT_LON_RE = /^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/;

/**
 * Geocoding search overlay with MapTiler autocomplete.
 * Also intercepts raw "lat, lon" coordinate input and flies the map directly,
 * bypassing the geocoding API.
 */
export function SearchOverlay() {
  const maps = useMap();
  const mapRef = maps['main-map'] ?? maps.current;

  const mapController = useMemo<MapController | undefined>(() => {
    const map = mapRef?.getMap();
    if (!map) return undefined;
    return createMapLibreGlMapController(map, maplibregl);
  }, [mapRef]);

  // Track input value via ref to intercept lat/lon before API call
  const inputValueRef = useRef('');

  const handlePick = useCallback(
    (result: unknown) => {
      // If result is null the user typed raw coordinates — handled separately
      if (result !== null) return;
      const value = inputValueRef.current.trim();
      const match = value.match(LAT_LON_RE);
      if (match) {
        const lat = parseFloat(match[1]);
        const lon = parseFloat(match[2]);
        const map = mapRef?.getMap();
        if (map) {
          map.flyTo({ center: [lon, lat], zoom: 14 });
        }
      }
    },
    [mapRef]
  );

  // Listen to the search input element for lat/lon pattern detection
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleInput = (e: Event) => {
      const input = e.target as HTMLInputElement;
      inputValueRef.current = input.value;

      const value = input.value.trim();
      const match = value.match(LAT_LON_RE);
      if (match) {
        const lat = parseFloat(match[1]);
        const lon = parseFloat(match[2]);
        const map = mapRef?.getMap();
        if (map) {
          // Fly immediately on valid lat/lon input
          map.flyTo({ center: [lon, lat], zoom: 14 });
        }
      }
    };

    container.addEventListener('input', handleInput, true);
    return () => container.removeEventListener('input', handleInput, true);
  }, [mapRef]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: 10,
        left: 10,
        zIndex: 10,
        width: 320,
      }}
    >
      <GeocodingControl
        apiKey={API_KEY}
        mapController={mapController}
        onPick={handlePick}
      />
    </div>
  );
}
