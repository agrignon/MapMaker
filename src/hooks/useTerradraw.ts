import { useEffect } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { useMapStore } from '../store/mapStore';

const OVERLAY_CSS =
  'position:absolute;background:rgba(59,130,246,0.2);border:2px solid rgba(59,130,246,0.8);pointer-events:none;z-index:5;';

const HIT_TOLERANCE = 8; // px

type Zone = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | 'inside' | 'none';

/**
 * Position an HTML overlay div to match geographic bounds on the map.
 * Called on every map move/zoom to keep the overlay aligned.
 */
function syncOverlay(map: MapLibreMap, el: HTMLDivElement, sw: { lng: number; lat: number }, ne: { lng: number; lat: number }) {
  const swPx = map.project([sw.lng, sw.lat]);
  const nePx = map.project([ne.lng, ne.lat]);
  const left = Math.min(swPx.x, nePx.x);
  const top = Math.min(swPx.y, nePx.y);
  const width = Math.abs(nePx.x - swPx.x);
  const height = Math.abs(nePx.y - swPx.y);
  el.style.left = left + 'px';
  el.style.top = top + 'px';
  el.style.width = width + 'px';
  el.style.height = height + 'px';
}

/**
 * Hit-test cursor position against the rectangle's pixel bounds.
 * Returns which zone the cursor is in.
 */
function hitTest(
  map: MapLibreMap,
  px: number,
  py: number,
  sw: { lng: number; lat: number },
  ne: { lng: number; lat: number },
): Zone {
  const swPx = map.project([sw.lng, sw.lat]);
  const nePx = map.project([ne.lng, ne.lat]);
  const left = Math.min(swPx.x, nePx.x);
  const right = Math.max(swPx.x, nePx.x);
  const top = Math.min(swPx.y, nePx.y);
  const bottom = Math.max(swPx.y, nePx.y);

  const nearLeft = Math.abs(px - left) <= HIT_TOLERANCE;
  const nearRight = Math.abs(px - right) <= HIT_TOLERANCE;
  const nearTop = Math.abs(py - top) <= HIT_TOLERANCE;
  const nearBottom = Math.abs(py - bottom) <= HIT_TOLERANCE;

  const inHorizRange = px >= left - HIT_TOLERANCE && px <= right + HIT_TOLERANCE;
  const inVertRange = py >= top - HIT_TOLERANCE && py <= bottom + HIT_TOLERANCE;

  // Corner checks (must be in range for both axes)
  if (nearTop && nearLeft && inHorizRange && inVertRange) return 'nw';
  if (nearTop && nearRight && inHorizRange && inVertRange) return 'ne';
  if (nearBottom && nearLeft && inHorizRange && inVertRange) return 'sw';
  if (nearBottom && nearRight && inHorizRange && inVertRange) return 'se';

  // Edge checks
  if (nearTop && inHorizRange) return 'n';
  if (nearBottom && inHorizRange) return 's';
  if (nearLeft && inVertRange) return 'w';
  if (nearRight && inVertRange) return 'e';

  // Inside check
  if (px > left && px < right && py > top && py < bottom) return 'inside';

  return 'none';
}

/** Map zone to CSS cursor value. */
function zoneToCursor(zone: Zone): string {
  switch (zone) {
    case 'nw': case 'se': return 'nwse-resize';
    case 'ne': case 'sw': return 'nesw-resize';
    case 'n': case 's': return 'ns-resize';
    case 'e': case 'w': return 'ew-resize';
    case 'inside': return 'move';
    default: return '';
  }
}

/**
 * Custom hook for bbox drawing on a MapLibre map.
 *
 * Drawing: Shift+drag draws a rectangle.
 * Resize: Drag edge/corner of existing rectangle.
 * Move: Drag inside existing rectangle.
 * Visualization: persistent HTML overlay div repositioned on map move/zoom.
 * Post-draw: Shift+drag again replaces the rectangle.
 *
 * @param map - A live MapLibre map instance (style must be loaded).
 */
