import { describe, it, expect } from 'vitest';
import { formatDimension, memberDimensionLabel, memberDimensions } from '../draw-member-dimensions';

describe('member dimensions while drawing', () => {
  it('reports the components and the length from the first end to the second', () => {
    expect(memberDimensions({ x: 1, y: 2 }, { x: 4, y: 6 })).toEqual({ dx: 3, dz: 4, length: 5 });
  });

  it('signs a component that runs backwards, and never shows a negative zero', () => {
    expect(formatDimension(-2.5)).toBe('−2.50');
    expect(formatDimension(-0.001)).toBe('0.00');
    expect(formatDimension(0)).toBe('0.00');
  });

  it('reads ΔX, ΔZ and L on one line, in metres', () => {
    expect(memberDimensionLabel({ x: 0, y: 0 }, { x: -3, y: 4 })).toBe('ΔX −3.00   ΔZ 4.00   L 5.00 m');
  });
});
