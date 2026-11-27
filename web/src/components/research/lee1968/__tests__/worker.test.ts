import { expect, it, vi } from 'vitest';
import { refinedInput } from '../case';

it('publishes the first confirmed native-step peak before a refined solve stops', async () => {
  const input = refinedInput(2);
  const sent: { frame?: { step: number }; peak?: number; error?: string }[] = [];
  const worker = { postMessage: (m: typeof sent[number]) => sent.push(m), onmessage: undefined as unknown as (e: { data: { split: number } }) => Promise<void> };
  vi.stubGlobal('self', worker);
  const engine = await import('../../../../lib/engine/wasm-solver');
  vi.spyOn(engine, 'initSolver').mockResolvedValue(undefined);
  vi.spyOn(engine, 'solveArcLength').mockImplementation((i) => {
    if (i.maxSteps! > 4) throw new Error('later solver failure');
    const loads = [1, 2, 3, 1].slice(0, i.maxSteps);
    return { converged: true, finalLoadFactor: loads.at(-1)!, steps: loads.map(loadFactor => ({ loadFactor })),
      results: { displacements: Object.values(input.solver.nodes).map(n => ({ nodeId: n.id, ux: 0, uz: 0 })) } } as ReturnType<typeof engine.solveArcLength>;
  });
  try {
    await import('../solve.worker');
    await worker.onmessage({ data: { split: 2 } });
    if (process.env.RUN_KNOWN_WRONG) expect(sent.filter(m => m.frame).map(m => m.frame!.step), 'known wrong result: #2505').toEqual([2, 3, 4]);
    expect(sent.find(m => m.frame?.step === 4)?.peak).toBe(3);
    expect(sent.at(-1)?.error).toBe('solveError');
  } finally { vi.restoreAllMocks(); vi.unstubAllGlobals(); }
});
