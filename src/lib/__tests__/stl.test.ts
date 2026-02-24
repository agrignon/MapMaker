import { describe, it, expect } from 'vitest';
import { metersToMillimeters, bboxToMM } from '../stl';

describe('metersToMillimeters', () => {
  it('converts 1m to 1000mm', () => {
    expect(metersToMillimeters(1)).toBe(1000);
  });
  it('converts 0 to 0', () => {
    expect(metersToMillimeters(0)).toBe(0);
  });
});

describe('bboxToMM', () => {
  it('converts 1m x 1m to 1000mm x 1000mm', () => {
    const result = bboxToMM(1.0, 1.0);
    expect(result.widthMM).toBe(1000);
    expect(result.heightMM).toBe(1000);
  });
  it('converts 2300m x 1800m correctly', () => {
    const result = bboxToMM(2300, 1800);
    expect(result.widthMM).toBe(2300000);
    expect(result.heightMM).toBe(1800000);
  });
});
