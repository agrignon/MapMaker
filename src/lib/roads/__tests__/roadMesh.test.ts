/**
 * Tests for road geometry generation.
 * Verifies: null for empty features, BufferGeometry production, width tiers,
 * style offsets (recessed/raised/flat), and bridge Z interpolation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { buildRoadGeometry, ROAD_WIDTH_MM, ROAD_DEPTH_MM } from '../roadMesh';
import type { RoadFeature, RoadGeometryParams } from '../types';
import type { BoundingBox, ElevationData } from '../../../types/geo';

// Mock sampleElevationAtLonLat — controls the terrain Z for each test
vi.mock('../../buildings/elevationSampler', () => ({
  sampleElevationAtLonLat: vi.fn(),
}));

// Mock wgs84ToUTM to return identity-like values for simple geometry tests
// This makes coordinates predictable: lon * 100000, lat * 100000
vi.mock('../../utm', () => ({
  wgs84ToUTM: vi.fn((lon: number, lat: number) => ({
    x: lon * 100000,
    y: lat * 100000,
    zone: 30,
    hemisphere: 'N',
  })),
}));

import { sampleElevationAtLonLat } from '../../buildings/elevationSampler';
const mockSampleElevation = vi.mocked(sampleElevationAtLonLat);

// ─── Shared test fixtures ─────────────────────────────────────────────────

const SAMPLE_BBOX: BoundingBox = {
  sw: { lon: -0.2, lat: 51.4 },
  ne: { lon: 0.2, lat: 51.6 },
};

const FLAT_ELEV_DATA: ElevationData = {
  elevations: new Float32Array(9).fill(100), // 3x3 flat grid at 100m
  gridSize: 3,
  minElevation: 100,
  maxElevation: 100,
};

const VARIED_ELEV_DATA: ElevationData = {
  elevations: new Float32Array(9).fill(100), // values not used directly in tests — sampleElevation is mocked
  gridSize: 3,
  minElevation: 0,
  maxElevation: 300,
};

const BASE_PARAMS: RoadGeometryParams = {
  widthMM: 150,
  depthMM: 100,
  geographicWidthM: 40000,  // ~40km
  geographicDepthM: 22000,  // ~22km
  exaggeration: 1.5,
  minElevationM: 0,
  bboxCenterUTM: { x: 0, y: 5155000 }, // approximate UTM center
  roadStyle: 'flat',
};

// Helper to create a simple 2-point road feature
function makeStraightRoad(
  tier: RoadFeature['tier'],
  isBridge = false
): RoadFeature {
  return {
    coordinates: [
      [-0.05, 51.5],
      [0.05, 51.5],
    ],
    tier,
    isBridge,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: constant elevation 100m for all sample calls
  mockSampleElevation.mockReturnValue(100);
});

// ─── buildRoadGeometry tests ──────────────────────────────────────────────

describe('buildRoadGeometry — basic behavior', () => {
  it('returns null for empty features array', () => {
    const result = buildRoadGeometry([], SAMPLE_BBOX, FLAT_ELEV_DATA, BASE_PARAMS);
    expect(result).toBeNull();
  });

  it('returns null when all features have < 2 coordinates', () => {
    const degenerate: RoadFeature[] = [
      { coordinates: [[-0.05, 51.5]], tier: 'residential', isBridge: false },
    ];
    const result = buildRoadGeometry(degenerate, SAMPLE_BBOX, FLAT_ELEV_DATA, BASE_PARAMS);
    expect(result).toBeNull();
  });

  it('produces a BufferGeometry with position attribute for a 2-point road', () => {
    const features = [makeStraightRoad('residential')];
    const result = buildRoadGeometry(features, SAMPLE_BBOX, FLAT_ELEV_DATA, BASE_PARAMS);

    expect(result).not.toBeNull();
    expect(result).toBeInstanceOf(THREE.BufferGeometry);
    expect(result!.getAttribute('position')).toBeDefined();
    expect(result!.getAttribute('position').count).toBeGreaterThan(0);
  });

  it('produces geometry with an index buffer', () => {
    const features = [makeStraightRoad('main')];
    const result = buildRoadGeometry(features, SAMPLE_BBOX, FLAT_ELEV_DATA, BASE_PARAMS);

    expect(result).not.toBeNull();
    expect(result!.index).not.toBeNull();
    expect(result!.index!.count).toBeGreaterThan(0);
  });

  it('handles multiple features and returns merged geometry', () => {
    const features = [
      makeStraightRoad('highway'),
      makeStraightRoad('main'),
      makeStraightRoad('residential'),
    ];
    const result = buildRoadGeometry(features, SAMPLE_BBOX, FLAT_ELEV_DATA, BASE_PARAMS);
    expect(result).not.toBeNull();
    expect(result!.getAttribute('position').count).toBeGreaterThan(0);
  });
});

describe('buildRoadGeometry — road width varies by tier', () => {
  /**
   * Verify that ROAD_WIDTH_MM constants establish hierarchy.
   * The constants are used directly so we test them.
   */
  it('highway width is greater than main width', () => {
    expect(ROAD_WIDTH_MM.highway).toBeGreaterThan(ROAD_WIDTH_MM.main);
  });

  it('main width is greater than residential width', () => {
    expect(ROAD_WIDTH_MM.main).toBeGreaterThan(ROAD_WIDTH_MM.residential);
  });

  it('highway geometry has wider X/Y spread than residential', () => {
    // Build two separate geometries and compare bounding box X extents
    const hwFeatures: RoadFeature[] = [
      {
        coordinates: [[-0.1, 51.5], [0.1, 51.5]],
        tier: 'highway',
        isBridge: false,
      },
    ];
    const resFeatures: RoadFeature[] = [
      {
        coordinates: [[-0.1, 51.5], [0.1, 51.5]],
        tier: 'residential',
        isBridge: false,
      },
    ];

    mockSampleElevation.mockReturnValue(100);

    const hwGeo = buildRoadGeometry(hwFeatures, SAMPLE_BBOX, FLAT_ELEV_DATA, BASE_PARAMS);
    const resGeo = buildRoadGeometry(resFeatures, SAMPLE_BBOX, FLAT_ELEV_DATA, BASE_PARAMS);

    expect(hwGeo).not.toBeNull();
    expect(resGeo).not.toBeNull();

    // Compute bounding boxes and compare spread
    hwGeo!.computeBoundingBox();
    resGeo!.computeBoundingBox();

    const hwBox = hwGeo!.boundingBox!;
    const resBox = resGeo!.boundingBox!;

    // Highway ribbon should be wider (larger Y extent since road runs along X axis)
    const hwYSpread = hwBox.max.y - hwBox.min.y;
    const resYSpread = resBox.max.y - resBox.min.y;

    expect(hwYSpread).toBeGreaterThan(resYSpread);
  });
});

