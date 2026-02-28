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
import { fetchAllOsmData } from '../../lib/overpass';
import { parseBuildingFeatures } from '../../lib/buildings/parse';
import { parseRoadFeatures } from '../../lib/roads/parse';
import { parseWaterFeatures } from '../../lib/water/parse';
import { parseVegetationFeatures } from '../../lib/vegetation/parse';
import type { BoundingBox } from '../../types/geo';

/**
 * Reverse geocode a coordinate to get a place name via MapTiler API.
 * Returns null on any failure — coordinate-based filename used as fallback.
 */
async function reverseGeocode(lon: number, lat: number, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.maptiler.com/geocoding/${lon.toFixed(6)},${lat.toFixed(6)}.json?key=${apiKey}`
    );
    if (!res.ok) return null;
    const data = await res.json() as { features?: Array<{ text?: string; place_name?: string }> };
    const feature = data.features?.[0];
    return feature?.text ?? feature?.place_name ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch all OSM layers (buildings, roads, water, vegetation) in a single Overpass request,
 * then parse each layer from the combined response. One request eliminates 429
 * rate limiting that occurred with three sequential requests.
 */
async function fetchOsmLayersStandalone(bbox: BoundingBox, s: ReturnType<typeof useMapStore.getState>) {
  s.setBuildingGenerationStatus('fetching', 'Fetching OSM data...');
  s.setRoadGenerationStatus('fetching', 'Fetching OSM data...');
  s.setWaterGenerationStatus('fetching', 'Fetching OSM data...');
  s.setVegetationGenerationStatus('fetching', 'Fetching OSM data...');

  try {
    const osmData = await fetchAllOsmData(bbox);

    // Parse each layer from the combined response — parsers filter by tag
    const buildings = parseBuildingFeatures(osmData);
    s.setBuildingFeatures(buildings);
    s.setBuildingGenerationStatus('ready', `${buildings.length} buildings found`);

    const roads = parseRoadFeatures(osmData);
    s.setRoadFeatures(roads);
    s.setRoadGenerationStatus('ready', `${roads.length} roads found`);

    const water = parseWaterFeatures(osmData);
    s.setWaterFeatures(water);
    s.setWaterGenerationStatus('ready', `${water.length} water bodies found`);

    const vegetation = parseVegetationFeatures(osmData);
    s.setVegetationFeatures(vegetation);
    s.setVegetationGenerationStatus('ready', `${vegetation.length} vegetation areas found`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OSM fetch failed';
    s.setBuildingGenerationStatus('error', message);
    s.setRoadGenerationStatus('error', message);
    s.setWaterGenerationStatus('error', message);
    s.setVegetationGenerationStatus('error', message);
  }
}

/**
 * Exported standalone generate function — usable outside the component (e.g. stale indicator).
 * Uses Zustand's getState() to read current state without being in a React component.
 */
export async function triggerRegenerate() {
  const s = useMapStore.getState();
  const bbox = s.bbox;
  if (!bbox) return;

  const apiKey = import.meta.env.VITE_MAPTILER_KEY as string;

  try {
    s.setGenerationStatus('fetching', 'Fetching elevation data...');

    const result = await fetchElevationForBbox(bbox.sw, bbox.ne, apiKey);

    s.setElevationData(result);
    s.setGenerationStatus('ready', 'Terrain ready');
    s.setShowPreview(true);

    // Snapshot bbox key for stale detection
    const bboxKey = `${bbox.sw.lat.toFixed(5)},${bbox.sw.lon.toFixed(5)},${bbox.ne.lat.toFixed(5)},${bbox.ne.lon.toFixed(5)}`;
    s.setGeneratedBboxKey(bboxKey);

    // Reverse geocode if no location name set (user drew bbox without searching)
    const currentLocationName = useMapStore.getState().locationName;
    if (!currentLocationName) {
      const centerLon = (bbox.sw.lon + bbox.ne.lon) / 2;
      const centerLat = (bbox.sw.lat + bbox.ne.lat) / 2;
      const name = await reverseGeocode(centerLon, centerLat, apiKey);
      if (name) s.setLocationName(name);
    }

    // Single Overpass request for all OSM layers — no rate limiting
    void fetchOsmLayersStandalone(bbox, useMapStore.getState());
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    s.setGenerationStatus('error', message);
  }
}

export function GenerateButton() {
  const bbox = useMapStore((s) => s.bbox);
  const generationStatus = useMapStore((s) => s.generationStatus);
  const generationStep = useMapStore((s) => s.generationStep);
  const showPreview = useMapStore((s) => s.showPreview);
  const buildingGenerationStatus = useMapStore((s) => s.buildingGenerationStatus);
  const buildingGenerationStep = useMapStore((s) => s.buildingGenerationStep);
  const roadGenerationStatus = useMapStore((s) => s.roadGenerationStatus);
  const roadGenerationStep = useMapStore((s) => s.roadGenerationStep);
  const waterGenerationStatus = useMapStore((s) => s.waterGenerationStatus);
  const waterGenerationStep = useMapStore((s) => s.waterGenerationStep);
  const vegetationGenerationStatus = useMapStore((s) => s.vegetationGenerationStatus);
  const vegetationGenerationStep = useMapStore((s) => s.vegetationGenerationStep);

  const isLoading = generationStatus === 'fetching' || generationStatus === 'meshing';
  const hasBbox = bbox !== null;
  const hasError = generationStatus === 'error';
  const isBuildingFetching = buildingGenerationStatus === 'fetching' || buildingGenerationStatus === 'building';
  const isRoadFetching = roadGenerationStatus === 'fetching' || roadGenerationStatus === 'building';
  const isWaterFetching = waterGenerationStatus === 'fetching';
  const isVegetationFetching = vegetationGenerationStatus === 'fetching';
  const isOsmFetching = isBuildingFetching || isRoadFetching || isWaterFetching || isVegetationFetching;

  async function handleGenerate() {
    await triggerRegenerate();
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

      {/* OSM layer fetch status — single combined request */}
      {showPreview && !hasError && isOsmFetching && (
        <p className="text-center text-xs mt-1" style={{ color: '#9ca3af' }}>
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
          Fetching OSM data...
        </p>
      )}
      {showPreview && !hasError && !isOsmFetching && buildingGenerationStep && (
        <p className="text-center text-xs mt-1"
           style={{ color: buildingGenerationStatus === 'error' ? '#f87171' : '#9ca3af' }}>
          {buildingGenerationStep}
        </p>
      )}
      {showPreview && !hasError && !isOsmFetching && roadGenerationStep && (
        <p className="text-center text-xs mt-1"
           style={{ color: roadGenerationStatus === 'error' ? '#f87171' : '#9ca3af' }}>
          {roadGenerationStep}
        </p>
      )}
      {showPreview && !hasError && !isOsmFetching && waterGenerationStep && (
        <p className="text-center text-xs mt-1"
           style={{ color: waterGenerationStatus === 'error' ? '#f87171' : '#9ca3af' }}>
          {waterGenerationStep}
        </p>
      )}
      {showPreview && !hasError && !isOsmFetching && vegetationGenerationStep && (
        <p className="text-center text-xs mt-1"
           style={{ color: vegetationGenerationStatus === 'error' ? '#f87171' : '#9ca3af' }}>
          {vegetationGenerationStep}
        </p>
      )}
    </div>
  );
}
