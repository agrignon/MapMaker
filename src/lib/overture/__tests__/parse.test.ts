/**
 * Tests for parseOvertureTiles — PARSE-01 through PARSE-04.
 *
 * Mock strategy:
 *   - vi.mock('@mapbox/vector-tile') intercepts VectorTile constructor.
 *   - vi.mock('pbf') intercepts Pbf constructor (stateful; parse.ts creates one per tile).
 *   - vi.mock('../../../lib/buildings/merge') mocks computeFootprintAreaM2 for area tests.
 *   - computeSignedArea from walls.ts is NOT mocked — pure math, used directly in winding tests.
 *
 * Each test constructs a Map<string, ArrayBuffer> with a dummy ArrayBuffer.
 * The VectorTile mock intercepts and returns synthetic feature data.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeSignedArea } from '../../buildings/walls';

// ---- Mocks ---------------------------------------------------------------

// Mock Pbf: stateless wrapper — parse.ts calls `new Pbf(buffer)` and passes to VectorTile
vi.mock('pbf', () => {
  const MockPbf = vi.fn(() => ({}));
  return { default: MockPbf };
});

// Mock @mapbox/vector-tile: controlled VectorTile / VectorTileFeature objects
let mockVectorTileImpl: (() => object) | null = null;

vi.mock('@mapbox/vector-tile', () => {
  const MockVectorTile = vi.fn((...args: unknown[]) => {
    if (mockVectorTileImpl) {
      return mockVectorTileImpl();
    }
    return { layers: {} };
  });
  return { VectorTile: MockVectorTile };
});

// Mock computeFootprintAreaM2 from merge.ts for area tests
// We use the real implementation for winding tests; area tests override this mock
let mockAreaImpl: ((ring: [number, number][]) => number) | null = null;

vi.mock('../../buildings/merge', () => ({
  computeFootprintAreaM2: vi.fn((ring: [number, number][]) => {
    if (mockAreaImpl) {
      return mockAreaImpl(ring);
    }
    // Default: return large area so features pass the filter
    return 100;
  }),
}));

// Import after mocks are set up
import { parseOvertureTiles } from '../parse';

// ---- Helpers ---------------------------------------------------------------

/**
 * A closed CCW ring in lon/lat space (positive signed area).
 * Represents a square roughly 0.001 degrees on a side at origin.
 *
 * Shoelace: [[0,0],[1,0],[1,1],[0,1],[0,0]] → positive area (CCW)
 */
const CCW_RING: [number, number][] = [
  [0, 0], [1, 0], [1, 1], [0, 1], [0, 0],
];

/**
 * A closed CW ring (reverse of CCW_RING) → negative signed area.
 */
const CW_RING: [number, number][] = [
  [0, 0], [0, 1], [1, 1], [1, 0], [0, 0],
];

/** A degenerate ring with only 3 coordinates (< 4 required). */
const DEGENERATE_RING: [number, number][] = [
  [0, 0], [1, 0], [0, 0],
];

type GeoJSONPolygonCoords = [number, number][][];
type GeoJSONMultiPolygonCoords = [number, number][][][];

interface MockFeatureSpec {
  properties?: Record<string, number | string | boolean>;
  geometryType: 'Polygon' | 'MultiPolygon';
  polygonCoords?: GeoJSONPolygonCoords;     // for Polygon
  multiPolyCoords?: GeoJSONMultiPolygonCoords; // for MultiPolygon
}

function makeMockFeature(spec: MockFeatureSpec) {
  const props = spec.properties ?? {};
  const geometry =
    spec.geometryType === 'Polygon'
      ? { type: 'Polygon' as const, coordinates: spec.polygonCoords ?? [CCW_RING] }
      : { type: 'MultiPolygon' as const, coordinates: spec.multiPolyCoords ?? [] };

  return {
    properties: props,
    toGeoJSON: vi.fn((_x: number, _y: number, _z: number) => ({
      type: 'Feature',
      geometry,
      properties: props,
    })),
  };
}

/**
 * Configure the VectorTile mock to return a tile with a 'building' layer
 * containing the given features.
 */
function setMockTile(features: ReturnType<typeof makeMockFeature>[]) {
  mockVectorTileImpl = () => ({
    layers: {
      building: {
        length: features.length,
        feature: (i: number) => features[i],
      },
    },
  });
}

