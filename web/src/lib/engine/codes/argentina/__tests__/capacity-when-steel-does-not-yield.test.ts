/**
 * Verification capacities come from strain compatibility, not from fy.
 *
 * ── The defect this file pins ──────────────────────────────────────
 *
 * `rectCapacity` and `flangedCapacity` closed equilibrium C = T with the
 * steel stress set to fy unconditionally. For a lightly reinforced section
 * that is right — the bars yield — and for a heavily reinforced one it is a
 * phantom: the concrete crushes with the bars still elastic, and the
 * fy-based moment keeps growing with As without bound. A verification,
 * which exists to refuse bad sections, was handing the worst sections the
 * biggest capacities.
 *
 * The numbers below are the same section three ways. On a 20 × 50 with
 * f'c 25, fy 420 and d = 0.454 m:
 *
 *   As = 10 cm²   the steel yields (εt = 8.7 ‰) and nothing changes
 *   As = 35 cm²   εt falls to 1.55 ‰, the steel carries 309 MPa, and the
 *                 honest moment is 353.55 kN·m — the fy-based formula was
 *                 reporting 413.16, 17 % the section does not have
 *
 * The over-reinforced expectations are worked in this file's header
 * arithmetic and pinned to four figures; the yield case pins that the fix
 * leaves the ordinary path untouched.
 */

import { describe, it, expect } from 'vitest';
import { rectCapacity, flangedCapacity } from '../cirsoc201-capacity';
import type { ConcreteDesignParams } from '../cirsoc201';

const P: ConcreteDesignParams = { fc: 25, fy: 420, cover: 0.03, b: 0.20, h: 0.50, stirrupDia: 8 };

describe('a rectangular section, verified', () => {
  it('a lightly reinforced one yields, and the answer is the one it always gave', () => {
    /*
     * a = As·fy / (α₁·f'c·b) = 0.0988 m, εt = 8.71 ‰ → φ = 0.90.
     * Mn = As·fy·(d − a/2) = 169.93 kN·m.
     */
    const r = rectCapacity(P, 10);
    expect(r.fs).toBeCloseTo(420, 6);
    expect(r.epsilonT).toBeCloseTo(0.0087148, 4);
    expect(r.Mn).toBeCloseTo(169.927, 3);
    expect(r.phiMn).toBeCloseTo(0.9 * 169.927, 3);
    expect(r.exceedsPracticalMax).toBe(false);
  });

  it('an over-reinforced one returns the strain-limited capacity, not the fy one', () => {
    /*
     * As = 35 cm² is past the balanced steel (23.0 cm²) and under the 4 %
     * ceiling (40 cm²) — the case that isolates the defect.
     *
     * Equilibrium with fs = εt·Es gives a quadratic in c:
     *   As·Es·εcu·(d − c) = α₁·f'c·b·β₁·c²
     * → c = 0.2996 m, εt = 1.546 ‰, fs = 309.2 MPa (< fy)
     * → Mn = As·fs·(d − a/2) = 353.55 kN·m
     * The fy-based formula this replaced reports 413.16 — 17 % phantom.
     */
    const r = rectCapacity(P, 35);
    expect(r.fs).toBeLessThan(420);
    expect(r.fs).toBeCloseTo(309.23, 2);
    expect(r.epsilonT).toBeCloseTo(0.0015461, 4);
    expect(r.c).toBeCloseTo(0.29960, 4);
    expect(r.Mn).toBeCloseTo(353.553, 3);
    /* εt < εy, so φ is the compression-controlled 0.65. */
    expect(r.phi).toBeCloseTo(0.65, 10);
    expect(r.phiMn).toBeCloseTo(0.65 * 353.553, 3);
    expect(r.exceedsPracticalMax).toBe(false);
  });

  it('and the memo says the steel does not yield when it does not', () => {
    const r = rectCapacity(P, 35);
    const memo = r.steps.join('\n');
    expect(memo).toContain('la armadura no fluye');
    expect(memo).toContain('309');
  });

  it('past the 4 %·b·h ceiling it refuses, with the bigger-section remedy', () => {
    /*
     * 4 % of 20 × 50 is 40 cm². The same ceiling `checkFlexure` states —
     * the two capacity paths refuse absurd sections identically, instead of
     * one of them reporting an ever-larger number.
     */
    const r = rectCapacity(P, 50);
    expect(r.exceedsPracticalMax).toBe(true);
    expect(r.steps.join('\n')).toContain('agrandar la sección');
  });

  it('more steel no longer buys unbounded moment', () => {
    /*
     * The phantom's signature: under fy the moment grew with As forever.
     * From 35 to 39 cm² the strain-limited moment barely moves — the
     * concrete is what is carrying, and it is full.
     */
    const m35 = rectCapacity(P, 35).Mn;
    const m39 = rectCapacity(P, 39).Mn;
    expect(m39 / m35).toBeLessThan(1.03);
    /* The fy formula would have promised 12 % more. */
    expect(39 / 35).toBeGreaterThan(1.10);
  });
});

describe('a flanged section, verified', () => {
  const T = { bf: 1.37, hf: 0.10, bw: 0.12 };

  it('a block inside the flange yields, and the answer is the one it always gave', () => {
    /*
     * d = 0.360 m; a = As·fy / (α₁·f'c·bf) = 0.0072 m, well under hf.
     * Mn = As·fy·(d − a/2) = 74.84 kN·m, εt huge → φ = 0.90.
     */
    const r = flangedCapacity({ ...P, h: 0.40, cover: 0.024 }, T, 5);
    expect(r.withinFlange).toBe(true);
    expect(r.fs).toBeCloseTo(420, 6);
    expect(r.Mn).toBeCloseTo(74.8426, 3);
  });

  it('a block in the web with elastic steel is limited by the strain, not by fy', () => {
    /*
     * bf 0.60, hf 0.10, bw 0.20, h 0.50, As = 50 cm². The overhangs carry
     * Cf = 850 kN; the web closes the rest. Strain compatibility:
     *   As·Es·εcu·(d − c) = c·(Cf + α₁·f'c·bw·β₁·c)
     * → c = 0.2801 m, εt = 1.862 ‰, fs = 372.4 MPa
     * → Mn = Cf·(d − hf/2) + Cw·(d − a/2) = 682.36 kN·m
     * The fy-based formula reported 727.08.
     *
     * 50 cm² is also past this web's 4 % ceiling (40 cm²): the refusal and
     * the strain-limited number are both the honest answer, so both are
     * asserted.
     */
    const r = flangedCapacity(P, { bf: 0.60, hf: 0.10, bw: 0.20 }, 50);
    expect(r.withinFlange).toBe(false);
    expect(r.fs).toBeCloseTo(372.40, 2);
    expect(r.Mn).toBeCloseTo(682.356, 3);
    expect(r.steps.join('\n')).toContain('la armadura no fluye');
    expect(r.exceedsPracticalMax).toBe(true);
    expect(r.steps.join('\n')).toContain('agrandar la sección');
  });
});
