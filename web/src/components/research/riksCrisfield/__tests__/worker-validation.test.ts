import { expect, it, vi } from 'vitest';
import { validatePrefix, type RawResult } from '../worker-validation';
const full: RawResult = { steps: [1,2].map(step => ({step, loadFactor: step / 10, iterations: 2, converged: true, controlDisplacement: step / 100})), converged: true, finalLoadFactor: .2, totalIterations: 4, results: { displacements: [{nodeId:1, ux:0,uz:-.02,ry:0}] } };
it('accepts complete matching prefixes', () => {
  expect(validatePrefix(full, structuredClone(full), 2, [1], 2).get(1)!.uz).toBe(-.02);
});
it.each(['loadFactor', 'iterations', 'converged', 'controlDisplacement', 'step'])('rejects an earlier %s mismatch even with an identical last step', key => {
  const p = structuredClone(full);
  Object.assign(p.steps[0], { [key]: key === 'converged' ? false : 42 });
  expect(() => validatePrefix(full,p,2,[1], 2)).toThrow();
});
it.each([NaN, Infinity, undefined])('rejects missing and nonfinite displacement components: %s', value => {
  for (const key of ['ux','uz','ry']) {
    const p = structuredClone(full);
    Object.assign(p.results.displacements[0], {[key]:value});
    expect(() => validatePrefix(full,p,2,[1], 2)).toThrow();
  }
});
it('rejects absent nodes, extra steps and nonfinite load factors', () => {
  expect(() => validatePrefix(full,full,2,[1,2], 2)).toThrow();
  expect(() => validatePrefix(full,full,1,[1], 2)).toThrow();
  const p = structuredClone(full); p.steps[0].loadFactor = NaN;
  expect(() => validatePrefix(full,p,2,[1], 2)).toThrow();
});
it.each([['finalLoadFactor', .3], ['totalIterations', 5], ['converged', false]] as const)('rejects a %s summary that disagrees with the steps, in the prefix or the full run', (key, value) => {
  const p = structuredClone(full);
  Object.assign(p, { [key]: value });
  expect(() => validatePrefix(full, p, 2, [1], 2)).toThrow('Invalid prefix result');
  expect(() => validatePrefix(p, structuredClone(full), 2, [1], 2)).toThrow('Invalid full result');
});

it('accepts successful prefixes and a truncated run after rejected arc trials', () => {
  const retried: RawResult = { ...full, totalIterations: 7, rejectedIterations: 3 };
  const truncated: RawResult = { ...retried, converged: false, totalIterations: 9, rejectedIterations: 5 };
  expect(validatePrefix(retried, retried, 2, [1], 2).get(1)!.uz).toBe(-.02);
  expect(validatePrefix(truncated, retried, 2, [1], 3).get(1)!.uz).toBe(-.02);
  expect(() => validatePrefix(retried, full, 2, [1], 2)).toThrow('Invalid prefix result');
  expect(() => validatePrefix({ ...truncated, rejectedIterations: 4 }, retried, 2, [1], 3)).toThrow('Invalid full result');
});

it('publishes the accepted frames when production WASM retries or reaches the radius floor', async () => {
  const { default: fixture } = await import('../../../../../../scripts/tests/fixtures/experimental-nonlinear-two-bar.json');
  const solver = structuredClone(fixture);
  solver.nodes[2].z = 2;
  solver.materials[1].e = 0.01;
  const worker = { onmessage: null as ((event: MessageEvent) => Promise<void>) | null, postMessage: vi.fn() };
  vi.stubGlobal('self', worker);
  try {
    await import('../arc.worker');
    for (const [minDs, converged, frames] of [[3, false, 1], [1.5, true, 2]] as const) {
      worker.postMessage.mockClear();
      const input = { solver, maxSteps: 2, maxIter: 20, tolerance: 1e-8, initialDs: 3, minDs, maxDs: 3 };
      await worker.onmessage!(new MessageEvent('message', {
        data: { runId: 1, input, apexNodeId: 2, direction: 'downward', referenceLoad: 1 },
      }));
      const events = worker.postMessage.mock.calls.map(([event]) => event);
      expect(events.map(event => event.type)).toEqual([...Array(frames).fill('frame'), 'done']);
      const last = events.at(-1)!;
      expect(last).toMatchObject({ runId: 1, converged, finalLoadFactor: events[frames - 1].frame.loadFactor });
      expect(last.totalIterations).toBeGreaterThan(events.slice(0, frames).reduce((sum, event) => sum + event.frame.iterations, 0));
    }
  } finally {
    vi.unstubAllGlobals();
  }
});
