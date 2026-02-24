/**
 * Building height resolver with fallback cascade.
 *
 * Height resolution order (BLDG-03):
 *   1. height tag (with unit handling: meters and feet)
 *   2. building:levels * 3.5 meters per level
 *   3. Footprint-area heuristic (requires footprintAreaM2 argument)
 *   4. Building type defaults
 *
 * This module never returns NaN or undefined — always returns a positive number.
 */

/** Building type defaults in meters */
const BUILDING_TYPE_DEFAULTS: Record<string, number> = {
  house: 7,
  residential: 7,
  apartments: 14,
  commercial: 8,
  industrial: 6,
  church: 12,
  school: 9,
  yes: 7,
};

/** Default fallback if all other methods fail */
const ULTIMATE_FALLBACK_M = 7;

/**
 * Parse a height string, handling unit suffixes.
 *
 * Supports:
 *   - Plain numbers: "12" → 12
 *   - Meters with space: "12 m" → 12
 *   - Feet: "40'" → 12.19 (40 * 0.3048)
 *
 * Returns NaN if parsing fails or result is <= 0.
 */
function parseHeightString(value: string): number {
  const trimmed = value.trim();

  // Check for feet notation (ends with ')
  if (trimmed.endsWith("'")) {
    const feet = parseFloat(trimmed);
    if (!isNaN(feet) && feet > 0) {
      return feet * 0.3048;
    }
    return NaN;
  }

  // Otherwise parse as float (handles "12", "12 m", "12.5 m", etc.)
  const meters = parseFloat(trimmed);
  if (!isNaN(meters) && meters > 0) {
    return meters;
  }

  return NaN;
}

/**
 * Footprint-area heuristic for height estimation (BLDG-03 tier 3).
 *
 * Area thresholds:
 *   < 60 m²   → 5m  (shed/garage)
 *   < 200 m²  → 7m  (house)
 *   < 600 m²  → 10m (small commercial)
 *   >= 600 m² → 14m (large building)
 */
function heightFromFootprintArea(areaM2: number): number {
  if (areaM2 < 60) return 5;
  if (areaM2 < 200) return 7;
  if (areaM2 < 600) return 10;
  return 14;
}

/**
 * Resolve building height in meters using the fallback cascade.
 *
 * @param properties - OSM tag properties for the building
 * @param footprintAreaM2 - Optional footprint area in square meters (UTM-projected)
 * @returns Building height in meters (always a positive finite number)
 */
export function resolveHeight(
  properties: Record<string, string | undefined>,
  footprintAreaM2?: number
): number {
  // Tier 1: height tag
  const heightTag = properties['height'];
  if (heightTag) {
    const h = parseHeightString(heightTag);
    if (!isNaN(h)) return h;
  }

  // Tier 2: building:levels * 3.5
  const levelsTag = properties['building:levels'];
  if (levelsTag) {
    const levels = parseInt(levelsTag, 10);
    if (!isNaN(levels) && levels > 0) {
      return levels * 3.5;
    }
  }

  // Tier 3: footprint-area heuristic (BLDG-03)
  if (footprintAreaM2 !== undefined && footprintAreaM2 > 0) {
    return heightFromFootprintArea(footprintAreaM2);
  }

  // Tier 4: building type defaults
  const buildingType = properties['building'];
  if (buildingType && buildingType in BUILDING_TYPE_DEFAULTS) {
    return BUILDING_TYPE_DEFAULTS[buildingType];
  }

  // Ultimate fallback
  return ULTIMATE_FALLBACK_M;
}

/**
 * Resolve roof height in meters based on roof shape and wall height.
 *
 * @param properties - OSM tag properties for the building
 * @param wallHeight - Wall/eave height in meters
 * @returns Roof height in meters (0 for flat roofs)
 */
export function resolveRoofHeight(
  properties: Record<string, string | undefined>,
  wallHeight: number
): number {
  // Explicit roof:height tag takes precedence
  const roofHeightTag = properties['roof:height'];
  if (roofHeightTag) {
    const rh = parseFloat(roofHeightTag);
    if (!isNaN(rh) && rh >= 0) return rh;
  }

  const roofShape = (properties['roof:shape'] ?? 'flat').toLowerCase();

  switch (roofShape) {
    case 'flat':
      return 0;
    case 'gabled':
      return wallHeight * 0.3;
    case 'hipped':
      return wallHeight * 0.3;
    case 'pyramidal':
      return wallHeight * 0.4;
    default:
      return 0;
  }
}
