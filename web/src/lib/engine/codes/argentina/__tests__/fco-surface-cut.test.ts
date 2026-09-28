/**
 * The surface cut the biaxial sheets draw, point by point against their cells.
 *
 * `workbook-biaxial.test.ts` asks whether each published point is exactly
 * resisted, which is a statement about the verdict. This asks the stronger
 * thing the figure needs: that tracing the contour the way the sheet traces it
 * — neutral-axis angle Fi = 0°, 7.5° … 90°, depth solved for φPn = Pu — lands
 * on the sheet's own point for the same Fi. The fixture's thirteen points per
 * contour are in that order, so point k is Fi = 7.5·k.
 */
import { describe, it, expect } from 'vitest';
import { surfaceCut, momentCapacityAtAxial } from '../cirsoc-flex-surface';
import { facesA1A2A3 } from '../cirsoc201-layouts';
import type { Materials, Outline } from '../cirsoc201-section';
import fixture from './fco-dim-contours.json';

const S = fixture.section;
const OUT: Outline = { kind: 'rect', b: S.b, h: S.h };
const MAT: Materials = { fc: S.fc, fy: S.fy, confinement: 'ties', deductDisplacedConcrete: true };
const barsFor = (astCm2: number) => facesA1A2A3(
  S.b, S.h, S.dPrimeH, S.dPrimeV, astCm2,
  { a1: S.pctA1, a2: S.pctA2, a3: S.pctA3 }, { n1: S.nA1, n2: S.nA2, n3: S.nA3 },
);

describe('the contour, traced as the sheet traces it', () => {
  /* The contours the sheet PLOTS: 1 % to 8 %, and its two iterations. */
  const plotted = fixture.contours.filter((c) => c.rho >= 0.01);

  for (const contour of plotted) {
    it(`ρ = ${contour.rho}: every Fi lands on the sheet's point`, () => {
      const cut = surfaceCut(OUT, barsFor(contour.rho * S.b * S.h * 1e4), MAT, fixture.demand.Pu);
      expect(cut.length).toBe(13);
      let worst = 0;
      const size = Math.hypot(...(contour.points[0] as [number, number]));
      (contour.points as Array<[number, number]>).forEach(([mx, my], k) => {
        const d = Math.hypot(cut[k].phiMnx - mx, cut[k].phiMny - my) / size;
        worst = Math.max(worst, d);
      });
      /*
       * Measured worst is 0,62 % of the contour's size (8 %, Fi = 37,5°). The
       * ends — the uniaxial cases — agree to 0,08 % or better; the gap lives
       * mid-quadrant and its direction error alternates in sign from one Fi to
       * the next (±0,4°), the signature of a discretised compression zone on
       * the sheet's side rather than of a wrong method on ours, whose zone is
       * an exact polygon clip. Ours is the larger by that much.
       */
      expect(worst, `worst gap ${(worst * 100).toFixed(3)} %`).toBeLessThan(0.0065);
    });
  }
});

describe('φMn / Mu, the quantity FCO-VERIF prints', () => {
  it('reproduces 1,00035 for the sheet’s own section and demand', () => {
    /* FCO-VERIF ships As1 = As2 = 10,676 cm², Pu 500, Mxu 100, Myu 0. */
    const bars = facesA1A2A3(0.3, 0.3, 0.05, 0.05, 21.352,
      { a1: 50, a2: 50, a3: 0 }, { n1: 4, n2: 4, n3: 4 });
    const cap = momentCapacityAtAxial(OUT, bars, MAT, 500, 100, 0)!;
    expect(cap.phiMn / 100).toBeCloseTo(1.0003512, 3);
  });

  it('finds the contour point on the demand’s own ray, off the axes', () => {
    const bars = barsFor(fixture.workbookAnswer.astCm2);
    const [mx, my] = fixture.contours.find((c) => Math.abs(c.rho - 0.023724) < 1e-6)!.points[6];
    /* Asked along the direction of a published point, it must return that point. */
    const cap = momentCapacityAtAxial(OUT, bars, MAT, 500, mx, my)!;
    /* 0,30 % measured — the same mid-quadrant gap as above. */
    expect(Math.abs(cap.phiMn / Math.hypot(mx, my) - 1)).toBeLessThan(0.0035);
    expect(Math.atan2(cap.phiMny, cap.phiMnx)).toBeCloseTo(Math.atan2(my, mx), 4);
  });

  it('is a different number from the (M, P) ray away from the surface', () => {
    /* Half the load: the fixed-axial reserve and the eccentricity-ray reserve
       part company, which is why the sheet's definition has to be the one used. */
    const bars = barsFor(fixture.workbookAnswer.astCm2);
    const cap = momentCapacityAtAxial(OUT, bars, MAT, 500, 50, 0)!;
    expect(cap.phiMn).toBeCloseTo(100.03, 0);
  });

  it('has no answer above the axial cap', () => {
    const bars = barsFor(fixture.workbookAnswer.astCm2);
    expect(momentCapacityAtAxial(OUT, bars, MAT, 5000, 50, 20)).toBeNull();
  });

  it('works in every quadrant of a symmetric section', () => {
    const bars = barsFor(fixture.workbookAnswer.astCm2);
    const a = momentCapacityAtAxial(OUT, bars, MAT, 500, 60, 30)!;
    for (const [sx, sy] of [[-1, 1], [1, -1], [-1, -1]]) {
      const b = momentCapacityAtAxial(OUT, bars, MAT, 500, sx * 60, sy * 30)!;
      expect(b.phiMn).toBeCloseTo(a.phiMn, 3);
      expect(Math.sign(b.phiMnx)).toBe(sx);
      expect(Math.sign(b.phiMny)).toBe(sy);
    }
  });
});
