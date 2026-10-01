/**
 * What the continuous-beam methods (three-moments.ts, cross-beams.ts) share:
 * the beam read as spans between supports, what a model must be for them,
 * the figures, and the closing steps: every span as a free body for the
 * reactions, the comparison with the matrix solve, and the V and M diagrams,
 * drawn from the method's own numbers (not the solver's) so the figure shows
 * what the steps proved.
 *
 * Moments come in two conventions, and each document says which it uses:
 * - the bending moment M, positive when it tensions the bottom fibre
 *   (sagging), is what the three-moment equation solves for;
 * - the end moment M̂ on a span, counter-clockwise positive, is what moment
 *   distribution and the fixed-end table (fem.ts) work with.
 * At a span's left end M̂ = −M, at its right end M̂ = +M.
 */
import type { MethodContext } from './registry';
import type { Applicability, Block, Cell, CompareRow, Step, Tex, Txt } from './doc';
import { tx } from './doc';
import { num, numText, par } from './format';
import { hasSpecialSupports, hasThermal } from './plane-model';
import type { PlaneModel } from './plane-model';
import { beamLine, resultantOf } from './beam-line';
import type { BeamLine, EndKind, Overhang, Span, SpanLoad } from './beam-line';
import { sketchOf } from './sketch';
import type { Sketch } from './sketch';
import type { Reference } from './reference';

export const kN = '\\mathrm{kN}';
export const kNm = '\\mathrm{kN\\,m}';
export const kNm2 = '\\mathrm{kN\\,m^2}';
export const EPS = 1e-12;

// ─── Reading the beam ────────────────────────────────────────────────────────

/** An overhang as the joint it hangs from sees it. */
export interface OhInfo {
  oh: Overhang;
  /** Name of its free end. */
  tip: string;
  /** Counter-clockwise moment of its loads about the support, and how it adds up. */
  Mq: number;
  mqTex: Tex;
  /** Its end moment at the support, counter-clockwise on the overhang (= −Mq). */
  Mhat: number;
  /** The bending moment it leaves at the support, on its own side (sagging positive). */
  M: number;
  /** Its total downward load, which goes straight into the support. */
  R: number;
}

export interface Sup {
  node: number;
  name: string;
  x: number;
  kind: EndKind;
  /** Joint couple (counter-clockwise) and downward joint force. */
  C: number;
  P: number;
  /** Index of the span on each side, if any. */
  left: number | null;
  right: number | null;
  ohL: OhInfo | null;
  ohR: OhInfo | null;
}

export interface SpanX extends Span {
  k: number;
  /** Names of the left and right supports, and the two end subscripts. */
  li: string;
  lj: string;
  ij: string;
  ji: string;
  /** "A–B", as the texts write it. */
  label: string;
  EIk: number;
}

export interface Beam {
  pm: PlaneModel;
  bl: BeamLine;
  /** Global position of the beam's x = 0, and its level. */
  X0: number;
  z0: number;
  spans: SpanX[];
  sups: Sup[];
  totalLoad: number;
}

export const nameOf = (pm: PlaneModel, id: number) => pm.nodes.get(id)?.name ?? String(id);

/** A downward force or its resultant: F at x. */
export interface Force { F: number; x: number }

/**
 * The loads of a piece as forces and couples. A linear load is split into a
 * rectangle and a triangle (or two triangles when it changes sign), each with
 * its own resultant and centroid, so the lever arms are the ones a hand
 * calculation writes.
 */
