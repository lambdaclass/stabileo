/**
 * What the deformation and energy methods share (see methods/deformation):
 * applicability, the straight-beam reading and its integrals, the unit load
 * and the member product integrals of frames, and the figures, tables and
 * comparison every document is built from.
 */
import type { MethodContext, MethodOption } from './registry';
import type { Applicability, Block, Cell, CompareRow, Txt } from './doc';
import { tx } from './doc';
import { num, numText, par } from './format';
import { beamLine, type BeamLine, type EndKind, type SpanLoad } from './beam-line';
import { hasSpecialSupports, hasThermal, type PlaneModel, type PMember } from './plane-model';
import { sketchOf, type Sketch } from './sketch';
import type { Reference } from './reference';
import type { SolverInput } from '../types';

// ─── Shared ─────────────────────────────────────────────────────

export const U = {
  kN: '\\mathrm{kN}', kNm: '\\mathrm{kN\\,m}', m: '\\mathrm{m}', mm: '\\mathrm{mm}', rad: '\\mathrm{rad}',
  kNm2: '\\mathrm{kN\\,m^2}', kNm3: '\\mathrm{kN\\,m^3}',
};
export const TOL = 1e-9;

export const no = (key: string, params?: Record<string, string | number>): Applicability => ({ ok: false, reason: tx(key, params) });
export const OK: Applicability = { ok: true };
export const p = (key: string, params?: Record<string, string | number>, detail = false): Block => ({ kind: 'p', text: tx(key, params), ...(detail ? { detail: true } : {}) });
/** A table cell of KaTeX. */
export const texCell = (s: string): Cell => ({ tex: s });
export const mm = (v: number) => v * 1000;
/** A number squared, bracketed so a power of ten or a sign keeps its meaning. */
export const sq = (v: number) => `(${num(v)})^2`;

/**
 * The axial term of the energy (Σ∫N²/2EA, and Σ N·n·L/EA in a displacement):
 * on, the result matches the matrix solve, which includes it; off, the
 * classical hand solution that keeps bending alone.
 */
export const AXIAL_OPTION: MethodOption = { id: 'axial', default: true };
export const axialOn = (ctx: MethodContext): boolean => ctx.options?.[AXIAL_OPTION.id] ?? AXIAL_OPTION.default;

/**
 * Left out, the axial term is a fair approximation only while it is a small
 * share of the displacement; past a fifth (an arch, the sway of a braced
 * frame) the document says plainly that it is not.
 */
export function axialShareWarning(bend: number, ax: number): Block[] {
  const total = bend + ax;
  if (!(Math.abs(total) > 1e-15) || Math.abs(ax) <= 0.2 * Math.abs(total)) return [];
  return [{ kind: 'note', tone: 'warn', text: tx('steps.deformation.axialBigShare', { pct: numText((100 * ax) / total, 3) }) }];
}

/** What every method in this group needs of the model. */
export function baseApplies(ctx: MethodContext, allowTruss: boolean): Applicability {
  const { pm, input } = ctx;
  if (pm.members.size === 0) return no('steps.req.noMembers');
  if ((input.constraints?.length ?? 0) > 0 || (input.connectors?.size ?? 0) > 0) return no('steps.deformation.req.constraints');
  if (hasThermal(pm)) return no('steps.req.thermal');
  if (hasSpecialSupports(pm)) return no('steps.req.special');
  if (!allowTruss) for (const m of pm.members.values()) if (m.truss) return no('steps.deformation.req.truss', { m: m.name });
  if (!ctx.ref) return no('steps.req.unstable');
  return OK;
}

export const G5 = [
  [-0.9061798459386640, 0.2369268850561891], [-0.5384693101056831, 0.4786286704993665],
  [0, 0.5688888888888889], [0.5384693101056831, 0.4786286704993665], [0.9061798459386640, 0.2369268850561891],
] as const;

/** ∫_a^b f by five-point Gauss–Legendre: exact up to degree 9, so for every product here (cubic × linear). */
export function gauss(a: number, b: number, f: (x: number) => number): number {
  const h = (b - a) / 2, c = (a + b) / 2;
  let s = 0;
  for (const [x, w] of G5) s += w * f(c + h * x);
  return s * h;
}

/** Sorted distinct values (within 1e-9). */
export function uniq(xs: number[]): number[] {
  const s = [...xs].sort((a, b) => a - b);
  const out: number[] = [];
  for (const x of s) if (!out.length || x - out[out.length - 1] > TOL) out.push(x);
  return out;
}

