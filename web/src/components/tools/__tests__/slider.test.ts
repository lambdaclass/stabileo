import { describe, expect, it } from 'vitest';
import { widen } from '../slider';

describe('slider span', () => {
  it('keeps its span for a value inside it', () => {
    expect(widen([1, 100, 1], 40)).toEqual([1, 100, 1]);
  });
  it('grows to a round bound above a typed value, with a step that keeps it about a hundred stops', () => {
    expect(widen([1, 100, 1], 200)).toEqual([2, 200, 2]);
    expect(widen([0.5, 30, 0.1], 50)).toEqual([0.5, 50, 0.5]);
    expect(widen([0, 100, 1], 500)).toEqual([0, 500, 5]);
    expect(widen([1, 100, 1], 1e6)).toEqual([1e4, 1e6, 1e4]);
  });
  it('puts the typed value on the slider\'s own grid of stops, above zero when the span started above zero', () => {
    for (const [span, value] of [[[1, 100, 1], 200], [[1, 100, 1], 1e6], [[0.5, 30, 0.1], 50], [[10, 2000, 10], 3000], [[1, 15, 0.1], 40]] as const) {
      const [min, max, step] = widen(span, value);
      expect(min).toBeGreaterThan(0);
      expect(max).toBeGreaterThanOrEqual(value);
      expect(Math.abs((value - min) / step - Math.round((value - min) / step))).toBeLessThan(1e-9);
    }
  });
  it('reaches down to a typed value below it, and never shrinks back', () => {
    expect(widen([0.5, 30, 0.1], 0.2)).toEqual([0.2, 30, 0.1]);
    expect(widen(widen([1, 100, 1], 200), 150)).toEqual([2, 200, 2]);
    expect(widen([1, 100, 1], NaN)).toEqual([1, 100, 1]);
  });
});