export function forcesOf(loads: SpanLoad[]): { forces: Force[]; couples: Array<{ C: number; x: number }> } {
  const forces: Force[] = [];
  const couples: Array<{ C: number; x: number }> = [];
  const tri = (a: number, b: number, ta: number, tb: number) => {
    const F = ((ta + tb) * (b - a)) / 2;
    if (Math.abs(F) > EPS) forces.push({ F, x: a + (b - a) * (Math.abs(tb) > EPS ? 2 / 3 : 1 / 3) });
  };
  for (const l of loads) {
    if (l.kind === 'point') forces.push({ F: l.P, x: l.a });
    else if (l.kind === 'couple') couples.push({ C: l.M, x: l.a });
    else {
      const len = l.b - l.a;
      if (Math.abs(l.wa - l.wb) < 1e-9) {
        if (Math.abs(l.wa) > EPS) forces.push({ F: l.wa * len, x: (l.a + l.b) / 2 });
      } else if (l.wa * l.wb >= 0) {
        const lo = Math.abs(l.wa) <= Math.abs(l.wb) ? l.wa : l.wb;
        if (Math.abs(lo) > EPS) forces.push({ F: lo * len, x: (l.a + l.b) / 2 });
        tri(l.a, l.b, l.wa - lo, l.wb - lo);
      } else {
        tri(l.a, l.b, l.wa, 0);
        tri(l.a, l.b, 0, l.wb);
      }
    }
  }
  return { forces, couples };
}

/** The counter-clockwise moment of the loads about x = p, and the sum written out. */
export function momentAbout(loads: SpanLoad[], p: number): { value: number; tex: Tex } {
  const { forces, couples } = forcesOf(loads);
  let value = 0;
  const parts: string[] = [];
  // A downward force F at x turns counter-clockwise about p by F·(p − x).
  for (const f of forces) { value += f.F * (p - f.x); parts.push(`${par(f.F)}(${num(p - f.x)})`); }
  for (const c of couples) { value += c.C; parts.push(par(c.C)); }
  return { value, tex: parts.length ? parts.join(' + ') : '0' };
}

export function readBeam(ctx: MethodContext): Beam | null {
  const r = beamLine(ctx.pm);
  if (!r.ok) return null;
  const bl = r.beam;
  const pm = ctx.pm;
  const n0 = pm.nodes.get(bl.nodes[0].id)!;
  const X0 = n0.x - bl.nodes[0].x, z0 = n0.z;

  const spans: SpanX[] = bl.spans.map((s, k) => {
    const li = nameOf(pm, s.left), lj = nameOf(pm, s.right);
    return { ...s, k, li, lj, ij: `${li}${lj}`, ji: `${lj}${li}`, label: `${li}–${lj}`, EIk: s.EI ?? s.E * s.I };
  });

  const ohInfo = (oh: Overhang): OhInfo => {
    // About the support: the right end of a left overhang, the left end of a right one.
    const p = oh.side === 'left' ? oh.L : 0;
    const mq = momentAbout(oh.loads, p);
    // A left overhang's moment at the support is minus the moment of the loads
    // to its left; a right overhang's is plus the moment of the loads to its right.
    return {
      oh, tip: nameOf(pm, oh.tip), Mq: mq.value, mqTex: mq.tex, Mhat: -mq.value,
      M: oh.side === 'left' ? -mq.value : mq.value, R: resultantOf(oh.loads).R,
    };
  };

  const sups: Sup[] = bl.supports.map((s, idx) => {
    const jl = bl.jointLoads.filter((j) => j.node === s.node);
    const oL = bl.overhangs.find((o) => o.side === 'left' && o.support === s.node);
    const oR = bl.overhangs.find((o) => o.side === 'right' && o.support === s.node);
    return {
      node: s.node, name: nameOf(pm, s.node), x: s.x, kind: s.kind,
      C: jl.reduce((a, j) => a + j.M, 0), P: jl.reduce((a, j) => a + j.P, 0),
      left: idx > 0 ? idx - 1 : null, right: idx < bl.supports.length - 1 ? idx : null,
      ohL: oL ? ohInfo(oL) : null, ohR: oR ? ohInfo(oR) : null,
    };
  });

  let totalLoad = 0;
  for (const s of bl.spans) totalLoad += resultantOf(s.loads).R;
  for (const o of bl.overhangs) totalLoad += resultantOf(o.loads).R;
  for (const j of bl.jointLoads) totalLoad += j.P;
  return { pm, bl, X0, z0, spans, sups, totalLoad };
}

