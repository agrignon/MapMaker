/**
 * Tests for clipGeometryToFootprint: Sutherland-Hodgman clipping + boundary cap generation.
 *
 * Verifies: passthrough for fully-inside geometry, discard for fully-outside,
 * correct clipping + capping when crossing 1 or 2 boundaries, and separate caps
 * for multiple disjoint features at the same boundary.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { clipGeometryToFootprint } from '../clipGeometry';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a non-indexed BufferGeometry from a flat position array. */
function makeGeo(positions: number[]): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  return geo;
}

/** Extract the flat position array from a BufferGeometry. */
function getPositions(geo: THREE.BufferGeometry): number[] {
  const attr = geo.getAttribute('position') as THREE.BufferAttribute;
  return Array.from(attr.array);
}

/** Count triangles in a BufferGeometry. */
function triCount(geo: THREE.BufferGeometry): number {
  const attr = geo.getAttribute('position') as THREE.BufferAttribute;
  return attr.count / 3;
}

/**
 * Build a closed box (12 triangles) centered at (cx, cy, cz) with given dimensions.
 * This represents a watertight solid — like a road ribbon cross-section.
 */
function makeBox(
  cx: number, cy: number, cz: number,
  sx: number, sy: number, sz: number
): number[] {
  const x0 = cx - sx / 2, x1 = cx + sx / 2;
  const y0 = cy - sy / 2, y1 = cy + sy / 2;
  const z0 = cz - sz / 2, z1 = cz + sz / 2;

  // 6 faces × 2 triangles each = 12 triangles
  // prettier-ignore
  return [
    // +Z face (top)
    x0,y0,z1,  x1,y0,z1,  x1,y1,z1,
    x0,y0,z1,  x1,y1,z1,  x0,y1,z1,
    // -Z face (bottom)
    x0,y0,z0,  x1,y1,z0,  x1,y0,z0,
    x0,y0,z0,  x0,y1,z0,  x1,y1,z0,
    // +X face (right wall)
    x1,y0,z0,  x1,y1,z0,  x1,y1,z1,
    x1,y0,z0,  x1,y1,z1,  x1,y0,z1,
    // -X face (left wall)
    x0,y0,z0,  x0,y1,z1,  x0,y1,z0,
    x0,y0,z0,  x0,y0,z1,  x0,y1,z1,
    // +Y face (north wall)
    x0,y1,z0,  x0,y1,z1,  x1,y1,z1,
    x0,y1,z0,  x1,y1,z1,  x1,y1,z0,
    // -Y face (south wall)
    x0,y0,z0,  x1,y0,z1,  x0,y0,z1,
    x0,y0,z0,  x1,y0,z0,  x1,y0,z1,
  ];
}

/**
 * Collect unique edges that lie on a clip boundary and are shared by only 1 triangle.
 * Returns the count of such open boundary edges.
 */
