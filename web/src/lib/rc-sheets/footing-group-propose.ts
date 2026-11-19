import { slabProvisions } from '../engine/codes/argentina/losas';
import { barArea } from './bars';
import { bearingHolds, ceilTo, edgeFactorOf, r3 } from './footing-mechanics';
import { needsOf } from './footing-needs';
import { designPunchingFix } from './footing-punching';
import { proposeLayer } from './footing-mesh';
import { minThickness, preferredDiameters, type FootingRowCode } from './footing-design';
import { analyseGroup, extraPositions, groupBearing, groupRoom, groupThicknessHolds, heldAcross, placeMembers, strappedAcross, type GroupAnalysis } from './footing-group';
import type { FootingAdopted, FootingContext, FootingDowels, FootingGroup, FootingMesh, GroupExtra, PunchingFix } from './footing-types';

const STEP = 0.1, STEP_H = 0.05, MAX_PLAN = 60, MAX_H = 2.5;
/** Past an outer column's axis a free edge runs at least this far, and this far past its face, m. */
const OVERHANG = 0.5, PAST_FACE = 0.25;
/** Beside a strip's columns across its line, m. */
const SIDE = 0.2;
/** A strip balanced by straps stops this short of the column its straps run to, m. */
const STRAP_GAP = 0.3;
type Axis = 'x' | 'y';

export function proposeGroupDowels(g: FootingGroup, c: FootingContext): Record<string, FootingDowels> {
  const out: Record<string, FootingDowels> = {};
  for (const m of g.members) {
    if (!m.column) continue;
    const bars = c.members?.[m.key]?.columnBars ?? m.column.bars;
    if (bars && bars.count > 0) { out[m.key] = { count: bars.count, dia: bars.dia }; continue; }
    const need = m.column.dowelMin ?? 0.005 * (m.column.area ?? m.column.b * m.column.h) * 1e4;
    out[m.key] = { count: Math.max(4, 2 * Math.ceil(need / barArea(12) / 2)), dia: 12 };
  }
  return out;
}

const median = (v: number[]) => { const s = [...v].sort((p, q) => p - q); return s.length ? s[Math.floor((s.length - 1) / 2)]! : 0; };
const down25 = (v: number) => Math.floor(v / 0.025 + 1e-9) * 0.025;

/**
 * Bottom and top meshes both ways for a strip or mat of this size: a mesh over the whole plan,
 * never under the minimum steel shared by both faces (§8.6.1.1, §13.3.4.4) nor under what most
 * strips ask, and bars added over the band of each strip that asks for more.
 */
