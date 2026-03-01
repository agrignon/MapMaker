/**
 * Overture MVT tile parser.
 *
 * Decodes raw Overture MVT tiles (ArrayBuffers produced by fetchOvertureTiles)
 * into BuildingFeature[] compatible with the existing buildings pipeline
 * (buildAllBuildings / buildSingleBuilding).
 *
 * Pipeline:
 *   1. Iterate tiles: decode each ArrayBuffer via VectorTile + Pbf
 *   2. Extract "building" layer features
 *   3. For each feature: call toGeoJSON, map Overture properties to OSM-style keys
 *   4. Flatten MultiPolygon into individual polygons
 *   5. Normalize outer ring winding to CCW (toGeoJSON produces CW outer rings)
 *   6. Filter out ML artifacts with area < 15 m²
 *   7. Return flat BuildingFeature[]
 *
 * IMPORTANT — toGeoJSON arg order:
 *   Tile key is stored as "z/x/y". Call toGeoJSON(x, y, z) — x first, z last.
 *
 * IMPORTANT — winding:
 *   toGeoJSON consistently produces CW outer rings (negative shoelace area).
 *   OSM pipeline expects CCW. Normalize before creating BuildingFeature.
 *   Hole rings from toGeoJSON are already CCW; no normalization needed.
 */

import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
import type { BuildingFeature } from '../buildings/types';
import { computeSignedArea } from '../buildings/walls';
import { computeFootprintAreaM2 } from '../buildings/merge';
import { OVERTURE_BUILDING_LAYER } from './constants';

/** Features below this threshold are ML artifacts (kiosks, sheds, rooftop equipment). */
const OVERTURE_MIN_AREA_M2 = 15;

type GeoJSONPosition = [number, number];
type GeoJSONRing = GeoJSONPosition[];

/** Overture MVT feature properties: numbers, strings, or booleans. */
type OvertureVtProps = Record<string, number | string | boolean>;

/**
 * Map Overture MVT property names to OSM-style keys used by resolveHeight().
 *
 * Overture → OSM mapping:
 *   height (float64)     → 'height'
 *   num_floors (int32)   → 'building:levels'
 *   roof_shape (string)  → 'roof:shape'
 *   roof_height (float64)→ 'roof:height'
 *
 * Always sets building='yes' so the resolveHeight fallback cascade fires.
 */
function mapOvertureProperties(
  vtProps: OvertureVtProps,
): Record<string, string | undefined> {
  const props: Record<string, string | undefined> = {};

  if (typeof vtProps.height === 'number') {
    props['height'] = String(vtProps.height);
  }
  if (typeof vtProps.num_floors === 'number') {
    props['building:levels'] = String(vtProps.num_floors);
  }
  if (typeof vtProps.roof_shape === 'string') {
    props['roof:shape'] = vtProps.roof_shape;
  }
  if (typeof vtProps.roof_height === 'number') {
    props['roof:height'] = String(vtProps.roof_height);
  }

  // Always set building=yes so resolveHeight fallback cascade works.
  // Overture features have no 'building' tag; height.ts uses it for the
  // building-type default and the ultimate area-heuristic fallback.
  props['building'] = 'yes';

  return props;
}

/**
 * Normalize a GeoJSON outer ring to CCW winding.
 *
 * toGeoJSON() consistently produces CW outer rings in lon/lat (negative shoelace area).
 * The buildings pipeline (earcut in triangulateFootprint) requires CCW outer rings
 * to produce correct outward face normals on floor and roof caps.
 *
 * If signedArea < 0 (CW), reverse to CCW.
 * If signedArea >= 0 (already CCW), leave unchanged.
 */
function normalizeOuterRing(ring: GeoJSONRing): GeoJSONRing {
  return computeSignedArea(ring as [number, number][]) < 0
    ? [...ring].reverse()
    : ring;
}

/**
 * Convert one GeoJSON polygon coordinate array to a BuildingFeature.
 *
 * @param coords - [outerRing, ...holeRings] from GeoJSON Polygon.coordinates
 * @param properties - Mapped OSM-style properties
 * @returns BuildingFeature or null if degenerate/below area threshold
 */
function polygonToBuilding(
  coords: GeoJSONRing[],
  properties: Record<string, string | undefined>,
): BuildingFeature | null {
  const [rawOuter, ...rawHoles] = coords;

  // toGeoJSON returns closed rings [A,B,C,D,A].
  // merge.ts stripClosingVertex handles the closing vertex downstream.
  // Minimum for a valid closed ring: 4 coordinates (3 unique + closing vertex).
  if (!rawOuter || rawOuter.length < 4) return null;

  // Normalize outer ring winding to CCW (required by earcut / triangulateFootprint)
  const outer = normalizeOuterRing(rawOuter) as [number, number][];

  // Area filter: discard ML artifacts below 15 m²
  // computeFootprintAreaM2 uses Math.abs internally, safe on both CW and CCW rings.
  const areaM2 = computeFootprintAreaM2(outer);
  if (areaM2 < OVERTURE_MIN_AREA_M2) return null;

  // Filter hole rings with < 4 coordinates (degenerate holes are skipped silently)
  const holes: [number, number][][] = rawHoles
    .filter((ring) => ring.length >= 4)
    .map((ring) => ring as [number, number][]);

  return { properties, outerRing: outer, holes };
}

/**
 * Parse Overture MVT tiles into BuildingFeature format.
 *
 * Decodes each tile in the map, extracts the "building" layer, converts
 * features to BuildingFeature[], and returns the flat accumulated array.
 *
 * @param tiles - Map<"z/x/y", ArrayBuffer> from fetchOvertureTiles()
 * @returns Flat array of BuildingFeature compatible with buildAllBuildings()
 */
export function parseOvertureTiles(
  tiles: Map<string, ArrayBuffer>,
): BuildingFeature[] {
  const features: BuildingFeature[] = [];

  for (const [tileKey, buffer] of tiles) {
    // Parse tile key: format is "z/x/y"
    // toGeoJSON arg order is (x, y, z) — NOT the same order as the key
    const [zStr, xStr, yStr] = tileKey.split('/');
    const z = parseInt(zStr, 10);
    const x = parseInt(xStr, 10);
    const y = parseInt(yStr, 10);

    // Create a fresh Pbf per tile — Pbf is stateful (cursor position)
    const pbf = new Pbf(buffer);
    const tile = new VectorTile(pbf);
    const layer = tile.layers[OVERTURE_BUILDING_LAYER];
    if (!layer) continue;

    for (let i = 0; i < layer.length; i++) {
      const vtFeature = layer.feature(i);
      // toGeoJSON(x, y, z): x first, z last — note the key is "z/x/y"
      const geoJSON = vtFeature.toGeoJSON(x, y, z);
      const properties = mapOvertureProperties(
        vtFeature.properties as OvertureVtProps,
      );
      const geometry = geoJSON.geometry;

      if (geometry.type === 'Polygon') {
        const building = polygonToBuilding(
          geometry.coordinates as GeoJSONRing[],
          properties,
        );
        if (building) features.push(building);
      } else if (geometry.type === 'MultiPolygon') {
        // Flatten: one BuildingFeature per sub-polygon (campus clusters, transit stations)
        for (const polygonCoords of geometry.coordinates) {
          const building = polygonToBuilding(
            polygonCoords as GeoJSONRing[],
            properties,
          );
          if (building) features.push(building);
        }
      }
      // Other geometry types (Point, LineString) are silently skipped
    }
  }

  return features;
}
