/**
 * What the truss methods (truss-joints, truss-sections, truss-compatibility)
 * share: names and symbols, equilibrium equations written term by term, the
 * reactions from global equilibrium, the applicability of the hand methods,
 * and the figures, tables and comparison every document closes with.
 *
 * The member forces are always written as tensions (N > 0 pulls on the
 * joints), so a negative result is a compression and no sign is guessed
 * beforehand. Every joint sees a member through the unit vector from the
 * joint towards the member's far end, so the way a member was drawn (I→J or
 * J→I) never changes an equation.
 */
import type { MethodContext } from './registry';
import type { Applicability, Block, Cell, CompareRow, Step, Tex, Txt } from './doc';
import { tx } from './doc';
import { num, numText, par } from './format';
import type { PlaneModel, PMember } from './plane-model';
import { hasSpecialSupports, hasThermal, membersAt, nodalLoadAt } from './plane-model';
import type { Sketch, SketchColor } from './sketch';
import { sketchOf } from './sketch';

// ─── Shared: names, numbers, equations ───────────────────────────────

export const EPS = 1e-9;
export const KN = '\\mathrm{kN}';
export const KNM = '\\mathrm{kN\\,m}';
export const MM = '\\mathrm{mm}';
export const P = 'steps.trusses.';

export type Known = Map<string, number>;
export type Dir = 'x' | 'z';
export interface RComp { id: string; node: number; dir: Dir }

export const nodeName = (pm: PlaneModel, id: number) => pm.nodes.get(id)!.name;
export const memberKey = (pm: PlaneModel, m: PMember) => `${nodeName(pm, m.i)}${nodeName(pm, m.j)}`;
export const nTex = (pm: PlaneModel, m: PMember) => `N_{\\mathrm{${memberKey(pm, m)}}}`;
export const nPlain = (pm: PlaneModel, m: PMember) => `N_${memberKey(pm, m)}`;
export const rTex = (pm: PlaneModel, node: number, dir: Dir) => `R_{\\mathrm{${nodeName(pm, node)}}${dir}}`;
export const rPlain = (pm: PlaneModel, node: number, dir: Dir) => `R_${nodeName(pm, node)}${dir}`;
export const nId = (m: number) => `n${m}`;
export const rId = (node: number, dir: Dir) => `r${node}${dir}`;

/** A member that carries only axial force: a truss member, or a frame member hinged at both ends. */
export const pinEnded = (m: PMember) => m.truss || (m.hingeI && m.hingeJ);

/** The unit vector from `node` along member `m` towards its other end: the pull of a tension on that joint. */
export function away(m: PMember, node: number): { x: number; z: number } {
  return m.i === node ? { x: m.c, z: m.s } : { x: -m.c, z: -m.s };
}
export const otherEnd = (m: PMember, node: number) => (m.i === node ? m.j : m.i);

/** The supports' reaction components, in node order: x then z. */
export function reactionComps(pm: PlaneModel): RComp[] {
  const out: RComp[] = [];
  for (const id of pm.nodeOrder) {
    const s = pm.supports.get(id);
    if (!s) continue;
    if (s.ux) out.push({ id: rId(id, 'x'), node: id, dir: 'x' });
    if (s.uz) out.push({ id: rId(id, 'z'), node: id, dir: 'z' });
  }
  return out;
}

/** The size of the loads, to tell a zero-force member from rounding. */
export function forceScale(pm: PlaneModel): number {
  let s = 1;
  for (const l of pm.nodalLoads) s = Math.max(s, Math.abs(l.fx), Math.abs(l.fz));
  return s;
}

/**
 * One term of an equilibrium equation: a coefficient times either an unknown
 * (a member force or a reaction, which may be known by the time the equation
 * is written) or a known value (a load).
 */
export interface ETerm { unk?: string; sym: Tex; coef: number; val?: number; f?: Tex }
export interface Eq { terms: ETerm[]; formula: Tex }

export const valueOf = (t: ETerm, known: Known) => (t.unk !== undefined ? known.get(t.unk) : t.val);

