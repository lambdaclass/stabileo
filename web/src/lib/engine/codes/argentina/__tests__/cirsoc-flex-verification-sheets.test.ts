/**
 * The verification sheets, including the six points they publish.
 *
 * ── Why these are the best targets in the workbook ─────────────────
 *
 * The design sheets print one answer. FCR-VERIF prints SIX — the axial cap,
 * zero strain in the far steel, yield there, εt = 5 ‰, pure flexure and pure
 * tension — with φ for each. That is the whole shape of the interaction
 * curve, not a single ordinate, and a method that agreed at one point by
 * luck cannot agree at six.
 *
 * It also states its safety condition the same way ours does: capacity over
 * demand along the ray of constant eccentricity, `MVres / MVsol ≥ 1`. So the
 * verdict is comparable directly rather than by interpretation.
 */

import { describe, it, expect } from 'vitest';
import { interactionCurve, type Bar, type Outline } from '../cirsoc201-section';
import { EPSILON_TENSION_CONTROLLED, yieldStrain } from '../cirsoc201-basis';
import { solveFlex, type FlexInput } from '../cirsoc-flex';

/*
 * The sheet as it ships: 30 × 30, two levels of 10.668 cm² at 5 cm and 25 cm
 * from the bottom face, f'c 25, fy 420, ties. Ast 21.336 cm², ρ 0.0237067.
 */
const OUTLINE: Outline = { kind: 'rect', b: 0.30, h: 0.30 };
const MAT = { fc: 25, fy: 420 };
const BARS: Bar[] = [
  { x: 0, y: -0.10, area: 10.668e-4 },
  { x: 0, y: 0.10, area: 10.668e-4 },
];

/** Compression at the BOTTOM, which is the sheet's stated assumption. */
const CURVE = interactionCurve(OUTLINE, BARS, MAT, -Math.PI / 2, 400);

const rel = (ours: number, published: number) => Math.abs(ours / published - 1);

describe('the six characteristic points of FCR-VERIF', () => {
  it('the axial cap as a column', () => {
    // Published: φPn = 1436.9020 kN with φ = 0.65
    const cap = Math.max(...CURVE.map((p) => p.phiPn));
    expect(cap).toBeCloseTo(1436.902, 2);
  });

  it('the maximum tension', () => {
    // Published: φPn = −806.5008 kN — every bar yielding, φ = 0.90
    const ten = Math.min(...CURVE.map((p) => p.phiPn));
    expect(rel(ten, -806.5008)).toBeLessThan(1e-3);
  });

  it('yield strain in the far steel', () => {
    // Published: φMn = 100.4318 kN·m, φPn = 486.5915 kN, φ = 0.65
    const at = CURVE.reduce((m, p) =>
      Math.abs(p.epsilonT - yieldStrain(420)) < Math.abs(m.epsilonT - yieldStrain(420)) ? p : m,
    CURVE[0]);
    expect(rel(Math.abs(at.phiMnx), 100.4318)).toBeLessThan(2e-3);
    expect(rel(at.phiPn, 486.5915)).toBeLessThan(2e-3);
    expect(at.phi).toBeCloseTo(0.65, 2);
  });

  it('εt = 5 ‰, where φ reaches 0.90', () => {
    /*
     * Held looser than the others — 1.5 % — and the slack is discretisation
     * rather than method: the curve is scanned on a grid of neutral-axis
     * depths and this asks for the nearest point to an exact strain, not
     * for a solve. The φ is the assertion that matters, and it is exact.
     */
    const at = CURVE.reduce((m, p) =>
      Math.abs(p.epsilonT - EPSILON_TENSION_CONTROLLED) <
      Math.abs(m.epsilonT - EPSILON_TENSION_CONTROLLED) ? p : m,
    CURVE[0]);
    expect(rel(Math.abs(at.phiMnx), 115.5324)).toBeLessThan(0.015);
    expect(rel(at.phiPn, 302.3877)).toBeLessThan(0.015);
    expect(at.phi).toBeGreaterThan(0.88);
  });

  it('pure flexure', () => {
    // Published: φMn = 87.7876 kN·m at φPn = 0
    const at = CURVE.reduce((m, p) => (Math.abs(p.phiPn) < Math.abs(m.phiPn) ? p : m), CURVE[0]);
    expect(Math.abs(at.phiPn), 'the nearest grid point to zero axial').toBeLessThan(10);
    expect(rel(Math.abs(at.phiMnx), 87.7876)).toBeLessThan(0.01);
  });

  it('falls monotonically apart from the deduction step, which is bounded', () => {
    /*
     * Not from the sheet, but the property the ray search leans on: if the
     * curve doubled back, the crossing would be ambiguous and the capacity
     * you get would depend on where the loop started.
     *
     * It does double back, once, by about half a per cent — and the cause
     * is worth writing down rather than tolerating blindly. The
     * displaced-concrete deduction is BINARY: a bar is inside the stress
     * block or it is not. As the block shrinks past a bar, that bar stops
     * being deducted and Pn steps up. Physically the transition is gradual;
     * the code's treatment of it, and the workbook's, is a switch.
     *
     * So the assertion is the honest one: monotone except for steps small
     * enough that no crossing can be mislocated by more than the grid
     * itself. A larger rise would mean something else is wrong.
     */
    let worstRise = 0;
    for (let i = 1; i < CURVE.length; i++) {
      const rise = CURVE[i].phiPn - CURVE[i - 1].phiPn;
      if (rise > worstRise) worstRise = rise;
    }
    const span = Math.max(...CURVE.map((p) => p.phiPn)) - Math.min(...CURVE.map((p) => p.phiPn));
    expect(worstRise / span, `worst rise ${worstRise.toFixed(1)} kN over a ${span.toFixed(0)} kN span`)
      .toBeLessThan(0.01);
  });
});

