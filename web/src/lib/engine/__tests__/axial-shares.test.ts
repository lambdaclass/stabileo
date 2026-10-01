/**
 * A member's axial force under a load along it: the part the engine never sees.
 *
 * A column 4 m tall, fixed at its foot, carrying 10 kN/m down along its axis: by statics its
 * foot carries −40 kN and its head nothing. The engine took no axial member load, so the load
 * reached the nodes and the member used to report −20 kN all along, the average; a validation
 * model's column read −23.68 where it carries −26.04 at the foot.
 *
 * A frame's axial load now goes to the engine itself. A member that takes no bending still has
 * its whole load moved to its nodes, the axial part tagged and given back after the solve, so
 * the paths that give it back are tested on a truss post: a frame column would pass them all
 * with nothing given back.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { uiStore } from '../../store/ui.svelte';
import '../../store/index';
import { initSolver, input3DToWireObject, solveSSI3D, solveWinkler3D } from '../wasm-solver';
import { finishSolve3D, finishPDelta3D } from '../solve-finish';
import { axialShares } from '../axial-shares';
import { workerPDelta, runDirectAnalysis } from '../direct-analysis';
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
/** Foot less head: the member's own load along it, whatever the rest of the model does. */
const diff = (r: AnalysisResults3D, e: number) => forces(r, e).nStart - forces(r, e).nEnd;

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
});

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

describe('wherever the solve ran', () => {
  it('the wire a worker receives carries the tags, and its finish gives the part back', () => {
    // The worker gets the wire object, not the input; the tags have to survive the conversion.
    // A truss post: since main, only members that take no bending carry the tags (a frame's
    // axial load goes to the engine itself).
    const e = post();
    const input = modelStore.buildSolverInput3D(false, false);
    if (!input) throw new Error('no input');
    const wire = input3DToWireObject(input);
    const raw = { reactions: [], elementForces: [{ elementId: e, nStart: -20, nEnd: -20 }] };
    finishSolve3D(raw, wire as never);
    expect(raw.elementForces[0]!.nStart).toBeCloseTo(-q * L, 9);
    expect(raw.elementForces[0]!.nEnd).toBeCloseTo(0, 9);
  });
});