export function unknownsIn(eq: Eq, known: Known): string[] {
  const s = new Set<string>();
  for (const t of eq.terms) if (t.unk !== undefined && !known.has(t.unk) && Math.abs(t.coef) > EPS) s.add(t.unk);
  return [...s];
}
export function coefOf(eq: Eq, unk: string): number {
  return eq.terms.reduce((s, t) => (t.unk === unk ? s + t.coef : s), 0);
}
export function knownSum(eq: Eq, known: Known): number {
  let s = 0;
  for (const t of eq.terms) { const v = valueOf(t, known); if (v !== undefined) s += t.coef * v; }
  return s;
}
export const hasTerms = (eq: Eq) => eq.terms.some((t) => Math.abs(t.coef) > EPS && (t.unk !== undefined || Math.abs(t.val ?? 0) > 0));

/** The equation with what is known put in as numbers and the rest as symbols. */
export function substTex(eq: Eq, known: Known, snap: (v: number) => number): Tex {
  const parts: Array<{ neg: boolean; body: string }> = [];
  for (const t of eq.terms) {
    if (Math.abs(t.coef) < EPS) continue;
    const v = valueOf(t, known);
    if (v === undefined) {
      if (Math.abs(t.coef - 1) < EPS) parts.push({ neg: false, body: t.sym });
      else if (Math.abs(t.coef + 1) < EPS) parts.push({ neg: true, body: t.sym });
      else if (t.coef < 0) parts.push({ neg: true, body: `${num(-t.coef)}\\,${t.sym}` });
      else parts.push({ neg: false, body: `${num(t.coef)}\\,${t.sym}` });
    } else {
      if (t.unk === undefined && Math.abs(v) < EPS) continue;
      // A known zero-force member reads 0, not "−0" or "(0) · 0.7071"; a zero reaction drops out.
      if (snap(v) === 0) { if (!t.unk?.startsWith('r')) parts.push({ neg: false, body: '0' }); continue; }
      const vs = par(snap(v));
      if (Math.abs(t.coef - 1) < EPS) parts.push({ neg: false, body: vs });
      else if (Math.abs(t.coef + 1) < EPS) parts.push({ neg: true, body: vs });
      else parts.push({ neg: false, body: `${vs} \\cdot ${par(t.coef)}` });
    }
  }
  if (parts.length === 0) return '0';
  return parts.map((p, k) => (k === 0 ? (p.neg ? `-${p.body}` : p.body) : `${p.neg ? ' - ' : ' + '}${p.body}`)).join('');
}

/** The symbolic form: the unknowns' formula terms, then the loads. */
export function formulaOf(terms: ETerm[], loadSym: Tex | null): Tex {
  const fs = terms.filter((t) => t.unk !== undefined && Math.abs(t.coef) > EPS).map((t) => t.f ?? t.sym);
  if (loadSym && terms.some((t) => t.unk === undefined && Math.abs(t.coef * (t.val ?? 0)) > EPS)) fs.push(loadSym);
  return fs.length ? fs.join(' + ') : '0';
}

/** Solve a small dense system; null when it is singular. */
export function solveDense(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  const big = Math.max(1e-300, ...A.flat().map(Math.abs));
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-11 * big) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      if (f !== 0) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
}

export const snapper = (scale: number) => (v: number) => (Math.abs(v) < 1e-9 * scale ? 0 : v);

// ─── Shared: figures ─────────────────────────────────────────────────

/** Nodal loads as arrows, one per component, the tip at the joint. */
export function loadForces(pm: PlaneModel, nodes?: Set<number>): NonNullable<Sketch['forces']> {
  const out: NonNullable<Sketch['forces']> = [];
  for (const id of pm.nodeOrder) {
    if (nodes && !nodes.has(id)) continue;
    const l = nodalLoadAt(pm, id);
    const n = pm.nodes.get(id)!;
    if (Math.abs(l.fx) > EPS) out.push({ x: n.x, z: n.z, fx: l.fx, fz: 0, label: `${numText(Math.abs(l.fx))} kN`, color: 'load' });
    if (Math.abs(l.fz) > EPS) out.push({ x: n.x, z: n.z, fx: 0, fz: l.fz, label: `${numText(Math.abs(l.fz))} kN`, color: 'load' });
  }
  return out;
}