export function proposeGroupBars(g: FootingGroup, c: FootingContext, size: Omit<FootingAdopted, 'x' | 'y'>, code: FootingRowCode): Pick<FootingAdopted, 'x' | 'y' | 'tops' | 'extra'> {
  const pick = (k: Axis) => preferredDiameters(c, k);
  const room = groupRoom(placeMembers(g, size), size, c.cover);
  const fits = (dia: number) => !code.anchorage || code.anchorage.ldh({ fc: c.fc, fy: c.fy }, dia) <= room + 1e-9;
  const bottomPick = (k: Axis) => { const all = pick(k), ok = all.filter(fits); return ok.length ? ok : all; };
  const flat = { B: size.B, L: size.L, ex: 0, ey: 0 };
  const prov = slabProvisions('2025', c.fy, size.h);
  const layer = (k: Axis, asReq: number, s: number, bottom = false): FootingMesh => { const m = proposeLayer(k, flat, asReq, s, bottom ? bottomPick(k) : pick(k), c.cover, true); return { dia: m.dia, spacing: m.spacing }; };
  const band = (k: Axis, face: 'bottom' | 'top', lo: number, hi: number, asReq: number, sMax: number): GroupExtra | null => {
    const list = face === 'bottom' ? bottomPick(k) : pick(k);
    for (const dia of list) {
      const sp = Math.min(sMax, down25((barArea(dia) * (hi - lo)) / Math.max(asReq, 1e-9)));
      const e = { dir: k, face, lo, hi, mesh: { dia, spacing: sp } };
      if (sp >= 0.1 - 1e-9 && extraPositions(e).length * barArea(dia) >= asReq - 1e-9) return e;
    }
    const dia = list[list.length - 1] ?? 16;
    for (let sp = 0.1; sp >= 0.05 - 1e-9; sp -= 0.025) { const e = { dir: k, face, lo, hi, mesh: { dia, spacing: Math.round(sp * 1000) / 1000 } }; if (extraPositions(e).length * barArea(dia) >= asReq - 1e-9) return e; }
    return { dir: k, face, lo, hi, mesh: { dia, spacing: 0.05 } };
  };
  const first = (k: Axis): FootingMesh => ({ dia: pick(k)[0] ?? 12, spacing: 0.2 });
  let bars: Pick<FootingAdopted, 'x' | 'y' | 'tops' | 'extra'> = { x: { dia: bottomPick('x')[0] ?? 12, spacing: 0.2 }, y: { dia: bottomPick('y')[0] ?? 12, spacing: 0.2 }, ...(g.kind === 'mat' ? { tops: { x: first('x'), y: first('y') } } : {}) };
  for (let k = 0; k < 3; k++) {
    const r = analyseGroup(g, c, { ...size, ...bars }, code);
    const full = (dir: Axis) => (dir === 'x' ? size.L : size.B);
    const min = (dir: Axis) => prov.AsMin * full(dir);
    const own = (dir: Axis) => r.strips.filter((s) => s.dir === dir);
    const typical = (dir: Axis, face: 'bottom' | 'top') => median(own(dir).map((s) => ((face === 'bottom' ? s.asBottom : s.asTop) / s.width) * full(dir)));
    const across = g.kind === 'strip' && g.axis ? (g.axis === 'x' ? 'y' : 'x') : null;
    const bottom = (dir: Axis) => (g.kind === 'mat' ? Math.max(min(dir) / 2, typical(dir, 'bottom')) : Math.max(r.need.bottom[dir], min(dir)));
    const top = (dir: Axis) => (g.kind === 'mat' ? Math.max(min(dir) / 2, typical(dir, 'top')) : dir === across ? 0 : r.need.top[dir]);
    const tops: { x?: FootingMesh; y?: FootingMesh } = {};
    for (const dir of ['x', 'y'] as const) if (top(dir) > 1e-6) tops[dir] = layer(dir, top(dir), r.sMax);
    const x = layer('x', bottom('x'), r.sMax, true), y = layer('y', bottom('y'), r.sMax, true);
    const base = { x, y, ...(tops.x || tops.y ? { tops } : {}) };
    const extra: GroupExtra[] = [];
    if (g.kind === 'mat') {
      const probe = analyseGroup(g, c, { ...size, ...base }, code);
      for (const s of probe.strips) for (const face of ['bottom', 'top'] as const) {
        const req = face === 'bottom' ? s.asBottom : s.asTop, has = face === 'bottom' ? s.asBottomProvided : s.asTopProvided;
        if (req > has + 1e-6) { const e = band(s.dir, face, s.at - s.width / 2, s.at + s.width / 2, req - has, r.sMax); if (e) extra.push(e); }
      }
    }
    const next = { ...base, ...(extra.length ? { extra } : {}) };
    if (JSON.stringify(next) === JSON.stringify(bars)) break;
    bars = next;
  }
  return bars;
}

interface Extent { lo: number; hi: number; heldLo: boolean; heldHi: boolean }

/**
 * A strip or a mat for its columns: every edge past the outer columns' faces, centred on the
 * resultant of their service loads where its edges are free (GA §13.1), at a column's outer face
 * where that column stands at a property line (GA §13.3). A strip is as wide across as the soil
 * needs; a mat grows on its free edges. Then as thick as the shear in its strips and bands,
 * d ≥ 150 mm and the dowels need; punching the concrete alone does not carry is taken at each
 * column by stirrups, else a drop under it, and only where neither does by a thicker base, while
 * the soil holds it. Where the soil does not at the plan the lines allow, the base is designed
 * through all the same and `needs` is the allowable pressure it asks of the soil.
 */
