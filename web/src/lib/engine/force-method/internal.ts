/**
 * Internal forces along a bar, and the Mohr integrals built from them.
 *
 * The force method asks for ∫ mᵢ·mⱼ / EI dx over every bar, and the textbook
 * way to answer it is a table of products of diagram shapes. The shapes here
 * are exact — a bar's moment is its end forces plus the loads between them —
 * so the integral is done by Gauss quadrature on the pieces between load
 * points, where each diagram is a polynomial of degree three at most and a
 * four-point rule is exact.
 *
 * Signs follow the app's diagrams: N positive in tension, and M(0) equal to
 * the moment the analysis solver reports as `mStart`. A product mᵢ·mⱼ does not
 * care which sign convention is chosen as long as it is the same for both.
 */
import type { SolverInput, SolverPointLoadOnElement } from '../types';

/** The loads that act ALONG a bar, in its local axes. */
export interface BarLoads {
  /** Transverse distributed: q from a to b, linear. */
  dist: Array<{ qI: number; qJ: number; a: number; b: number }>;
  /** Point loads: transverse p, axial px, couple my, at a. */
  point: Array<{ a: number; p: number; px: number; my: number }>;
}

export const NO_LOADS: BarLoads = { dist: [], point: [] };

export function barLoadsOf(input: SolverInput, elementId: number, L: number): BarLoads {
  const out: BarLoads = { dist: [], point: [] };
  for (const load of input.loads) {
    if (load.type === 'distributed' && load.data.elementId === elementId) {
      out.dist.push({
        qI: load.data.qI, qJ: load.data.qJ,
        a: Math.max(0, load.data.a ?? 0), b: Math.min(L, load.data.b ?? L),
      });
    } else if (load.type === 'pointOnElement'
      && (load.data as SolverPointLoadOnElement).elementId === elementId) {
      const pl = load.data as SolverPointLoadOnElement;
      out.point.push({ a: pl.a, p: pl.p ?? 0, px: pl.px ?? 0, my: pl.my ?? 0 });
    }
  }
  return out;
}

/**
 * m(x) and n(x) from the bar's local end forces at I — [Ni, Vi, Mi, …], the
 * forces the nodes exert on the bar — and the loads on [0, x).
 *
 * Equilibrium of the piece [0, x]: m(x) = Mi − Vi·x + Σ (a − x)·p + Σ my,
 * n(x) = −Ni − Σ px. At x = 0 this is (−Ni, Mi), which is the analysis
 * solver's (nStart, mStart).
 */
export function internalAt(fI: { N: number; V: number; M: number }, loads: BarLoads, x: number) {
  let m = fI.M - fI.V * x;
  let n = -fI.N;
  for (const pl of loads.point) {
    if (pl.a < x) {
      m += (pl.a - x) * pl.p + pl.my;
      n -= pl.px;
    }
  }
  for (const d of loads.dist) {
    const hi = Math.min(x, d.b);
    if (hi <= d.a) continue;
    /* ∫ from a to hi of (s − x)·q(s) ds, q linear on [a, b]. */
    const slope = d.b > d.a ? (d.qJ - d.qI) / (d.b - d.a) : 0;
    const q = (s: number) => d.qI + slope * (s - d.a);
    const len = hi - d.a;
    /* Simpson is exact for the cubic (s − x)·q(s). */
    const mid = (d.a + hi) / 2;
    m += (len / 6) * ((d.a - x) * q(d.a) + 4 * (mid - x) * q(mid) + (hi - x) * q(hi));
  }
  return { m, n };
}

const GAUSS4 = [
  { x: -0.8611363115940526, w: 0.3478548451374538 },
  { x: -0.3399810435848563, w: 0.6521451548625461 },
  { x: 0.3399810435848563, w: 0.6521451548625461 },
  { x: 0.8611363115940526, w: 0.3478548451374538 },
];

/** Where the integrand changes form: load points and load ends. */
export function breakpoints(L: number, ...loads: BarLoads[]): number[] {
  const pts = new Set<number>([0, L]);
  for (const l of loads) {
    for (const p of l.point) if (p.a > 0 && p.a < L) pts.add(p.a);
    for (const d of l.dist) {
      if (d.a > 0 && d.a < L) pts.add(d.a);
      if (d.b > 0 && d.b < L) pts.add(d.b);
    }
  }
  return [...pts].sort((a, b) => a - b);
}

/** ∫₀ᴸ f(x) dx, exactly for any piecewise cubic broken at `pts`. */
export function integrate(pts: number[], f: (x: number) => number): number {
  let sum = 0;
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k];
    const b = pts[k + 1];
    if (b - a < 1e-12) continue;
    for (const g of GAUSS4) sum += g.w * ((b - a) / 2) * f((a + b) / 2 + ((b - a) / 2) * g.x);
  }
  return sum;
}

/** The diagram as points, for drawing: evenly spaced plus both sides of every jump. */
export function sampleDiagram(
  fI: { N: number; V: number; M: number }, loads: BarLoads, L: number, n = 24,
): Array<{ x: number; m: number; n: number }> {
  const xs = new Set<number>();
  for (let k = 0; k <= n; k++) xs.add((k / n) * L);
  for (const p of loads.point) {
    if (p.a > 0 && p.a < L) { xs.add(Math.max(p.a - 1e-9, 0)); xs.add(Math.min(p.a + 1e-9, L)); }
  }
  return [...xs].sort((a, b) => a - b).map((x) => {
    /* At the far end, read just inside: a couple AT L belongs to the node. */
    const v = internalAt(fI, loads, Math.min(x, L - 1e-12));
    return { x, m: v.m, n: v.n };
  });
}
