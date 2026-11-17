import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import * as native from '../../wasm/dedaliano_engine.js';
import { initSolver } from '../wasm-solver';
import { nonlinearWorkerReply, nonlinearWorkerSession } from '../nonlinear-worker-session';
import { destroyPool, initPool, setWorkerFactoryForTests, type WorkerLike } from '../solver-pool';
import { solveCombinations3D, solveCombinations3DParallel, validateAndSolve3DAsync, type ModelData } from '../solver-service';
import { modelStore, uiStore } from '../../store';

let steps: string[], freed: number;
class FakeWorker implements WorkerLike {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  sessions = new Map<number, ReturnType<typeof nonlinearWorkerSession>>();
  terminated = false;
  postMessage(raw: any) {
    const msg = structuredClone(raw);
    setTimeout(() => {
      if (this.terminated) return;
      const reply = (data: any) => this.onmessage?.({ data: structuredClone(data) } as MessageEvent);
      if (msg.type === 'init') { reply({ type: 'ready' }); return; }
      if (msg.type === 'nonlinear-free') freed++;
      else if (msg.type === 'nonlinear-step') steps.push(msg.input.kind);
      else throw new Error(`Unexpected job ${msg.type}`);
      reply({ type: 'result', id: msg.id, ...nonlinearWorkerReply(this.sessions, native, msg) });
    }, 0);
  }
  terminate() { this.terminated = true; for (const session of this.sessions.values()) session.free(); this.sessions.clear(); }
}

beforeAll(initSolver);
beforeEach(() => {
  modelStore.clear(); uiStore.analysisMode = 'pro'; steps = []; freed = 0;
  setWorkerFactoryForTests(() => new FakeWorker());
});
afterEach(() => { setWorkerFactoryForTests(null); vi.restoreAllMocks(); modelStore.clear(); });
const output = (v: unknown) => JSON.stringify(v, (key, value) => key === 'timings' ? undefined : value instanceof Map ? [...value] : value);
const md = (): ModelData => ({ nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports, loads: modelStore.loads, materials: modelStore.materials, sections: modelStore.sections, analysis: modelStore.model.analysis });
function beam(kind: 'uplift' | 'curves' | 'cable' = 'uplift') {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(3, 0, 0), c = modelStore.addNode(6, 0, 0);
  modelStore.addElement(a, b, 'frame'); modelStore.addElement(b, c, 'frame');
  modelStore.addSupport(a, 'fixed3d', undefined, kind === 'uplift' ? { dz: -0.001 } : {});
  const support = modelStore.addSupport(b, 'custom3d', undefined, { dofRestraints: { tx: false, ty: false, tz: kind !== 'curves', rx: false, ry: false, rz: false } });
  if (kind === 'uplift') modelStore.updateSupport(support, { uplift: true });
  if (kind === 'curves') modelStore.updateSupport(support, { curves: { z: [[0.01, 100], [0.05, 150]] } });
  if (kind === 'cable') {
    const anchor = modelStore.addNode(0, 0, 5);
    modelStore.addSupport(anchor, 'fixed3d');
    const cable = modelStore.addElement(anchor, c, 'truss');
    modelStore.updateElement(cable, { behaviour: 'cable', cablePretension: 10 });
  }
  const [down, up] = modelStore.model.loadCases;
  modelStore.addNodalLoad3D(c, 0, 0, -10, 0, 0, 0, down!.id);
  modelStore.addNodalLoad3D(c, 0, 0, 10, 0, 0, 0, up!.id);
  modelStore.model.combinations = [{ id: 1, name: 'reverse', factors: [{ caseId: down!.id, factor: -1 }] }];
  return { a, b, c };
}

it.each(['uplift', 'curves', 'cable'] as const)('preserves complete %s results for single solves and combinations', async kind => {
  beam(kind);
  const single = modelStore.solve3D(false, false, true);
  expect(single && typeof single === 'object').toBe(true);
  expect(output(await modelStore.solve3DAsync(false, false, true))).toBe(output(single));
  const expected = modelStore.solveCombinations3D(false, false, true);
  expect(expected && typeof expected === 'object').toBe(true);
  expect(output(await modelStore.solveCombinations3DParallel(false, false, true))).toBe(output(expected));
  expect(steps).toContain(kind === 'curves' ? 'ssi' : kind === 'cable' ? 'cable' : 'linear');
  expect(freed).toBe(2);
});

