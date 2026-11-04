/**
 * The critical load explained: the multiple λ of the loads at which the structure stops
 * having a stiffness. With the stability functions, det K(λ) = 0 is searched along λ; with the
 * geometric matrix it is the eigenproblem (K_E + λK_G)·φ = 0. Then the modes, each member's
 * effective length, the Euler check of the textbook columns, and the engine beside it.
 */
import type { MethodContext } from './registry';
import type { Block, Cell, CompareRow, Step, StepDoc } from './doc';
import { tx } from './doc';
import { num } from './format';
import type { SoSystem } from '../second-order/system';
import { linearBuckling, phiBuckling, determinantCurve, firstOrderAxial, type TeachingMode } from '../second-order/buckling';
import { memberStiffness } from '../second-order/member-matrices';
import { refineInput } from '../second-order/refine';
import { solveBuckling } from '../wasm-solver';
import type { Sketch } from './sketch';
import {
  introBlocks, unknownsStep, axialTable, symbolicMatrix, memberMatrixBlocks, globalMatrixBlock, shapeSketch, referenceInput,
} from './second-order-common';
import { PHI_REFERENCE_N } from './second-order-pdelta';

const P = 'course.second-order.doc';
const MODES = 3;

/** det K(λ)/det K(0) drawn on a compressed scale, sign kept: the root is where it crosses zero. */
function curveSketch(points: Array<{ lambda: number; sign: number; log10: number }>, roots: number[]): Sketch {
  const top = points[points.length - 1].lambda || 1;
  const W = 10, H = 2.5;
  const d0 = points[0].log10;
  const y = (p: { sign: number; log10: number }) => {
    if (p.sign === 0) return 0;
    const r = Math.min(3, Math.max(-3, p.log10 - d0));
    return (p.sign * Math.log10(1 + 10 ** r) * H) / Math.log10(1001);
  };
  const sk: Sketch = {
    nodes: [{ id: 1, x: 0, z: 0 }, { id: 2, x: W, z: 0 }],
    members: [{ id: 1, i: 1, j: 2, style: 'faint' }],
    deformed: [{ points: points.map((p) => ({ x: (p.lambda / top) * W, z: y(p) })), color: 'accent' }],
    labels: [
      { x: 0, z: 0, text: '0', anchor: 's' },
      { x: W, z: 0, text: `λ = ${num(top, 3)}`, anchor: 's' },
      ...roots.filter((r) => r <= top).map((r, k) => ({ x: (r / top) * W, z: 0, text: `λ${k + 1}`, anchor: 'n' as const, color: 'compression' as const })),
    ],
    height: 150,
  };
  return sk;
}

/** K of a single textbook column from its end restraints, or null when it is not one. */
function eulerK(sys: SoSystem): number | null {
  if (sys.members.length !== 1) return null;
  const m = sys.members[0];
  if (m.truss || m.hingeI || m.hingeJ) return null;
  const across = Math.abs(m.c) < 1e-9 ? 0 : Math.abs(m.s) < 1e-9 ? 1 : -1;
  if (across < 0) return null;
  const held = (node: number) => {
    const s = sys.pm.supports.get(node);
    const spring = (k?: number) => (k ?? 0) > 1e9;
    if (!s) return { t: false, r: false };
    return { t: across === 0 ? s.ux || spring(s.kx) : s.uz || spring(s.kz), r: s.ry || spring(s.kr) };
  };
  const a = held(m.i), b = held(m.j);
  const key = [a, b].map((e) => (e.t && e.r ? 'F' : e.t ? 'P' : e.r ? 'G' : '0')).sort().join('');
  return ({ PP: 1, '0F': 2, FP: 0.699, FF: 0.5, FG: 1 } as Record<string, number>)[key] ?? null;
}

