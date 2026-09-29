/** Castigliano's theorems: the second for the redundants of an indeterminate structure, the first for a displacement. */
import type { MethodContext } from './registry';
import type { Applicability, Block, Cell, CompareRow, Step, StepDoc, Txt } from './doc';
import { tx } from './doc';
import { num, numText, par } from './format';
import type { PlaneModel } from './plane-model';
import type { Sketch, SketchSupport } from './sketch';
import { solveReference } from './reference';
import type { SolverInput } from '../types';
import { countIndeterminacy } from '../force-method/primary';
import { solveForceMethod, ForceMethodError, FM_MAX_GH, type ForceMethodResult, type Redundant, type StateResult } from '../force-method/solve';
import {
  U, TOL, no, OK, p, texCell, mm, sq, baseApplies, intro, compareBlock, diagramOf, pickTarget,
  unitLoadInput, refAlong, memberWork, axialTable, endValuesTable, unitSketch, frameIds,
  structureSketch, bendingBlocks,
} from './deformation-common';

const fmCache = new WeakMap<SolverInput, ForceMethodResult | ForceMethodError | Error>();
function forceMethodOf(input: SolverInput): ForceMethodResult | ForceMethodError | Error {
  let r = fmCache.get(input);
  if (!r) {
    try { r = solveForceMethod(input); } catch (e) { r = e instanceof Error ? e : new Error(String(e)); }
    fmCache.set(input, r);
  }
  return r;
}

export function castiglianoApplies(ctx: MethodContext): Applicability {
  const base = baseApplies(ctx, false);
  if (!base.ok) return base;
  const gh = countIndeterminacy(ctx.input).gh;
  if (gh < 0) return no('fm.err.hypostatic');
  if (gh > FM_MAX_GH) return no('fm.err.tooHyperstatic', { gh, max: FM_MAX_GH });
  if (gh > 0) {
    const r = forceMethodOf(ctx.input);
    if (r instanceof ForceMethodError) return no(`fm.err.${r.key}`, { gh: r.gh, max: FM_MAX_GH });
    if (r instanceof Error) return no('steps.req.unstable');
  }
  return OK;
}

function redundantText(r: Redundant, pm: PlaneModel): Txt {
  const n = pm.nodes.get(r.nodeId)?.name ?? String(r.nodeId);
  const m = r.elementId !== undefined ? pm.members.get(r.elementId)?.name ?? String(r.elementId) : '';
  if (r.kind === 'reaction') return tx(`steps.m.castigliano.red.reaction${r.component ?? 1}`, { n });
  if (r.kind === 'barForce') return tx('steps.m.castigliano.red.bar', { m });
  return tx(`steps.m.castigliano.red.${r.kind}`, { n, m });
}
const redundantUnit = (r: Redundant) => ((r.kind === 'reaction' && r.component === 2) || r.kind === 'cutM' ? U.kNm : U.kN);

