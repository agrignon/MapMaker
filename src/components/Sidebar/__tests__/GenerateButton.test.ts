/**
 * Integration tests for GenerateButton — parallel Overture + OSM fetching.
 *
 * Tests INTEG-01, INTEG-02, INTEG-03 via the public triggerRegenerate API.
 *
 * Strategy: Test through triggerRegenerate() (public export).
 *   - Mock elevation fetch so the elevation path resolves immediately.
 *   - Mock all OSM + Overture dependencies to control data flow.
 *   - Assert store state and mock call arguments after each run.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { BuildingFeature } from '../../../lib/buildings/types';

// ---- Module mocks (hoisted by Vitest) ----

vi.mock('../../../lib/overpass', () => ({
  fetchAllOsmData: vi.fn(),
}));

vi.mock('../../../lib/overture/index', () => ({
  fetchOvertureTiles: vi.fn(),
}));

vi.mock('../../../lib/overture/parse', () => ({
  parseOvertureTiles: vi.fn(),
}));

vi.mock('../../../lib/overture/dedup', () => ({
  deduplicateOverture: vi.fn(),
}));

vi.mock('../../../lib/buildings/parse', () => ({
  parseBuildingFeatures: vi.fn(),
}));

vi.mock('../../../lib/roads/parse', () => ({
  parseRoadFeatures: vi.fn(),
}));

vi.mock('../../../lib/water/parse', () => ({
  parseWaterFeatures: vi.fn(),
}));

vi.mock('../../../lib/vegetation/parse', () => ({
  parseVegetationFeatures: vi.fn(),
}));

vi.mock('../../../lib/elevation/stitch', () => ({
  fetchElevationForBbox: vi.fn(),
}));

// ---- Import after mocks ----

import { triggerRegenerate } from '../GenerateButton';
import { useMapStore } from '../../../store/mapStore';
import { fetchAllOsmData } from '../../../lib/overpass';
import { fetchOvertureTiles } from '../../../lib/overture/index';
import { parseOvertureTiles } from '../../../lib/overture/parse';
import { deduplicateOverture } from '../../../lib/overture/dedup';
import { parseBuildingFeatures } from '../../../lib/buildings/parse';
import { parseRoadFeatures } from '../../../lib/roads/parse';
import { parseWaterFeatures } from '../../../lib/water/parse';
import { parseVegetationFeatures } from '../../../lib/vegetation/parse';
import { fetchElevationForBbox } from '../../../lib/elevation/stitch';

// ---- Typed mock references ----

const mockFetchAllOsmData = vi.mocked(fetchAllOsmData);
const mockFetchOvertureTiles = vi.mocked(fetchOvertureTiles);
const mockParseOvertureTiles = vi.mocked(parseOvertureTiles);
const mockDeduplicateOverture = vi.mocked(deduplicateOverture);
const mockParseBuildingFeatures = vi.mocked(parseBuildingFeatures);
const mockParseRoadFeatures = vi.mocked(parseRoadFeatures);
const mockParseWaterFeatures = vi.mocked(parseWaterFeatures);
const mockParseVegetationFeatures = vi.mocked(parseVegetationFeatures);
const mockFetchElevationForBbox = vi.mocked(fetchElevationForBbox);

// ---- Synthetic test data ----

const osmBuilding1: BuildingFeature = {
  properties: { building: 'yes' },
  outerRing: [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]],
  holes: [],
};

const osmBuilding2: BuildingFeature = {
  properties: { building: 'residential' },
  outerRing: [[2, 2], [3, 2], [3, 3], [2, 3], [2, 2]],
  holes: [],
};

const gapFillBuilding: BuildingFeature = {
  properties: { building: 'yes' },
  outerRing: [[10, 10], [11, 10], [11, 11], [10, 11], [10, 10]],
  holes: [],
};

const overtureRawBuilding: BuildingFeature = {
  properties: { building: 'yes' },
  outerRing: [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]],
  holes: [],
};

/** Synthetic OSM data object — parsers receive this but are mocked anyway. */
const FAKE_OSM_DATA = { type: 'FeatureCollection', features: [] };

