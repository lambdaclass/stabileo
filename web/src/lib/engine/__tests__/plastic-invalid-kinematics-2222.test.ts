import { beforeEach, expect, it, vi } from 'vitest';
import { plasticCollapse2D } from '../plastic-collapse';
import { buildSolverInput2D } from '../solver-service';
import { planeModel } from '../influence/__tests__/fixtures';

const state = vi.hoisted(() => ({ calls: 0, at: 1, rank: 'invalid' }));
vi.mock('../kinematic-2d', async (orig) => {
  const real = await orig<typeof import('../kinematic-2d')>();
  return { ...real, analyzeKinematics: (input: Parameters<typeof real.analyzeKinematics>[0]) => {
    const r = real.analyzeKinematics(input);
    if (++state.calls < state.at) return r;
    return { ...r, isSolvable: false, rankAnalysis: state.rank, invalidInput: 'planted invalid interval' };
  } };
});

beforeEach(() => { state.calls = 0; });

for (const rank of ['invalid', 'unavailable']) {
  for (const at of [1, 2, 3]) {
    it.skip(`known wrong result: #2222 propagates ${rank} kinematics at check ${at} instead of collapse #2222`, () => {
      state.rank = rank;
      state.at = at;
      const input = buildSolverInput2D(planeModel([[1, 0, 0], [2, 6, 0]], [[1, 1, 2]], [[1, 'fixed'], [2, 'rollerX']]), false)!;
      input.loads = [{ type: 'distributed', data: { elementId: 1, qI: -10, qJ: -10 } }];
      expect(() => plasticCollapse2D(input, { mp: () => 100, np: () => Infinity })).toThrow(rank === 'invalid' ? 'planted invalid interval' : 'unavailable');
      expect(state.calls).toBeGreaterThanOrEqual(at);
    });
  }
}