/**
 * Configure the VectorTile mock to return a tile with NO 'building' layer.
 */
function setMockTileNoLayer() {
  mockVectorTileImpl = () => ({
    layers: {},
  });
}

/** Create a dummy tile map with one tile. */
function makeTileMap(tileKey = '14/100/200'): Map<string, ArrayBuffer> {
  return new Map([[tileKey, new ArrayBuffer(8)]]);
}

// ---- Verify winding convention in walls.ts --------------------------------

describe('computeSignedArea convention (sanity check)', () => {
  it('CCW ring has positive signed area', () => {
    expect(computeSignedArea(CCW_RING)).toBeGreaterThan(0);
  });

  it('CW ring has negative signed area', () => {
    expect(computeSignedArea(CW_RING)).toBeLessThan(0);
  });
});

// ---- PARSE-01: MVT decode + property mapping ------------------------------

describe('PARSE-01: MVT decode and property mapping', () => {
  beforeEach(() => {
    mockAreaImpl = null; // use default (100 m2 — passes filter)
  });

  it('returns [] for empty Map input', () => {
    const result = parseOvertureTiles(new Map());
    expect(result).toEqual([]);
  });

  it('returns [] for tile with no building layer', () => {
    setMockTileNoLayer();
    const result = parseOvertureTiles(makeTileMap());
    expect(result).toHaveLength(0);
  });

  it('maps height (number) → properties["height"] (string)', () => {
    setMockTile([
      makeMockFeature({
        properties: { height: 42.5 },
        geometryType: 'Polygon',
        polygonCoords: [CCW_RING],
      }),
    ]);
    const result = parseOvertureTiles(makeTileMap());
    expect(result).toHaveLength(1);
    expect(result[0].properties['height']).toBe('42.5');
  });

  it('maps num_floors (number) → properties["building:levels"] (string)', () => {
    setMockTile([
      makeMockFeature({
        properties: { num_floors: 5 },
        geometryType: 'Polygon',
        polygonCoords: [CCW_RING],
      }),
    ]);
    const result = parseOvertureTiles(makeTileMap());
    expect(result[0].properties['building:levels']).toBe('5');
  });

  it('maps roof_shape (string) → properties["roof:shape"] (string)', () => {
    setMockTile([
      makeMockFeature({
        properties: { roof_shape: 'gabled' },
        geometryType: 'Polygon',
        polygonCoords: [CCW_RING],
      }),
    ]);
    const result = parseOvertureTiles(makeTileMap());
    expect(result[0].properties['roof:shape']).toBe('gabled');
  });

  it('maps roof_height (number) → properties["roof:height"] (string)', () => {
    setMockTile([
      makeMockFeature({
        properties: { roof_height: 3.2 },
        geometryType: 'Polygon',
        polygonCoords: [CCW_RING],
      }),
    ]);
    const result = parseOvertureTiles(makeTileMap());
    expect(result[0].properties['roof:height']).toBe('3.2');
  });

  it('always sets properties["building"] = "yes"', () => {
    setMockTile([
      makeMockFeature({
        properties: {},
        geometryType: 'Polygon',
        polygonCoords: [CCW_RING],
      }),
    ]);
    const result = parseOvertureTiles(makeTileMap());
    expect(result[0].properties['building']).toBe('yes');
  });

  it('feature with no height data still produces valid BuildingFeature with building=yes', () => {
    setMockTile([
      makeMockFeature({
        properties: { is_underground: false, has_parts: false },
        geometryType: 'Polygon',
        polygonCoords: [CCW_RING],
      }),
    ]);
    const result = parseOvertureTiles(makeTileMap());
    expect(result).toHaveLength(1);
    expect(result[0].properties['building']).toBe('yes');
    expect(result[0].properties['height']).toBeUndefined();
    expect(result[0].properties['building:levels']).toBeUndefined();
  });

  it('single tile with 3 features returns 3 BuildingFeature entries', () => {
    setMockTile([
      makeMockFeature({ geometryType: 'Polygon', polygonCoords: [CCW_RING] }),
      makeMockFeature({ geometryType: 'Polygon', polygonCoords: [CCW_RING] }),
      makeMockFeature({ geometryType: 'Polygon', polygonCoords: [CCW_RING] }),
    ]);
    const result = parseOvertureTiles(makeTileMap());
    expect(result).toHaveLength(3);
  });

  it('all properties mapped in a single feature (height + num_floors + roof_shape + roof_height)', () => {
    setMockTile([
      makeMockFeature({
        properties: { height: 30, num_floors: 8, roof_shape: 'flat', roof_height: 1.5 },
        geometryType: 'Polygon',
        polygonCoords: [CCW_RING],
      }),
    ]);
    const result = parseOvertureTiles(makeTileMap());
    expect(result).toHaveLength(1);
    const props = result[0].properties;
    expect(props['height']).toBe('30');
    expect(props['building:levels']).toBe('8');
    expect(props['roof:shape']).toBe('flat');
    expect(props['roof:height']).toBe('1.5');
    expect(props['building']).toBe('yes');
  });

  it('multiple tiles accumulate features into a single flat array', () => {
    const tiles = new Map<string, ArrayBuffer>([
      ['14/100/200', new ArrayBuffer(8)],
      ['14/101/200', new ArrayBuffer(8)],
    ]);
    // Configure mock to return 2 features per tile (both tiles share same layer config)
    setMockTile([
      makeMockFeature({ geometryType: 'Polygon', polygonCoords: [CCW_RING] }),
      makeMockFeature({ geometryType: 'Polygon', polygonCoords: [CCW_RING] }),
    ]);
    const result = parseOvertureTiles(tiles);
    // 2 tiles × 2 features each = 4 total
    expect(result).toHaveLength(4);
  });

  it('toGeoJSON receives correct (x, y, z) args from tile key "z/x/y"', () => {
    const feature = makeMockFeature({ geometryType: 'Polygon', polygonCoords: [CCW_RING] });
    setMockTile([feature]);
    // tile key format: z/x/y = "14/4823/6160"
    parseOvertureTiles(new Map([['14/4823/6160', new ArrayBuffer(8)]]));
    // toGeoJSON should be called with (x=4823, y=6160, z=14)
    expect(feature.toGeoJSON).toHaveBeenCalledWith(4823, 6160, 14);
  });
});

