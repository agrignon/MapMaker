import { useMapStore } from '../../store/mapStore';

/** Threshold in meters below which dimensions display in meters rather than km. */
const KM_THRESHOLD = 1000;

function formatDimension(meters: number): string {
  if (meters < KM_THRESHOLD) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatCoord(value: number, decimalPlaces = 4): string {
  return value.toFixed(decimalPlaces);
}

/**
 * Displays real-world bbox dimensions, corner coordinates, UTM zone,
 * and an optional large-area warning.
 *
 * Shows nothing (null) when no bbox is selected.
 */
export function SelectionInfo() {
  const bbox = useMapStore((s) => s.bbox);
  const dimensions = useMapStore((s) => s.dimensions);
  const utmZone = useMapStore((s) => s.utmZone);

  if (!bbox || !dimensions) {
    return null;
  }

  const { sw, ne } = bbox;
  const { widthM, heightM } = dimensions;

  const widthLabel = formatDimension(widthM);
  const heightLabel = formatDimension(heightM);

  const showLargeAreaWarning = widthM > 5000 || heightM > 5000;

  // Hemisphere for UTM zone display (N if north of equator, S otherwise)
  const centroidLat = (sw.lat + ne.lat) / 2;
  const hemisphere = centroidLat >= 0 ? 'N' : 'S';

  return (
    <div className="space-y-3 text-sm">
      {/* Dimensions */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
          Dimensions
        </p>
        <p className="text-base font-medium text-gray-900 dark:text-gray-100">
          {widthLabel} &times; {heightLabel}
        </p>
      </div>

      {/* Coordinates */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
          Coordinates
        </p>
        <p className="text-gray-800 dark:text-gray-200">
          <span className="font-medium">SW:</span>{' '}
          {formatCoord(sw.lat)}, {formatCoord(sw.lon)}
        </p>
        <p className="text-gray-800 dark:text-gray-200">
          <span className="font-medium">NE:</span>{' '}
          {formatCoord(ne.lat)}, {formatCoord(ne.lon)}
        </p>
      </div>

      {/* UTM Zone */}
      {utmZone !== null && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
            Projection
          </p>
          <p className="text-gray-800 dark:text-gray-200">
            UTM Zone {utmZone}{hemisphere}
          </p>
        </div>
      )}

      {/* Large area warning */}
      {showLargeAreaWarning && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/30 p-3">
          <p className="text-amber-800 dark:text-amber-300 text-xs leading-snug">
            Large area selected — processing may take longer.
          </p>
        </div>
      )}
    </div>
  );
}
