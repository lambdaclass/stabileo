import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => undefined) }));
vi.mock('../../engine/wasm-solver', () => ({ initSolver: vi.fn(), solve: vi.fn(), input2DToWireObject: vi.fn() }));
vi.mock('../../engine/solver-pool', () => ({ solve2DInWorker: vi.fn() }));
import { initSolver, solve } from '../../engine/wasm-solver';
import { solve2DInWorker } from '../../engine/solver-pool';

const answer = () => ({
  displacements: [{ nodeId: 2, ux: 0, uz: -80 / 60000, ry: 0 }],
  reactions: [{ nodeId: 1, rx: 0, rz: 10, my: 20 }],
}) as ReturnType<typeof solve>;
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_DESKTOP', '1');
  vi.mocked(initSolver).mockResolvedValue(undefined);
  vi.mocked(solve).mockReturnValue(answer());
  vi.mocked(solve2DInWorker).mockResolvedValue(answer());
});
it('accepts signed analytical displacement and support equilibrium', async () => {
  expect(await (await import('../self-check')).runSelfCheck()).toBe(true);
});
it.each(['main', 'worker', 'reaction', 'initialization'])('fails closed for incorrect %s results', async source => {
  const wrong = answer();
  wrong.displacements[0].uz *= -1;
  if (source === 'main') vi.mocked(solve).mockReturnValue(wrong);
  if (source === 'worker') vi.mocked(solve2DInWorker).mockResolvedValue(wrong);
  if (source === 'reaction') {
    const result = answer(); result.reactions[0].my *= -1;
    vi.mocked(solve).mockReturnValue(result);
  }
  if (source === 'initialization') vi.mocked(initSolver).mockRejectedValueOnce(new Error('init failed'));
  expect(await (await import('../self-check')).runSelfCheck()).toBe(false);
  const gate = await import('../../engine/calculation-gate');
  expect(() => gate.assertCalculationsAllowed()).toThrow('self-check');
  gate.refuseNewJobs(null);
  expect(() => gate.assertCalculationsAllowed()).toThrow('self-check');
});