it('preserves all industrial active sets and reuses the first matrix across cases', async () => {
  await modelStore.loadExample('3d-nave-industrial');
  const expected = modelStore.solveCombinations3D(true, false, true);
  expect(expected && typeof expected === 'object').toBe(true);
  const solve = vi.spyOn(native.LoadSession3D.prototype, 'solve');
  const free = vi.spyOn(native.LoadSession3D.prototype, 'free');
  expect(output(await modelStore.solveCombinations3DParallel(true, false, true))).toBe(output(expected));
  expect(solve).toHaveBeenCalledTimes(10);
  expect(free).toHaveBeenCalledOnce();
  expect(steps).toHaveLength(31);
}, 30000);

it('preserves explicitly superposed nonlinear combinations', async () => {
  beam(); modelStore.adoptAnalysis({ combinationMethod: 'superpose' });
  const expected = modelStore.solveCombinations3D(false, false, true);
  expect(expected && typeof expected === 'object').toBe(true);
  expect(output(await modelStore.solveCombinations3DParallel(false, false, true))).toBe(output(expected));
});

it('cancels between native solves, releases the matrix and permits a subsequent solve', async () => {
  beam();
  const signal = new AbortController(), progress: number[] = [];
  const free = vi.spyOn(native.LoadSession3D.prototype, 'free');
  await expect(solveCombinations3DParallel(md(), modelStore.model.loadCases, modelStore.model.combinations, false, false, undefined, {
    signal: signal.signal, onProgress: n => { progress.push(n); signal.abort(); },
  })).rejects.toMatchObject({ name: 'AbortError' });
  expect(progress).toEqual([1]); expect(steps).toHaveLength(1); expect(free).toHaveBeenCalledOnce();
  expect(output(await modelStore.solveCombinations3DParallel(false, false, true))).toBe(output(modelStore.solveCombinations3D(false, false, true)));
});

it('captures model and combinations before yielding, including proxy-backed nested values', async () => {
  const { c } = beam();
  const model = md(), cases = modelStore.model.loadCases, combos = modelStore.model.combinations;
  combos[0]!.factors = new Proxy(combos[0]!.factors, {});
  const expected = solveCombinations3D(model, cases, combos);
  const pending = solveCombinations3DParallel(model, cases, combos);
  model.nodes.get(c)!.x += 3;
  combos[0]!.factors[0]!.factor = 2;
  expect(output(await pending)).toBe(output(expected));
});

it('reports worker solve failures without silently rerunning on the main thread', async () => {
  beam();
  const solve = vi.spyOn(native.LoadSession3D.prototype, 'solve').mockImplementationOnce(() => { throw 'injected refusal'; });
  const free = vi.spyOn(native.LoadSession3D.prototype, 'free');
  expect(await modelStore.solveCombinations3DParallel(false, false, true)).toContain('injected refusal');
  expect(solve).toHaveBeenCalledOnce(); expect(free).toHaveBeenCalledOnce(); expect(freed).toBe(1);
});

it('falls back only when workers are unavailable', async () => {
  beam(); setWorkerFactoryForTests(null);
  expect(output(await modelStore.solveCombinations3DParallel(false, false, true))).toBe(output(modelStore.solveCombinations3D(false, false, true)));
});

it('rejects an in-flight session when the pool is destroyed', async () => {
  beam();
  const pending = solveCombinations3DParallel(md(), modelStore.model.loadCases, modelStore.model.combinations, false, false, undefined, { onProgress: () => destroyPool() });
  expect(await pending).toContain('closed');
});

it.each(['curves', 'cable'] as const)('preserves the prescribed-displacement refusal for %s', async kind => {
  const { a } = beam(kind);
  const support = [...modelStore.supports.values()].find(s => s.nodeId === a)!;
  modelStore.updateSupport(support.id, { dz: -0.001 });
  const expected = modelStore.solveCombinations3D(false, false, true);
  expect(typeof expected).toBe('string');
  expect(await modelStore.solveCombinations3DParallel(false, false, true)).toBe(expected);
});

it.each(['crash', 'destroy'] as const)('settles an outstanding native solve after worker %s', async failure => {
  beam();
  setWorkerFactoryForTests(() => {
    const worker = new FakeWorker(), post = worker.postMessage.bind(worker);
    worker.postMessage = msg => {
      if (msg.type !== 'nonlinear-step') return post(msg);
      queueMicrotask(() => failure === 'crash' ? worker.onerror?.({ message: 'injected crash' }) : destroyPool());
    };
    return worker;
  });
  expect(await modelStore.solveCombinations3DParallel(false, false, true)).toContain(failure === 'crash' ? 'injected crash' : 'destroyed');
});


