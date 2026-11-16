import { beforeEach, expect, it, vi } from 'vitest';
import { plasticCollapse2D } from '../plastic-collapse';
import { buildSolverInput2D } from '../solver-service';
import { planeModel } from '../influence/__tests__/fixtures';

const state = vi.hoisted(() => ({ calls: 0, at: 1, rank: 'invalid', once: false, nonfinite: false, orphan: false, generatedMoment: Infinity }));
vi.mock('../kinematic-2d', async (orig) => {
  const real = await orig<typeof import('../kinematic-2d')>();
  return { ...real, analyzeKinematics: (input: Parameters<typeof real.analyzeKinematics>[0]) => {
    const r = real.analyzeKinematics(input);
    if (++state.calls < state.at || (state.once && state.calls > state.at)) return { ...r, rankAnalysis: 'available' };
    if (state.nonfinite) input.loads.push({ type: 'nodal', data: { nodeId: 2, fx: 0, fz: 0, my: state.generatedMoment } });
    return { ...r, isSolvable: false, rankAnalysis: state.rank, invalidInputKind: state.orphan ? 'unsupportedNodalMoment' : undefined, invalidInput: state.orphan ? 'Nodal moment at node 2 is not supported: no unhinged frame end, rotational support, rotational connector or constraint gives that node rotational stiffness (every frame is hinged there, or only trusses reach it), so the moment would not reach the structure. Apply it as a force couple, or connect the node to an unhinged frame end' : 'planted invalid interval' };
  } };
});

beforeEach(() => { state.calls = 0; state.once = false; state.nonfinite = false; state.orphan = false; state.generatedMoment = Infinity; });

for (const moment of [0, 1]) for (const rank of ['invalid', 'unavailable']) {
  for (const [at, maxEvents] of [[1, 200], [2, 200], [3, 200], [3, 1]]) {
    it(`propagates ${rank} kinematics at check ${at} with ${maxEvents} events and moment ${moment} instead of collapse #2222`, () => {
      state.rank = rank;
      state.at = at;
      const input = buildSolverInput2D(planeModel([[1, 0, 0], [2, 6, 0]], [[1, 1, 2]], [[1, 'fixed'], [2, 'rollerX']]), false)!;
      input.loads = [{ type: 'distributed', data: { elementId: 1, qI: -10, qJ: -10 } }];
      input.loads.push({ type: 'nodal', data: { nodeId: 2, fx: 0, fz: 0, my: moment } });
      expect(() => plasticCollapse2D(input, { mp: () => 100, np: () => Infinity, maxEvents })).toThrow(rank === 'invalid' ? 'planted invalid interval' : 'unavailable');
      expect(state.calls).toBeGreaterThanOrEqual(at);
    });
  }
}

for (const nonfinite of [false, true]) for (const at of [2, 3]) it(`known wrong result: #2222 — invalid check ${at} remains an error when moment-free probe succeeds, nonfinite=${nonfinite}`, () => {
  state.once = true;
  state.nonfinite = nonfinite;
  state.at = at;
  state.rank = 'invalid';
  const input = buildSolverInput2D(planeModel([[1, 0, 0], [2, 6, 0]], [[1, 1, 2]], [[1, 'fixed'], [2, 'rollerX']]), false)!;
  input.loads = [{ type: 'distributed', data: { elementId: 1, qI: -10, qJ: -10 } }, { type: 'nodal', data: { nodeId: 2, fx: 0, fz: 0, my: 1 } }];
  expect(() => plasticCollapse2D(input, { mp: () => 100, np: () => Infinity, maxEvents: 200 })).toThrow('planted invalid interval');
  expect(state.calls).toBe(at);
});

for (const moment of [NaN, Infinity, -Infinity]) for (const at of [2, 3]) it(`known wrong result: #2222 — orphan diagnostic with generated moment ${moment} at ${at} refuses before a successful probe`, () => {
  state.once = true;
  state.nonfinite = true;
  state.orphan = true;
  state.generatedMoment = moment;
  state.at = at;
  state.rank = 'invalid';
  const input = buildSolverInput2D(planeModel([[1, 0, 0], [2, 6, 0]], [[1, 1, 2]], [[1, 'fixed'], [2, 'rollerX']]), false)!;
  input.loads = [{ type: 'distributed', data: { elementId: 1, qI: -10, qJ: -10 } }, { type: 'nodal', data: { nodeId: 2, fx: 0, fz: 0, my: 1 } }];
  expect(() => plasticCollapse2D(input, { mp: () => 100, np: () => Infinity })).toThrow('Nodal moment at node 2 is not supported');
  expect(state.calls).toBe(at);
});
