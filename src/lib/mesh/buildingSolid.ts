/**
 * CSG union module: merges building geometry with terrain solid for manifold STL export.
 *
 * Uses three-bvh-csg ADDITION operation to produce a single watertight solid from
 * terrain + buildings. Falls back to mergeGeometries if CSG fails or times out.
 *
 * PERFORMANCE NOTE: three-bvh-csg on terrain-scale meshes is potentially slow for
 * large, dense urban areas. CSG failure or timeout triggers a merge fallback that
 * may produce non-manifold edges at terrain-building seams, but is better than
 * a broken export.
 */

import * as THREE from 'three';
import { ADDITION, Brush, Evaluator } from 'three-bvh-csg';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const CSG_TIMEOUT_MS = 10_000; // 10 seconds maximum for CSG operation

/**
 * Perform a CSG union (ADDITION) of terrain and buildings geometry.
 *
 * Both geometries must be non-indexed (triangle soup) for three-bvh-csg to work correctly.
 * The terrain solid from buildSolidMesh is already non-indexed.
 * The buildings geometry from buildAllBuildings is also non-indexed.
 *
 * @param terrainGeometry - Terrain solid BufferGeometry (non-indexed, from buildSolidMesh)
 * @param buildingsGeometry - Buildings merged BufferGeometry (non-indexed, from buildAllBuildings)
 * @returns Combined manifold BufferGeometry (CSG union result)
 */
export function unionBuildingsWithTerrain(
  terrainGeometry: THREE.BufferGeometry,
  buildingsGeometry: THREE.BufferGeometry
): THREE.BufferGeometry {
  // Ensure both geometries are non-indexed for CSG
  const terrainNonIndexed = terrainGeometry.index
    ? terrainGeometry.toNonIndexed()
    : terrainGeometry;

  const buildingsNonIndexed = buildingsGeometry.index
    ? buildingsGeometry.toNonIndexed()
    : buildingsGeometry;

  // Ensure both geometries have vertex normals computed (required by three-bvh-csg Evaluator)
  // The Evaluator's default attribute list is ['position', 'uv', 'normal'] — normal must exist.
  const preparedTerrain = terrainNonIndexed.clone();
  const preparedBuildings = buildingsNonIndexed.clone();

  // Remove UV (optional) and color (not needed for CSG); keep position + normal
  for (const name of Object.keys(preparedTerrain.attributes)) {
    if (name !== 'position' && name !== 'normal') preparedTerrain.deleteAttribute(name);
  }
  for (const name of Object.keys(preparedBuildings.attributes)) {
    if (name !== 'position' && name !== 'normal') preparedBuildings.deleteAttribute(name);
  }

  // Compute vertex normals if missing (required by three-bvh-csg)
  if (!preparedTerrain.getAttribute('normal')) {
    preparedTerrain.computeVertexNormals();
  }
  if (!preparedBuildings.getAttribute('normal')) {
    preparedBuildings.computeVertexNormals();
  }

  // Create Brush objects (three-bvh-csg uses Brush as input mesh type)
  const terrainBrush = new Brush(preparedTerrain);
  const buildingsBrush = new Brush(preparedBuildings);

  // Update world matrices (required by three-bvh-csg before evaluation)
  terrainBrush.updateMatrixWorld(true);
  buildingsBrush.updateMatrixWorld(true);

  // Perform CSG union
  // Use only position + normal attributes (UV is not needed for STL export)
  // This avoids errors when geometries lack UV attributes
  const evaluator = new Evaluator();
  evaluator.attributes = ['position', 'normal'];
  const result = evaluator.evaluate(terrainBrush, buildingsBrush, ADDITION);

  if (!result || !result.geometry) {
    throw new Error('CSG evaluation returned null result');
  }

  return result.geometry;
}

/**
 * Merge terrain and buildings geometry, attempting CSG union first.
 *
 * If CSG union succeeds: returns a manifold solid (best quality).
 * If CSG fails or times out: falls back to mergeGeometries (may have non-manifold seams,
 * but is better than a broken export — most slicers auto-repair minor gaps).
 *
 * @param terrainSolid - Terrain solid BufferGeometry (from buildSolidMesh)
 * @param buildingsGeo - Buildings merged BufferGeometry (from buildAllBuildings)
 * @returns Combined BufferGeometry (CSG union or merge fallback)
 */
export function mergeTerrainAndBuildings(
  terrainSolid: THREE.BufferGeometry,
  buildingsGeo: THREE.BufferGeometry
): THREE.BufferGeometry {
  // Use a timeout check via a flag (synchronous timeout approximation)
  // three-bvh-csg is synchronous; we wrap in try/catch for error handling
  let csgResult: THREE.BufferGeometry | null = null;
  let timedOut = false;

  const startMs = Date.now();

  try {
    csgResult = unionBuildingsWithTerrain(terrainSolid, buildingsGeo);

    const elapsed = Date.now() - startMs;
    if (elapsed > CSG_TIMEOUT_MS) {
      // CSG completed but took too long — result is still valid, just log a warning
      console.warn(
        `mergeTerrainAndBuildings: CSG union took ${elapsed}ms (limit: ${CSG_TIMEOUT_MS}ms). ` +
          'Result may be slow for dense urban areas.'
      );
      timedOut = true;
    }
  } catch (err) {
    const elapsed = Date.now() - startMs;
    const reason = elapsed >= CSG_TIMEOUT_MS ? 'timeout' : String(err);
    console.warn(
      `mergeTerrainAndBuildings: CSG union failed (${reason}). ` +
        'Falling back to mergeGeometries — result may have non-manifold seams at building bases.'
    );
    csgResult = null;
  }

  // If CSG succeeded, return the result
  if (csgResult !== null) {
    if (!timedOut) {
      console.info(
        `mergeTerrainAndBuildings: CSG union complete in ${Date.now() - startMs}ms`
      );
    }
    return csgResult;
  }

  // Fallback: simple merge (non-manifold at seams but slicer-repairable)
  console.warn(
    'mergeTerrainAndBuildings: using merge fallback — result may not be fully manifold'
  );

  const terrainNonIndexed = terrainSolid.index ? terrainSolid.toNonIndexed() : terrainSolid;
  const buildingsNonIndexed = buildingsGeo.index ? buildingsGeo.toNonIndexed() : buildingsGeo;

  // Strip attributes to position + normal for safe merge
  const cleanTerrain = terrainNonIndexed.clone();
  const cleanBuildings = buildingsNonIndexed.clone();

  for (const name of Object.keys(cleanTerrain.attributes)) {
    if (name !== 'position' && name !== 'normal') cleanTerrain.deleteAttribute(name);
  }
  for (const name of Object.keys(cleanBuildings.attributes)) {
    if (name !== 'position' && name !== 'normal') cleanBuildings.deleteAttribute(name);
  }

  // Ensure normals exist for merge
  if (!cleanTerrain.getAttribute('normal')) cleanTerrain.computeVertexNormals();
  if (!cleanBuildings.getAttribute('normal')) cleanBuildings.computeVertexNormals();

  const merged = mergeGeometries([cleanTerrain, cleanBuildings], false);
  if (!merged) {
    throw new Error('mergeTerrainAndBuildings: mergeGeometries fallback also failed');
  }

  merged.computeVertexNormals();
  return merged;
}
