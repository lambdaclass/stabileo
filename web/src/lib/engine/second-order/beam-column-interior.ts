import type { ElementForces } from '../types';
import { computeDiagramValueAt } from '../diagrams';
import { basis } from './beam-column-loads';

const G5 = [
  [-0.906179845938664, 0.2369268850561891], [-0.5384693101056831, 0.4786286704993665],
  [0, 0.5688888888888889], [0.5384693101056831, 0.4786286704993665], [0.906179845938664, 0.2369268850561891],
] as const;

type Diagram = Pick<ElementForces, 'mStart' | 'mEnd' | 'vStart' | 'vEnd' | 'nStart' | 'nEnd' | 'qI' | 'qJ' | 'length' | 'pointLoads' | 'distributedLoads' | 'distributedLoadsX'>;

function breaks(ef: Diagram): number[] {
  const L = ef.length;
  const out = [0, L];
  for (const p of ef.pointLoads ?? []) out.push(p.a);
  for (const d of ef.distributedLoads ?? []) out.push(d.a, d.b);
  return out.filter((x) => x >= 0 && x <= L);
}

function integrate(lo: number, hi: number, cuts: number[], k: number, f: (x: number) => number): number {
  if (!(hi > lo)) return 0;
  const pts = [lo, hi, ...cuts.filter((c) => c > lo && c < hi)].sort((a, b) => a - b);
  let sum = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    if (!(b > a)) continue;
    const parts = Math.max(2, Math.ceil(4 * k * (b - a)));
    const h = (b - a) / parts;
    for (let j = 0; j < parts; j++) {
      const c = a + h * (j + 0.5);
      for (const [g, w] of G5) sum += (w * h) / 2 * f(c + (h / 2) * g);
    }
  }
  return sum;
}

function dirichlet(mu: number, L: number): { G: (a: number, b: number) => number; ramp: (x: number) => number } {
  const k = Math.sqrt(Math.abs(mu));
  if (mu < 0 && k * L > 1) {
    const e2 = 1 - Math.exp(-2 * k * L);
    return {
      G: (a, b) => (Math.exp(k * (a - b)) - Math.exp(-k * (a + b)) - Math.exp(k * (a + b - 2 * L)) + Math.exp(-k * (a + 2 * L - b))) / (2 * k * e2),
      ramp: (x) => (Math.exp(k * (x - L)) * (1 - Math.exp(-2 * k * x))) / e2,
    };
  }
  const sL = basis(mu, L).s1;
  return { G: (a, b) => (basis(mu, a).s1 * basis(mu, L - b).s1) / sL, ramp: (x) => basis(mu, x).s1 / sL };
}

/**
 * The second-order moment inside a member at `xs`: M = M₀ + P·(v − vᵢ), with M₀ the diagram of its end forces and span
 * loads, P the compression and v the transverse displacement in the member's axes, from M″ + (P/EI)·M = M₀″. With the end
 * moments alone the problem is singular at P·L²/EI = π², so past 2.5² it starts from a rigid end with its rotation θ.
 * `dv` is vⱼ − vᵢ. Null when the result is not finite.
 */
export function interiorMoments(ef: Diagram, EI: number, compression: number, xs: readonly number[], thetaI: number | null, thetaJ: number | null, dv = 0): number[] | null {
  const L = ef.length;
  const mu = compression / EI;
  const k = Math.sqrt(Math.abs(mu));
  const M0 = (x: number) => computeDiagramValueAt('moment', Math.min(1, Math.max(0, x / L)), ef);
  const cuts = breaks(ef);
  const DL = compression * dv;
  if (!(mu > 0 && k * L > 2.5) || (thetaI === null && thetaJ === null)) {
    const { G, ramp } = dirichlet(mu, L);
    const out = xs.map((x) => M0(x) + DL * ramp(x) + mu * integrate(0, L, [...cuts, x], k, (s) => (s <= x ? G(s, x) : G(x, s)) * M0(s)));
    return out.every(Number.isFinite) ? out : null;
  }
  const fromStart = thetaI !== null;
  const M0m = fromStart ? M0 : (y: number) => M0(L - y);
  const cutsM = fromStart ? cuts : cuts.map((c) => L - c);
  const out = xs.map((x) => {
    const y = fromStart ? x : L - x;
    const b = basis(mu, y);
    const part = integrate(0, y, cutsM, k, (s) => basis(mu, y - s).s1 * -mu * M0m(s));
    const free = fromStart ? compression * thetaI! * b.s1 : DL * (1 - mu * b.b2) - compression * thetaJ! * b.s1;
    return M0(x) + part + free;
  });
  return out.every(Number.isFinite) ? out : null;
}

/** `ef` with transverse point loads added so its moment diagram passes through `targets` (at increasing x, the last at L). */
export function throughMoments<T extends Diagram>(ef: T, targets: ReadonlyArray<{ x: number; m: number }>): T {
  const out = { ...ef, pointLoads: [...(ef.pointLoads ?? [])] };
  let prev = 0;
  for (const t of targets) {
    const at = t.x / ef.length;
    const before = computeDiagramValueAt('moment', at, out);
    out.pointLoads.push({ a: prev, p: 1 });
    const unit = computeDiagramValueAt('moment', at, out) - before;
    out.pointLoads[out.pointLoads.length - 1] = { a: prev, p: (t.m - before) / unit };
    prev = t.x;
  }
  return out;
}

/** `ef` with the transverse load μ·M between the samples, so its diagram bends like M″ = M₀″ − μ·M between them. */
export function withCurvature<T extends Diagram>(ef: T, mu: number, xs: readonly number[], ms: readonly number[]): T {
  const extra: NonNullable<Diagram['distributedLoads']> = [];
  let x0 = 0, m0 = ef.mStart;
  xs.forEach((x, j) => { extra.push({ a: x0, b: x, qI: mu * m0, qJ: mu * ms[j] }); x0 = x; m0 = ms[j]; });
  const base = ef.distributedLoads ?? ((Math.abs(ef.qI) > 1e-10 || Math.abs(ef.qJ) > 1e-10) ? [{ qI: ef.qI, qJ: ef.qJ, a: 0, b: ef.length }] : []);
  return { ...ef, distributedLoads: [...base, ...extra] };
}
