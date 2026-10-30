import { describe, it, expect } from 'vitest';
import { stabilityFunctions, memberStability, clampedModesBelow } from '../stability-functions';
import { memberStiffness } from '../member-matrices';
import type { PMember } from '../../steps/plane-model';

/** The textbook closed forms, written independently, in u = kL. */
function closed(u: number, tension: boolean): { s: number; c: number } {
  if (!tension) {
    const s = (u * (Math.sin(u) - u * Math.cos(u))) / (2 - 2 * Math.cos(u) - u * Math.sin(u));
    const c = (u - Math.sin(u)) / (Math.sin(u) - u * Math.cos(u));
    return { s, c };
  }
  const s = (u * (u * Math.cosh(u) - Math.sinh(u))) / (2 - 2 * Math.cosh(u) + u * Math.sinh(u));
  const c = (Math.sinh(u) - u) / (u * Math.cosh(u) - Math.sinh(u));
  return { s, c };
}

describe('stability functions s, c and φ₁…φ₄', () => {
  it('are the first-order member at P = 0: s = 4, c = 1/2, every φ = 1', () => {
    const f = stabilityFunctions(0);
    expect(f.s).toBeCloseTo(4, 12);
    expect(f.c).toBeCloseTo(0.5, 12);
    for (const p of [f.phi1, f.phi2, f.phi3, f.phi4]) expect(p).toBeCloseTo(1, 12);
  });

  it('match the closed forms on both branches, away from P = 0', () => {
    for (const rho of [0.25, 0.5, 1, 1.5, 2, 3, 3.5]) {
      const f = stabilityFunctions(rho);
      const r = closed(Math.PI * Math.sqrt(rho), false);
      expect(f.s).toBeCloseTo(r.s, 9);
      expect(f.c).toBeCloseTo(r.c, 9);
    }
    for (const rho of [-0.25, -0.5, -1, -2, -5, -20]) {
      const f = stabilityFunctions(rho);
      const r = closed(Math.PI * Math.sqrt(-rho), true);
      expect(f.s).toBeCloseTo(r.s, 8);
      expect(f.c).toBeCloseTo(r.c, 9);
    }
  });

  it('take the tabulated values at the Euler load: s = π²/4, c = 1 at ρ = 1', () => {
    const f = stabilityFunctions(1);
    expect(f.s).toBeCloseTo(Math.PI ** 2 / 4, 10);
    expect(f.c).toBeCloseTo(1, 10);
    expect(f.u).toBeCloseTo(Math.PI, 12);
  });

  it('take the tabulated values in tension at ρ = −1: s = 5.1745, c = 0.3381', () => {
    const f = stabilityFunctions(-1);
    expect(f.s).toBeCloseTo(5.1745, 3);
    expect(f.c).toBeCloseTo(0.3381, 3);
  });

  it('vanish where the textbook members buckle: sway and pinned-pinned at ρ = 1, fixed-pinned at kL = 4.4934, fixed-fixed at kL = 2π', () => {
    const e = stabilityFunctions(1);
    expect(e.phi1).toBeCloseTo(0, 10);
    expect(e.s * (1 - e.c * e.c)).toBeCloseTo(0, 9);
    const u = 4.493409457909064;
    expect(stabilityFunctions((u / Math.PI) ** 2).s).toBeCloseTo(0, 8);
    expect(Math.abs(stabilityFunctions(4 - 1e-9).s)).toBeGreaterThan(1e6);
  });

  it('are continuous where the series hands over to the closed forms, and around P = 0', () => {
    const x = 2 / Math.PI ** 2;
    for (const sgn of [1, -1]) {
      const a = stabilityFunctions(sgn * x * (1 - 1e-9)), b = stabilityFunctions(sgn * x * (1 + 1e-9));
      expect(a.s).toBeCloseTo(b.s, 7);
      expect(a.c).toBeCloseTo(b.c, 7);
    }
    const lo = stabilityFunctions(-1e-7), hi = stabilityFunctions(1e-7);
    expect(lo.s).toBeCloseTo(4, 5);
    expect(hi.s).toBeCloseTo(4, 5);
  });

  it('expand to the consistent geometric matrix: 6P/5L, P/10, 2PL/15, −PL/30 to first order in P', () => {
    const m: PMember = { id: 1, i: 1, j: 2, name: 'A–B', L: 3, c: 1, s: 0, E: 2e8, A: 0.01, I: 1e-4, EI: 2e4, EA: 2e6, truss: false, hingeI: false, hingeJ: false };
    const N = -1;
    const exact = memberStiffness(m, N, 'phi').kg;
    const cons = memberStiffness(m, N, 'consistent').kg;
    for (const [a, b] of [[1, 1], [1, 2], [2, 2], [2, 5], [1, 5]]) expect(exact[a][b]).toBeCloseTo(cons[a][b], 5);
    expect(cons[1][1]).toBeCloseTo((6 * N) / (5 * m.L), 12);
    expect(cons[1][2]).toBeCloseTo(N / 10, 12);
    expect(cons[2][2]).toBeCloseTo((2 * N * m.L) / 15, 12);
    expect(cons[2][5]).toBeCloseTo((-N * m.L) / 30, 12);
  });

  it('read N through ρ = −N/P_E', () => {
    const f = memberStability(-(Math.PI ** 2) * 2e4 / 9, 2e4, 3);
    expect(f.rho).toBeCloseTo(1, 12);
  });

  it('count the buckling loads of a member with its ends held (J₀)', () => {
    expect(clampedModesBelow(2 * Math.PI - 1e-6, false, false)).toBe(0);
    expect(clampedModesBelow(2 * Math.PI + 1e-6, false, false)).toBe(1);
    expect(clampedModesBelow(8.99, false, false)).toBe(2);
    expect(clampedModesBelow(4.49, true, false)).toBe(0);
    expect(clampedModesBelow(4.5, false, true)).toBe(1);
    expect(clampedModesBelow(Math.PI + 1e-6, true, true)).toBe(1);
    expect(clampedModesBelow(2 * Math.PI + 1e-6, true, true)).toBe(2);
  });
});
