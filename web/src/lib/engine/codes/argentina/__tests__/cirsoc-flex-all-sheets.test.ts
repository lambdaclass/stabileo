/**
 * Every sheet the workbook ships, through the one call the panel makes.
 *
 * ── Why this file and not the ones beside it ───────────────────────
 *
 * The other comparisons reach into a specific engine — the flexural one, the
 * circular one, the section one. This goes through `solveFlex`, which is what
 * the panel calls, with the inputs spelled the way the SHEET spells them:
 * `d'` and `d's` to the bar centre, `A's/As` as a ratio, A1/A2/A3 as
 * percentages and counts.
 *
 * So it tests the thing a reader actually uses. A mistake in the layout
 * conventions — which face A1 is, whether a ring starts at the top, whether
 * four bars across a face include the corners — produces a section that is
 * right in every clause and wrong in its answer, and only this level catches
 * it.
 */

import { describe, it, expect } from 'vitest';
import { solveFlex, type FlexInput } from '../cirsoc-flex';

/** The sheets' shared defaults; each case overrides what it needs. */
const BASE: FlexInput = {
  kase: 'FCR', mode: 'design',
  fc: 25, fy: 420, confinement: 'ties', deductDisplacedConcrete: true,
  b: 0.30, h: 0.30, dPrime: 0.05, dPrimeS: 0.05, dPrimeH: 0.05, dPrimeV: 0.05,
  holeB: 0, holeH: 0,
  bf: 1.37, hf: 0.10, bw: 0.12,
  D: 0.40, Dint: 0, barCount: 12, barAtExtremeFibre: true,
  ratioAsPrime: 1,
  pctA1: 50, pctA2: 50, pctA3: 0, nA1: 4, nA2: 4, nA3: 4,
  AstGiven: 20, levels: [],
  Pu: 500, Mu: 100, Muy: 0,
};

/** Within a quarter of a per cent, which is finer than the curve's own grid. */
const near = (ours: number, published: number, tol = 0.004) => {
  expect(Math.abs(ours / published - 1), `ours ${ours.toFixed(4)} vs ${published}`)
    .toBeLessThan(tol);
};

describe('FSR — rectangular, simple bending', () => {
  const r = solveFlex({ ...BASE, kase: 'FSR', b: 0.12, h: 0.40, dPrime: 0.034, dPrimeS: 0.034, Pu: 0, Mu: 52 });

  it('As', () => near(r.AsCm2!, 4.145276, 1e-5));
  it('As,min', () => near(r.AsMinCm2, 1.464, 1e-3));
  it('a and c', () => { near(r.a!, 0.0682751, 1e-4); near(r.c!, 0.0803237, 1e-4); });
  it('cmax and εt', () => { near(r.cMax!, 0.13725, 1e-4); near(r.epsilonT!, 0.0106697, 1e-4); });
});

describe('FST — flanged, simple bending', () => {
  const r = solveFlex({ ...BASE, kase: 'FST', b: 0.12, h: 0.40, dPrime: 0.032, dPrimeS: 0.032, Pu: 0, Mu: 52 });

  it('As', () => near(r.AsCm2!, 3.766011, 1e-5));
  it('As,min, taken off the web', () => near(r.AsMinCm2, 1.472, 1e-3));
  it('a, well inside the flange', () => {
    near(r.a!, 0.0054331, 1e-3);
    expect(r.a!).toBeLessThan(0.10);
  });
});

describe('FCR — rectangular column, two levels', () => {
  const r = solveFlex(BASE);

  it('Ast', () => near(r.AstCm2, 21.3354));
  it("A's and As, split by the sheet's A's/As = 1", () => {
    near(r.AsPrimeCm2!, 10.6677);
    near(r.AsCm2!, 10.6677);
  });
  it('ρ', () => near(r.rho, 0.0237060));
  it('§10.9.1 bounds', () => {
    expect(r.AstMinCm2).toBeCloseTo(9.0, 6);
    expect(r.AstMaxCm2).toBeCloseTo(72.0, 6);
  });
  it('As,min for simple bending', () => near(r.AsMinCm2, 2.5, 1e-3));
});

describe('FCR-CIR — circular column, spiral', () => {
  /*
   * Held to 0.7 % rather than the 0.4 % the others meet, and the slack is
   * named: the ring's starting angle is worth 0.9 % at twelve bars, and the
   * published answer falls BETWEEN our two placements (86.06 and 86.84
   * against 86.56). Tightening would mean guessing which the sheet used and
   * calling the guess agreement.
   */
  const r = solveFlex({
    ...BASE, kase: 'FCR-CIR', confinement: 'spiral',
    dPrimeS: 0.03, D: 0.40, barCount: 12, Pu: 1000, Mu: 300,
  });

  it('Ast', () => near(r.AstCm2, 86.5608, 0.007));
  it('area per bar', () => near(r.AstCm2 / 12, 7.213404, 0.007));
  it('ρ', () => near(r.rho, 0.0688829, 0.007));
  it('§10.9.1 bounds', () => {
    /* Relative, because the circle is a 360-gon and 0.005 % short of πr². */
    near(r.AstMinCm2!, 12.5664, 1e-3);
    near(r.AstMaxCm2!, 100.5310, 1e-3);
  });
});

