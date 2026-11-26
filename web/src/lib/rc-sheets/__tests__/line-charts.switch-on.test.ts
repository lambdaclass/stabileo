import { describe, it, expect } from 'vitest';
import { chartReach, leastPositive } from '../line-charts';

describe('how far a demand chart reaches', () => {
  it('shows the lowest stirrup zone\'s φVn stepping below the others where it is within six times the shear, the others drawn off the chart', () => {
    const reach = chartReach(67, 477, 222);
    expect(reach).toBeGreaterThan(222);
    expect(reach).toBeLessThan(477);
    expect(chartReach(67, 477, 222)).toBeCloseTo(1.1 * 222, 9);
  });

  it('keeps three times the demand where even the lowest capacity is far above it, and the capacity itself where it is near', () => {
    expect(chartReach(20, 477, 222)).toBeCloseTo(60, 9);
    expect(chartReach(100, 150, 150)).toBeCloseTo(157.5, 9);
    expect(chartReach(100, 0, Infinity)).toBeCloseTo(125, 9);
  });

  it('reads the least positive capacity, none where every one is nought or unbounded', () => {
    expect(leastPositive([0, 477, 222, Infinity, 295])).toBe(222);
    expect(leastPositive([0, Infinity])).toBe(Infinity);
  });
});