describe('buildRoadGeometry — road style offsets', () => {
  const roadCoords: [number, number][] = [
    [-0.05, 51.5],
    [0.05, 51.5],
  ];
  const feature: RoadFeature = {
    coordinates: roadCoords,
    tier: 'main',
    isBridge: false,
  };

  function buildWithStyle(style: RoadGeometryParams['roadStyle']): THREE.BufferGeometry {
    mockSampleElevation.mockReturnValue(100);
    const result = buildRoadGeometry(
      [feature],
      SAMPLE_BBOX,
      VARIED_ELEV_DATA,
      { ...BASE_PARAMS, roadStyle: style }
    );
    expect(result).not.toBeNull();
    return result!;
  }

  function getAverageZ(geo: THREE.BufferGeometry): number {
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    let total = 0;
    for (let i = 0; i < pos.count; i++) {
      total += pos.getZ(i);
    }
    return total / pos.count;
  }

  it('recessed road has lower average Z than flat road', () => {
    const flatGeo = buildWithStyle('flat');
    const recessedGeo = buildWithStyle('recessed');

    const flatAvgZ = getAverageZ(flatGeo);
    const recessedAvgZ = getAverageZ(recessedGeo);

    expect(recessedAvgZ).toBeLessThan(flatAvgZ);
  });

  it('raised road has higher average Z than flat road', () => {
    const flatGeo = buildWithStyle('flat');
    const raisedGeo = buildWithStyle('raised');

    const flatAvgZ = getAverageZ(flatGeo);
    const raisedAvgZ = getAverageZ(raisedGeo);

    expect(raisedAvgZ).toBeGreaterThan(flatAvgZ);
  });

  it('recessed road has lower average Z than raised road', () => {
    const recessedGeo = buildWithStyle('recessed');
    const raisedGeo = buildWithStyle('raised');

    expect(getAverageZ(recessedGeo)).toBeLessThan(getAverageZ(raisedGeo));
  });

  it('recessed offset magnitude matches ROAD_DEPTH_MM for main tier', () => {
    // Flat average Z should differ from recessed by ROAD_DEPTH_MM.main
    const flatGeo = buildWithStyle('flat');
    const recessedGeo = buildWithStyle('recessed');

    const diff = getAverageZ(flatGeo) - getAverageZ(recessedGeo);
    // The difference should approximate ROAD_DEPTH_MM.main (within some tolerance
    // for the ribbon thickness distribution)
    expect(diff).toBeCloseTo(ROAD_DEPTH_MM.main, 1);
  });
});

