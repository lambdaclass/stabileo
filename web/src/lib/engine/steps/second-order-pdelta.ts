/**
 * Second-order analysis explained: the displacement method with every member's stiffness
 * depending on its axial force, solved by iteration. With the stability functions φ (exact for
 * a member of constant N) or with the geometric matrix (consistent, or the chord P/L).
 */
import type { MethodContext } from './registry';
import type { Block, Cell, CompareRow, Step, StepDoc } from './doc';
import { compareNoteFor, tx } from './doc';
import { num } from './format';
import type { SoSystem } from '../second-order/system';
import type { GeomMethod } from '../second-order/member-matrices';
import { iteratePDelta, memberEndForces, solveState, PDELTA_TOL } from '../second-order/pdelta';
import { teachingBuckling } from '../second-order/buckling';
import { refineInput, collapseResults } from '../second-order/refine';
import { firstModeB2 } from '../second-order/settings';
import { solvePDelta } from '../wasm-solver';
import {
  introBlocks, unknownsStep, axialTable, symbolicMatrix, memberMatrixBlocks, globalMatrixBlock, loadVector,
  unknownValues, unknownLabels, shapeSketch, momentRows, translationRows, referenceInput,
} from './second-order-common';

const P = 'course.second-order.doc';

/** The engine run each document closes against: the same matrix at n = 1, or many elements for φ. */
export const PHI_REFERENCE_N = 8;

export function buildPDeltaDoc(ctx: MethodContext, sys: SoSystem, id: string, method: GeomMethod): StepDoc {
  const run = iteratePDelta(sys, method);
  const lin = run.linear;
  const steps: Step[] = [unknownsStep(sys)];

  steps.push({
    title: tx(`${P}.first.title`),
    blocks: [
      { kind: 'p', text: tx(`${P}.first.what`) },
      globalMatrixBlock(sys, new Map(), 'none', '\\mathbf{K}_E', tx(`${P}.first.kCaption`)),
      { kind: 'matrix', name: '\\mathbf{F}', rows: loadVector(sys).map((v) => [v]), rowLabels: unknownLabels(sys).map((s) => s.replace('\\theta', 'θ').replace(/[{}]/g, '')), caption: tx(`${P}.first.fCaption`) },
      { kind: 'matrix', name: '\\mathbf{D}^{(0)}', rows: unknownValues(sys, lin.D).map((v) => [v]), caption: tx(`${P}.first.dCaption`) },
      axialTable(sys, lin.N, tx(sys.axialRigid ? `${P}.first.nRigid` : `${P}.first.nElastic`)),
    ],
  });

  const memberBlocks: Block[] = [...symbolicMatrix(method)];
  for (const m of sys.members) {
    if ((lin.N.get(m.id) ?? 0) === 0 && method !== 'none' && !m.truss) continue;
    memberBlocks.push({ kind: 'sub', title: tx(`${P}.memberTitle`, { name: m.name, N: num(lin.N.get(m.id) ?? 0) }), blocks: memberMatrixBlocks(sys, m, lin.N.get(m.id) ?? 0, method) });
  }
  memberBlocks.push({ kind: 'p', text: tx(`${P}.zeroN`), detail: true });
  steps.push({ title: tx(`${P}.members.title`), blocks: [{ kind: 'p', text: tx(`${P}.members.${method}`) }, ...memberBlocks] });

  const first = run.history[0];
  const D1 = first ? first.D : [];
  steps.push({
    title: tx(`${P}.assembly.title`),
    blocks: [
      { kind: 'p', text: tx(`${P}.assembly.what`) },
      globalMatrixBlock(sys, lin.N, method, '\\mathbf{K}(N^{(0)})', tx(`${P}.assembly.kCaption`)),
      { kind: 'eq', tex: '\\mathbf{K}(N^{(0)})\\,\\mathbf{D}^{(1)} = \\mathbf{F}' },
      { kind: 'matrix', name: '\\mathbf{D}^{(1)}', rows: (sys.rigid ? sys.rigid.indep.map((k) => D1[k]) : D1).map((v) => [v ?? 0]), caption: tx(`${P}.assembly.dCaption`) },
    ],
  });

  const compressed = sys.members.filter((m) => (lin.N.get(m.id) ?? 0) < 0).slice(0, 4);
  const lead = (() => {
    const v = unknownValues(sys, run.final.D);
    let k = 0;
    v.forEach((x, i) => { if (Math.abs(x) > Math.abs(v[k])) k = i; });
    return k;
  })();
  const leadLabel = unknownLabels(sys)[lead] ?? 'D';
  const leadDof = (sys.rigid ? sys.rigid.indep : sys.free.map((_, k) => k))[lead];
  const rows: Cell[][] = run.history.map((h) => [
    { tex: String(h.k) },
    ...compressed.map((m) => ({ tex: num(h.N.get(m.id) ?? 0) })),
    { tex: num(h.D[leadDof] ?? 0) },
    { tex: num(h.change, 3) },
  ]);
  steps.push({
    title: tx(`${P}.iter.title`),
    blocks: [
      { kind: 'p', text: tx(`${P}.iter.what`) },
      { kind: 'eq', tex: `\\frac{\\lVert \\mathbf{D}^{(k)} - \\mathbf{D}^{(k-1)} \\rVert}{\\lVert \\mathbf{D}^{(k)} \\rVert} < ${num(PDELTA_TOL)}` },
      { kind: 'table', head: [{ tex: 'k' }, ...compressed.map((m) => ({ tex: `N_{${m.name.replace('–', '')}}^{(k-1)}` })), { tex: leadLabel }, { tex: '\\lVert\\Delta\\mathbf{D}\\rVert / \\lVert\\mathbf{D}\\rVert' }], rows, caption: tx(`${P}.iter.caption`) },
      { kind: 'note', tone: run.converged && run.stable ? 'ok' : 'warn', text: run.converged && run.stable ? tx(`${P}.iter.converged`, { k: run.iterations }) : tx(`${P}.iter.notConverged`) },
      { kind: 'p', text: tx(`${P}.iter.why.${method}`), detail: true },
    ],
  });

  const ends = memberEndForces(sys, run.final, method, run.final.N);
  const linEnds = memberEndForces(sys, lin, 'none', new Map());
  const b = teachingBuckling(ctx.input, { method, axialRigid: sys.axialRigid }, 1);
  const lambda1 = b.ok ? b.run.modes[0].lambda : null;
  const resultRows: Cell[][] = unknownValues(sys, lin.D).map((d1, i) => {
    const d2 = unknownValues(sys, run.final.D)[i];
    return [{ tex: unknownLabels(sys)[i] }, { tex: num(d1) }, { tex: num(d2) }, { tex: Math.abs(d1) > 1e-12 ? num(d2 / d1) : '—' }];
  });
  const momentTable: Cell[][] = sys.members.filter((m) => !m.truss).map((m) => [m.name, { tex: num(linEnds.get(m.id)![2]) }, { tex: num(ends.get(m.id)![2]) }, { tex: num(linEnds.get(m.id)![5]) }, { tex: num(ends.get(m.id)![5]) }]);
  const resBlocks: Block[] = [
    { kind: 'table', head: ['', tx(`${P}.results.firstOrder`), tx(`${P}.results.secondOrder`), { tex: 'D_{II}/D_I' }], rows: resultRows, caption: tx(`${P}.results.dCaption`) },
    { kind: 'table', head: [tx('steps.common.member'), { tex: 'M_i^{I}' }, { tex: 'M_i^{II}' }, { tex: 'M_j^{I}' }, { tex: 'M_j^{II}' }], rows: momentTable, caption: tx(`${P}.results.mCaption`) },
    { kind: 'fig', sketch: shapeSketch(sys, run.final.D), caption: tx(`${P}.results.shape`) },
  ];
  if (lambda1 !== null && Number.isFinite(lambda1)) {
    resBlocks.push({ kind: 'calc', label: tx(`${P}.results.b2`), formula: 'B_2 = \\frac{1}{1 - 1/\\lambda_1}', subst: `B_2 = \\frac{1}{1 - 1/${num(lambda1)}}`, result: `\\boxed{B_2 = ${num(firstModeB2(lambda1))}}` });
    resBlocks.push({ kind: 'p', text: tx(`${P}.results.b2Why`), detail: true });
  }
  steps.push({ title: tx(`${P}.results.title`), blocks: resBlocks });

  steps.push(compareStep(ctx, sys, run.final.D, ends, method));

  return { method: id, title: tx(`steps.m.${id}.title`), subtitle: tx(`${P}.subtitle.${method}`), intro: introBlocks(sys, id), steps };
}

