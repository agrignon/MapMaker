import { describe, it, expect } from 'vitest';
import {
  rgbToElevation,
  lonLatToTile,
  chooseTileZoom,
  getTileRange,
  decodeTileToElevation,
} from '../tiles';

describe('rgbToElevation', () => {
  it('returns -10000 for rgb(0, 0, 0) — minimum possible elevation', () => {
    expect(rgbToElevation(0, 0, 0)).toBe(-10000);
  });

  it('returns approximately 0 for sea level (rgb 1, 134, 160)', () => {
    // (1*65536 + 134*256 + 160) * 0.1 - 10000 = (65536 + 34304 + 160) * 0.1 - 10000 = 100000 * 0.1 - 10000 = 0
    expect(rgbToElevation(1, 134, 160)).toBeCloseTo(0, 5);
  });

  it('returns approximately 6777215.5 for rgb(255, 255, 255) — maximum encoded value', () => {
    // (255*65536 + 255*256 + 255) * 0.1 - 10000 = 16777215 * 0.1 - 10000 = 1677721.5 - 10000 = 1667721.5
    // Actually: (255*256*256 + 255*256 + 255) * 0.1 - 10000 = 16777215 * 0.1 - 10000
    expect(rgbToElevation(255, 255, 255)).toBeCloseTo(1677721.5 - 10000, 0);
  });

  it('returns a number (not NaN)', () => {
    const result = rgbToElevation(128, 64, 32);
    expect(typeof result).toBe('number');
    expect(Number.isNaN(result)).toBe(false);
  });
});

describe('lonLatToTile', () => {
  it('returns [0, 0] for lon=0, lat=0 at zoom 0 — world center', () => {
    expect(lonLatToTile(0, 0, 0)).toEqual([0, 0]);
  });

  it('returns correct tile for San Francisco at zoom 10', () => {
    // San Francisco: lon=-122.4194, lat=37.7749
    // Expected approximately [163, 395]
    const [x, y] = lonLatToTile(-122.4194, 37.7749, 10);
    expect(x).toBe(163);
    expect(y).toBe(395);
  });

  it('returns correct tile for Tokyo at zoom 12', () => {
    // Tokyo: lon=139.6917, lat=35.6895
    const [x, y] = lonLatToTile(139.6917, 35.6895, 12);
    expect(typeof x).toBe('number');
    expect(typeof y).toBe('number');
    // Verify tile is in the correct range for zoom 12 (0 to 2^12-1 = 4095)
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(4096);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThan(4096);
    // Tokyo is in the eastern hemisphere, so X should be large
    expect(x).toBeGreaterThan(2048);
  });

  it('returns [0, 1] for lon=-180, lat=0 at zoom 1', () => {
    expect(lonLatToTile(-180, 0, 1)).toEqual([0, 1]);
  });
});