/** The reactions as arrows: known ones in their actual sense, unknown ones dashed in the positive sense. */
export function reactionForces(pm: PlaneModel, comps: RComp[], known: Known | null, nodes?: Set<number>): NonNullable<Sketch['forces']> {
  const out: NonNullable<Sketch['forces']> = [];
  for (const c of comps) {
    if (nodes && !nodes.has(c.node)) continue;
    const n = pm.nodes.get(c.node)!;
    const v = known?.get(c.id);
    if (v === undefined) {
      out.push({ x: n.x, z: n.z, fx: c.dir === 'x' ? 1 : 0, fz: c.dir === 'z' ? 1 : 0, label: rPlain(pm, c.node, c.dir), color: 'unknown', dashed: true });
    } else if (Math.abs(v) > EPS) {
      const sg = Math.sign(v);
      out.push({ x: n.x, z: n.z, fx: c.dir === 'x' ? sg : 0, fz: c.dir === 'z' ? sg : 0, label: `${rPlain(pm, c.node, c.dir)} = ${numText(Math.abs(v))} kN`, color: 'reaction' });
    }
  }
  return out;
}

/** The structure as drawn, with its loads (span loads too) and its dimensions. */
export function structureSketch(pm: PlaneModel): Sketch {
  const sk = sketchOf(pm);
  sk.dims = 'auto';
  sk.forces = loadForces(pm);
  const couples: NonNullable<Sketch['couples']> = [];
  for (const id of pm.nodeOrder) {
    const l = nodalLoadAt(pm, id);
    const n = pm.nodes.get(id)!;
    if (Math.abs(l.my) > EPS) couples.push({ x: n.x, z: n.z, m: l.my, label: `${numText(Math.abs(l.my))} kN·m`, color: 'load' });
  }
  const spans: NonNullable<Sketch['spanLoads']> = [];
  for (const l of pm.memberLoads) {
    const m = pm.members.get(l.member);
    if (!m) continue;
    const ni = pm.nodes.get(m.i)!;
    if (l.kind === 'dist') spans.push({ member: m.id, a: l.a, b: l.b, wa: -l.qa, wb: -l.qb });
    else if (l.kind === 'point') {
      const x = ni.x + m.c * l.a, z = ni.z + m.s * l.a;
      const fx = -m.s * l.p + m.c * l.px, fz = m.c * l.p + m.s * l.px;
      if (Math.hypot(fx, fz) > EPS) sk.forces.push({ x, z, fx, fz, label: `${numText(Math.hypot(fx, fz))} kN`, color: 'load' });
      if (Math.abs(l.m) > EPS) couples.push({ x, z, m: l.m, label: `${numText(Math.abs(l.m))} kN·m`, color: 'load' });
    }
  }
  if (spans.length) sk.spanLoads = spans;
  if (couples.length) sk.couples = couples;
  return sk;
}

/** A free body with its supports taken away (their reactions are drawn instead). */
export function freeBodySketch(pm: PlaneModel, comps: RComp[], known: Known | null): Sketch {
  const sk = structureSketch(pm);
  sk.supports = [];
  sk.dims = undefined;
  sk.forces = [...(sk.forces ?? []), ...reactionForces(pm, comps, known)];
  return sk;
}

/** The axial forces: members coloured by tension or compression, labelled with N. */
export function axialSketch(pm: PlaneModel, N: Map<number, number>, snap: (v: number) => number, only?: Set<number>): Sketch {
  const sk = sketchOf(pm, { labels: true });
  sk.members = sk.members.map((mm) => {
    if (only && !only.has(mm.id)) return { ...mm, style: 'faint' as const };
    const v = snap(N.get(mm.id) ?? 0);
    const color: SketchColor = v > 0 ? 'tension' : v < 0 ? 'compression' : 'muted';
    return { ...mm, color, label: numText(v) };
  });
  return sk;
}

export function memberForceTable(pm: PlaneModel, ids: number[], N: Map<number, number>, snap: (v: number) => number): Block {
  const rows: Cell[][] = ids.map((id) => {
    const m = pm.members.get(id)!;
    const v = snap(N.get(id) ?? 0);
    return [m.name, { tex: `${num(v)}` }, tx(v > 0 ? `${P}tension` : v < 0 ? `${P}compression` : `${P}zero`)];
  });
  return { kind: 'table', head: [tx('steps.common.member'), { tex: `N\\ [${KN}]` }, tx(`${P}state`)], rows, caption: tx(`${P}forcesCaption`) };
}

