import { buildCriticalStations, extractForcesAtStation, type StationForces } from '../engine/station-forces';
import { shellCentreRows, shellLocalAxes, type ShellModel } from '../engine/shell-results';
import { woodArmer } from '../engine/wood-armer';
import { effectiveFlange, type FlangeSide } from '../codes/cirsoc201/effective-flange';
import type { AnalysisResults3D, ElementForces3D } from '../engine/types-3d';
import type { BeamComboForces, BeamDemand, SectionEnv } from './beam-row';
import type { ColumnCase, ColumnDemand } from './column-row';
import type { SlabComboForces, SlabDemand, SlabFace } from './slab-row';
import type { WallComboForces, WallDemand } from './wall-row';
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
  /** Elevations of the levels, m, where a wall is cut into storeys. */
  levelZs?: readonly number[];
  /** Moments at the support faces and shear and torsion at d from them, instead of at the axes. */
  faces?: boolean;
  /** Half the support's extent along the beam at an element's end, m. */
  faceOffset?: (elementId: number, end: 'i' | 'j') => number;
  /** Beams designed with the slab cast on them as a compression flange (Table 6.3.2.1). */
  flange?: boolean;
}

const zOf = (p: Pt | undefined) => p?.z ?? 0;
const VERTICAL = 0.9;
const SLAB_FACE_KEYS = ['bottomX', 'bottomY', 'topX', 'topY'] as const;

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

function forcesAt(m: DemandInput, run: Array<{ e: El; forward: boolean }>, set: DemandSet, x: number): StationForces | undefined {
  const by = new Map(set.result.elementForces.map((f) => [f.elementId, f]));
  let offset = 0;
  for (const { e, forward } of run) {
    const L = lengthOf(m, e);
    if (x <= offset + L + 1e-9) {
      const ef = by.get(e.id);
      if (!ef || L <= 0) return undefined;
      const local = Math.min(1, Math.max(0, (x - offset) / L));
      return extractForcesAtStation(ef, forward ? local : 1 - local);
    }
    offset += L;
  }
  return undefined;
}

const emptySection = (x: number): SectionEnv => ({ x, pos: { value: 0 }, neg: { value: 0 }, nPos: 0, nNeg: 0 });

function take(env: SectionEnv, m: number, n: number, combo: string): void {
  if (m > env.pos.value) { env.pos = { value: m, source: { combo, x: env.x } }; env.nPos = n; }
  if (-m > env.neg.value) { env.neg = { value: -m, source: { combo, x: env.x } }; env.nNeg = n; }
}