describe('buildRoadGeometry — bridge Z interpolation', () => {
  /**
   * Test bridge linear interpolation.
   * Mock sampleElevationAtLonLat to return 100m at start and 200m at end.
   * The bridge should have linearly interpolated Z between the two endpoints.
   *
   * With minElevationM=0, exaggeration=1.5, widthMM=150, geographicWidthM=40000:
   *   horizontalScale = 150/40000 = 0.00375
   *   elevRange = 300 (using VARIED_ELEV_DATA)
   *   naturalHeightMM = 300 * 0.00375 * 1.5 = 1.6875 < 5mm → TERR-03 floor
   *   zScale = 5 / 300 = 0.016667
   *
   * Start terrain Z = (100 - 0) * 0.016667 = 1.667mm
   * End terrain Z = (200 - 0) * 0.016667 = 3.333mm
   * Middle terrain Z ≈ (150 - 0) * 0.016667 = 2.5mm
   * Bridge lift = ROAD_DEPTH_MM.highway * 2 = 2.0mm
   * Expected middle vertex Z range ≈ 2.5 + 2.0 = 4.5mm (plus ribbon thickness 0..1.0mm)
   */
  it('bridge Z is higher than terrain Z (due to bridge lift)', () => {
    const bridgeFeature: RoadFeature = {
      coordinates: [
        [-0.1, 51.5],
        [0.0, 51.5],
        [0.1, 51.5],
      ],
      tier: 'highway',
      isBridge: true,
    };

    // Return 100m for start, 150m for middle, 200m for end
    mockSampleElevation
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(150)
      .mockReturnValueOnce(200);

    // Also mock for any additional calls
    mockSampleElevation.mockReturnValue(150);

    const result = buildRoadGeometry(
      [bridgeFeature],
      SAMPLE_BBOX,
      VARIED_ELEV_DATA,
      { ...BASE_PARAMS, roadStyle: 'flat', minElevationM: 0 }
    );

    expect(result).not.toBeNull();

    // Verify bridge geometry exists and has vertices
    const pos = result!.getAttribute('position') as THREE.BufferAttribute;
    expect(pos.count).toBeGreaterThan(0);

    // All bridge vertices should have Z > start terrain Z (bridge is always above)
    // Start terrain Z = 100 * zScale (where zScale = 5/300 ≈ 0.01667)
    // Bridge lift = ROAD_DEPTH_MM.highway * 2 = 2.0mm
    // So minimum bridge Z ≈ 100 * 0.01667 + 0 (no style offset) + 2.0mm bridge lift ≈ 3.67mm
    const bridgeLift = ROAD_DEPTH_MM.highway * 2;
    const zScale = 5 / 300; // TERR-03 floor kicks in for this test
    const minTerrainZ = 100 * zScale; // start terrain Z

    let allAboveTerrain = true;
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      // Every vertex should be at least at start terrain Z + bridge lift (bottom face)
      if (z < minTerrainZ + bridgeLift - 0.01) {
        allAboveTerrain = false;
        break;
      }
    }
    expect(allAboveTerrain).toBe(true);
  });

  it('bridge Z is between start and end terrain Z + lift (linear interpolation)', () => {
    const bridgeFeature: RoadFeature = {
      coordinates: [
        [0.0, 51.5],  // start: lon=0.0
        [0.5, 51.5],  // end: lon=0.5
      ],
      tier: 'main',
      isBridge: true,
    };

    // Control: start returns 100m, end returns 200m
    mockSampleElevation
      .mockReturnValueOnce(100)  // start coordinate
      .mockReturnValueOnce(200); // end coordinate

    const result = buildRoadGeometry(
      [bridgeFeature],
      SAMPLE_BBOX,
      VARIED_ELEV_DATA,
      { ...BASE_PARAMS, roadStyle: 'flat', minElevationM: 0 }
    );

    expect(result).not.toBeNull();

    const pos = result!.getAttribute('position') as THREE.BufferAttribute;

    // With TERR-03 floor: zScale = 5/300
    const zScale = 5 / 300;
    const startTerrainZ = 100 * zScale;
    const endTerrainZ = 200 * zScale;
    const bridgeLift = ROAD_DEPTH_MM.main * 2;

    // All vertices should be between startTerrainZ + lift and endTerrainZ + lift + ribbonDepth
    const minExpected = startTerrainZ + bridgeLift - 0.01;
    const maxExpected = endTerrainZ + bridgeLift + ROAD_DEPTH_MM.main + 0.01;

    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      expect(z).toBeGreaterThanOrEqual(minExpected);
      expect(z).toBeLessThanOrEqual(maxExpected);
    }
  });
});
