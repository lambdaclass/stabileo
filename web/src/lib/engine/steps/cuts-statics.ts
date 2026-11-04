/**
 * The statics of the "cuts" method (methods/cuts.ts): the model read as
 * external actions, the static classification, the reactions by equilibrium
 * (or from the matrix solve when equilibrium is not enough), each member's
 * forces at its start I from the part on one side of a cut, and the joint
 * equilibrium check. The laws along each member are in cuts-segments.ts.
 *
 * Global axes: X to the right, Z up, moments counter-clockwise. Member loads
 * in the member's axes: w and P towards −y, H towards J, C counter-clockwise.
 * N_i, V_i, M_i are the internal forces just past I, with the convention the
 * document states (on the piece between I and the section: N along +x, V
 * along −y, M counter-clockwise).
 */
import type { MethodContext } from './registry';
import type { Block, Cell, Step, Tex, Txt } from './doc';
import { tx } from './doc';
import { num, numText, par } from './format';
import type { PlaneModel, PMember } from './plane-model';
import type { Reference } from './reference';
import type { Sketch } from './sketch';
import { sketchOf } from './sketch';
import type { SolverInput } from '../types';
import { computeStaticDegree } from '../kinematic-2d';

export const UF = '\\mathrm{kN}';
export const UM = '\\mathrm{kN\\,m}';
export const UL = '\\mathrm{m}';

// ─── Writing sums, solving small systems ──────────────────────────

/** Terms written one after the other: each "+ t" or "- t", the first without its "+". */
/** Long sums are broken into lines; outside an aligned block they get one of their own. */
export const wrapA = (s: string) => (s.includes('\\\\') ? `\\begin{aligned} &${s} \\end{aligned}` : s);

export function joinTerms(terms: string[], perLine = 0): string {
  if (terms.length === 0) return '0';
  let s = '';
  terms.forEach((t, k) => {
    const x = t.trim();
    const piece = k === 0 ? (x.startsWith('+') ? x.slice(1).trim() : x) : ` ${x}`;
    if (perLine > 0 && k > 0 && k % perLine === 0) s += ' \\\\ &\\quad';
    s += piece;
  });
  return s;
}

/** Gaussian elimination with partial pivoting; null when singular. */
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  const scale = Math.max(1e-30, ...A.flat().map(Math.abs));
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-11 * scale) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let k = col; k <= n; k++) M[r][k] -= f * M[col][k];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
}

// ─── The model, read for statics ──────────────────────────────────

/** A member load in the member's axes, numbered per member (k = 1, 2 …): w, P towards −y; H towards J; C counter-clockwise. */
export type LocalLoad =
  | { kind: 'dist'; k: number; a: number; b: number; wa: number; wb: number }
  | { kind: 'P' | 'H' | 'C'; k: number; a: number; v: number };

export function localLoads(pm: PlaneModel, m: PMember): LocalLoad[] {
  const out: LocalLoad[] = [];
  let k = 0;
  for (const l of pm.memberLoads) {
    if (l.member !== m.id) continue;
    if (l.kind === 'dist') {
      if (l.b - l.a < 1e-12 || (Math.abs(l.qa) < 1e-12 && Math.abs(l.qb) < 1e-12)) continue;
      out.push({ kind: 'dist', k: ++k, a: l.a, b: l.b, wa: -l.qa, wb: -l.qb });
    } else if (l.kind === 'point') {
      if (Math.abs(l.p) > 1e-12) out.push({ kind: 'P', k: ++k, a: l.a, v: -l.p });
      if (Math.abs(l.px) > 1e-12) out.push({ kind: 'H', k: ++k, a: l.a, v: l.px });
      if (Math.abs(l.m) > 1e-12) out.push({ kind: 'C', k: ++k, a: l.a, v: l.m });
    }
  }
  return out;
}

/** Resultant of a distributed load (towards −y), its centroid from I, and ∫w·ξ dξ. */
export function distResultant(l: { a: number; b: number; wa: number; wb: number }) {
  const R = ((l.wa + l.wb) / 2) * (l.b - l.a);
  const kk = (l.wb - l.wa) / (l.b - l.a);
  const S1 = (l.wa * (l.b ** 2 - l.a ** 2)) / 2 + kk * ((l.b ** 3 - l.a ** 3) / 3 - (l.a * (l.b ** 2 - l.a ** 2)) / 2);
  const xc = Math.abs(R) > 1e-12 ? S1 / R : (l.a + l.b) / 2;
  return { R, xc, S1 };
}

/** An external action in global axes: a force at a point and a couple (counter-clockwise). */
export interface Act { x: number; z: number; fx: number; fz: number; m: number }

/** A member load as a global action (a distributed load by its resultant at its centroid). */
export function actOf(pm: PlaneModel, m: PMember, l: LocalLoad): Act {
  const ni = pm.nodes.get(m.i)!;
  const at = (t: number) => ({ x: ni.x + m.c * t, z: ni.z + m.s * t });
  // Local −y in global axes is (s, −c).
  if (l.kind === 'dist') {
    const { R, xc, S1 } = distResultant(l);
    if (Math.abs(R) > 1e-12) return { ...at(xc), fx: R * m.s, fz: -R * m.c, m: 0 };
    // No net force: the load is a couple, its moment about I.
    return { ...at(0), fx: 0, fz: 0, m: -S1 };
  }
  if (l.kind === 'P') return { ...at(l.a), fx: l.v * m.s, fz: -l.v * m.c, m: 0 };
  if (l.kind === 'H') return { ...at(l.a), fx: l.v * m.c, fz: l.v * m.s, m: 0 };
  return { ...at(l.a), fx: 0, fz: 0, m: l.v };
}

