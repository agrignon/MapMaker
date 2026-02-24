import { useEffect } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { useMapStore } from '../store/mapStore';

const SOURCE_ID = 'bbox-source';
const FILL_LAYER = 'bbox-fill';
const LINE_LAYER = 'bbox-line';

/** Build a GeoJSON Polygon from SW/NE corners. */
function bboxPolygon(sw: { lng: number; lat: number }, ne: { lng: number; lat: number }): GeoJSON.Feature<GeoJSON.Polygon> {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [sw.lng, sw.lat],
        [ne.lng, sw.lat],
        [ne.lng, ne.lat],
        [sw.lng, ne.lat],
        [sw.lng, sw.lat],
      ]],
    },
  };
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * Custom hook for bbox drawing on a MapLibre map.
 *
 * Drawing: Shift+drag draws a rectangle.
 * Visualization: native MapLibre GeoJSON source + fill/line layers.
 * Post-draw: Shift+drag again replaces the rectangle.
 *
 * @param map - A live MapLibre map instance (style must be loaded).
 */
export function useTerradraw(map: MapLibreMap | null): void {
  useEffect(() => {
    if (!map) return;

    // Disable MapLibre's box zoom (also Shift+drag)
    map.boxZoom.disable();

    // -----------------------------------------------------------------------
    // MapLibre source + layers for persistent rectangle rendering
    // -----------------------------------------------------------------------
    map.addSource(SOURCE_ID, { type: 'geojson', data: EMPTY_FC });
    map.addLayer({
      id: FILL_LAYER,
      type: 'fill',
      source: SOURCE_ID,
      paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.2 },
    });
    map.addLayer({
      id: LINE_LAYER,
      type: 'line',
      source: SOURCE_ID,
      paint: { 'line-color': '#3b82f6', 'line-width': 2, 'line-opacity': 0.8 },
    });

    function updateRect(sw: { lng: number; lat: number }, ne: { lng: number; lat: number }) {
      const src = map!.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      if (src) src.setData({ type: 'FeatureCollection', features: [bboxPolygon(sw, ne)] });
    }

    function clearRect() {
      const src = map!.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      if (src) src.setData(EMPTY_FC);
    }

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
      if (e.key === 'Shift' && !drawing) canvas.style.cursor = 'crosshair';
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift' && !drawing) canvas.style.cursor = '';
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!e.shiftKey || !e.isPrimary || e.button !== 0) return;

      drawing = true;
      const rect = canvas.getBoundingClientRect();
      startX = e.clientX - rect.left;
      startY = e.clientY - rect.top;

      map.dragPan.disable();

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

      if (overlay) { overlay.remove(); overlay = null; }

      map.dragPan.enable();
      canvas.style.cursor = '';

      const rect = canvas.getBoundingClientRect();
      const endX = e.clientX - rect.left;
      const endY = e.clientY - rect.top;

      // Ignore tiny drags (< 5px)
      if (Math.abs(endX - startX) < 5 && Math.abs(endY - startY) < 5) return;

      const p1 = map.unproject([startX, startY]);
      const p2 = map.unproject([endX, endY]);

      const sw = { lng: Math.min(p1.lng, p2.lng), lat: Math.min(p1.lat, p2.lat) };
      const ne = { lng: Math.max(p1.lng, p2.lng), lat: Math.max(p1.lat, p2.lat) };

      // Render persistent rectangle on map
      updateRect(sw, ne);

      // Update store
      useMapStore.getState().setBbox(
        { lon: sw.lng, lat: sw.lat },
        { lon: ne.lng, lat: ne.lat },
      );
    };

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
      if (map.getLayer(LINE_LAYER)) map.removeLayer(LINE_LAYER);
      if (map.getLayer(FILL_LAYER)) map.removeLayer(FILL_LAYER);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      map.boxZoom.enable();
      void clearRect;
    };
  }, [map]);
}
