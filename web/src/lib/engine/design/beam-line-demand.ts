import { ConcurrentDemand } from '../concurrent-demand';
import { IncompleteConcurrentDemandError } from '../complete-demand-set';
/**
 * What a beam line asks of its bars along it: at each station of each member, the largest sagging
 * and hogging moment of all combinations on the member's governing axis, and the area of bottom
 * and top steel that carries it on the web (the rectangle's capacity, found by bisection). Read
 * beside the area the line's bars give there, it is the editor's «needed against provided».
 */
import { computeFlexureCapacity } from '../station-design-forces';
import type { MemberContext } from './member-context';
import { tupleMoment, tupleShear } from './design-axes';
import { checkShear, sizeTorsionReinforcement } from '../codes/argentina/cirsoc201';
import { CIRSOC201_DESIGN_EDITION } from '../codes/argentina/cirsoc201-basis';
import type { BeamStirrupZone } from '../../design-contract/beam-line';

function lineStationGroups(stations: NonNullable<MemberContext['stations']>, comboId?: number) {
  const complete = ConcurrentDemand.completeStations(stations);
  const ts = [...new Set(complete.values.map(row => row.stationT))].sort((a, b) => a - b);
  const grid = new Map(ts.map(t => [t, [] as ConcurrentDemand[]]));
  for (const [id, combination] of complete.partition(row => row.comboId)) {
    const field = [...combination.partition(row => row.stationT)].sort(([a], [b]) => a - b);
    let i = 0;
    for (const t of ts) {
      while (i + 1 < field.length && field[i + 1]![0] <= t) i++;
      const left = field[i]!, right = field[i + 1];
      let demands: readonly ConcurrentDemand[];
      if (left[0] === t) demands = left[1].values.map(row => row.demand);
      else {
        if (!(left[0] < t && right && t < right[0] && right[0] - left[0] > 1e-9)
          || left[1].values.length !== 1 || right[1].values.length !== 1) {
          throw new IncompleteConcurrentDemandError([{ code: 'missing-station', elementId: stations.elementId, comboId: id, stationT: t }],
            'Beam-line station requires an unambiguous interpolation bracket');
        }
        demands = [left[1].values[0]!.demand.interpolate(right[1].values[0]!.demand, t)];
      }
      if (comboId === undefined || comboId === id) grid.get(t)!.push(...demands);
    }
  }
  return [...grid].filter(([, demands]) => demands.length > 0);
}

export interface DemandPoint {
  /** Metres along the line. */
  x: number;
  /** kN·m, both positive. */
  mPos: number; mNeg: number;
  /** cm². */
  asBottom: number; asTop: number;
  /** The member's effective depth there, m: how far §9.7.3.3 carries a bar past where it is needed. */
  d?: number;
}

/** The area that carries Mu on a b × d rectangle, cm²; Infinity past the section's capacity. */
export function requiredArea(Mu: number, b: number, d: number, fc: number, fy: number): number {
  if (!(Mu > 1e-6) || !(d > 0)) return 0;
  let lo = 0, hi = 0.04 * b * d * 1e4;
  const cap = (As: number) => computeFlexureCapacity(As, b, d, fc, fy)?.phiMn ?? 0;
  if (cap(hi) < Mu) return Number.POSITIVE_INFINITY;
  for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (cap(mid) >= Mu) hi = mid; else lo = mid; }
  return hi;
}

/** The demand along a line: each member's stations placed at their x, in the line's sense. */
export function lineDemand(
  members: ReadonlyArray<{ ctx: MemberContext | undefined; offset: number; L: number; forward: boolean }>,
  /** One combination's diagram instead of the envelope of all, by its id. */
  comboId?: number,
): DemandPoint[] {
  const out: DemandPoint[] = [];
  for (const m of members) {
    const ctx = m.ctx;
    const st = ctx?.stations;
    if (!ctx || !st) continue;
    const b = ctx.axes.bFlex, h = ctx.axes.hFlex;
    const d = h - ctx.material.cover - ctx.material.stirrupDia / 1000 - 0.01;
    for (const [t, demands] of lineStationGroups(st, comboId)) {
      let mPos = 0, mNeg = 0;
      for (const demand of demands) {
        const s = demand.forces;
        // The verifier's convention: a positive moment on the governing axis sags.
        const sag = s ? tupleMoment(s, ctx.axes.flexure) : 0;
        if (sag > mPos) mPos = sag;
        if (-sag > mNeg) mNeg = -sag;
      }
      const x = m.offset + (m.forward ? t : 1 - t) * m.L;
      out.push({ x, mPos, mNeg, asBottom: requiredArea(mPos, b, d, ctx.material.fc, ctx.material.fy), asTop: requiredArea(mNeg, b, d, ctx.material.fc, ctx.material.fy), d });
    }
  }
  return out.sort((p, q) => p.x - q.x);
}

/**
 * The demand shifted by the effective depth (§9.7.3.3): at each station the largest of what the
 * stations within d of it ask, so the curve shows how far a bar runs past the point where the
 * moment stops needing it. Read against the bars, it says why a bar is longer than the plain
 * diagram suggests. The 12·db alternative of the same clause depends on the bar, and the
 * detailing applies it bar by bar; the diagram shifts by d.
 */
