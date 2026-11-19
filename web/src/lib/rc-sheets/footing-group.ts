import { computeAsFlexure, slabProvisions, stripCapacity } from '../engine/codes/argentina/losas';
import { pressureField } from '../engine/foundation/pressure-field';
import { barArea } from './bars';
import { critOf } from './criteria';
import { ASSUMED_FILL_WEIGHT, bearingHolds, bearingStrength, bearingUse, CONCRETE_WEIGHT, fieldOf, serviceBearing, type FootingPlan, type ServiceBearing } from './footing-mechanics';
import { dropRect, punchingReading, type PunchingCase, type PunchingSite } from './footing-punching';
import { meshArea } from './footing-mesh';
import { dowelLap, dowelReach, footingSpacing, layersOf, leverOf, MIN_D, type FootingRowCode } from './footing-design';
import { tieBars, tieLimits, TIE } from './footing-tie-bars';
import { winklerStrip } from './footing-winkler';
import type { FootingAction, FootingAdopted, FootingContext, FootingDemand, FootingGroup, FootingLayers, GroupColumn, GroupExtra, GroupStrip, GroupTie } from './footing-types';

const EDITION = '2025' as const;
type Axis = 'x' | 'y';
const other = (k: Axis): Axis => (k === 'x' ? 'y' : 'x');

/** A member column placed from the footing's centroid, m, with its demand. */
export interface Placed { demand: FootingDemand; x: number; y: number; b: number; h: number; anchor: [number, number] }

export function placeMembers(g: FootingGroup, a: Pick<FootingAdopted, 'ex' | 'ey'>): Placed[] {
  const ref = g.members[0]!.at;
  return g.members.map((m) => ({
    demand: m, x: m.at.x - ref.x - a.ex, y: m.at.y - ref.y - a.ey,
    b: m.column?.b ?? 0, h: m.column?.h ?? 0, anchor: [m.edge?.anchor[0] ?? 0, m.edge?.anchor[1] ?? 0],
  }));
}

/** Held along a line on its whole length: every column at the same side across the strip's axis. */
export function heldAcross(g: FootingGroup): -1 | 0 | 1 {
  if (g.kind !== 'strip' || !g.axis) return 0;
  const i = g.axis === 'x' ? 1 : 0;
  const sides = new Set(g.members.map((m) => m.edge?.anchor[i] ?? 0));
  return sides.size === 1 ? ([...sides][0] as -1 | 0 | 1) : 0;
}

/** Whether a strip held along a line takes its offset across by ties at the first floor rather than by the soil alone. */
export const tiedAcross = (g: FootingGroup): boolean => heldAcross(g) !== 0 && g.members.every((m) => m.edge?.balance !== 'eccentric');

/**
 * The members' actions summed about the footing's centroid as one at its reference node; across
 * a strip held by ties, the columns' offset and their moments across are the ties' and are left out.
 */
export function summed(cols: readonly Placed[], pick: (d: FootingDemand) => FootingAction | null | undefined, combo: string, tiedAxis?: Axis): FootingAction | null {
  const acts = cols.map((c) => pick(c.demand));
  if (acts.some((x) => !x)) return null;
  const t = { combo, N: 0, Mx: 0, My: 0, Vx: 0, Vy: 0 };
  cols.forEach((c, i) => {
    const a = acts[i]!;
    t.N += a.N; t.Vx += a.Vx; t.Vy += a.Vy;
    if (tiedAxis !== 'x') t.My += a.My + a.N * c.x;
    if (tiedAxis !== 'y') t.Mx += a.Mx - a.N * c.y;
  });
  return t;
}

const centred = (a: Pick<FootingAdopted, 'B' | 'L'>): FootingPlan => ({ B: a.B, L: a.L, xc: 0, yc: 0, b: 0, h: 0 });
const tiedAxisOf = (g: FootingGroup): Axis | undefined => (tiedAcross(g) && g.axis ? other(g.axis) : undefined);

/** The column's place on the footing as punching reads it. */
const columnPlan = (a: Pick<FootingAdopted, 'B' | 'L'>, p: Placed): FootingPlan => ({ ...centred(a), xc: p.x, yc: p.y, b: p.b, h: p.h, ...(p.demand.column?.area ? { area: p.demand.column.area } : {}) });