function compareStep(ctx: MethodContext, sys: SoSystem, D: number[], ends: Map<number, number[]>, method: GeomMethod): Step {
  const n = method === 'phi' ? PHI_REFERENCE_N : 1;
  const base = referenceInput(ctx.input, sys.axialRigid);
  const r = refineInput(base, n);
  let rows: CompareRow[] = [];
  try {
    const eng = solvePDelta(r.input, 100, PDELTA_TOL);
    const res = collapseResults(r, base, eng.results);
    const disp = new Map(res.displacements.map((d) => [d.nodeId, d]));
    const forces = new Map(res.elementForces.map((f) => [f.elementId, f]));
    rows = [...translationRows(sys, D, disp), ...momentRows(sys, ends, forces)];
  } catch {
    rows = [];
  }
  const blocks: Block[] = [];
  if (rows.length) blocks.push({ kind: 'compare', rows, caption: tx(`${P}.compare.caption.${method === 'phi' ? 'phi' : method === 'string' ? 'differs' : 'same'}`, { n }) });
  blocks.push({ kind: 'p', text: rows.length && method === 'consistent' ? compareNoteFor(rows) : tx(`${P}.compare.why.${method}`) });
  if (sys.axialRigid) blocks.push({ kind: 'p', text: tx(`${P}.compare.rigid`) });
  return { title: tx('steps.common.compare'), blocks };
}

/** First-order N is all the document needs to say whether there is anything to amplify. */
export function hasCompression(sys: SoSystem): boolean {
  const lin = solveState(sys, new Map(), 'none');
  return !!lin && [...lin.N.values()].some((n) => n < -1e-9);
}
