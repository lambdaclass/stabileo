/**
 * The doubly reinforced section must come back in equilibrium.
 *
 * `computeFlexureCapacity` used to look for the neutral axis by substituting
 *
 *     c ← (As·fy − Cs(c)) / (α1·f'c·β1·b)
 *
 * twenty times and then using whatever the twentieth pass left, converged or not. With
 * symmetric reinforcement — the ordinary arrangement in a beam — that map has no fixed
 * point: c alternates between the value where the compression steel counts and the value
 * where c < d' and it does not, and each maps back to the other.
 *
 * What came out was not merely imprecise. It was a state where the forces did not balance:
 * the returned c ignored the compression steel while the moment added it, so Cc + Cs
 * exceeded T by 47 %, and φMn came back at 238 kN·m for a section that carries about 164.
 * The error had a direction — always more capacity — and it grew with the compression
 * steel, so it was worst exactly where a beam is most heavily reinforced.
 *
 * These tests pin the property that makes that impossible to return again: whatever the
 * method, the answer balances.
 */
import { describe, it, expect } from 'vitest';
import { computeFlexureCapacity } from '../station-design-forces';

const ALPHA1 = 0.85;
const ES_KPA = 200_000 * 1000;

/**
 * β1 as CIRSOC 201 defines it, restated here so the check does not borrow the
 * implementation's own helper. The break is at 28 MPa, not 30 — writing 30 was this
 * test's first draft, and the assertion caught it, which is the point of restating it.
 */
function beta1Of(fc: number): number {
  if (fc <= 28) return 0.85;
  return Math.max(0.65, 0.85 - 0.05 * (fc - 28) / 7);
}

/** Σ horizontal forces at the returned state, as a fraction of the tension force. */
function equilibriumResidual(
  r: { a: number; c: number }, AsCm2: number, AsCompCm2: number,
  b: number, fc: number, fy: number, dPrime: number,
): number {
  const T = AsCm2 * 1e-4 * fy * 1000;
  const Cc = ALPHA1 * fc * 1000 * r.a * b;
  const eps = r.c > dPrime ? 0.003 * (r.c - dPrime) / r.c : 0;
  const fs = Math.min(ES_KPA * eps, fy * 1000);
  const Cs = AsCompCm2 * 1e-4 * Math.max(0, fs - ALPHA1 * fc * 1000);
  return Math.abs(Cc + Cs - T) / T;
}

describe('doubly reinforced flexural capacity', () => {
  it('balances: the case that used to oscillate now closes on Σ forces = 0', () => {
    // 30×50, H-30, 5 Ø16 per face. d and d' as the verifier computes them.
    const r = computeFlexureCapacity(10.05, 0.30, 0.459, 30, 420, 10.05, 0.041);
    expect(r, 'a symmetric section must be verifiable').not.toBeNull();
    expect(equilibriumResidual(r!, 10.05, 10.05, 0.30, 30, 420, 0.041)).toBeLessThan(1e-3);
  });

  it('a = β1·c, so the block and the neutral axis describe the same section', () => {
    const r = computeFlexureCapacity(10.05, 0.30, 0.459, 30, 420, 10.05, 0.041)!;
    expect(r.a).toBeCloseTo(beta1Of(30) * r.c, 9);
  });

  it('compression steel adds a little, not half again: symmetric steel stays near the singly reinforced value', () => {
    const doubly = computeFlexureCapacity(10.05, 0.30, 0.459, 30, 420, 10.05, 0.041)!;
    const singly = computeFlexureCapacity(10.05, 0.30, 0.459, 30, 420, 0, 0)!;
    // In a section this lightly reinforced the neutral axis is shallow, the compression
    // bars are barely strained, and classical theory gives a few tenths of a percent.
    // The defect returned 1.47× here. Anything above a few percent is that defect again.
    expect(doubly.phiMn).toBeGreaterThanOrEqual(singly.phiMn * 0.97);
    expect(doubly.phiMn).toBeLessThan(singly.phiMn * 1.05);
  });

  it('never reports more capacity as the compression face grows, without balancing for it', () => {
    // Holding the tension face fixed and growing the compression face is the sweep that
    // exposed the defect: 164 → 240 → 400 kN·m with the tension steel untouched.
    const faces: Array<[number, number]> = [[1.57, 10], [10.05, 16], [39.27, 25]];
    const got = faces.map(([asComp]) =>
      computeFlexureCapacity(10.05, 0.30, 0.459, 30, 420, asComp, 0.041));
    for (const [i, r] of got.entries()) {
      expect(r, `compression face ${i} must be verifiable`).not.toBeNull();
      expect(equilibriumResidual(r!, 10.05, faces[i][0], 0.30, 30, 420, 0.041)).toBeLessThan(1e-3);
    }
    const singly = computeFlexureCapacity(10.05, 0.30, 0.459, 30, 420, 0, 0)!;
    const heaviest = got[got.length - 1]!;
    expect(heaviest.phiMn).toBeLessThan(singly.phiMn * 1.05);
  });

  it('a section that needs the compression steel still gets it', () => {
    // Heavily reinforced: the neutral axis goes deep, the compression bars yield, and the
    // contribution is real. The point of the fix is not to suppress it — it is to balance it.
    const doubly = computeFlexureCapacity(40, 0.30, 0.459, 30, 420, 20, 0.041)!;
    const singly = computeFlexureCapacity(40, 0.30, 0.459, 30, 420, 0, 0)!;
    expect(equilibriumResidual(doubly, 40, 20, 0.30, 30, 420, 0.041)).toBeLessThan(1e-3);
    expect(doubly.compYields).toBe(true);
    expect(doubly.phiMn).toBeGreaterThan(singly.phiMn);
  });
});