export const momentAbout = (a: Act, x0: number, z0: number) => (a.x - x0) * a.fz - (a.z - z0) * a.fx + a.m;

/** The moment of an action about a point, as "+ (dx)·(Fz) - (dz)·(Fx) + C" terms. */
export function momentTerms(a: Act, x0: number, z0: number): string[] {
  const dx = a.x - x0, dz = a.z - z0;
  const t: string[] = [];
  if (Math.abs(dx) > 1e-12 && Math.abs(a.fz) > 1e-12) t.push(`+ ${par(dx)} \\cdot ${par(a.fz)}`);
  if (Math.abs(dz) > 1e-12 && Math.abs(a.fx) > 1e-12) t.push(`- ${par(dz)} \\cdot ${par(a.fx)}`);
  if (Math.abs(a.m) > 1e-12) t.push(`+ ${par(a.m)}`);
  return t;
}

/** A reaction component, an unknown of step 2. */
export interface Unknown { node: number; comp: 'x' | 'z' | 'm'; tex: Tex; text: string }

export const nm = (name: string) => `\\mathrm{${name}}`;
export const memTex = (pm: PlaneModel, m: PMember) => {
  const a = pm.nodes.get(m.i)!.name, b = pm.nodes.get(m.j)!.name;
  return a.length === 1 && b.length === 1 ? `\\mathrm{${a}${b}}` : `\\mathrm{${a}{,}${b}}`;
};

export function unknownsOf(pm: PlaneModel): Unknown[] {
  const out: Unknown[] = [];
  for (const id of pm.nodeOrder) {
    const s = pm.supports.get(id);
    if (!s) continue;
    const n = pm.nodes.get(id)!.name;
    if (s.ux) out.push({ node: id, comp: 'x', tex: `R_{${nm(n)}x}`, text: `R${n}x` });
    if (s.uz) out.push({ node: id, comp: 'z', tex: `R_{${nm(n)}z}`, text: `R${n}z` });
    if (s.ry) out.push({ node: id, comp: 'm', tex: `M_{${nm(n)}}`, text: `M${n}` });
  }
  return out;
}

/** The node set reachable from `start` without crossing member `skip`. */
export function component(pm: PlaneModel, start: number, skip: number): Set<number> {
  const seen = new Set<number>([start]);
  const stack = [start];
  while (stack.length) {
    const n = stack.pop()!;
    for (const m of pm.members.values()) {
      if (m.id === skip) continue;
      const o = m.i === n ? m.j : m.j === n ? m.i : null;
      if (o !== null && !seen.has(o)) { seen.add(o); stack.push(o); }
    }
  }
  return seen;
}

/** Is the member graph a tree (connected, no closed ring)? Then every cut through a member splits it in two. */
export function isTree(pm: PlaneModel): boolean {
  const used = new Set<number>();
  for (const m of pm.members.values()) { used.add(m.i); used.add(m.j); }
  if (used.size === 0 || pm.members.size !== used.size - 1) return false;
  const first = pm.members.values().next().value!;
  return component(pm, first.i, -1).size === used.size;
}

/** The external actions on a part: loads and (known or unknown) reactions of its nodes, loads of its members. */
export interface Part { nodes: Set<number>; members: Set<number> }

export function partLoads(pm: PlaneModel, part: Part, loadsBy: Map<number, LocalLoad[]>): Act[] {
  const acts: Act[] = [];
  for (const l of pm.nodalLoads) {
    if (!part.nodes.has(l.node)) continue;
    const n = pm.nodes.get(l.node)!;
    if (Math.abs(l.fx) > 1e-12 || Math.abs(l.fz) > 1e-12 || Math.abs(l.my) > 1e-12) acts.push({ x: n.x, z: n.z, fx: l.fx, fz: l.fz, m: l.my });
  }
  for (const mid of part.members) {
    const m = pm.members.get(mid)!;
    for (const l of loadsBy.get(mid) ?? []) acts.push(actOf(pm, m, l));
  }
  return acts;
}

// ─── Figures ──────────────────────────────────────────────────────

/** The structure with its loads, as the documents draw it. */
export function structureSketch(pm: PlaneModel, loadsBy: Map<number, LocalLoad[]>): Sketch {
  const sk = sketchOf(pm);
  sk.spanLoads = [];
  sk.forces = [];
  sk.couples = [];
  for (const id of pm.memberOrder) {
    const m = pm.members.get(id)!;
    const ni = pm.nodes.get(m.i)!;
    for (const l of loadsBy.get(id) ?? []) {
      if (l.kind === 'dist') { sk.spanLoads.push({ member: id, a: l.a, b: l.b, wa: l.wa, wb: l.wb }); continue; }
      const x = ni.x + m.c * l.a, z = ni.z + m.s * l.a;
      if (l.kind === 'P') sk.forces.push({ x, z, fx: l.v * m.s, fz: -l.v * m.c, label: numText(Math.abs(l.v)), color: 'load' });
      else if (l.kind === 'H') sk.forces.push({ x, z, fx: l.v * m.c, fz: l.v * m.s, label: numText(Math.abs(l.v)), color: 'load' });
      else sk.couples.push({ x, z, m: l.v, label: numText(Math.abs(l.v)), color: 'moment' });
    }
  }
  for (const l of pm.nodalLoads) {
    const n = pm.nodes.get(l.node);
    if (!n) continue;
    if (Math.abs(l.fx) > 1e-12) sk.forces.push({ x: n.x, z: n.z, fx: l.fx, fz: 0, label: numText(Math.abs(l.fx)), color: 'load' });
    if (Math.abs(l.fz) > 1e-12) sk.forces.push({ x: n.x, z: n.z, fx: 0, fz: l.fz, label: numText(Math.abs(l.fz)), color: 'load' });
    if (Math.abs(l.my) > 1e-12) sk.couples.push({ x: n.x, z: n.z, m: l.my, label: numText(Math.abs(l.my)), color: 'moment' });
  }
  return sk;
}