function countOpenBoundaryEdges(
  geo: THREE.BufferGeometry,
  halfW: number,
  halfD: number
): number {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const tris = pos.count / 3;
  const TOL = 0.01;

  const boundaries = [
    { axis: 0, value: -halfW },
    { axis: 0, value: halfW },
    { axis: 1, value: -halfD },
    { axis: 1, value: halfD },
  ];

  function round(v: number): number {
    return Math.round(v * 1e4) / 1e4;
  }
  function vk(i: number): string {
    return `${round(pos.getX(i))},${round(pos.getY(i))},${round(pos.getZ(i))}`;
  }
  function ek(a: string, b: string): string {
    return a < b ? a + '|' + b : b + '|' + a;
  }

  let totalOpen = 0;

  for (const boundary of boundaries) {
    const edgeCounts = new Map<string, number>();

    for (let t = 0; t < tris; t++) {
      const base = t * 3;
      for (let e = 0; e < 3; e++) {
        const ai = base + e;
        const bi = base + ((e + 1) % 3);
        const aCoord = boundary.axis === 0 ? pos.getX(ai) : pos.getY(ai);
        const bCoord = boundary.axis === 0 ? pos.getX(bi) : pos.getY(bi);
        if (Math.abs(aCoord - boundary.value) < TOL && Math.abs(bCoord - boundary.value) < TOL) {
          const ka = vk(ai);
          const kb = vk(bi);
          if (ka === kb) continue;
          const key = ek(ka, kb);
          edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1);
        }
      }
    }

    for (const count of edgeCounts.values()) {
      if (count === 1) totalOpen++;
    }
  }

  return totalOpen;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('clipGeometryToFootprint', () => {
  describe('passthrough and discard', () => {
    it('box fully inside footprint — geometry unchanged', () => {
      const halfW = 50;
      const halfD = 50;
      const box = makeBox(0, 0, 5, 10, 10, 4); // small box at center
      const geo = makeGeo(box);

      const result = clipGeometryToFootprint(geo, halfW, halfD);

      expect(triCount(result)).toBe(12);
      // Positions should be the same (no clipping occurred)
      const outPos = getPositions(result);
      for (let i = 0; i < box.length; i++) {
        expect(outPos[i]).toBeCloseTo(box[i], 4);
      }
    });

    it('box fully outside footprint — empty output', () => {
      const halfW = 50;
      const halfD = 50;
      // Box entirely at x = 100, well outside ±50
      const box = makeBox(100, 0, 5, 10, 10, 4);
      const geo = makeGeo(box);

      const result = clipGeometryToFootprint(geo, halfW, halfD);

      expect(triCount(result)).toBe(0);
    });
  });

  describe('single-boundary clipping with caps', () => {
    it('box crossing right boundary is clipped and capped (no open edges)', () => {
      const halfW = 50;
      const halfD = 50;
      // Box straddles x = +50 boundary: center at x=48, width 10 → spans [43, 53]
      const box = makeBox(48, 0, 5, 10, 10, 4);
      const geo = makeGeo(box);

      const result = clipGeometryToFootprint(geo, halfW, halfD);

      // Should have more triangles than original (clipping splits + caps added)
      expect(triCount(result)).toBeGreaterThan(12);
      // No open boundary edges — caps sealed the cross-section
      expect(countOpenBoundaryEdges(result, halfW, halfD)).toBe(0);
    });

    it('box crossing left boundary is clipped and capped (no open edges)', () => {
      const halfW = 50;
      const halfD = 50;
      const box = makeBox(-48, 0, 5, 10, 10, 4);
      const geo = makeGeo(box);

      const result = clipGeometryToFootprint(geo, halfW, halfD);

      expect(triCount(result)).toBeGreaterThan(12);
      expect(countOpenBoundaryEdges(result, halfW, halfD)).toBe(0);
    });

    it('box crossing south boundary is clipped and capped (no open edges)', () => {
      const halfW = 50;
      const halfD = 50;
      const box = makeBox(0, -48, 5, 10, 10, 4);
      const geo = makeGeo(box);

      const result = clipGeometryToFootprint(geo, halfW, halfD);

      expect(triCount(result)).toBeGreaterThan(12);
      expect(countOpenBoundaryEdges(result, halfW, halfD)).toBe(0);
    });
  });

  describe('corner clipping (two boundaries)', () => {
    it('box crossing corner is clipped and capped at both boundaries', () => {
      const halfW = 50;
      const halfD = 50;
      // Box at corner: straddles both x=+50 and y=+50
      const box = makeBox(48, 48, 5, 10, 10, 4);
      const geo = makeGeo(box);

      const result = clipGeometryToFootprint(geo, halfW, halfD);

      expect(triCount(result)).toBeGreaterThan(0);
      expect(countOpenBoundaryEdges(result, halfW, halfD)).toBe(0);
    });
  });

  describe('multiple disjoint features', () => {
    it('two separate boxes at the same boundary get independent caps', () => {
      const halfW = 50;
      const halfD = 50;
      // Two boxes both crossing the right boundary (x=+50) at different y
      const box1 = makeBox(48, -20, 5, 10, 10, 4);
      const box2 = makeBox(48, 20, 5, 10, 10, 4);
      const combined = [...box1, ...box2];
      const geo = makeGeo(combined);

      const result = clipGeometryToFootprint(geo, halfW, halfD);

      // Both boxes should be clipped and capped
      expect(triCount(result)).toBeGreaterThan(0);
      expect(countOpenBoundaryEdges(result, halfW, halfD)).toBe(0);
    });
  });

  describe('no cap needed', () => {
    it('box touching boundary exactly (not crossing) stays watertight', () => {
      const halfW = 50;
      const halfD = 50;
      // Box right edge exactly at x=50, fully inside
      const box = makeBox(45, 0, 5, 10, 10, 4);
      const geo = makeGeo(box);

      const result = clipGeometryToFootprint(geo, halfW, halfD);

      // Should be the same 12 triangles — no clipping needed
      expect(triCount(result)).toBe(12);
    });
  });
});