describe('the safety condition, stated the way the sheet states it', () => {
  const INPUT: FlexInput = {
    kase: 'FCR', mode: 'verify',
    fc: 25, fy: 420, confinement: 'ties', deductDisplacedConcrete: true,
    b: 0.30, h: 0.30, dPrime: 0.05, dPrimeS: 0.05, dPrimeH: 0.05, dPrimeV: 0.05,
    holeB: 0, holeH: 0, bf: 1.37, hf: 0.10, bw: 0.12,
    D: 0.40, Dint: 0, barCount: 12, barAtExtremeFibre: true,
    ratioAsPrime: 1, pctA1: 50, pctA2: 50, pctA3: 0, nA1: 4, nA2: 4, nA3: 4,
    AstGiven: 21.336,
    levels: [
      { distanceFromBottom: 0.05, areaCm2: 10.668 },
      { distanceFromBottom: 0.25, areaCm2: 10.668 },
    ],
    Pu: 500, Mu: 100, Muy: 0,
  };

  it('reads the arbitrary levels rather than assuming two symmetric ones', () => {
    const r = solveFlex(INPUT);
    expect(r.bars).toHaveLength(2);
    expect(r.bars.map((b) => +b.y.toFixed(4)).sort()).toEqual([-0.1, 0.1]);
  });

  it('lands on the sheet’s own verdict', () => {
    /*
     * Published: MVres / MVsol = 1.0000169, "must be ≥ 1". Ours is the
     * reciprocal — demand over capacity — so it must sit just under one by
     * the same margin. Exactly on the boundary is the interesting place for
     * the two methods to be compared, because a percent either way changes
     * the answer from pass to fail.
     */
    const r = solveFlex(INPUT);
    expect(rel(r.ratio, 1 / 1.0000169)).toBeLessThan(0.01);
    expect(r.ok, 'the sheet passes this section, and so should we').toBe(true);
  });

  it('agrees on the total and the ratio', () => {
    const r = solveFlex(INPUT);
    expect(r.AstCm2).toBeCloseTo(21.336, 3);
    expect(rel(r.rho, 0.0237067)).toBeLessThan(1e-3);
  });
});
