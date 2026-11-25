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

const reproduce = process.env.RUN_KNOWN_WRONG === '2560' ? it : it.skip;

reproduce('known wrong result: #2560 refuses a successful empty full solve before prefix playback', async () => {
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
