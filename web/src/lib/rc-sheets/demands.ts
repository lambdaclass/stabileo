import { buildCriticalStations, extractForcesAtStation, type StationForces } from '../engine/station-forces';
import { shellCentreRows, shellLocalAxes, type ShellModel } from '../engine/shell-results';
import { woodArmer } from '../engine/wood-armer';
import type { AnalysisResults3D, ElementForces3D } from '../engine/types-3d';
import type { BeamDemand } from './beam-row';
import type { ColumnCase, ColumnDemand } from './column-row';
import type { SlabDemand, SlabFace } from './slab-row';
import type { Signed } from './types';

type Pt = { id: number; x: number; y: number; z?: number };
type El = { id: number; nodeI: number; nodeJ: number; sectionId: number; type?: string; rollAngle?: number };

export interface DemandGroup {
  id: number; name: string; kind: string;
  level?: string;
  elements: number[]; quads: number[]; plates: number[];
}

export interface DemandSet {
  name: string;
  result: AnalysisResults3D;
  /** Sum of the factors the combination gives the dead-load cases. */
  deadFactor?: number;
}

export interface DemandInput {
  nodes: ReadonlyMap<number, Pt>;
  elements: ReadonlyMap<number, El>;
  sections: ReadonlyMap<number, { id: number; b?: number; h?: number }>;
  supportNodes: ReadonlySet<number>;
  shells: ShellModel;
  groups: readonly DemandGroup[];
  sets: readonly DemandSet[];
  /** The dead-load cases at factor 1, for the sustained part of a column's load. */
  dead?: readonly AnalysisResults3D[];
  psi?: (elementId: number) => { psiA: number; psiB: number };
  /** The name of the level at an elevation, m. */
  levelAt?: (z: number) => string;
}

const zOf = (p: Pt | undefined) => p?.z ?? 0;
const VERTICAL = 0.9;