export function buildBucklingDoc(ctx: MethodContext, sys: SoSystem, id: string, method: 'phi' | 'consistent' | 'string'): StepDoc {
  const first = firstOrderAxial(sys);
  if (!first.ok) throw new Error(first.reason.key);
  const N0 = first.N0;
  const est = linearBuckling(sys, 'consistent', MODES, N0);
  const modes: TeachingMode[] = method === 'phi' ? phiBuckling(sys, Math.min(MODES, Math.max(1, est.length)), N0, est.map((m) => m.lambda * 1.0001)) : linearBuckling(sys, method, MODES, N0);
  const steps: Step[] = [unknownsStep(sys)];
  steps.push({ title: tx(`${P}.bk.first.title`), blocks: [{ kind: 'p', text: tx(`${P}.bk.first.what`) }, axialTable(sys, N0, tx(`${P}.bk.first.caption`))] });

  const compressed = sys.members.filter((m) => (N0.get(m.id) ?? 0) < 0);
  const l1 = modes[0]?.lambda ?? NaN;
  if (method === 'phi') {
    const matBlocks: Block[] = [{ kind: 'p', text: tx(`${P}.bk.phi.what`) }, ...symbolicMatrix('phi'), { kind: 'eq', tex: '\\det \\mathbf{K}(\\lambda) = 0,\\qquad N_e = \\lambda\\,N_e^{(0)}' }];
    for (const m of compressed.slice(0, 4)) matBlocks.push({ kind: 'sub', title: tx(`${P}.bk.memberAt`, { name: m.name, lambda: num(l1) }), blocks: memberMatrixBlocks(sys, m, l1 * (N0.get(m.id) ?? 0), 'phi') });
    steps.push({ title: tx(`${P}.bk.phi.title`), blocks: matBlocks });
    const top = 1.3 * (modes[Math.min(1, modes.length - 1)]?.lambda ?? l1);
    const curve = determinantCurve(sys, N0, top, 48);
    const rows: Cell[][] = curve.filter((_, k) => k % 4 === 0).map((p) => [{ tex: num(p.lambda) }, { tex: p.sign === 0 ? '0' : p.sign > 0 ? '+' : '-' }, { tex: num(p.sign * 10 ** (p.log10 - curve[0].log10)) }]);
    steps.push({
      title: tx(`${P}.bk.det.title`),
      blocks: [
        { kind: 'p', text: tx(`${P}.bk.det.what`) },
        { kind: 'fig', sketch: curveSketch(curve, modes.map((m) => m.lambda)), caption: tx(`${P}.bk.det.caption`) },
        { kind: 'table', head: [{ tex: '\\lambda' }, tx(`${P}.bk.det.sign`), { tex: '\\det\\mathbf{K}(\\lambda)/\\det\\mathbf{K}(0)' }], rows },
        { kind: 'p', text: tx(`${P}.bk.det.count`), detail: true },
        { kind: 'calc', label: tx(`${P}.bk.det.root`), formula: '\\det\\mathbf{K}(\\lambda_1) = 0', result: `\\boxed{\\lambda_1 = ${num(l1, 6)}}` },
      ],
    });
  } else {
    const blocks: Block[] = [{ kind: 'p', text: tx(`${P}.bk.kg.what`) }, ...symbolicMatrix(method)];
    for (const m of compressed.slice(0, 4)) {
      const ms = memberStiffness(m, N0.get(m.id) ?? 0, method, !sys.axialRigid);
      const a = sys.pm.nodes.get(m.i)!.name, b = sys.pm.nodes.get(m.j)!.name;
      const labels = [`u_${a}`, `v_${a}`, `θ_${a}`, `u_${b}`, `v_${b}`, `θ_${b}`];
      blocks.push({ kind: 'sub', title: tx(`${P}.memberTitle`, { name: m.name, N: num(N0.get(m.id) ?? 0) }), blocks: [{ kind: 'matrix', name: `\\mathbf{k}_G^{(0)}`, rows: ms.kg, rowLabels: labels, colLabels: labels, caption: tx(`${P}.bk.kg.memberCaption`) }] });
    }
    const KE = globalMatrixBlock(sys, new Map(), 'none', '\\mathbf{K}_E', tx(`${P}.first.kCaption`));
    const KN = globalMatrixBlock(sys, N0, method, '\\mathbf{K}_E + \\mathbf{K}_G^{(0)}', tx(`${P}.bk.kg.sumCaption`));
    const KG = { ...KN, name: '\\mathbf{K}_G^{(0)}', rows: (KN as { rows: number[][] }).rows.map((r, i) => r.map((v, j) => v - (KE as { rows: number[][] }).rows[i][j])), caption: tx(`${P}.bk.kg.globalCaption`) } as Block;
    steps.push({ title: tx(`${P}.bk.kg.title`), blocks });
    steps.push({
      title: tx(`${P}.bk.eig.title`),
      blocks: [
        KE, KG,
        { kind: 'eq', tex: '\\left(\\mathbf{K}_E + \\lambda\\,\\mathbf{K}_G^{(0)}\\right)\\boldsymbol{\\phi} = \\mathbf{0}\\quad\\Rightarrow\\quad \\det\\left(\\mathbf{K}_E + \\lambda\\,\\mathbf{K}_G^{(0)}\\right) = 0', note: tx(`${P}.bk.eig.what`) },
        { kind: 'table', head: [tx(`${P}.bk.mode`), { tex: '\\lambda_i' }], rows: modes.map((m, k) => [{ tex: String(k + 1) }, { tex: num(m.lambda, 6) }]) },
      ],
    });
  }

  const modeBlocks: Block[] = [];
  modes.slice(0, 2).forEach((m, k) => modeBlocks.push({ kind: 'fig', sketch: shapeSketch(sys, m.D, k === 0 ? 'deformed' : 'accent'), caption: tx(`${P}.bk.modeCaption`, { k: k + 1, lambda: num(m.lambda) }) }));
  modeBlocks.push({ kind: 'table', head: [tx(`${P}.bk.mode`), { tex: '\\lambda_i' }], rows: modes.map((m, k) => [{ tex: String(k + 1) }, { tex: num(m.lambda, 6) }]) });
  steps.push({ title: tx(`${P}.bk.modes.title`), blocks: [{ kind: 'p', text: tx(`${P}.bk.modes.what`) }, ...modeBlocks] });

  const keffRows: Cell[][] = compressed.filter((m) => !m.truss).map((m) => {
    const n = N0.get(m.id) ?? 0;
    const pcr = l1 * Math.abs(n);
    const K = (Math.PI * Math.sqrt(m.EI / pcr)) / m.L;
    return [m.name, { tex: num(n) }, { tex: num(pcr) }, { tex: num(K) }, { tex: num(K * m.L) }];
  });
  const keffBlocks: Block[] = [
    { kind: 'eq', tex: 'P_{cr,e} = \\lambda_1\\,|N_e^{(0)}|,\\qquad K_e = \\frac{\\pi}{L_e}\\sqrt{\\frac{EI_e}{P_{cr,e}}}' },
    { kind: 'table', head: [tx('steps.common.member'), { tex: 'N^{(0)}' }, { tex: 'P_{cr}' }, { tex: 'K' }, { tex: 'KL\\ [\\mathrm{m}]' }], rows: keffRows },
    { kind: 'p', text: tx(`${P}.bk.keff.why`), detail: true },
  ];
  const K = eulerK(sys);
  if (K !== null) {
    const m = sys.members[0];
    const pe = (Math.PI ** 2 * m.EI) / (K * m.L) ** 2;
    keffBlocks.push({ kind: 'calc', label: tx(`${P}.bk.euler`, { K: num(K) }), formula: 'P_{cr} = \\frac{\\pi^2 EI}{(KL)^2}', subst: `P_{cr} = \\frac{\\pi^2 \\cdot ${num(m.EI)}}{(${num(K)} \\cdot ${num(m.L)})^2}`, result: `\\boxed{P_{cr} = ${num(pe)}\\ \\mathrm{kN}}`, check: `\\lambda_1 |N^{(0)}| = ${num(l1 * Math.abs(N0.get(m.id) ?? 0))}\\ \\mathrm{kN}` });
  }
  steps.push({ title: tx(`${P}.bk.keff.title`), blocks: keffBlocks });

  const phiL1 = method === 'phi' ? l1 : phiBuckling(sys, 1, N0, [est[0]?.lambda ?? l1].map((x) => x * 1.0001))[0]?.lambda ?? NaN;
  steps.push(compareStep({ ...ctx, input: referenceInput(ctx.input, sys.axialRigid) }, modes, method, phiL1, sys.axialRigid));
  return { method: id, title: tx(`steps.m.${id}.title`), subtitle: tx(`${P}.subtitle.${method}`), intro: introBlocks(sys, id), steps };
}

