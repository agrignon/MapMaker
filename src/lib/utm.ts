import proj4 from 'proj4';
import type { UTMCoords, BboxDimensions } from '../types/geo';

/**
 * Returns the UTM zone number (1–60) for a given longitude.
 * Formula: floor((lon + 180) / 6) + 1
 */
export function getUTMZone(longitude: number): number {
  return Math.floor((longitude + 180) / 6) + 1;
}

/**
 * Projects a WGS84 lon/lat point into UTM meter-space coordinates.
 * Uses the UTM zone derived from the longitude and the appropriate
 * hemisphere suffix for accurate projection.
 */
export function wgs84ToUTM(lon: number, lat: number): UTMCoords {
  const zone = getUTMZone(lon);
  const hemisphere: 'N' | 'S' = lat >= 0 ? 'N' : 'S';
  const projDef = `+proj=utm +zone=${zone} +datum=WGS84 +units=m +no_defs${hemisphere === 'S' ? ' +south' : ''}`;
  const [x, y] = proj4('WGS84', projDef, [lon, lat]);
  return { x, y, zone, hemisphere };
}

/**
 * Computes the real-world bounding box dimensions in meters using UTM projection.
 * Both corners are projected using the same UTM zone (derived from centroid longitude)
 * to ensure meter-space arithmetic is valid.
 */
export function bboxDimensionsMeters(
  sw: [number, number],
  ne: [number, number]
): BboxDimensions {
  const centroidLon = (sw[0] + ne[0]) / 2;
  const zone = getUTMZone(centroidLon);
  const centroidLat = (sw[1] + ne[1]) / 2;
  const hemisphere: 'N' | 'S' = centroidLat >= 0 ? 'N' : 'S';
  const projDef = `+proj=utm +zone=${zone} +datum=WGS84 +units=m +no_defs${hemisphere === 'S' ? ' +south' : ''}`;

  const [x1, y1] = proj4('WGS84', projDef, [sw[0], sw[1]]);
  const [x2, y2] = proj4('WGS84', projDef, [ne[0], ne[1]]);

  return {
    widthM: Math.abs(x2 - x1),
    heightM: Math.abs(y2 - y1),
  };
}