it.each(['crash', 'destroy', 'refusal'] as const)('preserves the answer when cleanup encounters %s', async failure => {
  beam();
  const expected = modelStore.solveCombinations3D(false, false, true);
  setWorkerFactoryForTests(() => {
    const worker = new FakeWorker(), post = worker.postMessage.bind(worker);
    worker.postMessage = msg => {
      if (msg.type !== 'nonlinear-free') return post(msg);
      queueMicrotask(() => {
        if (failure === 'crash') worker.onerror?.({ message: 'cleanup crash' });
        else if (failure === 'destroy') destroyPool();
        else worker.onmessage?.({ data: { type: 'result', id: msg.id, error: 'cleanup refused' } } as MessageEvent);
      });
    };
    return worker;
  });
  expect(output(await modelStore.solveCombinations3DParallel(false, false, true))).toBe(output(expected));
});

it('does not retry native cleanup after it throws', () => {
  const free = vi.fn(() => { throw new Error('native free failed'); });
  const session = nonlinearWorkerSession({ LoadSession3D: class {
    solve() { return { reactions: [], elementForces: [] }; }
    free = free;
  } });
  session.solve({ kind: 'linear', reuse: true, input: { supports: {}, loads: [] } });
  expect(() => session.free()).toThrow('native free failed');
  expect(() => session.free()).not.toThrow();
  expect(free).toHaveBeenCalledOnce();
});

it.each(['single', 'combinations'] as const)('honors cancellation during failed worker initialization for %s', async mode => {
  beam();
  const controller = new AbortController();
  setWorkerFactoryForTests(() => {
    const worker = new FakeWorker();
    worker.postMessage = () => queueMicrotask(() => {
      controller.abort();
      worker.onmessage?.({ data: { type: 'error', message: 'initialization failed' } } as MessageEvent);
    });
    return worker;
  });
  const solve = vi.spyOn(native.LoadSession3D.prototype, 'solve');
  const options = { signal: controller.signal };
  const result = mode === 'single'
    ? validateAndSolve3DAsync(md(), false, false, options)
    : solveCombinations3DParallel(md(), modelStore.model.loadCases, modelStore.model.combinations, false, false, undefined, options);
  await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  expect(solve).not.toHaveBeenCalled();
});

it.each([false, true])('keeps concurrent initialization on one attempt after a failure (worker ready: %s)', async ready => {
  const workers: FakeWorker[] = [];
  setWorkerFactoryForTests(() => {
    const worker = new FakeWorker(); worker.postMessage = () => {};
    workers.push(worker); return worker;
  });
  const settled = (promise: Promise<void>) => promise.then(() => null, error => error);
  const first = settled(initPool(2));
  if (ready) workers[0]!.onmessage?.({ data: { type: 'ready' } } as MessageEvent);
  workers[0]!.onerror?.({ message: 'initialization failed' });
  const second = settled(initPool(2));
  const count = workers.length;
  // Settle all pending workers even on the broken path, so the test cannot leak promises.
  for (const worker of workers.slice(1)) worker.onmessage?.({ data: { type: 'ready' } } as MessageEvent);
  const outcomes = await Promise.all([first, second]);
  expect(count).toBe(2);
  for (const error of outcomes) expect(error?.message).toContain('initialization');
  expect(workers.every(w => w.terminated)).toBe(true);
});


it('keeps the original solve error when native cleanup also fails', () => {
  const free = vi.fn(() => { throw new Error('native free failed'); });
  const wasm = { LoadSession3D: class {
    solve() { throw new Error('original solve refusal'); }
    free = free;
  } };
  const sessions = new Map();
  const reply = nonlinearWorkerReply(sessions, wasm, { type: 'nonlinear-step', sessionId: 1,
    input: { kind: 'linear', reuse: true, input: { supports: {}, loads: [] } } });
  expect(reply).toEqual({ error: 'original solve refusal', fatal: true });
  expect(sessions.size).toBe(0);
  expect(free).toHaveBeenCalledOnce();
  expect(nonlinearWorkerReply(sessions, wasm, { type: 'nonlinear-free', sessionId: 1 })).toEqual({ result: null });
  expect(free).toHaveBeenCalledOnce();
});


it('retires a worker after failed native cleanup and preserves its original refusal', async () => {
  beam();
  vi.spyOn(native.LoadSession3D.prototype, 'solve').mockImplementationOnce(() => { throw 'primary refusal'; });
  const originalFree = native.LoadSession3D.prototype.free;
  const free = vi.spyOn(native.LoadSession3D.prototype, 'free').mockImplementationOnce(function (this: native.LoadSession3D) {
    originalFree.call(this);
    throw new Error('cleanup failed');
  });
  expect(await modelStore.solveCombinations3DParallel(false, false, true)).toContain('primary refusal');
  expect(free).toHaveBeenCalledOnce();
  expect(output(await modelStore.solveCombinations3DParallel(false, false, true))).toBe(output(modelStore.solveCombinations3D(false, false, true)));
});