function direction(m: DemandInput, e: El): [number, number, number] {
  const a = m.nodes.get(e.nodeI), b = m.nodes.get(e.nodeJ);
  if (!a || !b) return [0, 0, 0];
  const v: [number, number, number] = [b.x - a.x, b.y - a.y, zOf(b) - zOf(a)];
  const l = Math.hypot(...v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
const isVertical = (m: DemandInput, e: El) => Math.abs(direction(m, e)[2]) > VERTICAL;
const lengthOf = (m: DemandInput, e: El) => {
  const a = m.nodes.get(e.nodeI), b = m.nodes.get(e.nodeJ);
  return a && b ? Math.hypot(b.x - a.x, b.y - a.y, zOf(b) - zOf(a)) : 0;
};

function incidence(m: DemandInput): Map<number, El[]> {
  const out = new Map<number, El[]>();
  for (const e of m.elements.values()) for (const n of [e.nodeI, e.nodeJ]) { const l = out.get(n); if (l) l.push(e); else out.set(n, [e]); }
  return out;
}

function chain(m: DemandInput, ids: readonly number[]): Array<{ e: El; forward: boolean }> | null {
  const els = ids.map((id) => m.elements.get(id)).filter((e): e is El => !!e);
  if (!els.length) return null;
  const deg = new Map<number, number>();
  for (const e of els) for (const n of [e.nodeI, e.nodeJ]) deg.set(n, (deg.get(n) ?? 0) + 1);
  const ends = [...deg].filter(([, d]) => d === 1).map(([n]) => n);
  if (ends.length !== 2) return null;
  const start = ends.sort((a, b) => {
    const p = m.nodes.get(a)!, q = m.nodes.get(b)!;
    return zOf(p) - zOf(q) || p.x - q.x || p.y - q.y;
  })[0]!;
  const left = new Set(els);
  const out: Array<{ e: El; forward: boolean }> = [];
  let at = start;
  while (left.size) {
    const next = [...left].find((e) => e.nodeI === at || e.nodeJ === at);
    if (!next) return null;
    left.delete(next);
    const forward = next.nodeI === at;
    out.push({ e: next, forward });
    at = forward ? next.nodeJ : next.nodeI;
  }
  return out;
}

interface Station { x: number; s: StationForces }

function runStations(m: DemandInput, run: Array<{ e: El; forward: boolean }>, set: DemandSet): Station[] {
  const by = new Map(set.result.elementForces.map((f) => [f.elementId, f]));
  const out: Station[] = [];
  let offset = 0;
  for (const { e, forward } of run) {
    const L = lengthOf(m, e);
    const ef: ElementForces3D | undefined = by.get(e.id);
    if (ef) for (const t of buildCriticalStations(ef)) out.push({ x: offset + (forward ? t : 1 - t) * L, s: extractForcesAtStation(ef, t) });
    offset += L;
  }
  return out;
}

const upright = (e: El) => { const r = ((((e.rollAngle ?? 0) % 180) + 180) % 180); return r < 5 || r > 175; };

export function beamDemands(m: DemandInput): BeamDemand[] {
  const inc = incidence(m);
  const out: BeamDemand[] = [];
  for (const g of m.groups) {
    if (g.kind !== 'beam') continue;
    const run = chain(m, g.elements);
    if (!run || run.some(({ e }) => isVertical(m, e))) continue;
    const mine = new Set(g.elements);
    const spans: Array<Array<{ e: El; forward: boolean }>> = [[]];
    run.forEach((r, i) => {
      spans[spans.length - 1]!.push(r);
      const end = r.forward ? r.e.nodeJ : r.e.nodeI;
      const support = m.supportNodes.has(end) || (inc.get(end) ?? []).some((o) => !mine.has(o.id) && isVertical(m, o));
      if (support && i < run.length - 1) spans.push([]);
    });
    spans.forEach((span, k) => {
      const first = span[0]!.e;
      const sec = m.sections.get(first.sectionId);
      if (!sec?.b || !sec?.h) return;
      const turned = !upright(first) && Math.abs((((first.rollAngle ?? 0) % 180) + 180) % 180 - 90) < 5;
      const flex: 'my' | 'mz' = turned ? 'mz' : 'my';
      const shear: 'vz' | 'vy' = turned ? 'vy' : 'vz';
      const L = span.reduce((s, r) => s + lengthOf(m, r.e), 0);
      let mPos: Signed = { value: 0 }, mNs: Signed = { value: 0 }, mNe: Signed = { value: 0 }, vu: Signed = { value: 0 }, tu: Signed = { value: 0 };
      let nPos = 0, nNs = 0, nNe = 0, nV = 0;
      for (const set of m.sets) {
        for (const { x, s } of runStations(m, span, set)) {
          const mm = s[flex], nc = -s.n;
          const src = { combo: set.name, x };
          if (mm > mPos.value) { mPos = { value: mm, source: src }; nPos = nc; }
          if (-mm > 0 && x <= L / 2 && -mm > mNs.value) { mNs = { value: -mm, source: src }; nNs = nc; }
          if (-mm > 0 && x > L / 2 && -mm > mNe.value) { mNe = { value: -mm, source: src }; nNe = nc; }
          if (Math.abs(s[shear]) > vu.value) { vu = { value: Math.abs(s[shear]), source: src }; nV = nc; }
          if (Math.abs(s.torsion) > tu.value) tu = { value: Math.abs(s.torsion), source: src };
        }
      }
      out.push({
        key: `beam:${g.id}:${k}`, name: spans.length > 1 ? `${g.name}-${k + 1}` : g.name, level: g.level,
        length: L, b: turned ? sec.h : sec.b, h: turned ? sec.b : sec.h,
        mPos, mNegStart: mNs, mNegEnd: mNe, nAtPos: nPos, nAtNegStart: nNs, nAtNegEnd: nNe, vu, nAtV: nV, tu,
      });
    });
  }
  return out;
}

export function columnDemands(m: DemandInput): ColumnDemand[] {
  const inc = incidence(m);
  const out: ColumnDemand[] = [];
  const deadBy = (m.dead ?? []).map((r) => new Map(r.elementForces.map((f) => [f.elementId, f])));
  for (const g of m.groups) {
    if (g.kind !== 'column') continue;
    const run = chain(m, g.elements);
    if (!run || !run.every(({ e }) => isVertical(m, e))) continue;
    const mine = new Set(g.elements);
    const storeys: Array<Array<{ e: El; forward: boolean }>> = [[]];
    run.forEach((r, i) => {
      storeys[storeys.length - 1]!.push(r);
      const top = r.forward ? r.e.nodeJ : r.e.nodeI;
      if (i < run.length - 1 && (inc.get(top) ?? []).some((o) => !mine.has(o.id) && !isVertical(m, o))) storeys.push([]);
    });
    const deepest = (node: number) => Math.max(0, ...(inc.get(node) ?? []).filter((o) => !mine.has(o.id) && !isVertical(m, o)).map((o) => m.sections.get(o.sectionId)?.h ?? 0));
    storeys.forEach((st, k) => {
      const bottom = st[0]!, top = st[st.length - 1]!;
      const sec = m.sections.get(bottom.e.sectionId);
      if (!sec?.b || !sec?.h) return;
      const nBot = bottom.forward ? bottom.e.nodeI : bottom.e.nodeJ, nTop = top.forward ? top.e.nodeJ : top.e.nodeI;
      const L = st.reduce((s, r) => s + lengthOf(m, r.e), 0);
      const lu = Math.max(0.1, L - (deepest(nBot) + deepest(nTop)) / 2);
      const pb = m.psi?.(bottom.e.id), pt = m.psi?.(top.e.id);
      const psiBot = pb ? (bottom.forward ? pb.psiA : pb.psiB) : 1, psiTop = pt ? (top.forward ? pt.psiB : pt.psiA) : 1;
      const at = (ef: ElementForces3D | undefined, forward: boolean, end: 'bottom' | 'top') =>
        ef ? extractForcesAtStation(ef, (end === 'bottom') === forward ? 0 : 1) : undefined;
      const deadPu = deadBy.reduce((s, by) => s - (at(by.get(bottom.e.id), bottom.forward, 'bottom')?.n ?? 0), 0);
      const cases: ColumnCase[] = [];
      for (const set of m.sets) {
        const by = new Map(set.result.elementForces.map((f) => [f.elementId, f]));
        const b = at(by.get(bottom.e.id), bottom.forward, 'bottom'), t = at(by.get(top.e.id), top.forward, 'top');
        if (!b || !t) continue;
        cases.push({
          combo: set.name, pu: Math.max(-b.n, -t.n),
          ...(m.dead?.length && set.deadFactor !== undefined ? { puD: Math.max(0, set.deadFactor * deadPu) } : {}),
          mxTop: t.my, mxBot: b.my, myTop: t.mz, myBot: b.mz,
        });
      }
      out.push({
        key: `column:${g.id}:${k}`, name: g.name, level: m.levelAt ? m.levelAt(zOf(m.nodes.get(nBot))) : g.level,
        b: sec.b, h: sec.h, length: L, lu, psiTop, psiBot, cases: governingCases(cases),
      });
    });
  }
  return out;
}

function governingCases(cases: ColumnCase[]): ColumnCase[] {
  if (cases.length <= 6) return cases;
  const pick = new Set<ColumnCase>();
  const by = (f: (c: ColumnCase) => number) => cases.reduce((a, c) => (f(c) > f(a) ? c : a));
  pick.add(by((c) => c.pu)); pick.add(by((c) => -c.pu));
  pick.add(by((c) => Math.max(Math.abs(c.mxTop), Math.abs(c.mxBot))));
  pick.add(by((c) => Math.max(Math.abs(c.myTop), Math.abs(c.myBot))));
  pick.add(by((c) => Math.max(Math.abs(c.mxTop), Math.abs(c.mxBot)) + Math.max(Math.abs(c.myTop), Math.abs(c.myBot))));
  return [...pick];
}

export function slabDemands(m: DemandInput, thickness: (g: DemandGroup) => number | null): SlabDemand[] {
  const out: SlabDemand[] = [];
  const quadNodes = (id: number) => m.shells.quads?.get(id)?.nodes ?? [];
  const plateNodes = (id: number) => m.shells.plates?.get(id)?.nodes ?? [];
  for (const g of m.groups) {
    if (g.kind === 'wall' || (!g.quads.length && !g.plates.length)) continue;
    const keys = new Set([...g.quads.map((q) => `q${q}`), ...g.plates.map((p) => `p${p}`)]);
    const pts = [...g.quads.flatMap(quadNodes), ...g.plates.flatMap(plateNodes)].map((n) => m.nodes.get(n)).filter((p): p is Pt => !!p);
    if (!pts.length) continue;
    const flipOf = new Map<string, number>();
    let horizontal = true;
    for (const [kind, ids, nodesOf] of [['quad', g.quads, quadNodes], ['plate', g.plates, plateNodes]] as const) {
      for (const id of ids) {
        const ax = shellLocalAxes(kind, nodesOf(id).map((n) => m.nodes.get(n)!).filter(Boolean));
        if (!ax) continue;
        if (Math.abs(ax.ez[2]) < VERTICAL) horizontal = false;
        // A positive engine moment pulls the face on the element's +z side, so sagging is its negative when +z is up.
        flipOf.set(`${kind === 'quad' ? 'q' : 'p'}${id}`, ax.ez[2] >= 0 ? -1 : 1);
      }
    }
    if (!horizontal && g.kind !== 'slab') continue;
    const h = thickness(g);
    if (!h) continue;
    const best: Record<SlabFace, Signed> = { bottomX: { value: 0 }, bottomY: { value: 0 }, topX: { value: 0 }, topY: { value: 0 } };
    for (const set of m.sets) {
      for (const row of shellCentreRows(set.result, m.shells)) {
        const key = `${row.kind === 'quad' ? 'q' : 'p'}${row.id}`;
        if (!keys.has(key) || !row.global) continue;
        const k = flipOf.get(key) ?? -1;
        const mo = row.global.moment;
        const wa = woodArmer(k * mo.xx, k * mo.yy, k * mo.xy);
        for (const f of ['bottomX', 'bottomY', 'topX', 'topY'] as const) {
          if (wa[f] > best[f].value) best[f] = { value: wa[f], source: { combo: set.name } };
        }
      }
    }
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    out.push({
      key: `slab:${g.id}`, name: g.name, level: g.level,
      lx: Math.max(...xs) - Math.min(...xs), ly: Math.max(...ys) - Math.min(...ys), h, m: best,
    });
  }
  return out;
}