/** The concrete of the drops under the columns, m³. */
export function dropsVolume(g: FootingGroup, a: Pick<FootingAdopted, 'B' | 'L' | 'ex' | 'ey' | 'punching'>): number {
  if (!a.punching) return 0;
  return placeMembers(g, a).reduce((t, p) => {
    const dr = a.punching?.[p.demand.key]?.drop;
    if (!dr) return t;
    const r = dropRect(columnPlan(a, p), dr);
    return t + Math.max(0, r.x1 - r.x0) * Math.max(0, r.y1 - r.y0) * dr.hd;
  }, 0);
}

export function groupBearing(g: FootingGroup, a: Pick<FootingAdopted, 'B' | 'L' | 'h' | 'ex' | 'ey' | 'punching'>): ServiceBearing | null {
  const ref = g.members[0]!;
  const s = summed(placeMembers(g, a), (d) => d.service, 'D + L', tiedAxisOf(g));
  if (!s) return null;
  const drops = CONCRETE_WEIGHT * dropsVolume(g, a);
  return serviceBearing(centred(a), { ...s, N: s.N + drops }, a.h, leverOf(ref, a.h), ref.soil?.unitWeight ?? ASSUMED_FILL_WEIGHT);
}

/** Column lines along `dir`: the columns' positions across it, clustered within half a metre; a core falls in the band of the line nearest it. */
export function linesAcross(cols: readonly Placed[], dir: Axis): number[] {
  const plain = cols.filter((c) => !c.demand.pier);
  const vals = (plain.length ? plain : cols).map((c) => (dir === 'x' ? c.y : c.x)).sort((p, q) => p - q);
  const out: number[][] = [];
  for (const v of vals) { const last = out[out.length - 1]; if (last && v - last[last.length - 1]! <= 0.5) last.push(v); else out.push([v]); }
  return out.map((g) => g.reduce((s, v) => s + v, 0) / g.length);
}

/** The strips along `dir`: each column line's band, from halfway to its neighbours or to the edge. */
export function bandsAlong(cols: readonly Placed[], dir: Axis, W: number): Array<{ lo: number; hi: number; cols: Placed[] }> {
  const lines = linesAcross(cols, dir);
  const cuts = [-W / 2, ...lines.slice(1).map((v, i) => (v + lines[i]!) / 2), W / 2];
  return lines.map((_, i) => {
    const lo = cuts[i]!, hi = cuts[i + 1]!;
    return { lo, hi, cols: cols.filter((c) => { const w = dir === 'x' ? c.y : c.x; return w >= lo - 1e-9 && (w < hi - 1e-9 || i === lines.length - 1); }) };
  });
}

const SLICES = 96;
/** A drop under a column runs no farther than this past its faces, nor nearer another column than REACH_GAP, m. */
const MAX_REACH = 3, REACH_GAP = 0.1;

/**
 * A band along `dir` as a rigid strip (GA §13–§14, §13.3.4): its own columns' loads and moments
 * on a linear pressure of their resultant, contact lost where it would pull, so the strip is in
 * equilibrium by itself (GA §7.3); the moment both signs and the shear at d from each column's faces.
 */
export function bandReading(a: Pick<FootingAdopted, 'B' | 'L'>, dir: Axis, lo: number, hi: number, cols: ReadonlyArray<Placed & { N: number; w: number }>, d: number): { mBottom: number; mTop: number; vu: number; qMax: number } {
  const S = dir === 'x' ? a.B : a.L, width = hi - lo, du = S / SLICES;
  const P = cols.reduce((s, c) => s + c.N, 0);
  if (!(P > 1e-9) || !(width > 1e-9)) return { mBottom: 0, mTop: 0, vu: 0, qMax: 0 };
  const M = cols.reduce((s, c) => s + c.N * (dir === 'x' ? c.x : c.y) + c.w, 0);
  const f = pressureField(S, width, P, M, 0);
  const us = Array.from({ length: SLICES }, (_, i) => -S / 2 + (i + 0.5) * du);
  const soil = us.map((u) => f.at(u, 0) * du * width);
  const span = (c: Placed) => { const s = dir === 'x' ? c.x : c.y, half = (dir === 'x' ? c.b : c.h) / 2; return [s - half, s + half] as const; };
  const at = (s: number) => {
    let M = 0, V = 0;
    us.forEach((u, i) => {
      const x0 = u - du / 2, x1 = Math.min(u + du / 2, s);
      if (x1 <= x0) return;
      const F = soil[i]! * (x1 - x0) / du;
      V += F; M += F * (s - (x0 + x1) / 2);
    });
    for (const c of cols) {
      const [c0, c1] = span(c), ax = dir === 'x' ? c.x : c.y;
      const share = c1 - c0 > 1e-9 ? Math.min(1, Math.max(0, (s - c0) / (c1 - c0))) : s >= c0 ? 1 : 0;
      if (share > 0) { const hi2 = Math.min(s, c1); M -= c.N * share * (s - (c0 + hi2) / 2); V -= c.N * share; }
      if (s > ax) M += c.w;
    }
    return { M, V };
  };
  const closure = at(S / 2 + 1e-9).M;
  const xs = Array.from({ length: SLICES + 1 }, (_, i) => -S / 2 + (i * S) / SLICES);
  for (const c of cols) xs.push(...span(c));
  let mBottom = 0, mTop = 0;
  for (const s of xs) {
    const m = at(s).M;
    for (const v of [m, m - closure * (s + S / 2) / S]) { if (v > mBottom) mBottom = v; if (-v > mTop) mTop = -v; }
  }
  let vu = 0;
  for (const c of cols) for (const s of [span(c)[0] - d, span(c)[1] + d]) if (Math.abs(s) < S / 2 - 1e-6) vu = Math.max(vu, Math.abs(at(s).V));
  return { mBottom, mTop, vu, qMax: f.qMax };
}