/** The structure with its loads, labelled with their values, and the dimensions. */
export function structureSketch(pm: PlaneModel): Sketch {
  const s = sketchOf(pm);
  const spanLoads: NonNullable<Sketch['spanLoads']> = [];
  const forces: NonNullable<Sketch['forces']> = [];
  const couples: NonNullable<Sketch['couples']> = [];
  for (const l of pm.memberLoads) {
    const m = pm.members.get(l.member);
    if (!m) continue;
    const ni = pm.nodes.get(m.i)!;
    if (l.kind === 'dist') {
      const label = Math.abs(l.qa - l.qb) < TOL ? `${numText(Math.abs(l.qa))} kN/m` : `${numText(Math.abs(l.qa))}–${numText(Math.abs(l.qb))} kN/m`;
      spanLoads.push({ member: m.id, a: l.a, b: l.b, wa: -l.qa, wb: -l.qb, label });
    } else if (l.kind === 'point') {
      const x = ni.x + m.c * l.a, z = ni.z + m.s * l.a;
      const fx = l.px * m.c - l.p * m.s, fz = l.px * m.s + l.p * m.c;
      if (Math.hypot(fx, fz) > 1e-12) forces.push({ x, z, fx, fz, label: `${numText(Math.hypot(fx, fz))} kN`, color: 'load' });
      if (Math.abs(l.m) > 1e-12) couples.push({ x, z, m: l.m, label: `${numText(Math.abs(l.m))} kN·m`, color: 'load' });
    }
  }
  for (const l of pm.nodalLoads) {
    const n = pm.nodes.get(l.node);
    if (!n) continue;
    if (Math.hypot(l.fx, l.fz) > 1e-12) forces.push({ x: n.x, z: n.z, fx: l.fx, fz: l.fz, label: `${numText(Math.hypot(l.fx, l.fz))} kN`, color: 'load' });
    if (Math.abs(l.my) > 1e-12) couples.push({ x: n.x, z: n.z, m: l.my, label: `${numText(Math.abs(l.my))} kN·m`, color: 'load' });
  }
  return { ...s, spanLoads, forces, couples, dims: 'auto' };
}

/** Member data: length and stiffnesses. */
export function memberTable(pm: PlaneModel, withEA: boolean): Block {
  const head: Cell[] = [tx('steps.common.member'), texCell('L\\ [\\mathrm{m}]'), texCell('E\\ [\\mathrm{kN/m^2}]'), texCell('I\\ [\\mathrm{m^4}]'), texCell('EI\\ [\\mathrm{kN\\,m^2}]')];
  if (withEA) head.push(texCell('A\\ [\\mathrm{m^2}]'), texCell('EA\\ [\\mathrm{kN}]'));
  const rows = pm.memberOrder.map((id) => {
    const m = pm.members.get(id)!;
    const r: Cell[] = [m.name, m.L, m.E, m.I, m.EI];
    if (withEA) r.push(m.A, m.EA);
    return r;
  });
  return { kind: 'table', head, rows, caption: tx('steps.deformation.memberTableCaption') };
}

/** The intro every document opens with. */
export function intro(ctx: MethodContext, what: Txt, signs: string, extra: Block[] = [], withEA = false): Block[] {
  return [
    { kind: 'p', text: what },
    p('steps.deformation.assumptions'),
    p(signs),
    { kind: 'fig', sketch: structureSketch(ctx.pm), caption: tx('steps.common.structureCaption') },
    memberTable(ctx.pm, withEA),
    ...extra,
    p('steps.common.units'),
  ];
}

export function compareBlock(rows: CompareRow[], extra?: Txt): Block[] {
  const out: Block[] = [{ kind: 'compare', rows, caption: tx('steps.common.compareNote') }];
  if (extra) out.push({ kind: 'note', tone: 'info', text: extra });
  return out;
}

/** A diagram along members, sampled evenly and on both sides of every load point. */
export function diagramOf(
  pm: PlaneModel, members: number[], value: (member: number, t: number) => number,
  color: 'moment' | 'diagram' | 'unknown' | 'accent', unit: string,
): NonNullable<Sketch['diagram']> {
  const out: NonNullable<Sketch['diagram']>['members'] = [];
  for (const id of members) {
    const m = pm.members.get(id);
    if (!m) continue;
    const ts = new Set<number>();
    for (let k = 0; k <= 24; k++) ts.add(k / 24);
    for (const l of pm.memberLoads) {
      if (l.member !== id || l.kind === 'thermal') continue;
      const at = l.kind === 'dist' ? [l.a, l.b] : [l.a];
      for (const a of at) { const u = a / m.L; if (u > 1e-6 && u < 1 - 1e-6) { ts.add(u - 1e-7); ts.add(u + 1e-7); } }
    }
    const values = [...ts].sort((a, b) => a - b).map((u): [number, number] => [u, value(id, Math.min(Math.max(u, 1e-9), 1 - 1e-9))]);
    out.push({ member: id, values });
  }
  return { color, marks: true, unit, members: out };
}

