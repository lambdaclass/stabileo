/**
 * What the static and kinematic methods of plastic analysis share: when they
 * apply, the critical sections and their table, GH and the count of
 * independent mechanisms, the figures (a mechanism, a moment diagram) and the
 * virtual-work equation of a mechanism written out.
 */
import type { MethodContext } from './registry';
import type { Applicability, Block, Cell, Txt } from './doc';
import type { Sketch } from './sketch';
import { tx } from './doc';
import { num, numText } from './format';
import { structureSketch, memberTable } from './deformation-common';
import { countStaticDegree2D } from '../kinematic-2d';
import { memberPlasticMoments } from '../../actions/plastic';
import { solveLimit, type LimitSolution } from '../plastic/solve-limit';
import { limitModel, asMechanism, type LimitModel, type Mechanism, type Elementary, type Distribution } from '../plastic/limit';
import { workRow, dot } from '../plastic/kinematics';
import { checkPoints, momentAt } from '../plastic/sections';
import { plasticCollapse2D } from '../plastic-collapse';

export const MAX_SECTIONS = 20;
export const MAX_MECHANISMS = 10;

const no = (key: string, params?: Record<string, string | number>): Applicability => ({ ok: false, reason: tx(key, params) });

export function mpOfContext(ctx: MethodContext): (member: number) => number {
  const mp = memberPlasticMoments(ctx.input);
  return (id) => mp.get(id) ?? Infinity;
}

export function plasticApplies(ctx: MethodContext): Applicability {
  const { input, pm } = ctx;
  const frames = [...pm.members.values()].filter((m) => !m.truss);
  if (!frames.length) return no('course.plastic.req.frames');
  if ((input.constraints?.length ?? 0) > 0 || (input.connectors?.size ?? 0) > 0) return no('course.plastic.req.links');
  for (const s of pm.supports.values()) if (s.type === 'spring') return no('course.plastic.req.springs');
  if (input.loads.some((l) => l.type === 'pointOnElement' && Math.abs(l.data.my ?? 0) > 1e-12)) return no('course.plastic.req.couples');
  if (!input.loads.some((l) => l.type === 'nodal' || l.type === 'pointOnElement' || l.type === 'distributed')) return no('course.plastic.req.loads');
  if (!ctx.ref) return no('steps.req.unstable');
  const mp = mpOfContext(ctx);
  for (const m of frames) if (!(Number.isFinite(mp(m.id)) && mp(m.id) > 0)) return no('course.plastic.req.mp', { m: m.name });
  const lm = limitModel(input, mp);
  if (lm.N > MAX_SECTIONS) return no('course.plastic.req.size', { n: lm.N, max: MAX_SECTIONS });
  if (lm.m > MAX_MECHANISMS) return no('course.plastic.req.mechanisms', { n: lm.m, max: MAX_MECHANISMS });
  return { ok: true };
}

export interface PlasticCase {
  sol: LimitSolution | null;
  gh: ReturnType<typeof countStaticDegree2D>;
  mp: (member: number) => number;
  /** λc of the step-by-step analysis (bending only, as these methods), or null when it does not collapse. */
  incremental: number | null;
  incrementalResult: ReturnType<typeof plasticCollapse2D> | null;
}

export function solveCase(ctx: MethodContext): PlasticCase {
  const mp = mpOfContext(ctx);
  const sol = solveLimit(ctx.input, mp);
  let incrementalResult: PlasticCase['incrementalResult'] = null;
  try { incrementalResult = plasticCollapse2D(ctx.input, { mp, np: () => Infinity }); } catch { incrementalResult = null; }
  const incremental = incrementalResult?.isMechanism ? incrementalResult.collapseFactor : null;
  return { sol, gh: countStaticDegree2D(ctx.input), mp, incremental, incrementalResult };
}

/** The name of section k as the documents write it. */
export const secName = (k: number) => `${k + 1}`;

/** What section k is: where it is and why it is critical. */
export function sectionWhere(ctx: MethodContext, lm: LimitModel, k: number): Txt {
  const s = lm.sm.sections[k];
  const m = ctx.pm.members.get(s.member)!;
  const node = s.node !== undefined ? ctx.pm.nodes.get(s.node)?.name ?? '' : '';
  const x = numText(s.t * m.L);
  if (s.kind === 'support') return tx('course.plastic.sec.support', { node, member: m.name });
  if (s.kind === 'joint') {
    const shared = [...lm.sm.ends.values()].filter((l) => l?.section === k).length > 1;
    return tx(shared ? 'course.plastic.sec.joint' : 'course.plastic.sec.jointEnd', { node, member: m.name });
  }
  if (s.kind === 'point') return tx('course.plastic.sec.point', { member: m.name, x });
  if (s.kind === 'span') return tx('course.plastic.sec.span', { member: m.name, x });
  return tx('course.plastic.sec.user', { member: m.name, x });
}

