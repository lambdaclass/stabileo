/**
 * What the second-order explained methods share: when they can be applied, the unknowns, the
 * first-order axial forces, each member's matrix with its axial force written symbolically and
 * then with numbers, the assembled K(N), and the closing comparison with the engine.
 *
 * The documents follow the displacement method of the course: the unknowns are the free
 * nodal displacements (or, with members that keep their length, the independent ones), and
 * the only change from first order is that each member's stiffness depends on its N.
 */
import type { MethodContext } from './registry';
import type { SolverInput } from '../types';
import type { Block, Cell, CompareRow, Step, Txt } from './doc';
import { tx } from './doc';
import { num, numText } from './format';
import { sketchOf, type Sketch } from './sketch';
import { loadedSketch } from './frames-common';
import { buildSystem, unsupported, type SoSystem } from '../second-order/system';
import { memberStiffness, type GeomMethod } from '../second-order/member-matrices';
import { reducedStiffness } from '../second-order/pdelta';
import type { PMember } from './plane-model';
import { computeDeformedShape } from '../diagrams';

export const DOC_MAX_UNKNOWNS = 12;
const P = 'course.second-order.doc';

export type SoReady = { ok: true; sys: SoSystem } | { ok: false; reason: Txt };

/** The model as the second-order documents can take it, with members kept at their length or not. */
export function readSecondOrder(ctx: MethodContext, method: GeomMethod, axialRigid: boolean): SoReady {
  const refusal = unsupported(ctx.input);
  if (refusal) return { ok: false, reason: refusal };
  if (ctx.input.loads.some((l) => l.type === 'pointOnElement' && Math.abs(l.data.px ?? 0) > 1e-12)) return { ok: false, reason: tx(`${P}.req.axialPoint`) };
  if (ctx.input.loads.some((l) => l.type === 'axialDistributed')) return { ok: false, reason: tx(`${P}.req.axialPoint`) };
  const b = buildSystem(ctx.input, { method, axialRigid });
  if (!b.ok) return b;
  const n = unknownCount(b.sys);
  if (n > DOC_MAX_UNKNOWNS) return { ok: false, reason: tx(`${P}.req.tooMany`, { n, max: DOC_MAX_UNKNOWNS }) };
  return b;
}

export const unknownCount = (sys: SoSystem) => (sys.rigid ? sys.rigid.indep.length : sys.free.length);

const nodeName = (sys: SoSystem, node: number) => sys.pm.nodes.get(node)!.name;
const KIND = ['u', 'v', '\\theta'];
const KIND_TEXT = ['u', 'v', 'θ'];

/** The DOF at global index d, in TeX: u_B, v_B, θ_B. */
export function dofTex(sys: SoSystem, d: number): string {
  const k = d % 3, node = sys.pm.nodeOrder[Math.floor(d / 3)];
  return `${KIND[k]}_{${nodeName(sys, node)}}`;
}

/** The unknowns the system is solved for, as global DOF indices. */
export const unknownDofs = (sys: SoSystem): number[] => (sys.rigid ? sys.rigid.indep.map((k) => sys.free[k]) : sys.free);

export const unknownLabels = (sys: SoSystem) => unknownDofs(sys).map((d) => dofTex(sys, d));

export function unknownsSketch(sys: SoSystem): Sketch {
  const sk = sketchOf(sys.pm);
  sk.dofs = unknownDofs(sys).map((d) => {
    const k = d % 3, node = sys.pm.nodeOrder[Math.floor(d / 3)];
    return { node, kind: (['ux', 'uz', 'ry'] as const)[k], label: `${KIND_TEXT[k]}${nodeName(sys, node)}`, color: 'dof' as const };
  });
  return sk;
}

