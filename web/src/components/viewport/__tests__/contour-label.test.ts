import { expect, it } from 'vitest';
import { formatContourLabel } from '../contour-label';

it('distinguishes and orders small nonzero ticks', () => {
  for (const bands of [0, 4, 8]) {
    const intervals = bands || 2;
    const values = Array.from({ length: intervals + 1 }, (_, i) => 0.016 * i / intervals);
    const labels = values.map(value => formatContourLabel(value, 0, 0.016, bands));
    expect(new Set(labels).size).toBe(values.length);
    labels.forEach((label, i) => expect(Number(label)).toBeCloseTo(values[i], 6));
    expect(labels.slice(1).every((label, i) => Number(label) > Number(labels[i]))).toBe(true);
  }
});

it('preserves ordinary contour formatting', () => {
  expect([0, 50, 100].map(v => formatContourLabel(v, 0, 100))).toEqual(['0', '50.0', '100']);
  expect(formatContourLabel(10000, 0, 10000)).toBe('1.0e+4');
  expect(formatContourLabel(-50, -100, 100)).toBe('-50.0');
});