export function introBlocks(ctx: MethodContext, what: string, mp: (m: number) => number): Block[] {
  const rows: Cell[][] = ctx.pm.memberOrder.filter((id) => !ctx.pm.members.get(id)!.truss).map((id) => [ctx.pm.members.get(id)!.name, mp(id)]);
  return [
    { kind: 'p', text: tx(what) },
    { kind: 'p', text: tx('course.plastic.doc.assumptions') },
    { kind: 'p', text: tx('course.plastic.doc.signs') },
    { kind: 'fig', sketch: structureSketch(ctx.pm), caption: tx('steps.common.structureCaption') },
    memberTable(ctx.pm, false),
    { kind: 'table', head: [tx('steps.common.member'), { tex: 'M_p\\ [\\mathrm{kN\\,m}]' }], rows, caption: tx('course.plastic.doc.mpCaption') },
    { kind: 'p', text: tx('steps.common.units') },
  ];
}

/** GH, the critical sections and m = N − GH: the first step of both methods. */
export function sectionsStep(ctx: MethodContext, pc: PlasticCase, lm: LimitModel): Block[] {
  const g = pc.gh;
  const ghBlocks: Block[] = [
    { kind: 'calc', label: tx('course.plastic.doc.gh'),
      formula: 'GH = 3m + r - 3n - c',
      subst: `GH = 3 \\cdot ${g.mFrame}${g.mTruss ? ` + ${g.mTruss}` : ''} + ${g.r} - 3 \\cdot ${g.nFrameNodes}${g.nTrussNodes ? ` - 2 \\cdot ${g.nTrussNodes}` : ''} - ${g.c}`,
      result: `\\boxed{GH = ${g.degree}}` },
  ];
  if (lm.sAxial > 0) ghBlocks.push({ kind: 'note', tone: 'info', text: tx('course.plastic.doc.axialRedundant', { s: lm.sAxial, gh: lm.ghF }) });
  const rows: Cell[][] = lm.sm.sections.map((s, k) => [secName(k), sectionWhere(ctx, lm, k), s.mp]);
  const ghF = lm.ghF;
  return [
    ...ghBlocks,
    { kind: 'p', text: tx('course.plastic.doc.sectionsLead') },
    { kind: 'fig', sketch: sectionsSketch(ctx, lm), caption: tx('course.plastic.doc.sectionsCaption') },
    { kind: 'table', head: [tx('course.plastic.doc.section'), tx('course.plastic.doc.where'), { tex: 'M_p\\ [\\mathrm{kN\\,m}]' }], rows },
    { kind: 'calc', label: tx('course.plastic.doc.independent'),
      formula: `m = N - GH${lm.sAxial > 0 ? '_{flex}' : ''}`,
      subst: `m = ${lm.N} - ${ghF}`,
      result: `\\boxed{m = ${lm.m}}` },
    { kind: 'p', text: tx('course.plastic.doc.independentWhy'), detail: true },
  ];
}

function baseSketch(ctx: MethodContext, faint = false): Sketch {
  const s = structureSketch(ctx.pm);
  return faint ? { ...s, members: s.members.map((m) => ({ ...m, style: 'faint' as const })), forces: s.forces, dims: undefined } : s;
}

/** Where section k sits, in model coordinates. */
export function sectionPoint(lm: LimitModel, k: number): { x: number; z: number } {
  const s = lm.sm.sections[k];
  const g = lm.km.geo.get(s.member)!;
  const t = s.t <= 1e-9 ? 0.1 : s.t >= 1 - 1e-9 ? 0.9 : s.t;
  return { x: g.a.x + (g.b.x - g.a.x) * t, z: g.a.z + (g.b.z - g.a.z) * t };
}

export function sectionsSketch(ctx: MethodContext, lm: LimitModel): Sketch {
  const s = baseSketch(ctx);
  return { ...s, dims: undefined, labels: lm.sm.sections.map((_, k) => ({ ...sectionPoint(lm, k), text: secName(k), color: 'accent' as const, anchor: 'n' as const })) };
}

