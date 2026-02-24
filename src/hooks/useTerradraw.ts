import { useEffect, useRef } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import {
  TerraDraw,
  TerraDrawRectangleMode,
  TerraDrawSelectMode,
} from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import { useMapStore } from '../store/mapStore';

/**
 * Custom hook that initialises and manages a TerraDraw instance on a MapLibre map.
 *
 * Provides click-and-drag rectangle drawing, plus select mode for resize/reposition.
 * Bbox coordinates are written to the Zustand store on every change event.
 *
 * @param map - A live maplibre-gl Map instance (or null before the map is ready).
 */
export function useTerradraw(map: MapLibreMap | null): void {
  const drawRef = useRef<TerraDraw | null>(null);

  useEffect(() => {
    if (!map) return;

    let draw: TerraDraw | null = null;
    let cancelled = false;

    const init = () => {
      if (cancelled) return;

      // Build TerraDraw instance with rectangle + select modes
      draw = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map }),
        modes: [
          new TerraDrawRectangleMode({
            styles: {
              fillColor: '#3b82f6',      // Tailwind blue-500
              fillOpacity: 0.2,
              outlineColor: '#3b82f6',   // Tailwind blue-500
              outlineOpacity: 0.8,
              outlineWidth: 2,
            },
          }),
          new TerraDrawSelectMode({
            flags: {
              rectangle: {
                feature: {
                  draggable: true,
                  coordinates: {
                    midpoints: true,
                    draggable: true,
                    resizable: 'opposite',
                  },
                },
              },
            },
          }),
        ],
      });

      draw.start();
      draw.setMode('rectangle');
      drawRef.current = draw;

      wireChangeHandler(draw);
    };

    // Wait for the map style to load before starting TerraDraw.
    // draw.start() adds sources/layers which throw if style isn't ready.
    if (map.isStyleLoaded()) {
      init();
    } else {
      map.once('style.load', init);
    }

    // -----------------------------------------------------------------------
    // Handle feature changes: sync bbox to Zustand store
    // -----------------------------------------------------------------------
    function wireChangeHandler(d: TerraDraw) {
      const handleChange = (ids: (string | number)[], type: string) => {
        if (type === 'create' || type === 'update') {
          const snapshot = d.getSnapshot();

          // Find all rectangle features
          const rectangles = snapshot.filter(
            (f) =>
              f.geometry.type === 'Polygon' &&
              f.properties?.['mode'] === 'rectangle',
          );

          if (rectangles.length === 0) return;

          // Enforce single-rectangle constraint: if a new one was just created
          // and there are now more than one, remove the old ones.
          if (type === 'create' && rectangles.length > 1) {
            // The newly created feature is the one whose id is in ids[0]
            const newId = ids[0];
            const toRemove = rectangles
              .filter((f) => f.id !== newId)
              .map((f) => f.id as string | number);
            if (toRemove.length > 0) {
              d.removeFeatures(toRemove);
            }
          }

          // After potential removal, read the remaining (first) rectangle
          const afterSnapshot = d.getSnapshot();
          const remaining = afterSnapshot.filter(
            (f) =>
              f.geometry.type === 'Polygon' &&
              f.properties?.['mode'] === 'rectangle',
          );

          if (remaining.length === 0) return;

          const coords =
            (remaining[0].geometry as GeoJSON.Polygon).coordinates[0];

          // Derive SW (min lon, min lat) and NE (max lon, max lat)
          let minLon = Infinity, minLat = Infinity;
          let maxLon = -Infinity, maxLat = -Infinity;

          for (const [lon, lat] of coords) {
            if (lon < minLon) minLon = lon;
            if (lat < minLat) minLat = lat;
            if (lon > maxLon) maxLon = lon;
            if (lat > maxLat) maxLat = lat;
          }

          useMapStore.getState().setBbox(
            { lon: minLon, lat: minLat },
            { lon: maxLon, lat: maxLat },
          );

          // After a fresh creation, switch to select mode so the user can
          // immediately resize/reposition without a manual mode toggle.
          if (type === 'create') {
            d.setMode('select');
          }
        } else if (type === 'delete') {
          // If the user deletes the rectangle, clear the store
          const snapshot = d.getSnapshot();
          const stillHasRectangle = snapshot.some(
            (f) =>
              f.geometry.type === 'Polygon' &&
              f.properties?.['mode'] === 'rectangle',
          );
          if (!stillHasRectangle) {
            useMapStore.getState().clearBbox();
          }
        }
      };

      d.on('change', handleChange);
    }

    // -----------------------------------------------------------------------
    // Cleanup: stop TerraDraw on unmount / map change
    // -----------------------------------------------------------------------
    return () => {
      cancelled = true;
      map.off('style.load', init);
      if (draw) {
        draw.stop();
        drawRef.current = null;
      }
    };
  }, [map]);
}
