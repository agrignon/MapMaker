import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useMapStore } from '../../../store/mapStore';

// Mock pmtiles module to control getZxy return values
vi.mock('pmtiles', () => {
  const mockGetZxy = vi.fn();
  const MockPMTiles = vi.fn(() => ({
    getZxy: mockGetZxy,
  }));
  return { PMTiles: MockPMTiles, mockGetZxy };
});

// Mock @mapbox/tile-cover to return deterministic tile lists
vi.mock('@mapbox/tile-cover', () => ({
  default: {
    tiles: vi.fn(),
  },
}));

import * as pmtilesModule from 'pmtiles';
import cover from '@mapbox/tile-cover';
import { bboxToTileKeys, fetchTilesFromArchive } from '../tiles';
import { fetchOvertureTiles } from '../index';
import {
  OVERTURE_BUILDINGS_PMTILES_URL,
  OVERTURE_BUILDING_LAYER,
  OVERTURE_FETCH_ZOOM,
  OVERTURE_FETCH_TIMEOUT_MS,
  OVERTURE_STAC_CATALOG_URL,
} from '../constants';
import type { BoundingBox } from '../../../types/geo';

// Access the mock getZxy from the mocked pmtiles module
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGetZxy = (pmtilesModule as any).mockGetZxy as ReturnType<typeof vi.fn>;

const NYC_BBOX: BoundingBox = {
  sw: { lon: -74.01, lat: 40.70 },
  ne: { lon: -73.97, lat: 40.75 },
};

const SINGLE_POINT_BBOX: BoundingBox = {
  sw: { lon: -74.00, lat: 40.71 },
  ne: { lon: -74.00, lat: 40.71 },
};

describe('constants', () => {
  it('OVERTURE_BUILDINGS_PMTILES_URL contains tiles.overturemaps.org and 2026-02-18.0', () => {
    expect(OVERTURE_BUILDINGS_PMTILES_URL).toContain('tiles.overturemaps.org');
    expect(OVERTURE_BUILDINGS_PMTILES_URL).toContain('2026-02-18.0');
  });

  it('OVERTURE_BUILDING_LAYER is "building" (singular, not "buildings")', () => {
    expect(OVERTURE_BUILDING_LAYER).toBe('building');
  });

  it('OVERTURE_FETCH_ZOOM is 14', () => {
    expect(OVERTURE_FETCH_ZOOM).toBe(14);
  });

  it('OVERTURE_FETCH_TIMEOUT_MS is 5000', () => {
    expect(OVERTURE_FETCH_TIMEOUT_MS).toBe(5000);
  });

  it('OVERTURE_STAC_CATALOG_URL contains stac.overturemaps.org', () => {
    expect(OVERTURE_STAC_CATALOG_URL).toContain('stac.overturemaps.org');
  });
});

describe('bboxToTileKeys', () => {
  beforeEach(() => {
    vi.mocked(cover.tiles).mockReset();
  });

  it('returns an array of [x, y, z] tuples at zoom 14', () => {
    vi.mocked(cover.tiles).mockReturnValue([
      [4823, 6183, 14],
      [4824, 6183, 14],
      [4823, 6184, 14],
    ]);

    const result = bboxToTileKeys(NYC_BBOX);

    expect(result).toBeInstanceOf(Array);
    expect(result.length).toBe(3);
    result.forEach(([x, y, z]) => {
      expect(typeof x).toBe('number');
      expect(typeof y).toBe('number');
      expect(z).toBe(14);
    });
  });

  it('all returned tuples have z === 14', () => {
    vi.mocked(cover.tiles).mockReturnValue([
      [4823, 6183, 14],
      [4824, 6183, 14],
    ]);

    const result = bboxToTileKeys(NYC_BBOX);
    result.forEach(([, , z]) => {
      expect(z).toBe(14);
    });
  });

  it('a tiny bbox (single point) returns at least 1 tile', () => {
    vi.mocked(cover.tiles).mockReturnValue([[4823, 6183, 14]]);

    const result = bboxToTileKeys(SINGLE_POINT_BBOX);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('a bbox spanning multiple tiles returns multiple tiles', () => {
    vi.mocked(cover.tiles).mockReturnValue([
      [4823, 6183, 14],
      [4824, 6183, 14],
      [4823, 6184, 14],
      [4824, 6184, 14],
    ]);

    const result = bboxToTileKeys(NYC_BBOX);
    expect(result.length).toBeGreaterThan(1);
  });

  it('calls tile-cover with min_zoom and max_zoom both set to OVERTURE_FETCH_ZOOM', () => {
    vi.mocked(cover.tiles).mockReturnValue([[4823, 6183, 14]]);

    bboxToTileKeys(NYC_BBOX);

    expect(cover.tiles).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'Polygon' }),
      { min_zoom: OVERTURE_FETCH_ZOOM, max_zoom: OVERTURE_FETCH_ZOOM }
    );
  });

  it('converts BoundingBox to a GeoJSON Polygon ring [w,s],[e,s],[e,n],[w,n],[w,s]', () => {
    vi.mocked(cover.tiles).mockReturnValue([[4823, 6183, 14]]);

    bboxToTileKeys(NYC_BBOX);

    const callArg = vi.mocked(cover.tiles).mock.calls[0][0];
    expect(callArg.type).toBe('Polygon');
    // ring should have 5 points (closed)
    expect(callArg.coordinates[0]).toHaveLength(5);
    // first point is [west, south]
    expect(callArg.coordinates[0][0]).toEqual([-74.01, 40.70]);
    // last point closes ring (same as first)
    expect(callArg.coordinates[0][4]).toEqual([-74.01, 40.70]);
  });
});