export function reactionTable(pm: PlaneModel, comps: RComp[], known: Known, snap: (v: number) => number, moments?: Map<number, number>): Block {
  const nodes = [...new Set(comps.map((c) => c.node))];
  const rows: Cell[][] = nodes.map((node) => {
    const cx = comps.find((c) => c.node === node && c.dir === 'x');
    const cz = comps.find((c) => c.node === node && c.dir === 'z');
    const row: Cell[] = [nodeName(pm, node), cx ? { tex: num(snap(known.get(cx.id) ?? 0)) } : '—', cz ? { tex: num(snap(known.get(cz.id) ?? 0)) } : '—'];
    if (moments) row.push(moments.has(node) ? { tex: num(snap(moments.get(node)!)) } : '—');
    return row;
  });
  const head: Cell[] = [tx('steps.common.support'), { tex: `R_x\\ [${KN}]` }, { tex: `R_z\\ [${KN}]` }];
  if (moments) head.push({ tex: `M\\ [${KNM}]` });
  return { kind: 'table', head, rows, caption: tx(`${P}reactionsCaption`) };
}

// ─── Shared: applicability of the hand methods ───────────────────────

export const refuse = (key: string, params?: Record<string, string | number>): Applicability => ({ ok: false, reason: tx(key, params) });

/** A determinate plane truss with joint loads only, supported by pins and rollers, that the solver solves. */
export function determinateTruss(ctx: MethodContext): Applicability {
  const { pm, input } = ctx;
  if (pm.members.size === 0) return refuse('steps.req.noMembers');
  if ((input.constraints?.length ?? 0) > 0 || (input.connectors?.size ?? 0) > 0) return refuse(`${P}req.constraints`);
  if (hasSpecialSupports(pm)) return refuse('steps.req.special');
  if (hasThermal(pm)) return refuse('steps.req.thermal');
  for (const id of pm.memberOrder) {
    const m = pm.members.get(id)!;
    if (!pinEnded(m)) return refuse(`${P}req.notTruss`, { m: m.name });
  }
  if (pm.memberLoads.length > 0) return refuse(`${P}req.spanLoads`, { m: pm.members.get(pm.memberLoads[0].member)?.name ?? '' });
  for (const s of pm.supports.values()) {
    if (s.type !== 'pinned' && s.type !== 'rollerX' && s.type !== 'rollerZ') return refuse(`${P}req.supportType`, { n: nodeName(pm, s.node) });
  }
  for (const id of pm.nodeOrder) if (Math.abs(nodalLoadAt(pm, id).my) > EPS) return refuse(`${P}req.nodalMoment`, { n: nodeName(pm, id) });
  for (const id of pm.nodeOrder) if (membersAt(pm, id).length === 0) return refuse(`${P}req.looseNode`, { n: nodeName(pm, id) });
  const g = pm.members.size + reactionComps(pm).length - 2 * pm.nodes.size;
  if (g > 0) return refuse(`${P}req.indeterminate`, { g });
  if (g < 0 || !ctx.ref) return refuse('steps.req.unstable');
  if (!trussStatics(pm)) return refuse('steps.req.unstable');
  return { ok: true };
}

/**
 * All the joint equations at once (2n equations, m + r unknowns): whether the
 * truss is stable, independently of the order the hand method takes.
 */
export function trussStatics(pm: PlaneModel): Known | null {
  const comps = reactionComps(pm);
  const unk = [...pm.memberOrder.map(nId), ...comps.map((c) => c.id)];
  if (unk.length !== 2 * pm.nodes.size) return null;
  const col = new Map(unk.map((u, k) => [u, k]));
  const A: number[][] = [], b: number[] = [];
  for (const id of pm.nodeOrder) {
    const eqs = jointEqs(pm, id);
    for (const eq of [eqs.x, eqs.z]) {
      const row = new Array(unk.length).fill(0);
      let c = 0;
      for (const t of eq.terms) {
        if (t.unk !== undefined) row[col.get(t.unk)!] += t.coef;
        else c += t.coef * (t.val ?? 0);
      }
      A.push(row); b.push(-c);
    }
  }
  const x = solveDense(A, b);
  return x ? new Map(unk.map((u, k) => [u, x[k]])) : null;
}

