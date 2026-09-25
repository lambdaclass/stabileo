/**
 * The biaxial path, against the workbook's own surface cut.
 *
 * ── Why this one matters more than the others ──────────────────────
 *
 * Until now the skew case was the least verified thing in this engine. The
 * workbook agreement that existed was at `Pu 500, Mu 100, Muy 0` — axis
 * aligned, where the calculation degenerates to uniaxial — and the only test of
 * genuinely skew bending asserted that a skew demand needs more steel than an
 * aligned one, which almost any implementation satisfies whether it is right or
 * not. So the sheet that exists FOR skew bending carried no published number.
 *
 * It does. FCO-DIM's section 5, "CORTE DE LA SUPERFICIE DE INTERACCION PARA EL
 * AXIAL FIJADO", tabulates the load contour at the fixed axial load for twenty
 * reinforcement ratios — thirteen (φMxn, φMyn) points each, two hundred and
 * sixty in total, every one of them off-axis except the two ends. That is the
 * published skew data, and `fco-dim-contours.json` is those cells verbatim.
 *
 * ── What is asserted ───────────────────────────────────────────────
 *
 * A point ON the contour is a demand the section exactly resists, so checking
 * it must return a utilisation of 1. Through `solveFlex`, which is the path the
 * panel uses — not through an internal helper that could agree with the fixture
 * while the product disagrees with both.
 */
import { describe, it, expect } from 'vitest';
import { solveFlex, type FlexInput } from '../cirsoc-flex';
import fixture from './fco-dim-contours.json';

const S = fixture.section;
const D = fixture.demand;
/** ρ is over the gross area, so the steel a contour belongs to is ρ·Ag. */
const astFor = (rho: number) => rho * S.b * S.h * 1e4;

function check(rho: number, Mx: number, My: number) {
  return solveFlex({
    kase: 'FCO', mode: 'verify',
    fc: S.fc, fy: S.fy, confinement: S.confinement, deductDisplacedConcrete: true,
    b: S.b, h: S.h, dPrimeH: S.dPrimeH, dPrimeV: S.dPrimeV,
    dPrime: S.dPrimeV, dPrimeS: S.dPrimeV, holeB: 0, holeH: 0,
    bf: S.b, hf: 0.1, bw: S.b, D: 0.4, Dint: 0, barCount: 8, barAtExtremeFibre: true,
    ratioAsPrime: 1,
    pctA1: S.pctA1, pctA2: S.pctA2, pctA3: S.pctA3,
    nA1: S.nA1, nA2: S.nA2, nA3: S.nA3,
    AstGiven: astFor(rho), levels: [],
    Pu: D.Pu, Mu: Mx, Muy: My,
  } as unknown as FlexInput);
}

describe('the fixture is the sheet', () => {
  it('carries twenty contours of thirteen points', () => {
    expect(fixture.contours.length).toBe(20);
    expect(fixture.contours.reduce((s, c) => s + c.points.length, 0)).toBe(260);
    expect(fixture.demand.Pu).toBe(500);
  });

  it('includes the ratio the sheet itself arrived at', () => {
    /* 0,023724 is the workbook's own answer for this demand, so its contour is
       the one that should pass through (100, 0). */
    expect(fixture.contours.some((c) => Math.abs(c.rho - 0.023724) < 1e-6)).toBe(true);
    expect(fixture.workbookAnswer.astCm2).toBeCloseTo(21.3515, 3);
  });
});

describe('every point of every contour is exactly resisted', () => {
  /* The contours below ρmin are the sheet's own extrapolation of the surface
     and are kept in the fixture for the figure; a section with 0,1 % steel is
     not one the code would let you build, so they are not asserted on. */
  const real = fixture.contours.filter((c) => c.rho >= 0.01);

  it('covers the ratios a column may actually have', () => {
    expect(real.length).toBeGreaterThanOrEqual(9);
  });

  for (const contour of real) {
    it(`ρ = ${contour.rho}`, () => {
      const offAxis: number[] = [];
      for (const [Mx, My] of contour.points as Array<[number, number]>) {
        if (Math.hypot(Mx, My) < 1e-6) continue;
        const r = check(contour.rho, Mx, My);
        expect(Number.isFinite(r.ratio), `(${Mx}, ${My}) gives a finite ratio`).toBe(true);
        if (Mx > 1e-3 && My > 1e-3) offAxis.push(r.ratio);
        expect(
          Math.abs(r.ratio - 1),
          `ρ ${contour.rho} at (Mx ${Mx}, My ${My}): ratio ${r.ratio.toFixed(4)}`,
        ).toBeLessThan(0.015);
      }
      /* The ends of a contour are the uniaxial cases, which were already
         verified. The middle is the part that was not, so it has to be there. */
      expect(offAxis.length, 'the contour has genuinely skew points').toBeGreaterThan(5);
    });
  }
});

describe('the sheet’s own answer', () => {
  it('resists the demand it was sized for, and just', () => {
    const r = check(fixture.workbookAnswer.rho, D.Mxu, D.Myu);
    expect(Math.abs(r.ratio - 1)).toBeLessThan(0.015);
  });

  it('a tenth less steel does not', () => {
    /* Agreement at the answer means nothing unless the answer is a boundary. */
    const r = check(fixture.workbookAnswer.rho * 0.9, D.Mxu, D.Myu);
    expect(r.ratio).toBeGreaterThan(1);
  });
});
