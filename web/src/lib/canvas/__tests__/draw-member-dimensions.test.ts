import { describe, it, expect } from 'vitest';
import { formatDimension, memberDimensionLabels, memberDimensions } from '../draw-member-dimensions';

describe('member dimensions while drawing', () => {
  it('reports the components and the length from the first end to the second', () => {
    expect(memberDimensions({ x: 1, y: 2 }, { x: 4, y: 6 })).toEqual({ dx: 3, dz: 4, length: 5 });
  });

  it('signs a component that runs backwards, and never shows a negative zero', () => {
    expect(formatDimension(-2.5)).toBe('−2.50');
    expect(formatDimension(-0.001)).toBe('0.00');
    expect(formatDimension(0)).toBe('0.00');
  });

  it('labels the length in metres and the legs as ΔX and ΔZ', () => {
    expect(memberDimensionLabels({ x: 0, y: 0 }, { x: -3, y: 4 })).toEqual({
      length: '5.00 m', dx: 'ΔX −3.00', dz: 'ΔZ 4.00',
    });
  });
});

describe('member dimensions in the chosen units', () => {
  it('give the length and the legs in feet in imperial', () => {
    expect(memberDimensionLabels({ x: 0, y: 0 }, { x: 3, y: 4 }, 'Imperial')).toEqual({
      length: '16.40 ft', dx: 'ΔX 9.84', dz: 'ΔZ 13.12',
    });
  });
});
