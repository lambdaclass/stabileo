import { afterEach, expect, it, vi } from 'vitest';
import replay from '../../../../../../research/benchmarks/dadeppo-arch-1975/results/stabileo_results.json';
import type { Frame, Step } from '../case';

afterEach(() => vi.unstubAllGlobals());
it('computes the short live path with the production solver and publishes its final shape', async () => {
  const messages: { frame?: Frame; steps?: Step[]; done?: boolean; error?: string }[] = [];
  const worker = { onmessage: null as unknown as (event: { data: { maxSteps: number } }) => Promise<void>, postMessage: (message: typeof messages[number]) => messages.push(message) };
  vi.stubGlobal('self', worker);
  await import('../solver.worker');
  await worker.onmessage({ data: { maxSteps: 20 } });
  expect(messages).toHaveLength(2);
  expect(messages[1]).toEqual({ done: true });
  expect(messages[0].steps).toHaveLength(20);
  expect(messages[0].steps!.every(step => step.converged)).toBe(true);
  expect(messages[0].frame!.loadFactor).toBeCloseTo(replay.frames[0].loadFactor, 8);
  for (const expected of replay.frames[0].displacements) {
    const actual = messages[0].frame!.displacements.find(d => d.nodeId === expected.nodeId)!;
    expect(actual.ux).toBeCloseTo(expected.ux, 8);
    expect(actual.uz).toBeCloseTo(expected.uz, 8);
  }
});