/** The primary structure: the released supports, the cut members, the redundants drawn on it. */
function primarySketch(pm: PlaneModel, fm: ForceMethodResult): Sketch {
  const nameAt = (x: number, z: number) => [...pm.nodes.values()].find((q) => Math.abs(q.x - x) < TOL && Math.abs(q.z - z) < TOL)?.name ?? '';
  const nodes = fm.primary.nodes.map((q) => ({ id: q.id, x: q.x, z: q.z, label: pm.nodes.has(q.id) ? pm.nodes.get(q.id)!.name : `${nameAt(q.x, q.z)}′` }));
  const members = fm.primary.elements.map((e) => ({ id: e.id, i: e.nodeI, j: e.nodeJ }));
  const supports: NonNullable<Sketch['supports']> = [];
  for (const s of fm.primary.supports) {
    const [ux, uz, ry] = s.restrained;
    const type: SketchSupport | null = ux && uz && ry ? 'fixed' : ux && uz ? 'pinned' : uz ? 'roller' : ux ? 'rollerV' : null;
    if (type) supports.push({ node: s.nodeId, type });
  }
  const hinges: NonNullable<Sketch['hinges']> = [];
  for (const e of fm.primary.elements) {
    if (e.hingeStart) hinges.push({ node: e.nodeI, member: e.id });
    if (e.hingeEnd) hinges.push({ node: e.nodeJ, member: e.id });
  }
  const forces: NonNullable<Sketch['forces']> = [];
  const couples: NonNullable<Sketch['couples']> = [];
  const labels: NonNullable<Sketch['labels']> = [];
  const cutLabels = new Map<number, string[]>();
  for (const r of fm.redundants) {
    const n = pm.nodes.get(r.nodeId);
    if (!n) continue;
    const X = `X${r.index}`;
    if (r.kind === 'reaction') {
      if (r.component === 2) couples.push({ x: n.x, z: n.z, m: 1, label: X, color: 'unknown', dashed: true });
      else forces.push({ x: n.x, z: n.z, fx: r.component === 0 ? 1 : 0, fz: r.component === 1 ? 1 : 0, label: X, color: 'unknown', dashed: true });
    } else {
      const l = cutLabels.get(r.nodeId) ?? [];
      l.push(X);
      cutLabels.set(r.nodeId, l);
    }
  }
  for (const [id, l] of cutLabels) { const n = pm.nodes.get(id)!; labels.push({ x: n.x, z: n.z, text: l.join(', '), color: 'unknown', anchor: 'ne' }); }
  return { nodes, members, supports, hinges, forces, couples, labels, dims: 'auto' };
}

/** A state's M diagram (sagging positive) on a geometry. */
function stateDiagram(st: StateResult, color: 'moment' | 'unknown', unit: string): NonNullable<Sketch['diagram']> {
  return {
    color, marks: true, unit,
    members: st.bars.filter((b) => b.samples.length > 1).map((b) => ({ member: b.elementId, values: b.samples.map((s): [number, number] => [b.L > 0 ? s.x / b.L : 0, -s.m]) })),
  };
}

/** A state's moments at a member's two ends, with round-off against the state's largest moment read as zero. */
const endsOf = (st: StateResult, id: number) => {
  const b = st.bars.find((q) => q.elementId === id);
  if (!b || !b.samples.length) return { a: 0, b: 0 };
  let big = 0;
  for (const q of st.bars) for (const x of q.samples) big = Math.max(big, Math.abs(x.m));
  const clean = (v: number) => (Math.abs(v) <= 1e-9 * big ? 0 : v);
  return { a: clean(b.samples[0].m), b: clean(b.samples[b.samples.length - 1].m) };
};

export function buildCastigliano(ctx: MethodContext): StepDoc {
  const gh = countIndeterminacy(ctx.input).gh;
  return gh > 0 ? buildCastiglianoSecond(ctx) : buildCastiglianoFirst(ctx);
}