/** What both methods need from the model. */
export function appliesContinuous(ctx: MethodContext): Applicability {
  const no = (key: string, params?: Record<string, string | number>): Applicability => ({ ok: false, reason: tx(key, params) });
  if ((ctx.input.constraints?.length ?? 0) > 0 || (ctx.input.connectors?.size ?? 0) > 0) return no('steps.req.constraints');
  const r = beamLine(ctx.pm);
  if (!r.ok) {
    // A spring or an inclined roller fails the support-type test; say what it is.
    if (r.reason.reason.key === 'steps.req.beam.supportType' && hasSpecialSupports(ctx.pm)) return no('steps.req.special');
    return r.reason;
  }
  if (hasThermal(ctx.pm)) return no('steps.req.thermal');
  if (hasSpecialSupports(ctx.pm)) return no('steps.req.special');
  const { spans, supports } = r.beam;
  const fixed = supports.some((s) => s.kind === 'fixed');
  if (spans.length < 2 && !(spans.length === 1 && fixed)) return no('steps.continuous.req.determinate');
  for (const s of spans) {
    if (s.EI === null) return no('steps.continuous.req.variableEI', { s: `${nameOf(ctx.pm, s.left)}–${nameOf(ctx.pm, s.right)}` });
  }
  if (!ctx.ref) return no('steps.req.unstable');
  return { ok: true };
}

// ─── Figures ─────────────────────────────────────────────────────────────────

export const wLabel = (wa: number, wb: number) =>
  Math.abs(wa - wb) < 1e-9 ? `${numText(Math.abs(wa))} kN/m` : `${numText(wa)}…${numText(wb)} kN/m`;

/** A piece's loads drawn on the sketch member `member` (drawn left to right from `x0` in the piece's frame). */
export function drawLoads(s: Sketch, loads: SpanLoad[], at: { member: number; from: number; to: number; X: number; z: number }) {
  s.spanLoads ??= []; s.forces ??= []; s.couples ??= [];
  for (const l of loads) {
    if (l.kind === 'dist') {
      const a = Math.max(l.a, at.from), b = Math.min(l.b, at.to);
      if (b - a < 1e-9) continue;
      const w = (x: number) => l.wa + ((l.wb - l.wa) * (x - l.a)) / (l.b - l.a);
      s.spanLoads.push({ member: at.member, a: a - at.from, b: b - at.from, wa: w(a), wb: w(b), ...(Math.abs(a - l.a) < 1e-9 ? { label: wLabel(l.wa, l.wb) } : {}) });
    } else if (l.a >= at.from - 1e-9 && l.a <= at.to + 1e-9) {
      const x = at.X + l.a;
      if (l.kind === 'point') s.forces.push({ x, z: at.z, fx: 0, fz: -l.P, label: `${numText(Math.abs(l.P))} kN`, color: 'load' });
      else s.couples.push({ x, z: at.z, m: l.M, label: `${numText(Math.abs(l.M))} kN·m`, color: 'load' });
    }
  }
}

/** Every piece of the beam (spans and overhangs) with its position. */
export function pieces(b: Beam): Array<{ x0: number; L: number; loads: SpanLoad[] }> {
  return [...b.spans.map((s) => ({ x0: s.x0, L: s.L, loads: s.loads })), ...b.bl.overhangs.map((o) => ({ x0: o.x0, L: o.L, loads: o.loads }))];
}

/**
 * The whole beam, members drawn left to right whatever way they were
 * modelled: a downward load, a sagging moment and the tension side then all
 * sit below the figure's members, as the texts describe them.
 */
