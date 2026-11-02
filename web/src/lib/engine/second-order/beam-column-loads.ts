import type { PMember, PMemberLoad } from '../steps/plane-model';
import { solveDense } from '../steps/sway-modes';

type Basis = { b2: number; b3: number; s1: number };

function basis(mu: number, x: number): Basis {
  if (Math.abs(mu) * x * x <= 1) {
    let s1 = 0, b2 = 0, b3 = 0, c = 1, e = x;
    for (let n = 1; n <= 30; n++) {
      const e1 = e, e2 = (e1 * x) / (2 * n), e3 = (e2 * x) / (2 * n + 1);
      s1 += c * e1; b2 += c * e2; b3 += c * e3;
      c *= -mu;
      e = e3;
    }
    return { s1, b2, b3 };
  }
  if (mu > 0) {
    const k = Math.sqrt(mu);
    return { s1: Math.sin(k * x) / k, b2: (1 - Math.cos(k * x)) / mu, b3: (k * x - Math.sin(k * x)) / (mu * k) };
  }
  const k = Math.sqrt(-mu);
  return { s1: Math.sinh(k * x) / k, b2: (Math.cosh(k * x) - 1) / (k * k), b3: (Math.sinh(k * x) - k * x) / (k * k * k) };
}

function tension(k: number, L: number): { shape: (x: number) => number[]; slope: (x: number) => number[] } | null {
  const s = Math.exp(-k * L);
  const A = [[1, 0, 1, s], [0, 1, -k, k * s], [1, L, s, 1], [0, 1, -k * s, k]];
  const coef: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const c = solveDense(A.map((r) => r.slice()), [0, 1, 2, 3].map((j) => (j === i ? 1 : 0)));
    if (!c || !c.every(Number.isFinite)) return null;
    coef.push(c);
  }
  return {
    shape: (x) => { const a = Math.exp(-k * x), b = Math.exp(k * (x - L)); return coef.map((c) => c[0] + c[1] * x + c[2] * a + c[3] * b); },
    slope: (x) => { const a = Math.exp(-k * x), b = Math.exp(k * (x - L)); return coef.map((c) => c[1] - k * c[2] * a + k * c[3] * b); },
  };
}

const G5 = [
  [-0.906179845938664, 0.2369268850561891], [-0.5384693101056831, 0.4786286704993665],
  [0, 0.5688888888888889], [0.5384693101056831, 0.4786286704993665], [0.906179845938664, 0.2369268850561891],
] as const;

/**
 * The transverse equivalent end loads [Vᵢ, Mᵢ, Vⱼ, Mⱼ] along local v and θ (the member's own axes,
 * uncondensed) of `loads` under the axial force N, tension positive. Null at a pole (the clamped
 * member buckles alone).
 */
export function beamColumnEndLoads(m: Pick<PMember, 'L' | 'EI'>, N: number, loads: readonly PMemberLoad[]): number[] | null {
  const { L } = m;
  const mu = -N / m.EI;
  const k = Math.sqrt(Math.abs(mu));
  const taut = mu < 0 && k * L > 1 ? tension(k, L) : null;
  if (mu < 0 && k * L > 1 && !taut) return null;
  const end = basis(mu, L);
  const det = end.b2 * end.b2 - end.b3 * end.s1;
  if (!taut && (!Number.isFinite(det) || Math.abs(det) <= 1e-14 * L ** 4)) return null;
  const ends: Array<[number, number, number, number]> = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  const coef = ends.map(([v0, t0, vL, tL]) => {
    const r1 = vL - v0 - t0 * L, r2 = tL - t0;
    return [v0, t0, (r1 * end.b2 - r2 * end.b3) / det, (end.b2 * r2 - end.s1 * r1) / det];
  });
  const shape = taut ? taut.shape : (x: number) => {
    const b = basis(mu, x);
    return coef.map((c) => c[0] + c[1] * x + c[2] * b.b2 + c[3] * b.b3);
  };
  const slope = taut ? taut.slope : (x: number) => {
    const b = basis(mu, x);
    return coef.map((c) => c[1] + c[2] * b.s1 + c[3] * b.b2);
  };
  const out = [0, 0, 0, 0];
  for (const l of loads) {
    if (l.kind === 'point') {
      const s = shape(l.a), t = slope(l.a);
      for (let i = 0; i < 4; i++) out[i] += l.p * s[i] + l.m * t[i];
    } else if (l.kind === 'dist') {
      const { a, b, qa, qb } = l;
      if (!(b > a)) continue;
      const parts = Math.max(4, Math.ceil(2 * k * (b - a)));
      const h = (b - a) / parts;
      for (let j = 0; j < parts; j++) {
        const c = a + h * (j + 0.5);
        for (const [g, w] of G5) {
          const x = c + (h / 2) * g;
          const q = qa + ((qb - qa) * (x - a)) / (b - a);
          const s = shape(x);
          for (let i = 0; i < 4; i++) out[i] += (w * h / 2) * q * s[i];
        }
      }
    }
  }
  return out;
}