// ─── Straight beams ─────────────────────────────────────────────

/** A load along the beam, x from the beam's left end: downward positive, couples counter-clockwise. */
export type BL = SpanLoad;

export interface Beam {
  line: BeamLine;
  L: number;
  xMin: number;
  z0: number;
  nodes: Array<{ id: number; x: number; name: string }>;
  supports: Array<{ node: number; x: number; kind: EndKind; name: string }>;
  loads: BL[];
  /** Where anything changes along the beam: nodes, load ends, point loads and couples. */
  breaks: number[];
  EIat(x: number): number;
}

export function readBeam(pm: PlaneModel, line: BeamLine): Beam {
  const xMin = Math.min(...line.nodes.map((n) => pm.nodes.get(n.id)!.x));
  const z0 = pm.nodes.get(line.nodes[0].id)!.z;
  const L = line.nodes[line.nodes.length - 1].x;
  const raw: BL[] = [];
  const shift = (ls: SpanLoad[], x0: number) => {
    for (const l of ls) raw.push(l.kind === 'dist' ? { ...l, a: l.a + x0, b: l.b + x0 } : { ...l, a: l.a + x0 });
  };
  for (const s of line.spans) shift(s.loads, s.x0);
  for (const o of line.overhangs) shift(o.loads, o.x0);
  for (const j of line.jointLoads) {
    const x = line.nodes.find((n) => n.id === j.node)!.x;
    if (Math.abs(j.P) > 1e-12) raw.push({ kind: 'point', a: x, P: j.P });
    if (Math.abs(j.M) > 1e-12) raw.push({ kind: 'couple', a: x, M: j.M });
  }
  // The beam reading cuts a load at every support; pieces that continue one another are one load again.
  raw.sort((a, b) => a.a - b.a);
  const loads: BL[] = [];
  for (const l of raw) {
    const prev = loads.length ? loads[loads.length - 1] : null;
    if (l.kind === 'dist' && prev?.kind === 'dist' && Math.abs(prev.b - l.a) < TOL) {
      const k1 = (prev.wb - prev.wa) / (prev.b - prev.a), k2 = (l.wb - l.wa) / (l.b - l.a);
      const scale = Math.max(1, Math.abs(prev.wb), Math.abs(l.wa));
      if (Math.abs(prev.wb - l.wa) < 1e-9 * scale && Math.abs(k1 - k2) < 1e-9 * Math.max(1, Math.abs(k1))) {
        loads[loads.length - 1] = { ...prev, b: l.b, wb: l.wb };
        continue;
      }
    }
    loads.push(l);
  }
  const nodes = line.nodes.map((n) => ({ id: n.id, x: n.x, name: pm.nodes.get(n.id)!.name }));
  const supports = line.supports.map((s) => ({ ...s, name: pm.nodes.get(s.node)!.name }));
  const xs = nodes.map((n) => n.x);
  for (const l of loads) { xs.push(l.a); if (l.kind === 'dist') xs.push(l.b); }
  const breaks = uniq(xs.filter((x) => x > -TOL && x < L + TOL));
  const EIat = (x: number) => {
    const o = line.members.find((mm) => x >= mm.x0 - TOL && x <= mm.x0 + mm.member.L + TOL) ?? line.members[0];
    return o.member.EI;
  };
  return { line, L, xMin, z0, nodes, supports, loads, breaks, EIat };
}

/** Bending moment (sagging positive) of forces left of x; at a load point `incl` takes the load in (right-hand limit). */
export function momentOf(items: BL[], x: number, incl: boolean): number {
  let M = 0;
  for (const l of items) {
    if (l.kind === 'dist') {
      const s1 = Math.min(x, l.b);
      if (s1 <= l.a) continue;
      const k = (l.wb - l.wa) / (l.b - l.a), D = x - l.a, e = s1 - l.a;
      M -= l.wa * (D * e - (e * e) / 2) + k * ((D * e * e) / 2 - (e * e * e) / 3);
    } else if (incl ? l.a <= x + TOL : l.a < x - TOL) {
      if (l.kind === 'point') M -= l.P * (x - l.a); else M -= l.M;
    }
  }
  return M;
}

