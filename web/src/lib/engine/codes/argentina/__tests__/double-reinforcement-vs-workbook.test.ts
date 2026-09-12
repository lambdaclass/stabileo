/**
 * The double-reinforcement branch, against the sheet that has one.
 *
 * ── What the workbook actually does ────────────────────────────────
 *
 * FSR and FST each carry two result blocks, "Armadura Simple" and "Armadura
 * Doble", and pick between them on the sign of ΔMn = Mn,sol − Mn,max. The
 * shipped example is singly reinforced — its ΔMn is −33.75 kN·m and its A's
 * prints as 0.0 — so nothing in the example exercises the second block, and
 * a comparison that only reproduces the shipped numbers would never touch it.
 *
 * That mattered here: the question was whether the workbook proposes top
 * steel at all. It does, and so must we, and "so must we" is only worth
 * saying if the two are checked against each other where it applies.
 *
 * ── Reconstructing the sheet's closed form ─────────────────────────
 *
 * `.xls` formulas are not readable from here, so the sheet is reconstructed
 * from its own printed intermediates and confirmed against them cell by cell
 * on the shipped example (b = 0.12, h = 0.40, d′ = d′s = 0.034, f'c = 25,
 * fy = 420):
 *
 *   c,max   0.375 d                                 0.137250  ✓
 *   a,max   β₁ c,max                                0.116663  ✓
 *   ka,max  a,max / d                               0.318750  ✓
 *   mn,max  ka(1 − ka/2)                            0.267949  ✓
 *   Mn,max  mn · 0.85 f'c · b · d²                 91.528184  ✓
 *   ΔMn     Mu/φ − Mn,max                         −33.750406  ✓
 *   ε′s     0.003 (c,max − d′)/c,max                0.0022568 ✓
 *   f′s,corr fy − 0.85 f'c                        398.75 MPa  ✓
 *   A′s     ΔMn / (f′s,corr (d − d′))              −2.549413  ✓
 *   As      0.85 f'c a,max b / fy + A′s f′s,corr/fy 4.662655  ✓
 *
 * Every one of those is a value the sheet prints, so this is the sheet's
 * method and not a plausible reconstruction of it.
 *
 * ── Why the agreement is a band and not an equality ────────────────
 *
 * The sheet works the rectangular stress block in closed form. This
 * calculator sizes on the interaction curve by strain compatibility, which
 * is the more exact of the two and is what fixed the band of moments that
 * had no design at all. So they must agree closely and must not agree
 * exactly, and the test says which side ours is expected to fall on: more
 * steel, never less.
 */

import { describe, it, expect } from 'vitest';
import { solveFlex, type FlexInput } from '../cirsoc-flex';

/** f'c, fy in MPa; lengths in m; Mu in kN·m. Returns areas in cm². */
function workbookDouble(
  b: number, h: number, ds: number, dPrime: number,
  fc: number, fy: number, Mu: number,
) {
  const d = h - ds;
  const cMax = 0.375 * d;              // εt = 5 ‰
  const aMax = 0.85 * cMax;            // β₁ at f'c = 25
  const ka = aMax / d;
  const mn = ka * (1 - ka / 2);
  const MnMaxN = mn * 0.85 * fc * 1e6 * b * d * d;   // N·m
  const dMnN = (Mu / 0.9) * 1000 - MnMaxN;           // N·m
  /* The sheet's f's, capped at fy and reduced by the concrete the bar displaces. */
  const fsCorr = (fy - 0.85 * fc) * 1e6;             // Pa
  const AsPrime = dMnN / (fsCorr * (d - dPrime));    // m²
  const As = (0.85 * fc * 1e6 * aMax * b) / (fy * 1e6) + (AsPrime * fsCorr) / (fy * 1e6);
  return { MnMaxKNm: MnMaxN / 1000, AsCm2: As * 1e4, AsPrimeCm2: AsPrime * 1e4 };
}