describe('fetchTilesFromArchive', () => {
  beforeEach(() => {
    vi.mocked(cover.tiles).mockReset();
    mockGetZxy.mockReset();
  });

  it('returns a Map keyed by "z/x/y" for each non-undefined tile response', async () => {
    vi.mocked(cover.tiles).mockReturnValue([
      [4823, 6183, 14],
      [4824, 6183, 14],
    ]);

    const mockBuffer1 = new ArrayBuffer(100);
    const mockBuffer2 = new ArrayBuffer(200);
    mockGetZxy
      .mockResolvedValueOnce({ data: mockBuffer1 })
      .mockResolvedValueOnce({ data: mockBuffer2 });

    const signal = new AbortController().signal;
    const result = await fetchTilesFromArchive(NYC_BBOX, signal);

    expect(result).toBeInstanceOf(Map);
    expect(result.has('14/4823/6183')).toBe(true);
    expect(result.has('14/4824/6183')).toBe(true);
    expect(result.get('14/4823/6183')).toBe(mockBuffer1);
    expect(result.get('14/4824/6183')).toBe(mockBuffer2);
  });

  it('skips undefined responses (empty tiles) without error', async () => {
    vi.mocked(cover.tiles).mockReturnValue([
      [4823, 6183, 14],
      [4824, 6183, 14],
    ]);

    const mockBuffer = new ArrayBuffer(100);
    mockGetZxy
      .mockResolvedValueOnce({ data: mockBuffer })
      .mockResolvedValueOnce(undefined);

    const signal = new AbortController().signal;
    const result = await fetchTilesFromArchive(NYC_BBOX, signal);

    expect(result.size).toBe(1);
    expect(result.has('14/4823/6183')).toBe(true);
    expect(result.has('14/4824/6183')).toBe(false);
  });

  it('calls getZxy with (z, x, y) — z first, matching PMTiles API signature', async () => {
    vi.mocked(cover.tiles).mockReturnValue([[4823, 6183, 14]]);
    const mockBuffer = new ArrayBuffer(50);
    mockGetZxy.mockResolvedValueOnce({ data: mockBuffer });

    const signal = new AbortController().signal;
    await fetchTilesFromArchive(NYC_BBOX, signal);

    // PMTiles getZxy takes (z, x, y) — NOT (x, y, z) like tile-cover returns
    expect(mockGetZxy).toHaveBeenCalledWith(14, 4823, 6183, signal);
  });

  it('propagates errors to caller when getZxy throws', async () => {
    vi.mocked(cover.tiles).mockReturnValue([[4823, 6183, 14]]);
    mockGetZxy.mockRejectedValueOnce(new Error('network error'));

    const signal = new AbortController().signal;
    await expect(fetchTilesFromArchive(NYC_BBOX, signal)).rejects.toThrow('network error');
  });
});