/** Shear (dM/dx) of forces left of x. */
export function shearOf(items: BL[], x: number, incl: boolean): number {
  let V = 0;
  for (const l of items) {
    if (l.kind === 'dist') {
      const s1 = Math.min(x, l.b);
      if (s1 <= l.a) continue;
      const k = (l.wb - l.wa) / (l.b - l.a), e = s1 - l.a;
      V -= l.wa * e + (k * e * e) / 2;
    } else if (l.kind === 'point' && (incl ? l.a <= x + TOL : l.a < x - TOL)) V -= l.P;
  }
  return V;
}

/** The downward intensity of the distributed loads at x, taking the ones that start at x. */
export function intensityAt(loads: BL[], x: number): number {
  let w = 0;
  for (const l of loads) if (l.kind === 'dist' && l.a <= x + TOL && l.b > x + TOL) w += l.wa + ((l.wb - l.wa) * (x - l.a)) / (l.b - l.a);
  return w;
}

/** Total downward load and its moment about x = 0 (both of the loads alone). */
export function loadTotals(loads: BL[]): { W: number; Mw: number; Mc: number } {
  let W = 0, Mw = 0, Mc = 0;
  for (const l of loads) {
    if (l.kind === 'dist') {
      const R = ((l.wa + l.wb) / 2) * (l.b - l.a);
      const xc = Math.abs(l.wa + l.wb) < 1e-12 ? (l.a + l.b) / 2 : l.a + ((l.b - l.a) * (l.wa + 2 * l.wb)) / (3 * (l.wa + l.wb));
      W += R; Mw += R * xc;
    } else if (l.kind === 'point') { W += l.P; Mw += l.P * l.a; }
    else Mc += l.M;
  }
  return { W, Mw, Mc };
}

/** One load, for the load table. */
export function loadRow(l: BL): Cell[] {
  if (l.kind === 'dist') {
    return [tx('steps.deformation.load.dist'), texCell(`${num(l.a)} \\le x \\le ${num(l.b)}\\ ${U.m}`),
      texCell(Math.abs(l.wa - l.wb) < TOL ? `w = ${num(l.wa)}\\ \\mathrm{kN/m}` : `w: ${num(l.wa)} \\to ${num(l.wb)}\\ \\mathrm{kN/m}`)];
  }
  if (l.kind === 'point') return [tx('steps.deformation.load.point'), texCell(`x = ${num(l.a)}\\ ${U.m}`), texCell(`P = ${num(l.P)}\\ ${U.kN}`)];
  return [tx('steps.deformation.load.couple'), texCell(`x = ${num(l.a)}\\ ${U.m}`), texCell(`M_0 = ${num(l.M)}\\ ${U.kNm}`)];
}

export function loadTable(bm: Beam): Block {
  return { kind: 'table', head: [tx('steps.common.loads'), tx('steps.deformation.position'), tx('steps.deformation.value')], rows: bm.loads.map(loadRow), caption: tx('steps.deformation.loadTableCaption') };
}

/** Rotation and deflection at x from a point x0 where they are known, by integrating the curvature M/EI. */
export function integrateCurvature(bm: Beam, curv: (x: number) => number, x0: number, th0: number, v0: number, x: number): { th: number; v: number } {
  const lo = Math.min(x0, x), hi = Math.max(x0, x);
  const pts = uniq([lo, hi, ...bm.breaks.filter((b) => b > lo && b < hi)]);
  let I1 = 0, I2 = 0;
  for (let k = 0; k + 1 < pts.length; k++) {
    I1 += gauss(pts[k], pts[k + 1], curv);
    I2 += gauss(pts[k], pts[k + 1], (s) => curv(s) * (x - s));
  }
  const sg = x >= x0 ? 1 : -1;
  return { th: th0 + sg * I1, v: v0 + th0 * (x - x0) + sg * I2 };
}

