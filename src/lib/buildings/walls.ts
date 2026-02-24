/**
 * Building wall construction with per-vertex base elevation.
 *
 * Creates extruded wall quads for each edge of a building ring.
 * Each vertex has its own base elevation (sampled from terrain) so
 * buildings naturally follow terrain slopes (BLDG-04).
 *
 * Winding convention:
 *   - OSM outer rings may be CW or CCW after UTM projection
 *   - We detect winding using signed area and ensure outward normals
 *   - For outward-facing walls (normals pointing away from interior),
 *     we need CCW winding when viewed from outside the building
 */

/**
 * Compute the signed area of a 2D polygon ring using the shoelace formula.
 *
 * Result interpretation:
 *   - Negative: CCW winding (standard math orientation)
 *   - Positive: CW winding (screen-space / OSM convention)
 *
 * The absolute value gives the area in the same units as the coordinates.
 *
 * @param ring - Ring vertices as [x, y] pairs
 * @returns Signed area (half the shoelace sum)
 */
export function computeSignedArea(ring: [number, number][]): number {
  let area = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % n];
    area += (x0 * y1 - x1 * y0);
  }
  return area / 2;
}

/**
 * Build wall geometry for a building ring.
 *
 * Creates one quad (2 triangles, 6 vertices) per ring edge.
 * Each vertex pair (base, top) uses the terrain elevation of that corner.
 *
 * Winding: The ring is reversed if it's CW (positive signed area) so that
 * walls face outward. Each quad uses CCW vertex order for outward normals
 * in Three.js (default front face: CCW).
 *
 * Vertex layout per quad (A=bottom-left, B=bottom-right, C=top-right, D=top-left):
 *   Triangle 1: A, B, C (CCW when viewed from outside)
 *   Triangle 2: A, C, D (CCW when viewed from outside)
 *
 * @param ringXY - Ring vertices in local mm space [x, y]
 * @param baseZmm - Per-vertex terrain base elevation in mm (length = ringXY.length)
 * @param buildingHeightMM - Building wall height in mm (same for all vertices of a building)
 * @returns Float32Array of positions: (n_segments * 6 vertices * 3 coords) floats
 */
export function buildWalls(
  ringXY: [number, number][],
  baseZmm: number[],
  buildingHeightMM: number
): Float32Array {
  // Detect winding: positive signed area = CW, needs reversal for outward normals
  const signedArea = computeSignedArea(ringXY);

  let workRing = ringXY;
  let workBase = baseZmm;

  if (signedArea < 0) {
    // CW ring (negative area in Y-up/UTM space) — reverse to make CCW for outward-facing walls
    workRing = [...ringXY].reverse();
    workBase = [...baseZmm].reverse();
  }

  const n = workRing.length;
  // n unique vertices = n edges (wraps around: last vertex connects back to first)
  const segCount = n;

  // 6 vertices per segment (2 triangles), 3 coords per vertex
  const positions = new Float32Array(segCount * 6 * 3);
  let offset = 0;

  for (let i = 0; i < segCount; i++) {
    const j = (i + 1) % n;

    const [x0, y0] = workRing[i];
    const [x1, y1] = workRing[j];
    const z0base = workBase[i];
    const z1base = workBase[j];
    const z0top = z0base + buildingHeightMM;
    const z1top = z1base + buildingHeightMM;

    // Bottom-left (A): vertex i at base
    // Bottom-right (B): vertex j at base
    // Top-right (C): vertex j at top
    // Top-left (D): vertex i at top

    // Triangle 1: A, B, C
    positions[offset++] = x0; positions[offset++] = y0; positions[offset++] = z0base; // A
    positions[offset++] = x1; positions[offset++] = y1; positions[offset++] = z1base; // B
    positions[offset++] = x1; positions[offset++] = y1; positions[offset++] = z1top;  // C

    // Triangle 2: A, C, D
    positions[offset++] = x0; positions[offset++] = y0; positions[offset++] = z0base; // A
    positions[offset++] = x1; positions[offset++] = y1; positions[offset++] = z1top;  // C
    positions[offset++] = x0; positions[offset++] = y0; positions[offset++] = z0top;  // D
  }

  return positions;
}