// ---- PARSE-02: MultiPolygon flattening ------------------------------------

describe('PARSE-02: MultiPolygon flattening', () => {
  beforeEach(() => {
    mockAreaImpl = null;
  });

  it('MultiPolygon with 2 sub-polygons produces 2 BuildingFeature entries', () => {
    setMockTile([
      makeMockFeature({
        geometryType: 'MultiPolygon',
        multiPolyCoords: [[CCW_RING], [CCW_RING]],
      }),
    ]);
    const result = parseOvertureTiles(makeTileMap());
    expect(result).toHaveLength(2);
  });

  it('each sub-polygon gets the same mapped properties', () => {
    setMockTile([
      makeMockFeature({
        properties: { height: 10, num_floors: 3 },
        geometryType: 'MultiPolygon',
        multiPolyCoords: [[CCW_RING], [CCW_RING]],
      }),
    ]);
    const result = parseOvertureTiles(makeTileMap());
    expect(result).toHaveLength(2);
    expect(result[0].properties['height']).toBe('10');
    expect(result[0].properties['building:levels']).toBe('3');
    expect(result[1].properties['height']).toBe('10');
    expect(result[1].properties['building:levels']).toBe('3');
  });

  it('mixed tile: Polygon + MultiPolygon produces correct total count', () => {
    setMockTile([
      makeMockFeature({ geometryType: 'Polygon', polygonCoords: [CCW_RING] }),
      makeMockFeature({
        geometryType: 'MultiPolygon',
        multiPolyCoords: [[CCW_RING], [CCW_RING]],
      }),
    ]);
    // 1 Polygon + 1 MultiPolygon(2 parts) = 3 total
    const result = parseOvertureTiles(makeTileMap());
    expect(result).toHaveLength(3);
  });
});

// ---- PARSE-03: Winding normalization --------------------------------------

