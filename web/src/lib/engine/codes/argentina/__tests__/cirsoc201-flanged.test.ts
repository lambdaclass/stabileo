/**
 * The T beam, checked against the rectangle it is supposed to become.
 *
 * ── Why the assertions are mostly comparisons ──────────────────────
 *
 * There is no independent flexural engine here to check against, and inventing
 * one in the test file would only prove that two implementations of the same
 * formula agree. What CAN be checked is the claim this module actually makes:
 * that a T is the rectangle the code says it is in each of its two cases, and
 * that the boundary between them is not a step.
 *
 *   · a shallow block makes the section a rectangle of width bf — so it must
 *     give the SAME steel as asking for that rectangle outright
 *   · a very wide flange makes the web irrelevant to compression — so a T and
 *     a rectangle of width bf converge as bw shrinks
 *   · nothing may jump as the block crosses hf
 *
 * Equilibrium is the one absolute: the steel returned, in tension, must
 * balance the concrete in compression at the depth the module reports.
 */

import { describe, it, expect } from 'vitest';
import { checkFlexure, type ConcreteDesignParams } from '../cirsoc201';
import { checkFlexureFlanged, flangedBlockDepth } from '../cirsoc201-flanged';

const P: ConcreteDesignParams = {
  fc: 25, fy: 420, cover: 0.03, b: 0.2, h: 0.6, stirrupDia: 8,
};

/** A generous flange: 1.2 m wide, 10 cm thick, over a 20 cm web. */
const T = { bf: 1.2, hf: 0.10, bw: 0.20 };

describe('a T beam whose block stays in the flange', () => {
  it('is the rectangle of width bf, to the last cm²', () => {
    /*
     * 120 kN·m on this section puts the block well inside a 10 cm flange, so
     * the module must not merely approximate the rectangle — it must BE it.
     * Any drift here means a second flexural path has appeared.
     */
    const t = checkFlexureFlanged(P, T, 120);
    const rect = checkFlexure({ ...P, b: T.bf }, 120);
    expect(t.withinFlange).toBe(true);
    expect(t.AsFlexural).toBeCloseTo(rect.AsFlexural, 6);
    expect(t.phiMn).toBeCloseTo(rect.phiMn, 6);
    expect(t.AsFlange).toBe(0);
  });

  it('takes its minimum steel from the web, not the flange', () => {
    /*
     * §9.6.1.2 is written on bw. With bf six times bw, using the flange would
     * demand roughly six times the minimum — a real over-reinforcement, and
     * the kind that looks like a safe mistake.
     */
    const t = checkFlexureFlanged(P, T, 120);
    const rect = checkFlexure({ ...P, b: T.bf }, 120);
    expect(t.AsMin).toBeLessThan(rect.AsMin);
    const rhoMin = Math.max((0.25 * Math.sqrt(P.fc)) / P.fy, 1.4 / P.fy);
    expect(t.AsMin).toBeCloseTo(rhoMin * T.bw * t.d * 1e4, 6);
  });
});

describe('a T beam whose block reaches the web', () => {
  it('splits the moment and reports the flange steel separately', () => {
    const t = checkFlexureFlanged(P, { bf: 0.5, hf: 0.06, bw: 0.2 }, 420);
    expect(t.withinFlange).toBe(false);
    expect(t.AsFlange).toBeGreaterThan(0);
    expect(t.AsReq).toBeGreaterThan(t.AsFlange);
  });

  it('needs more steel than the same moment on the flange-only case', () => {
    const shallow = checkFlexureFlanged(P, T, 120);
    const deep = checkFlexureFlanged(P, T, 400);
    expect(deep.AsReq).toBeGreaterThan(shallow.AsReq);
  });

  it('carries more than its web alone would', () => {
    /*
     * The flange couple is the difference between a T and the rectangle you
     * would have if you sawed the flange off. Reporting only the web's
     * capacity would understate the section by the part that makes it a T.
     */
    const geom = { bf: 0.9, hf: 0.08, bw: 0.2 };
    const t = checkFlexureFlanged(P, geom, 380);
    const webOnly = checkFlexure({ ...P, b: geom.bw }, 380);
    expect(t.phiMn).toBeGreaterThan(webOnly.phiMn);
  });
});

describe('the boundary between the two cases', () => {
  it('does not jump as the block crosses hf', () => {
    /*
     * The two cases are different code. If they disagree at the crossing, a
     * beam designed at 199 kN·m and the same beam at 201 would come back with
     * unrelated answers, and nothing in the result would say why.
     *
     * The moment where the flange is exactly used up is found by bisection,
     * then the steel is compared either side of it.
     */
    const geom = { bf: 0.8, hf: 0.08, bw: 0.2 };
    let lo = 50, hi = 900;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (checkFlexureFlanged(P, geom, mid).withinFlange) lo = mid; else hi = mid;
    }
    const below = checkFlexureFlanged(P, geom, lo * 0.999);
    const above = checkFlexureFlanged(P, geom, hi * 1.001);
    expect(below.withinFlange).toBe(true);
    expect(above.withinFlange).toBe(false);

    const jump = Math.abs(above.AsReq - below.AsReq) / below.AsReq;
    expect(jump, `steel jumps ${(jump * 100).toFixed(1)}% across the boundary`)
      .toBeLessThan(0.15);
  });
});

describe('the block depth a given steel area produces', () => {
  it('stays in the flange for a small area and enters the web for a large one', () => {
    const small = flangedBlockDepth(P, T, 8);
    expect(small.withinFlange).toBe(true);
    expect(small.a).toBeLessThanOrEqual(T.hf);

    /*
     * The flange is used up at α₁·f'c·bf·hf / fy = 60.7 cm² for this section,
     * so 60 is still inside it — the first draft of this test asserted the
     * wrong side of a boundary it had not computed.
     */
    const large = flangedBlockDepth(P, T, 70);
    expect(large.withinFlange).toBe(false);
    expect(large.a).toBeGreaterThan(T.hf);
  });

  it('balances the steel in tension against the concrete in compression', () => {
    /*
     * The one assertion that owes nothing to the rest of the module. Whatever
     * `a` it reports, the compression block at that depth must equal As·fy —
     * flange overhangs plus web, or plain flange.
     */
    for (const As of [8, 20, 45, 70, 80, 120]) {
      const { a, withinFlange } = flangedBlockDepth(P, T, As);
      const T_force = As * 1e-4 * P.fy * 1000; // kN
      const alpha1 = 0.85;
      const C = withinFlange
        ? alpha1 * P.fc * 1000 * T.bf * a
        : alpha1 * P.fc * 1000 * ((T.bf - T.bw) * T.hf + T.bw * a);
      expect(C, `As = ${As} cm²`).toBeCloseTo(T_force, 4);
    }
  });
});
