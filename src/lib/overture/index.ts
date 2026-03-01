import type { BoundingBox } from '../../types/geo';
import { fetchTilesFromArchive } from './tiles';
import { OVERTURE_FETCH_TIMEOUT_MS } from './constants';

export interface OvertureResult {
  /** Raw tile data keyed by "z/x/y" */
  tiles: Map<string, ArrayBuffer>;
  /**
   * True if Overture was reachable (even if the area had no buildings — empty is valid data).
   * False if any network/timeout/abort error occurred — caller should fall back to OSM-only.
   */
  available: boolean;
}

/**
 * Fetch Overture Maps building tiles for a bounding box.
 *
 * Features:
 * - 5-second timeout for all tile requests combined (AbortController via setTimeout)
 * - Caller-provided AbortSignal propagation (e.g. for bbox-change cancellation)
 * - Silent fallback: any error returns { tiles: empty Map, available: false } — never throws
 * - Empty area (no buildings): returns { tiles: empty Map, available: true } — valid data, not failure
 *
 * @param bbox - The geographic bounding box to fetch tiles for
 * @param callerSignal - Optional AbortSignal from caller for cancellation (e.g. new bbox selected)
 */
export async function fetchOvertureTiles(
  bbox: BoundingBox,
  callerSignal?: AbortSignal
): Promise<OvertureResult> {
  const controller = new AbortController();

  // 5-second wall-clock timeout for all tile requests combined
  const timeoutId = setTimeout(
    () => controller.abort(new Error('Overture fetch timeout after 5 seconds')),
    OVERTURE_FETCH_TIMEOUT_MS
  );

  // If caller cancels (e.g. user changed bbox), propagate to our internal controller
  if (callerSignal) {
    callerSignal.addEventListener('abort', () => controller.abort(callerSignal.reason));
    // If already aborted, abort immediately
    if (callerSignal.aborted) {
      controller.abort(callerSignal.reason);
    }
  }

  try {
    const tiles = await fetchTilesFromArchive(bbox, controller.signal);
    // Empty result (no buildings in area) is valid data — available: true
    return { tiles, available: true };
  } catch (err) {
    console.warn('[Overture] fetch failed, falling back to OSM-only:', err);
    return { tiles: new Map(), available: false };
  } finally {
    clearTimeout(timeoutId);
  }
}