export function beamSketch(b: Beam, opts: { loads?: boolean; dims?: boolean } = {}): Sketch {
  const s = sketchOf(b.pm);
  s.members = b.bl.members.map(({ member: m, flipped }) => ({ id: m.id, i: flipped ? m.j : m.i, j: flipped ? m.i : m.j }));
  if (opts.dims !== false) s.dims = 'auto';
  if (opts.loads !== false) {
    s.spanLoads = []; s.forces = []; s.couples = [];
    for (const p of pieces(b)) {
      const ms = b.bl.members.filter((o) => o.x0 >= p.x0 - 1e-9 && o.x0 + o.member.L <= p.x0 + p.L + 1e-9);
      for (const o of ms) {
        const from = o.x0 - p.x0, to = from + o.member.L;
        const isLast = o === ms[ms.length - 1];
        // Point loads and couples at a member's end node belong to one member only.
        const own = p.loads.filter((l) => l.kind === 'dist' || (l.a >= from - 1e-9 && (isLast ? l.a <= to + 1e-9 : l.a < to - 1e-9)));
        drawLoads(s, own, { member: o.member.id, from, to, X: b.X0 + p.x0, z: b.z0 });
      }
    }
    for (const j of b.bl.jointLoads) {
      const x = b.X0 + b.bl.nodes.find((n) => n.id === j.node)!.x;
      if (Math.abs(j.P) > EPS) s.forces.push({ x, z: b.z0, fx: 0, fz: -j.P, label: `${numText(Math.abs(j.P))} kN`, color: 'load' });
      if (Math.abs(j.M) > EPS) s.couples.push({ x, z: b.z0, m: j.M, label: `${numText(Math.abs(j.M))} kN·m`, color: 'load' });
    }
  }
  return s;
}

/**
 * One span on its own: simply supported or fixed at both ends (the load
 * patterns), or free (a free body, with its end moments and shears).
 */
export function spanSketch(b: Beam, s: SpanX, opts: { supports?: 'simple' | 'fixed'; ends?: { Mij: number; Mji: number }; shears?: boolean }): Sketch {
  const XL = b.X0 + s.x0;
  const sk: Sketch = {
    nodes: [{ id: 1, x: XL, z: b.z0, label: s.li }, { id: 2, x: XL + s.L, z: b.z0, label: s.lj }],
    members: [{ id: 1, i: 1, j: 2 }],
    dims: 'auto',
    height: 150,
  };
  if (opts.supports === 'simple') sk.supports = [{ node: 1, type: 'pinned' }, { node: 2, type: 'roller' }];
  if (opts.supports === 'fixed') sk.supports = [{ node: 1, type: 'fixed' }, { node: 2, type: 'fixed' }];
  drawLoads(sk, s.loads, { member: 1, from: 0, to: s.L, X: XL, z: b.z0 });
  if (opts.ends) {
    sk.couples!.push({ x: XL, z: b.z0, m: opts.ends.Mij, label: `${numText(opts.ends.Mij)} kN·m`, color: 'moment' });
    sk.couples!.push({ x: XL + s.L, z: b.z0, m: opts.ends.Mji, label: `${numText(opts.ends.Mji)} kN·m`, color: 'moment' });
  }
  if (opts.shears) {
    // An unknown drawn as big as the loads it balances, pointing up.
    const big = Math.max(1, ...forcesOf(s.loads).forces.map((f) => Math.abs(f.F)));
    sk.forces!.push({ x: XL, z: b.z0, fx: 0, fz: big, label: `V_${s.ij}`, color: 'unknown', dashed: true });
    sk.forces!.push({ x: XL + s.L, z: b.z0, fx: 0, fz: big, label: `V_${s.ji}`, color: 'unknown', dashed: true });
  }
  return sk;
}

// ─── Shared closing steps ────────────────────────────────────────────────────

/** The solution along one piece: bending moment (sagging) and shear from its left end. */
export interface Piece { x0: number; L: number; loads: SpanLoad[]; Ma: number; Vl: number }

export const G5 = [
  [-0.9061798459386640, 0.2369268850561891], [-0.5384693101056831, 0.4786286704993665],
  [0, 0.5688888888888889], [0.5384693101056831, 0.4786286704993665], [0.9061798459386640, 0.2369268850561891],
] as const;

/** ∫_a^b f, exact for polynomials up to degree 9 (every load integrand here). */
export function integrate(a: number, b: number, f: (x: number) => number): number {
  const h = (b - a) / 2, c = (a + b) / 2;
  let s = 0;
  for (const [x, w] of G5) s += w * f(c + h * x);
  return s * h;
}