/**
 * The positive internal forces on the two faces of a cut, drawn in the
 * member's axes (x to the right): on the piece left of the section N points
 * away, V down, M counter-clockwise; on the piece right of it, the opposite.
 */
export function triadSketch(): Sketch {
  const g = 0.55, a = 2, b = a + g, L = b + 2;
  const off = 0.4; // about 40 px at this width: the tension arrows sit clear of the faces
  return {
    nodes: [{ id: 1, x: 0, z: 0, label: 'I' }, { id: 2, x: a, z: 0 }, { id: 3, x: b, z: 0 }, { id: 4, x: L, z: 0, label: 'J' }],
    members: [{ id: 1, i: 1, j: 2 }, { id: 2, i: 3, j: 4 }],
    forces: [
      { x: a + off, z: 0, fx: 1, fz: 0, label: 'N', color: 'unknown' },
      { x: a, z: 0, fx: 0, fz: -1, label: 'V', color: 'unknown' },
      { x: b - off, z: 0, fx: -1, fz: 0, label: 'N', color: 'unknown' },
      { x: b, z: 0, fx: 0, fz: 1, label: 'V', color: 'unknown' },
    ],
    couples: [
      { x: a, z: 0, m: 1, label: 'M', color: 'unknown' },
      { x: b, z: 0, m: -1, label: 'M', color: 'unknown' },
    ],
    labels: [{ x: (a + b) / 2, z: 0, text: 'x', anchor: 'n' }],
    height: 170,
  };
}

// ─── The document's shared state ──────────────────────────────────

/** What every part of the document reads: the model, the matrix solve, and the number format that prints rounding noise as 0. */
export interface CutsCtx {
  pm: PlaneModel;
  input: SolverInput;
  ref: Reference;
  loadsBy: Map<number, LocalLoad[]>;
  nameOf: (n: number) => string;
  /** No closed ring of members: every cut through a member splits the structure in two. */
  tree: boolean;
  Ms: number;
  snapF: (v: number) => number;
  snapM: (v: number) => number;
  nF: (v: number) => string;
  nM: (v: number) => string;
  pF: (v: number) => string;
  pM: (v: number) => string;
}

export function cutsContext(ctx: MethodContext): CutsCtx {
  const { pm, input } = ctx;
  const ref = ctx.ref as Reference;
  const loadsBy = new Map(pm.memberOrder.map((id) => [id, localLoads(pm, pm.members.get(id)!)]));
  const nameOf = (n: number) => pm.nodes.get(n)!.name;
  const tree = isTree(pm);

  // Scales, so rounding noise prints as 0.
  let Fs = 0, Lmax = 0;
  for (const m of pm.members.values()) Lmax = Math.max(Lmax, m.L);
  for (const r of ref.reactions.values()) Fs = Math.max(Fs, Math.abs(r.rx), Math.abs(r.rz), Math.abs(r.my) / Math.max(1, Lmax));
  for (const l of pm.nodalLoads) Fs = Math.max(Fs, Math.abs(l.fx), Math.abs(l.fz));
  for (const ls of loadsBy.values()) for (const l of ls) Fs = Math.max(Fs, l.kind === 'dist' ? Math.max(Math.abs(l.wa), Math.abs(l.wb)) * Math.max(1, Lmax) : Math.abs(l.v));
  Fs = Math.max(Fs, 1e-9);
  const Ms = Fs * Math.max(1, Lmax);
  const snapF = (v: number) => (Math.abs(v) < 1e-9 * Fs ? 0 : v);
  const snapM = (v: number) => (Math.abs(v) < 1e-9 * Ms ? 0 : v);
  const nF = (v: number) => num(snapF(v));
  const nM = (v: number) => num(snapM(v));
  const pF = (v: number) => par(snapF(v));
  const pM = (v: number) => par(snapM(v));
  return { pm, input, ref, loadsBy, nameOf, tree, Ms, snapF, snapM, nF, nM, pF, pM };
}

export type Reactions = Map<number, { rx: number; rz: number; my: number }>;
export type EndForces = Map<number, { Ni: number; Vi: number; Mi: number }>;

// ─── Introduction ─────────────────────────────────────────────────

export function introBlocks(S: CutsCtx): Block[] {
  const { pm, loadsBy, nameOf } = S;
  const intro: Block[] = [];
  intro.push({ kind: 'p', text: tx('steps.cuts.intro.what') });
  intro.push({ kind: 'p', text: tx('steps.cuts.intro.why'), detail: true });
  intro.push({ kind: 'p', text: tx('steps.cuts.intro.axes') });
  intro.push({ kind: 'p', text: tx('steps.cuts.intro.signs') });
  intro.push({ kind: 'fig', sketch: triadSketch(), caption: tx('steps.cuts.intro.triadCaption') });
  intro.push({ kind: 'p', text: tx('steps.cuts.intro.loads') });
  intro.push({ kind: 'fig', sketch: { ...structureSketch(pm, loadsBy), dims: 'auto' }, caption: tx('steps.common.structureCaption') });
  intro.push({
    kind: 'table',
    head: [tx('steps.common.member'), 'I', 'J', { tex: `L\\ [${UL}]` }, { tex: '\\cos\\alpha' }, { tex: '\\sin\\alpha' }],
    rows: pm.memberOrder.map((id) => { const m = pm.members.get(id)!; return [m.name, nameOf(m.i), nameOf(m.j), m.L, Math.abs(m.c) < 1e-12 ? 0 : m.c, Math.abs(m.s) < 1e-12 ? 0 : m.s]; }),
    caption: tx('steps.cuts.intro.membersCaption'),
  });
  intro.push({ kind: 'p', text: tx('steps.common.units') });
  return intro;
}

