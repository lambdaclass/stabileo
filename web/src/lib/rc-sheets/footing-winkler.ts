/**
 * A strip of a footing as a beam on Winkler springs (GA §6.4, §14.3): nodes every `dx` at most,
 * a spring k·Δx·b at each, the ends stiffened to `ends` times k over a fifth of the length each
 * and back to k linearly; columns as point loads and couples at their nearest node.
 */

export interface WinklerLoad { s: number; P: number; M: number }

export interface WinklerStrip {
  /** Length and width, m; flexural stiffness, kN·m²; subgrade modulus, kN/m³. */
  S: number; b: number; EI: number; ks: number;
  /** The spring stiffening at the ends, ×k (GA §14.3: 2). */
  ends: number;
  /** Loads by their position from the strip's start, m: P down, kN; M, kN·m, positive when it bends the strip's bottom in tension past it. */
  loads: readonly WinklerLoad[];
  dx?: number;
}

export interface WinklerResult {
  /** Settlement at each node, m, positive down; the soil pressure, kPa. */
  s: number[]; y: number[]; q: number[];
  /** Moment at each node, kN·m, positive with the bottom in tension; shear between nodes, kN. */
  M: number[]; V: number[];
}

function solveBanded(K: number[][], f: number[], band: number): number[] {
  const n = f.length;
  const a = K.map((r) => [...r]), b = [...f];
  for (let i = 0; i < n; i++) {
    const piv = a[i]![i]!;
    for (let r = i + 1; r < Math.min(n, i + band + 1); r++) {
      const m = a[r]![i]! / piv;
      if (m === 0) continue;
      for (let c = i; c < Math.min(n, i + band + 1); c++) a[r]![c]! -= m * a[i]![c]!;
      b[r]! -= m * b[i]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let t = b[i]!;
    for (let c = i + 1; c < Math.min(n, i + band + 1); c++) t -= a[i]![c]! * x[c]!;
    x[i] = t / a[i]![i]!;
  }
  return x;
}

/** The ends' stiffening at `s` along a strip of length S: `ends` at the ends, down to 1 at a fifth of S in. */
export const endFactor = (s: number, S: number, ends: number): number => {
  const t = Math.min(s, S - s) / (0.2 * S);
  return t >= 1 ? 1 : ends + (1 - ends) * Math.max(0, t);
};

export function winklerStrip(w: WinklerStrip): WinklerResult {
  const n = Math.max(2, Math.ceil(w.S / (w.dx ?? 0.2))) + 1;
  const h = w.S / (n - 1);
  const s = Array.from({ length: n }, (_, i) => i * h);
  const N = 2 * n;
  const K = Array.from({ length: N }, () => new Array<number>(N).fill(0));
  const f = new Array<number>(N).fill(0);
  const e = w.EI, L = h;
  const ke = [
    [12 * e / L ** 3, 6 * e / L ** 2, -12 * e / L ** 3, 6 * e / L ** 2],
    [6 * e / L ** 2, 4 * e / L, -6 * e / L ** 2, 2 * e / L],
    [-12 * e / L ** 3, -6 * e / L ** 2, 12 * e / L ** 3, -6 * e / L ** 2],
    [6 * e / L ** 2, 2 * e / L, -6 * e / L ** 2, 4 * e / L],
  ];
  for (let el = 0; el < n - 1; el++) for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) K[2 * el + i]![2 * el + j]! += ke[i]![j]!;
  const spring = s.map((x, i) => w.ks * w.b * (i === 0 || i === n - 1 ? h / 2 : h) * endFactor(x, w.S, w.ends));
  spring.forEach((k, i) => { K[2 * i]![2 * i]! += k; });
  for (const p of w.loads) {
    const i = Math.max(0, Math.min(n - 1, Math.round(p.s / h)));
    f[2 * i]! += p.P;
    f[2 * i + 1]! -= p.M;
  }
  const u = solveBanded(K, f, 3);
  const y = s.map((_, i) => u[2 * i]!);
  const q = y.map((v) => w.ks * v);
  const curv = (el: number, xi: number) => {
    const v1 = u[2 * el]!, t1 = u[2 * el + 1]!, v2 = u[2 * el + 2]!, t2 = u[2 * el + 3]!;
    return ((-6 + 12 * xi) * v1 + L * (-4 + 6 * xi) * t1 + (6 - 12 * xi) * v2 + L * (-2 + 6 * xi) * t2) / (L * L);
  };
  const M = s.map((_, i) => {
    const parts = [...(i > 0 ? [curv(i - 1, 1)] : []), ...(i < n - 1 ? [curv(i, 0)] : [])];
    return -e * parts.reduce((a, b) => a + b, 0) / parts.length;
  });
  M[0] = 0; M[n - 1] = 0;
  const V = Array.from({ length: n - 1 }, (_, i) => (M[i + 1]! - M[i]!) / h);
  return { s, y, q, M, V };
}
