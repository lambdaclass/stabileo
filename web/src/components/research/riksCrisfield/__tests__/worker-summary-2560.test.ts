import { expect, it, vi } from 'vitest';
import { solveArcLength } from '../../../../lib/engine/wasm-solver';
import type { RawResult } from '../worker-validation';

vi.mock('../../../../lib/engine/wasm-solver', () => ({
  initSolver: vi.fn(),
  solveArcLength: vi.fn(),
}));

async function reply(result: RawResult) {
  const worker = {
    onmessage: null as ((event: MessageEvent) => Promise<void>) | null,
    postMessage: vi.fn(),
  };
  const solve = vi.mocked(solveArcLength);
  solve.mockReset().mockReturnValue(result);
  vi.stubGlobal('self', worker);
  vi.resetModules();
  try {
    await import('../arc.worker');
    await worker.onmessage!(new MessageEvent('message', {
      data: {
        runId: 1,
        input: { maxSteps: 2, solver: { nodes: { 1: { id: 1 } } } },
        apexNodeId: 1,
        direction: 'downward',
        referenceLoad: 1,
      },
    }));
    return { events: worker.postMessage.mock.calls.map(([event]) => event), solves: solve.mock.calls.length };
  } finally {
    vi.unstubAllGlobals();
  }
}

const empty: RawResult = {
  steps: [],
  converged: false,
  finalLoadFactor: 0,
  rejectedIterations: 2,
  totalIterations: 2,
  results: { displacements: [{ nodeId: 1, ux: 0, uz: 0, ry: 0 }] },
};

it('#2560 refuses a successful empty full solve before prefix playback', async () => {
  const { events, solves } = await reply({
    ...empty,
    converged: true,
    finalLoadFactor: 1,
    totalIterations: 0,
    rejectedIterations: 0,
  });
  expect(solves).toBe(1);
  expect(events).toEqual([{ type: 'error', runId: 1, error: 'Invalid full result' }]);
});

it('reports a valid zero-step nonconvergence', async () => {
  const { events, solves } = await reply(empty);
  expect(solves).toBe(1);
  expect(events).toEqual([{
    type: 'done',
    runId: 1,
    converged: false,
    finalLoadFactor: 0,
    totalIterations: 2,
  }]);
});

it.each([
  { converged: true },
  { finalLoadFactor: 1 },
  { totalIterations: 1 },
  { rejectedIterations: -1 },
])('#2560 refuses inconsistent empty summaries with %j', async (summary) => {
  const { events, solves } = await reply({ ...empty, ...summary });
  expect(solves).toBe(1);
  expect(events).toEqual([{ type: 'error', runId: 1, error: 'Invalid full result' }]);
});

it('#2560 checks the last step before requesting the first prefix', async () => {
  const { events, solves } = await reply({
    ...empty,
    steps: [
      { step: 1, iterations: 1, converged: true, loadFactor: 0.1, controlDisplacement: 0.1 },
      { step: 2, iterations: 1, converged: true, loadFactor: 0.2, controlDisplacement: NaN },
    ],
    converged: true,
    finalLoadFactor: 0.2,
    totalIterations: 4,
  });
  expect(solves).toBe(1);
  expect(events).toEqual([{ type: 'error', runId: 1, error: 'Invalid full result' }]);
});
