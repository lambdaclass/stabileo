import { expect, it } from 'vitest';
import { axialPaintLabel, axialPaintRange } from '../axial-paint';

it('retains both signs below the first fixed display digit', () => {
  const range = axialPaintRange({ minValue: -0.001, maxValue: 0.002 });
  expect(axialPaintLabel(range, 'SI')).toBe('-0.001 kN / +0.002 kN');
});
