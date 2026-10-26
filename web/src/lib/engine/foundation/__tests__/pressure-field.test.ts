/**
 * A base that cannot pull the ground, by hand. 2 × 2 m, N = 400 kN.
 *   Inside the kern, My = 100 (e = 0,25 < 2/6): q = 100 ± 6·100/(2·4) = 100 ± 75 → 175 / 25 kPa.
 *   Outside it, My = 200 (e = 0,5 > 1/3): the triangle on 3·(1 − 0,5) = 1,5 m of contact,
 *   qmax = 2N/(3·B·(B/2 − e)) = 800/(3·2·0,5) = 266,7 kPa, 75 % of the base in contact.
 */
import { describe, it, expect } from 'vitest';
import { pressureField } from '../pressure-field';

describe('a no-tension base', () => {
  it('is linear inside the kern', () => {
    const f = pressureField(2, 2, 400, 100, 0);
    expect(f.contact).toBe(1);
    expect(f.qMax).toBeCloseTo(175, 9);
    expect(f.at(-1, 0)).toBeCloseTo(25, 9);
  });
  it('lifts outside it: the triangle of the textbook', () => {
    const f = pressureField(2, 2, 400, 200, 0);
    expect(f.qMax).toBeCloseTo(266.67, 0);
    expect(f.contact).toBeCloseTo(0.75, 1);
    expect(f.at(-0.6, 0)).toBe(0);
  });
  it('overturns when the resultant leaves the base', () => {
    expect(pressureField(2, 2, 400, 420, 0).overturns).toBe(true);
  });
  it('holds biaxially, in equilibrium', () => {
    const f = pressureField(3, 2, 600, 200, 120);
    // Integrate on a fine grid: N, My and Mx come back.
    let N = 0, My = 0, Mx = 0; const n = 200;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const x = -1.5 + (i + 0.5) * 3 / n, y = -1 + (j + 0.5) * 2 / n, q = f.at(x, y), dA = 6 / (n * n); N += q * dA; My += q * x * dA; Mx += q * y * dA; }
    expect(N).toBeCloseTo(600, -1); expect(My).toBeCloseTo(200, -1); expect(Mx).toBeCloseTo(120, -1);
    expect(f.contact).toBeLessThan(1);
  });
});
