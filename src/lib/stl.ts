import type { BboxMM } from '../types/geo';

/**
 * Converts a measurement from meters to millimeters.
 * 1 meter = 1000 millimeters exactly.
 */
export function metersToMillimeters(meters: number): number {
  return meters * 1000;
}

/**
 * Converts bounding box dimensions from meters to millimeters for STL export.
 * This is the final step in the coordinate pipeline before mesh generation.
 */
export function bboxToMM(widthM: number, heightM: number): BboxMM {
  return {
    widthMM: metersToMillimeters(widthM),
    heightMM: metersToMillimeters(heightM),
  };
}
