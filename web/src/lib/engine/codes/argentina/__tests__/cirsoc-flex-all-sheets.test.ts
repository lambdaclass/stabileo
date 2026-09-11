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

  /*
   * A tenth of a per cent, not the thousandth the first version asked for.
   * The sizing became a bisection on the interaction curve — to remove a
   * dead band where a beam could not be designed for less load than one
   * that could — so the answer now carries the grid's resolution instead of
   * a closed form's. 0.012 % against a published number is agreement.
   */
  it('As', () => near(r.AsCm2!, 4.145276, 1e-3));
  it('As,min', () => near(r.AsMinCm2!, 1.464, 1e-3));
  it('a and c', () => { near(r.a!, 0.0682751, 1e-4); near(r.c!, 0.0803237, 1e-4); });
  it('cmax and εt', () => { near(r.cMax!, 0.13725, 1e-4); near(r.epsilonT!, 0.0106697, 1e-4); });
});

describe('FST — flanged, simple bending', () => {
  const r = solveFlex({ ...BASE, kase: 'FST', b: 0.12, h: 0.40, dPrime: 0.032, dPrimeS: 0.032, Pu: 0, Mu: 52 });

  it('As', () => near(r.AsCm2!, 3.766011, 1e-3));
  it('As,min, taken off the web', () => near(r.AsMinCm2!, 1.472, 1e-3));
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
  it('As,min for simple bending', () => near(r.AsMinCm2!, 2.5, 1e-3));
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

describe('more load never becomes easier to design for', () => {
  /*
   * ── The defect a reader found by turning a dial ───────────────────
   *
   * On a 20 × 50 with f'c 25 and 3 cm cover, Mu = 215 kN·m failed and
   * Mu = 220 passed. The sizing stayed singly-reinforced past the point
   * where a singly-reinforced section can carry the moment, and only
   * switched to compression steel higher up — leaving a band, roughly
   * 225 to 238, where no design was offered for loads that a heavier case
   * was designed for.
   *
   * A section that cannot be designed for less load than one that can is
   * not a rounding problem. This sweeps the whole range rather than the two
   * values reported, because the band was invisible from either end.
   */
  const beam = (Mu: number): FlexInput => ({
    ...BASE, kase: 'FSR', b: 0.20, h: 0.50,
    dPrime: 0.03, dPrimeS: 0.03, Pu: 0, Mu,
  });

  it('the steel only ever goes up', () => {
    let previous = 0;
    for (let Mu = 100; Mu <= 400; Mu += 5) {
      const r = solveFlex(beam(Mu));
      expect(r.AstCm2, `Mu = ${Mu} needs less steel than ${Mu - 5}`)
        .toBeGreaterThanOrEqual(previous - 1e-6);
      previous = r.AstCm2;
    }
  });

  it('and there is no band of loads it refuses in the middle', () => {
    const verdicts: number[] = [];
    for (let Mu = 100; Mu <= 400; Mu += 5) {
      if (!solveFlex(beam(Mu)).ok) verdicts.push(Mu);
    }
    /*
     * Failures are allowed — a 20 × 50 runs out eventually — but they have
     * to be a TAIL. A gap in the middle is the defect.
     */
    if (verdicts.length > 0) {
      const firstFail = verdicts[0];
      for (let Mu = firstFail; Mu <= 400; Mu += 5) {
        expect(solveFlex(beam(Mu)).ok, `${Mu} passes but ${firstFail} failed`).toBe(false);
      }
    }
  });

  it('compression steel arrives continuously, not as a jump', () => {
    /*
     * The transition is where the band was. Either side of it the
     * compression steel must grow from zero rather than appearing at a
     * finite value, or the total steel steps and the curve of answers has a
     * cliff in it.
     */
    let lastComp = 0;
    for (let Mu = 200; Mu <= 300; Mu += 2) {
      const comp = solveFlex(beam(Mu)).AsPrimeCm2 ?? 0;
      expect(comp - lastComp, `A's jumps at Mu = ${Mu}`).toBeLessThan(1.5);
      lastComp = comp;
    }
    expect(lastComp, 'and by 300 kN·m there is some').toBeGreaterThan(0);
  });
});

describe('a design says what to tie, not only how much', () => {
  it('proposes a count and a diameter for a beam', () => {
    const r = solveFlex({ ...BASE, kase: 'FSR', b: 0.20, h: 0.50, dPrime: 0.03, dPrimeS: 0.03, Pu: 0, Mu: 150 });
    expect(r.barChoice?.label).toMatch(/^\d+ Ø\d+$/);
    expect(r.barChoice!.areaCm2).toBeGreaterThanOrEqual(r.AsCm2!);
  });

  it('and for a column, at the count the layout already fixed', () => {
    const r = solveFlex({ ...BASE, kase: 'FCO', Pu: 500, Mu: 100 });
    expect(r.barChoice?.count).toBe(8);
    expect(r.barChoice!.areaCm2).toBeGreaterThanOrEqual(r.AstCm2 - 1e-6);
  });

  it('says when the bars do not fit across the face', () => {
    /*
     * The question an area cannot answer. A 20 cm web needing a lot of
     * steel will take it by area and not by width, and §25.2's clear
     * spacing is what says so.
     */
    const wide = solveFlex({ ...BASE, kase: 'FSR', b: 0.20, h: 0.50, dPrime: 0.03, dPrimeS: 0.03, Pu: 0, Mu: 100 });
    expect(wide.barChoice!.fitsInOneLayer).toBe(true);

    const tight = solveFlex({ ...BASE, kase: 'FSR', b: 0.12, h: 0.60, dPrime: 0.03, dPrimeS: 0.03, Pu: 0, Mu: 260 });
    expect(tight.barChoice!.clearSpacingMm).not.toBeNull();
  });
});