/** Where an added band's bars lie across, m from the centroid: within its band, at most its spacing apart. */
export function extraPositions(e: Pick<GroupExtra, 'lo' | 'hi' | 'mesh'>): number[] {
  if (!(e.mesh.dia > 0) || !(e.mesh.spacing > 0) || e.hi - e.lo < 1e-9) return [];
  const lo = e.lo + e.mesh.spacing / 2, hi = e.hi - e.mesh.spacing / 2;
  if (hi - lo < 1e-9) return [(e.lo + e.hi) / 2];
  const n = Math.ceil((hi - lo) / e.mesh.spacing - 1e-9) + 1;
  return Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));
}

/** The added bars' area along `dir` on `face` lying between `lo` and `hi` across, cm². */
export function extraIn(a: Pick<FootingAdopted, 'extra'>, dir: Axis, face: 'bottom' | 'top', lo: number, hi: number): number {
  let t = 0;
  for (const e of a.extra ?? []) if (e.dir === dir && e.face === face) t += extraPositions(e).filter((p) => p >= lo - 1e-9 && p <= hi + 1e-9).length * barArea(e.mesh.dia);
  return t;
}

/** Past the outer columns' inner faces to the edges, the least of all four, m: where the bottom bars, hooked at the ends, develop. */
export function groupRoom(cols: readonly Placed[], a: Pick<FootingAdopted, 'B' | 'L'>, cover: number): number {
  const room = (dir: Axis) => {
    const S = dir === 'x' ? a.B : a.L;
    const pos = (p: Placed) => (dir === 'x' ? p.x : p.y), half = (p: Placed) => (dir === 'x' ? p.b : p.h) / 2;
    return Math.min(S / 2 - Math.max(...cols.map((p) => pos(p) - half(p))), S / 2 + Math.min(...cols.map((p) => pos(p) + half(p))));
  };
  return Math.min(room('x'), room('y')) - cover;
}

/** The flexural modulus the strips' rigidity and springs are read with, kPa: Ec = 4700·√f'c on a cracked inertia of 0,7 (Cim. §7). */
export const groupModulus = (fc: number): number => 0.7 * 4.7e6 * Math.sqrt(fc);

/** Lo = (4·E·I/(b·ks))^¼ with I = b·h³/12 (GA §6.2), m. */
export const characteristicLength = (E: number, h: number, ks: number): number => Math.pow((4 * E * h ** 3) / (12 * ks), 0.25);

export interface GroupAnalysis {
  layers: FootingLayers; lever: number;
  cols: Placed[];
  bearing: (ServiceBearing & { allowable: number | null; edgeFactor: number; use: number; ok: boolean }) | null;
  strips: GroupStrip[];
  bands: Array<{ column: string; width: number; mu: number; vu: number; asReq: number; asProvided: number; phiMn: number; phiVc: number }>;
  columns: GroupColumn[];
  ties: GroupTie[];
  /** Steel each face asks along X and Y over the whole width, cm². */
  need: { bottom: Record<Axis, number>; top: Record<Axis, number> };
  minSteel: { x: number; y: number; xProvided: number; yProvided: number };
  anchorage: { ld: number; available: number; ok: boolean };
  sMax: number;
  combos: Array<{ combo: string; N: number; mx: number; my: number; qMax: number; ratio: number }>;
  /** Each column's combinations and its site, as punching reads them. */
  punching: Array<{ cases: PunchingCase[]; site: PunchingSite }>;
}

