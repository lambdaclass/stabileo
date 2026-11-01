import { expect, it } from 'vitest';
import { forceLegend, forceScale } from '../force-display';

it('uses signed strain normalization and describes compression correctly', () => {
  expect(-0.02 * forceScale(-0.01)).toBe(2);
  expect(0.02 * forceScale(0.01)).toBe(2);
  expect(forceLegend(-0.01)).toContain('compression positive');
  expect(forceLegend(-0.01)).toContain('compressed');
  expect(forceLegend(0.01)).toContain('pulled');
  expect(forceScale(0)).toBe(1);
  expect(forceLegend(0)).toContain('zero imposed strain');
});
