/**
 * Between two bending breakpoints the moment has at most one interior extremum, where the shear
 * is zero: a stretch must not straddle a point load, a span load's end or a sign change of q.
 */
import type { SolverLoad } from '../types';

export interface BendingStretch { t0: number; t1: number; loaded: boolean }

export function bendingStretches(loads: readonly SolverLoad[], id: number, L: number): BendingStretch[] {
  const spans = loads.flatMap((l) => (l.type === 'distributed' && l.data.elementId === id
    && (Math.abs(l.data.qI) > 1e-12 || Math.abs(l.data.qJ) > 1e-12)
    ? [{ qI: l.data.qI, qJ: l.data.qJ, a: l.data.a ?? 0, b: l.data.b ?? L }] : []));
  const breaks = new Set<number>([0, L]);
  for (const l of loads) {
    if (l.type === 'pointOnElement' && l.data.elementId === id) breaks.add(Math.min(L, Math.max(0, l.data.a)));
  }
  for (const d of spans) { breaks.add(Math.max(0, Math.min(L, d.a))); breaks.add(Math.max(0, Math.min(L, d.b))); }
  const qAt = (x: number) => spans.reduce((sum, d) => (x >= d.a && x <= d.b && d.b > d.a ? sum + d.qI + (d.qJ - d.qI) * (x - d.a) / (d.b - d.a) : sum), 0);
  const sorted = [...breaks].sort((x, y) => x - y);
  for (let i = 0; i + 1 < sorted.length; i++) {
    const x0 = sorted[i], x1 = sorted[i + 1];
    if (x1 - x0 < 1e-12) continue;
    const h = (x1 - x0) * 1e-9, q0 = qAt(x0 + h), q1 = qAt(x1 - h);
    if (q0 * q1 < 0) breaks.add(x0 + (x1 - x0) * q0 / (q0 - q1));
  }
  const xs = [...breaks].sort((x, y) => x - y).filter((x, i, a) => i === 0 || x - a[i - 1] > 1e-12 * Math.max(1, L));
  const out: BendingStretch[] = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    const mid = (xs[i] + xs[i + 1]) / 2;
    out.push({ t0: xs[i] / L, t1: xs[i + 1] / L, loaded: Math.abs(qAt(mid)) > 1e-12 });
  }
  return out;
}

const GOLD = (Math.sqrt(5) - 1) / 2;

/**
 * The smallest of f over the open interval (t0, t1), refined to where `slope` (a function whose
 * zero is the minimiser, given the current minimum value) changes sign. Null when f is never
 * finite inside or its minimum sits at an end.
 */
export function interiorMinimum(
  f: (t: number) => number,
  slope: (t: number, fmin: number) => number,
  t0: number, t1: number, samples: number,
): { t: number; value: number } | null {
  const w = t1 - t0;
  if (!(w > 1e-12)) return null;
  const ts = Array.from({ length: samples + 1 }, (_, i) => t0 + (w * i) / samples);
  const vs = ts.map((t, i) => (i === 0 || i === samples ? Infinity : f(t)));
  let k = -1;
  for (let i = 1; i < samples; i++) if (Number.isFinite(vs[i]) && (k < 0 || vs[i] < vs[k])) k = i;
  if (k < 0) return null;
  let a = ts[k - 1], b = ts[k + 1];
  let c = b - GOLD * (b - a), d = a + GOLD * (b - a);
  let fc = f(c), fd = f(d);
  for (let it = 0; it < 200 && b - a > 1e-13 * w; it++) {
    if (fc <= fd) { b = d; d = c; fd = fc; c = b - GOLD * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = a + GOLD * (b - a); fd = f(d); }
  }
  let t = fc <= fd ? c : d;
  let value = Math.min(fc, fd);
  for (let round = 0; round < 3; round++) {
    const h = Math.max(1e-6 * w, 4 * (b - a));
    let lo = Math.max(t0, t - h), hi = Math.min(t1, t + h);
    let slo = slope(lo, value), shi = slope(hi, value);
    if (!(slo * shi < 0)) break;
    for (let it = 0; it < 100 && hi - lo > 1e-15 * w; it++) {
      const mid = (lo + hi) / 2, sm = slope(mid, value);
      if (sm === 0) { lo = hi = mid; break; }
      if (sm * slo < 0) { hi = mid; shi = sm; } else { lo = mid; slo = sm; }
    }
    const tn = (lo + hi) / 2, vn = f(tn);
    if (!(vn <= value + 1e-12 * Math.abs(value))) break;
    const moved = Math.abs(tn - t);
    t = tn; value = vn;
    if (moved < 1e-15 * w) break;
  }
  if (t - t0 < 1e-9 * w || t1 - t < 1e-9 * w) return null;
  return { t, value };
}