describe('the axial part of a load on a member that takes no bending', () => {
  // Every case below gives the part back; without a tag it would have nothing to give, and pass.
  it('is tagged on a truss post, and not on a frame column, whose load the engine takes itself', () => {
    post();
    expect(axialShares(modelStore.buildSolverInput3D(false, false)!.loads).size).toBe(1);
    modelStore.clear();
    column();
    expect(axialShares(modelStore.buildSolverInput3D(false, false)!.loads).size).toBe(0);
  });

  it('reaches the post on this thread', async () => {
    const p = post();
    const r = modelStore.solve3D(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    expect(forces(r, p).nStart - forces(r, p).nEnd).toBeCloseTo(-q * L, 9);
  });

  it('reaches the post through the worker pool, as the browser solves', async () => {
    // The worker as solver-worker.ts runs it: the raw solve, finished there (`solve-finish.ts`).
    // The caller adds nothing: given back twice, the post would read −2·q·L.
    const pool = await import('../solver-pool');
    const wasm = await import('../../wasm/dedaliano_engine.js');
    const spy = vi.spyOn(pool, 'solve3DInWorker').mockImplementation(async (wire: any) => finishSolve3D(wasm.solve_3d(wire), wire));
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

  it('in a case and a factored combination, and to second order', () => {
    const p = post();
    const k = modelStore.addCombination('1.4 D', [{ caseId: 1, factor: 1.4 }]);
    const lin = modelStore.solveCombinations3D(false, false, true);
    if (!lin || typeof lin === 'string') throw new Error(String(lin));
    expect(diff(lin.perCase.get(1)!, p)).toBeCloseTo(-q * L, 9);
    expect(diff(lin.perCombo.get(k)!, p)).toBeCloseTo(-1.4 * q * L, 9);
    modelStore.setAnalysis({ perCombination: 'pdelta' });
    const pd = modelStore.solveCombinations3D(false, false, true);
    if (!pd || typeof pd === 'string') throw new Error(String(pd));
    expect(diff(pd.perCombo.get(k)!, p)).toBeCloseTo(-1.4 * q * L, 6);
  });

  it('in combinations solved in parallel, the workers run as solver-worker.ts runs them', async () => {
    const pool = await import('../solver-pool');
    const wasm = await import('../../wasm/dedaliano_engine.js');
    const ready = vi.spyOn(pool, 'isPoolReady').mockReturnValue(true);
    const par = vi.spyOn(pool, 'solveParallel').mockImplementation(async (cases: Array<{ id: number; input: any }>) =>
      new Map(cases.map((c) => [c.id, finishSolve3D(wasm.solve_3d(c.input), c.input)])));
    try {
      const p = post();
      const k = modelStore.addCombination('1.4 D', [{ caseId: 1, factor: 1.4 }]);
      const b = await modelStore.solveCombinations3DParallel(false, false, true);
      if (!b || typeof b === 'string') throw new Error(String(b));
      expect(par).toHaveBeenCalled();
      expect(diff(b.perCase.get(1)!, p)).toBeCloseTo(-q * L, 9);
      expect(diff(b.perCombo.get(k)!, p)).toBeCloseTo(-1.4 * q * L, 9);
    } finally {
      ready.mockRestore();
      par.mockRestore();
    }
  });

  // The P-Delta solve as the worker runs it: raw, finished there, and nothing added by the caller.
  const workerRun = async () => {
    const wasm = await import('../../wasm/dedaliano_engine.js');
    return workerPDelta(async (wire: any, maxIter: number, tol: number) =>
      finishPDelta3D(JSON.parse((wasm as any).solve_pdelta_3d(JSON.stringify(wire), maxIter, tol)), wire));
  };

  it('in a P-Delta solve on a worker', async () => {
    const p = post();
    const input = modelStore.buildSolverInput3D(false, false)!;
    const r = await (await workerRun())(input, 30, 1e-5);
    expect(diff(r.results, p)).toBeCloseTo(-q * L, 6);
    if (r.linearResults) expect(diff(r.linearResults, p)).toBeCloseTo(-q * L, 9);
  });

  it('in the direct analysis, the same on a worker as on this thread', async () => {
    const p = post();
    const k = modelStore.addCombination('1.4 D', [{ caseId: 1, factor: 1.4 }]);
    const model = modelStore.model as never;
    const cases = modelStore.model.loadCases, combos = modelStore.model.combinations;
    const here = await runDirectAnalysis(model, cases, combos, { includeSelfWeight: false });
    const there = await runDirectAnalysis(model, cases, combos, { includeSelfWeight: false, run: await workerRun() });
    if (typeof here === 'string' || typeof there === 'string') throw new Error(String(here) + String(there));
    const a = here.perCombo.get(k)!, b = there.perCombo.get(k)!;
    expect(diff(a, p)).toBeCloseTo(-1.4 * q * L, 3);
    expect(diff(b, p)).toBeCloseTo(diff(a, p), 6);
  });

  it('in a model with a cable, which solves without the linear path', () => {
    const p = post();
    // A wire rope from the head to an anchor, pulled by a side load at the head.
    const head = modelStore.elements.get(p)!.nodeJ;
    const anchor = modelStore.addNode(0, 6, L);
    modelStore.addSupport(anchor, 'pinned3d');
    const c = modelStore.addElement(head, anchor, 'truss');
    const rope = modelStore.addSection({ name: 'Rope', a: 1e-3, iy: 1e-10, iz: 1e-10, j: 1e-10 } as never);
    modelStore.updateElementSection(c, rope);
    modelStore.updateElement(c, { behaviour: 'cable' });
    modelStore.addNodalLoad3D(head, 0, 20, 0, 0, 0, 0, 1);
    const r = modelStore.solve3D(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    expect(diff(r, p)).toBeCloseTo(-q * L, 6);
  });

  it('in a model with a multilinear spring, which re-solves through the soil-spring solver', () => {
    const p = post();
    const head = modelStore.elements.get(p)!.nodeJ;
    const s = modelStore.addSupport(head, 'custom3d', undefined, { dofRestraints: { tx: false, ty: false, tz: false, rx: false, ry: false, rz: false } });
    modelStore.updateSupport(s, { curves: { x: [[0.01, 100], [0.05, 150]] } });
    modelStore.addNodalLoad3D(head, 30, 0, 0, 0, 0, 0, 1);
    const r = modelStore.solve3D(false, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    expect(diff(r, p)).toBeCloseTo(-q * L, 6);
  });

  /*
   * PRO Advanced's soil-spring and Winkler analyses call the engine on this thread and publish
   * what it answers: `solveSSI3D` and `solveWinkler3D` return it unfinished, and
   * ProAdvancedTab's handlers finish it, as here. Unfinished, the post read its average.
   */
  it('in PRO Advanced\'s soil-spring analysis, finished as its handler finishes it', () => {
    const p = post();
    const head = modelStore.elements.get(p)!.nodeJ;
    const input = modelStore.buildSolverInput3D(false, false, { expandMemberOffsets: false })!;
    const res = solveSSI3D({
      solver: input,
      soilSprings: [{ nodeId: head, direction: 0, tributaryLength: 1, curve: { type: 'py_soft_clay', su: 50, gamma_eff: 18, d: 0.6, depth: 5, eps_50: 0.01 } }],
      maxIter: 20, tolerance: 1e-4,
    });
    expect(diff(res.results, p)).toBeCloseTo(0, 6);
    finishSolve3D(res.results, input);
    expect(diff(res.results, p)).toBeCloseTo(-q * L, 6);
  });

  it('in PRO Advanced\'s Winkler analysis, finished as its handler finishes it', () => {
    const p = post();
    const input = modelStore.buildSolverInput3D(false, false, { expandMemberOffsets: false })!;
    const res = solveWinkler3D({ solver: input, foundationSprings: [] });
    expect(diff(res, p)).toBeCloseTo(0, 6);
    finishSolve3D(res, input);
    expect(diff(res, p)).toBeCloseTo(-q * L, 6);
  });
});
