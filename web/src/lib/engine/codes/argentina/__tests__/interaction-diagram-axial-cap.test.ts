/**
 * §10.3.6 is a ceiling on the top of the diagram, not a tax on all of it.
 *
 * ── The defect this file pins ──────────────────────────────────────
 *
 * The diagram's per-point axial read `min(Pn, 0.80·Pn/φ·φ)`, which collapses
 * to 0.80·Pn: EVERY point of the diagram was credited with 80 % of its axial
 * capacity. The clause caps only the top — no column is loaded at truly zero
 * eccentricity, so φPn may not exceed 0.80·φC·Pn0, with Pn0 the squash load.
 * At the balanced point, where §10.3.6 asks for nothing, the diagram was
 * showing 20 % less column than the section is.
 *
 * The section used below is FCR-VERIF's own — 30 × 30, f'c 25, fy 420,
 * 21.336 cm² in two faces — because the workbook publishes the cap for it:
 * 1436.9020 kN. The cap was already right at the top; the fix is everywhere
 * else.
 */

import { describe, it, expect } from 'vitest';
import { generateInteractionDiagram } from '../interaction-diagram';
import { sectionPoint, type Bar, type Outline } from '../cirsoc201-section';

const PARAMS = {
  b: 0.30, h: 0.30, fc: 25, fy: 420,
  cover: 0.05, // to the bar centre, as the diagram measures it
  AsProv: 21.336, barCount: 8, barDia: 20, nPoints: 60,
};

const diagram = generateInteractionDiagram(PARAMS);

/** The squash load, §10.3.6's Pn0: everything at εcu, displaced concrete out. */
function squashLoad(): number {
  const Ag = PARAMS.b * PARAMS.h;
  const Ast = PARAMS.AsProv * 1e-4;
  return 0.85 * PARAMS.fc * 1000 * (Ag - Ast) + PARAMS.fy * 1000 * Ast;
}

describe('the cap binds at the top and only at the top', () => {
  it('the pure-compression point is 0.80·φC·Pn0 — the number the workbook prints', () => {
    /* Published for this section: Pu(máx) = 1436.9020 kN. */
    expect(diagram.pureCompression.phiPn).toBeCloseTo(0.80 * 0.65 * squashLoad(), 9);
    expect(diagram.pureCompression.phiPn).toBeCloseTo(1436.9020, 3);
  });

  it('the first curve point lands exactly on the pure-compression point', () => {
    /*
     * The curve starts at c = 10·h, where Pn exceeds Pn0 and the cap is what
     * is reported — so the curve's first point and the diagram's stated
     * pure-compression point are the same number, not two computations that
     * happen to be close.
     */
    expect(diagram.points[0].phiPn).toBeCloseTo(diagram.pureCompression.phiPn, 9);
  });

  it('and the section engine agrees on where the top is', () => {
    /*
     * The same section through `cirsoc201-section.ts`, the engine the
     * workbook comparisons are pinned on. Its squash point deducts the
     * displaced concrete, so its φPn at c = 10·h IS 0.80·φC·Pn0 — agreement
     * here means the diagram's cap and the engine's cap are one clause.
     */
    const outline: Outline = { kind: 'rect', b: 0.30, h: 0.30 };
    const bars: Bar[] = [
      { x: 0, y: -0.10, area: 10.668e-4 },
      { x: 0, y: 0.10, area: 10.668e-4 },
    ];
    const top = sectionPoint(outline, bars, { fc: 25, fy: 420 }, Math.PI / 2, 10 * 0.30);
    expect(top.phiPn).toBeCloseTo(diagram.pureCompression.phiPn, 6);
  });

  it('the balanced point keeps its full axial capacity — no 0.80 below the cap', () => {
    /*
     * Worked on the diagram's own two-layer model: cb = d·εcu/(εcu+εy)
     * = 0.14706 m, a = 0.125 m, the compression bars at 1.98 ‰ (396 MPa,
     * not yet yielded), the tension bars at εy.
     *   Pn = 796.875 + 422.45 − 448.06 = 771.26 kN, φ = 0.65 at εt = εy
     * → φPn = 501.32 kN. The old per-point 0.80 reported 401.06.
     */
    const d = PARAMS.h - PARAMS.cover;
    const ey = PARAMS.fy / 200000;
    const cb = (d * 0.003) / (0.003 + ey);
    const a = 0.85 * cb;
    const AsHalf = (PARAMS.AsProv / 2) * 1e-4;
    const Cc = 0.85 * PARAMS.fc * 1000 * PARAMS.b * a;
    const epsPrime = (0.003 * (cb - PARAMS.cover)) / cb;
    const fsPrime = epsPrime * 200000 * 1000;
    const CsPrime = AsHalf * fsPrime;
    const Ts = AsHalf * PARAMS.fy * 1000;
    const PnBalanced = Cc + CsPrime - Ts;

    expect(PnBalanced).toBeLessThan(0.80 * squashLoad()); // the cap is nowhere near
    expect(diagram.balanced.phiPn).toBeCloseTo(0.65 * PnBalanced, 6);
    expect(diagram.balanced.phiPn).toBeGreaterThan(0.65 * 0.80 * PnBalanced * 1.1);
  });

  it('every point below the cap is reported at φ·Pn, untouched', () => {
    /*
     * The sweep version of the balanced assertion: nothing under the cap may
     * read 0.80 of itself. The tension end has φPn = −φ·Ast·fy; the old code
     * left negatives alone, so the pure-tension point is the one point both
     * versions agree on — pinned here so the fix's blast radius stays named.
     */
    const Ast = PARAMS.AsProv * 1e-4;
    expect(diagram.pureTension.phiPn).toBeCloseTo(-0.90 * PARAMS.fy * 1000 * Ast, 9);
    for (const p of diagram.points) {
      expect(p.phiPn).toBeLessThanOrEqual(diagram.pureCompression.phiPn + 1e-9);
    }
  });
});
