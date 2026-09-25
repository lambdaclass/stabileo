/**
 * Space frames with rotations no member resists, through the app's own path.
 *
 * Each model is built with the store, as a user builds it, and solved with
 * `modelStore.solve3D` — which goes through `buildSolverInput3D`, joint
 * expansion included. All three were reported as mechanisms. Each is checked
 * against the step-by-step stiffness solver, a separate implementation that
 * reads releases as element flags rather than as expanded joints.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { historyStore, modelStore, uiStore } from '../../store';
import { solveDetailed3D } from '../solver-detailed-3d';
import { stabiliseOrphanRotations3D } from '../orphan-rotations-3d';
import type { AnalysisResults3D } from '../types-3d';

function portal() {
  historyStore.clear(); uiStore.analysisMode = '3d'; modelStore.clear();
  const n = [modelStore.addNode(0, 0, 0), modelStore.addNode(0, 0, 3), modelStore.addNode(4, 0, 3), modelStore.addNode(4, 2, 3), modelStore.addNode(4, 2, 0)];
  const e = [modelStore.addElement(n[0], n[1]), modelStore.addElement(n[1], n[2]), modelStore.addElement(n[2], n[3]), modelStore.addElement(n[3], n[4])];
  modelStore.addSupport(n[0], 'fixed3d' as never);
  modelStore.addSupport(n[4], 'fixed3d' as never);
  modelStore.addNodalLoad3D(n[2], 5, 5, -10, 0, 0, 0);
  return { n, e };
}

/** The analysis displacements against the wizard's, at every model node. */
function agrees(r: AnalysisResults3D) {
  const d = solveDetailed3D(modelStore.buildSolverInput3D(false, false, { expandMemberOffsets: false })!);
  const scale = Math.max(...r.displacements.flatMap((x) => [Math.abs(x.ux), Math.abs(x.uy), Math.abs(x.uz)]));
  for (const x of r.displacements) {
    if (!modelStore.nodes.has(x.nodeId)) continue;
    (['ux', 'uy', 'uz'] as const).forEach((k, ld) => {
      const q = d.dofNumbering.dofs.find((y) => y.nodeId === x.nodeId && y.localDof === ld);
      if (!q) return;
      expect(Math.abs(d.uAll[q.globalIndex] - x[k]) / scale, `${k}@${x.nodeId}`).toBeLessThan(1e-6);
    });
  }
}

describe('rotations no member resists, in a space frame', () => {
  beforeEach(() => { uiStore.analysisMode = '3d'; });

  it('a supported node reached only by truss bars solves, and reports no moment there', () => {
    const { n } = portal();
    const n6 = modelStore.addNode(0, 2, 0);
    modelStore.addElement(n6, n[1], 'truss');
    modelStore.addElement(n6, n[3], 'truss');
    modelStore.addSupport(n6, 'pinned3d' as never);
    const r = modelStore.solve3D(false, false, false);
    expect(typeof r, String(r)).not.toBe('string');
    const res = r as AnalysisResults3D;
    agrees(res);
    const at6 = res.reactions.find((x) => x.nodeId === n6)!;
    expect(Math.abs(at6.mx) + Math.abs(at6.my) + Math.abs(at6.mz)).toBe(0);
    expect(Math.abs(at6.fx) + Math.abs(at6.fy) + Math.abs(at6.fz)).toBeGreaterThan(1);
  });

  it('a free node reached only by truss bars solves, and gains no reaction row', () => {
    const { n } = portal();
    const n7 = modelStore.addNode(2, 1, 5);
    modelStore.addElement(n[1], n7, 'truss');
    modelStore.addElement(n[2], n7, 'truss');
    modelStore.addElement(n[3], n7, 'truss');
    modelStore.addNodalLoad3D(n7, 0, 0, -6, 0, 0, 0);
    const r = modelStore.solve3D(false, false, false);
    expect(typeof r, String(r)).not.toBe('string');
    agrees(r as AnalysisResults3D);
    expect((r as AnalysisResults3D).reactions.map((x) => x.nodeId).sort()).toEqual([n[0], n[4]].sort());
  });

  it('a node where every member end releases both bending moments solves', () => {
    const p = portal();
    modelStore.toggleRelease(p.e[0], 'j' as never, 'my' as never);
    modelStore.toggleRelease(p.e[0], 'j' as never, 'mz' as never);
    modelStore.toggleRelease(p.e[1], 'i' as never, 'my' as never);
    modelStore.toggleRelease(p.e[1], 'i' as never, 'mz' as never);
    const r = modelStore.solve3D(false, false, false);
    expect(typeof r, String(r)).not.toBe('string');
    agrees(r as AnalysisResults3D);
  });

  it('touches nothing in a model where every rotation is resisted', () => {
    portal();
    const input = modelStore.buildSolverInput3D(false, false, { expandMemberOffsets: false })!;
    expect([...input.supports.values()].some((s) => s.stabilised)).toBe(false);
    const again = stabiliseOrphanRotations3D(input);
    expect(again.touched.size).toBe(0);
  });
});