/** ΣFx = 0 and ΣFz = 0 at a joint: its member forces as tensions, its reactions, its load. */
export function jointEqs(pm: PlaneModel, node: number): { x: Eq; z: Eq } {
  const nm = nodeName(pm, node);
  const s = pm.supports.get(node);
  const load = nodalLoadAt(pm, node);
  const mk = (dir: Dir): Eq => {
    const terms: ETerm[] = [];
    for (const m of membersAt(pm, node)) {
      const e = away(m, node);
      const cf = dir === 'x' ? e.x : e.z;
      const fn = dir === 'x' ? '\\cos' : '\\sin';
      terms.push({ unk: nId(m.id), sym: nTex(pm, m), coef: Math.abs(cf) < 1e-12 ? 0 : cf, f: `${nTex(pm, m)}${fn}\\alpha_{\\mathrm{${memberKey(pm, m)}}}` });
    }
    if (s && (dir === 'x' ? s.ux : s.uz)) terms.push({ unk: rId(node, dir), sym: rTex(pm, node, dir), coef: 1 });
    const lv = dir === 'x' ? load.fx : load.fz;
    if (Math.abs(lv) > EPS) terms.push({ sym: `P_{\\mathrm{${nm}}${dir}}`, val: lv, coef: 1 });
    return { terms, formula: formulaOf(terms, `P_{\\mathrm{${nm}}${dir}}`) };
  };
  return { x: mk('x'), z: mk('z') };
}

// ─── Global equilibrium: the reactions ───────────────────────────────

export interface GPoint { x: number; z: number; name?: string }
export interface GEq { kind: 'Fx' | 'Fz' | 'M'; O?: GPoint; eq: Eq }
export interface GlobalSolve { comps: RComp[]; seq: Array<{ g: GEq; unk: string; known: Known }>; check: GEq; values: Known }

/** Forces on a set of nodes (their loads and their reactions) in one equation. */
export function forceEq(pm: PlaneModel, comps: RComp[], dir: Dir, nodes?: Set<number>): Eq {
  const terms: ETerm[] = [];
  for (const c of comps) if (c.dir === dir && (!nodes || nodes.has(c.node))) terms.push({ unk: c.id, sym: rTex(pm, c.node, c.dir), coef: 1 });
  for (const id of pm.nodeOrder) {
    if (nodes && !nodes.has(id)) continue;
    const l = nodalLoadAt(pm, id);
    const v = dir === 'x' ? l.fx : l.fz;
    if (Math.abs(v) > EPS) terms.push({ sym: '', val: v, coef: 1 });
  }
  return { terms, formula: formulaOf(terms, `\\textstyle\\sum P_${dir}`) };
}

/** Moments about O, counter-clockwise positive: a force's x-component has the arm −(z − z_O), its z-component x − x_O. */
export function momentEq(pm: PlaneModel, comps: RComp[], O: GPoint, nodes?: Set<number>): Eq {
  const terms: ETerm[] = [];
  const arm = (node: number, dir: Dir) => { const n = pm.nodes.get(node)!; return dir === 'x' ? -(n.z - O.z) : n.x - O.x; };
  for (const c of comps) {
    if (nodes && !nodes.has(c.node)) continue;
    const a = arm(c.node, c.dir);
    terms.push({ unk: c.id, sym: rTex(pm, c.node, c.dir), coef: Math.abs(a) < 1e-12 ? 0 : a });
  }
  for (const id of pm.nodeOrder) {
    if (nodes && !nodes.has(id)) continue;
    const l = nodalLoadAt(pm, id);
    for (const dir of ['x', 'z'] as const) {
      const v = dir === 'x' ? l.fx : l.fz;
      const a = arm(id, dir);
      if (Math.abs(v) > EPS && Math.abs(a) > 1e-12) terms.push({ sym: '', val: v, coef: a });
    }
  }
  return { terms, formula: '' };
}

export const onNode = (pm: PlaneModel, O: { x: number; z: number }): string | undefined => {
  for (const id of pm.nodeOrder) { const n = pm.nodes.get(id)!; if (Math.hypot(n.x - O.x, n.z - O.z) < 1e-6) return n.name; }
  return undefined;
};

/**
 * The three reactions from ΣM_O, ΣFz and ΣFx, one unknown at a time: O is
 * the pinned support (two of the three reactions pass through it), or where
 * the lines of action of two reactions meet. Null when the supports do not
 * hold exactly three reactions or no such sequence exists.
 */
