/**
 * Tests for the worker-pool single-solve path (perf/web-worker-solves):
 *  - parity: the pool solve path returns the same results as the main-thread
 *    solver (2D and 3D), exercised through an in-process FakeWorker injected
 *    via setWorkerFactoryForTests;
 *  - memoization: a second identical solve skips the engine entirely;
 *  - stale-response discipline: live-calc discards results when the model
 *    version moved (user edit) while the solve was in flight;
 *  - fallback: without Workers (Node default), the async path transparently
 *    runs the synchronous main-thread solver.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { initSolver, finiteObjectWire } from '../wasm-solver';
import * as glue from '../../wasm/dedaliano_engine.js';
import { setWorkerFactoryForTests, destroyPool, type WorkerLike } from '../solver-pool';
import {
  validateAndSolve2D,
  validateAndSolve2DAsync,
  validateAndSolve3D,
  validateAndSolve3DAsync,
  clearSolveResultCache,
  solveResultCacheSize,
  type ModelData,
} from '../solver-service';
import { runLiveCalc } from '../live-calc';
import { modelStore, resultsStore } from '../../store';

// ─── In-process fake worker (same message protocol as solver-worker.ts) ────

const fakeSolveCounts = { solve2d: 0, solve3d: 0 };

class FakeWorker implements WorkerLike {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  private terminated = false;

  postMessage(rawMsg: any): void {
    if (this.terminated) return;
    // Emulate the structured-clone boundary both ways.
    const msg = structuredClone(rawMsg);
    queueMicrotask(() => {
      if (this.terminated || !this.onmessage) return;
      const reply = (data: any) => this.onmessage!({ data } as MessageEvent);
      if (msg.type === 'init') {
        reply({ type: 'ready' });
        return;
      }
      if (msg.type === 'solve' || msg.type === 'solve3d') {
        try {
          const input = finiteObjectWire(msg.input);
          const result = msg.type === 'solve' ? glue.solve_2d(input) : glue.solve_3d(input);
          fakeSolveCounts[msg.type === 'solve' ? 'solve2d' : 'solve3d']++;
          reply({ type: 'result', id: msg.id, result: structuredClone(result) });
        } catch (err: any) {
          reply({ type: 'result', id: msg.id, error: err?.message ?? String(err) });
        }
      }
    });
  }

  terminate(): void {
    this.terminated = true;
  }
}

// ─── Fixtures ──────────────────────────────────────────────────────────────

/** 2D cantilever: fixed at node 1, tip load at node 2. */
function beam2D(): ModelData {
  return {
    nodes: new Map([
      [1, { id: 1, x: 0, y: 0 } as any],
      [2, { id: 2, x: 5, y: 0 } as any],
    ]),
    elements: new Map([
      [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 } as any],
    ]),
    materials: new Map([[1, { id: 1, e: 200_000_000, nu: 0.3, rho: 0 } as any]]),
    sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 } as any]]),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' } as any]]),
    loads: [
      { type: 'nodal', data: { id: 1, nodeId: 2, fx: 0, fz: -10, my: 0, caseId: 1 } } as any,
    ],
  };
}

/** 3D cantilever: fixed3d at node 1, tip load at node 2. */
function frame3D(): ModelData {
  return {
    nodes: new Map([
      [1, { id: 1, x: 0, y: 0, z: 0 } as any],
      [2, { id: 2, x: 5, y: 0, z: 0 } as any],
    ]),
    materials: new Map([[1, { id: 1, e: 200_000_000, nu: 0.3, rho: 0 } as any]]),
    sections: new Map([[1, { id: 1, a: 0.01, iy: 1e-4, iz: 1e-4, j: 2e-4 } as any]]),
    elements: new Map([
      [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 } as any],
    ]),
    supports: new Map([
      [1, { id: 1, nodeId: 1, type: 'fixed3d' } as any],
    ]),
    loads: [
      { type: 'nodal3d', data: { id: 1, nodeId: 2, fx: 0, fy: 0, fz: -10, mx: 0, my: 0, mz: 0 } } as any,
    ],
  };
}

// ─── Setup ─────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await initSolver();
});

beforeEach(() => {
  fakeSolveCounts.solve2d = 0;
  fakeSolveCounts.solve3d = 0;
  clearSolveResultCache();
  setWorkerFactoryForTests(() => new FakeWorker());
});

afterEach(() => {
  setWorkerFactoryForTests(null);
  destroyPool();
});

// ─── Parity: pool path vs main-thread path ─────────────────────────────────

