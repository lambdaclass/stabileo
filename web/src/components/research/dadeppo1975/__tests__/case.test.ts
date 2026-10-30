import { describe, expect, it } from 'vitest';
import { benchmark, compare, frameFor, sampleSteps, viewerData, type Run } from '../case';
import { strings } from '../i18n';
import replay from '../../../../../../research/benchmarks/dadeppo-arch-1975/results/stabileo_results.json';

describe('DaDeppo–Schmidt shared benchmark', () => {
  it('preserves geometry, support asymmetry, stiffness and normalization', () => {
    const s = benchmark.input.solver;
    expect(Object.values(s.nodes)).toHaveLength(41);
    for (const n of Object.values(s.nodes)) expect(Math.hypot(n.x, n.z)).toBeCloseTo(1, 12);
    expect(s.nodes['20'].x).toBeCloseTo(0, 12);
    expect(s.nodes['20'].z).toBeCloseTo(1, 12);
    expect(s.supports['0'].type).toBe('fixed');
    expect(s.supports['40'].type).toBe('pinned');
    expect(s.loads[0].data).toEqual({ nodeId: 20, fx: 0, fz: -1, my: 0 });
    expect(s.materials['1'].e * 1000 * s.sections['1'].iz).toBe(1);
    expect(897 * 100 ** 2 / 1e6).toBeCloseTo(benchmark.reference, 12);
  });
  it('compares the full native replay and requires a descending branch', () => {
    const comparison = compare(replay.steps);
    expect(comparison.peak).toBeCloseTo(9.0112911888175, 6);
    expect(comparison.pass).toBe(true);
    expect(compare(replay.steps.slice(0, 220)).pass).toBe(false);
    expect(compare(replay.steps.map(s => ({ ...s, loadFactor: s.step }))).pass).toBe(false);
    expect(() => compare([])).toThrow();
    expect(() => compare([{ step: 1, loadFactor: NaN, converged: true }])).toThrow();
    expect(() => compare([{ step: 1, loadFactor: 1, converged: false }])).toThrow();
  });
  it('uses actual endpoint displacements in the shared viewer', () => {
    expect(replay.frames.map(f => f.step)).toEqual(sampleSteps);
    const frame = replay.frames.at(-1)!;
    const view = viewerData(frame);
    expect(view.xy).toHaveLength(82);
    expect(view.cells).toHaveLength(80);
    expect(view.displacement[41]).toBe(frame.displacements.find(d => d.nodeId === 20)!.uz);
    expect(view.values[20]).toBeCloseTo(Math.hypot(view.displacement[40], view.displacement[41]), 12);
    expect(viewerData().values.every(v => v === 0)).toBe(true);
    expect(() => frameFor({ converged: false } as Run, 20)).toThrow();
    expect(() => frameFor({ converged: true, steps: replay.steps, results: { displacements: [] } } as unknown as Run, 400)).toThrow();
  });
  it('runs the shared case through the production WASM wrapper', async () => {
    const engine = await import('../../../../lib/engine/wasm-solver');
    await engine.initSolver();
    const run = engine.solveArcLength(benchmark.input) as Run;
    expect(run.converged).toBe(true);
    expect(compare(run.steps).pass).toBe(true);
    expect(compare(run.steps).peak).toBeCloseTo(compare(replay.steps).peak, 6);
    const frame = frameFor(run, benchmark.input.maxSteps);
    const crown = frame.displacements.find(d => d.nodeId === benchmark.crownNode)!;
    expect(crown.uz).toBeCloseTo(replay.frames.at(-1)!.displacements.find(d => d.nodeId === benchmark.crownNode)!.uz, 8);
  });
  it('provides complete experiment translations', () => {
    for (const locale of ['es', 'pt'] as const) {
      expect(Object.keys(strings[locale]).sort()).toEqual(Object.keys(strings.en).sort());
      expect(strings[locale].limitations).toHaveLength(strings.en.limitations.length);
    }
  });
});
