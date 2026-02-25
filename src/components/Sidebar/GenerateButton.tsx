/**
 * Generate Preview button — fetches elevation data and builds terrain mesh,
 * then fetches building data from Overpass (non-blocking for the preview).
 *
 * States:
 *  - No bbox: disabled, "Select an area first"
 *  - Has bbox, idle: enabled, "Generate Preview"
 *  - Fetching/meshing: disabled, spinner + step text
 *  - Ready (showPreview): "Regenerate Preview"
 *  - Error: "Retry" with error message
 */

import { useMapStore } from '../../store/mapStore';
import { fetchElevationForBbox } from '../../lib/elevation/stitch';
import { fetchBuildingData } from '../../lib/buildings/overpass';
import { parseBuildingFeatures } from '../../lib/buildings/parse';
import { fetchRoadData } from '../../lib/roads/overpass';
import { parseRoadFeatures } from '../../lib/roads/parse';

export function GenerateButton() {
  const bbox = useMapStore((s) => s.bbox);
  const generationStatus = useMapStore((s) => s.generationStatus);
  const generationStep = useMapStore((s) => s.generationStep);
  const showPreview = useMapStore((s) => s.showPreview);
  const buildingGenerationStatus = useMapStore((s) => s.buildingGenerationStatus);
  const buildingGenerationStep = useMapStore((s) => s.buildingGenerationStep);
  const roadGenerationStatus = useMapStore((s) => s.roadGenerationStatus);
  const roadGenerationStep = useMapStore((s) => s.roadGenerationStep);
  const setGenerationStatus = useMapStore((s) => s.setGenerationStatus);
  const setElevationData = useMapStore((s) => s.setElevationData);
  const setShowPreview = useMapStore((s) => s.setShowPreview);
  const setBuildingFeatures = useMapStore((s) => s.setBuildingFeatures);
  const setBuildingGenerationStatus = useMapStore((s) => s.setBuildingGenerationStatus);
  const setRoadFeatures = useMapStore((s) => s.setRoadFeatures);
  const setRoadGenerationStatus = useMapStore((s) => s.setRoadGenerationStatus);

  const isLoading = generationStatus === 'fetching' || generationStatus === 'meshing';
  const hasBbox = bbox !== null;
  const hasError = generationStatus === 'error';
  const isBuildingFetching = buildingGenerationStatus === 'fetching' || buildingGenerationStatus === 'building';
  const isRoadFetching = roadGenerationStatus === 'fetching' || roadGenerationStatus === 'building';

  async function fetchBuildings() {
    if (!bbox) return;
    try {
      setBuildingGenerationStatus('fetching', 'Fetching building data...');
      const overpassData = await fetchBuildingData(bbox);
      const features = parseBuildingFeatures(overpassData);
      setBuildingFeatures(features);
      setBuildingGenerationStatus('ready', `${features.length} buildings found`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Building fetch failed';
      setBuildingGenerationStatus('error', message);
      // Buildings are optional — terrain preview is still usable
    }
  }

  async function fetchRoads() {
    if (!bbox) return;
    try {
      setRoadGenerationStatus('fetching', 'Fetching road data...');
      const overpassData = await fetchRoadData(bbox);
      const features = parseRoadFeatures(overpassData);
      setRoadFeatures(features);
      setRoadGenerationStatus('ready', `${features.length} roads found`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Road fetch failed';
      setRoadGenerationStatus('error', message);
      // Roads are optional — terrain preview is still usable
    }
  }

  async function handleGenerate() {
    if (!bbox) return;

    const apiKey = import.meta.env.VITE_MAPTILER_KEY as string;

    try {
      setGenerationStatus('fetching', 'Fetching elevation data...');

      const result = await fetchElevationForBbox(bbox.sw, bbox.ne, apiKey);

      setElevationData(result);
      setGenerationStatus('ready', 'Terrain ready');
      setShowPreview(true);

      // Fetch buildings first, then roads after buildings complete (non-blocking — terrain preview
      // is already visible). Staggered via .finally() to avoid Overpass rate limiting when both
      // requests fire simultaneously. .finally() ensures roads fetch even if buildings fail.
      void fetchBuildings().finally(() => void fetchRoads());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setGenerationStatus('error', message);
    }
  }

  // Determine button label
  let label: string;
  if (!hasBbox) {
    label = 'Select an area first';
  } else if (isLoading) {
    label = generationStep || 'Generating...';
  } else if (hasError) {
    label = 'Retry';
  } else if (showPreview) {
    label = 'Regenerate Preview';
  } else {
    label = 'Generate Preview';
  }

  // Determine button styles
  const isDisabled = !hasBbox || isLoading;

  let bgColor = '#2563eb'; // blue-600
  if (!hasBbox || isLoading) bgColor = '#2563eb';
  if (hasError) bgColor = '#7f1d1d'; // dark red for error state

  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={isDisabled}
        onClick={handleGenerate}
        className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white
                   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                   transition-colors duration-150"
        style={{
          backgroundColor: isDisabled ? '#1e3a8a' : bgColor,
          opacity: isDisabled ? 0.6 : 1,
          cursor: isDisabled ? 'not-allowed' : 'pointer',
        }}
      >
        {isLoading && (
          <span
            style={{
              display: 'inline-block',
              width: '12px',
              height: '12px',
              border: '2px solid rgba(255,255,255,0.3)',
              borderTopColor: '#fff',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              marginRight: '8px',
              verticalAlign: 'middle',
            }}
            aria-hidden="true"
          />
        )}
        {label}
      </button>

      {hasError && generationStep && (
        <p className="text-center text-xs text-red-400 mt-1" title={generationStep}>
          {generationStep.length > 60
            ? generationStep.slice(0, 57) + '...'
            : generationStep}
        </p>
      )}

      {!hasError && !hasBbox && (
        <p className="text-center text-xs text-gray-400 dark:text-gray-500">
          Draw a rectangle on the map
        </p>
      )}

      {/* Building fetch status — shown after terrain is ready */}
      {showPreview && !hasError && buildingGenerationStep && (
        <p className="text-center text-xs mt-1"
           style={{ color: buildingGenerationStatus === 'error' ? '#f87171' : '#9ca3af' }}>
          {isBuildingFetching && (
            <span
              style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                border: '1.5px solid rgba(156,163,175,0.3)',
                borderTopColor: '#9ca3af',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                marginRight: '4px',
                verticalAlign: 'middle',
              }}
              aria-hidden="true"
            />
          )}
          {buildingGenerationStep}
        </p>
      )}

      {/* Road fetch status — shown after terrain is ready */}
      {showPreview && !hasError && roadGenerationStep && (
        <p className="text-center text-xs mt-1"
           style={{ color: roadGenerationStatus === 'error' ? '#f87171' : '#9ca3af' }}>
          {isRoadFetching && (
            <span
              style={{
                display: 'inline-block',
                width: '8px',
                height: '8px',
                border: '1.5px solid rgba(156,163,175,0.3)',
                borderTopColor: '#9ca3af',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                marginRight: '4px',
                verticalAlign: 'middle',
              }}
              aria-hidden="true"
            />
          )}
          {roadGenerationStep}
        </p>
      )}
    </div>
  );
}
