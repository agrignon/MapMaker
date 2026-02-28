import { useRef, useEffect, useMemo, useCallback } from 'react';
import { useMap } from '@vis.gl/react-maplibre';
import { GeocodingControl } from '@maptiler/geocoding-control/react';
import { createMapLibreGlMapController } from '@maptiler/geocoding-control/maplibregl';
import maplibregl from 'maplibre-gl';
import type { MapController } from '@maptiler/geocoding-control/types';
import '@maptiler/geocoding-control/style.css';
import { useMapStore } from '../../store/mapStore';

const API_KEY = (import.meta.env.VITE_MAPTILER_KEY as string | undefined) ?? '';

/** Pattern for "lat, lon" input (e.g. "48.8566, 2.3522"). */
const LAT_LON_RE = /^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/;

/**
 * Geocoding search overlay with MapTiler autocomplete.
 * Also intercepts raw "lat, lon" coordinate input and flies the map directly,
 * bypassing the geocoding API.
 *
 * Only mounted after the map's style is fully loaded (MapView gates via onLoad),
 * so it's safe to access map sources immediately.
 *
 * Returns null if no API key is configured.
 */
export function SearchOverlay() {
  const maps = useMap();
  const mapRef = maps['main-map'] ?? maps.current;
  const setLocationName = useMapStore((s) => s.setLocationName);

  const mapController = useMemo<MapController | undefined>(() => {
    const map = mapRef?.getMap();
    if (!map) return undefined;
    return createMapLibreGlMapController(map, maplibregl);
  }, [mapRef]);

  // Track input value via ref to intercept lat/lon before API call
  const inputValueRef = useRef('');

  const handlePick = useCallback(
    (event: { feature?: { text?: string; place_name?: string; center?: [number, number] } }) => {
      if (event?.feature) {
        // Use text (short name like "London") for clean filenames.
        // Prefer text over place_name ("London, Greater London, England, United Kingdom").
        const name = event.feature.text ?? event.feature.place_name;
        if (name) {
          setLocationName(name);
        }
      }

      // Preserve existing lat/lon coordinate interception
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
    [mapRef, setLocationName]
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

  // Safety guard: if API key is missing, render nothing rather than a broken widget
  if (!API_KEY) return null;

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