describe('the workbook’s own singly-reinforced example', () => {
  const G = { b: 0.12, h: 0.40, ds: 0.034, dPrime: 0.034, fc: 25, fy: 420 };

  it('reproduces the intermediates the sheet prints', () => {
    const w = workbookDouble(G.b, G.h, G.ds, G.dPrime, G.fc, G.fy, 52);
    /* FSR!30,30 and the cells above it. */
    expect(w.MnMaxKNm).toBeCloseTo(91.528184, 4);
    /* FSR!47,30 and FSR!48,30 — the double block, computed even when unused. */
    expect(w.AsCm2).toBeCloseTo(4.662655, 4);
    expect(w.AsPrimeCm2).toBeCloseTo(-2.549413, 4);
  });

  it('needs no compression steel, and neither do we', () => {
    /*
     * ΔMn is negative here, which is the sheet's own test for staying in the
     * singly-reinforced block. A calculator that offered top steel anyway
     * would be adding steel the section does not need.
     */
    const r = solveFlex({
      mode: 'design', kase: 'FSR', fc: G.fc, fy: G.fy, b: G.b, h: G.h,
      dPrimeS: G.ds, dPrime: G.dPrime, Pu: 0, Mu: 52,
    } as unknown as FlexInput);
    expect(r.AsPrimeCm2 ?? 0).toBe(0);
    /* FSR!38,30 — the sheet's As, which this already matched. */
    expect(r.AsCm2!).toBeCloseTo(4.145276, 3);
  });
});