function buildCastiglianoSecond(ctx: MethodContext): StepDoc {
  const { pm } = ctx;
  const ref = ctx.ref!;
  const fm = forceMethodOf(ctx.input) as ForceMethodResult;
  const n = fm.redundants.length;
  const c = fm.count;
  const steps: Step[] = [];
  const Xs = fm.redundants.map((r) => `X_{${r.index}}`);

  steps.push({
    title: tx('steps.m.castigliano.s1'),
    blocks: [
      p('steps.m.castigliano.ghLead'),
      { kind: 'calc', label: tx('steps.common.classification'), formula: 'GH = r + b - e',
        subst: `GH = ${c.reactions + c.springs} + ${c.barUnknowns} - ${c.equations}`, result: `\\boxed{GH = ${c.gh}}` },
      p('steps.m.castigliano.ghWhy', undefined, true),
    ],
  });

  steps.push({
    title: tx('steps.m.castigliano.s2'),
    blocks: [
      p('steps.m.castigliano.redLead', { g: n }),
      { kind: 'table', head: [tx('steps.m.castigliano.redundant'), tx('steps.m.castigliano.meaning')], rows: fm.redundants.map((r, i) => [texCell(Xs[i]), redundantText(r, pm)]) },
      { kind: 'fig', sketch: primarySketch(pm, fm), caption: tx('steps.m.castigliano.primaryCaption') },
      p('steps.m.castigliano.redWhy', undefined, true),
    ],
  });

  const primaryBase = primarySketch(pm, fm);
  const stateFigs: Block[] = [
    { kind: 'fig', sketch: { ...primaryBase, forces: [], couples: [], labels: [], diagram: stateDiagram(fm.states[0], 'moment', 'kN·m') }, caption: tx('steps.m.castigliano.m0Caption') },
    ...fm.redundants.map((r, i): Block => ({ kind: 'fig', sketch: { ...primaryBase, forces: primaryBase.forces?.filter((f) => f.label === `X${r.index}`), couples: primaryBase.couples?.filter((f) => f.label === `X${r.index}`), labels: [], diagram: stateDiagram(fm.states[i + 1], 'unknown', '') }, caption: tx('steps.m.castigliano.mjCaption', { j: r.index }) })),
  ];
  steps.push({
    title: tx('steps.m.castigliano.s3'),
    blocks: [
      p('steps.m.castigliano.energyLead'),
      { kind: 'eq', tex: 'U = \\sum \\int_0^{L} \\frac{M^2}{2EI}\\,dx + \\sum \\int_0^{L} \\frac{N^2}{2EA}\\,dx' },
      { kind: 'eq', tex: `M = M_0 + ${Xs.map((x, i) => `${x}\\,m_{${i + 1}}`).join(' + ')}, \\qquad N = N_0 + ${Xs.map((x, i) => `${x}\\,n_{${i + 1}}`).join(' + ')}` },
      p('steps.m.castigliano.theorem'),
      { kind: 'eq', tex: `\\frac{\\partial U}{\\partial X_j} = \\sum \\int \\frac{M\\,m_j}{EI}\\,dx + \\sum \\int \\frac{N\\,n_j}{EA}\\,dx = \\delta_{j0} + \\sum_k \\delta_{jk}\\,X_k = 0` },
      { kind: 'eq', tex: '\\delta_{jk} = \\sum \\int \\frac{m_j\\,m_k}{EI}\\,dx + \\sum \\int \\frac{n_j\\,n_k}{EA}\\,dx, \\qquad \\delta_{j0} = \\sum \\int \\frac{m_j\\,M_0}{EI}\\,dx + \\sum \\int \\frac{n_j\\,N_0}{EA}\\,dx' },
      p('steps.m.castigliano.theoremWhy', undefined, true),
      p('steps.m.castigliano.axialIncluded', undefined, true),
      ...stateFigs,
    ],
  });

  // Coefficient integrals, per member.
  const ids = pm.memberOrder;
  const perMember = ids.length <= 6;
  const rowsOf = (label: string, terms: Array<{ elementId: number | null; source: string; value: number }>, total: number, check: number): Cell[] => {
    const vals: number[] = [];
    if (perMember) for (const id of ids) vals.push(terms.filter((q) => q.elementId === id).reduce((s, q) => s + q.value, 0));
    vals.push(terms.filter((q) => q.source === 'bending').reduce((s, q) => s + q.value, 0));
    vals.push(terms.filter((q) => q.source === 'axial').reduce((s, q) => s + q.value, 0));
    vals.push(total, check);
    // Round-off of a term that vanishes (a member the unit state does not bend) reads as zero.
    const big = Math.max(...vals.map(Math.abs));
    return [texCell(label), ...vals.map((v) => (Math.abs(v) <= 1e-10 * big ? 0 : v))];
  };
  const coefRows: Cell[][] = [];
  for (let j = 0; j < n; j++) for (let k = j; k < n; k++) coefRows.push(rowsOf(`\\delta_{${j + 1}${k + 1}}`, fm.deltaTerms[j][k], fm.delta[j][k], fm.deltaCheck[j][k]));
  for (let j = 0; j < n; j++) coefRows.push(rowsOf(`\\delta_{${j + 1}0}`, fm.delta0Terms[j], fm.delta0[j], fm.delta0Check[j]));
  const head: Cell[] = [tx('steps.m.castigliano.coefficient')];
  if (perMember) for (const id of ids) head.push(pm.members.get(id)!.name);
  head.push(tx('steps.m.castigliano.sumBending'), tx('steps.m.castigliano.sumAxial'), texCell('\\Sigma'), tx('steps.m.castigliano.primaryDisp'));

  // δ11 by the product table, as a worked example: every unit state is linear on each member.
  const d11 = ids.map((id) => {
    const m = pm.members.get(id)!;
    const e = endsOf(fm.states[1], id);
    return { m, a: e.a, b: e.b, v: (m.L * (e.a * e.a + e.a * e.b + e.b * e.b)) / (3 * m.EI) };
  }).filter((q) => Math.abs(q.a) + Math.abs(q.b) > 1e-12);
  const d11b = d11.reduce((s, q) => s + q.v, 0);
  const d11Bending = fm.deltaTerms[0][0].filter((q) => q.source === 'bending').reduce((s, q) => s + q.value, 0);
  steps.push({
    title: tx('steps.m.castigliano.s4'),
    blocks: [
      p('steps.m.castigliano.coefLead'),
      { kind: 'calc', label: tx('steps.m.castigliano.d11'), formula: '\\int_0^{L} \\frac{m_1^2}{EI}\\,dx = \\frac{L}{3EI}\\,(a^2 + a\\,b + b^2)',
        subst: d11.map((q) => `\\frac{${num(q.m.L)}}{3 \\cdot ${num(q.m.EI)}}\\big(${sq(q.a)} + ${par(q.a)} \\cdot ${par(q.b)} + ${sq(q.b)}\\big)`).join(' + ') || '0',
        result: `\\boxed{\\sum \\int \\frac{m_1^2}{EI}\\,dx = ${num(d11b)}}`, check: `\\text{Gauss: } ${num(d11Bending)}\\ \\checkmark` },
      p('steps.m.castigliano.d11Why', undefined, true),
      { kind: 'table', head, rows: coefRows, caption: tx('steps.m.castigliano.coefCaption') },
    ],
  });

  const mat = fm.delta.map((r) => r.map((v) => num(v)).join(' & ')).join(' \\\\ ');
  const boxedX = fm.redundants.map((r, i) => `\\boxed{${Xs[i]} = ${num(fm.X[i])}\\ ${redundantUnit(r)}}`).join(',\\quad ');
  steps.push({
    title: tx('steps.m.castigliano.s5'),
    blocks: [
      p('steps.m.castigliano.systemLead'),
      { kind: 'eq', tex: `\\begin{bmatrix} ${mat} \\end{bmatrix} \\begin{Bmatrix} ${Xs.join(' \\\\ ')} \\end{Bmatrix} = -\\begin{Bmatrix} ${fm.delta0.map((v) => num(v)).join(' \\\\ ')} \\end{Bmatrix}` },
      { kind: 'calc', label: tx('steps.m.castigliano.solve'), formula: '\\{X\\} = -[\\delta]^{-1}\\{\\delta_0\\}', result: boxedX,
        check: `\\max_j \\Big|\\delta_{j0} + \\sum_k \\delta_{jk} X_k\\Big| = ${num(Math.max(...fm.delta.map((r, j) => Math.abs(fm.delta0[j] + r.reduce((s, v, k) => s + v * fm.X[k], 0)))), 3)}\\ \\checkmark` },
      p('steps.m.castigliano.signWhy', undefined, true),
    ],
  });

  // Final end moments, counter-clockwise on the member: Mi = M(0), Mj = −M(L) in the force method's own sign.
  const finals = ids.map((id) => ({ id, m: pm.members.get(id)!, ...endsOf(fm.final, id) }));
  steps.push({
    title: tx('steps.m.castigliano.s6'),
    blocks: [
      p('steps.m.castigliano.finalLead'),
      { kind: 'eq', tex: `M = M_0 + ${fm.redundants.map((_, i) => `${par(fm.X[i])}\\,m_{${i + 1}}`).join(' + ')}` },
      { kind: 'table', head: [tx('steps.common.member'), texCell('M_{I}\\ [\\mathrm{kN\\,m}]'), texCell('M_{J}\\ [\\mathrm{kN\\,m}]')], rows: finals.map((f) => [f.m.name, f.a, -f.b]), caption: tx('steps.m.castigliano.finalCaption') },
      { kind: 'fig', sketch: { ...structureSketch(pm), diagram: stateDiagram(fm.final, 'moment', 'kN·m') }, caption: tx('steps.deformation.mCaption') },
    ],
  });

  const rows: CompareRow[] = [];
  fm.redundants.forEach((r, i) => {
    if (r.kind !== 'reaction') return;
    const R = ref.reactions.get(r.nodeId);
    if (!R) return;
    const nm = pm.nodes.get(r.nodeId)!.name;
    const [lab, v, unit] = r.component === 0 ? [`R_{x,${nm}}`, R.rx, 'kN'] : r.component === 1 ? [`R_{z,${nm}}`, R.rz, 'kN'] : [`M_{${nm}}`, R.my, 'kN·m'];
    rows.push({ label: `${Xs[i]} = ${lab}`, method: fm.X[i], matrix: v as number, unit: unit as string });
  });
  for (const f of finals) {
    const e = ref.endMoments.get(f.id);
    if (!e || f.m.truss) continue;
    const [ni, nj] = f.m.name.split('–');
    rows.push({ label: `M_{${ni}${nj}}`, method: f.a, matrix: e.Mi, unit: 'kN·m' });
    rows.push({ label: `M_{${nj}${ni}}`, method: -f.b, matrix: e.Mj, unit: 'kN·m' });
  }
  steps.push({ title: tx('steps.common.compare'), blocks: compareBlock(rows, tx('steps.deformation.exactNote')) });

  return {
    method: 'castigliano',
    title: tx('steps.m.castigliano.title'),
    subtitle: tx('steps.m.castigliano.subtitleSecond', { g: n }),
    intro: intro(ctx, tx('steps.m.castigliano.whatSecond'), 'steps.deformation.signs.frame', [], true),
    steps,
  };
}