describe('FCO — rectangular column, bars across the faces', () => {
  const r = solveFlex({ ...BASE, kase: 'FCO', Pu: 500, Mu: 100, Muy: 0 });

  it('Ast', () => near(r.AstCm2, 21.3515));
  it('area per bar', () => near(r.AstCm2 / 8, 2.668941));
  it('ρ', () => near(r.rho, 0.0237239));

  it('and the bars land where the sheet prints them', () => {
    /*
     * The sheet lists every coordinate. Four bars to a face on a 0.30
     * section with 0.05 cover put them at x = ±0.10 and ±0.0333 — corners
     * INCLUDED. Insetting them instead would be three per cent out and look
     * like a rounding difference.
     */
    const xs = [...new Set(r.bars.map((b) => +b.x.toFixed(4)))].sort((p, q) => p - q);
    expect(xs).toEqual([-0.1, -0.0333, 0.0333, 0.1]);
    const ys = [...new Set(r.bars.map((b) => +b.y.toFixed(4)))].sort((p, q) => p - q);
    expect(ys).toEqual([-0.1, 0.1]);
  });
});

describe('the modelling the sheets have and we did not', () => {
  it('a hollow rectangle carries less than a solid one', () => {
    const solid = solveFlex({ ...BASE, Pu: 1500, Mu: 60 });
    const hollow = solveFlex({ ...BASE, Pu: 1500, Mu: 60, holeB: 0.12, holeH: 0.12 });
    expect(hollow.AstCm2).toBeGreaterThan(solid.AstCm2);
  });

  it('an annular column is worse off than a full one', () => {
    /*
     * Asserted on the VERDICT, not on the steel. Hollowing the core also
     * shrinks Ag, and §10.9.1's 8 % ceiling with it — so the tube runs out
     * of allowable steel at a lower number than the full section needs, and
     * comparing the two areas would read as the tube needing less. It does
     * not: it cannot be made to work at all.
     */
    const full = solveFlex({ ...BASE, kase: 'FCR-CIR', dPrimeS: 0.03, Pu: 1000, Mu: 300 });
    const tube = solveFlex({ ...BASE, kase: 'FCR-CIR', dPrimeS: 0.03, Dint: 0.20, Pu: 1000, Mu: 300 });
    expect(full.ok).toBe(true);
    expect(tube.impossible, 'a 40/20 tube cannot carry what the solid 40 can').toBe(true);
  });

  it('a bar at the extreme fibre needs slightly less steel than a rotated ring', () => {
    /*
     * The extreme tension bar has the longest lever arm, so putting one
     * there helps — which is the opposite of what the workbook's word
     * "favourable" suggested, and the reason the parameter is named for
     * what it does. Worth 0.9 % on twelve bars.
     */
    const atFibre = solveFlex({ ...BASE, kase: 'FCR-CIR', dPrimeS: 0.03, barAtExtremeFibre: true, Pu: 1000, Mu: 300 });
    const rotated = solveFlex({ ...BASE, kase: 'FCR-CIR', dPrimeS: 0.03, barAtExtremeFibre: false, Pu: 1000, Mu: 300 });
    expect(atFibre.AstCm2).toBeLessThan(rotated.AstCm2);
    expect(rotated.AstCm2 / atFibre.AstCm2).toBeLessThan(1.02);
  });

  it('skew bending needs more steel than the same resultant on an axis', () => {
    const axis = solveFlex({ ...BASE, kase: 'FCO', Pu: 500, Mu: 100, Muy: 0 });
    const skew = solveFlex({ ...BASE, kase: 'FCO', Pu: 500, Mu: 70.71, Muy: 70.71 });
    expect(skew.AstCm2).toBeGreaterThan(axis.AstCm2);
  });

  it('arbitrary steel levels are read when verifying', () => {
    const r = solveFlex({
      ...BASE, mode: 'verify', AstGiven: 21.336,
      levels: [
        { distanceFromBottom: 0.05, areaCm2: 10.668 },
        { distanceFromBottom: 0.25, areaCm2: 10.668 },
      ],
      Pu: 500, Mu: 100,
    });
    expect(r.bars).toHaveLength(2);
    expect(r.ratio).toBeLessThan(1.05);
  });
});
