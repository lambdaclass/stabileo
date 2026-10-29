import { expect, it, vi } from 'vitest';
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => undefined) }));
vi.mock('../../engine/solver-pool', async importOriginal => {
  const original = await importOriginal<typeof import('../../engine/solver-pool')>();
  return { ...original, solve2DInWorker: async (wire: unknown) => {
    const { solve_2d } = await import('../../wasm/dedaliano_engine.js');
    return solve_2d(wire);
  } };
});
import { runSelfCheck } from '../self-check';
it('the bundled engine satisfies signed displacement and reaction equilibrium', async () => {
  expect(await runSelfCheck()).toBe(true);
});
