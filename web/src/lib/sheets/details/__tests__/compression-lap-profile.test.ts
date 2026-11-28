import { expect, it } from 'vitest';
import { drawDetails } from '../catalog';
import { barLengths, TYPICAL } from '../values';

it.skip.each([20, 21, 25])('known wrong result: #1928 the T-03 construction detail uses the offered lap policy at %s MPa', fc => {
  const diameter = 16;
  const values = { ...TYPICAL, fc, fy: 420 };
  const base = Math.max(0.071 * values.fy * diameter, 300);
  const factor = __PUBLIC_FEATURES__.proRcSheets && fc < 21 ? 4 / 3 : 1;
  const expected = Math.ceil(base * factor / 10) * 10;
  expect(barLengths(values, diameter).lapC).toBe(expected);
  const [sheet] = drawDetails([{ id: 'chars-anchorage', target: 'details' }], values, key => key, (v, n) => v.toFixed(n));
  const labels = sheet!.primitives.flatMap(p => p.kind === 'text' ? [p.text] : []);
  expect(labels).toContain(String(expected));
});