export function evalPiece(p: Piece, x: number): { M: number; V: number } {
  let M = p.Ma + p.Vl * x, V = p.Vl;
  for (const l of p.loads) {
    if (l.kind === 'point') { if (l.a < x) { M -= l.P * (x - l.a); V -= l.P; } }
    // A counter-clockwise couple lowers the sagging moment past it.
    else if (l.kind === 'couple') { if (l.a < x) M -= l.M; }
    else if (x > l.a) {
      const e = Math.min(x, l.b);
      const w = (t: number) => l.wa + ((l.wb - l.wa) * (t - l.a)) / (l.b - l.a);
      V -= integrate(l.a, e, w);
      M -= integrate(l.a, e, (t) => w(t) * (x - t));
    }
  }
  return { M, V };
}

/** Reactions and the numbers the diagrams and comparisons need. */
export interface Solution {
  /** Per span: end moments (counter-clockwise on the span) and end shears (up on the span). */
  ends: Array<{ Mij: number; Mji: number; Vij: number; Vji: number }>;
  R: Map<number, number>;
  Mr: Map<number, number>;
  pieces: Piece[];
}

/**
 * The reactions from each span as a free body (end moments known, shears
 * unknown), then support by support; `fromM` adds, for the three-moment
 * method, how its support moments become end moments.
 */
