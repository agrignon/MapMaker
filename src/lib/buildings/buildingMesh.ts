/**
 * Single building BufferGeometry composer.
 *
 * Composes floor cap + walls + roof into a single closed solid BufferGeometry.
 * All coordinates are in local mm space (centered, scaled) — coordinate projection
 * happens upstream in merge.ts.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildWalls } from './walls';
import { buildFlatRoof, buildFloorCap } from './roof';

/**
 * Build a single building's closed solid BufferGeometry.
 *
 * Composed of:
 *   1. Floor cap (bottom face, normal pointing down)
 *   2. Walls (extruded quads from base to top, per-vertex base elevation)
 *   3. Roof cap (top face, normal pointing up — flat for this plan)
 *
 * For Plan 01 only flat roofs are supported. Gabled/hipped/pyramidal support
 * will be added in Plan 02.
 *
 * @param outerRingMM - Outer ring vertices in local mm space [x, y]
 * @param holesMM - Hole rings in local mm space (courtyards)
 * @param baseZmm - Per-vertex terrain base elevation in mm
 * @param buildingHeightMM - Wall height in mm (same value applied to all vertices)
 * @param roofShape - Roof shape tag (only 'flat' implemented here)
 * @param roofHeightMM - Additional roof height in mm (0 for flat roofs)
 * @returns Merged BufferGeometry (floor + walls + roof)
 */
export function buildSingleBuilding(
  outerRingMM: [number, number][],
  holesMM: [number, number][][],
  baseZmm: number[],
  buildingHeightMM: number,
  roofShape: string,
  _roofHeightMM: number
): THREE.BufferGeometry {
  // Compute top Z per vertex
  const topZmm = baseZmm.map((z) => z + buildingHeightMM);

  // 1. Floor cap (bottom face, winding reversed for downward normal)
  const floorPositions = buildFloorCap(outerRingMM, baseZmm, holesMM);
  const floorGeo = new THREE.BufferGeometry();
  floorGeo.setAttribute('position', new THREE.BufferAttribute(floorPositions, 3));

  // 2. Walls (per-vertex base elevation)
  const wallPositions = buildWalls(outerRingMM, baseZmm, buildingHeightMM);
  const wallGeo = new THREE.BufferGeometry();
  wallGeo.setAttribute('position', new THREE.BufferAttribute(wallPositions, 3));

  // 3. Roof cap (flat for Plan 01; other shapes added in Plan 02)
  // For non-flat roofs in future plans, this will call buildGabledRoof etc.
  const roofPositions = buildFlatRoof(outerRingMM, topZmm, holesMM);
  const roofGeo = new THREE.BufferGeometry();
  roofGeo.setAttribute('position', new THREE.BufferAttribute(roofPositions, 3));

  // Suppress unused variable warning (roofShape will be used in Plan 02)
  void roofShape;

  // Merge into single geometry
  const merged = mergeGeometries([floorGeo, wallGeo, roofGeo], false);
  merged.computeVertexNormals();

  return merged;
}
