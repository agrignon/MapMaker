// src/lib/overture/dedup.ts
import type { BuildingFeature } from '../buildings/types';

/** Axis-aligned bounding box in WGS84 degree coordinates. */
interface AABB {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

/** IoU threshold at or above which two buildings are considered duplicates. */
export const DEDUP_IOU_THRESHOLD = 0.3;

/**
 * Compute the AABB of a building outer ring in lon/lat space.
 *
 * Coordinates are [lon, lat] pairs (index 0 = longitude, index 1 = latitude).
 * Closing vertex (same as first vertex) is safe — min/max is unaffected by duplicates.
 */
function computeAABB(ring: [number, number][]): AABB {
  let minLon = Infinity,
    maxLon = -Infinity;
  let minLat = Infinity,
    maxLat = -Infinity;
  for (const [lon, lat] of ring) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLon, maxLon, minLat, maxLat };
}

/**
 * Compute Intersection over Union (IoU) of two axis-aligned bounding boxes.
 *
 * Returns 0 if the boxes do not intersect, or if either box is degenerate
 * (zero area), preventing division-by-zero / NaN propagation.
 */
function bboxIoU(a: AABB, b: AABB): number {
  // Compute intersection rectangle
  const interMinLon = Math.max(a.minLon, b.minLon);
  const interMaxLon = Math.min(a.maxLon, b.maxLon);
  const interMinLat = Math.max(a.minLat, b.minLat);
  const interMaxLat = Math.min(a.maxLat, b.maxLat);

  // No intersection
  if (interMaxLon <= interMinLon || interMaxLat <= interMinLat) return 0;

  const interArea = (interMaxLon - interMinLon) * (interMaxLat - interMinLat);
  const areaA = (a.maxLon - a.minLon) * (a.maxLat - a.minLat);
  const areaB = (b.maxLon - b.minLon) * (b.maxLat - b.minLat);
  const unionArea = areaA + areaB - interArea;

  // Guard against degenerate zero-area boxes (no NaN)
  return unionArea <= 0 ? 0 : interArea / unionArea;
}

/**
 * Remove Overture buildings that overlap existing OSM buildings via bbox IoU.
 *
 * OSM buildings are authoritative — any Overture building whose bbox overlaps
 * an OSM building bbox at IoU >= DEDUP_IOU_THRESHOLD is discarded. Overture
 * buildings with no OSM counterpart (gap-fill) pass through unchanged.
 *
 * @param osmFeatures - BuildingFeature[] from parseBuildingFeatures() (OSM source)
 * @param overtureFeatures - BuildingFeature[] from parseOvertureTiles() (Overture source)
 * @returns Filtered Overture gap-fill buildings that do NOT overlap any OSM building
 */
export function deduplicateOverture(
  osmFeatures: BuildingFeature[],
  overtureFeatures: BuildingFeature[],
): BuildingFeature[] {
  // OSM-sparse area: all Overture buildings are gap-fill, return as-is
  if (osmFeatures.length === 0) return overtureFeatures;

  // No Overture buildings to filter
  if (overtureFeatures.length === 0) return [];

  // Pre-compute OSM AABBs once to avoid repeated scans
  const osmAABBs = osmFeatures.map(f => computeAABB(f.outerRing));

  // Keep only Overture buildings that do NOT overlap any OSM building
  return overtureFeatures.filter(overtureFeature => {
    const overtureAABB = computeAABB(overtureFeature.outerRing);
    return !osmAABBs.some(osmAABB => bboxIoU(overtureAABB, osmAABB) >= DEDUP_IOU_THRESHOLD);
  });
}