export function shiftedDemand(points: readonly DemandPoint[]): DemandPoint[] {
  if (points.length < 2) return points.map((p) => ({ ...p }));
  const pts = [...points].sort((a, b) => a.x - b.x);
  const x0 = pts[0]!.x, x1 = pts[pts.length - 1]!.x;
  type K = 'mPos' | 'mNeg' | 'asBottom' | 'asTop';
  const KEYS: K[] = ['mPos', 'mNeg', 'asBottom', 'asTop'];
  /** The plain curve at x, linear between stations (the larger value where two stations share an x). */
  const at = (x: number, k: K): number => {
    let best = -Infinity;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i]!, b = pts[i + 1]!;
      if (x < a.x - 1e-9 || x > b.x + 1e-9) continue;
      const t = b.x - a.x > 1e-9 ? (x - a.x) / (b.x - a.x) : 0;
      const va = Number.isFinite(a[k]) ? a[k] : 0, vb = Number.isFinite(b[k]) ? b[k] : 0;
      best = Math.max(best, b.x - a.x > 1e-9 ? va + (vb - va) * t : Math.max(va, vb));
    }
    return best === -Infinity ? 0 : best;
  };
  const dAt = (x: number) => pts.reduce((m, p) => (Math.abs(p.x - x) < Math.abs(m.x - x) ? p : m), pts[0]!).d ?? 0;
  const xs = new Set<number>();
  for (const p of pts) {
    const d = p.d ?? 0;
    for (const x of [p.x - d, p.x, p.x + d]) xs.add(Math.min(x1, Math.max(x0, x)));
  }
  return [...xs].sort((a, b) => a - b).map((x) => {
    const d = dAt(x), lo = x - d, hi = x + d;
    const out: DemandPoint = { x, mPos: 0, mNeg: 0, asBottom: 0, asTop: 0, d };
    for (const k of KEYS) {
      let v = Math.max(at(Math.max(x0, lo), k), at(Math.min(x1, hi), k), at(x, k));
      for (const p of pts) if (p.x >= lo - 1e-9 && p.x <= hi + 1e-9) v = Math.max(v, p[k]);
      out[k] = v;
    }
    return out;
  });
}

/** The combinations the line's members were checked for, by id, in the order the first member lists them. */
export function lineCombos(ctxs: ReadonlyArray<MemberContext | undefined>): Array<{ id: number; name: string }> {
  const seen = new Map<number, string>();
  for (const c of ctxs) for (const r of c?.stations?.comboResults ?? []) if (!seen.has(r.comboId)) seen.set(r.comboId, r.comboName);
  return [...seen].map(([id, name]) => ({ id, name }));
}

/** What the stirrups must carry at a station, cm²/m of all legs. */
export interface TransversePoint {
  x: number;
  /** Av/s for shear, before the minimum. */
  shear: number;
  /** 2·At/s for torsion (both legs of the closed stirrup); 0 where torsion may be neglected. */
  torsion: number;
  /** The minimum the code sets on Av/s (and on Av + 2At over s). */
  min: number;
}

/**
 * The transverse steel each station asks, by the code the verifier checks with (§22.5, §22.7):
 * the largest of all combinations (or of one), shear and torsion apart, so the editor can draw
 * either or their sum, with or without the minimum.
 */
export function lineTransverseDemand(
  members: ReadonlyArray<{ ctx: MemberContext | undefined; offset: number; L: number; forward: boolean }>,
  comboId?: number,
): TransversePoint[] {
  const out: TransversePoint[] = [];
  for (const m of members) {
    const ctx = m.ctx, st = ctx?.stations;
    if (!ctx || !st) continue;
    const params = { fc: ctx.material.fc, fy: ctx.material.fy, cover: ctx.material.cover, b: ctx.axes.bFlex, h: ctx.axes.hFlex, stirrupDia: ctx.material.stirrupDia };
    for (const [t, demands] of lineStationGroups(st, comboId)) {
      let shear = 0, torsion = 0, min = 0;
      for (const demand of demands) {
        const s = demand.forces;
        const Vu = Math.abs(tupleShear(s, ctx.axes.shear));
        const v = checkShear(params, Vu, 0, { edition: CIRSOC201_DESIGN_EDITION });
        shear = Math.max(shear, v.AvOverSReq ?? v.AvOverS);
        min = Math.max(min, v.AvOverSMin);
        if (s.torsion !== 0) {
          const tr = sizeTorsionReinforcement(params, s.torsion, CIRSOC201_DESIGN_EDITION);
          if (!tr.neglect) torsion = Math.max(torsion, 2 * tr.AtOverS);
        }
      }
      out.push({ x: m.offset + (m.forward ? t : 1 - t) * m.L, shear, torsion, min });
    }
  }
  return out.sort((p, q) => p.x - q.x);
}

/** The Av/s the line's stirrups give at x, cm²/m of all legs: the zone that covers it. */
export function transverseAt(stirrups: readonly BeamStirrupZone[], x: number): number {
  const z = stirrups.find((s) => x >= s.from - 1e-9 && x <= s.to + 1e-9);
  return z && z.spacing > 0 ? (z.legs * Math.PI * (z.diameter / 20) ** 2) / z.spacing : 0;
}
