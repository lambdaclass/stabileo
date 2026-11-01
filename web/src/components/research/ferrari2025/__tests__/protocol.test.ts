import { describe, it, expect } from 'vitest';
import { modelFromWire, readFrame } from '../protocol';
import replay from '../../../../../../research/stability/ferrari-sigmund-2025/results/stabileo_results.json';
const result = () => ({ converged: true, finalLoadFactor: 2.1, steps: [{ converged: true }], results: { displacements: Array.from({ length: 21 }, (_, i) => ({ nodeId: i + 1, ux: i / 1000, uz: -i / 2000, ry: i / 100 })) } });
describe('Roorda production result boundary', () => {
  it('maps node IDs to fields and measures corner rotation', () => {
    const r = result(); r.results.displacements.reverse();
    const frame = readFrame(r);
    expect(frame.theta).toBe(0.1); expect(frame.displacement[20]).toBe(0.01); expect(frame.lambda).toBe(2.1);
  });
  it('rejects incomplete, duplicate, nonfinite and unconverged data', () => {
    const cases = [result(), result(), result(), result(), result()];
    cases[0].converged = false; cases[1].results.displacements.pop(); cases[2].results.displacements[0].nodeId = 2;
    cases[3].finalLoadFactor = NaN; cases[4].results.displacements[1].ux = Infinity;
    for (const r of cases) expect(() => readFrame(r)).toThrow();
  });
  it('preserves production units and topology through the wrapper', () => {
    const model = modelFromWire(replay.model);
    expect(model.nodes.size).toBe(21); expect(model.elements.size).toBe(20);
    expect(model.materials.get(1)?.e).toBe(21);
    expect(model.loads).toEqual([{ type: 'nodal', data: { nodeId: 11, fx: 0, fz: -1, my: 0.001 } }]);
    expect(model.supports.size).toBe(2);
    expect(Math.abs(replay.lambda - 2.4313)).toBeLessThan(1e-4);
    expect(replay.koiter).toBeNull();
    expect(replay.frames).toHaveLength(26);
    expect(replay.frames.every(f => [f.lambda, f.theta, ...f.displacement].every(Number.isFinite))).toBe(true);
  });
});

it('production WASM wrapper reproduces the native buckling and final arc-length frame', async () => {
  const { solveBuckling, solveArcLength } = await import('../../../../lib/engine/wasm-solver');
  const model = modelFromWire(replay.model);
  model.loads = [{ type: 'nodal', data: { nodeId: 11, fx: 0, fz: -1, my: 0 } }];
  expect(solveBuckling(model, 1).modes[0].loadFactor).toBeCloseTo(replay.lambda, 8);
  const frame = readFrame(solveArcLength({ solver: replay.model, maxSteps: 100, maxIter: 40, tolerance: 1e-9, initialDs: 0.04, minDs: 1e-7, maxDs: 0.04, targetIter: 5 }));
  const expected = replay.frames.at(-1)!;
  expect(frame.lambda).toBeCloseTo(expected.lambda, 8);
  expect(frame.theta).toBeCloseTo(expected.theta, 8);
  frame.displacement.forEach((value, i) => expect(value).toBeCloseTo(expected.displacement[i], 8));
});