export function introBlocks(sys: SoSystem, id: string): Block[] {
  const rows: Cell[][] = sys.members.map((m) => [m.name, { tex: num(m.L) }, { tex: num(m.EA) }, { tex: num(m.EI) }, m.truss ? tx(`${P}.truss`) : m.hingeI || m.hingeJ ? tx(`${P}.hinged`) : '']);
  return [
    { kind: 'p', text: tx(`${P}.intro.${id}`) },
    { kind: 'p', text: tx(`${P}.intro.assumptions`) },
    { kind: 'p', text: tx(sys.axialRigid ? `${P}.intro.rigid` : `${P}.intro.elastic`), detail: true },
    { kind: 'fig', sketch: loadedSketch(sys.pm), caption: tx('steps.common.structureCaption') },
    { kind: 'table', head: [tx('steps.common.member'), { tex: 'L\\ [\\mathrm{m}]' }, { tex: 'EA\\ [\\mathrm{kN}]' }, { tex: 'EI\\ [\\mathrm{kN\\,m^2}]' }, ''], rows },
    { kind: 'p', text: tx(`${P}.units`) },
  ];
}

export function unknownsStep(sys: SoSystem): Step {
  const blocks: Block[] = [
    { kind: 'p', text: tx(`${P}.unknowns.what`) },
    { kind: 'fig', sketch: unknownsSketch(sys), caption: tx(`${P}.unknowns.caption`) },
    { kind: 'eq', tex: `\\mathbf{D} = \\{ ${unknownLabels(sys).join(',\\ ')} \\}`, note: tx(`${P}.unknowns.count`, { n: unknownCount(sys) }) },
  ];
  if (sys.rigid) {
    const rigid = sys.rigid;
    const eqs = sys.members.map((m) => `(${m.name}):\\ ${num(m.c)}\\,(u_{${nodeName(sys, m.j)}} - u_{${nodeName(sys, m.i)}}) ${m.s < 0 ? '-' : '+'} ${num(Math.abs(m.s))}\\,(v_{${nodeName(sys, m.j)}} - v_{${nodeName(sys, m.i)}}) = 0`);
    blocks.push(
      { kind: 'p', text: tx(`${P}.unknowns.rigid`, { free: sys.free.length, c: sys.free.length - rigid.indep.length }) },
      { kind: 'eq', tex: `\\begin{aligned}${eqs.join('\\\\')}\\end{aligned}` },
      { kind: 'p', text: tx(`${P}.unknowns.rigidN`), detail: true },
    );
  }
  return { title: tx(`${P}.unknowns.title`), blocks };
}

/** First-order axial forces, with each member's Euler load and ρ = −N/P_E. */
export function axialTable(sys: SoSystem, N: Map<number, number>, caption: Txt): Block {
  const rows: Cell[][] = sys.members.map((m) => {
    const n = N.get(m.id) ?? 0;
    if (m.truss) return [m.name, { tex: num(n) }, '—', '—', '—'];
    const PE = (Math.PI ** 2 * m.EI) / (m.L * m.L);
    const rho = -n / PE;
    return [m.name, { tex: num(n) }, { tex: num(PE) }, { tex: num(rho) }, { tex: num(Math.PI * Math.sqrt(Math.abs(rho))) }];
  });
  return { kind: 'table', head: [tx('steps.common.member'), { tex: 'N\\ [\\mathrm{kN}]' }, { tex: 'P_E = \\pi^2EI/L^2' }, { tex: '\\rho = -N/P_E' }, { tex: 'kL = \\pi\\sqrt{|\\rho|}' }], rows, caption };
}

const endLabels = (sys: SoSystem, m: PMember) => {
  const a = nodeName(sys, m.i), b = nodeName(sys, m.j);
  return [`u_${a}`, `v_${a}`, `θ_${a}`, `u_${b}`, `v_${b}`, `θ_${b}`];
};