// ─── Step 1: classification ───────────────────────────────────────

export function classificationStep(S: CutsCtx): { step: Step; sd: ReturnType<typeof computeStaticDegree>; gh: number } {
  const { pm, input, nameOf } = S;
  const sd = computeStaticDegree(input);
  const nMembers = pm.members.size, nNodes = input.nodes.size;
  let r = 0;
  for (const s of pm.supports.values()) r += (s.ux ? 1 : 0) + (s.uz ? 1 : 0) + (s.ry ? 1 : 0);
  const c = [...sd.nodeConditions.values()].reduce((a, b) => a + b, 0);
  const gh = sd.degree;
    const blocks: Block[] = [
      { kind: 'p', text: tx('steps.cuts.class.count', { m: nMembers, n: nNodes, r, c }) },
      { kind: 'calc', formula: 'GH = 3m + r - 3n - c', subst: `GH = 3 \\cdot ${nMembers} + ${r} - 3 \\cdot ${nNodes} - ${c}`, result: `\\boxed{GH = ${gh}}` },
    ];
    if (c > 0) {
      blocks.push({ kind: 'p', text: tx('steps.cuts.class.hinges'), detail: true });
      blocks.push({
        kind: 'table',
        head: [tx('steps.common.node'), tx('steps.cuts.class.kCol'), tx('steps.cuts.class.jCol'), { tex: 'c_i' }],
        rows: [...sd.nodeConditions.entries()].sort((a, b) => a[0] - b[0]).map(([n, ci]) => {
          let k = 0, j = 0;
          for (const m of pm.members.values()) {
            if (m.i === n) { k++; if (m.hingeI) j++; }
            if (m.j === n) { k++; if (m.hingeJ) j++; }
          }
          return [nameOf(n), k, j, ci];
        }),
      });
    }
    blocks.push({ kind: 'note', tone: gh === 0 ? 'ok' : 'info', text: gh === 0 ? tx('steps.cuts.class.determinate') : tx('steps.cuts.class.indeterminate', { g: gh }) });
  return { step: { title: tx('steps.common.classification'), blocks }, sd, gh };
}

// ─── Step 2: reactions ────────────────────────────────────────────

export interface ReactionsOut { step: Step; reactions: Reactions; solved: number[] | null; unknowns: Unknown[] }

