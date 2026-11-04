/**
 * What the stiffness wizard shows from the displacement method's side: the
 * kinematic count (GIC) beside the static one in step 1, and, with axially
 * rigid members, the reduction u_f = T·q (step 6), the reduced solve (step
 * 7) and the axial forces from equilibrium (steps 8 and 9).
 */
import type { SolverInput } from '../types';
import type { DSMStepData } from '../solver-detailed';
import type { Block, Cell } from './doc';
import { tx } from './doc';
import { num } from './format';
import { planeModel } from './plane-model';
import { kinematicUnknowns } from './kinematic-unknowns';
import { gicBlocks } from './gic';
import { countIndeterminacy } from '../force-method/primary';

const P = 'course.kinematics.';

/** A wizard label ("u3", "θ2", "u′4") in TeX: u_{3}, \theta_{2}. */
export function dofTex(label: string): string {
  const m = /^([uvθ])(′?)(\d+)$/.exec(label);
  if (!m) return `\\text{${label}}`;
  return `${m[1] === 'θ' ? '\\theta' : m[1]}${m[2] ? "'" : ''}_{${m[3]}}`;
}

/** Step 1: the kinematic count for the same model, with the members as the wizard takes them. */
export function dsmGicBlocks(input: SolverInput, data: DSMStepData): Block[] {
  if (data.dofNumbering.dofsPerNode !== 3) return [];
  const rigid = data.rigidStatus === 'on';
  const r = kinematicUnknowns(input, planeModel(input), { axial: !rigid, releasedUnknown: false });
  if (!r.ok) return [];
  const gic = r.ks.unknowns.length;
  return [{ kind: 'sub', title: tx(`${P}dsm.gic.title`), blocks: [
    ...gicBlocks(r.ks, countIndeterminacy(input).gh),
    { kind: 'p', text: tx(gic === data.dofNumbering.nFree ? `${P}dsm.gic.same` : rigid ? `${P}dsm.gic.vsDofsRigid` : `${P}dsm.gic.vsDofs`, { f: data.dofNumbering.nFree, gic }) },
  ] }];
}

/** The constant-length conditions and the dependent displacements in terms of q (step 6). */
export function rigidStep6(data: DSMStepData): Block[] {
  const r = data.rigid;
  if (!r) return [];
  const L = data.dofLabels;
  const qL = r.indep.map((k) => L[k]);
  const cond: Cell[][] = r.conditions.map((c) => [String(c.elementId), { tex: `${c.coefs.map((t, k) => `${t.v < 0 ? '-' : k ? '+' : ''}${Math.abs(Math.abs(t.v) - 1) < 1e-12 ? '' : num(Math.abs(t.v))}${dofTex(L[t.dof])}`).join(' ')} = ${num(c.rhs)}` }]);
  const deps: Cell[][] = r.deps.map((k) => {
    const terms = r.indep.map((_, j) => r.T[k][j]).map((v, j) => (Math.abs(v) < 1e-12 ? '' : `${v < 0 ? '-' : '+'}${Math.abs(Math.abs(v) - 1) < 1e-12 ? '' : num(Math.abs(v))}${dofTex(qL[j])}`)).filter(Boolean);
    const c0 = Math.abs(r.u0[k]) > 1e-15 ? num(r.u0[k]) : '';
    const body = `${c0}${terms.join(' ')}`.replace(/^\+/, '') || '0';
    return [{ tex: dofTex(L[k]) }, { tex: body }];
  });
  return [
    { kind: 'note', tone: 'info', text: tx(`${P}dsm.rigid.on`, { q: r.indep.length, f: data.dofNumbering.nFree }) },
    { kind: 'p', text: tx(`${P}dsm.rigid.conditions`, { q: r.indep.length, d: r.deps.length }) },
    { kind: 'table', head: [tx('steps.common.member'), { tex: '(u_j - u_i)\\cdot e = \\alpha\\,\\Delta T\\,L' }], rows: cond, caption: tx(`${P}dsm.rigid.conditionsCaption`) },
    ...(deps.length ? [{ kind: 'table' as const, head: [tx(`${P}dsm.rigid.dependent`), { tex: 'q' }] as Cell[], rows: deps, caption: tx(`${P}dsm.rigid.tCaption`) }] : []),
    { kind: 'matrix', name: '\\mathbf{T}', rows: r.T, rowLabels: data.freeDofLabels, colLabels: qL, caption: tx(`${P}dsm.rigid.tCaption`) },
    { kind: 'p', text: tx(`${P}dsm.rigid.reduce`) },
    { kind: 'eq', tex: '\\mathbf{K}^{*} = \\mathbf{T}^{T}\\,\\mathbf{K}_{ff}\\,\\mathbf{T}, \\qquad \\mathbf{F}^{*} = \\mathbf{T}^{T}\\left(\\mathbf{F}_{mod} - \\mathbf{K}_{ff}\\,\\mathbf{u}^{0}\\right)' },
    { kind: 'matrix', name: '\\mathbf{K}^{*}', rows: r.Kq, rowLabels: qL, colLabels: qL, caption: tx(`${P}dsm.rigid.kCaption`) },
    { kind: 'matrix', name: '\\mathbf{F}^{*}', rows: r.Fq.map((v) => [v]), rowLabels: qL, caption: tx(`${P}dsm.rigid.fCaption`) },
  ];
}

/** The reduced solve (step 7). */
export function rigidStep7(data: DSMStepData): Block[] {
  const r = data.rigid;
  if (!r) return [];
  return [
    { kind: 'p', text: tx(`${P}dsm.rigid.solve`) },
    { kind: 'eq', tex: '\\mathbf{q} = \\left(\\mathbf{K}^{*}\\right)^{-1}\\mathbf{F}^{*}, \\qquad \\mathbf{u}_f = \\mathbf{u}^{0} + \\mathbf{T}\\,\\mathbf{q}' },
    { kind: 'matrix', name: '\\mathbf{q}', rows: r.q.map((v) => [v]), rowLabels: r.indep.map((k) => data.dofLabels[k]), caption: tx(`${P}dsm.rigid.qCaption`) },
  ];
}

/** The axial forces of the rigid members from the joints' equilibrium (steps 8 and 9). */
export function rigidAxialBlocks(data: DSMStepData, withReactions: boolean): Block[] {
  const r = data.rigid;
  if (!r) return [];
  const rows: Cell[][] = r.members.map((id) => [String(id), { tex: num(r.N.get(id)!) }]);
  return [
    { kind: 'p', text: tx(`${P}dsm.rigid.axial`) },
    { kind: 'eq', tex: '\\mathbf{C}_f^{T}\\,\\mathbf{N} = -\\left(\\mathbf{K}\\,\\mathbf{u} - \\mathbf{F}\\right)_f' },
    { kind: 'table', head: [tx('steps.common.member'), { tex: 'N\\ [\\mathrm{kN}]' }], rows, caption: tx(`${P}dsm.rigid.axialCaption`) },
    ...(r.selfStress ? [{ kind: 'note' as const, tone: 'info' as const, text: tx(`${P}dsm.rigid.selfStress`) }] : []),
    ...(withReactions ? [{ kind: 'p' as const, text: tx(`${P}dsm.rigid.reactions`) }] : []),
  ];
}