/** Where the slope vanishes inside the segments between break points, found by bisection. */
export function stationaryPoints(breaks: number[], theta: (x: number) => number): number[] {
  const roots: number[] = [];
  for (let k = 0; k + 1 < breaks.length; k++) {
    const a = breaks[k], b = breaks[k + 1];
    const n = 48;
    let xa = a + (b - a) * 1e-6, fa = theta(xa);
    for (let s = 1; s <= n; s++) {
      const xb = s === n ? b - (b - a) * 1e-6 : a + ((b - a) * s) / n;
      const fb = theta(xb);
      if (fa === 0) roots.push(xa);
      else if (fa * fb < 0) {
        let lo = xa, hi = xb, flo = fa;
        for (let it = 0; it < 80; it++) {
          const mid = (lo + hi) / 2, fm = theta(mid);
          if (flo * fm <= 0) hi = mid; else { lo = mid; flo = fm; }
        }
        roots.push((lo + hi) / 2);
      }
      xa = xb; fa = fb;
    }
  }
  return roots;
}

/** The beam's deformed shape, magnified so the largest deflection reads a tenth of the length. */
export function deformedSketch(pm: PlaneModel, bm: Beam, v: (x: number) => number, caption: string): Block {
  const xs = uniq([...bm.breaks, ...Array.from({ length: 121 }, (_, k) => (bm.L * k) / 120)]);
  const vmax = Math.max(...xs.map((x) => Math.abs(v(x))));
  const f = vmax > 1e-15 ? (0.1 * bm.L) / vmax : 1;
  const sk = sketchOf(pm);
  sk.deformed = [{ points: xs.map((x) => ({ x: bm.xMin + x, z: bm.z0 + f * v(x) })), color: 'deformed' }];
  sk.dims = 'auto';
  for (const m of sk.members) m.style = 'faint';
  return { kind: 'fig', sketch: sk, caption: tx(caption, { f: numText(f, 3) }) };
}

/** The M or M/EI diagram along the beam, from a function of the beam coordinate. */
export function beamDiagram(pm: PlaneModel, bm: Beam, value: (x: number, right: boolean) => number, color: 'moment' | 'diagram', unit: string): NonNullable<Sketch['diagram']> {
  const members = bm.line.members;
  const out: NonNullable<Sketch['diagram']>['members'] = [];
  for (const o of members) {
    const L = o.member.L;
    const xs = new Set<number>();
    for (let k = 0; k <= 24; k++) xs.add(o.x0 + (L * k) / 24);
    for (const b of bm.breaks) if (b > o.x0 + TOL && b < o.x0 + L - TOL) { xs.add(b - 1e-7); xs.add(b + 1e-7); }
    const values = [...xs].map((x): [number, number] => {
      const xc = Math.min(Math.max(x, o.x0 + 1e-9), o.x0 + L - 1e-9);
      const u = (xc - o.x0) / L;
      // Sagging is the local −y face of a member drawn left to right, the +y face of one drawn the other way.
      return [o.flipped ? 1 - u : u, (o.flipped ? -1 : 1) * value(xc, true)];
    }).sort((a, b) => a[0] - b[0]);
    out.push({ member: o.member.id, values });
  }
  void pm;
  return { color, marks: true, unit, members: out };
}

/** A beam's comparison rows: deflection and rotation at every node, then the reactions. */
export function beamCompare(bm: Beam, ref: Reference, v: (x: number) => number, th: (x: number) => number, R: Map<number, { R: number; M: number }>): CompareRow[] {
  const rows: CompareRow[] = [];
  for (const n of bm.nodes) {
    const d = ref.displacements.get(n.id);
    if (!d) continue;
    rows.push({ label: `v_{${n.name}}`, method: mm(v(n.x)), matrix: mm(d.uz), unit: 'mm' });
    rows.push({ label: `\\theta_{${n.name}}`, method: th(n.x), matrix: d.ry, unit: 'rad' });
  }
  for (const s of bm.supports) {
    const r = ref.reactions.get(s.node), mine = R.get(s.node);
    if (!r || !mine) continue;
    rows.push({ label: `R_{${s.name}}`, method: mine.R, matrix: r.rz, unit: 'kN' });
    if (s.kind === 'fixed') rows.push({ label: `M_{${s.name}}`, method: mine.M, matrix: r.my, unit: 'kN·m' });
  }
  return rows;
}

/** The table of v and θ at the nodes. */
export function nodeTable(bm: Beam, v: (x: number) => number, th: (x: number) => number): Block {
  return {
    kind: 'table',
    head: [tx('steps.common.node'), texCell('x\\ [\\mathrm{m}]'), texCell('v\\ [\\mathrm{mm}]'), texCell('\\theta\\ [\\mathrm{rad}]')],
    rows: bm.nodes.map((n) => [n.name, n.x, mm(v(n.x)), th(n.x)]),
    caption: tx('steps.deformation.nodeTableCaption'),
  };
}