function stripsOf(g: FootingGroup, cols: readonly Placed[], a: FootingAdopted): Array<{ dir: Axis; lo: number; hi: number; cols: Placed[] }> {
  if (g.kind === 'strip' && g.axis) { const W = g.axis === 'x' ? a.L : a.B; return [{ dir: g.axis, lo: -W / 2, hi: W / 2, cols: [...cols] }]; }
  return (['x', 'y'] as const).flatMap((dir) => bandsAlong(cols, dir, dir === 'x' ? a.L : a.B).filter((b) => b.cols.length).map((b) => ({ dir, ...b })));
}

function spanOf(cols: readonly Placed[], dir: Axis, S: number): { span: number; overhang: number } {
  const xs = cols.map((c) => (dir === 'x' ? c.x : c.y)).sort((p, q) => p - q);
  let span = 0;
  for (let i = 1; i < xs.length; i++) span = Math.max(span, xs[i]! - xs[i - 1]!);
  return { span, overhang: xs.length ? Math.max(xs[0]! + S / 2, S / 2 - xs[xs.length - 1]!) : 0 };
}

export function analyseGroup(g: FootingGroup, c: FootingContext, a: FootingAdopted, code: FootingRowCode): GroupAnalysis {
  const ref = g.members[0]!, cr = critOf(c);
  const lever = leverOf(ref, a.h), stub = lever - a.h;
  const layers = layersOf(a, c.cover);
  const cols = placeMembers(g, a);
  const plan = centred(a);
  const tied = tiedAxisOf(g);
  const prov = slabProvisions(EDITION, c.fy, a.h);
  const k = ref.soil?.edgeFactor && ref.soil.edgeFactor > 1 ? ref.soil.edgeFactor : 1;
  const sb = groupBearing(g, a), allowable = ref.soil?.allowable ?? null;
  const bearing = sb ? { ...sb, allowable, edgeFactor: k, use: allowable ? bearingUse(sb, allowable, k) : 0, ok: allowable ? bearingHolds(sb, allowable, k) : false } : null;
  const dOf = (dir: Axis) => (dir === 'x' ? layers.dx : layers.dy);
  const bands = stripsOf(g, cols, a);
  const read = bands.map(() => ({ mBottom: 0, mTop: 0, vu: 0 }));
  const across = g.kind === 'strip' && g.axis ? other(g.axis) : null;
  const W = across === 'x' ? a.B : a.L;
  const bandMu = cols.map(() => 0), bandVu = cols.map(() => 0), pu = cols.map(() => 0);
  const cases: PunchingCase[][] = cols.map(() => []);
  const perCombo: GroupAnalysis['combos'] = [];
  const cantAcross = (p: Placed) => { if (!across) return 0; const s = across === 'x' ? p.x : p.y, half = (across === 'x' ? p.b : p.h) / 2; return Math.max(W / 2 - (s + half), s - half + W / 2, 0); };
  const tieForce = cols.map(() => ({ max: 0, byCombo: {} as Record<string, number> }));
  for (const name of ref.combos.map((x) => x.combo)) {
    const at = summed(cols, (d) => d.combos.find((x) => x.combo === name), name, tied);
    if (!at || !(at.N > 0)) continue;
    const f = fieldOf(plan, at, lever);
    const acts = cols.map((p) => p.demand.combos.find((x) => x.combo === name)!);
    bands.forEach((b, i) => {
      const placed = b.cols.map((p) => { const q = acts[cols.indexOf(p)]!; return { ...p, N: q.N, w: b.dir === 'x' ? q.My + lever * q.Vx : -(q.Mx - lever * q.Vy) }; });
      const r = bandReading(a, b.dir, b.lo, b.hi, placed, dOf(b.dir));
      const o = read[i]!;
      o.mBottom = Math.max(o.mBottom, r.mBottom); o.mTop = Math.max(o.mTop, r.mTop); o.vu = Math.max(o.vu, r.vu);
    });
    cols.forEach((p, i) => {
      const q = acts[i]!;
      pu[i] = Math.max(pu[i]!, q.N);
      if (across) {
        const v = cantAcross(p), qq = q.N / W;
        bandMu[i] = Math.max(bandMu[i]!, (qq * v * v) / 2);
        bandVu[i] = Math.max(bandVu[i]!, qq * Math.max(0, v - dOf(across)));
      }
      if (p.demand.column) cases[i]!.push({ f, a: q, combo: name });
      if (tied) {
        const H = (p.demand.column?.storey ?? 3) + lever, e = Math.abs(tied === 'x' ? p.x : p.y);
        const w = tied === 'x' ? q.My + lever * q.Vx : q.Mx - lever * q.Vy;
        const T = (q.N * e + Math.abs(w)) / H;
        tieForce[i]!.byCombo[name] = T; tieForce[i]!.max = Math.max(tieForce[i]!.max, T);
      }
    });
    perCombo.push({ combo: name, N: at.N, mx: at.Mx, my: at.My, qMax: f.qMax, ratio: 0 });
  }
  const sites: PunchingSite[] = cols.map((p) => {
    const gaps = cols.filter((o) => o !== p).map((o) => Math.max(Math.abs(o.x - p.x) - (o.b + p.b) / 2, Math.abs(o.y - p.y) - (o.h + p.h) / 2));
    return { plan: columnPlan(a, p), d: layers.d, stub, fc: c.fc, fy: c.fy, h: a.h, cover: c.cover, reach: Math.max(0, Math.min(MAX_REACH, ...gaps.map((x) => x - REACH_GAP))) };
  });
  const punching: Array<GroupColumn['punching']> = cols.map((p, i) => {
    const pr = punchingReading(cases[i]!, sites[i]!, a.punching?.[p.demand.key]);
    return pr ? { vu: pr.vu, phiVc: pr.phiVc, utilization: pr.utilization, bo: pr.bo, position: pr.position, combo: pr.combo, sections: pr.sections, ...(pr.fix ? { fix: pr.fix } : {}), ...(pr.vs !== undefined ? { vs: pr.vs, ceiling: pr.ceiling, legs: pr.legs } : {}) } : null;
  });
  for (const k of perCombo) k.ratio = Math.max(0, ...cols.map((p, i) => { const one = cases[i]!.filter((x) => x.combo === k.combo); return one.length ? punchingReading(one, sites[i]!, a.punching?.[p.demand.key])?.utilization ?? 0 : 0; }));
  const asOf = (mu: number, width: number, d: number) => (mu > 1e-6 ? computeAsFlexure(mu / width, a.h, d, c.fc, c.fy, EDITION).As * width : 0);
  const capOf = (area: number, width: number, d: number) => (area > 0 ? stripCapacity(area / width, a.h, d, c.fc, c.fy, EDITION) * width : 0);
  const vcOf = (area: number, width: number, d: number) => 0.75 * code.oneWayVc(c.fc, (area * 1e-4) / Math.max(width * d, 1e-9)) * width * d * 1000;
  const flat = { B: a.B, L: a.L, ex: 0, ey: 0 };
  const perM = (m: FootingAdopted['x'] | undefined, dir: Axis) => (m && m.dia > 0 ? meshArea(dir, flat, { dia: m.dia, spacing: m.spacing }, c.cover).area / (dir === 'x' ? a.L : a.B) : 0);
  const bottomPerM = { x: perM(a.x, 'x'), y: perM(a.y, 'y') }, topPerM = { x: perM(a.tops?.x, 'x'), y: perM(a.tops?.y, 'y') };
  const E = groupModulus(c.fc), ks = ref.soil?.subgrade ?? null;
  const strips: GroupStrip[] = bands.map((b, i) => {
    const r = read[i]!, width = b.hi - b.lo, d = dOf(b.dir), S = b.dir === 'x' ? a.B : a.L;
    const dTop = a.h - c.cover - (a.tops?.[b.dir]?.dia ?? 12) / 2000;
    const asB = bottomPerM[b.dir] * width + extraIn(a, b.dir, 'bottom', b.lo, b.hi), asT = topPerM[b.dir] * width + extraIn(a, b.dir, 'top', b.lo, b.hi);
    const { span, overhang } = spanOf(b.cols, b.dir, S);
    const Lo = ks ? characteristicLength(E, a.h, ks) : null;
    const rigid = Lo ? span <= cr.footingRigidLength * Lo + 1e-9 && overhang <= (cr.footingRigidLength / 2) * Lo + 1e-9 : null;
    const out: GroupStrip = {
      dir: b.dir, at: (b.lo + b.hi) / 2, width, columns: b.cols.map((p) => p.demand.name), mBottom: r.mBottom, mTop: r.mTop, vu: r.vu, d,
      asBottom: asOf(r.mBottom, width, d), asTop: asOf(r.mTop, width, dTop), asBottomProvided: asB, asTopProvided: asT,
      phiMnBottom: capOf(asB, width, d), phiMnTop: capOf(asT, width, dTop), phiVc: vcOf(asB, width, d), span, overhang, Lo, rigid,
    };
    if (rigid === false && ks) out.winkler = winklerOf(b, a, c, lever, E, ks);
    if (out.winkler) {
      out.mBottom = Math.max(out.mBottom, out.winkler.mBottom); out.mTop = Math.max(out.mTop, out.winkler.mTop); out.vu = Math.max(out.vu, out.winkler.vu);
      out.asBottom = asOf(out.mBottom, width, d); out.asTop = asOf(out.mTop, width, dTop);
    }
    return out;
  });
  const bandList = across ? cols.map((p, i) => {
    const width = Math.min(g.axis === 'x' ? a.B : a.L, (g.axis === 'x' ? p.b : p.h) + dOf(across)), dens = bottomPerM[across];
    const asReq = Math.max(asOf(bandMu[i]!, width, dOf(across)), prov.AsMin * width), asProvided = dens * width;
    return { column: p.demand.name, width, mu: bandMu[i]!, vu: bandVu[i]!, asReq, asProvided, phiMn: capOf(asProvided, width, dOf(across)), phiVc: vcOf(asProvided, width, dOf(across)) };
  }) : [];
  const need = { bottom: { x: 0, y: 0 }, top: { x: 0, y: 0 } };
  for (const s of strips) {
    const full = s.dir === 'x' ? a.L : a.B;
    need.bottom[s.dir] = Math.max(need.bottom[s.dir], (s.asBottom / s.width) * full);
    need.top[s.dir] = Math.max(need.top[s.dir], (s.asTop / s.width) * full);
  }
  for (const b of bandList) need.bottom[across!] = Math.max(need.bottom[across!], (b.asReq / b.width) * (across === 'x' ? a.L : a.B));
  const minOf = (dir: Axis) => prov.AsMin * (dir === 'x' ? a.L : a.B);
  const all = (dir: Axis) => extraIn(a, dir, 'bottom', -Infinity, Infinity) + extraIn(a, dir, 'top', -Infinity, Infinity);
  const minSteel = { x: minOf('x'), y: minOf('y'), xProvided: (bottomPerM.x + topPerM.x) * a.L + all('x'), yProvided: (bottomPerM.y + topPerM.y) * a.B + all('y') };
  const an = code.anchorage;
  const dia = Math.max(a.x.dia, a.y.dia);
  const ld = an && dia > 0 ? an.ldh({ fc: c.fc, fy: c.fy }, dia) : 0;
  const available = groupRoom(cols, a, c.cover);
  const anchorage = { ld, available, ok: !an || ld <= available + 1e-9 };
  const columns: GroupColumn[] = cols.map((p, i) => {
    const bs = bearingStrength({ ...plan, xc: p.x, yc: p.y, b: p.b, h: p.h, ...(p.demand.column?.area ? { area: p.demand.column.area } : {}) }, c.members?.[p.demand.key]?.columnFc ?? c.fc, c.fc);
    const phiBn = Math.min(bs.column, bs.footing);
    const dw = a.columns?.[p.demand.key];
    let dowels: GroupColumn['dowels'] = null;
    if (p.demand.column && an && dw && dw.count > 0) {
      const bars = c.members?.[p.demand.key]?.columnBars, tension = bars?.tension ?? false, mat = { fc: c.fc, fy: c.fy };
      const required = Math.max(p.demand.column.dowelMin ?? 0.005 * (p.demand.column.area ?? p.b * p.h) * 1e4, (10 * Math.max(0, pu[i]! - phiBn)) / (0.65 * c.fy));
      dowels = { ...dw, area: dw.count * barArea(dw.dia), required, ldc: an.ldc(mat, dw.dia), ldh: tension ? an.ldh(mat, dw.dia) : 0, available: a.h - c.cover - (a.x.dia + a.y.dia) / 1000, lap: dowelLap(an, bars, { fc: c.members?.[p.demand.key]?.columnFc ?? c.fc, fy: c.fy }, dw.dia, tension), tension, ...dowelReach(bars, dw.dia, leverOf(p.demand, a.h) - a.h) };
    }
    return { key: p.demand.key, name: p.demand.name, x: p.x, y: p.y, b: p.b, h: p.h, N: p.demand.service?.N ?? 0, punching: punching[i]!, bearing: { pu: pu[i]!, phiBn }, dowels, anchor: p.anchor };
  });
  const ties: GroupTie[] = tied ? cols.map((p, i) => {
    const lim = tieLimits(cr), H = (p.demand.column?.storey ?? 3) + lever, e = Math.abs(tied === 'x' ? p.x : p.y);
    const Ns = p.demand.service?.N ?? 0, sw = p.demand.service ? (tied === 'x' ? p.demand.service.My + lever * p.demand.service.Vx : p.demand.service.Mx - lever * p.demand.service.Vy) : 0;
    const Ts = (Ns * e + Math.abs(sw)) / H;
    const bars = tieBars(tieForce[i]!.max, c.fy, c.diameters, 0, cr.footingTieMinBars);
    const perLayer = Math.max(1, bars.count / 2);
    const b = Math.max(cr.footingTieMinWidth, Math.ceil((2 * c.cover + 2 * TIE.stirrup + perLayer * bars.dia / 1000 + (perLayer - 1) * TIE.gap) / 0.05 - 1e-9) * 0.05);
    return { column: p.demand.name, axis: tied, H, Tu: tieForce[i]!.max, ...bars, e, Ns, Ts, b, h: cr.footingTieMinDepth, mu: lim.mu, byCombo: tieForce[i]!.byCombo, stretch: null };
  }) : [];
  return { layers, lever, cols, bearing, strips, bands: bandList, columns, ties, need, minSteel, anchorage, sMax: footingSpacing(c, a.h).s, combos: perCombo, punching: cols.map((_, i) => ({ cases: cases[i]!, site: sites[i]! })) };
}