function buildCastiglianoFirst(ctx: MethodContext): StepDoc {
  const { pm, input } = ctx;
  const ref = ctx.ref!;
  const tg = pickTarget(ctx);
  const virt = solveReference(unitLoadInput(input, tg));
  if (!virt) throw new Error('unit load case did not solve');
  const works = pm.memberOrder.map((id) => memberWork(pm, ref, virt, pm.members.get(id)!));
  const bend = works.reduce((s, w) => s + w.bending, 0);
  const ax = works.reduce((s, w) => s + w.axial, 0);
  const delta = bend + ax;
  const dirKey = tg.dir === 'x' ? 'steps.deformation.dir.x' : 'steps.deformation.dir.z';
  // A load already acting at the point, along the chosen direction and sense.
  const at = pm.nodalLoads.filter((l) => l.node === tg.node).reduce((s, l) => s + (tg.dir === 'x' ? l.fx : -l.fz), 0);
  const real = Math.abs(at) > 1e-12;
  const P = real ? 'P' : 'Q';
  const steps: Step[] = [];

  steps.push({
    title: tx('steps.m.castigliano.f1'),
    blocks: [
      p(tg.chosen ? 'steps.deformation.targetSelected' : 'steps.deformation.targetAuto', { n: tg.name }),
      { kind: 'note', tone: 'info', text: tx(dirKey, { n: tg.name }) },
      p('steps.deformation.targetHow', undefined, true),
      p(real ? 'steps.m.castigliano.realLoad' : 'steps.m.castigliano.dummy', { n: tg.name, P: numText(at) }),
      p('steps.m.castigliano.dummyWhy', undefined, true),
    ],
  });

  steps.push({
    title: tx('steps.m.castigliano.f2'),
    blocks: [
      p('steps.m.castigliano.energyFirst'),
      { kind: 'eq', tex: 'U = \\sum \\int_0^{L} \\frac{M^2}{2EI}\\,dx + \\sum \\int_0^{L} \\frac{N^2}{2EA}\\,dx' },
      { kind: 'eq', tex: `\\delta_{${tg.name}} = \\frac{\\partial U}{\\partial ${P}} = \\sum \\int \\frac{M}{EI}\\,\\frac{\\partial M}{\\partial ${P}}\\,dx + \\sum \\int \\frac{N}{EA}\\,\\frac{\\partial N}{\\partial ${P}}\\,dx${real ? '' : `\\;\\Big|_{Q = 0}`}` },
      p(real ? 'steps.m.castigliano.linearReal' : 'steps.m.castigliano.linearDummy'),
      { kind: 'eq', tex: `M = ${real ? "M_0' + P\\,m" : 'M_0 + Q\\,m'}, \\qquad \\frac{\\partial M}{\\partial ${P}} = m, \\qquad \\frac{\\partial N}{\\partial ${P}} = n` },
      { kind: 'fig', sketch: { ...structureSketch(pm), diagram: diagramOf(pm, frameIds(pm), (id, u) => ref.momentAt(id, u), 'moment', 'kN·m') }, caption: tx('steps.deformation.mCaption') },
      endValuesTable(pm, ref, { M: 'M', N: 'N' }, 'steps.deformation.realTableCaption'),
      { kind: 'fig', sketch: unitSketch(pm, tg, virt, '1'), caption: tx('steps.m.castigliano.mCaption', { P }) },
      endValuesTable(pm, virt, { M: 'm', N: 'n' }, 'steps.deformation.virtualTableCaption'),
    ],
  });

  steps.push({
    title: tx('steps.m.castigliano.f3'),
    blocks: [p('steps.deformation.integralLead'), ...bendingBlocks(works, 'm')],
  });

  steps.push({
    title: tx('steps.m.castigliano.f4'),
    blocks: [
      p('steps.deformation.axialLead'),
      axialTable(works, 'n'),
      ...(Math.abs(delta) > 1e-15 && Math.abs(ax) > 1e-12 * Math.abs(delta) ? [p('steps.deformation.axialShare', { pct: numText((100 * ax) / delta, 3) })] : []),
      { kind: 'calc', label: tx('steps.deformation.total'),
        formula: `\\delta_{${tg.name}} = \\frac{\\partial U}{\\partial ${P}} = \\sum \\int \\frac{M\\,m}{EI}\\,dx + \\sum \\frac{N\\,n\\,L}{EA}`,
        subst: `\\delta_{${tg.name}} = ${par(bend)} + ${par(ax)} = ${num(delta)}\\ ${U.m}`,
        result: `\\boxed{\\delta_{${tg.name}} = ${num(mm(delta))}\\ ${U.mm}}` },
      p(delta >= 0 ? 'steps.deformation.senseSame' : 'steps.deformation.senseOpposite'),
      ...compareBlock([{ label: `\\delta_{${tg.name}}`, method: mm(delta), matrix: mm(refAlong(ref, tg)), unit: 'mm' }], tx('steps.deformation.exactNote')),
    ],
  });

  return {
    method: 'castigliano',
    title: tx('steps.m.castigliano.title'),
    subtitle: tx('steps.m.castigliano.subtitleFirst'),
    intro: intro(ctx, tx('steps.m.castigliano.whatFirst'), 'steps.deformation.signs.frame', [], true),
    steps,
  };
}
