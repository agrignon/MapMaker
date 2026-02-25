/**
 * Tests for road parsing and tier classification.
 * Verifies tier classification, tunnel exclusion, bridge flagging,
 * geometry type filtering, and coordinate extraction.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifyTier, parseRoadFeatures } from '../parse';

// Mock osmtogeojson to return pre-formatted GeoJSON FeatureCollections directly.
// The mock data looks like the output of osmtogeojson, not the input.
vi.mock('osmtogeojson', () => ({
  default: vi.fn(),
}));

import osmtogeojson from 'osmtogeojson';
const mockOsmtogeojson = vi.mocked(osmtogeojson);

// Helper to build a mock LineString feature
function makeLineStringFeature(
  highway: string,
  coordinates: number[][],
  extra: Record<string, string> = {}
) {
  return {
    type: 'Feature' as const,
    geometry: {
      type: 'LineString' as const,
      coordinates,
    },
    properties: {
      highway,
      ...extra,
    },
  };
}

// Helper to build a mock GeoJSON FeatureCollection
function makeFeatureCollection(features: object[]) {
  return {
    type: 'FeatureCollection' as const,
    features,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── classifyTier tests ───────────────────────────────────────────────────────

describe('classifyTier — highway tier mapping', () => {
  describe('highway tier', () => {
    it('classifies motorway as highway', () => {
      expect(classifyTier('motorway')).toBe('highway');
    });

    it('classifies motorway_link as highway', () => {
      expect(classifyTier('motorway_link')).toBe('highway');
    });

    it('classifies trunk as highway', () => {
      expect(classifyTier('trunk')).toBe('highway');
    });

    it('classifies trunk_link as highway', () => {
      expect(classifyTier('trunk_link')).toBe('highway');
    });
  });

  describe('main tier', () => {
    it('classifies primary as main', () => {
      expect(classifyTier('primary')).toBe('main');
    });

    it('classifies primary_link as main', () => {
      expect(classifyTier('primary_link')).toBe('main');
    });

    it('classifies secondary as main', () => {
      expect(classifyTier('secondary')).toBe('main');
    });

    it('classifies secondary_link as main', () => {
      expect(classifyTier('secondary_link')).toBe('main');
    });

    it('classifies tertiary as main', () => {
      expect(classifyTier('tertiary')).toBe('main');
    });

    it('classifies tertiary_link as main', () => {
      expect(classifyTier('tertiary_link')).toBe('main');
    });
  });

  describe('residential tier', () => {
    it('classifies residential as residential', () => {
      expect(classifyTier('residential')).toBe('residential');
    });

    it('classifies unclassified as residential', () => {
      expect(classifyTier('unclassified')).toBe('residential');
    });
  });

  describe('excluded types', () => {
    it('returns null for footway', () => {
      expect(classifyTier('footway')).toBeNull();
    });

    it('returns null for cycleway', () => {
      expect(classifyTier('cycleway')).toBeNull();
    });

    it('returns null for service', () => {
      expect(classifyTier('service')).toBeNull();
    });

    it('returns null for path', () => {
      expect(classifyTier('path')).toBeNull();
    });

    it('returns null for track', () => {
      expect(classifyTier('track')).toBeNull();
    });

    it('returns null for steps', () => {
      expect(classifyTier('steps')).toBeNull();
    });

    it('returns null for living_street', () => {
      expect(classifyTier('living_street')).toBeNull();
    });
  });
});

// ─── parseRoadFeatures tests ──────────────────────────────────────────────────

describe('parseRoadFeatures — OSM JSON conversion', () => {
  const sampleCoords = [
    [-0.1, 51.5],
    [-0.11, 51.51],
    [-0.12, 51.52],
  ];

  it('returns empty array when no features', () => {
    mockOsmtogeojson.mockReturnValue(makeFeatureCollection([]));
    expect(parseRoadFeatures({})).toEqual([]);
  });

  it('parses a basic residential road', () => {
    mockOsmtogeojson.mockReturnValue(
      makeFeatureCollection([
        makeLineStringFeature('residential', sampleCoords),
      ])
    );
    const result = parseRoadFeatures({});
    expect(result).toHaveLength(1);
    expect(result[0].tier).toBe('residential');
    expect(result[0].isBridge).toBe(false);
    expect(result[0].coordinates).toEqual([
      [-0.1, 51.5],
      [-0.11, 51.51],
      [-0.12, 51.52],
    ]);
  });

  it('parses a primary road with main tier', () => {
    mockOsmtogeojson.mockReturnValue(
      makeFeatureCollection([
        makeLineStringFeature('primary', sampleCoords),
      ])
    );
    const result = parseRoadFeatures({});
    expect(result[0].tier).toBe('main');
  });

  it('parses a motorway with highway tier', () => {
    mockOsmtogeojson.mockReturnValue(
      makeFeatureCollection([
        makeLineStringFeature('motorway', sampleCoords),
      ])
    );
    const result = parseRoadFeatures({});
    expect(result[0].tier).toBe('highway');
  });

  it('excludes tunnels (tunnel=yes)', () => {
    mockOsmtogeojson.mockReturnValue(
      makeFeatureCollection([
        makeLineStringFeature('primary', sampleCoords, { tunnel: 'yes' }),
        makeLineStringFeature('residential', sampleCoords),
      ])
    );
    const result = parseRoadFeatures({});
    // Only the residential road should pass through (no tunnel)
    expect(result).toHaveLength(1);
    expect(result[0].tier).toBe('residential');
  });

  it('flags bridges (bridge=yes) with isBridge=true', () => {
    mockOsmtogeojson.mockReturnValue(
      makeFeatureCollection([
        makeLineStringFeature('secondary', sampleCoords, { bridge: 'yes' }),
      ])
    );
    const result = parseRoadFeatures({});
    expect(result).toHaveLength(1);
    expect(result[0].isBridge).toBe(true);
  });

  it('sets isBridge=false for non-bridge roads', () => {
    mockOsmtogeojson.mockReturnValue(
      makeFeatureCollection([
        makeLineStringFeature('secondary', sampleCoords),
      ])
    );
    const result = parseRoadFeatures({});
    expect(result[0].isBridge).toBe(false);
  });

  it('skips non-LineString geometry (e.g., Polygon roundabout)', () => {
    mockOsmtogeojson.mockReturnValue(
      makeFeatureCollection([
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [sampleCoords],
          },
          properties: { highway: 'primary' },
        },
        makeLineStringFeature('residential', sampleCoords),
      ])
    );
    const result = parseRoadFeatures({});
    // Only the LineString residential road should be parsed
    expect(result).toHaveLength(1);
    expect(result[0].tier).toBe('residential');
  });

  it('skips features without highway property', () => {
    mockOsmtogeojson.mockReturnValue(
      makeFeatureCollection([
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: sampleCoords,
          },
          properties: { name: 'Some path' }, // no highway tag
        },
        makeLineStringFeature('residential', sampleCoords),
      ])
    );
    const result = parseRoadFeatures({});
    expect(result).toHaveLength(1);
    expect(result[0].tier).toBe('residential');
  });

  it('skips highway types not in the classification set (footway)', () => {
    mockOsmtogeojson.mockReturnValue(
      makeFeatureCollection([
        makeLineStringFeature('footway', sampleCoords),
        makeLineStringFeature('residential', sampleCoords),
      ])
    );
    const result = parseRoadFeatures({});
    expect(result).toHaveLength(1);
    expect(result[0].tier).toBe('residential');
  });

  it('extracts coordinates correctly as [lon, lat] pairs', () => {
    const coords = [
      [-73.985, 40.758],
      [-73.99, 40.76],
    ];
    mockOsmtogeojson.mockReturnValue(
      makeFeatureCollection([
        makeLineStringFeature('tertiary', coords),
      ])
    );
    const result = parseRoadFeatures({});
    expect(result[0].coordinates).toEqual([
      [-73.985, 40.758],
      [-73.99, 40.76],
    ]);
  });

  it('processes multiple features in one call', () => {
    mockOsmtogeojson.mockReturnValue(
      makeFeatureCollection([
        makeLineStringFeature('motorway', sampleCoords),
        makeLineStringFeature('primary', sampleCoords),
        makeLineStringFeature('residential', sampleCoords),
        makeLineStringFeature('footway', sampleCoords), // should be skipped
        makeLineStringFeature('tertiary', sampleCoords, { tunnel: 'yes' }), // should be skipped
      ])
    );
    const result = parseRoadFeatures({});
    expect(result).toHaveLength(3);
    expect(result.map((f) => f.tier)).toEqual(['highway', 'main', 'residential']);
  });
});