/** The member matrix of the method, symbolically, as the course writes it. */
export function symbolicMatrix(method: GeomMethod): Block[] {
  if (method === 'phi') {
    return [
      { kind: 'eq', tex: '\\mathbf{k}(N) = \\frac{EI}{L^3}\\begin{bmatrix} 12\\varphi_1 & 6L\\varphi_2 & -12\\varphi_1 & 6L\\varphi_2 \\\\ 6L\\varphi_2 & 4L^2\\varphi_3 & -6L\\varphi_2 & 2L^2\\varphi_4 \\\\ -12\\varphi_1 & -6L\\varphi_2 & 12\\varphi_1 & -6L\\varphi_2 \\\\ 6L\\varphi_2 & 2L^2\\varphi_4 & -6L\\varphi_2 & 4L^2\\varphi_3 \\end{bmatrix}', note: tx(`${P}.phi.matrixNote`) },
      { kind: 'eq', tex: '\\varphi_3 = \\frac{s}{4},\\quad \\varphi_4 = \\frac{s\\,c}{2},\\quad \\varphi_2 = \\frac{s(1+c)}{6},\\quad \\varphi_1 = \\frac{2s(1+c) - (kL)^2}{12}' },
      { kind: 'eq', tex: 's = \\frac{kL\\,(\\sin kL - kL\\cos kL)}{2 - 2\\cos kL - kL\\sin kL},\\qquad c = \\frac{kL - \\sin kL}{\\sin kL - kL\\cos kL},\\qquad kL = L\\sqrt{\\frac{|N|}{EI}}', note: tx(`${P}.phi.scNote`) },
    ];
  }
  if (method === 'string') {
    return [{ kind: 'eq', tex: '\\mathbf{k}(N) = \\mathbf{k}_E + \\frac{N}{L}\\begin{bmatrix} 1 & 0 & -1 & 0 \\\\ 0 & 0 & 0 & 0 \\\\ -1 & 0 & 1 & 0 \\\\ 0 & 0 & 0 & 0 \\end{bmatrix}', note: tx(`${P}.string.matrixNote`) }];
  }
  return [{ kind: 'eq', tex: '\\mathbf{k}(N) = \\mathbf{k}_E + \\frac{N}{30L}\\begin{bmatrix} 36 & 3L & -36 & 3L \\\\ 3L & 4L^2 & -3L & -L^2 \\\\ -36 & -3L & 36 & -3L \\\\ 3L & -L^2 & -3L & 4L^2 \\end{bmatrix}', note: tx(`${P}.consistent.matrixNote`) }];
}

/** One member's matrix at N: the φ values (or the K_G factor), and the numbers. */
export function memberMatrixBlocks(sys: SoSystem, m: PMember, N: number, method: GeomMethod): Block[] {
  const ms = memberStiffness(m, N, method, !sys.axialRigid);
  const out: Block[] = [];
  if (method === 'phi' && ms.phi && !m.truss) {
    const f = ms.phi;
    out.push({ kind: 'calc', formula: `\\rho = -\\frac{N}{P_E},\\quad kL = \\pi\\sqrt{|\\rho|}`, subst: `\\rho = -\\frac{${num(N)}}{${num((Math.PI ** 2 * m.EI) / (m.L * m.L))}} = ${num(f.rho)},\\quad kL = ${num(f.u)}`, result: `s = ${num(f.s)},\\ c = ${num(f.c)},\\ \\varphi_1 = ${num(f.phi1)},\\ \\varphi_2 = ${num(f.phi2)},\\ \\varphi_3 = ${num(f.phi3)},\\ \\varphi_4 = ${num(f.phi4)}` });
  } else if (method !== 'none') {
    out.push({ kind: 'calc', formula: method === 'string' ? '\\frac{N}{L}' : '\\frac{N}{30L}', subst: method === 'string' ? `\\frac{${num(N)}}{${num(m.L)}}` : `\\frac{${num(N)}}{30 \\cdot ${num(m.L)}}`, result: num(method === 'string' ? N / m.L : N / (30 * m.L)) });
  }
  if (m.hingeI || m.hingeJ) out.push({ kind: 'p', text: tx(`${P}.condensed`), detail: true });
  const labels = endLabels(sys, m);
  out.push({ kind: 'matrix', name: `\\mathbf{k}_{${m.name.replace('–', '')}}`, rows: ms.k, rowLabels: labels, colLabels: labels, caption: tx(`${P}.localCaption`) });
  return out;
}