/** A mechanism: the structure faint, the pieces moved (magnified), each hinge with its rotation as a multiple of θ. */
export function mechanismSketch(ctx: MethodContext, lm: LimitModel, mech: Mechanism): Sketch {
  const s = baseSketch(ctx, true);
  const km = lm.km, d = mech.d;
  const xs = km.points.map((p) => p.x), zs = km.points.map((p) => p.z);
  const size = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) || 1;
  let move = 0;
  km.points.forEach((_, p) => { move = Math.max(move, Math.hypot(d[2 * p] ?? 0, d[2 * p + 1] ?? 0)); });
  const sc = move > 0 ? (0.12 * size) / move : 0;
  const at = (p: number) => ({ x: km.points[p].x + sc * d[2 * p], z: km.points[p].z + sc * d[2 * p + 1] });
  const deformed = [...km.stations.values()].map((list) => ({ points: list.map((st) => at(st.p)), color: 'accent' as const }));
  const extraNodes: Sketch['nodes'] = [];
  const hinges: NonNullable<Sketch['hinges']> = [];
  const labels: NonNullable<Sketch['labels']> = [];
  mech.theta.forEach((th, k) => {
    if (th === 0) return;
    const sec = lm.sm.sections[k];
    const list = km.stations.get(sec.member)!;
    const st = list.find((x) => Math.abs(x.t - sec.t) < 1e-7)!;
    const near = sec.t <= 1e-9 ? list[1] : sec.t >= 1 - 1e-9 ? list[list.length - 2] : st;
    const a = at(st.p), b = at(near.p);
    const f = st === near ? 0 : 0.12;
    const pos = { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f };
    const id = 100000 + k;
    extraNodes.push({ id, ...pos });
    hinges.push({ node: id });
    const v = Math.abs(th);
    labels.push({ ...pos, text: `${Math.abs(v - 1) < 1e-9 ? '' : numText(v, 3)}θ`, color: 'moment', anchor: 'ne' });
  });
  return { ...s, nodes: [...s.nodes, ...extraNodes], hinges: [...(s.hinges ?? []), ...hinges], labels, deformed };
}

/** The moment diagram of a distribution along every frame member. */
export function momentSketch(ctx: MethodContext, lm: LimitModel, M: number[], lambda: number): Sketch {
  const s = baseSketch(ctx);
  const members = [...lm.sm.members.keys()].map((member) => ({
    member, values: checkPoints(lm.sm, member, 16).map((t) => [t, momentAt(lm.sm, member, t, M, lambda)] as [number, number]),
  }));
  return { ...s, dims: undefined, spanLoads: [], forces: [], couples: [], diagram: { color: 'moment', marks: true, unit: 'kN·m', members } };
}

/** The name of an elementary mechanism. */
export function elementaryName(ctx: MethodContext, e: Elementary, k: number, all: Elementary[]): Txt {
  const n = k + 1;
  if (e.kind === 'beam') return tx('course.plastic.el.beam', { n, member: ctx.pm.members.get(e.member!)!.name });
  if (e.kind === 'joint') return tx('course.plastic.el.joint', { n, node: ctx.pm.nodes.get(e.node!)!.name });
  const i = all.filter((x, j) => x.kind === e.kind && j <= k).length;
  return tx(e.kind === 'sway' ? 'course.plastic.el.sway' : 'course.plastic.el.basic', { n, k: i });
}

/** Σ Mp|θ| = λ Σ P·δ written out for a mechanism, with the work of every load. */
export function virtualWorkBlocks(ctx: MethodContext, lm: LimitModel, mech: Mechanism, symbol: string): Block[] {
  const terms = mech.theta.map((th, k) => ({ th, k })).filter((x) => x.th !== 0);
  const inner = terms.map(({ th, k }) => `${num(lm.sm.sections[k].mp)} \\cdot ${num(Math.abs(th))}\\theta`).join(' + ') || '0';
  const rows: Cell[][] = [];
  for (const l of ctx.input.loads) {
    const w = dot(workRow(ctx.input, lm.km, [l]), mech.d);
    if (Math.abs(w) < 1e-12) continue;
    rows.push([loadName(ctx, l), { tex: `${num(w)}\\,\\theta` }]);
  }
  const lam = Number.isFinite(mech.lambda) ? mech.lambda : Infinity;
  return [
    { kind: 'table', head: [tx('course.plastic.doc.load'), { tex: 'P\\cdot\\delta\\ [\\mathrm{kN\\,m}]' }], rows, caption: tx('course.plastic.doc.workCaption') },
    { kind: 'calc', label: tx('course.plastic.doc.vw'),
      formula: '\\sum M_p\\,|\\theta_i| = \\lambda \\sum P\\,\\delta',
      subst: `${inner} = \\lambda \\cdot ${num(mech.W)}\\,\\theta`,
      result: Number.isFinite(lam) ? `\\boxed{${symbol} = \\frac{${num(mech.Wi)}}{${num(mech.W)}} = ${num(lam)}}` : `${symbol} \\to \\infty` },
  ];
}

