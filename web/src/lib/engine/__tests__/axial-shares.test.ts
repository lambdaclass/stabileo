/**
 * A member's axial force under a load along it: the part the engine never sees.
 *
 * A column 4 m tall, fixed at its foot, carrying 10 kN/m down along its axis: by statics its
 * foot carries −40 kN and its head nothing. The engine takes no axial member load, so the load
 * reaches the nodes and the member used to report −20 kN all along, the average; a validation
 * model's column read −23.68 where it carries −26.04 at the foot.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';
import '../../store/index';
import { initSolver } from '../wasm-solver';
import { extractForcesAtStation } from '../station-forces';
import type { AnalysisResults3D } from '../types-3d';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { uiStore.analysisMode = 'pro'; modelStore.clear(); });

const L = 4, q = 10;
function column() {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, L);
  const e = modelStore.addElement(a, b, 'frame');
  modelStore.addSupport(a, 'fixed3d');
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  // Global Z, down, along the member's whole length.
  modelStore.addDistributedLoad3D(e, 0, 0, -q, -q, undefined, undefined, 1, { frame: 'global' });
  return e;
}
const forces = (r: AnalysisResults3D, e: number) => r.elementForces.find((f) => f.elementId === e)!;

describe('the axial part of a member load', () => {
  it('reaches the member: its foot carries the whole load, its head none', async () => {
    const e = column();
    const r = await modelStore.solve3DAsync(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    const f = forces(r, e);
    expect(f.nStart).toBeCloseTo(-q * L, 9);
    expect(f.nEnd).toBeCloseTo(0, 9);
    expect(extractForcesAtStation(f, 0.5).n).toBeCloseTo(-q * L / 2, 9);
    // The support still takes it once.
    expect(r.reactions.reduce((s, x) => s + x.fz, 0)).toBeCloseTo(q * L, 9);
  });

  it('in a combination, with its factor, and to second order', () => {
    const e = column();
    const k = modelStore.addCombination('1.4 D', [{ caseId: 1, factor: 1.4 }]);
    const lin = modelStore.solveCombinations3D(false, false, true);
    if (!lin || typeof lin === 'string') throw new Error(String(lin));
    expect(forces(lin.perCombo.get(k)!, e).nStart).toBeCloseTo(-1.4 * q * L, 9);
    expect(forces(lin.perCase.get(1)!, e).nEnd).toBeCloseTo(0, 9);
    modelStore.setAnalysis({ perCombination: 'pdelta' });
    const pd = modelStore.solveCombinations3D(false, false, true);
    if (!pd || typeof pd === 'string') throw new Error(String(pd));
    expect(forces(pd.perCombo.get(k)!, e).nStart).toBeCloseTo(-1.4 * q * L, 6);
  });
});

describe('the axial part of a load on a member that takes no bending', () => {
  /*
   * A truss post 4 m tall, held at its head by three inclined bars, under 10 kN/m down along
   * it. A truss has its whole load moved to its end nodes, the axial part tagged; whatever the
   * bars around it take, the post's own load makes its foot carry q·L more than its head.
   */
  function post(): number {
    const foot = modelStore.addNode(0, 0, 0), head = modelStore.addNode(0, 0, 4);
    const p = modelStore.addElement(foot, head, 'truss');
    modelStore.addSupport(foot, 'pinned3d');
    for (let k = 0; k < 3; k++) {
      const a = modelStore.addNode(5 * Math.cos((2 * Math.PI * k) / 3), 5 * Math.sin((2 * Math.PI * k) / 3), 0);
      modelStore.addElement(a, head, 'truss');
      modelStore.addSupport(a, 'pinned3d');
    }
    for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
    modelStore.addDistributedLoad3D(p, 0, 0, -q, -q, undefined, undefined, 1, { frame: 'global' });
    return p;
  }

  it('reaches the post on this thread', async () => {
    const p = post();
    const r = modelStore.solve3D(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    expect(forces(r, p).nStart - forces(r, p).nEnd).toBeCloseTo(-q * L, 9);
  });

  it('reaches the post through the worker pool, as the browser solves', async () => {
    // The worker answers as the engine does (solver-worker.ts: the raw solve, then the
    // stabilised reactions stripped); the correction is the caller's.
    const pool = await import('../solver-pool');
    const { stripStabilisedReactions } = await import('../stabilised-reactions');
    const wasm = await import('../../wasm/dedaliano_engine.js');
    const spy = vi.spyOn(pool, 'solve3DInWorker').mockImplementation(async (wire: any) => stripStabilisedReactions(wasm.solve_3d(wire), wire));
    try {
      const p = post();
      const r = await modelStore.solve3DAsync(false, false, true);
      if (!r || typeof r === 'string') throw new Error(String(r));
      expect(spy).toHaveBeenCalled();
      expect(forces(r, p).nStart - forces(r, p).nEnd).toBeCloseTo(-q * L, 9);
    } finally {
      spy.mockRestore();
    }
  });
});
