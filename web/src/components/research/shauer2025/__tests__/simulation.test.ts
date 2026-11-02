import { afterEach, describe, expect, it, vi } from 'vitest';
import { SimulationController, pendingMeshMessage } from '../simulation.svelte';
import type { PlateConfig, Step, WorkerOut } from '../protocol';

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((e: { data: WorkerOut }) => void) | null = null;
  onerror: ((e: { message: string }) => void) | null = null;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() { FakeWorker.instances.push(this); }
  send(data: WorkerOut) { this.onmessage?.({ data }); }
}
const config: PlateConfig = {
  material: { e: 210, nu: 0.3, gc: 0.0027, l0: 0.0075, plane: 'strain' },
  mesh: { nx: 40, ny: 40, nx_fine: 16, ny_fine: 8, h_fine: 0.0025 },
  top_displacement: 0.01,
  controls: { dt: 0.01, total_time: 0.8, max_iterations: 1, tolerance: 1e-5, irreversibility: 'history' },
};
const step: Step = { step: 0, pseudotime: 0.01, displacement: 0.001, reaction: 1, iterations: 1,
  converged: false, residual: 1, damage_max: 0.1, damage_min: 0, elastic_energy: 1, fracture_energy: 0.1 };
afterEach(() => { vi.unstubAllGlobals(); FakeWorker.instances = []; });

describe('simulation failures', () => {
  it('labels non-convergence, stops the worker and never reuses the failed run', () => {
    vi.stubGlobal('Worker', FakeWorker);
    const sim = new SimulationController(); sim.run(config);
    const worker = FakeWorker.instances[0];
    worker.send({ type: 'step', runId: 1, step, damage: new Float32Array([0.1]), displacement: new Float32Array(2), syy: new Float32Array(1) });
    worker.send({ type: 'done', runId: 1, seconds: 1 });
    const failed = sim.current;
    expect(failed?.status).toBe('unconverged');
    expect(worker.terminate).toHaveBeenCalledOnce();
    sim.run(config);
    expect(sim.current).not.toBe(failed);
    expect(sim.current?.origin).toBe('live');
    expect(FakeWorker.instances).toHaveLength(2);
  });
  it('resets after a worker error and can run and cache successfully on retry', () => {
    vi.stubGlobal('Worker', FakeWorker);
    const sim = new SimulationController(); sim.run(config);
    const failed = sim.current;
    FakeWorker.instances[0].onerror?.({ message: 'worker crashed' });
    expect(failed?.status).toBe('error');
    expect(failed?.error).toBe('worker crashed');
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
    sim.run(config);
    expect(sim.current).not.toBe(failed);
    const retry = FakeWorker.instances[1];
    retry.send({ type: 'step', runId: 2, step: { ...step, converged: true }, damage: new Float32Array(1), displacement: new Float32Array(2), syy: new Float32Array(1) });
    retry.send({ type: 'done', runId: 2, seconds: 1 });
    const done = sim.current; sim.run(config);
    expect(sim.current).toBe(done);
    expect(sim.current?.origin).toBe('cached');
    expect(sim.available).toBe(true);
  });
});


it('stops an active run before selecting a cached result and ignores abandoned worker messages', () => {
  vi.stubGlobal('Worker', FakeWorker);
  const sim = new SimulationController();
  sim.run(config);
  const worker = FakeWorker.instances[0];
  worker.send({ type: 'done', runId: 1, seconds: 1 });
  const cached = sim.current;
  sim.run({ ...config, top_displacement: 0.02 });
  const abandoned = sim.current;
  sim.run(config);
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(abandoned?.status).toBe('stopped');
  expect(sim.current).toBe(cached);
  worker.send({ type: 'step', runId: 2, step, damage: new Float32Array(1), displacement: new Float32Array(2), syy: new Float32Array(1) });
  worker.send({ type: 'done', runId: 2, seconds: 2 });
  worker.send({ type: 'unavailable', message: 'late failure' });
  worker.onerror?.({ message: 'late crash' });
  expect(abandoned?.frames).toHaveLength(0);
  expect(abandoned?.status).toBe('stopped');
  expect(sim.current).toBe(cached);
  expect(sim.available).toBe(true);
  expect(sim.unavailableReason).toBeNull();
  sim.dispose();
});

it('records a synchronous Worker constructor failure before mesh creation', () => {
  vi.stubGlobal('Worker', class { constructor() { throw new Error('Worker blocked'); } });
  const sim = new SimulationController();
  expect(() => sim.run(config)).not.toThrow();
  expect(sim.current?.nodes).toBeNull();
  expect(sim.current?.status).toBe('error');
  expect(sim.current?.error).toBe('Worker blocked');
  sim.dispose();
});

it('stops before a delayed mesh arrives and ignores that mesh', () => {
  vi.stubGlobal('Worker', FakeWorker);
  const sim = new SimulationController();
  sim.run(config);
  const worker = FakeWorker.instances[0];
  sim.stop();
  worker.send({ type: 'mesh', runId: 1, nodes: new Float64Array(8), elements: new Uint32Array(4) });
  expect(sim.current?.nodes).toBeNull();
  expect(sim.current?.status).toBe('stopped');
  expect(pendingMeshMessage(sim.current, null)).toBe('Stopped. Press Recompute live to restart.');
  expect(worker.terminate).toHaveBeenCalledOnce();
});