/** Largest deflection: at a node or where the slope vanishes. */
export function maxDeflection(bm: Beam, v: (x: number) => number, th: (x: number) => number): { x: number; v: number; stationary: boolean; roots: number[] } {
  const roots = stationaryPoints(bm.breaks, th);
  let best = { x: 0, v: 0, stationary: false };
  for (const n of bm.nodes) if (Math.abs(v(n.x)) > Math.abs(best.v)) best = { x: n.x, v: v(n.x), stationary: false };
  for (const r of roots) if (Math.abs(v(r)) > Math.abs(best.v) * (1 + 1e-9)) best = { x: r, v: v(r), stationary: true };
  return { ...best, roots };
}

export function beamRequirement(ctx: MethodContext): { ok: true; line: BeamLine } | { ok: false; reason: Applicability } {
  const base = baseApplies(ctx, false);
  if (!base.ok) return { ok: false, reason: base };
  const r = beamLine(ctx.pm);
  if (!r.ok) return { ok: false, reason: r.reason };
  return { ok: true, line: r.beam };
}


export function maxBlock(mx: { x: number; v: number; stationary: boolean }): Block {
  return {
    kind: 'calc', label: tx('steps.deformation.max'),
    formula: mx.stationary ? `\\theta(x_m) = v'(x_m) = 0` : `v_{\\max} = \\max_i |v_i|`,
    subst: `x_m = ${num(mx.x)}\\ ${U.m}`,
    result: `\\boxed{v_{\\max} = v(${num(mx.x)}) = ${num(mm(mx.v))}\\ ${U.mm}}`,
  };
}

// ─── Frames: the unit load and the product integrals ──────────

export interface Target { node: number; name: string; dir: 'x' | 'z'; chosen: boolean }

/** The point: the selected node, or the one that moves most; the direction: the larger of its two components. */
export function pickTarget(ctx: MethodContext): Target {
  const ref = ctx.ref!;
  const sel = ctx.selection.nodes.find((n) => ctx.pm.nodes.has(n));
  let node = sel ?? ctx.pm.nodeOrder[0];
  if (sel === undefined) {
    let best = -1;
    for (const id of ctx.pm.nodeOrder) {
      const d = ref.displacements.get(id);
      const m = d ? Math.hypot(d.ux, d.uz) : 0;
      if (m > best * (1 + 1e-9)) { best = m; node = id; }
    }
  }
  const d = ref.displacements.get(node) ?? { ux: 0, uz: 0, ry: 0 };
  const dir = Math.abs(d.ux) > Math.abs(d.uz) * (1 + 1e-9) ? 'x' : 'z';
  return { node, name: ctx.pm.nodes.get(node)!.name, dir, chosen: sel !== undefined };
}

/** The unit load: along +x for a horizontal displacement, downward for a vertical one. */
export function unitLoadInput(input: SolverInput, tg: Target): SolverInput {
  return { ...input, loads: [{ type: 'nodal', data: { nodeId: tg.node, fx: tg.dir === 'x' ? 1 : 0, fz: tg.dir === 'z' ? -1 : 0, my: 0 } }] };
}

/** The displacement the unit load measures, from the matrix solve. */
export const refAlong = (ref: Reference, tg: Target) => {
  const d = ref.displacements.get(tg.node) ?? { ux: 0, uz: 0, ry: 0 };
  return tg.dir === 'x' ? d.ux : -d.uz;
};

export interface Segment { x1: number; x2: number; M1: number; M2: number; f: number | null; m1: number; m2: number; table: number | null; gauss: number }
export interface MemberWork { member: PMember; segments: Segment[]; bending: number; axial: number; N: number; n: number; NL: number }

/**
 * A state's values with the solver's round-off read as zero: anything below
 * 1e-9 of the state's largest end force or moment. Only what is shown is
 * tidied; the integrals use the values as they are.
 */
export function tidier(pm: PlaneModel, st: Reference): (v: number) => number {
  let big = 0;
  for (const id of pm.memberOrder) {
    const e = st.endMoments.get(id);
    if (e) big = Math.max(big, Math.abs(e.Mi), Math.abs(e.Mj));
    big = Math.max(big, Math.abs(st.axial.get(id) ?? 0));
  }
  return (v) => (Math.abs(v) <= 1e-9 * big ? 0 : v);
}

