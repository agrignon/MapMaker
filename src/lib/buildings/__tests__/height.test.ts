/**
 * Tests for the building height resolver.
 * Verifies the fallback cascade: height tag → levels → footprint area → type defaults.
 */

import { describe, it, expect } from 'vitest';
import { resolveHeight, resolveRoofHeight } from '../height';

describe('resolveHeight — fallback cascade', () => {
  // Tier 1: height tag
  it('returns numeric height from direct height tag', () => {
    expect(resolveHeight({ height: '12' })).toBe(12);
  });

  it('returns height from "12 m" string (ignores trailing unit text)', () => {
    expect(resolveHeight({ height: '12 m' })).toBe(12);
  });

  it('converts feet notation to meters', () => {
    const result = resolveHeight({ height: "40'" });
    expect(result).toBeCloseTo(12.19, 1);
  });

  // Tier 2: building:levels
  it('computes height from building:levels * 3.5', () => {
    expect(resolveHeight({ 'building:levels': '4' })).toBe(14);
  });

  // Tier 4: type defaults
  it('returns apartments default when only building=apartments', () => {
    expect(resolveHeight({ building: 'apartments' })).toBe(14);
  });

  it('returns 7 for generic building=yes', () => {
    expect(resolveHeight({ building: 'yes' })).toBe(7);
  });

  // Cascade priority
  it('prefers height tag over building:levels', () => {
    expect(resolveHeight({ height: '20', 'building:levels': '3' })).toBe(20);
  });

  it('falls through to levels when height tag is invalid', () => {
    expect(resolveHeight({ height: 'abc', 'building:levels': '3' })).toBe(10.5);
  });

  // Tier 3: footprint-area heuristic
  it('uses footprint-area heuristic: small area (<60m²) → 5m (shed)', () => {
    expect(resolveHeight({ building: 'yes' }, 50)).toBe(5);
  });

  it('uses footprint-area heuristic: medium area (<200m²) → 7m (house)', () => {
    expect(resolveHeight({ building: 'yes' }, 150)).toBe(7);
  });

  it('uses footprint-area heuristic: larger area (<600m²) → 10m (small commercial)', () => {
    expect(resolveHeight({ building: 'yes' }, 400)).toBe(10);
  });

  it('uses footprint-area heuristic: large area (>=600m²) → 14m (large building)', () => {
    expect(resolveHeight({ building: 'yes' }, 800)).toBe(14);
  });

  it('skips footprint-area heuristic when levels tag is present', () => {
    // levels=3 → 10.5, footprint would give 14 — levels must win
    expect(resolveHeight({ 'building:levels': '3' }, 800)).toBe(10.5);
  });
});

describe('resolveRoofHeight — shape defaults', () => {
  const wallHeight = 10;

  it('returns 0 for flat roof', () => {
    expect(resolveRoofHeight({ 'roof:shape': 'flat' }, wallHeight)).toBe(0);
  });

  it('returns wallHeight * 0.3 for gabled roof', () => {
    expect(resolveRoofHeight({ 'roof:shape': 'gabled' }, wallHeight)).toBe(3);
  });

  it('returns wallHeight * 0.3 for hipped roof', () => {
    expect(resolveRoofHeight({ 'roof:shape': 'hipped' }, wallHeight)).toBe(3);
  });

  it('returns wallHeight * 0.4 for pyramidal roof', () => {
    expect(resolveRoofHeight({ 'roof:shape': 'pyramidal' }, wallHeight)).toBe(4);
  });

  it('defaults to 0 when no roof:shape tag', () => {
    expect(resolveRoofHeight({}, wallHeight)).toBe(0);
  });

  it('uses explicit roof:height tag over shape default', () => {
    expect(resolveRoofHeight({ 'roof:shape': 'gabled', 'roof:height': '5' }, wallHeight)).toBe(5);
  });
});