export function reactionsStep(b: Beam, ends: Array<{ Mij: number; Mji: number }>, fromM: Array<{ Ma: number; Mb: number; sa: Tex; sb: Tex }> | null): { step: Step; sol: Solution } {
  const blocks: Block[] = [];
  const out: Solution['ends'] = [];
  if (fromM) {
    blocks.push({ kind: 'eq', tex: `\\hat M_{ij} = -M_i, \\qquad \\hat M_{ji} = +M_j`, note: tx('steps.continuous.hatFromM') });
  }
  blocks.push({ kind: 'p', text: tx('steps.continuous.freeBodyWhy'), detail: true });
  blocks.push({ kind: 'eq', tex: `M_{q,X} = \\sum F_k\\,(x_X - x_k) + \\sum C_k`, note: tx('steps.continuous.mqDef') });

  b.spans.forEach((s, k) => {
    const { Mij, Mji } = ends[k];
    const { R } = resultantOf(s.loads);
    const mqj = momentAbout(s.loads, s.L), mqi = momentAbout(s.loads, 0);
    const Vij = (Mij + Mji + mqj.value) / s.L;
    const Vji = R - Vij;
    out.push({ Mij, Mji, Vij, Vji });
    const sub: Block[] = [];
    sub.push({ kind: 'fig', sketch: spanSketch(b, s, { ends: { Mij, Mji }, shears: true }), caption: tx('steps.continuous.freeBodyCaption', { s: s.label }) });
    if (fromM) {
      const f = fromM[k];
      sub.push({ kind: 'eq', tex: `\\hat M_{${s.ij}} = -${f.sa} = -${par(f.Ma)} = ${num(Mij)}\\ ${kNm}, \\qquad \\hat M_{${s.ji}} = +${f.sb} = ${num(Mji)}\\ ${kNm}` });
    }
    sub.push({ kind: 'calc', label: tx('steps.continuous.mq', { n: s.lj }), formula: `M_{q,${s.lj}} = \\sum F_k\\,(L - x_k) + \\sum C_k`, subst: `M_{q,${s.lj}} = ${mqj.tex}`, result: `\\boxed{M_{q,${s.lj}} = ${num(mqj.value)}\\ ${kNm}}` });
    sub.push({
      kind: 'calc', label: tx('steps.continuous.vLeft', { n: s.li }),
      formula: `\\sum M_{${s.lj}} = 0:\\quad \\hat M_{${s.ij}} + \\hat M_{${s.ji}} + M_{q,${s.lj}} - V_{${s.ij}}\\,L = 0 \\;\\Rightarrow\\; V_{${s.ij}} = \\frac{\\hat M_{${s.ij}} + \\hat M_{${s.ji}} + M_{q,${s.lj}}}{L}`,
      subst: `V_{${s.ij}} = \\frac{${par(Mij)} + ${par(Mji)} + ${par(mqj.value)}}{${num(s.L)}}`,
      result: `\\boxed{V_{${s.ij}} = ${num(Vij)}\\ ${kN}}`,
    });
    const resid = Mij + Mji + mqi.value + Vji * s.L;
    const scale = Math.max(1, Math.abs(Mij), Math.abs(Mji), Math.abs(mqi.value), Math.abs(Vji * s.L));
    sub.push({
      kind: 'calc', label: tx('steps.continuous.vRight', { n: s.lj }),
      formula: `\\sum F_y = 0:\\quad V_{${s.ij}} + V_{${s.ji}} - \\sum F_k = 0 \\;\\Rightarrow\\; V_{${s.ji}} = \\sum F_k - V_{${s.ij}}`,
      subst: `V_{${s.ji}} = ${num(R)} - ${par(Vij)}`,
      result: `\\boxed{V_{${s.ji}} = ${num(Vji)}\\ ${kN}}`,
      check: `\\sum M_{${s.li}} = \\hat M_{${s.ij}} + \\hat M_{${s.ji}} + M_{q,${s.li}} + V_{${s.ji}}\\,L = ${par(Mij)} + ${par(Mji)} + ${par(mqi.value)} + ${par(Vji)}(${num(s.L)}) = ${Math.abs(resid) <= 1e-7 * scale ? '0\\ \\checkmark' : num(resid)}`,
    });
    blocks.push({ kind: 'sub', title: tx('steps.continuous.spanName', { s: s.label }), blocks: sub });
  });

  for (const o of b.bl.overhangs) {
    const sup = b.sups.find((u) => u.node === o.support)!;
    const info = (o.side === 'left' ? sup.ohL : sup.ohR)!;
    const label = o.side === 'left' ? `${info.tip}–${sup.name}` : `${sup.name}–${info.tip}`;
    blocks.push({
      kind: 'sub', title: tx('steps.continuous.overhangName', { s: label }),
      blocks: [
        { kind: 'p', text: tx('steps.continuous.overhangShear', { s: label, n: sup.name }) },
        { kind: 'eq', tex: `V_{${sup.name}${info.tip}} = \\sum F_k = \\boxed{${num(info.R)}\\ ${kN}}` },
      ],
    });
  }

  // Support by support.
  const R = new Map<number, number>(), Mr = new Map<number, number>();
  const tot: Block[] = [];
  const rows: Cell[][] = [];
  for (const u of b.sups) {
    const sym: string[] = [], val: string[] = [];
    let r = 0;
    if (u.left !== null) { const s = b.spans[u.left]; sym.push(`V_{${s.ji}}`); val.push(par(out[u.left].Vji)); r += out[u.left].Vji; }
    if (u.right !== null) { const s = b.spans[u.right]; sym.push(`V_{${s.ij}}`); val.push(par(out[u.right].Vij)); r += out[u.right].Vij; }
    for (const oh of [u.ohL, u.ohR]) if (oh) { sym.push(`V_{${u.name}${oh.tip}}`); val.push(par(oh.R)); r += oh.R; }
    if (Math.abs(u.P) > EPS) { sym.push(`P_{${u.name}}`); val.push(par(u.P)); r += u.P; }
    R.set(u.node, r);
    tot.push({ kind: 'calc', label: tx('steps.continuous.reactionAt', { n: u.name }), formula: `R_{${u.name}} = ${sym.join(' + ')}`, subst: `R_{${u.name}} = ${val.join(' + ')}`, result: `\\boxed{R_{${u.name}} = ${num(r)}\\ ${kN}}` });
    let mrCell: Cell = '—';
    if (u.kind === 'fixed') {
      // Joint equilibrium: the support couple, the joint couple and the members' end moments (reversed) balance.
      const msym: string[] = [], mval: string[] = [];
      let m = 0;
      if (u.left !== null) { const s = b.spans[u.left]; msym.push(`\\hat M_{${s.ji}}`); mval.push(par(out[u.left].Mji)); m += out[u.left].Mji; }
      if (u.right !== null) { const s = b.spans[u.right]; msym.push(`\\hat M_{${s.ij}}`); mval.push(par(out[u.right].Mij)); m += out[u.right].Mij; }
      for (const oh of [u.ohL, u.ohR]) if (oh) { msym.push(`\\hat M_{${u.name}${oh.tip}}`); mval.push(par(oh.Mhat)); m += oh.Mhat; }
      if (Math.abs(u.C) > EPS) { msym.push(`- C_{${u.name}}`); mval.push(`- ${par(u.C)}`); m -= u.C; }
      const f = msym.join(' + ').replace(/\+ -/g, '-'), sv = mval.join(' + ').replace(/\+ -/g, '-');
      Mr.set(u.node, m);
      tot.push({ kind: 'calc', label: tx('steps.continuous.fixedMomentAt', { n: u.name }), formula: `M_{${u.name},\\mathrm{r}} = ${f}`, subst: `M_{${u.name},\\mathrm{r}} = ${sv}`, result: `\\boxed{M_{${u.name},\\mathrm{r}} = ${num(m)}\\ ${kNm}}` });
      mrCell = { tex: num(m) };
    }
    rows.push([u.name, { tex: num(r) }, mrCell]);
  }
  const sumR = [...R.values()].reduce((a, v) => a + v, 0);
  blocks.push({ kind: 'sub', title: tx('steps.continuous.bySupport'), blocks: [{ kind: 'p', text: tx('steps.continuous.bySupportWhy'), detail: true }, ...tot] });
  blocks.push({ kind: 'table', head: [tx('steps.common.support'), { tex: `R\\ [${kN}]` }, { tex: `M_{\\mathrm{r}}\\ [${kNm}]` }], rows, caption: tx('steps.continuous.reactionsCaption') });
  blocks.push({ kind: 'eq', tex: `\\sum R = ${num(sumR)}\\ ${kN} \\;=\\; \\sum F = ${num(b.totalLoad)}\\ ${kN}${Math.abs(sumR - b.totalLoad) <= 1e-7 * Math.max(1, Math.abs(b.totalLoad)) ? '\\ \\checkmark' : ''}`, note: tx('steps.continuous.globalCheck') });

  const fig = beamSketch(b);
  for (const u of b.sups) {
    const x = b.X0 + u.x;
    fig.forces!.push({ x, z: b.z0, fx: 0, fz: R.get(u.node)!, label: `${numText(Math.abs(R.get(u.node)!))} kN`, color: 'reaction' });
    const m = Mr.get(u.node);
    if (m !== undefined && Math.abs(m) > EPS) fig.couples!.push({ x, z: b.z0, m, label: `${numText(Math.abs(m))} kN·m`, color: 'reaction' });
  }
  blocks.push({ kind: 'fig', sketch: fig, caption: tx('steps.continuous.reactionsFig') });

  // The pieces for the diagrams: each span from its left end, the overhangs from theirs.
  const ps: Piece[] = b.spans.map((s, k) => ({ x0: s.x0, L: s.L, loads: s.loads, Ma: -out[k].Mij, Vl: out[k].Vij }));
  for (const o of b.bl.overhangs) {
    const sup = b.sups.find((u) => u.node === o.support)!;
    if (o.side === 'left') ps.push({ x0: o.x0, L: o.L, loads: o.loads, Ma: 0, Vl: 0 });
    else ps.push({ x0: o.x0, L: o.L, loads: o.loads, Ma: sup.ohR!.M, Vl: sup.ohR!.R });
  }
  return { step: { title: tx('steps.common.reactions'), blocks }, sol: { ends: out, R, Mr, pieces: ps } };
}

