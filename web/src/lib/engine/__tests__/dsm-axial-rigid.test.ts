/**
 * The stiffness wizard with axially rigid members, against the engine solving
 * the same model with its frame members' areas × 10⁶: displacements, member
 * end forces (the axial ones recovered from joint equilibrium) and reactions.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import katex from 'katex';
import { modelStore } from '../../store/model.svelte';
import * as wasm from '../wasm-solver';
import type { SolverInput } from '../types';
import { solveDetailed, type DSMStepData } from '../solver-detailed';
import { dsmGicBlocks, rigidStep6, rigidStep7, rigidAxialBlocks } from '../steps/dsm-kinematics';
import type { Block } from '../steps/doc';

beforeAll(async () => { await new Promise((r) => setTimeout(r, 0)); expect(wasm.isSolverReady()).toBe(true); });
beforeEach(() => { modelStore.clear(); });

function rigidFrames(input: SolverInput): SolverInput {
  const sections = new Map(input.sections);
  const elements = new Map(input.elements);
  let next = Math.max(...sections.keys()) + 1;
  for (const [id, e] of input.elements) {
    if (e.type !== 'frame') continue;
    sections.set(next, { ...input.sections.get(e.sectionId)!, id: next, a: input.sections.get(e.sectionId)!.a * 1e6 });
    elements.set(id, { ...e, sectionId: next });
    next++;
  }
  return { ...input, sections, elements };
}

function check(input: SolverInput): DSMStepData {
  const d = solveDetailed(input, { axialRigid: true });
  expect(d.rigidStatus).toBe('on');
  const r = wasm.solve(rigidFrames(input));
  const scale = (xs: number[]) => Math.max(1e-9, ...xs.map(Math.abs));
  const uScale = scale(r.displacements.flatMap((x) => [x.ux, x.uz]));
  for (const x of r.displacements) {
    for (const [ld, v] of [[0, x.ux], [1, x.uz]] as const) {
      const dof = d.dofNumbering.dofs.find((q) => q.nodeId === x.nodeId && q.localDof === ld)!;
      expect(Math.abs(d.uAll[dof.globalIndex] - v) / uScale, `u ${x.nodeId}:${ld}`).toBeLessThan(1e-4);
    }
  }
  const fScale = scale(r.elementForces.flatMap((f) => [f.nStart, f.mStart, f.mEnd]));
  for (const ef of r.elementForces) {
    const f = d.elementForces.find((x) => x.elementId === ef.elementId)!;
    const frame = d.elements.find((x) => x.elementId === ef.elementId)!.type === 'frame';
    expect(Math.abs(-f.fLocalFinal[0] - ef.nStart) / fScale, `N ${ef.elementId}`).toBeLessThan(1e-4);
    if (frame) expect(Math.abs(f.fLocalFinal[2] - ef.mStart) / fScale, `M ${ef.elementId}`).toBeLessThan(1e-4);
  }
  const reac = r.reactions.flatMap((x) => [x.rx, x.rz, x.my]);
  const rScale = scale(reac);
  d.restrDofLabels.forEach((_, i) => {
    const dof = d.dofNumbering.dofs.find((q) => q.globalIndex === d.dofNumbering.nFree + i)!;
    const e = r.reactions.find((x) => x.nodeId === dof.nodeId)!;
    const v = [e.rx, e.rz, e.my][dof.localDof];
    expect(Math.abs(d.reactionsRaw[i] - v) / rScale, `R ${dof.nodeId}:${dof.localDof}`).toBeLessThan(1e-4);
  });
  return d;
}

function portal(pinned = false) {
  const a = modelStore.addNode(0, 0), b = modelStore.addNode(0, 4), c = modelStore.addNode(6, 4), d = modelStore.addNode(6, 0);
  modelStore.addElement(a, b); const beam = modelStore.addElement(b, c); modelStore.addElement(d, c);
  modelStore.addSupport(a, 'fixed'); modelStore.addSupport(d, pinned ? 'pinned' : 'fixed');
  modelStore.addDistributedLoad(beam, -10, -10); modelStore.addNodalLoad(b, 20, 0, 0);
  return { a, b, c, d };
}

const texOf = (bs: Block[]): string[] => bs.flatMap((b) => (b.kind === 'eq' ? [b.tex] : b.kind === 'matrix' ? [b.name] : b.kind === 'table' ? b.rows.flat().flatMap((c) => (typeof c === 'object' && c && 'tex' in c ? [c.tex] : [])) : b.kind === 'sub' ? texOf(b.blocks) : []));

describe('stiffness wizard with axially rigid members', () => {
  it('fixed portal: 6 free DOFs reduce to 3 (θ_B, θ_C and the sway), as the engine with stiff members', () => {
    portal();
    const d = check(modelStore.buildSolverInput(false)!);
    expect(d.dofNumbering.nFree).toBe(6);
    expect(d.rigid!.indep.length).toBe(3);
    expect(d.rigid!.T.length).toBe(6);
    // K* is symmetric and the EA/L of the rigid members has left it.
    const K = d.rigid!.Kq;
    K.forEach((row, i) => row.forEach((v, j) => expect(v).toBeCloseTo(K[j][i], 6)));
    expect(Math.max(...K.flat().map(Math.abs))).toBeLessThan(d.elements[0].E * d.elements[0].A / 4 / 10);
  });

  it('a pinned-base portal braced by a tie: the tie stays extensible', () => {
    const p = portal(true);
    modelStore.addElement(p.a, p.c, 'truss');
    const d = check(modelStore.buildSolverInput(false)!);
    expect(d.rigid!.members.length).toBe(3);
  });

  it('the two-story frame example', async () => {
    await modelStore.loadExample('two-story-frame');
    const d = check(modelStore.buildSolverInput(false)!);
    expect(d.rigid!.indep.length).toBe(6);
  });

  it('a settlement the rigid members can follow, and one they cannot', () => {
    const n = [0, 6, 12].map((x) => modelStore.addNode(x, 0));
    const e = modelStore.addElement(n[0], n[1]); modelStore.addElement(n[1], n[2]);
    modelStore.addSupport(n[0], 'fixed'); const sb = modelStore.addSupport(n[1], 'rollerX'); const sc = modelStore.addSupport(n[2], 'pinned');
    modelStore.addDistributedLoad(e, -10, -10);
    modelStore.updateSupport(sb, { dz: -0.01 });
    check(modelStore.buildSolverInput(false)!);
    modelStore.updateSupport(sc, { dx: 0.01 });
    expect(solveDetailed(modelStore.buildSolverInput(false)!, { axialRigid: true }).rigidStatus).toBe('imposed');
  });

  it('a beam between two fixed ends: its axial force is the least-energy one (zero), flagged as such', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(6, 0);
    const e = modelStore.addElement(a, b);
    modelStore.addSupport(a, 'pinned'); modelStore.addSupport(b, 'pinned');
    modelStore.addDistributedLoad(e, -10, -10);
    const d = check(modelStore.buildSolverInput(false)!);
    expect(d.rigid!.N.get(e)).toBe(0);
    expect(d.rigid!.selfStress).toBe(true);
  });

  it('off by default, and the flexible solve is untouched', () => {
    portal();
    const input = modelStore.buildSolverInput(false)!;
    const plain = solveDetailed(input);
    expect(plain.rigid).toBeUndefined();
    expect(solveDetailed(input, { axialRigid: false })).toEqual(plain);
  });

  it('writes its steps: conditions, T, K*, F*, q and the axial forces, in valid KaTeX', () => {
    portal();
    const d = solveDetailed(modelStore.buildSolverInput(false)!, { axialRigid: true });
    const blocks = [...rigidStep6(d), ...rigidStep7(d), ...rigidAxialBlocks(d, true)];
    expect(blocks.some((b) => b.kind === 'matrix' && b.name === '\\mathbf{T}')).toBe(true);
    expect(blocks.some((b) => b.kind === 'matrix' && b.name === '\\mathbf{K}^{*}')).toBe(true);
    for (const t of texOf(blocks)) expect(() => katex.renderToString(t, { throwOnError: true }), t).not.toThrow();
  });
});

describe('the kinematic count in step 1', () => {
  it('GIC beside GH: equal to the free DOFs with axial stiffness, fewer with rigid members', () => {
    portal();
    const input = modelStore.buildSolverInput(false)!;
    const find = (bs: Block[], key: string): boolean => bs.some((b) => (b.kind === 'p' && b.text.key === key) || (b.kind === 'sub' && find(b.blocks, key)));
    const gicOf = (bs: Block[]): string => {
      for (const b of bs) {
        if (b.kind === 'calc' && b.formula.startsWith('GIC')) return b.result;
        if (b.kind === 'sub') { const r = gicOf(b.blocks); if (r) return r; }
      }
      return '';
    };
    const flex = dsmGicBlocks(input, solveDetailed(input));
    expect(gicOf(flex)).toContain('GIC = 6');
    expect(find(flex, 'course.kinematics.dsm.gic.same')).toBe(true);
    const rigid = dsmGicBlocks(input, solveDetailed(input, { axialRigid: true }));
    expect(gicOf(rigid)).toContain('GIC = 3');
    expect(find(rigid, 'course.kinematics.dsm.gic.vsDofsRigid')).toBe(true);
  });
});