export function solveGlobal(pm: PlaneModel): GlobalSolve | null {
  const comps = reactionComps(pm);
  if (comps.length !== 3) return null;
  const lineOf = (c: RComp) => { const n = pm.nodes.get(c.node)!; return c.dir === 'x' ? { z: n.z } : { x: n.x }; };
  const points: GPoint[] = [];
  for (const id of pm.nodeOrder) { const s = pm.supports.get(id); if (s?.ux && s.uz) { const n = pm.nodes.get(id)!; points.push({ x: n.x, z: n.z, name: n.name }); } }
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) {
    const ca = comps[a], cb = comps[b];
    if (ca.dir === cb.dir) continue;
    const lx = ca.dir === 'z' ? lineOf(ca) : lineOf(cb), lz = ca.dir === 'x' ? lineOf(ca) : lineOf(cb);
    const O = { x: (lx as { x: number }).x, z: (lz as { z: number }).z };
    points.push({ ...O, name: onNode(pm, O) });
  }
  const others: GEq[] = [];
  for (const id of pm.nodeOrder) {
    if (!pm.supports.has(id)) continue;
    const n = pm.nodes.get(id)!;
    others.push({ kind: 'M', O: { x: n.x, z: n.z, name: n.name }, eq: momentEq(pm, comps, { x: n.x, z: n.z }) });
  }
  for (const O of points) {
    const first: GEq = { kind: 'M', O, eq: momentEq(pm, comps, O) };
    if (unknownsIn(first.eq, new Map()).length !== 1) continue;
    const pool: GEq[] = [first, { kind: 'Fz', eq: forceEq(pm, comps, 'z') }, { kind: 'Fx', eq: forceEq(pm, comps, 'x') }, ...others];
    const known: Known = new Map();
    const used = new Set<GEq>();
    const seq: GlobalSolve['seq'] = [];
    while (known.size < 3) {
      const g = pool.find((q) => !used.has(q) && unknownsIn(q.eq, known).length === 1 && Math.abs(coefOf(q.eq, unknownsIn(q.eq, known)[0])) > 1e-6);
      if (!g) break;
      const u = unknownsIn(g.eq, known)[0];
      const before = new Map(known);
      known.set(u, -knownSum(g.eq, known) / coefOf(g.eq, u));
      used.add(g);
      seq.push({ g, unk: u, known: before });
    }
    if (known.size < 3) continue;
    // The check: an equation not used, a moment about another point if there is one.
    const usedO = seq.filter((s) => s.g.kind === 'M').map((s) => s.g.O!);
    const check = others.find((q) => !usedO.some((o) => Math.hypot(o.x - q.O!.x, o.z - q.O!.z) < 1e-9))
      ?? pool.find((q) => !used.has(q) && q.kind !== 'M')
      ?? { kind: 'M' as const, O: { x: 0, z: 0 }, eq: momentEq(pm, comps, { x: 0, z: 0 }) };
    return { comps, seq, check, values: known };
  }
  return null;
}

export const mSym = (O: GPoint) => (O.name ? `M_{\\mathrm{${O.name}}}` : 'M_{O}');

export function geqLabel(g: GEq): Txt {
  if (g.kind === 'Fx') return tx(`${P}eq.sumFx`);
  if (g.kind === 'Fz') return tx(`${P}eq.sumFz`);
  return g.O!.name ? tx(`${P}eq.sumMAt`, { p: g.O!.name }) : tx(`${P}eq.sumMPoint`, { x: numText(g.O!.x), z: numText(g.O!.z) });
}
export function geqHead(g: GEq): Tex {
  if (g.kind === 'Fx') return '\\textstyle\\sum F_x = 0:\\quad ';
  if (g.kind === 'Fz') return '\\textstyle\\sum F_z = 0:\\quad ';
  return `\\textstyle\\sum ${mSym(g.O!)} = 0:\\quad `;
}
export function geqFormula(g: GEq): Tex {
  if (g.kind === 'M') return `${geqHead(g)}\\textstyle\\sum F\\,d = 0`;
  return `${geqHead(g)}${g.eq.formula} = 0`;
}

