import { describe, it, expect } from 'vitest';
import { deduplicateOverture, DEDUP_IOU_THRESHOLD } from '../dedup';
import type { BuildingFeature } from '../../buildings/types';

/**
 * Helper to create a synthetic BuildingFeature from a bounding rectangle.
 * Coordinates in [lon, lat] order, with a closing vertex.
 */
function makeRectBuilding(
  minLon: number,
  maxLon: number,
  minLat: number,
  maxLat: number,
): BuildingFeature {
  return {
    properties: { building: 'yes' },
    outerRing: [
      [minLon, minLat],
      [maxLon, minLat],
      [maxLon, maxLat],
      [minLon, maxLat],
      [minLon, minLat], // closing vertex
    ],
    holes: [],
  };
}

describe('DEDUP_IOU_THRESHOLD', () => {
  it('is exactly 0.3', () => {
    expect(DEDUP_IOU_THRESHOLD).toBe(0.3);
  });
});

describe('deduplicateOverture', () => {
  // Test 1: identical buildings (IoU = 1.0) → Overture removed
  it('removes Overture building identical to OSM building (IoU = 1.0)', () => {
    const osmBuilding = makeRectBuilding(0, 1, 0, 1);
    const overtureBuilding = makeRectBuilding(0, 1, 0, 1);
    const result = deduplicateOverture([osmBuilding], [overtureBuilding]);
    expect(result).toEqual([]);
  });

  // Test 2: no overlap (IoU = 0.0) → Overture passes through
  it('keeps Overture building with no OSM overlap (IoU = 0.0)', () => {
    const osmBuilding = makeRectBuilding(0, 1, 0, 1);
    const overtureBuilding = makeRectBuilding(5, 6, 5, 6);
    const result = deduplicateOverture([osmBuilding], [overtureBuilding]);
    expect(result).toEqual([overtureBuilding]);
  });

  // Test 3: partial overlap below threshold (IoU ~ 0.1) → Overture passes through
  // a = [0,1]×[0,1] area=1, b = [0.8,2]×[0,1] area=1.2
  // intersection = [0.8,1]×[0,1] = 0.2, union = 1 + 1.2 - 0.2 = 2.0, IoU = 0.1
  it('keeps Overture building with overlap below threshold (IoU ~ 0.1)', () => {
    const osmBuilding = makeRectBuilding(0, 1, 0, 1);
    const overtureBuilding = makeRectBuilding(0.8, 2, 0, 1);
    const result = deduplicateOverture([osmBuilding], [overtureBuilding]);
    expect(result).toEqual([overtureBuilding]);
  });

  // Test 4: partial overlap at threshold (IoU = 1/3 ≈ 0.333 >= 0.3) → Overture removed
  // a = [0,2]×[0,1] area=2, b = [1,3]×[0,1] area=2
  // intersection = [1,2]×[0,1] = 1, union = 2+2-1 = 3, IoU = 1/3 ≈ 0.333
  it('removes Overture building with overlap at/above threshold (IoU = 1/3)', () => {
    const osmBuilding = makeRectBuilding(0, 2, 0, 1);
    const overtureBuilding = makeRectBuilding(1, 3, 0, 1);
    const result = deduplicateOverture([osmBuilding], [overtureBuilding]);
    expect(result).toEqual([]);
  });

  // Test 5: partial overlap above threshold (IoU > 0.5) → Overture removed
  // a = [0,2]×[0,2] area=4, b = [0.5,2.5]×[0.5,2.5] area=4
  // intersection = [0.5,2]×[0.5,2] = 2.25, union = 4+4-2.25 = 5.75, IoU ≈ 0.391
  it('removes Overture building with high overlap above threshold', () => {
    const osmBuilding = makeRectBuilding(0, 2, 0, 2);
    const overtureBuilding = makeRectBuilding(0.5, 2.5, 0.5, 2.5);
    const result = deduplicateOverture([osmBuilding], [overtureBuilding]);
    expect(result).toEqual([]);
  });

  // Test 6: empty OSM list → all Overture features returned (OSM-sparse area)
  it('returns all Overture buildings when OSM list is empty', () => {
    const overture1 = makeRectBuilding(0, 1, 0, 1);
    const overture2 = makeRectBuilding(5, 6, 5, 6);
    const result = deduplicateOverture([], [overture1, overture2]);
    expect(result).toEqual([overture1, overture2]);
  });

  // Test 7: empty Overture list → returns empty array
  it('returns empty array when Overture list is empty', () => {
    const osmBuilding = makeRectBuilding(0, 1, 0, 1);
    const result = deduplicateOverture([osmBuilding], []);
    expect(result).toEqual([]);
  });

  // Test 8: multiple OSM buildings; Overture overlaps one → removed
  it('removes Overture building that overlaps one of multiple OSM buildings', () => {
    const osm1 = makeRectBuilding(0, 1, 0, 1);
    const osm2 = makeRectBuilding(10, 11, 10, 11);
    const osm3 = makeRectBuilding(20, 21, 20, 21);
    // Overture building overlaps osm2 (identical)
    const overtureBuilding = makeRectBuilding(10, 11, 10, 11);
    const result = deduplicateOverture([osm1, osm2, osm3], [overtureBuilding]);
    expect(result).toEqual([]);
  });

  // Test 9: multiple Overture buildings; only some overlap OSM → correct subset returned
  it('returns only Overture buildings that do not overlap any OSM building', () => {
    const osm1 = makeRectBuilding(0, 1, 0, 1);
    const osm2 = makeRectBuilding(10, 11, 10, 11);
    // Overture buildings: one overlaps osm1, one overlaps osm2, one is gap-fill
    const overtureOverlapsOsm1 = makeRectBuilding(0, 1, 0, 1);
    const overtureOverlapsOsm2 = makeRectBuilding(10, 11, 10, 11);
    const overtureGapFill = makeRectBuilding(50, 51, 50, 51);
    const result = deduplicateOverture(
      [osm1, osm2],
      [overtureOverlapsOsm1, overtureOverlapsOsm2, overtureGapFill],
    );
    expect(result).toEqual([overtureGapFill]);
  });

  // Test 10: slightly misaligned duplicate (realistic OSM vs Overture offset) → removed
  // OSM: [0,1]×[0,1] area=1
  // Overture: [0.05,1.05]×[0.05,1.05] area=1
  // intersection = [0.05,1]×[0.05,1] = 0.95×0.95 = 0.9025
  // union = 1 + 1 - 0.9025 = 1.0975, IoU = 0.9025/1.0975 ≈ 0.822 (>= 0.3 → removed)
  it('removes slightly misaligned Overture building (realistic offset, IoU >> 0.3)', () => {
    const osmBuilding = makeRectBuilding(0, 1, 0, 1);
    const overtureBuilding = makeRectBuilding(0.05, 1.05, 0.05, 1.05);
    const result = deduplicateOverture([osmBuilding], [overtureBuilding]);
    expect(result).toEqual([]);
  });

  // Test 11: degenerate zero-area ring → no NaN, returns 0 IoU (building passes through)
  it('handles degenerate zero-area ring without NaN (passes through)', () => {
    const osmBuilding = makeRectBuilding(0, 1, 0, 1);
    // All points at same location → zero area AABB
    const degenerate: BuildingFeature = {
      properties: { building: 'yes' },
      outerRing: [
        [5, 5],
        [5, 5],
        [5, 5],
        [5, 5],
        [5, 5],
      ],
      holes: [],
    };
    const result = deduplicateOverture([osmBuilding], [degenerate]);
    expect(result).toEqual([degenerate]);
    expect(result.length).toBe(1);
  });

  // Additional: both lists empty → returns empty array
  it('returns empty array when both OSM and Overture lists are empty', () => {
    const result = deduplicateOverture([], []);
    expect(result).toEqual([]);
  });

  // Additional: does not mutate input arrays
  it('does not mutate the input Overture array', () => {
    const osmBuilding = makeRectBuilding(0, 1, 0, 1);
    const overtureBuilding = makeRectBuilding(0, 1, 0, 1);
    const inputArray = [overtureBuilding];
    const originalLength = inputArray.length;
    deduplicateOverture([osmBuilding], inputArray);
    expect(inputArray.length).toBe(originalLength);
  });
});
