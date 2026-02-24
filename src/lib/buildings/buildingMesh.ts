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
import { buildFloorCap, buildRoofForShape } from './roof';

/**
 * Build a single building's closed solid BufferGeometry.
 *
 * Composed of:
 *   1. Floor cap (bottom face, normal pointing down)
 *   2. Walls (extruded quads from base to top, per-vertex base elevation)
 *   3. Roof cap (dispatched by roofShape: flat, gabled, hipped, or pyramidal)
 *
 * For non-flat roofs, the wall height is reduced by roofHeightMM so walls end where
 * the roof starts. If roofHeightMM >= buildingHeightMM, wall height is clamped to
 * at least 50% of buildingHeightMM.
 *
 * @param outerRingMM - Outer ring vertices in local mm space [x, y]
 * @param holesMM - Hole rings in local mm space (courtyards)
 * @param baseZmm - Per-vertex terrain base elevation in mm
 * @param buildingHeightMM - Total building height in mm (walls + roof)
 * @param roofShape - Roof shape tag ('flat', 'gabled', 'hipped', 'pyramidal')
 * @param roofHeightMM - Additional roof height in mm (0 for flat roofs)
 * @returns Merged BufferGeometry (floor + walls + roof)
 */
export function buildSingleBuilding(
  outerRingMM: [number, number][],
  holesMM: [number, number][][],
  baseZmm: number[],
  buildingHeightMM: number,
  roofShape: string,
  roofHeightMM: number
): THREE.BufferGeometry {
  // Determine wall height and effective roof height
  // For non-flat roofs: walls go up to (buildingHeightMM - roofHeightMM),
  // then roof geometry adds the remaining height.
  let wallHeightMM: number;
  let effectiveRoofHeightMM: number;

  if (roofShape === 'flat' || roofHeightMM <= 0) {
    wallHeightMM = buildingHeightMM;
    effectiveRoofHeightMM = 0;
  } else {
    // Clamp: walls must be at least 50% of total building height
    const minWallHeightMM = buildingHeightMM * 0.5;
    wallHeightMM = Math.max(minWallHeightMM, buildingHeightMM - roofHeightMM);
    effectiveRoofHeightMM = buildingHeightMM - wallHeightMM;
  }

  // Compute top Z per vertex (top of the walls, where roof begins)
  const topZmm = baseZmm.map((z) => z + wallHeightMM);

  // 1. Floor cap (bottom face, winding reversed for downward normal)
  const floorPositions = buildFloorCap(outerRingMM, baseZmm, holesMM);
  const floorGeo = new THREE.BufferGeometry();
  floorGeo.setAttribute('position', new THREE.BufferAttribute(floorPositions, 3));

  // 2. Walls (per-vertex base elevation, wall height only)
  const wallPositions = buildWalls(outerRingMM, baseZmm, wallHeightMM);
  const wallGeo = new THREE.BufferGeometry();
  wallGeo.setAttribute('position', new THREE.BufferAttribute(wallPositions, 3));

  // 3. Roof (dispatched by shape)
  const roofPositions = buildRoofForShape(roofShape, outerRingMM, topZmm, holesMM, effectiveRoofHeightMM);
  const roofGeo = new THREE.BufferGeometry();
  roofGeo.setAttribute('position', new THREE.BufferAttribute(roofPositions, 3));

  // Merge into single geometry
  const merged = mergeGeometries([floorGeo, wallGeo, roofGeo], false);
  merged.computeVertexNormals();

  return merged;
}
