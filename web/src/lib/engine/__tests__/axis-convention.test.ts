/**
 * The axis convention is a drawing choice, not an analysis input.
 *
 * "Left-hand" negated each member's local y inside the solver, which made the
 * rotation matrix improper and changed the answer: under a nodal moment a node
 * moved 1,33 mm instead of 5,02 and a reaction changed sign. The analysis is
 * now right-handed under either convention.
 */
import { describe, it, expect } from 'vitest';
import { historyStore, modelStore, uiStore } from '../../store';
import type { AnalysisResults3D } from '../types-3d';

function frame() {
  historyStore.clear(); uiStore.analysisMode = '3d'; modelStore.clear();
  const n = [modelStore.addNode(0, 0, 0), modelStore.addNode(0, 0, 3), modelStore.addNode(4, 0, 3), modelStore.addNode(4, 2, 3), modelStore.addNode(4, 2, 0)];
  const e = [modelStore.addElement(n[0], n[1]), modelStore.addElement(n[1], n[2]), modelStore.addElement(n[2], n[3]), modelStore.addElement(n[3], n[4])];
  modelStore.addSupport(n[0], 'fixed3d' as never); modelStore.addSupport(n[4], 'fixed3d' as never);
  modelStore.addNodalLoad3D(n[2], 5, 0, -10, 0, 0, 50);
  modelStore.addDistributedLoad3D(e[1], 0, 0, -4, -4);
  return n;
}

describe('the axis convention', () => {
  it('does not change displacements, reactions or member forces', () => {
    frame();
    const right = modelStore.solve3D(false, false) as AnalysisResults3D;
    const left = modelStore.solve3D(false, true) as AnalysisResults3D;
    expect(typeof right).toBe('object');
    for (const d of right.displacements) {
      const o = left.displacements.find((x) => x.nodeId === d.nodeId)!;
      for (const k of ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'] as const) expect(o[k], `${k}@${d.nodeId}`).toBeCloseTo(d[k], 12);
    }
    for (const r of right.reactions) {
      const o = left.reactions.find((x) => x.nodeId === r.nodeId)!;
      for (const k of ['fx', 'fy', 'fz', 'mx', 'my', 'mz'] as const) expect(o[k], `R${k}@${r.nodeId}`).toBeCloseTo(r[k], 9);
    }
    for (const f of right.elementForces) {
      const o = left.elementForces.find((x) => x.elementId === f.elementId)!;
      for (const k of ['nStart', 'vyStart', 'vzStart', 'mxStart', 'myStart', 'mzStart'] as const) expect(o[k], `${k}@${f.elementId}`).toBeCloseTo(f[k], 9);
    }
  });

  it('never reaches the solver input', () => {
    frame();
    expect(modelStore.buildSolverInput3D(false, true)!.leftHand).toBe(false);
  });
});