/** K(N) over the unknowns, with its labels. */
export function globalMatrixBlock(sys: SoSystem, N: Map<number, number>, method: GeomMethod, name: string, caption: Txt): Block {
  const labels = unknownLabels(sys).map((s) => s.replace('\\theta', 'θ').replace(/[{}]/g, ''));
  return { kind: 'matrix', name, rows: reducedStiffness(sys, N, method), rowLabels: labels, colLabels: labels, caption };
}

/** The load vector over the unknowns. */
export function loadVector(sys: SoSystem): number[] {
  const f = sys.free.map((d) => sys.F[d]);
  if (!sys.rigid) return f;
  return sys.rigid.T[0].map((_, j) => sys.rigid!.T.reduce((s, row, i) => s + row[j] * f[i], 0));
}

export const unknownValues = (sys: SoSystem, D: number[]) => unknownDofs(sys).map((d) => D[d]);

/** A mode or a deflected shape on the structure, magnified to read. */
export function shapeSketch(sys: SoSystem, D: number[], color: 'deformed' | 'accent' = 'deformed'): Sketch {
  const sk = sketchOf(sys.pm, { labels: true });
  sk.members = sk.members.map((m) => ({ ...m, style: 'faint' as const }));
  const xs = [...sys.pm.nodes.values()].map((n) => n.x), zs = [...sys.pm.nodes.values()].map((n) => n.z);
  const ext = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), 1);
  const big = Math.max(1e-12, ...sys.pm.nodeOrder.flatMap((id) => [Math.abs(D[sys.dof(id, 0)]), Math.abs(D[sys.dof(id, 1)])]));
  const scale = (0.12 * ext) / big;
  sk.deformed = sys.members.map((m) => {
    const a = sys.pm.nodes.get(m.i)!, b = sys.pm.nodes.get(m.j)!;
    const pts = computeDeformedShape(a.x, a.z, b.x, b.z, D[sys.dof(m.i, 0)], D[sys.dof(m.i, 1)], D[sys.dof(m.i, 2)], D[sys.dof(m.j, 0)], D[sys.dof(m.j, 1)], D[sys.dof(m.j, 2)], scale, m.L, m.truss || m.hingeI, m.truss || m.hingeJ);
    return { points: pts.map((p) => ({ x: p.x, z: p.y })), color };
  });
  return sk;
}

/** End moments of a solve, counter-clockwise on the member, as rows to compare. */
export function momentRows(sys: SoSystem, mine: Map<number, number[]>, engine: Map<number, { mStart: number; mEnd: number }>): CompareRow[] {
  const rows: CompareRow[] = [];
  for (const m of sys.members) {
    if (m.truss) continue;
    const f = mine.get(m.id), e = engine.get(m.id);
    if (!f || !e) continue;
    const a = nodeName(sys, m.i), b = nodeName(sys, m.j);
    if (!m.hingeI) rows.push({ label: `M_{${a}${b}}`, method: f[2], matrix: e.mStart, unit: 'kN·m' });
    if (!m.hingeJ) rows.push({ label: `M_{${b}${a}}`, method: f[5], matrix: -e.mEnd, unit: 'kN·m' });
  }
  return rows;
}

export const translationRows = (sys: SoSystem, D: number[], engine: Map<number, { ux: number; uz: number }>): CompareRow[] => {
  const rows: CompareRow[] = [];
  for (const d of unknownDofs(sys)) {
    const k = d % 3, node = sys.pm.nodeOrder[Math.floor(d / 3)];
    if (k === 2) continue;
    const e = engine.get(node);
    if (!e) continue;
    rows.push({ label: dofTex(sys, d), method: D[d], matrix: k === 0 ? e.ux : e.uz, unit: 'm' });
  }
  return rows;
};

export const fmtList = (xs: number[]) => xs.map((v) => numText(v)).join(', ');

/** The model the engine is compared on: with rigid members, the same with areas 10⁵ times larger. */
export function referenceInput(input: SolverInput, axialRigid: boolean): SolverInput {
  if (!axialRigid) return input;
  return { ...input, sections: new Map([...input.sections].map(([id, sec]) => [id, { ...sec, a: sec.a * 1e5 }])) };
}
