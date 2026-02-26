/**
 * Vegetation feature type definitions for MapMaker.
 * Used by the vegetation data pipeline and mesh rendering.
 */

export interface VegetationFeature {
  /** Outer boundary coordinates as [lon, lat] pairs (closed — first === last) */
  outerRing: [number, number][];
  /** Hole rings (uncommon for parks/forests but supported) */
  holes: [number, number][][];
  /** Approximate area in square meters — computed during parsing for min-area filter */
  areaM2: number;
}