/** The reactions step: the free body, each equation with its numbers, the check. */
export function reactionBlocks(pm: PlaneModel, gs: GlobalSolve, snap: (v: number) => number): Block[] {
  const out: Block[] = [];
  out.push({ kind: 'p', text: tx(`${P}reactions.lead`, { list: gs.comps.map((c) => rPlain(pm, c.node, c.dir)).join(', ') }) });
  out.push({ kind: 'fig', sketch: freeBodySketch(pm, gs.comps, null), caption: tx(`${P}reactions.fbd`) });
  out.push({ kind: 'p', text: tx(`${P}reactions.arms`), detail: true });
  const first = gs.seq[0].g;
  if (first.kind === 'M') {
    out.push({ kind: 'p', text: first.O!.name ? tx(`${P}reactions.whyPoint`, { p: first.O!.name }) : tx(`${P}reactions.whyIntersection`, { x: numText(first.O!.x), z: numText(first.O!.z) }), detail: true });
  }
  for (const s of gs.seq) {
    const v = gs.values.get(s.unk)!;
    const c = gs.comps.find((q) => q.id === s.unk)!;
    out.push({
      kind: 'calc', label: geqLabel(s.g),
      formula: geqFormula(s.g),
      subst: `${substTex(s.g.eq, s.known, snap)} = 0`,
      result: `\\boxed{${rTex(pm, c.node, c.dir)} = ${num(snap(v))}\\ ${KN}}`,
    });
  }
  const res = knownSum(gs.check.eq, gs.values);
  out.push({
    kind: 'calc', label: tx(`${P}reactions.check`),
    formula: geqFormula(gs.check),
    subst: `${substTex(gs.check.eq, gs.values, snap)}`,
    result: `${num(snap(res))}`,
    check: `= 0\\ \\checkmark`,
  });
  return out;
}

export function classificationBlocks(pm: PlaneModel, key: string): Block[] {
  const m = pm.members.size, r = reactionComps(pm).length, n = pm.nodes.size;
  return [
    { kind: 'p', text: tx(`${P}classify.lead`) },
    { kind: 'calc', label: tx(`${P}classify.count`, { m, r, n }), formula: 'g = m + r - 2n', subst: `g = ${m} + ${r} - 2 \\cdot ${n}`, result: `\\boxed{g = ${m + r - 2 * n}}` },
    { kind: 'p', text: tx(`${P}classify.determinate`) },
    { kind: 'p', text: tx(key), detail: true },
  ];
}

/** Member forces, reactions, the axial-force figure and the comparison with the matrix solve. */
export function resultSteps(ctx: MethodContext, N: Map<number, number>, known: Known, comps: RComp[], snap: (v: number) => number, ids: number[], zeros: string[]): Step[] {
  const { pm, ref } = ctx;
  const res: Block[] = [memberForceTable(pm, ids, N, snap)];
  if (zeros.length) res.push({ kind: 'p', text: tx(`${P}zeroList`, { list: zeros.join(', ') }) });
  res.push({ kind: 'fig', sketch: axialSketch(pm, N, snap, ids.length === pm.memberOrder.length ? undefined : new Set(ids)), caption: tx(`${P}axialCaption`) });
  const reac: Block[] = [
    reactionTable(pm, comps, known, snap),
    { kind: 'fig', sketch: { ...freeBodySketch(pm, comps, known), dims: undefined }, caption: tx(`${P}reactionsFig`) },
  ];
  const rows: CompareRow[] = [];
  if (ref) {
    for (const id of ids) rows.push({ label: nTex(pm, pm.members.get(id)!), method: snap(N.get(id) ?? 0), matrix: snap(ref.axial.get(id) ?? NaN), unit: 'kN' });
    for (const c of comps) {
      const r = ref.reactions.get(c.node);
      rows.push({ label: rTex(pm, c.node, c.dir), method: snap(known.get(c.id) ?? 0), matrix: snap(r ? (c.dir === 'x' ? r.rx : r.rz) : NaN), unit: 'kN' });
    }
  }
  return [
    { title: tx(`${P}forcesTitle`), blocks: res },
    { title: tx('steps.common.reactions'), blocks: reac },
    { title: tx('steps.common.compare'), blocks: [{ kind: 'compare', rows, caption: tx(`${P}compareCaption`) }, { kind: 'p', text: tx(`${P}compareNote`) }] },
  ];
}

export function sizeOf(pm: PlaneModel): number {
  const xs = [...pm.nodes.values()].map((n) => n.x), zs = [...pm.nodes.values()].map((n) => n.z);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), 1e-6);
}