export function useTerradraw(map: MapLibreMap | null): void {
  useEffect(() => {
    if (!map) return;

    // Disable MapLibre's box zoom (also Shift+drag)
    map.boxZoom.disable();

    const canvas = map.getCanvas();
    const container = map.getContainer();

    // Drawing state
    let drawing = false;
    let startX = 0;
    let startY = 0;
    let drawOverlay: HTMLDivElement | null = null;

    // Persistent rectangle state (HTML overlay that follows the map)
    let rectOverlay: HTMLDivElement | null = null;
    let rectSW: { lng: number; lat: number } | null = null;
    let rectNE: { lng: number; lat: number } | null = null;

    // Resize/move state
    let activeZone: Zone = 'none';
    let resizing = false;
    let moving = false;
    // Geo-offset from pointer to SW/NE corners when move starts
    let moveOffsetSW: { lng: number; lat: number } | null = null;
    let moveOffsetNE: { lng: number; lat: number } | null = null;

    /** Reposition the persistent rectangle overlay on map movement. */
    const onMapRender = () => {
      if (rectOverlay && rectSW && rectNE) {
        syncOverlay(map, rectOverlay, rectSW, rectNE);
      }
    };

    map.on('move', onMapRender);

    /** Update the store with current rect geo-coords. */
    const updateStore = () => {
      if (rectSW && rectNE) {
        useMapStore.getState().setBbox(
          { lon: rectSW.lng, lat: rectSW.lat },
          { lon: rectNE.lng, lat: rectNE.lat },
        );
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift' && !drawing && !resizing && !moving) canvas.style.cursor = 'crosshair';
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift' && !drawing && !resizing && !moving) canvas.style.cursor = '';
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!e.isPrimary || e.button !== 0) return;

      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      // Shift+drag = draw new rectangle
      if (e.shiftKey) {
        drawing = true;
        startX = px;
        startY = py;

        map.dragPan.disable();

        // Remove any previous persistent rectangle
        if (rectOverlay) { rectOverlay.remove(); rectOverlay = null; }

        // Create drawing overlay
        drawOverlay = document.createElement('div');
        drawOverlay.style.cssText = OVERLAY_CSS;
        container.appendChild(drawOverlay);

        canvas.setPointerCapture(e.pointerId);
        return;
      }

      // If there's an existing rect, check for resize/move interaction
      if (rectSW && rectNE) {
        const zone = hitTest(map, px, py, rectSW, rectNE);
        if (zone !== 'none') {
          e.preventDefault();
          activeZone = zone;
          map.dragPan.disable();
          canvas.setPointerCapture(e.pointerId);

          if (zone === 'inside') {
            moving = true;
            const geo = map.unproject([px, py]);
            moveOffsetSW = { lng: rectSW.lng - geo.lng, lat: rectSW.lat - geo.lat };
            moveOffsetNE = { lng: rectNE.lng - geo.lng, lat: rectNE.lat - geo.lat };
          } else {
            resizing = true;
          }
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

      // Drawing mode
      if (drawing && drawOverlay) {
        drawOverlay.style.left = Math.min(startX, px) + 'px';
        drawOverlay.style.top = Math.min(startY, py) + 'px';
        drawOverlay.style.width = Math.abs(px - startX) + 'px';
        drawOverlay.style.height = Math.abs(py - startY) + 'px';
        return;
      }

      // Resize mode
      if (resizing && rectSW && rectNE && rectOverlay) {
        const geo = map.unproject([px, py]);

        switch (activeZone) {
          case 'n':  rectNE.lat = geo.lat; break;
          case 's':  rectSW.lat = geo.lat; break;
          case 'e':  rectNE.lng = geo.lng; break;
          case 'w':  rectSW.lng = geo.lng; break;
          case 'ne': rectNE.lat = geo.lat; rectNE.lng = geo.lng; break;
          case 'nw': rectNE.lat = geo.lat; rectSW.lng = geo.lng; break;
          case 'se': rectSW.lat = geo.lat; rectNE.lng = geo.lng; break;
          case 'sw': rectSW.lat = geo.lat; rectSW.lng = geo.lng; break;
        }

        syncOverlay(map, rectOverlay, rectSW, rectNE);
        updateStore();
        return;
      }

      // Move mode
      if (moving && rectSW && rectNE && rectOverlay && moveOffsetSW && moveOffsetNE) {
        const geo = map.unproject([px, py]);
        rectSW.lng = geo.lng + moveOffsetSW.lng;
        rectSW.lat = geo.lat + moveOffsetSW.lat;
        rectNE.lng = geo.lng + moveOffsetNE.lng;
        rectNE.lat = geo.lat + moveOffsetNE.lat;

        syncOverlay(map, rectOverlay, rectSW, rectNE);
        updateStore();
        return;
      }

      // Idle: update cursor based on hit test
      if (rectSW && rectNE && !e.shiftKey) {
        const zone = hitTest(map, px, py, rectSW, rectNE);
        canvas.style.cursor = zoneToCursor(zone);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      // Finalize resize/move
      if (resizing || moving) {
        resizing = false;
        moving = false;
        activeZone = 'none';
        moveOffsetSW = null;
        moveOffsetNE = null;
        map.dragPan.enable();

        // Normalize: ensure SW is actually south-west and NE is actually north-east
        if (rectSW && rectNE) {
          const minLng = Math.min(rectSW.lng, rectNE.lng);
          const maxLng = Math.max(rectSW.lng, rectNE.lng);
          const minLat = Math.min(rectSW.lat, rectNE.lat);
          const maxLat = Math.max(rectSW.lat, rectNE.lat);
          rectSW = { lng: minLng, lat: minLat };
          rectNE = { lng: maxLng, lat: maxLat };
          updateStore();
          if (rectOverlay) syncOverlay(map, rectOverlay, rectSW, rectNE);
        }

        // Update cursor for current position
        const rect = canvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        if (rectSW && rectNE) {
          canvas.style.cursor = zoneToCursor(hitTest(map, px, py, rectSW, rectNE));
        }
        return;
      }

      // Finalize drawing
      if (!drawing) return;
      drawing = false;

      // Remove drawing overlay
      if (drawOverlay) { drawOverlay.remove(); drawOverlay = null; }

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

      // Create persistent rectangle overlay
      rectSW = sw;
      rectNE = ne;
      rectOverlay = document.createElement('div');
      rectOverlay.style.cssText = OVERLAY_CSS;
      container.appendChild(rectOverlay);
      syncOverlay(map, rectOverlay, sw, ne);

      // Update store
      updateStore();
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      map.off('move', onMapRender);
      if (rectOverlay) rectOverlay.remove();
      if (drawOverlay) drawOverlay.remove();
      map.boxZoom.enable();
    };
  }, [map]);
}
