import { describe, expect, it } from 'vitest';
import { benchmark, firstLimit, frameFrom, point, viewer } from '../case';
import { strings } from '../i18n';
import replay from '../../../../../../research/benchmarks/lee-frame-1968/results/stabileo_results.json';
describe('Lee frame', () => {
  it('keeps the pinned geometry and SI units', () => {
    const s = benchmark.input.solver;
    expect(s.nodes['13']).toEqual({ id: 13, x: .24, z: 1.2 });
    expect(s.sections['1'].iz).toBe(2e-8);
    expect(Object.values(s.supports).map(s => s.type)).toEqual(['pinned','pinned']);
    expect(s.materials['1'].e * 1000 * s.sections['1'].iz).toBeCloseTo(.144, 10);
  });
  it('rejects incomplete and non-finite solver results', () => {
    expect(() => frameFrom({ converged: false, steps: [], finalLoadFactor: 1, results: { displacements: [] } },1)).toThrow();
    expect(() => frameFrom({ converged: true, steps: [1], finalLoadFactor: NaN, results: { displacements: [] } },1)).toThrow();
  });
  it('replays real nodal results through the first peak and descending branch', () => {
    const peak = firstLimit(replay.frames)!;
    expect(peak).not.toBeNull();
    expect(peak.load).toBeGreaterThan(1.7);
    expect(peak.load).toBeLessThan(1.9);
    expect(replay.frames.at(-1)!.load).toBeLessThan(peak.load);
    expect(point(peak)[0]).toBeGreaterThan(0);
    expect(viewer(peak).displacement).toHaveLength(42);
  });
  it('has complete research-only locale keys', () => {
    for (const locale of Object.values(strings)) expect(Object.keys(locale)).toEqual(Object.keys(strings.en));
  });
});

it('runs the shared case through the production WASM wrapper', async () => {
  const { initSolver, solveArcLength } = await import('../../../../lib/engine/wasm-solver');
  await initSolver();
  const result = solveArcLength(benchmark.input);
  const frame = frameFrom(result, benchmark.input.maxSteps);
  expect(frame.load).toBeCloseTo(replay.frames.at(-1)!.load, 8);
  expect(point(frame)[0]).toBeCloseTo(point(replay.frames.at(-1)!)[0], 7);
  const peak = Math.max(...result.steps.map((s: { loadFactor: number }) => s.loadFactor));
  expect(peak).toBeCloseTo(benchmark.regression.firstLimitLoad, 8);
});