/** ∫ M·m/EI and ∫ N·n/EA over one member, exactly, with the product-table value where it applies. */
export function memberWork(pm: PlaneModel, real: Reference, virt: Reference, m: PMember): MemberWork {
  const tr = tidier(pm, real), tv = tidier(pm, virt);
  const N0 = tr(real.axial.get(m.id) ?? 0);
  const n = tv(virt.axial.get(m.id) ?? 0);
  const loads = pm.memberLoads.filter((l) => l.member === m.id);
  // ∫ N dx with the steps the axial point loads put in N.
  let NL = N0 * m.L;
  for (const l of loads) if (l.kind === 'point' && Math.abs(l.px) > 1e-12) NL -= l.px * (m.L - l.a);
  const axial = m.EA > 0 ? (n * NL) / m.EA : 0;
  if (m.truss) return { member: m, segments: [], bending: 0, axial, N: N0, n, NL };
  const cuts = [0, m.L];
  for (const l of loads) {
    if (l.kind === 'dist') cuts.push(l.a, l.b);
    else if (l.kind === 'point') cuts.push(l.a);
  }
  const pts = uniq(cuts.filter((x) => x > -TOL && x < m.L + TOL));
  const Mr = (x: number) => real.momentAt(m.id, x / m.L), mv = (x: number) => virt.momentAt(m.id, x / m.L);
  const segments: Segment[] = [];
  let bending = 0;
  for (let k = 0; k + 1 < pts.length; k++) {
    const x1 = pts[k], x2 = pts[k + 1], l = x2 - x1, e = l * 1e-8;
    // The one-sided end values, extrapolated from just inside: a load point exactly at an end belongs to the neighbour.
    const at = (f: (x: number) => number, x: number, h: number) => 2 * f(x + h) - f(x + 2 * h);
    const M1 = tr(at(Mr, x1, e)), M2 = tr(at(Mr, x2, -e)), m1 = tv(at(mv, x1, e)), m2 = tv(at(mv, x2, -e));
    const g = gauss(x1, x2, (x) => Mr(x) * mv(x));
    // The product table covers a linear M plus the parabola of a uniform load; a varying load has no entry.
    let f: number | null = 0;
    for (const q of loads) {
      if (q.kind !== 'dist' || q.a > x1 + TOL || q.b < x2 - TOL) continue;
      if (Math.abs(q.qa - q.qb) > 1e-9 * Math.max(1, Math.abs(q.qa))) { f = null; break; }
      f = (f ?? 0) - (q.qa * l * l) / 8;
    }
    let table: number | null = null;
    if (f !== null) {
      const bulge = Mr((x1 + x2) / 2) - (M1 + M2) / 2;
      if (Math.abs(bulge - f) <= 1e-6 * Math.max(1, Math.abs(f), Math.abs(M1), Math.abs(M2))) {
        table = (l / 6) * (M1 * (2 * m1 + m2) + M2 * (m1 + 2 * m2)) + (l * f * (m1 + m2)) / 3;
      } else f = null;
    }
    segments.push({ x1, x2, M1, M2, f, m1, m2, table, gauss: g });
    bending += g;
  }
  return { member: m, segments, bending: bending / m.EI, axial, N: N0, n, NL };
}