function winklerOf(b: { dir: Axis; lo: number; hi: number; cols: Placed[] }, a: FootingAdopted, c: FootingContext, lever: number, E: number, ks: number): GroupStrip['winkler'] {
  const S = b.dir === 'x' ? a.B : a.L, width = b.hi - b.lo, EI = E * width * a.h ** 3 / 12, cr = critOf(c);
  const run = (pick: (d: FootingDemand) => FootingAction | null | undefined) => {
    const loads = b.cols.map((p) => { const q = pick(p.demand); return q ? { s: (b.dir === 'x' ? p.x : p.y) + S / 2, P: q.N, M: b.dir === 'x' ? q.My + lever * q.Vx : -(q.Mx - lever * q.Vy) } : null; });
    return loads.every(Boolean) ? winklerStrip({ S, b: width, EI, ks, ends: cr.footingWinklerEnds, loads: loads as never }) : null;
  };
  const s = run((d) => d.service);
  let mBottom = 0, mTop = 0, vu = 0;
  for (const name of b.cols[0]?.demand.combos.map((x) => x.combo) ?? []) {
    const r = run((d) => d.combos.find((x) => x.combo === name));
    if (!r) continue;
    mBottom = Math.max(mBottom, ...r.M); mTop = Math.max(mTop, ...r.M.map((m) => -m)); vu = Math.max(vu, ...r.V.map(Math.abs));
  }
  const weight = 25 * a.h;
  return { y: s ? Math.max(...s.y) : 0, q: s ? Math.max(...s.q) + weight : 0, mBottom, mTop, vu };
}

/** What the thickness has to hold: shear in every strip and band, punching at every column (unless `punching` is false), d ≥ 150 mm and the dowels' anchorage. */
export const groupThicknessHolds = (r: GroupAnalysis, punching = true): boolean =>
  r.strips.every((s) => s.vu <= s.phiVc + 1e-9) && r.bands.every((b) => b.vu <= b.phiVc + 1e-9)
  && (!punching || r.columns.every((k) => !k.punching || k.punching.utilization <= 1 + 1e-9))
  && Math.min(r.layers.dx, r.layers.dy) >= MIN_D - 1e-9
  && r.columns.every((k) => !k.dowels || Math.max(k.dowels.ldc, k.dowels.ldh) <= k.dowels.available + 1e-9);