export function reactionsStep(S: CutsCtx, sd: ReturnType<typeof computeStaticDegree>, gh: number): ReactionsOut {
  const { pm, ref, loadsBy, nameOf, Ms, snapF, snapM, nF, nM } = S;
  const unknowns = unknownsOf(pm);
  let solved: number[] | null = null;
  const reacBlocks: Block[] = [];
  const allNodes = new Set(pm.nodeOrder);
  const allMembers = new Set(pm.memberOrder);
  const loadActs = partLoads(pm, { nodes: allNodes, members: allMembers }, loadsBy);
  // The support with the most unknown forces is the moment centre: its forces drop out.
  const supportIds = pm.nodeOrder.filter((n) => pm.supports.has(n));
  const forceCount = (n: number) => { const s = pm.supports.get(n)!; return (s.ux ? 1 : 0) + (s.uz ? 1 : 0); };
  const O = [...supportIds].sort((a, b) => forceCount(b) - forceCount(a))[0];
  const oNode = pm.nodes.get(O)!;

  interface LinEq { label: Txt; name: Tex; coef: number[]; c: number; subst: Tex }
  const unkPos = (u: Unknown) => pm.nodes.get(u.node)!;
  /** Σ about (x0, z0) of a part's unknown reactions and loads. */
  const momentEq = (label: Txt, name: Tex, x0: number, z0: number, nodes: Set<number>, acts: Act[]): LinEq => {
    const coef = unknowns.map((u) => {
      if (!nodes.has(u.node)) return 0;
      const p = unkPos(u);
      return u.comp === 'x' ? -(p.z - z0) : u.comp === 'z' ? p.x - x0 : 1;
    });
    const cst = acts.reduce((s, a) => s + momentAbout(a, x0, z0), 0);
    const rt = unknowns.map((u, k) => (Math.abs(coef[k]) < 1e-12 ? '' : `${coef[k] < 0 ? '-' : '+'} ${Math.abs(Math.abs(coef[k]) - 1) < 1e-12 ? '' : `${num(Math.abs(coef[k]))}\\,`}${u.tex}`)).filter(Boolean);
    const lt = acts.flatMap((a) => momentTerms(a, x0, z0));
    return { label, name, coef, c: cst, subst: wrapA(`${joinTerms([...rt, ...lt], 8)} = 0`) };
  };
  const forceEq = (dir: 'x' | 'z'): LinEq => {
    const coef = unknowns.map((u) => (u.comp === dir ? 1 : 0));
    const vals = loadActs.map((a) => (dir === 'x' ? a.fx : a.fz)).filter((v) => Math.abs(v) > 1e-12);
    const rt = unknowns.filter((u) => u.comp === dir).map((u) => `+ ${u.tex}`);
    return {
      label: tx(dir === 'x' ? 'steps.cuts.reac.eqFx' : 'steps.cuts.reac.eqFz'), name: dir === 'x' ? '\\sum F_X = 0' : '\\sum F_Z = 0',
      coef, c: vals.reduce((s, v) => s + v, 0), subst: wrapA(`${joinTerms([...rt, ...vals.map((v) => `+ ${par(v)}`)], 10)} = 0`),
    };
  };
  const linTex = (coef: number[], cst: number) => {
    const t = unknowns.map((u, k) => (Math.abs(coef[k]) < 1e-12 ? '' : `${coef[k] < 0 ? '-' : '+'} ${Math.abs(Math.abs(coef[k]) - 1) < 1e-12 ? '' : `${num(Math.abs(coef[k]))}\\,`}${u.tex}`)).filter(Boolean);
    if (Math.abs(cst) > 1e-12 * Ms || t.length === 0) t.push(`${cst < 0 ? '-' : '+'} ${num(Math.abs(cst))}`);
    return `${joinTerms(t)} = 0`;
  };
  const unitOf = (u: Unknown) => (u.comp === 'm' ? UM : UF);

  let reacMode: 'statics' | 'indeterminate' | 'loop' = gh > 0 ? 'indeterminate' : 'statics';
  if (reacMode === 'statics') {
    const eqs: LinEq[] = [forceEq('x'), forceEq('z'),
      momentEq(tx('steps.cuts.reac.eqM', { n: oNode.name }), `\\sum M_{${nm(oNode.name)}} = 0`, oNode.x, oNode.z, allNodes, loadActs)];
    // One equation per internal hinge condition: M = 0 at the hinge, from the part on one side.
    for (const [n, ci] of [...sd.nodeConditions.entries()].sort((a, b) => a[0] - b[0])) {
      const ends = pm.memberOrder.map((id) => pm.members.get(id)!).filter((m) => (m.i === n && m.hingeI) || (m.j === n && m.hingeJ)).slice(0, ci);
      const hn = pm.nodes.get(n)!;
      for (const m of ends) {
        const far = m.i === n ? m.j : m.i;
        const beyond = component(pm, far, m.id);
        // Inside a closed ring the cut does not split the structure: that condition is internal to the ring.
        if (beyond.has(n)) continue;
        const sideA: Part = { nodes: beyond, members: new Set([m.id, ...pm.memberOrder.filter((id) => { const mm = pm.members.get(id)!; return id !== m.id && beyond.has(mm.i) && beyond.has(mm.j); })]) };
        const near = component(pm, n, m.id);
        const sideB: Part = { nodes: near, members: new Set(pm.memberOrder.filter((id) => { const mm = pm.members.get(id)!; return id !== m.id && near.has(mm.i) && near.has(mm.j); })) };
        const unk = (p: Part) => unknowns.filter((u) => p.nodes.has(u.node)).length;
        const side = unk(sideB) < unk(sideA) ? sideB : sideA;
        const bars = pm.memberOrder.filter((q) => side.members.has(q)).map((q) => pm.members.get(q)!.name);
        const label = bars.length ? tx('steps.cuts.reac.eqHinge', { n: hn.name, m: m.name, list: bars.join(', ') }) : tx('steps.cuts.reac.eqHingeNode', { n: hn.name, m: m.name });
        eqs.push(momentEq(label, `M_{${nm(hn.name)}} = 0`, hn.x, hn.z, side.nodes, partLoads(pm, side, loadsBy)));
      }
    }
    if (eqs.length !== unknowns.length) reacMode = 'loop';
    else {
      solved = solveLinear(eqs.map((e) => e.coef), eqs.map((e) => -e.c));
      if (!solved) reacMode = 'loop';
    }
    if (solved) {
      const sol = solved;
      reacBlocks.push({ kind: 'p', text: tx(eqs.length > 3 ? 'steps.cuts.reac.determinateHinges' : 'steps.cuts.reac.determinate', { r: unknowns.length, c: eqs.length - 3 }) });
      const unkSk = structureSketch(pm, loadsBy);
      for (const u of unknowns) {
        const p = unkPos(u);
        if (u.comp === 'm') unkSk.couples!.push({ x: p.x, z: p.z, m: 1, label: u.text, color: 'unknown', dashed: true });
        else unkSk.forces!.push({ x: p.x, z: p.z, fx: u.comp === 'x' ? 1 : 0, fz: u.comp === 'z' ? 1 : 0, label: u.text, color: 'unknown', dashed: true });
      }
      reacBlocks.push({ kind: 'fig', sketch: unkSk, caption: tx('steps.cuts.reac.unknownsCaption') });
      reacBlocks.push(...loadTable(pm, loadsBy));
      reacBlocks.push({ kind: 'p', text: tx('steps.cuts.reac.eqIntro') });
      eqs.forEach((e, k) => {
        reacBlocks.push({ kind: 'calc', label: e.label, formula: `(${k + 1})\\quad ${e.name}`, subst: e.subst, result: linTex(e.coef, e.c) });
      });
      // Solve one unknown at a time while an equation has only one left; the rest together.
      const known = new Map<number, number>();
      const used = new Set<number>();
      const solveBlocks: Block[] = [];
      for (;;) {
        const k = eqs.findIndex((e, q) => !used.has(q) && e.coef.filter((v, u) => Math.abs(v) > 1e-12 && !known.has(u)).length === 1);
        if (k < 0) break;
        used.add(k);
        const e = eqs[k];
        const u = e.coef.findIndex((v, q) => Math.abs(v) > 1e-12 && !known.has(q));
        const cst = e.c + e.coef.reduce((s, v, q) => s + (known.has(q) ? v * known.get(q)! : 0), 0);
        const coef = e.coef.map((v, q) => (q === u ? v : 0));
        const val = -cst / e.coef[u];
        known.set(u, val);
        const withKnown = e.coef.some((v, q) => q !== u && Math.abs(v) > 1e-12);
        solveBlocks.push({
          kind: 'calc', label: tx(withKnown ? 'steps.cuts.reac.fromEqKnown' : 'steps.cuts.reac.fromEq', { k: k + 1 }),
          formula: linTex(coef, cst), result: `\\boxed{${unknowns[u].tex} = ${num(val)}\\ ${unitOf(unknowns[u])}}`,
        });
      }
      if (known.size < unknowns.length) {
        const rest = eqs.map((_, q) => q).filter((q) => !used.has(q));
        const lines = rest.map((q) => {
          const e = eqs[q];
          const cst = e.c + e.coef.reduce((s, v, u) => s + (known.has(u) ? v * known.get(u)! : 0), 0);
          return linTex(e.coef.map((v, u) => (known.has(u) ? 0 : v)), cst);
        });
        const free = unknowns.map((_, u) => u).filter((u) => !known.has(u));
        solveBlocks.push({ kind: 'p', text: tx('steps.cuts.reac.coupled', { n: free.length }) });
        solveBlocks.push({
          kind: 'calc', formula: `\\begin{cases} ${lines.join(' \\\\ ')} \\end{cases}`,
          result: free.map((u) => `\\boxed{${unknowns[u].tex} = ${num(sol[u])}\\ ${unitOf(unknowns[u])}}`).join(',\\quad '),
        });
        for (const u of free) known.set(u, sol[u]);
      }
      // A check: the moment about another point, with every reaction in.
      const other = supportIds.find((n) => n !== O) ?? pm.nodeOrder.reduce((best, n) => {
        const p = pm.nodes.get(n)!, b = pm.nodes.get(best)!;
        return Math.hypot(p.x - oNode.x, p.z - oNode.z) > Math.hypot(b.x - oNode.x, b.z - oNode.z) ? n : best;
      }, O);
      if (other !== O) {
        const on = pm.nodes.get(other)!;
        const acts = [...loadActs, ...unknowns.map((u, q): Act => {
          const p = unkPos(u); const v = known.get(q)!;
          return { x: p.x, z: p.z, fx: u.comp === 'x' ? v : 0, fz: u.comp === 'z' ? v : 0, m: u.comp === 'm' ? v : 0 };
        })];
        const total = acts.reduce((s, a) => s + momentAbout(a, on.x, on.z), 0);
        solveBlocks.push({
          kind: 'calc', label: tx('steps.cuts.reac.check', { n: on.name }), formula: `\\sum M_{${nm(on.name)}} = 0`,
          subst: wrapA(joinTerms(acts.flatMap((a) => momentTerms(a, on.x, on.z)), 8)), result: `\\sum M_{${nm(on.name)}} = ${nM(total)}`, check: `${nM(total)} = 0\\ \\checkmark`,
        });
      }
      reacBlocks.push({ kind: 'sub', title: tx('steps.cuts.reac.solve'), blocks: solveBlocks });
    }
  }

  const reactions = new Map<number, { rx: number; rz: number; my: number }>();
  if (solved) {
    for (const n of supportIds) reactions.set(n, { rx: 0, rz: 0, my: 0 });
    unknowns.forEach((u, q) => { const rr = reactions.get(u.node)!; if (u.comp === 'x') rr.rx = solved![q]; else if (u.comp === 'z') rr.rz = solved![q]; else rr.my = solved![q]; });
  } else {
    for (const n of supportIds) { const rr = ref.reactions.get(n) ?? { rx: 0, rz: 0, my: 0 }; reactions.set(n, { rx: rr.rx, rz: rr.rz, my: rr.my }); }
    reacBlocks.push({ kind: 'p', text: reacMode === 'indeterminate' ? tx('steps.cuts.reac.indeterminate', { g: gh }) : tx('steps.cuts.reac.loop') });
    reacBlocks.push({ kind: 'p', text: tx('steps.cuts.reac.pointer'), detail: true });
    reacBlocks.push(...loadTable(pm, loadsBy));
  }
  reacBlocks.push({
    kind: 'table',
    head: [tx('steps.common.support'), { tex: `R_x\\ [${UF}]` }, { tex: `R_z\\ [${UF}]` }, { tex: `M\\ [${UM}]` }],
    rows: supportIds.map((n) => { const s = pm.supports.get(n)!; const rr = reactions.get(n)!; return [nameOf(n), s.ux ? snapF(rr.rx) : '—', s.uz ? snapF(rr.rz) : '—', s.ry ? snapM(rr.my) : '—']; }),
    caption: tx(solved ? 'steps.cuts.reac.tableCaption' : 'steps.cuts.reac.tableCaptionRef'),
  });
  if (!solved) {
    // The matrix reactions still have to balance the loads: shown as a check.
    const acts = [...loadActs, ...supportIds.map((n): Act => { const p = pm.nodes.get(n)!; const rr = reactions.get(n)!; return { x: p.x, z: p.z, fx: rr.rx, fz: rr.rz, m: rr.my }; })];
    const sx = acts.reduce((s, a) => s + a.fx, 0), sz = acts.reduce((s, a) => s + a.fz, 0), sm = acts.reduce((s, a) => s + momentAbout(a, oNode.x, oNode.z), 0);
    reacBlocks.push({
      kind: 'calc', label: tx('steps.cuts.reac.globalCheck', { n: oNode.name }),
      formula: `\\sum F_X = 0,\\quad \\sum F_Z = 0,\\quad \\sum M_{${nm(oNode.name)}} = 0`,
      subst: `\\begin{aligned} \\textstyle\\sum F_X &= ${joinTerms(acts.filter((a) => Math.abs(a.fx) > 1e-12).map((a) => `+ ${par(a.fx)}`), 10)} \\\\ \\textstyle\\sum F_Z &= ${joinTerms(acts.filter((a) => Math.abs(a.fz) > 1e-12).map((a) => `+ ${par(a.fz)}`), 10)} \\\\ \\textstyle\\sum M_{${nm(oNode.name)}} &= ${joinTerms(acts.flatMap((a) => momentTerms(a, oNode.x, oNode.z)), 6)} \\end{aligned}`,
      result: `\\sum F_X = ${nF(sx)},\\quad \\sum F_Z = ${nF(sz)},\\quad \\sum M_{${nm(oNode.name)}} = ${nM(sm)}`,
      check: '0 = 0\\ \\checkmark',
    });
  }
  return { step: { title: tx('steps.common.reactions'), blocks: reacBlocks }, reactions, solved, unknowns };
}