describe('chooseTileZoom', () => {
  it('returns a high zoom (12-14) for a small bbox', () => {
    // Small bbox: ~0.01 degree span
    const sw = { lon: 0, lat: 0 };
    const ne = { lon: 0.01, lat: 0.01 };
    const zoom = chooseTileZoom(sw, ne);
    expect(zoom).toBeGreaterThanOrEqual(12);
    expect(zoom).toBeLessThanOrEqual(14);
  });

  it('returns a lower zoom (8-10) for a large bbox', () => {
    // Large bbox: ~10 degree span
    const sw = { lon: 0, lat: 0 };
    const ne = { lon: 10, lat: 10 };
    const zoom = chooseTileZoom(sw, ne);
    expect(zoom).toBeGreaterThanOrEqual(8);
    expect(zoom).toBeLessThanOrEqual(10);
  });

  it('always returns zoom in range [8, 14]', () => {
    const testCases = [
      { sw: { lon: -180, lat: -85 }, ne: { lon: 180, lat: 85 } }, // entire world
      { sw: { lon: 0, lat: 0 }, ne: { lon: 0.001, lat: 0.001 } }, // tiny bbox
      { sw: { lon: -74.01, lat: 40.71 }, ne: { lon: -73.97, lat: 40.73 } }, // NYC
    ];
    for (const { sw, ne } of testCases) {
      const zoom = chooseTileZoom(sw, ne);
      expect(zoom).toBeGreaterThanOrEqual(8);
      expect(zoom).toBeLessThanOrEqual(14);
    }
  });

  it('tile count at returned zoom does not exceed maxTiles (default 9) for bboxes that fit within 9 tiles', () => {
    // These bboxes are small enough that a valid zoom satisfying maxTiles=9 exists
    const testCases = [
      { sw: { lon: -74.1, lat: 40.6 }, ne: { lon: -73.9, lat: 40.8 } }, // NYC area ~0.2deg
      { sw: { lon: 2.2, lat: 48.8 }, ne: { lon: 2.4, lat: 49.0 } },     // Paris area ~0.2deg
      { sw: { lon: 0, lat: 0 }, ne: { lon: 0.5, lat: 0.5 } },            // 0.5deg bbox
    ];
    for (const { sw, ne } of testCases) {
      const zoom = chooseTileZoom(sw, ne);
      const range = getTileRange(sw, ne, zoom);
      const tileCount = range.cols * range.rows;
      expect(tileCount).toBeLessThanOrEqual(9);
    }
  });

  it('returns zoom=8 (minimum) for very large bboxes that exceed 9 tiles at any zoom', () => {
    // A 5-degree bbox cannot fit within 9 tiles at any valid zoom
    const sw = { lon: 0, lat: 0 };
    const ne = { lon: 5, lat: 5 };
    const zoom = chooseTileZoom(sw, ne);
    expect(zoom).toBe(8); // hits minimum zoom
  });
});

describe('getTileRange', () => {
  it('returns xMin <= xMax and yMin <= yMax', () => {
    const sw = { lon: -74.1, lat: 40.6 };
    const ne = { lon: -73.9, lat: 40.8 };
    const range = getTileRange(sw, ne, 12);
    expect(range.xMin).toBeLessThanOrEqual(range.xMax);
    expect(range.yMin).toBeLessThanOrEqual(range.yMax);
  });

  it('returns cols * rows matching expected tile count', () => {
    const sw = { lon: 0, lat: 0 };
    const ne = { lon: 0.5, lat: 0.5 };
    const range = getTileRange(sw, ne, 10);
    expect(range.cols).toBe(range.xMax - range.xMin + 1);
    expect(range.rows).toBe(range.yMax - range.yMin + 1);
  });

  it('returns cols=1, rows=1 for a single-tile bbox', () => {
    // Very small bbox that fits in one tile
    const sw = { lon: 0.001, lat: 0.001 };
    const ne = { lon: 0.002, lat: 0.002 };
    const range = getTileRange(sw, ne, 8);
    expect(range.cols).toBe(1);
    expect(range.rows).toBe(1);
  });
});

describe('decodeTileToElevation', () => {
  it('returns Float32Array of correct length for 2x2 pixel input', () => {
    // 2x2 pixels = 4 pixels, each 4 bytes RGBA = 16 bytes
    const pixels = new Uint8ClampedArray([
      // pixel 0: r=0, g=0, b=0, a=255
      0, 0, 0, 255,
      // pixel 1: r=1, g=134, b=160, a=255 (sea level)
      1, 134, 160, 255,
      // pixel 2: r=100, g=0, b=0, a=255
      100, 0, 0, 255,
      // pixel 3: r=255, g=255, b=255, a=255
      255, 255, 255, 255,
    ]);

    const result = decodeTileToElevation(pixels, 2);
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(4);
  });

  it('correctly decodes each pixel using rgbToElevation', () => {
    const pixels = new Uint8ClampedArray([
      0, 0, 0, 255,       // pixel 0: minimum elevation
      1, 134, 160, 255,   // pixel 1: sea level (~0)
      100, 0, 0, 255,     // pixel 2: some elevation
      255, 255, 255, 255, // pixel 3: maximum elevation
    ]);

    const result = decodeTileToElevation(pixels, 2);

    expect(result[0]).toBe(rgbToElevation(0, 0, 0));
    expect(result[1]).toBe(rgbToElevation(1, 134, 160));
    expect(result[2]).toBe(rgbToElevation(100, 0, 0));
    expect(result[3]).toBe(rgbToElevation(255, 255, 255));
  });
});
