import { generalizedEigen, eigenErrorBound, symmetricEigen, negativeEigenvalues, ldltNegatives } from '../dense';
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
    for (const [a, b] of [[false, false], [true, false], [false, true], [true, true]] as const) {
      for (const u of [1e-15, 1e-13, 1e-9]) expect(clampedModesBelow(u, a, b)).toBe(0);
    }
    expect(clampedModesBelow(8.99, false, false)).toBe(2);
    expect(clampedModesBelow(4.49, true, false)).toBe(0);
    expect(clampedModesBelow(4.5, false, true)).toBe(1);
    expect(clampedModesBelow(Math.PI + 1e-6, true, true)).toBe(1);
    expect(clampedModesBelow(2 * Math.PI + 1e-6, true, true)).toBe(2);
  });
});

describe('the generalized eigenproblem K·x = λ·G·x', () => {
  it('a strongly tensioned DOF does not hide a compressed one: K = I, G = diag(−1e8, 1) keeps λ = 1', () => {
    const modes = generalizedEigen([[1, 0], [0, 1]], [[-1e8, 0], [0, 1]]);
    expect(modes?.map((m) => m.lambda)).toEqual([expect.closeTo(1, 12)]);
  });

  it('a far stronger tension does not hide it either: G = diag(−1e14, 1), also turned 30° with K = I', () => {
    expect(generalizedEigen([[1, 0], [0, 1]], [[-1e14, 0], [0, 1]])?.map((m) => m.lambda)).toEqual([expect.closeTo(1, 12)]);
    const c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6);
    const G = [[c * c * -1e14 + s * s, c * s * (-1e14 - 1)], [c * s * (-1e14 - 1), s * s * -1e14 + c * c]];
    const turned = generalizedEigen([[1, 0], [0, 1]], G)!;
    expect(turned).toHaveLength(1);
    expect(turned[0].lambda).toBeGreaterThan(0.9);
    expect(turned[0].lambda).toBeLessThan(1.1);
  });

  it('a positive μ within its own error bound is not a mode', () => {
    expect(eigenErrorBound([[1e14, 0], [0, 0]], 1e-3, [1, 1e-9])).toBeGreaterThan(1e-3);
    expect(eigenErrorBound([[2, 0], [0, 1]], 1, [0, 1])).toBeLessThan(1e-14);
  });

  it('a mode far above the first is kept: K = I, G = diag(1, 1e-7) gives λ = 1 and 1e7', () => {
    const modes = generalizedEigen([[1, 0], [0, 1]], [[1, 0], [0, 1e-7]]);
    expect(modes?.map((m) => m.lambda)).toEqual([expect.closeTo(1, 12), expect.closeTo(1e7, 4)]);
  });
});

describe('symmetric eigenvalues', () => {
  it('a large eigenvalue does not hide an unresolved block', () => {
    const v = [...symmetricEigen([[1e16, 0, 0], [0, 2, 1], [0, 1, 2]]).values].sort((a, b) => a - b);
    expect(v[0]).toBeCloseTo(1, 12);
    expect(v[1]).toBeCloseTo(3, 12);
  });

  it('with no global floor either: diag(1e32, [[2, 1], [1, 2]]) gives 1 and 3', () => {
    const v = [...symmetricEigen([[1e32, 0, 0], [0, 2, 1], [0, 1, 2]]).values].sort((a, b) => a - b);
    expect(v[0]).toBeCloseTo(1, 12);
    expect(v[1]).toBeCloseTo(3, 12);
  });
});

describe('the inertia count', () => {
  it('a zero pivot does not hide a negative eigenvalue: [[0, 1e8], [1e8, 1e16]] has one', () => {
    expect(negativeEigenvalues([[0, 1e8], [1e8, 1e16]])).toBe(1);
    expect(negativeEigenvalues([[2, 1], [1, 2]])).toBe(0);
    expect(negativeEigenvalues([[1, 2], [2, 1]])).toBe(1);
  });

  it('a scale disparity does not hide a negative eigenvalue: [[0, 1], [1, 1e16]] has determinant −1, so one', () => {
    expect(negativeEigenvalues([[0, 1], [1, 1e16]])).toBe(1);
    expect(negativeEigenvalues([[1e16, 1], [1, 0]])).toBe(1);
    expect(negativeEigenvalues([[0, 1, 0], [1, 1e16, 0], [0, 0, -3]])).toBe(2);
  });

  it('the LDLᵀ count agrees with the eigenvalues on well-separated matrices, with 1×1 and 2×2 pivots', () => {
    const cases: Array<[number[][], number]> = [
      [[[4, 1, 0], [1, 3, 1], [0, 1, 2]], 0],
      [[[0, 2, 1], [2, 0, 1], [1, 1, 0]], 2],
      [[[-4, 1, 0], [1, -3, 1], [0, 1, -2]], 3],
      [[[1, 5, 0, 0], [5, 1, 0, 0], [0, 0, 2, 7], [0, 0, 7, -1]], 2],
    ];
    for (const [A, neg] of cases) {
      expect(ldltNegatives(A)).toBe(neg);
      expect(negativeEigenvalues(A)).toBe(neg);
    }
  });
});


describe('the tan z = z count of a member with one end released', () => {
  const brute = (u: number) => {
    let n = 0;
    for (let k = 1; k * Math.PI < u; k++) {
      let lo = k * Math.PI + 1e-12, hi = (k + 0.5) * Math.PI - 1e-12;
      for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (Math.tan(m) - m > 0) hi = m; else lo = m; }
      if (lo < u) n++;
    }
    return n;
  };
  it('agrees with bisection on each bracket, roots included on either side', () => {
    for (const u of [4.49, 4.4935, 7.72, 7.73, 10.9, 10.91, 50, 123.4, 1000]) expect(clampedModesBelow(u, true, false)).toBe(brute(u));
    expect(clampedModesBelow(4.4934094579 - 1e-9, true, false)).toBe(0);
    expect(clampedModesBelow(4.4934094579 + 1e-9, true, false)).toBe(1);
  });
  it('answers a huge or infinite kL at once instead of walking every root', () => {
    const t0 = performance.now();
    expect(clampedModesBelow(1e9, true, false)).toBe(Math.floor(1e9 / Math.PI) - 1 + (1e9 > (Math.floor(1e9 / Math.PI) + 0.5) * Math.PI - 1 / ((Math.floor(1e9 / Math.PI) + 0.5) * Math.PI) ? 1 : 0));
    expect(clampedModesBelow(Infinity, true, false)).toBe(Infinity);
    expect(clampedModesBelow(Infinity, false, false)).toBe(Infinity);
    expect(performance.now() - t0).toBeLessThan(100);
  });
});