export function proposeGroup(g: FootingGroup, c: FootingContext, code: FootingRowCode): { adopted: FootingAdopted; reached: boolean; needs?: number } | null {
  const ref = g.members[0]!;
  if (!ref.soil || g.members.some((m) => !m.column || !m.service)) return null;
  const pts = g.members.map((m) => ({ x: m.at.x - ref.at.x, y: m.at.y - ref.at.y, b: m.column!.b, h: m.column!.h, N: m.service!.N, anchor: m.edge?.anchor ?? [0, 0] }));
  const N = pts.reduce((s, p) => s + p.N, 0);
  if (!(N > 0)) return null;
  const res = { x: pts.reduce((s, p) => s + p.N * p.x, 0) / N, y: pts.reduce((s, p) => s + p.N * p.y, 0) / N };
  const across = g.kind === 'strip' && g.axis ? (g.axis === 'x' ? 'y' : 'x') as Axis : null;
  const half = (p: typeof pts[number], k: Axis) => (k === 'x' ? p.b : p.h) / 2;
  const extent = (k: Axis, margin: (p: typeof pts[number]) => number): Extent => {
    const i = k === 'x' ? 0 : 1;
    let lo = Math.min(...pts.map((p) => p[k] - margin(p))), hi = Math.max(...pts.map((p) => p[k] + margin(p)));
    const loLine = pts.filter((p) => p.anchor[i]! < 0).map((p) => p[k] - half(p, k)), hiLine = pts.filter((p) => p.anchor[i]! > 0).map((p) => p[k] + half(p, k));
    const heldLo = loLine.length > 0, heldHi = hiLine.length > 0;
    if (heldLo) lo = Math.min(...loLine);
    if (heldHi) hi = Math.max(...hiLine);
    const span = Math.max(res[k] - lo, hi - res[k]);
    if (!heldLo) lo = Math.min(lo, res[k] - span);
    if (!heldHi) hi = Math.max(hi, res[k] + span);
    return { lo, hi, heldLo, heldHi };
  };
  const margin = (k: Axis) => (p: typeof pts[number]) => Math.max(OVERHANG, half(p, k) + PAST_FACE);
  const ext: Record<Axis, Extent> = { x: extent('x', margin('x')), y: extent('y', margin('y')) };
  const minH = minThickness(c.cover);
  let h = minH;
  const strapped = strappedAcross(g);
  const widest = strapped ? Math.min(...g.members.map((m) => { const p = m.edge!.partners.find((x) => x.axis === strapped)!; const half = (k: { b: number; h: number } | null | undefined) => (strapped === 'x' ? k?.b ?? 0 : k?.h ?? 0) / 2; return p.L + half(m.column) - half(p.column) - STRAP_GAP; })) : Infinity;
  if (across) {
    const S = ext[g.axis!].hi - ext[g.axis!].lo;
    const qNet = ref.soil.allowable - 25 * h;
    const wide = Math.max(...pts.map((p) => 2 * half(p, across))) + 2 * SIDE;
    const W = Math.min(Math.max(ceilTo(wide), ceilTo(qNet > 0 ? N / qNet / S : wide)), Math.max(ceilTo(wide), widest));
    const held = heldAcross(g);
    const line = held < 0 ? Math.min(...pts.map((p) => p[across] - half(p, across))) : held > 0 ? Math.max(...pts.map((p) => p[across] + half(p, across))) : 0;
    ext[across] = held < 0 ? { lo: line, hi: line + W, heldLo: true, heldHi: false } : held > 0 ? { lo: line - W, hi: line, heldLo: false, heldHi: true } : { lo: res[across] - W / 2, hi: res[across] + W / 2, heldLo: false, heldHi: false };
  }
  const dowels = proposeGroupDowels(g, c);
  const len = (e: Extent) => (e.heldLo && e.heldHi ? e.hi - e.lo : ceilTo(e.hi - e.lo));
  const mid = (e: Extent) => (e.heldHi && !e.heldLo ? e.hi - len(e) / 2 : e.lo + len(e) / 2);
  const sizeOf = (): Omit<FootingAdopted, 'x' | 'y'> => ({ B: r3(len(ext.x)), L: r3(len(ext.y)), h: r3(h), ex: r3(mid(ext.x)), ey: r3(mid(ext.y)), columns: dowels });
  const grow = (axes: readonly Axis[]): boolean => {
    let any = false;
    for (const k of axes) {
      const e = ext[k];
      if (e.heldLo && e.heldHi) continue;
      if (k === strapped && e.hi - e.lo + STEP > widest + 1e-9) continue;
      if (!e.heldLo && !e.heldHi) { e.lo -= STEP / 2; e.hi += STEP / 2; } else if (e.heldLo) e.hi += STEP; else e.lo -= STEP;
      any = true;
    }
    return any;
  };
  const k = edgeFactorOf(ref.soil);
  const allowable = ref.soil.allowable;
  const growAxes: readonly Axis[] = across ? [across] : ['x', 'y'];
  const noBars = { x: { dia: 0, spacing: 0 }, y: { dia: 0, spacing: 0 } };
  let blocked = false;
  for (let step = 0; step < 400; step++) {
    const size = sizeOf();
    const s = groupBearing(g, size);
    if (!s) return null;
    if (!blocked && !bearingHolds(s, allowable, k)) {
      if (grow(growAxes)) { if (ext.x.hi - ext.x.lo > MAX_PLAN || ext.y.hi - ext.y.lo > MAX_PLAN) break; continue; }
      blocked = true;
    }
    if (code.bearingOnly) return { adopted: { ...size, ...noBars }, reached: !blocked, ...needsOf(s, k) };
    const a = { ...size, ...proposeGroupBars(g, c, size, code) };
    const r = analyseGroup(g, c, a, code);
    if (!groupThicknessHolds(r, false)) h += STEP_H;
    else if (!r.anchorage.ok && grow(['x', 'y'])) continue;
    else {
      const fixes = groupPunchingFixes(r, a);
      if (!fixes) h += STEP_H;
      else {
        const done: FootingAdopted = { ...a, ...(Object.keys(fixes).length ? { punching: fixes } : {}) };
        const sb = groupBearing(g, done)!;
        if (bearingHolds(sb, allowable, k)) return { adopted: done, reached: true };
        if (!blocked && grow(growAxes)) continue;
        return { adopted: done, reached: false, ...needsOf(sb, k) };
      }
    }
    if (ext.x.hi - ext.x.lo > MAX_PLAN || ext.y.hi - ext.y.lo > MAX_PLAN || h > MAX_H) break;
  }
  const last = sizeOf();
  const lastBars = { ...last, ...(code.bearingOnly ? noBars : proposeGroupBars(g, c, last, code)) };
  const sb = groupBearing(g, last);
  return { adopted: lastBars, reached: false, ...(sb && !bearingHolds(sb, allowable, k) ? needsOf(sb, k) : {}) };
}

/**
 * Each column's stirrups or drop where the concrete alone does not carry its punching at this
 * thickness (`footing-punching.ts`): stirrups where the base has a top mesh for their hooks to
 * take, else a drop. Null where some column has neither: the base has to be thicker.
 */
export function groupPunchingFixes(r: GroupAnalysis, a: Pick<FootingAdopted, 'tops'>): Record<string, PunchingFix> | null {
  const out: Record<string, PunchingFix> = {};
  const stirrups = !!(a.tops?.x || a.tops?.y);
  for (let i = 0; i < r.columns.length; i++) {
    const k = r.columns[i]!, p = r.punching[i]!;
    if (!k.punching || k.punching.utilization <= 1 + 1e-9) continue;
    const fix = designPunchingFix(p.cases, p.site, stirrups);
    if (fix === null) return null;
    if (fix) out[k.key] = fix;
  }
  return out;
}
