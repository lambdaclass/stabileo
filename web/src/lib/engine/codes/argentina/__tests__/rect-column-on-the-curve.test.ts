/**
 * A rectangular column is designed on its interaction diagram, everywhere.
 *
 * ── What this replaced ─────────────────────────────────────────────
 *
 * `checkColumn` sizes the steel for the moment as an isolated couple, sizes
 * more steel to carry the WHOLE axial load on the bars alone, halves the
 * second, and adds them. Its own comments say "rough" and "simplified", and
 * the adapter PRO designs through says these estimators are not the
 * authoritative path.
 *
 * The rule has no interaction in it, and a column has interaction: moderate
 * axial compression RAISES the moment capacity, which is the entire bulge of
 * the curve up to the balance point. Swept against the real diagram it ran
 * from 71 % to 171 % of the steel actually required — conservative in the
 * middle of the domain and up to 29 % light in the high-moment corner.
 *
 * "Conservative on average" is not a safety property, which is why this file
 * sweeps rather than checking one point. One point is how the old rule
 * looked fine.
 */

import { describe, it, expect } from 'vitest';
import { designRectColumn, rectColumnCheck } from '../cirsoc201-capacity';
import { generateInteractionDiagram } from '../interaction-diagram';
import { COLUMN_STEEL_RATIO } from '../cirsoc201-basis';

const P = { fc: 25, fy: 420, cover: 0.042, b: 0.30, h: 0.30, stirrupDia: 0 };

/** The steel the diagram itself demands, found independently of the module. */
function steelFromDiagram(Pu: number, Mu: number): number {
  const fits = (Ast: number) => {
    const d = generateInteractionDiagram({
      b: P.b, h: P.h, fc: P.fc, fy: P.fy, cover: 0.05,
      AsProv: Ast, barCount: 8, barDia: 20, nPoints: 60,
    });
    const slope = Pu > 1e-9 ? Mu / Pu : Infinity;
    let capP = 0, capM = 0;
    for (let i = 0; i < d.points.length - 1; i++) {
      const A = d.points[i], B = d.points[i + 1];
      const fA = A.phiMn - slope * A.phiPn, fB = B.phiMn - slope * B.phiPn;
      if (fA === 0 || fA * fB < 0) {
        const t = fA / (fA - fB);
        capP = A.phiPn + t * (B.phiPn - A.phiPn);
        capM = A.phiMn + t * (B.phiMn - A.phiMn);
        break;
      }
    }
    return Math.hypot(capM, capP) >= Math.hypot(Mu, Pu);
  };
  const Ag = P.b * P.h;
  let lo = COLUMN_STEEL_RATIO.min * Ag * 1e4;
  let hi = COLUMN_STEEL_RATIO.max * Ag * 1e4;
  if (fits(lo)) return lo;
  if (!fits(hi)) return NaN;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (fits(m)) hi = m; else lo = m; }
  return hi;
}

/** Corners of the domain, not a comfortable middle. */
const CASES: Array<[number, number]> = [
  [100, 20], [300, 60], [500, 100], [800, 80],
  [1200, 60], [1500, 40], [200, 120], [50, 150], [1800, 20],
];

describe('sizing never lands under what the curve requires', () => {
  for (const [Pu, Mu] of CASES) {
    it(`Pu ${Pu} kN, Mu ${Mu} kN·m`, () => {
      const sized = designRectColumn(P, Pu, Mu, 8);
      const required = steelFromDiagram(Pu, Mu);
      expect(sized, 'the section should be able to take this').not.toBeNull();
      expect(Number.isNaN(required)).toBe(false);

      const ratio = sized!.AstCm2 / required;
      /*
       * At or above what the curve asks, and not wastefully above. The old
       * rule failed the lower bound at four of these nine points.
       */
      expect(ratio, `ours ${sized!.AstCm2.toFixed(2)} vs required ${required.toFixed(2)}`)
        .toBeGreaterThanOrEqual(0.99);
      expect(ratio).toBeLessThan(1.10);
    });
  }
});

describe('sizing and checking agree with each other', () => {
  it('the steel sizing returns passes the check it was bisected on', () => {
    for (const [Pu, Mu] of CASES) {
      const sized = designRectColumn(P, Pu, Mu, 8);
      expect(sized!.check.ratio, `Pu ${Pu} Mu ${Mu}`).toBeLessThanOrEqual(1.0001);
    }
  });

  it('a section far too small is refused rather than sized to the maximum', () => {
    expect(designRectColumn({ ...P, b: 0.20, h: 0.20 }, 4000, 400, 8)).toBeNull();
  });

  it('pure bending is answered without dividing by zero', () => {
    const r = rectColumnCheck(P, 20, 0, 60, 8);
    expect(Number.isFinite(r.ratio)).toBe(true);
    expect(r.phiMn).toBeGreaterThan(0);
  });
});