describe('worker-pool solve parity', () => {
  it('2D: pool solve returns the same results as the main-thread solver', async () => {
    const sync = validateAndSolve2D(beam2D());
    if (typeof sync === 'string' || !sync) throw new Error(`sync 2D solve failed: ${sync}`);

    const viaPool = await validateAndSolve2DAsync(beam2D());
    if (typeof viaPool === 'string' || !viaPool) throw new Error(`pool 2D solve failed: ${viaPool}`);

    expect(fakeSolveCounts.solve2d).toBe(1); // really went through the pool
    expect(viaPool.displacements).toEqual(sync.displacements);
    expect(viaPool.reactions).toEqual(sync.reactions);
    expect(viaPool.elementForces).toEqual(sync.elementForces);
  });

  it('3D: pool solve returns the same results as the main-thread solver', async () => {
    const sync = validateAndSolve3D(frame3D());
    if (typeof sync === 'string' || !sync) throw new Error(`sync 3D solve failed: ${sync}`);

    const viaPool = await validateAndSolve3DAsync(frame3D());
    if (typeof viaPool === 'string' || !viaPool) throw new Error(`pool 3D solve failed: ${viaPool}`);

    expect(fakeSolveCounts.solve3d).toBe(1);
    expect(viaPool.displacements).toEqual(sync.displacements);
    expect(viaPool.reactions).toEqual(sync.reactions);
    expect(viaPool.elementForces).toEqual(sync.elementForces);
  });

  it('string-error semantics are preserved on the async path', async () => {
    // No supports → validation error string, same as the sync path.
    const model = beam2D();
    model.supports = new Map();
    const sync = validateAndSolve2D(model);
    const viaPool = await validateAndSolve2DAsync(model);
    expect(typeof sync).toBe('string');
    expect(viaPool).toBe(sync);
  });
});

// ─── Memoization ───────────────────────────────────────────────────────────

describe('solve-result memoization', () => {
  it('a second identical 2D solve hits the memo and skips the engine', async () => {
    const first = await validateAndSolve2DAsync(beam2D());
    expect(fakeSolveCounts.solve2d).toBe(1);

    const second = await validateAndSolve2DAsync(beam2D());
    expect(fakeSolveCounts.solve2d).toBe(1); // engine NOT called again
    expect(solveResultCacheSize()).toBe(1);
    expect(second).toBe(first); // same finalized object
  });

  it('a second identical 3D solve hits the memo and skips the engine', async () => {
    await validateAndSolve3DAsync(frame3D());
    expect(fakeSolveCounts.solve3d).toBe(1);

    const second = await validateAndSolve3DAsync(frame3D());
    expect(fakeSolveCounts.solve3d).toBe(1);
    expect(solveResultCacheSize()).toBe(1);
    if (typeof second === 'string' || !second) throw new Error('expected memoized results');
    expect(second.displacements.length).toBeGreaterThan(0);
  });

  it('2D and 3D memos are keyed independently; a changed input misses', async () => {
    await validateAndSolve2DAsync(beam2D());
    await validateAndSolve3DAsync(frame3D());
    expect(solveResultCacheSize()).toBe(2);

    // Changed load → different wire → real solve, not a hit.
    const modified = beam2D();
    modified.loads = [{ type: 'nodal', data: { id: 1, nodeId: 2, fx: 0, fz: -20, my: 0, caseId: 1 } } as any];
    await validateAndSolve2DAsync(modified);
    expect(fakeSolveCounts.solve2d).toBe(2);
  });
});

// ─── Stale-response discipline (live-calc) ─────────────────────────────────

describe('live-calc stale-response discipline', () => {
  function buildStoreModel(): void {
    modelStore.clear();
    const n1 = modelStore.addNode(0, 0);
    const n2 = modelStore.addNode(5, 0);
    modelStore.addElement(n1, n2, 'frame');
    modelStore.addSupport(n1, 'fixed');
  }

  it('writes results when the model does not change during the solve', async () => {
    buildStoreModel();
    resultsStore.clear();
    await runLiveCalc('2d', 'rightHand');
    expect(resultsStore.results).not.toBeNull();
    expect(resultsStore.results!.displacements.length).toBeGreaterThan(0);
  });

  it('discards results when the model version moved while the solve was in flight', async () => {
    buildStoreModel();
    resultsStore.clear();
    const pending = runLiveCalc('2d', 'rightHand');
    // User edited the model while the worker was still solving.
    modelStore.bumpModelVersion();
    await pending;
    expect(resultsStore.results).toBeNull();
  });
});

// ─── Fallback without Workers ──────────────────────────────────────────────

describe('no-Worker fallback (Node default)', () => {
  it('async 2D solve falls back to the main-thread solver', async () => {
    setWorkerFactoryForTests(null); // and typeof Worker === 'undefined' in vitest node
    const sync = validateAndSolve2D(beam2D());
    const r = await validateAndSolve2DAsync(beam2D());
    if (typeof r === 'string' || !r || typeof sync === 'string' || !sync) throw new Error('solve failed');
    expect(fakeSolveCounts.solve2d).toBe(0); // pool never used
    expect(r.displacements).toEqual(sync.displacements);
  });

  it('async 3D solve falls back to the main-thread solver', async () => {
    setWorkerFactoryForTests(null);
    const sync = validateAndSolve3D(frame3D());
    const r = await validateAndSolve3DAsync(frame3D());
    if (typeof r === 'string' || !r || typeof sync === 'string' || !sync) throw new Error('solve failed');
    expect(fakeSolveCounts.solve3d).toBe(0);
    expect(r.displacements).toEqual(sync.displacements);
  });
});
