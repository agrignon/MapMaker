/**
 * Water feature type definitions for MapMaker.
 * Used by the water data pipeline and depression algorithm.
 */

export interface WaterFeature {
  /** Outer boundary coordinates as [lon, lat] pairs (closed — first === last) */
  outerRing: [number, number][];
  /** Hole rings for islands within the water body */
  holes: [number, number][][];
}