// ─── Step 3: forces at the start of each member ───────────────────

export function endForcesBlocks(S: CutsCtx, reactions: Reactions): { blocks: Block[]; ends: EndForces } {
  const { pm, ref, loadsBy, nameOf, tree, snapF, snapM, nF, nM, pF, pM } = S;
  const endBlocks: Block[] = [];
  const ends = new Map<number, { Ni: number; Vi: number; Mi: number }>();
  const reactionAct = (n: number): Act | null => {
    const rr = reactions.get(n);
    if (!rr) return null;
    const p = pm.nodes.get(n)!;
    return { x: p.x, z: p.z, fx: rr.rx, fz: rr.rz, m: rr.my };
  };
  if (tree) {
    endBlocks.push({ kind: 'p', text: tx('steps.cuts.end.intro') });
    endBlocks.push({ kind: 'p', text: tx('steps.cuts.end.why'), detail: true });
    for (const id of pm.memberOrder) {
      const m = pm.members.get(id)!;
      const ni = pm.nodes.get(m.i)!;
      const sI = component(pm, m.i, m.id), sJ = component(pm, m.j, m.id);
      const inner = (s: Set<number>) => new Set(pm.memberOrder.filter((q) => q !== m.id && s.has(pm.members.get(q)!.i) && s.has(pm.members.get(q)!.j)));
      const partI: Part = { nodes: sI, members: inner(sI) };
      const partJ: Part = { nodes: sJ, members: new Set([m.id, ...inner(sJ)]) };
      const actsOf = (p: Part) => [...partLoads(pm, p, loadsBy), ...[...p.nodes].map(reactionAct).filter((a): a is Act => a !== null)];
      const aI = actsOf(partI), aJ = actsOf(partJ);
      const useI = aI.length <= aJ.length;
      const acts = useI ? aI : aJ;
      const FX = acts.reduce((s, a) => s + a.fx, 0), FZ = acts.reduce((s, a) => s + a.fz, 0), MI = acts.reduce((s, a) => s + momentAbout(a, ni.x, ni.z), 0);
      const fxl = m.c * FX + m.s * FZ, fyl = -m.s * FX + m.c * FZ;
      const Ni = useI ? -fxl : fxl, Vi = useI ? fyl : -fyl, Mi = useI ? -MI : MI;
      ends.set(id, { Ni, Vi, Mi });
      const list = [...(useI ? sI : sJ)].sort((a, b) => a - b).map(nameOf).join(', ');
      const I = nm(ni.name);
      const fxT = acts.filter((a) => Math.abs(a.fx) > 1e-12).map((a) => `+ ${pF(a.fx)}`);
      const fzT = acts.filter((a) => Math.abs(a.fz) > 1e-12).map((a) => `+ ${pF(a.fz)}`);
      const mT = acts.flatMap((a) => momentTerms(a, ni.x, ni.z));
      const blocks: Block[] = [
        { kind: 'p', text: tx(useI ? 'steps.cuts.end.partI' : 'steps.cuts.end.partJ', { m: m.name, i: ni.name, j: nameOf(m.j), list }) },
        {
          kind: 'calc', label: tx('steps.cuts.end.resultant', { i: ni.name }),
          formula: `F_X = \\sum F_{X},\\quad F_Z = \\sum F_{Z},\\quad M_{${I}} = \\sum \\big[(x - x_{${I}})\\,F_Z - (z - z_{${I}})\\,F_X\\big] + \\sum C`,
          subst: `\\begin{aligned} F_X &= ${joinTerms(fxT, 8)} \\\\ F_Z &= ${joinTerms(fzT, 8)} \\\\ M_{${I}} &= ${joinTerms(mT, 6)} \\end{aligned}`,
          result: `F_X = ${nF(FX)}\\ ${UF},\\quad F_Z = ${nF(FZ)}\\ ${UF},\\quad M_{${I}} = ${nM(MI)}\\ ${UM}`,
        },
        {
          kind: 'calc', label: tx('steps.cuts.end.local'),
          formula: useI
            ? `N_i = -(F_X\\cos\\alpha + F_Z\\sin\\alpha),\\quad V_i = -F_X\\sin\\alpha + F_Z\\cos\\alpha,\\quad M_i = -M_{${I}}`
            : `N_i = F_X\\cos\\alpha + F_Z\\sin\\alpha,\\quad V_i = F_X\\sin\\alpha - F_Z\\cos\\alpha,\\quad M_i = M_{${I}}`,
          subst: useI
            ? `N_i = -\\big(${pF(FX)}\\cdot${par(m.c)} + ${pF(FZ)}\\cdot${par(m.s)}\\big),\\quad V_i = -${pF(FX)}\\cdot${par(m.s)} + ${pF(FZ)}\\cdot${par(m.c)},\\quad M_i = -${pM(MI)}`
            : `N_i = ${pF(FX)}\\cdot${par(m.c)} + ${pF(FZ)}\\cdot${par(m.s)},\\quad V_i = ${pF(FX)}\\cdot${par(m.s)} - ${pF(FZ)}\\cdot${par(m.c)},\\quad M_i = ${pM(MI)}`,
          result: `\\boxed{N_i = ${nF(Ni)}\\ ${UF}},\\quad \\boxed{V_i = ${nF(Vi)}\\ ${UF}},\\quad \\boxed{M_i = ${nM(Mi)}\\ ${UM}}`,
        },
      ];
      endBlocks.push({ kind: 'sub', title: tx('steps.cuts.member', { m: m.name }), blocks });
    }
  } else {
    endBlocks.push({ kind: 'p', text: tx('steps.cuts.end.fromRef') });
    for (const id of pm.memberOrder) {
      const sh = ref.endShears.get(id), mo = ref.endMoments.get(id);
      ends.set(id, { Ni: ref.axial.get(id) ?? 0, Vi: sh?.Vi ?? 0, Mi: -(mo?.Mi ?? 0) });
    }
  }
  endBlocks.push({
    kind: 'table',
    head: [tx('steps.common.member'), { tex: `N_i\\ [${UF}]` }, { tex: `V_i\\ [${UF}]` }, { tex: `M_i\\ [${UM}]` }],
    rows: pm.memberOrder.map((id) => { const e = ends.get(id)!; return [pm.members.get(id)!.name, snapF(e.Ni), snapF(e.Vi), snapM(e.Mi)]; }),
    caption: tx('steps.cuts.end.tableCaption'),
  });
  return { blocks: endBlocks, ends };
}