describe('above the singly-reinforced limit, both propose top steel', () => {
  const G = { b: 0.12, h: 0.40, ds: 0.034, dPrime: 0.034, fc: 25, fy: 420 };

  /** φ·Mn,max ≈ 82.4 kN·m for this section — past it, ΔMn turns positive. */
  const LIMIT = 0.9 * workbookDouble(G.b, G.h, G.ds, G.dPrime, G.fc, G.fy, 0).MnMaxKNm;

  it('agrees on where the second block starts', () => {
    expect(LIMIT).toBeCloseTo(82.375, 2);
    const below = solveFlex({
      mode: 'design', kase: 'FSR', fc: G.fc, fy: G.fy, b: G.b, h: G.h,
      dPrimeS: G.ds, dPrime: G.dPrime, Pu: 0, Mu: LIMIT - 2,
    } as unknown as FlexInput);
    const above = solveFlex({
      mode: 'design', kase: 'FSR', fc: G.fc, fy: G.fy, b: G.b, h: G.h,
      dPrimeS: G.ds, dPrime: G.dPrime, Pu: 0, Mu: LIMIT + 5,
    } as unknown as FlexInput);
    expect(below.AsPrimeCm2 ?? 0).toBe(0);
    expect(above.AsPrimeCm2 ?? 0).toBeGreaterThan(0);
  });

  /*
   * ── Only while the steel fits in one layer ─────────────────────
   *
   * The sheet places all tension steel at d′s and never revisits it. That is
   * exact while one layer holds the bars, and optimistic once it does not:
   * its own example section is a 12 cm web, which takes two Ø25 and no more.
   * Past about 10 cm² the bars must stack, the group's centroid rises, `d`
   * falls and the section needs MORE steel than the sheet says.
   *
   * So the comparison is split. Where both describe the same section, they
   * must agree closely. Where they do not, the difference is named and its
   * direction is pinned, because a reader cross-checking against the
   * workbook will see two different numbers and deserves to know which of
   * the two accounts for the second layer.
   */
  for (const Mu of [90, 100, 110]) {
    it(`Mu = ${Mu} kN·m: one layer, so within 2 % of the sheet`, () => {
      const w = workbookDouble(G.b, G.h, G.ds, G.dPrime, G.fc, G.fy, Mu);
      const r = solveFlex({
        mode: 'design', kase: 'FSR', fc: G.fc, fy: G.fy, b: G.b, h: G.h,
        dPrimeS: G.ds, dPrime: G.dPrime, Pu: 0, Mu,
      } as unknown as FlexInput);

      expect(r.barChoice!.layers, 'still a single layer').toBe(1);
      const As = r.AsCm2!;
      const AsPrime = r.AsPrimeCm2!;
      expect(AsPrime, 'top steel is proposed').toBeGreaterThan(0);

      /*
       * Close, because it is the same clauses. Not equal, because the sheet
       * works the stress block in closed form and this works the strain
       * distribution — and where they part, ours must be the heavier.
       */
      expect(Math.abs(As / w.AsCm2 - 1), `As: ours ${As.toFixed(3)}, sheet ${w.AsCm2.toFixed(3)}`)
        .toBeLessThan(0.02);
      expect(Math.abs(AsPrime / w.AsPrimeCm2 - 1),
        `A's: ours ${AsPrime.toFixed(3)}, sheet ${w.AsPrimeCm2.toFixed(3)}`)
        .toBeLessThan(0.02);
      expect(As, 'never lighter than the sheet').toBeGreaterThanOrEqual(w.AsCm2);
    });
  }

  it('once the bars must stack, it asks for more than the sheet — and says why', () => {
    /*
     * Mu = 120 kN·m on the sheet's own 12 × 40 section. Three Ø25 no longer
     * fit side by side in a 12 cm web, so they go 2 + 1, the centroid moves
     * from 34 mm to 51 mm off the face, and `d` drops by 17 mm.
     *
     * The sheet answers 10.08 cm² at the full 36.6 cm depth. That depth is
     * not available to those bars. Ours is the heavier answer and it is
     * heavier for a reason that can be pointed at.
     */
    const Mu = 120;
    const w = workbookDouble(G.b, G.h, G.ds, G.dPrime, G.fc, G.fy, Mu);
    const r = solveFlex({
      mode: 'design', kase: 'FSR', fc: G.fc, fy: G.fy, b: G.b, h: G.h,
      dPrimeS: G.ds, dPrime: G.dPrime, Pu: 0, Mu,
    } as unknown as FlexInput);

    expect(r.barChoice!.layers, 'two layers').toBe(2);
    expect(r.AsCm2!, 'heavier than the sheet').toBeGreaterThan(w.AsCm2);

    /* And the extra steel is explained by the lost depth, not by drift. */
    const centroid = r.barChoice!.centroidFromFaceM!;
    expect(centroid, 'centroid has moved off the cover').toBeGreaterThan(G.ds + 0.005);
    const dLost = centroid - G.ds;
    /*
     * A first-order check: the steel scales roughly as 1/d, so losing
     * `dLost` off a lever arm of about `d − a/2` should cost a few per cent
     * and not thirty. It ties the divergence to the geometry rather than
     * leaving "ours is bigger" as the whole story.
     */
    const expectedRise = dLost / (G.h - G.ds);
    expect(r.AsCm2! / w.AsCm2 - 1).toBeGreaterThan(expectedRise * 0.3);
    expect(r.AsCm2! / w.AsCm2 - 1).toBeLessThan(expectedRise * 3);

    /*
     * The memo has to say it, or a reader cannot reconcile the two numbers.
     * Asserted on the KEY rather than the sentence: the engine emits
     * `{ key, params }` and the wording is the UI's to change.
     */
    expect(r.steps.map((s) => s.key)).toContain('flex.step.dLayers');
  });

  it('the compression steel it proposes is bars, not just an area', () => {
    /*
     * The half of this the workbook does not do. Its double block stops at
     * A's in cm²; the question a person has next is how many bars of what
     * diameter, and whether they clear the width alongside the stirrup.
     */
    const r = solveFlex({
      mode: 'design', kase: 'FSR', fc: G.fc, fy: G.fy, b: 0.30, h: 0.50,
      dPrimeS: 0.05, dPrime: 0.05, Pu: 0, Mu: 400,
    } as unknown as FlexInput);
    expect(r.AsPrimeCm2!).toBeGreaterThan(0);
    expect(r.barChoiceComp, 'top bars are proposed too').toBeDefined();
    expect(r.barChoiceComp!.areaCm2).toBeGreaterThanOrEqual(r.AsPrimeCm2! - 1e-9);
  });
});