describe('fetchOvertureTiles', () => {
  beforeEach(() => {
    vi.mocked(cover.tiles).mockReset();
    mockGetZxy.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns { tiles: Map with at least 1 entry, available: true } on success', async () => {
    vi.mocked(cover.tiles).mockReturnValue([[4823, 6183, 14]]);
    const mockBuffer = new ArrayBuffer(100);
    mockGetZxy.mockResolvedValueOnce({ data: mockBuffer });

    const result = await fetchOvertureTiles(NYC_BBOX);

    expect(result.available).toBe(true);
    expect(result.tiles).toBeInstanceOf(Map);
    expect(result.tiles.size).toBeGreaterThanOrEqual(1);
  });

  it('returns { tiles: empty Map, available: true } when all getZxy calls return undefined (empty area)', async () => {
    vi.mocked(cover.tiles).mockReturnValue([[4823, 6183, 14]]);
    mockGetZxy.mockResolvedValueOnce(undefined);

    const result = await fetchOvertureTiles(NYC_BBOX);

    expect(result.available).toBe(true);
    expect(result.tiles.size).toBe(0);
    // Must NOT call console.warn for empty tiles — empty is valid data
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('returns { tiles: empty Map, available: false } on network error (does NOT throw)', async () => {
    vi.mocked(cover.tiles).mockReturnValue([[4823, 6183, 14]]);
    mockGetZxy.mockRejectedValueOnce(new Error('fetch failed'));

    const result = await fetchOvertureTiles(NYC_BBOX);

    expect(result.available).toBe(false);
    expect(result.tiles).toBeInstanceOf(Map);
    expect(result.tiles.size).toBe(0);
  });

  it('calls console.warn on network error with descriptive message', async () => {
    vi.mocked(cover.tiles).mockReturnValue([[4823, 6183, 14]]);
    mockGetZxy.mockRejectedValueOnce(new Error('connection refused'));

    await fetchOvertureTiles(NYC_BBOX);

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('[Overture]'),
      expect.any(Error)
    );
  });

  it('returns { tiles: empty Map, available: false } on AbortError (does NOT throw)', async () => {
    vi.mocked(cover.tiles).mockReturnValue([[4823, 6183, 14]]);
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    mockGetZxy.mockRejectedValueOnce(abortError);

    const result = await fetchOvertureTiles(NYC_BBOX);

    expect(result.available).toBe(false);
    expect(result.tiles.size).toBe(0);
  });

  it('calls console.warn on AbortError with descriptive message', async () => {
    vi.mocked(cover.tiles).mockReturnValue([[4823, 6183, 14]]);
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    mockGetZxy.mockRejectedValueOnce(abortError);

    await fetchOvertureTiles(NYC_BBOX);

    // DOMException is not a subclass of Error in some environments — use toBeTruthy() check
    const calls = vi.mocked(console.warn).mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0][0]).toContain('[Overture]');
    expect(calls[0][1]).toBe(abortError);
  });

  it('returns { tiles: empty Map, available: false } when caller abort signal fires (does NOT throw)', async () => {
    vi.mocked(cover.tiles).mockReturnValue([[4823, 6183, 14]]);
    const callerController = new AbortController();
    const abortError = new DOMException('Caller aborted', 'AbortError');
    mockGetZxy.mockRejectedValueOnce(abortError);

    // Abort before/during fetch
    callerController.abort();
    const result = await fetchOvertureTiles(NYC_BBOX, callerController.signal);

    expect(result.available).toBe(false);
    expect(result.tiles.size).toBe(0);
  });

  it('never throws — always returns OvertureResult', async () => {
    vi.mocked(cover.tiles).mockReturnValue([[4823, 6183, 14]]);
    mockGetZxy.mockRejectedValueOnce(new TypeError('unexpected type error'));

    await expect(fetchOvertureTiles(NYC_BBOX)).resolves.toHaveProperty('available');
  });
});

describe('mapStore overtureAvailable', () => {
  beforeEach(() => {
    useMapStore.setState({ overtureAvailable: false });
  });

  it('defaults to false', () => {
    const state = useMapStore.getState();
    expect(state.overtureAvailable).toBe(false);
  });

  it('setOvertureAvailable(true) sets flag to true', () => {
    const { setOvertureAvailable } = useMapStore.getState();
    setOvertureAvailable(true);
    expect(useMapStore.getState().overtureAvailable).toBe(true);
  });

  it('setOvertureAvailable(false) sets flag back to false', () => {
    useMapStore.setState({ overtureAvailable: true });
    const { setOvertureAvailable } = useMapStore.getState();
    setOvertureAvailable(false);
    expect(useMapStore.getState().overtureAvailable).toBe(false);
  });

  it('clearBbox resets overtureAvailable to false', () => {
    useMapStore.setState({ overtureAvailable: true });
    const { clearBbox } = useMapStore.getState();
    clearBbox();
    expect(useMapStore.getState().overtureAvailable).toBe(false);
  });

  it('setBbox resets overtureAvailable to false', () => {
    useMapStore.setState({ overtureAvailable: true });
    const { setBbox } = useMapStore.getState();
    setBbox({ lon: -74.01, lat: 40.70 }, { lon: -73.97, lat: 40.75 });
    expect(useMapStore.getState().overtureAvailable).toBe(false);
  });
});
