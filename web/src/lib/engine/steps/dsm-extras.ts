/**
 * What the stiffness wizard adds from the explained step-by-step toolkit
 * (plane models): the static classification with its formula, a figure of the
 * degree-of-freedom numbering, and, for every loaded member, its fixed-end
 * actions written out (formula, substitution, result, check) with the
 * member's equivalent nodal load vector.
 */
import type { SolverInput } from '../types';
import type { Block } from './doc';
import { tx } from './doc';
import { num } from './format';
import { planeModel, loadsOn } from './plane-model';
import { fixedEnd, fixedEndBlocks } from './fem';
import type { Sketch } from './sketch';
import { sketchOf } from './sketch';
import { ghBlocks } from './gh-blocks';
import { ghReport } from '../static-degree';

/** GH by the classic formula, the same count the force method and the kinematic panel show. */
export function staticClassificationBlocks(input: SolverInput): Block[] {
  return [...ghBlocks(ghReport(input, 0, { split: true }), 'dsm'), { kind: 'p', text: tx('course.statics.gh.dsm'), detail: true }];
}

/** The structure with every degree of freedom drawn and numbered as the wizard numbers them. */
export function dofSketch(input: SolverInput, dofs: Array<{ nodeId: number; localDof: number; globalIndex: number; isFree: boolean }>, dofsPerNode: number): Sketch {
  const pm = planeModel(input);
  const s = sketchOf(pm);
  s.dofs = dofs.map((d) => ({
    node: d.nodeId,
    kind: (dofsPerNode === 2 ? ['ux', 'uz'][d.localDof] : ['ux', 'uz', 'ry'][d.localDof]) as 'ux' | 'uz' | 'ry',
    label: String(d.globalIndex + 1),
    color: d.isFree ? 'dof' : 'muted',
  }));
  return s;
}

/**
 * For each loaded member: a free body of it fixed at both ends under its span
 * loads, its fixed-end actions written out, and the equivalent nodal load
 * vector that enters F (the fixed-end actions with their sign changed: the
 * member held fixed pushes on the nodes the other way).
 */
export function memberFixedEndBlocks(input: SolverInput): Block[] {
  const pm = planeModel(input);
  const out: Block[] = [];
  for (const id of pm.memberOrder) {
    const m = pm.members.get(id)!;
    const loads = loadsOn(pm, id).filter((l) => l.kind !== 'thermal');
    if (loads.length === 0 || m.truss) continue;
    const ni = pm.nodes.get(m.i)!, nj = pm.nodes.get(m.j)!;
    const names = { i: ni.name, j: nj.name };
    const fe = fixedEnd(m, loads, names);
    const pointLoads = loads.filter((l) => l.kind === 'point');
    const sketch: Sketch = {
      nodes: [{ id: m.i, x: 0, z: 0, label: names.i }, { id: m.j, x: m.L, z: 0, label: names.j }],
      members: [{ id: m.id, i: m.i, j: m.j }],
      supports: [{ node: m.i, type: 'fixed' }, { node: m.j, type: 'fixed' }],
      // Drawn left to right, so local +y is up and the loads keep their local signs.
      spanLoads: loads.flatMap((l) => (l.kind === 'dist' ? [{ member: m.id, a: l.a, b: l.b, wa: -l.qa, wb: -l.qb }] : [])),
      forces: [
        ...pointLoads.flatMap((l) => (l.kind === 'point' && Math.abs(l.p) > 1e-12 ? [{ x: l.a, z: 0, fx: 0, fz: Math.sign(l.p), label: num(Math.abs(l.p)), color: 'load' as const }] : [])),
        ...(Math.abs(fe.Vi) > 1e-12 ? [{ x: 0, z: 0, fx: 0, fz: Math.sign(fe.Vi), label: `V = ${num(Math.abs(fe.Vi))}`, color: 'reaction' as const }] : []),
        ...(Math.abs(fe.Vj) > 1e-12 ? [{ x: m.L, z: 0, fx: 0, fz: Math.sign(fe.Vj), label: `V = ${num(Math.abs(fe.Vj))}`, color: 'reaction' as const }] : []),
      ],
      couples: [
        ...pointLoads.flatMap((l) => (l.kind === 'point' && Math.abs(l.m) > 1e-12 ? [{ x: l.a, z: 0, m: l.m, label: num(Math.abs(l.m)), color: 'moment' as const }] : [])),
        { x: 0, z: 0, m: fe.Mi, label: num(Math.abs(fe.Mi)), color: 'reaction' },
        { x: m.L, z: 0, m: fe.Mj, label: num(Math.abs(fe.Mj)), color: 'reaction' },
      ],
      dims: 'auto',
      height: 150,
    };
    const feq = [0, -fe.Vi, -fe.Mi, 0, -fe.Vj, -fe.Mj];
    out.push({
      kind: 'sub', title: tx('steps.dsm.fem.member', { id: m.id, name: m.name }),
      blocks: [
        { kind: 'fig', sketch, caption: tx('steps.dsm.fem.freeBody', { name: m.name }) },
        ...fixedEndBlocks(fe, names),
        { kind: 'eq', tex: `\\{f'_{eq}\\}_{${m.id}} = -\\begin{Bmatrix} 0 \\\\ V_{${names.i}${names.j}} \\\\ \\mathrm{FEM}_{${names.i}${names.j}} \\\\ 0 \\\\ V_{${names.j}${names.i}} \\\\ \\mathrm{FEM}_{${names.j}${names.i}} \\end{Bmatrix} = \\begin{Bmatrix} ${feq.map((v) => num(v)).join(' \\\\ ')} \\end{Bmatrix}`, note: tx('steps.dsm.fem.feq') },
      ],
    });
  }
  return out;
}