describe('PARSE-03: Winding normalization', () => {
  beforeEach(() => {
    mockAreaImpl = null;
  });

  it('CW outer ring (negative signed area) is reversed to CCW in output', () => {
    // CW_RING has negative signed area
    expect(computeSignedArea(CW_RING)).toBeLessThan(0);

    setMockTile([
      makeMockFeature({ geometryType: 'Polygon', polygonCoords: [CW_RING] }),
    ]);
    const result = parseOvertureTiles(makeTileMap());
    expect(result).toHaveLength(1);
    // After normalization, output outer ring must have positive signed area (CCW)
    expect(computeSignedArea(result[0].outerRing)).toBeGreaterThan(0);
  });

  it('already-CCW outer ring (positive signed area) is left unchanged', () => {
    // CCW_RING has positive signed area
    expect(computeSignedArea(CCW_RING)).toBeGreaterThan(0);

    setMockTile([
      makeMockFeature({ geometryType: 'Polygon', polygonCoords: [CCW_RING] }),
    ]);
    const result = parseOvertureTiles(makeTileMap());
    expect(result).toHaveLength(1);
    // Must still be CCW
    expect(computeSignedArea(result[0].outerRing)).toBeGreaterThan(0);
  });

  it('all output outer rings have positive signed area after normalization', () => {
    // Mix of CW and CCW outer rings
    setMockTile([
      makeMockFeature({ geometryType: 'Polygon', polygonCoords: [CW_RING] }),
      makeMockFeature({ geometryType: 'Polygon', polygonCoords: [CCW_RING] }),
      makeMockFeature({
        geometryType: 'MultiPolygon',
        multiPolyCoords: [[CW_RING], [CCW_RING]],
      }),
    ]);
    const result = parseOvertureTiles(makeTileMap());
    for (const feature of result) {
      expect(computeSignedArea(feature.outerRing)).toBeGreaterThan(0);
    }
  });

  it('hole rings are passed through unchanged (already CCW from toGeoJSON)', () => {
    const holeRing: [number, number][] = [[0.1, 0.1], [0.4, 0.1], [0.4, 0.4], [0.1, 0.4], [0.1, 0.1]];
    setMockTile([
      makeMockFeature({
        geometryType: 'Polygon',
        // outer ring (CCW), with one hole
        polygonCoords: [CCW_RING, holeRing],
      }),
    ]);
    const result = parseOvertureTiles(makeTileMap());
    expect(result).toHaveLength(1);
    // Hole must be present in output
    expect(result[0].holes).toHaveLength(1);
  });
});

// ---- PARSE-04: Area filter ------------------------------------------------

describe('PARSE-04: Area filter (15 m2 threshold)', () => {
  it('feature with footprint < 15 m2 is excluded from output', () => {
    mockAreaImpl = () => 10; // below threshold
    setMockTile([
      makeMockFeature({ geometryType: 'Polygon', polygonCoords: [CCW_RING] }),
    ]);
    const result = parseOvertureTiles(makeTileMap());
    expect(result).toHaveLength(0);
  });

  it('feature with footprint >= 15 m2 is included in output', () => {
    mockAreaImpl = () => 20; // above threshold
    setMockTile([
      makeMockFeature({ geometryType: 'Polygon', polygonCoords: [CCW_RING] }),
    ]);
    const result = parseOvertureTiles(makeTileMap());
    expect(result).toHaveLength(1);
  });

  it('feature with footprint exactly 15 m2 is included (threshold is >=, not >)', () => {
    mockAreaImpl = () => 15; // exactly at threshold
    setMockTile([
      makeMockFeature({ geometryType: 'Polygon', polygonCoords: [CCW_RING] }),
    ]);
    const result = parseOvertureTiles(makeTileMap());
    expect(result).toHaveLength(1);
  });

  it('degenerate ring (< 4 coords including closing vertex) is excluded', () => {
    mockAreaImpl = null; // area won't matter — degenerate check happens first
    setMockTile([
      makeMockFeature({ geometryType: 'Polygon', polygonCoords: [DEGENERATE_RING] }),
    ]);
    const result = parseOvertureTiles(makeTileMap());
    expect(result).toHaveLength(0);
  });

  it('mix: small feature excluded, large feature included', () => {
    let callCount = 0;
    // First call: below threshold; second call: above threshold
    mockAreaImpl = () => {
      callCount++;
      return callCount === 1 ? 10 : 20;
    };
    setMockTile([
      makeMockFeature({ geometryType: 'Polygon', polygonCoords: [CCW_RING] }),
      makeMockFeature({ geometryType: 'Polygon', polygonCoords: [CCW_RING] }),
    ]);
    const result = parseOvertureTiles(makeTileMap());
    expect(result).toHaveLength(1);
  });
});