/** Synthetic elevation result. */
const FAKE_ELEVATION = {
  grid: new Float32Array(0),
  width: 1,
  height: 1,
  bounds: { sw: { lat: 51.5, lon: -0.1 }, ne: { lat: 51.51, lon: -0.09 } },
};

// ---- Test bbox ----

const TEST_BBOX_SW = { lat: 51.5, lon: -0.1 };
const TEST_BBOX_NE = { lat: 51.51, lon: -0.09 };

// ---- Setup / teardown ----

beforeEach(() => {
  // Reset store to known state
  useMapStore.setState({
    bbox: null,
    dimensions: null,
    showPreview: false,
    generationStatus: 'idle',
    buildingFeatures: null,
    buildingGenerationStatus: 'idle',
    buildingGenerationStep: '',
    overtureAvailable: false,
  });

  // Set a valid bbox (also computes dimensions)
  useMapStore.getState().setBbox(TEST_BBOX_SW, TEST_BBOX_NE);

  // Default mock implementations
  mockFetchElevationForBbox.mockResolvedValue(FAKE_ELEVATION as ReturnType<typeof useMapStore.getState>['elevationData'] extends infer T ? T : never);
  mockFetchAllOsmData.mockResolvedValue(FAKE_OSM_DATA);
  mockFetchOvertureTiles.mockResolvedValue({ tiles: new Map(), available: true });
  mockParseOvertureTiles.mockReturnValue([]);
  mockDeduplicateOverture.mockReturnValue([]);
  mockParseBuildingFeatures.mockReturnValue([osmBuilding1, osmBuilding2]);
  mockParseRoadFeatures.mockReturnValue([]);
  mockParseWaterFeatures.mockReturnValue([]);
  mockParseVegetationFeatures.mockReturnValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---- Tests ----

describe('GenerateButton — parallel Overture integration', () => {

  // Test 1 — INTEG-01: Both fetchAllOsmData and fetchOvertureTiles are called
  it('INTEG-01: calls both fetchAllOsmData and fetchOvertureTiles when generating', async () => {
    await triggerRegenerate();

    expect(mockFetchAllOsmData).toHaveBeenCalledTimes(1);
    expect(mockFetchOvertureTiles).toHaveBeenCalledTimes(1);
  });

  // Test 2 — INTEG-02 happy path: merged OSM + gap-fill list stored
  it('INTEG-02 (happy path): setBuildingFeatures receives merged OSM + gap-fill list', async () => {
    // Overture returns a tile with buildings
    const fakeTiles = new Map([['14/8192/5461', new ArrayBuffer(8)]]);
    mockFetchOvertureTiles.mockResolvedValue({ tiles: fakeTiles, available: true });
    mockParseOvertureTiles.mockReturnValue([overtureRawBuilding]);
    mockDeduplicateOverture.mockReturnValue([gapFillBuilding]);
    mockParseBuildingFeatures.mockReturnValue([osmBuilding1, osmBuilding2]);

    await triggerRegenerate();

    const state = useMapStore.getState();
    expect(state.buildingFeatures).toEqual([osmBuilding1, osmBuilding2, gapFillBuilding]);
  });

  // Test 3 — INTEG-02 fallback: Overture fails → OSM-only buildings set, no error
  it('INTEG-02 (fallback): when Overture unavailable, setBuildingFeatures receives OSM-only list', async () => {
    mockFetchOvertureTiles.mockResolvedValue({ tiles: new Map(), available: false });
    mockParseBuildingFeatures.mockReturnValue([osmBuilding1, osmBuilding2]);

    await triggerRegenerate();

    const state = useMapStore.getState();
    expect(state.buildingFeatures).toEqual([osmBuilding1, osmBuilding2]);
    // Building generation should be ready (not error)
    expect(state.buildingGenerationStatus).toBe('ready');
  });

  // Test 4 — INTEG-02 empty tiles: Overture available but empty Map → OSM-only
  it('INTEG-02 (empty tiles): when Overture returns empty tile map, sets OSM-only buildings', async () => {
    mockFetchOvertureTiles.mockResolvedValue({ tiles: new Map(), available: true });
    mockParseBuildingFeatures.mockReturnValue([osmBuilding1]);

    await triggerRegenerate();

    const state = useMapStore.getState();
    expect(state.buildingFeatures).toEqual([osmBuilding1]);
  });

  // Test 5 — INTEG-02: setOvertureAvailable(true) when Overture returns available
  it('INTEG-02: setOvertureAvailable(true) called when Overture is available', async () => {
    mockFetchOvertureTiles.mockResolvedValue({ tiles: new Map(), available: true });

    await triggerRegenerate();

    expect(useMapStore.getState().overtureAvailable).toBe(true);
  });

  // Test 6 — INTEG-02: setOvertureAvailable(false) when Overture unavailable
  it('INTEG-02: setOvertureAvailable(false) called when Overture is not available', async () => {
    mockFetchOvertureTiles.mockResolvedValue({ tiles: new Map(), available: false });

    await triggerRegenerate();

    expect(useMapStore.getState().overtureAvailable).toBe(false);
  });

  // Test 7 — status text: Building status shows 'Fetching buildings...' not 'Fetching OSM data...'
  it('status text: building status shows "Fetching buildings..." during fetch', async () => {
    const statusCalls: Array<{ status: string; step: string }> = [];

    // Intercept setBuildingGenerationStatus calls via store subscription
    const originalSet = useMapStore.getState().setBuildingGenerationStatus;
    vi.spyOn(useMapStore.getState(), 'setBuildingGenerationStatus').mockImplementation(
      (status, step = '') => {
        statusCalls.push({ status, step });
        originalSet(status, step);
      }
    );

    // Delay OSM resolve to capture the "during fetch" status
    mockFetchAllOsmData.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(FAKE_OSM_DATA), 10))
    );

    await triggerRegenerate();

    // First call should show 'Fetching buildings...' (not 'Fetching OSM data...')
    expect(statusCalls.length).toBeGreaterThan(0);
    const firstStep = statusCalls[0]?.step;
    expect(firstStep).toBe('Fetching buildings...');
    expect(firstStep).not.toBe('Fetching OSM data...');
  });

  // Test 8 — OSM error: when OSM fetch fails, all layer statuses set to error
  it('OSM error: when fetchAllOsmData rejects, all layer statuses are set to error', async () => {
    mockFetchAllOsmData.mockRejectedValue(new Error('Network error'));

    await triggerRegenerate();

    const state = useMapStore.getState();
    expect(state.buildingGenerationStatus).toBe('error');
    expect(state.roadGenerationStatus).toBe('error');
    expect(state.waterGenerationStatus).toBe('error');
    expect(state.vegetationGenerationStatus).toBe('error');
  });

  // Test 9 — INTEG-03: setBuildingFeatures receives merged list (same slot used by ExportPanel)
  it('INTEG-03: merged building list is stored in buildingFeatures (same slot ExportPanel reads)', async () => {
    const fakeTiles = new Map([['14/8192/5461', new ArrayBuffer(8)]]);
    mockFetchOvertureTiles.mockResolvedValue({ tiles: fakeTiles, available: true });
    mockParseOvertureTiles.mockReturnValue([overtureRawBuilding]);
    mockDeduplicateOverture.mockReturnValue([gapFillBuilding]);
    mockParseBuildingFeatures.mockReturnValue([osmBuilding1]);

    await triggerRegenerate();

    // ExportPanel reads useMapStore.getState().buildingFeatures — verify it has merged list
    const state = useMapStore.getState();
    expect(state.buildingFeatures).toContain(osmBuilding1);
    expect(state.buildingFeatures).toContain(gapFillBuilding);
    expect(state.buildingFeatures?.length).toBe(2);
  });

});
