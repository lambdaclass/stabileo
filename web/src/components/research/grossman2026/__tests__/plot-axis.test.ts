import { expect, it } from 'vitest';
import { axis, tableValue } from '../plot-axis';

it.each([0.01, 0.1, 1, 10])('preserves quarter-step ticks at scale %s', scale => {
  const { ticks, decimals } = axis(-0.25 * scale, 1 * scale, true);
  expect(ticks).toHaveLength(6);
  expect(ticks.map(value => Number(value.toFixed(decimals)))).toEqual(ticks);
});
it('renders quarter ticks without rounding to tenths', () => {
  const { ticks, decimals } = axis(-0.25, 1, true);
  expect(ticks.map(value => value.toFixed(decimals))).toEqual(['-0.25', '0.00', '0.25', '0.50', '0.75', '1.00']);
});

it('keeps small nonzero table values distinct from zero', () => {
  expect(tableValue(0.00003, 'en')).toBe('3E-5');
  expect(tableValue(-0.000012345, 'en')).toBe('−1.2345E-5');
  expect(tableValue(0.5, 'es')).toBe('0,5');
  expect(tableValue(1e-14, 'en')).toBe('0');
});
