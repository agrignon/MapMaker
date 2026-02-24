import { describe, it, expect } from 'vitest';
import { getUTMZone, wgs84ToUTM, bboxDimensionsMeters } from '../utm';

describe('getUTMZone', () => {
  it('returns zone 18 for NYC longitude (-74)', () => {
    expect(getUTMZone(-74.006)).toBe(18);
  });
  it('returns zone 31 for Paris longitude (2.35)', () => {
    expect(getUTMZone(2.3522)).toBe(31);
  });
  it('returns zone 1 for longitude -177', () => {
    expect(getUTMZone(-177)).toBe(1);
  });
  it('returns zone 60 for longitude 177', () => {
    expect(getUTMZone(177)).toBe(60);
  });
});

describe('wgs84ToUTM', () => {
  it('returns coordinates in the correct UTM zone', () => {
    const result = wgs84ToUTM(-74.006, 40.7128);
    expect(result.zone).toBe(18);
  });
  it('sets hemisphere N for positive latitude', () => {
    const result = wgs84ToUTM(0, 45);
    expect(result.hemisphere).toBe('N');
  });
  it('sets hemisphere S for negative latitude', () => {
    const result = wgs84ToUTM(0, -45);
    expect(result.hemisphere).toBe('S');
  });
});

describe('bboxDimensionsMeters', () => {
  it('computes ~85km width and ~111km height for 1-degree bbox at NYC latitude', () => {
    const sw: [number, number] = [-74.006, 40.712];
    const ne: [number, number] = [-73.006, 41.712];
    const { widthM, heightM } = bboxDimensionsMeters(sw, ne);
    // 1 degree longitude at 40.7°N ≈ 85,394m; 1 degree latitude ≈ 111,320m
    expect(widthM).toBeGreaterThan(80000);
    expect(widthM).toBeLessThan(90000);
    expect(heightM).toBeGreaterThan(108000);
    expect(heightM).toBeLessThan(115000);
  });
  it('gives roughly symmetric dimensions for a 1x1 degree box near equator', () => {
    // 1° longitude ≈ 1° latitude ≈ 111km at the equator — dimensions should be close
    const sw: [number, number] = [-0.5, -0.5];
    const ne: [number, number] = [0.5, 0.5];
    const { widthM, heightM } = bboxDimensionsMeters(sw, ne);
    expect(Math.abs(widthM - heightM)).toBeLessThan(5000);
  });
  it('handles southern hemisphere correctly', () => {
    const sw: [number, number] = [151.1, -33.9];
    const ne: [number, number] = [151.3, -33.7];
    const { widthM, heightM } = bboxDimensionsMeters(sw, ne);
    expect(widthM).toBeGreaterThan(10000);
    expect(heightM).toBeGreaterThan(20000);
  });
});
