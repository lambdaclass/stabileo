import { barArea, groupsArea } from './bars';
import type { BarGroup } from './types';

export interface SteelFace { provided: number; strength: number; withMin: number }

export interface SteelStation { x: number; top: SteelFace; bottom: SteelFace }

export interface SteelQuery {
  mu: number;
  tension: BarGroup[];
  dia: number;
}

const ROUNDS = 40;
const TOL = 2e-3;

export const scaled = (tension: readonly BarGroup[], dia: number, t: number): BarGroup[] =>
  (groupsArea(tension) > 1e-9 ? tension.map((g) => ({ dia: g.dia, count: g.count * t })) : [{ dia, count: t }]);

export function requiredAreas(qs: readonly SteelQuery[], capacity: (asks: ReadonlyArray<{ i: number; tension: BarGroup[] }>) => number[]): number[] {
  const unit = qs.map((q) => (groupsArea(q.tension) > 1e-9 ? groupsArea(q.tension) : barArea(q.dia)));
  const out = qs.map(() => 0);
  const live = qs.map((_, i) => i).filter((i) => qs[i]!.mu > 1e-6);
  if (!live.length) return out;
  const f = (ks: number[], ts: number[]) => {
    const m = capacity(ks.map((k, n) => ({ i: live[k]!, tension: scaled(qs[live[k]!]!.tension, qs[live[k]!]!.dia, ts[n]!) })));
    return ks.map((k, n) => (m[n] ?? 0) - qs[live[k]!]!.mu);
  };
  const all = live.map((_, k) => k);
  const lo = live.map(() => 0), hi = live.map(() => 1);
  const flo = f(all, lo), fhi = f(all, hi);
  for (let r = 0; r < 6; r++) {
    const grow = all.filter((k) => flo[k]! < 0 && fhi[k]! < 0);
    if (!grow.length) break;
    grow.forEach((k) => { lo[k] = hi[k]!; flo[k] = fhi[k]!; hi[k] = hi[k]! * 2; });
    f(grow, grow.map((k) => hi[k]!)).forEach((v, n) => { fhi[grow[n]!] = v; });
  }
  const t = all.map((k) => (flo[k]! >= 0 ? 0 : fhi[k]! < 0 ? Infinity : hi[k]!));
  const side = all.map(() => 0);
  for (let r = 0; r < ROUNDS; r++) {
    const ks = all.filter((k) => t[k]! > 0 && Number.isFinite(t[k]!) && hi[k]! - lo[k]! > TOL * hi[k]! && fhi[k]! > TOL * qs[live[k]!]!.mu);
    if (!ks.length) break;
    const mid = ks.map((k) => Math.min(hi[k]!, Math.max(lo[k]!, (lo[k]! * fhi[k]! - hi[k]! * flo[k]!) / (fhi[k]! - flo[k]!))));
    f(ks, mid).forEach((v, n) => {
      const k = ks[n]!;
      if (v >= 0) { hi[k] = mid[n]!; fhi[k] = v; if (side[k] === 1) flo[k] = flo[k]! / 2; side[k] = 1; }
      else { lo[k] = mid[n]!; flo[k] = v; if (side[k] === -1) fhi[k] = fhi[k]! / 2; side[k] = -1; }
      t[k] = hi[k]!;
    });
  }
  live.forEach((i, k) => { out[i] = t[k]! * unit[i]!; });
  return out;
}

export const withMinimum = (strength: number, min: number): number => (strength > 1e-9 ? Math.max(strength, Math.min(min, (4 / 3) * strength)) : 0);

export function shortStretches(steel: readonly SteelStation[], face: 'top' | 'bottom', key: 'strength' | 'withMin' = 'withMin', tol = 1e-3): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let open: number | null = null, last = 0;
  for (const s of steel) {
    const f = s[face], short = f[key] > f.provided * (1 + tol) + 1e-6;
    if (short && open === null) open = s.x;
    if (!short && open !== null) { out.push([open, last]); open = null; }
    last = s.x;
  }
  if (open !== null) out.push([open, last]);
  return out;
}