function flangeOf(m: DemandInput, span: Array<{ e: El; forward: boolean }>, bw: number, ln: number): { bf: number; hf: number } | null {
  const ids = new Set(span.flatMap(({ e }) => [e.nodeI, e.nodeJ]));
  const first = span[0]!.e, last = span[span.length - 1]!.e;
  const p0 = m.nodes.get(span[0]!.forward ? first.nodeI : first.nodeJ), p1 = m.nodes.get(span[span.length - 1]!.forward ? last.nodeJ : last.nodeI);
  if (!p0 || !p1) return null;
  const ux = p1.x - p0.x, uy = p1.y - p0.y, ul = Math.hypot(ux, uy) || 1;
  const perp = (p: Pt) => ((p.x - p0.x) * -uy + (p.y - p0.y) * ux) / ul;
  const sides: FlangeSide[] = [];
  for (const sign of [1, -1]) {
    let hf = 0, reach = 0;
    for (const g of m.groups) {
      if (g.kind === 'wall' || (!g.quads.length && !g.plates.length)) continue;
      const shells = [...g.quads.map((id) => m.shells.quads?.get(id)), ...g.plates.map((id) => m.shells.plates?.get(id))].filter((x): x is { id: number; nodes: readonly number[]; thickness: number } => !!x);
      const touching = shells.filter((sh) => sh.nodes.filter((n) => ids.has(n)).length >= 2);
      const onSide = touching.filter((sh) => { const c = sh.nodes.map((n) => m.nodes.get(n)).filter((p): p is Pt => !!p); return c.length && Math.sign(c.reduce((a, p) => a + perp(p), 0)) === sign; });
      if (!onSide.length) continue;
      const pts = shells.flatMap((sh) => sh.nodes.map((n) => m.nodes.get(n))).filter((p): p is Pt => !!p && Math.sign(perp(p)) === sign && Math.abs(zOf(p) - zOf(p0)) < 0.05);
      hf = Math.max(hf, Math.min(...onSide.map((sh) => sh.thickness)));
      reach = Math.max(reach, ...pts.map((p) => Math.abs(perp(p))));
    }
    if (hf > 0 && reach > bw) sides.push({ hf, clear: reach - bw });
  }
  const f = effectiveFlange(bw, ln, sides);
  return f && f.bf > bw + 1e-6 ? { bf: f.bf, hf: f.hf } : null;
}

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
      const stations = m.sets.map((set) => runStations(m, span, set));
      const faceI = m.faces && m.faceOffset ? Math.min(L / 3, m.faceOffset(first.id, span[0]!.forward ? 'i' : 'j')) : 0;
      const lastEl = span[span.length - 1]!;
      const faceJ = m.faces && m.faceOffset ? Math.min(L / 3, m.faceOffset(lastEl.e.id, lastEl.forward ? 'j' : 'i')) : 0;
      const x0 = faceI, x1 = L - faceJ;
      const dv = 0.9 * (turned ? sec.b : sec.h);
      const v0 = m.faces ? Math.min(x0 + dv, L / 2) : 0, v1 = m.faces ? Math.max(x1 - dv, L / 2) : L;
      let xStar = (x0 + x1) / 2, best = 0;
      stations.forEach((list) => { for (const { x, s } of list) if (x >= x0 - 1e-9 && x <= x1 + 1e-9 && s[flex] > best) { best = s[flex]; xStar = x; } });
      const start = emptySection(x0), mid = emptySection(xStar), end = emptySection(x1);
      let negAny: Signed = { value: 0 }, nNegAny = 0, vu: Signed = { value: 0 }, nV = 0, tu: Signed = { value: 0 };
      const combos: BeamComboForces[] = [];
      m.sets.forEach((set, i) => {
        const list = stations[i]!;
        if (!list.length) return;
        const at = (x: number) => forcesAt(m, span, set, x) ?? list.reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a)).s;
        const s0 = at(x0), sm = at(xStar), s1 = at(x1);
        const extra = m.faces ? [{ x: v0, s: at(v0) }, { x: v1, s: at(v1) }] : [];
        take(start, s0[flex], -s0.n, set.name); take(mid, sm[flex], -sm.n, set.name); take(end, s1[flex], -s1.n, set.name);
        let mPos = 0, mNeg = 0, v = 0, nv = 0, t = 0;
        for (const { x, s } of [...list, ...extra]) {
          const mm = s[flex];
          if (x >= x0 - 1e-9 && x <= x1 + 1e-9) {
            mPos = Math.max(mPos, mm); mNeg = Math.max(mNeg, -mm);
            if (-mm > negAny.value) { negAny = { value: -mm, source: { combo: set.name, x } }; nNegAny = -s.n; }
          }
          if (x < v0 - 1e-9 || x > v1 + 1e-9) continue;
          if (Math.abs(s[shear]) > v) { v = Math.abs(s[shear]); nv = -s.n; }
          if (Math.abs(s[shear]) > vu.value) { vu = { value: Math.abs(s[shear]), source: { combo: set.name, x } }; nV = -s.n; }
          t = Math.max(t, Math.abs(s.torsion));
          if (Math.abs(s.torsion) > tu.value) tu = { value: Math.abs(s.torsion), source: { combo: set.name, x } };
        }
        combos.push({ combo: set.name, mStart: s0[flex], mSpan: sm[flex], mEnd: s1[flex], mPos, mNeg, nStart: -s0.n, nSpan: -sm.n, nEnd: -s1.n, v, nV: nv, t });
      });
      out.push({
        key: `beam:${g.id}:${k}`, name: spans.length > 1 ? `${g.name}-${k + 1}` : g.name, level: g.level,
        length: L, b: turned ? sec.h : sec.b, h: turned ? sec.b : sec.h,
        start, span: mid, end, negAny, nNegAny, vu, nAtV: nV, tu, combos,
        faces: m.faces ? { start: faceI, end: faceJ, shearAt: dv } : undefined,
        ...((fl) => (fl ? { flange: fl } : {}))(m.flange ? flangeOf(m, span, turned ? sec.h : sec.b, x1 - x0) : null),
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
        let vx = 0, vy = 0;
        for (const { s } of runStations(m, st, set)) { vx = Math.max(vx, Math.abs(s.vz)); vy = Math.max(vy, Math.abs(s.vy)); }
        cases.push({
          combo: set.name, pu: Math.max(-b.n, -t.n), puMin: Math.min(-b.n, -t.n),
          ...(m.dead?.length && set.deadFactor !== undefined ? { puD: Math.max(0, set.deadFactor * deadPu) } : {}),
          mxTop: t.my, mxBot: b.my, myTop: t.mz, myBot: b.mz, vx, vy,
        });
      }
      out.push({
        key: `column:${g.id}:${k}`, name: g.name, level: m.levelAt ? m.levelAt(zOf(m.nodes.get(nBot))) : g.level,
        b: sec.b, h: sec.h, length: L, lu, psiTop, psiBot, cases,
      });
    });
  }
  return out;
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
    const q = { x: { value: 0 } as Signed, y: { value: 0 } as Signed };
    const combos: SlabComboForces[] = [];
    for (const set of m.sets) {
      const c: SlabComboForces = { combo: set.name, bottomX: 0, bottomY: 0, topX: 0, topY: 0, qx: 0, qy: 0 };
      for (const row of shellCentreRows(set.result, m.shells)) {
        const key = `${row.kind === 'quad' ? 'q' : 'p'}${row.id}`;
        if (!keys.has(key) || !row.global) continue;
        const k = flipOf.get(key) ?? -1;
        const mo = row.global.moment;
        const wa = woodArmer(k * mo.xx, k * mo.yy, k * mo.xy);
        for (const f of SLAB_FACE_KEYS) {
          c[f] = Math.max(c[f], wa[f]);
          if (wa[f] > best[f].value) best[f] = { value: wa[f], source: { combo: set.name } };
        }
        const sh = row.global.shear;
        if (sh) { c.qx = Math.max(c.qx, Math.abs(sh[0])); c.qy = Math.max(c.qy, Math.abs(sh[1])); }
      }
      if (c.qx > q.x.value) q.x = { value: c.qx, source: { combo: set.name } };
      if (c.qy > q.y.value) q.y = { value: c.qy, source: { combo: set.name } };
      combos.push(c);
    }
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    out.push({
      key: `slab:${g.id}`, name: g.name, level: g.level,
      lx: Math.max(...xs) - Math.min(...xs), ly: Math.max(...ys) - Math.min(...ys), h, m: best, q, combos,
    });
  }
  return out;
}