/** A diagram's values along every member, sampled from the method's own solution. */
export function diagramValues(b: Beam, ps: Piece[], which: 'M' | 'V'): Array<{ member: number; values: Array<[number, number]> }> {
  const out: Array<{ member: number; values: Array<[number, number]> }> = [];
  for (const o of b.bl.members) {
    const L = o.member.L;
    const p = ps.find((q) => o.x0 >= q.x0 - 1e-9 && o.x0 + L <= q.x0 + q.L + 1e-9);
    if (!p) continue;
    const from = o.x0 - p.x0;
    const ts = new Set<number>();
    for (let k = 0; k <= 24; k++) ts.add(k / 24);
    const d = 1e-6;
    const jumps: number[] = [];
    for (const l of p.loads) {
      const marks = l.kind === 'dist' ? [l.a, l.b] : [l.a];
      for (const a of marks) {
        const t = (a - from) / L;
        if (t <= 1e-9 || t >= 1 - 1e-9) continue;
        if (l.kind === 'dist') ts.add(t); else jumps.push(t);
      }
    }
    // At a jump the value is two-sided: sample just before and just after, never on it.
    for (const t of [...ts]) if (jumps.some((j) => Math.abs(t - j) < 2 * d)) ts.delete(t);
    for (const j of jumps) { ts.add(j - d); ts.add(j + d); }
    const values: Array<[number, number]> = [...ts].sort((x, y) => x - y).map((t) => {
      // The ends read just inside the member, so a jump at an inner node shows on both sides.
      const x = Math.min(Math.max(from + t * L, from + 1e-9), from + L - 1e-9);
      const r = evalPiece(p, x);
      return [t, which === 'M' ? r.M : r.V];
    });
    out.push({ member: o.member.id, values });
  }
  return out;
}