function loadName(ctx: MethodContext, l: MethodContext['input']['loads'][number]): Txt {
  if (l.type === 'nodal') return tx('course.plastic.load.nodal', { node: ctx.pm.nodes.get(l.data.nodeId)?.name ?? '' });
  if (l.type === 'pointOnElement') return tx('course.plastic.load.point', { member: ctx.pm.members.get(l.data.elementId)?.name ?? '', x: numText(l.data.a) });
  if (l.type === 'distributed') return tx('course.plastic.load.dist', { member: ctx.pm.members.get(l.data.elementId)?.name ?? '' });
  return tx('course.plastic.load.other');
}

/** The equilibrium equation a mechanism gives: Σ θ_i M_i = λ W. */
export function equationTex(mech: Mechanism): string {
  let lhs = '';
  mech.theta.forEach((th, k) => {
    if (th === 0) return;
    const a = Math.abs(th);
    const coef = Math.abs(a - 1) < 1e-9 ? '' : num(a);
    lhs += `${lhs ? (th < 0 ? ' - ' : ' + ') : th < 0 ? '-' : ''}${coef}M_{${secName(k)}}`;
  });
  return `${lhs || '0'} = ${num(mech.W)}\\,\\lambda`;
}

/** Combinations of two elementary mechanisms that cancel the rotation of a hinge they share, and lower λ. */
export function pairCombinations(lm: LimitModel, els: Elementary[]): Array<{ i: number; j: number; alpha: number; removed: number; mech: Mechanism }> {
  const out: Array<{ i: number; j: number; alpha: number; removed: number; mech: Mechanism }> = [];
  for (let i = 0; i < els.length; i++) {
    for (let j = i + 1; j < els.length; j++) {
      const a = els[i].mech, b = els[j].mech;
      const shared = a.theta.findIndex((v, k) => v !== 0 && b.theta[k] !== 0);
      if (shared < 0) continue;
      const alpha = -a.theta[shared] / b.theta[shared];
      const mech = asMechanism(lm, a.d.map((v, k) => v + alpha * b.d[k]));
      if (!Number.isFinite(mech.lambda)) continue;
      if (mech.lambda < Math.min(a.lambda, b.lambda) - 1e-9 * mech.lambda) out.push({ i, j, alpha, removed: shared, mech });
    }
  }
  return out.sort((x, y) => x.mech.lambda - y.mech.lambda).slice(0, 8);
}

/** The moments of a distribution at its sections against Mp, and the verdict of the static theorem. */
export function momentCheckBlocks(ctx: MethodContext, lm: LimitModel, dist: Distribution): Block[] {
  const rows: Cell[][] = lm.sm.sections.map((sec, k) => [secName(k), dist.M[k], sec.mp, Math.abs(dist.M[k]) / sec.mp]);
  const ok = dist.ratio <= 1 + 1e-6;
  const w = dist.worst;
  return [
    { kind: 'table', head: [tx('course.plastic.doc.section'), { tex: 'M\\ [\\mathrm{kN\\,m}]' }, { tex: 'M_p' }, { tex: '|M|/M_p' }], rows },
    ...(w ? [{ kind: 'p', text: tx('course.plastic.doc.peak', { ratio: numText(dist.ratio), member: ctx.pm.members.get(w.member)?.name ?? '', x: numText(w.t * (ctx.pm.members.get(w.member)?.L ?? 0)) }) } as Block] : []),
    ok
      ? { kind: 'note', tone: 'ok', text: tx('course.plastic.doc.admissible', { lambda: numText(dist.lambda) }) }
      : { kind: 'note', tone: 'warn', text: tx('course.plastic.doc.notAdmissible', { ratio: numText(dist.ratio), lambda: numText(dist.lambda), lower: numText(dist.lambda / dist.ratio) }) },
  ];
}

/** This method's λc against the step-by-step analysis of the same model. */
export function compareBlocks(pc: PlasticCase, lambda: number): Block[] {
  if (pc.incremental === null) return [{ kind: 'note', tone: 'info', text: tx('course.plastic.doc.noIncremental') }];
  return [{ kind: 'compare', rows: [{ label: '\\lambda_c', method: lambda, matrix: pc.incremental, unit: '—' }], caption: tx('course.plastic.doc.compareNote') }];
}