type V3 = [number, number, number];
const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const tensorAlong = (t: { xx: number; yy: number; zz: number; xy: number; yz: number; zx: number }, a: V3, b: V3) =>
  dot3(a, [t.xx * b[0] + t.xy * b[1] + t.zx * b[2], t.xy * b[0] + t.yy * b[1] + t.yz * b[2], t.zx * b[0] + t.yz * b[1] + t.zz * b[2]]);

export function wallDemands(m: DemandInput): WallDemand[] {
  const out: WallDemand[] = [];
  const nodesOf = (kind: 'quad' | 'plate', id: number) => (kind === 'quad' ? m.shells.quads?.get(id) : m.shells.plates?.get(id))?.nodes ?? [];
  const thicknessOf = (kind: 'quad' | 'plate', id: number) => (kind === 'quad' ? m.shells.quads?.get(id) : m.shells.plates?.get(id))?.thickness ?? 0;
  for (const g of m.groups) {
    if (!g.quads.length && !g.plates.length) continue;
    const shells = [...g.quads.map((id) => ({ kind: 'quad' as const, id })), ...g.plates.map((id) => ({ kind: 'plate' as const, id }))];
    const geo = shells.map((sh) => {
      const pts = nodesOf(sh.kind, sh.id).map((n) => m.nodes.get(n)).filter((p): p is Pt => !!p);
      return { ...sh, key: `${sh.kind === 'quad' ? 'q' : 'p'}${sh.id}`, pts, axes: shellLocalAxes(sh.kind, pts), t: thicknessOf(sh.kind, sh.id) };
    }).filter((x) => x.pts.length >= 3 && x.axes);
    if (!geo.length) continue;
    const vertical = geo.every((x) => Math.abs(x.axes!.ez[2]) < 1 - VERTICAL);
    if (g.kind !== 'wall' && !(vertical && g.kind !== 'slab')) continue;
    if (!vertical) continue;
    const n = geo[0]!.axes!.ez;
    const ul = Math.hypot(n[0], n[1]) || 1;
    const u: V3 = [-n[1] / ul, n[0] / ul, 0], v: V3 = [0, 0, 1];
    const uOf = (p: Pt) => p.x * u[0] + p.y * u[1];
    const zs = [...new Set(geo.flatMap((x) => x.pts.map((p) => Math.round(zOf(p) * 1000) / 1000)))].sort((a, b) => a - b);
    const z0 = zs[0]!, z1 = zs[zs.length - 1]!;
    const cuts = [z0, ...(m.levelZs ?? []).filter((z) => z > z0 + 1e-3 && z < z1 - 1e-3), z1];
    for (let k = 0; k < cuts.length - 1; k++) {
      const lo = cuts[k]!, hi = cuts[k + 1]!;
      const inside = geo.filter((x) => { const zc = x.pts.reduce((s, p) => s + zOf(p), 0) / x.pts.length; return zc > lo && zc < hi; });
      const base = inside.filter((x) => Math.abs(Math.min(...x.pts.map(zOf)) - lo) < 1e-3);
      if (!base.length) continue;
      const us = base.flatMap((x) => x.pts.map(uOf));
      const length = Math.max(...us) - Math.min(...us);
      const centre = (Math.max(...us) + Math.min(...us)) / 2;
      const thickness = Math.min(...inside.map((x) => x.t).filter((t) => t > 0));
      if (!(length > 0) || !(thickness > 0)) continue;
      const keys = new Set(inside.map((x) => x.key));
      const baseBy = new Map(base.map((x) => [x.key, x]));
      const combos: WallComboForces[] = [];
      for (const set of m.sets) {
        let pu = 0, mu = 0, vu = 0, muV = 0, muH = 0;
        for (const row of shellCentreRows(set.result, m.shells)) {
          const key = `${row.kind === 'quad' ? 'q' : 'p'}${row.id}`;
          if (!keys.has(key) || !row.global) continue;
          muV = Math.max(muV, Math.abs(tensorAlong(row.global.moment, v, v)));
          muH = Math.max(muH, Math.abs(tensorAlong(row.global.moment, u, u)));
          const b = baseBy.get(key);
          if (!b) continue;
          const bu = b.pts.map(uOf);
          const w = Math.max(...bu) - Math.min(...bu);
          const uc = bu.reduce((s, x) => s + x, 0) / bu.length;
          const f = -tensorAlong(row.global.stress, v, v) * row.thickness * w;
          pu += f;
          mu += f * (uc - centre);
          vu += tensorAlong(row.global.stress, u, v) * row.thickness * w;
        }
        combos.push({ combo: set.name, pu, mu: Math.abs(mu), vu: Math.abs(vu), muV, muH });
      }
      out.push({
        key: `wall:${g.id}:${k}`, name: g.name, level: m.levelAt ? m.levelAt(lo) : g.level,
        length, height: hi - lo, thickness, baseElements: base.length, combos,
      });
    }
  }
  return out;
}
