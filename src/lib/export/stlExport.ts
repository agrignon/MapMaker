/**
 * Binary STL export using Three.js STLExporter.
 * Provides: exportToSTL, downloadSTL, generateFilename
 */

import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import type { BoundingBox } from '../../types/geo';

export interface STLExportResult {
  buffer: ArrayBuffer;
  sizeBytes: number;
  triangleCount: number;
}

/**
 * Export a Three.js Mesh to a binary STL ArrayBuffer.
 * Binary STL format: 80-byte header + 4-byte triangle count + 50 bytes per triangle.
 */
export function exportToSTL(mesh: THREE.Mesh): STLExportResult {
  const exporter = new STLExporter();
  const buffer = exporter.parse(mesh, { binary: true }) as ArrayBuffer;

  // Binary STL: 84-byte header (80 + 4 count bytes) + 50 bytes per triangle
  const triangleCount = (buffer.byteLength - 84) / 50;

  return {
    buffer,
    sizeBytes: buffer.byteLength,
    triangleCount,
  };
}

/**
 * Trigger a browser download of an STL file.
 */
export function downloadSTL(buffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generate a location-based filename for the STL export.
 * Uses locationName (from geocoding search) if available, otherwise falls back to coordinates.
 *
 * Examples:
 *   locationName="Mount Rainier", hasBuildings=false, hasRoads=false, hasWater=false → "mount-rainier-terrain.stl"
 *   locationName="Mount Rainier", hasBuildings=true, hasRoads=false, hasWater=false  → "mount-rainier-terrain-buildings.stl"
 *   locationName="Mount Rainier", hasBuildings=false, hasRoads=true, hasWater=false  → "mount-rainier-terrain-roads.stl"
 *   locationName="Mount Rainier", hasBuildings=true, hasRoads=true, hasWater=true    → "mount-rainier-terrain-buildings-roads-water.stl"
 *   locationName="Mount Rainier", hasVegetation=true                                → "mount-rainier-terrain-vegetation.stl"
 *   no locationName, bbox at 46.85°N 121.73°W                                       → "terrain-46.85--121.73.stl"
 */
export function generateFilename(
  bbox: BoundingBox,
  locationName: string | null,
  hasBuildings = false,
  hasRoads = false,
  hasWater = false,
  hasVegetation = false
): string {
  // Build suffix based on which layers are included
  let suffix = 'terrain';
  if (hasBuildings) suffix += '-buildings';
  if (hasRoads) suffix += '-roads';
  if (hasWater) suffix += '-water';
  if (hasVegetation) suffix += '-vegetation';

  if (locationName && locationName.trim().length > 0) {
    // Slugify: lowercase, replace non-alphanumeric with hyphens, collapse multiple hyphens
    const slug = locationName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `${slug}-${suffix}.stl`;
  }

  // Coordinate-based fallback
  const centerLat = (bbox.sw.lat + bbox.ne.lat) / 2;
  const centerLon = (bbox.sw.lon + bbox.ne.lon) / 2;

  return `${suffix}-${centerLat.toFixed(2)}-${centerLon.toFixed(2)}.stl`;
}