/** Joint equilibrium: the members' end forces on each joint, its loads and its reaction add up to zero. */
export function jointCheckBlocks(S: CutsCtx, ends: EndForces, reactions: Reactions): Block[] {
  const { pm, loadsBy, tree, nF, nM } = S;
  const endBlocks: Block[] = [];
    const rows: Cell[][] = [];
    for (const n of pm.nodeOrder) {
      const p = pm.nodes.get(n)!;
      let fx = 0, fz = 0, mm = 0, k = 0;
      for (const id of pm.memberOrder) {
        const m = pm.members.get(id)!;
        if (m.i !== n && m.j !== n) continue;
        k++;
        const cu = { ...ends.get(id)!, loads: loadsBy.get(id)! };
        // What the joint applies to the member at I, global.
        const gI = { fx: -cu.Ni * m.c - cu.Vi * m.s, fz: -cu.Ni * m.s + cu.Vi * m.c, m: -cu.Mi };
        const ni = pm.nodes.get(m.i)!, nj = pm.nodes.get(m.j)!;
        let g = gI;
        if (m.j === n) {
          // At J, from the member's own equilibrium: minus the I end and every load on it.
          const acts = [{ x: ni.x, z: ni.z, ...gI }, ...cu.loads.map((l) => actOf(pm, m, l))];
          g = { fx: -acts.reduce((s, a) => s + a.fx, 0), fz: -acts.reduce((s, a) => s + a.fz, 0), m: -acts.reduce((s, a) => s + momentAbout(a, nj.x, nj.z), 0) };
        }
        // The member pushes on the joint with the opposite of what the joint applies to it.
        fx -= g.fx; fz -= g.fz; mm -= g.m;
      }
      const nl = pm.nodalLoads.filter((l) => l.node === n);
      for (const l of nl) { fx += l.fx; fz += l.fz; mm += l.my; }
      const rr = reactions.get(n);
      if (rr) { fx += rr.rx; fz += rr.rz; mm += rr.my; }
      if (k === 0) continue;
      rows.push([p.name, k, { tex: nF(fx) }, { tex: nF(fz) }, { tex: nM(mm) }]);
    }
    endBlocks.push({ kind: 'p', text: tx(tree ? 'steps.cuts.joint.check' : 'steps.cuts.joint.checkRef') });
    endBlocks.push({
      kind: 'table',
      head: [tx('steps.common.joint'), tx('steps.cuts.joint.members'), { tex: `\\sum F_X\\ [${UF}]` }, { tex: `\\sum F_Z\\ [${UF}]` }, { tex: `\\sum M\\ [${UM}]` }],
      rows, caption: tx('steps.cuts.joint.caption'),
    });
  return endBlocks;
}

