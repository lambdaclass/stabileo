/**
 * A four-pile cap by hand: piles at (±0,75, ±0,75), Ø0,40 m, cap 2,3 × 2,3 × 0,9 m, column 0,50 m.
 *   Service N = 1600 kN + cap 25·2,3²·0,9 = 119,0 kN: R = 429,8 kN each; My = 200 kN·m adds
 *   ±200·0,75/(4·0,75²) = ±66,7 → 496,4 / 363,1 kN.
 *   Factored N = 2240 kN, centred: 560 kN each. Face at 0,25 m: two piles 0,50 m past it,
 *   Mu = 2·560·0,50 = 560 kN·m.
 */
import { describe, it, expect } from 'vitest';
import { checkPileCap, pileReactions, pileCapOneWayVc } from '../pile-cap';

const piles = [[-0.75, -0.75], [0.75, -0.75], [0.75, 0.75], [-0.75, 0.75]].map(([x, y]) => ({ x: x!, y: y! }));

describe('a four-pile cap', () => {
  it('shares the load and the moment between its piles', () => {
    const r = pileReactions(piles, 1600 + 119.025, 200, 0);
    expect(Math.max(...r)).toBeCloseTo(496.42, 1);
    expect(Math.min(...r)).toBeCloseTo(363.09, 1);
  });

  it('bends at the column face by the piles beyond it', () => {
    const c = checkPileCap({
      B: 2.3, L: 2.3, thickness: 0.9, cover: 0.075, fc: 25, fy: 420, piles, pileDiameter: 0.4, pileCapacity: 600,
      column: { x: 0, y: 0, cx: 0.5, cy: 0.5 }, service: { N: 1600, Mx: 0, My: 0 }, factored: { N: 2240, Mx: 0, My: 0 },
    });
    expect(c.reactions.factored.every((v) => Math.abs(v - 560) < 1e-9)).toBe(true);
    expect(c.x.mu).toBeCloseTo(560, 6);
    expect(c.piles.tension).toBe(false);
    expect(c.piles.utilization).toBeCloseTo((1600 + 119.025) / 4 / 600, 6);
  });
});

/**
 * One-way shear of the cap: CIRSOC 201-2025 §22.5.5.1, not §13.2.6.2(a).
 *
 * §13.2.6.2(a) allows Vc = 0,17·λ·√f'c·bw·d only for shallow foundation members «continuamente
 * apoyados sobre el suelo» designed as rigid; a pile cap rests on its piles. Without stirrups
 * (Av < Av,min) Tabla 22.5.5.1 row (c): Vc = 0,66·λs·ρw^⅓·√f'c·bw·d, λs = √(2/(1+0,004·d)) ≤ 1.
 *
 * The cap above: d = 0,9 − 0,075 − 0,016 = 0,809 m; As = max(560/(0,81·0,809·420 000),
 * 0,0018·2,3·0,9) = 3,726e-3 m² (the minimum governs); ρw = 3,726e-3/(2,3·0,809) = 0,002002;
 * λs = √(2/(1 + 0,004·809)) = 0,6871; Vc = 0,66·0,6871·0,002002^⅓·5·2,3·0,809·1000 = 531,8 kN,
 * φVc = 398,8 kN, against the 0,75·0,17·5·2,3·0,809·1000 = 1186,2 kN it used.
 * Vu at d past the face (0,25 + 0,809 = 1,059 m): the piles at 0,75 m with d_p = 0,40 are more
 * than d_p/2 before the section, so none counts and Vu = 0. A deeper column load puts the piles
 * past it: see the 6-pile cap below.
 */
