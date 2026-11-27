import { expect, it } from 'vitest';
import { axialPaintLabel, axialPaintRange } from '../axial-paint';

it('retains both signs below the first fixed display digit', () => {
  const range = axialPaintRange({ minValue: -0.001, maxValue: 0.002 });
  expect(axialPaintLabel(range, 'SI')).toBe('-0.001 kN / +0.002 kN');
});

it.each([-1, 1])('keeps axial roundoff neutral on sign %s', sign => {
  for (const residual of [0, 1e-11, 1e-10]) {
    expect(axialPaintRange({ minValue: sign * residual, maxValue: sign * residual }).peak).toBe(0);
  }
  expect(axialPaintRange({ minValue: sign * 1.01e-10, maxValue: sign * 1.01e-10 }).peak).toBe(1.01e-10);
});