/** The loads as resultants in global axes: what the equilibrium equations add up. */
export function loadTable(pm: PlaneModel, loadsBy: Map<number, LocalLoad[]>): Block[] {
  const rows: Cell[][] = [];
  const clean = (v: number) => (Math.abs(v) < 1e-12 ? 0 : v);
  for (const l of pm.nodalLoads) {
    const n = pm.nodes.get(l.node);
    if (!n || (Math.abs(l.fx) < 1e-12 && Math.abs(l.fz) < 1e-12 && Math.abs(l.my) < 1e-12)) continue;
    rows.push([tx('steps.cuts.load.nodal', { n: n.name }), clean(n.x), clean(n.z), clean(l.fx), clean(l.fz), clean(l.my)]);
  }
  for (const id of pm.memberOrder) {
    const m = pm.members.get(id)!;
    for (const l of loadsBy.get(id) ?? []) {
      const a = actOf(pm, m, l);
      const key = l.kind === 'dist' ? 'steps.cuts.load.dist' : l.kind === 'C' ? 'steps.cuts.load.couple' : 'steps.cuts.load.point';
      rows.push([tx(key, { m: m.name, k: l.k }), clean(a.x), clean(a.z), clean(a.fx), clean(a.fz), clean(a.m)]);
    }
  }
  if (rows.length === 0) return [{ kind: 'p', text: tx('steps.cuts.load.none') }];
  return [{
    kind: 'table',
    head: [tx('steps.common.loads'), { tex: `x\\ [${UL}]` }, { tex: `z\\ [${UL}]` }, { tex: `F_X\\ [${UF}]` }, { tex: `F_Z\\ [${UF}]` }, { tex: `C\\ [${UM}]` }],
    rows, caption: tx('steps.cuts.load.caption'),
  }];
}
