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
 * Syncs a TerraDraw snapshot to the Zustand store.
 * Extracts the first rectangle polygon and derives SW/NE bbox.
 */
function syncBboxToStore(draw: TerraDraw) {
  const snapshot = draw.getSnapshot();
  const rect = snapshot.find(
    (f) =>
      f.geometry.type === 'Polygon' &&
      f.properties?.['mode'] === 'rectangle',
  );

  if (!rect) {
    useMapStore.getState().clearBbox();
    return;
  }

  const coords = (rect.geometry as GeoJSON.Polygon).coordinates[0];
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
}

/**
 * Custom hook that manages bbox drawing on a MapLibre map.
 *
 * Drawing: Shift+drag draws a rectangle (standard map app pattern).
 * Post-draw: TerraDraw select mode handles resize/reposition.
 *
 * @param map - A live maplibre-gl Map instance (or null before ready).
 *              Style must be loaded (MapView gates via onLoad).
 */
export function useTerradraw(map: MapLibreMap | null): void {
  const drawRef = useRef<TerraDraw | null>(null);

  useEffect(() => {
    if (!map) return;

    // Disable MapLibre's built-in box zoom (also Shift+drag) to avoid conflict
    map.boxZoom.disable();

    // -----------------------------------------------------------------------
    // TerraDraw: used for rendering the rectangle + select mode (resize/move)
    // -----------------------------------------------------------------------
    const draw = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map }),
      modes: [
        new TerraDrawRectangleMode({
          styles: {
            fillColor: '#3b82f6',
            fillOpacity: 0.2,
            outlineColor: '#3b82f6',
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
    // Stay in 'static' mode (default after start) — Shift+drag handles drawing
    drawRef.current = draw;

    // Sync store when features are modified via select mode (resize/reposition)
    const handleChange = (_ids: (string | number)[], type: string) => {
      if (type === 'update' || type === 'delete') {
        syncBboxToStore(draw);
      }
    };
    draw.on('change', handleChange);

    // -----------------------------------------------------------------------
    // Shift+drag rectangle drawing
    // -----------------------------------------------------------------------
    const canvas = map.getCanvas();
    const container = map.getContainer();
    let drawing = false;
    let startX = 0;
    let startY = 0;
    let overlay: HTMLDivElement | null = null;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift' && !drawing) {
        canvas.style.cursor = 'crosshair';
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift' && !drawing) {
        canvas.style.cursor = '';
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!e.shiftKey || !e.isPrimary || e.button !== 0) return;

      drawing = true;
      const rect = canvas.getBoundingClientRect();
      startX = e.clientX - rect.left;
      startY = e.clientY - rect.top;

      // Disable map panning while drawing
      map.dragPan.disable();

      // Create visual overlay for the drawing preview
      overlay = document.createElement('div');
      overlay.style.cssText =
        'position:absolute;background:rgba(59,130,246,0.2);border:2px solid rgba(59,130,246,0.8);pointer-events:none;z-index:5;';
      container.appendChild(overlay);

      canvas.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!drawing || !overlay) return;

      const rect = canvas.getBoundingClientRect();
      const curX = e.clientX - rect.left;
      const curY = e.clientY - rect.top;

      overlay.style.left = Math.min(startX, curX) + 'px';
      overlay.style.top = Math.min(startY, curY) + 'px';
      overlay.style.width = Math.abs(curX - startX) + 'px';
      overlay.style.height = Math.abs(curY - startY) + 'px';
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!drawing) return;
      drawing = false;

      // Remove overlay
      if (overlay) {
        overlay.remove();
        overlay = null;
      }

      // Re-enable map panning
      map.dragPan.enable();
      canvas.style.cursor = '';

      // Convert pixel coords to geographic coords
      const rect = canvas.getBoundingClientRect();
      const endX = e.clientX - rect.left;
      const endY = e.clientY - rect.top;

      // Ignore tiny drags (< 5px in any direction)
      if (Math.abs(endX - startX) < 5 && Math.abs(endY - startY) < 5) return;

      const p1 = map.unproject([startX, startY]);
      const p2 = map.unproject([endX, endY]);

      const sw = {
        lng: Math.min(p1.lng, p2.lng),
        lat: Math.min(p1.lat, p2.lat),
      };
      const ne = {
        lng: Math.max(p1.lng, p2.lng),
        lat: Math.max(p1.lat, p2.lat),
      };

      // Clear any existing rectangle
      const existing = draw.getSnapshot();
      if (existing.length > 0) {
        draw.removeFeatures(existing.map((f) => f.id as string | number));
      }

      // Add the new rectangle to TerraDraw (enables select mode resize/move)
      draw.addFeatures([
        {
          type: 'Feature',
          properties: { mode: 'rectangle' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [sw.lng, sw.lat],
                [ne.lng, sw.lat],
                [ne.lng, ne.lat],
                [sw.lng, ne.lat],
                [sw.lng, sw.lat],
              ],
            ],
          },
        },
      ]);

      // Switch to select mode for resize/reposition
      draw.setMode('select');

      // Update the store
      useMapStore.getState().setBbox(
        { lon: sw.lng, lat: sw.lat },
        { lon: ne.lng, lat: ne.lat },
      );
    };

    // Register event handlers
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // -----------------------------------------------------------------------
    // Cleanup
    // -----------------------------------------------------------------------
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      draw.off('change', handleChange);
      draw.stop();
      drawRef.current = null;
      map.boxZoom.enable();
    };
  }, [map]);
}