describe('one-way shear of a pile cap (Tabla 22.5.5.1 row c)', () => {
  const cap = (over: Partial<Parameters<typeof checkPileCap>[0]> = {}) => checkPileCap({
    B: 2.3, L: 2.3, thickness: 0.9, cover: 0.075, fc: 25, fy: 420, piles, pileDiameter: 0.4, pileCapacity: 600,
    column: { x: 0, y: 0, cx: 0.5, cy: 0.5 }, service: { N: 1600, Mx: 0, My: 0 }, factored: { N: 2240, Mx: 0, My: 0 }, ...over,
  });

  it('reads row (c) with the size factor and ρw of the cap\'s steel', () => {
    const s = cap().x.shear;
    expect(s.basis).toBe('tabla22.5.5.1c');
    expect(s.lambdaS).toBeCloseTo(0.6871, 4);
    expect(s.rhoW).toBeCloseTo(0.002002, 6);
    expect(s.phiVc).toBeCloseTo(398.8, 0);
    expect(s.capped).toBe(false);
  });

  it('2005 keeps 0,17·√f\'c·bw·d, which has no size factor', () => {
    const s = cap({ edition: '2005' }).x.shear;
    expect(s.basis).toBe('cirsoc2005');
    expect(s.phiVc).toBeCloseTo(0.75 * 0.17 * 5 * 2.3 * 0.809 * 1000, 6);
  });

  /*
   * A cap with d ≥ 500 mm where one-way shear acts: 3,6 × 1,4 × 0,9 m on two piles at ±1,2 m,
   * Ø0,40, column 0,5 × 0,5, Nu = 2000 kN factored (1000 kN per pile). Along x the section at
   * d past the face is at 0,25 + 0,809 = 1,059 m; the pile at 1,2 m is 0,141 m past it, so it
   * counts 0,141/0,40 + 0,5 = 0,8525 of 1000 kN: Vu = 852,5 kN.
   *   Before: φVc = 0,75·0,17·5·1,4·0,809 = 722,0 kN, utilisation 1,18.
   *   After:  Mu = 1000·(1,2 − 0,25) = 950 kN·m, As = 950/(0,81·0,809·420 000) = 3,452e-3 m²
   *           (over the minimum 2,268e-3), ρw = 3,048e-3, Vc = 0,66·0,6871·0,1450·5·1,4·0,809·1000
   *           = 372,4 kN, φVc = 279,3 kN: utilisation 3,05.
   */
  it('a two-pile cap 900 mm deep: utilisation 1,18 with 0,17 becomes 3,05 with row (c)', () => {
    const two = [{ x: -1.2, y: 0 }, { x: 1.2, y: 0 }];
    const r = checkPileCap({
      B: 3.6, L: 1.4, thickness: 0.9, cover: 0.075, fc: 25, fy: 420, piles: two, pileDiameter: 0.4, pileCapacity: 1500,
      column: { x: 0, y: 0, cx: 0.5, cy: 0.5 }, service: { N: 1400, Mx: 0, My: 0 }, factored: { N: 2000, Mx: 0, My: 0 },
    });
    expect(r.x.shear.vu).toBeCloseTo(852.5, 1);
    const before = r.x.shear.vu / (0.75 * 0.17 * 5 * 1.4 * 0.809 * 1000);
    expect(before).toBeCloseTo(1.18, 2);
    expect(r.x.shear.rhoW).toBeCloseTo(3.048e-3, 6);
    expect(r.x.shear.phiVc).toBeCloseTo(279.3, 0);
    expect(r.x.shear.utilization).toBeCloseTo(3.05, 2);
    expect(r.utilization).toBeGreaterThanOrEqual(r.x.shear.utilization);
  });

  it('caps Vc at 0,42·√f\'c·bw·d and √f\'c at 8,3 MPa', () => {
    const heavy = pileCapOneWayVc(90, 1, 0.1, 0.1 * 0.1, '2025');
    // ρw = 0,1: 0,66·1·0,464 = 0,306 < 0,42, so not capped; a huge ρw is.
    expect(heavy.capped).toBe(false);
    const huge = pileCapOneWayVc(90, 1, 0.1, 1, '2025'); // ρw = 10, a bound check only
    expect(huge.capped).toBe(true);
    expect(huge.phiVc).toBeCloseTo(0.75 * 0.42 * 8.3 * 1 * 0.1 * 1000, 6);
  });
});
