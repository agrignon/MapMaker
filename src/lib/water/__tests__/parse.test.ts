/**
 * Tests for water feature parsing.
 * Verifies: Polygon parsing, MultiPolygon with holes, LineString skipping,
 * degenerate polygon filtering, and multiple feature handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseWaterFeatures } from '../parse';

// Mock osmtogeojson to return pre-formatted GeoJSON FeatureCollections directly.
// The mock data looks like the output of osmtogeojson, not the input.
vi.mock('osmtogeojson', () => ({
  default: vi.fn(),
}));

import osmtogeojson from 'osmtogeojson';
const mockOsmtogeojson = vi.mocked(osmtogeojson);

// Helper to build a mock GeoJSON FeatureCollection
function makeFeatureCollection(features: object[]) {
  return {
    type: 'FeatureCollection' as const,
    features,
  };
}

// Helper to build a Polygon feature
function makePolygonFeature(
  coordinates: number[][][],
  properties: Record<string, unknown> = { natural: 'water' }
) {
  return {
    type: 'Feature' as const,
    geometry: {
      type: 'Polygon' as const,
      coordinates,
    },
    properties,
  };
}

// Helper to build a MultiPolygon feature
function makeMultiPolygonFeature(
  coordinates: number[][][][],
  properties: Record<string, unknown> = { natural: 'water' }
) {
  return {
    type: 'Feature' as const,
    geometry: {
      type: 'MultiPolygon' as const,
      coordinates,
    },
    properties,
  };
}

// Helper to build a LineString feature
function makeLineStringFeature(
  coordinates: number[][],
  properties: Record<string, unknown> = { waterway: 'river' }
) {
  return {
    type: 'Feature' as const,
    geometry: {
      type: 'LineString' as const,
      coordinates,
    },
    properties,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── parseWaterFeatures tests ──────────────────────────────────────────────────

describe('parseWaterFeatures — OSM JSON conversion', () => {
  it('parses a simple Polygon water feature', () => {
    const outerRing = [
      [0.0, 0.0],
      [1.0, 0.0],
      [1.0, 1.0],
      [0.0, 1.0],
      [0.0, 0.0], // closed
    ];
    mockOsmtogeojson.mockReturnValue(
      makeFeatureCollection([
        makePolygonFeature([outerRing]),
      ])
    );

    const result = parseWaterFeatures({});

    expect(result).toHaveLength(1);
    expect(result[0].outerRing).toEqual(outerRing.map(p => [p[0], p[1]]));
    expect(result[0].holes).toEqual([]);
  });

  it('parses MultiPolygon with holes (island in lake)', () => {
    const outerRing = [
      [0.0, 0.0],
      [10.0, 0.0],
      [10.0, 10.0],
      [0.0, 10.0],
      [0.0, 0.0],
    ];
    const innerRing = [
      [4.0, 4.0],
      [6.0, 4.0],
      [6.0, 6.0],
      [4.0, 6.0],
      [4.0, 4.0],
    ];
    mockOsmtogeojson.mockReturnValue(
      makeFeatureCollection([
        makeMultiPolygonFeature([[outerRing, innerRing]]),
      ])
    );

    const result = parseWaterFeatures({});

    expect(result).toHaveLength(1);
    expect(result[0].outerRing).toEqual(outerRing.map(p => [p[0], p[1]]));
    expect(result[0].holes).toHaveLength(1);
    expect(result[0].holes[0]).toEqual(innerRing.map(p => [p[0], p[1]]));
  });

  it('skips LineString features (rivers as centerlines)', () => {
    const outerRing = [
      [0.0, 0.0],
      [1.0, 0.0],
      [1.0, 1.0],
      [0.0, 0.0],
    ];
    mockOsmtogeojson.mockReturnValue(
      makeFeatureCollection([
        makeLineStringFeature([[0.0, 0.0], [1.0, 1.0], [2.0, 0.0]]),
        makePolygonFeature([outerRing]),
      ])
    );

    const result = parseWaterFeatures({});

    expect(result).toHaveLength(1);
    expect(result[0].outerRing).toEqual(outerRing.map(p => [p[0], p[1]]));
  });

  it('skips features with fewer than 3 coordinates in outer ring', () => {
    const degenerateRing = [
      [0.0, 0.0],
      [1.0, 1.0],
      // Only 2 points — degenerate
    ];
    mockOsmtogeojson.mockReturnValue(
      makeFeatureCollection([
        makePolygonFeature([degenerateRing]),
      ])
    );

    const result = parseWaterFeatures({});

    expect(result).toHaveLength(0);
  });

  it('handles multiple Polygon features', () => {
    const ring1 = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
    const ring2 = [[2, 0], [3, 0], [3, 1], [2, 1], [2, 0]];
    const ring3 = [[4, 0], [5, 0], [5, 1], [4, 1], [4, 0]];
    mockOsmtogeojson.mockReturnValue(
      makeFeatureCollection([
        makePolygonFeature([ring1]),
        makePolygonFeature([ring2]),
        makePolygonFeature([ring3]),
      ])
    );

    const result = parseWaterFeatures({});

    expect(result).toHaveLength(3);
  });

  it('parses a Polygon with a hole (inner ring)', () => {
    const outerRing = [
      [0.0, 0.0],
      [10.0, 0.0],
      [10.0, 10.0],
      [0.0, 10.0],
      [0.0, 0.0],
    ];
    const holeRing = [
      [3.0, 3.0],
      [7.0, 3.0],
      [7.0, 7.0],
      [3.0, 7.0],
      [3.0, 3.0],
    ];
    mockOsmtogeojson.mockReturnValue(
      makeFeatureCollection([
        makePolygonFeature([outerRing, holeRing]),
      ])
    );

    const result = parseWaterFeatures({});

    expect(result).toHaveLength(1);
    expect(result[0].outerRing).toEqual(outerRing.map(p => [p[0], p[1]]));
    expect(result[0].holes).toHaveLength(1);
    expect(result[0].holes[0]).toEqual(holeRing.map(p => [p[0], p[1]]));
  });

  it('returns empty array when no features', () => {
    mockOsmtogeojson.mockReturnValue(makeFeatureCollection([]));
    expect(parseWaterFeatures({})).toEqual([]);
  });
});