function engineFactors(input: MethodContext['input'], n: number, count: number): number[] {
  try { return solveBuckling(refineInput(input, n).input, count).modes.map((m: { loadFactor: number }) => m.loadFactor); } catch { return []; }
}

function compareStep(ctx: MethodContext, modes: TeachingMode[], method: 'phi' | 'consistent' | 'string', phiL1: number, rigid: boolean): Step {
  const n = method === 'phi' ? PHI_REFERENCE_N : 1;
  const eng = engineFactors(ctx.input, n, modes.length);
  const rows: CompareRow[] = (method === 'string' ? [] : modes).map((m, k) => ({ label: `\\lambda_${k + 1}`, method: m.lambda, matrix: eng[k] ?? NaN, unit: '' })).filter((r) => Number.isFinite(r.matrix));
  const conv: Cell[][] = [1, 2, 4, 8].map((k) => [{ tex: `n = ${k}` }, { tex: num(engineFactors(ctx.input, k, 1)[0] ?? NaN, 6) }]);
  return {
    title: tx('steps.common.compare'),
    blocks: [
      ...(rows.length ? [{ kind: 'compare' as const, rows, caption: tx(`${P}.bk.compare.${method}`, { n }) }] : [{ kind: 'p' as const, text: tx(`${P}.compare.why.string`) }]),
      ...(rigid ? [{ kind: 'p' as const, text: tx(`${P}.compare.rigid`) }] : []),
      { kind: 'table', head: [tx(`${P}.bk.compare.n`), { tex: '\\lambda_1' }], rows: [...conv, [tx(`${P}.bk.compare.phiRow`), { tex: num(phiL1, 6) }]], caption: tx(`${P}.bk.compare.convCaption`) },
      { kind: 'p', text: tx(`${P}.bk.compare.why`) },
    ],
  };
}