export function diagramsStep(b: Beam, ps: Piece[]): Step {
  const v = beamSketch(b, { loads: false, dims: false });
  v.diagram = { color: 'diagram', marks: true, unit: 'kN', members: diagramValues(b, ps, 'V') };
  const m = beamSketch(b, { loads: false, dims: false });
  m.diagram = { color: 'diagram', marks: true, unit: 'kN·m', members: diagramValues(b, ps, 'M') };
  return {
    title: tx('steps.common.diagrams'),
    blocks: [
      { kind: 'p', text: tx('steps.continuous.diagramsWhy'), detail: true },
      { kind: 'eq', tex: `V(x) = V_{ij} - \\sum_{x_k < x} F_k, \\qquad M(x) = -\\hat M_{ij} + V_{ij}\\,x - \\sum_{x_k < x} F_k\\,(x - x_k) - \\sum_{x_k < x} C_k`, note: tx('steps.continuous.diagramsEq') },
      { kind: 'fig', sketch: v, caption: tx('steps.continuous.shearCaption') },
      { kind: 'fig', sketch: m, caption: tx('steps.continuous.momentCaption') },
    ],
  };
}

/** The member touching a span end, and its counter-clockwise end moment there in the matrix solve. */
export function refEndMoment(b: Beam, ref: Reference, s: SpanX, side: 'L' | 'R'): number {
  const x = side === 'L' ? s.x0 : s.x0 + s.L;
  const o = b.bl.members.find((m) => s.members.includes(m.member.id) && Math.abs((side === 'L' ? m.x0 : m.x0 + m.member.L) - x) < 1e-9);
  const e = o ? ref.endMoments.get(o.member.id) : undefined;
  if (!o || !e) return NaN;
  // The I end is the left one of a member drawn left to right.
  if (side === 'L') return o.flipped ? e.Mj : e.Mi;
  return o.flipped ? e.Mi : e.Mj;
}

export function reactionRows(b: Beam, ref: Reference, sol: Solution): CompareRow[] {
  const rows: CompareRow[] = [];
  for (const u of b.sups) {
    const r = ref.reactions.get(u.node);
    rows.push({ label: `R_{${u.name}}`, method: sol.R.get(u.node)!, matrix: r?.rz ?? NaN, unit: 'kN' });
    if (u.kind === 'fixed') rows.push({ label: `M_{${u.name},\\mathrm{r}}`, method: sol.Mr.get(u.node)!, matrix: r?.my ?? NaN, unit: 'kN·m' });
  }
  return rows;
}

export function introBlocks(b: Beam, lead: Txt, why: Txt): Block[] {
  const out: Block[] = [
    { kind: 'p', text: lead },
    { kind: 'p', text: why, detail: true },
    { kind: 'fig', sketch: beamSketch(b), caption: tx('steps.common.structureCaption') },
    { kind: 'p', text: tx('steps.common.units') },
  ];
  if (b.bl.hasAxialLoads) out.push({ kind: 'note', tone: 'info', text: tx('steps.continuous.axialNote') });
  return out;
}

export const subtitle = (b: Beam) => (b.spans.length === 1 ? tx('steps.continuous.subtitleOne') : tx('steps.continuous.subtitle', { n: b.spans.length }));