/** The members' bending integrals written out, one titled group each. */
export function bendingBlocks(works: MemberWork[], mSym: string): Block[] {
  const out: Block[] = [];
  for (const w of works) {
    if (w.member.truss) continue;
    const m = w.member;
    const blocks: Block[] = [];
    const allTable = w.segments.every((s) => s.table !== null);
    if (w.segments.length === 1 && allTable) {
      const s = w.segments[0];
      const l = s.x2 - s.x1;
      // The parabola's term only when the member carries a uniform load.
      const bulge = Math.abs(s.f!) > 1e-12;
      blocks.push({
        kind: 'calc', label: tx('steps.deformation.productTable'),
        formula: `\\int_0^{L} \\frac{M\\,${mSym}}{EI}\\,dx = \\frac{1}{EI}\\Big\\{\\frac{L}{6}\\big[M_I(2${mSym}_I + ${mSym}_J) + M_J(${mSym}_I + 2${mSym}_J)\\big]${bulge ? ` + \\frac{L}{3}\\,f\\,(${mSym}_I + ${mSym}_J)` : ''}\\Big\\}${bulge ? ', \\quad f = \\frac{w L^2}{8}' : ''}`,
        subst: `\\frac{1}{${num(m.EI)}}\\Big\\{\\frac{${num(l)}}{6}\\big[${par(s.M1)}\\,(2 \\cdot ${par(s.m1)} + ${par(s.m2)}) + ${par(s.M2)}\\,(${par(s.m1)} + 2 \\cdot ${par(s.m2)})\\big]${bulge ? ` + \\frac{${num(l)}}{3} \\cdot ${par(s.f!)} \\cdot (${par(s.m1)} + ${par(s.m2)})` : ''}\\Big\\}`,
        result: `\\boxed{\\int_{${m.name.replace('–', '')}} \\frac{M\\,${mSym}}{EI}\\,dx = ${num(w.bending)}\\ ${U.m}}`,
        check: `\\text{Gauss: } \\frac{${num(s.gauss)}}{${num(m.EI)}} = ${num(w.bending)}\\ \\checkmark`,
      });
    } else {
      blocks.push({
        kind: 'table',
        head: [texCell('x_1'), texCell('x_2'), texCell('M_1'), texCell('M_2'), texCell('f'), texCell(`${mSym}_1`), texCell(`${mSym}_2`), tx('steps.deformation.byTable'), tx('steps.deformation.byGauss')],
        rows: w.segments.map((s) => [s.x1, s.x2, s.M1, s.M2, s.f === null ? '—' : s.f, s.m1, s.m2, s.table === null ? '—' : s.table, s.gauss]),
        caption: tx('steps.deformation.segmentsCaption'),
      });
      blocks.push({
        kind: 'calc', label: tx('steps.deformation.memberIntegral'),
        formula: `\\int_0^{L} \\frac{M\\,${mSym}}{EI}\\,dx = \\frac{1}{EI}\\sum_{\\text{seg}} \\int M\\,${mSym}\\,dx`,
        subst: `\\frac{${w.segments.map((s) => par(s.gauss)).join(' + ')}}{${num(m.EI)}}`,
        result: `\\boxed{\\int_{${m.name.replace('–', '')}} \\frac{M\\,${mSym}}{EI}\\,dx = ${num(w.bending)}\\ ${U.m}}`,
      });
    }
    out.push({ kind: 'sub', title: tx('steps.deformation.memberTitle', { m: m.name, L: numText(m.L), EI: numText(m.EI) }), blocks });
  }
  return out;
}

export function axialTable(works: MemberWork[], NSym: string): Block {
  return {
    kind: 'table',
    head: [tx('steps.common.member'), texCell('N\\ [\\mathrm{kN}]'), texCell(`${NSym}`), texCell('L\\ [\\mathrm{m}]'), texCell('EA\\ [\\mathrm{kN}]'), texCell(`\\frac{N\\,${NSym}\\,L}{EA}\\ [\\mathrm{m}]`)],
    rows: works.map((w) => [w.member.name, w.N, w.n, w.member.L, w.member.EA, w.axial]),
    caption: tx('steps.deformation.axialCaption'),
  };
}

export function endValuesTable(pm: PlaneModel, real: Reference, sym: { M: string; N: string }, cap: string): Block {
  const tr = tidier(pm, real);
  return {
    kind: 'table',
    head: [tx('steps.common.member'), texCell(`${sym.M}_I\\ [\\mathrm{kN\\,m}]`), texCell(`${sym.M}_J\\ [\\mathrm{kN\\,m}]`), texCell(`${sym.N}\\ [\\mathrm{kN}]`)],
    rows: pm.memberOrder.map((id) => {
      const m = pm.members.get(id)!;
      return [m.name, m.truss ? 0 : tr(real.momentAt(id, 1e-12)), m.truss ? 0 : tr(real.momentAt(id, 1 - 1e-12)), tr(real.axial.get(id) ?? 0)];
    }),
    caption: tx(cap),
  };
}

export function unitSketch(pm: PlaneModel, tg: Target, virt: Reference, label: string): Sketch {
  const n = pm.nodes.get(tg.node)!;
  const frames = pm.memberOrder.filter((id) => !pm.members.get(id)!.truss);
  return {
    ...sketchOf(pm), dims: 'auto',
    forces: [{ x: n.x, z: n.z, fx: tg.dir === 'x' ? 1 : 0, fz: tg.dir === 'z' ? -1 : 0, label, color: 'unknown' }],
    diagram: diagramOf(pm, frames, (id, u) => virt.momentAt(id, u), 'unknown', ''),
  };
}

export const frameIds = (pm: PlaneModel) => pm.memberOrder.filter((id) => !pm.members.get(id)!.truss);
