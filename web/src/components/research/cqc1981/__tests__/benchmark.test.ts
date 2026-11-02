import { expect, it, vi } from 'vitest';
import { benchmark, difference, model, projection, recompute } from '../benchmark';
import { translations } from '../strings';
import replay from '../../../../../../research/benchmarks/cqc-1981/results/stabileo_results.json';

it('keeps the published replay tied to the shared engine case', () => {
  expect(replay.case).toEqual(benchmark);
  for (const rule of ['SRSS', 'CQC'] as const) {
    expect(Math.abs(difference(replay.results[rule].baseShear, benchmark.reference[rule]))).toBeLessThan(benchmark.relativeTolerance * 100);
  }
  expect(difference(replay.results.SRSS.baseShear, replay.results.CQC.baseShear)).toBeLessThan(-18);
});

it('preserves directional masses, constraints and independent model copies', () => {
  const a = model();
  expect(a.nodes.size).toBe(8);
  expect(a.elements.size).toBe(6);
  expect(a.masses?.nodal?.reduce((sum, n) => sum + (n.massX ?? 0), 0)).toBe(20);
  expect(a.constraints).toHaveLength(2);
  a.nodes.get(5)!.x = 99;
  expect(model().nodes.get(5)!.x).toBe(0);
});

it('projects actual connectivity and scales only displayed deformation', () => {
  const view = projection(replay.results.CQC, 0);
  expect(view.cells).toEqual([0, 4, 1, 5, 2, 6, 3, 7, 4, 5, 6, 7]);
  expect(view.displacement.every(v => v === 0)).toBe(true);
  expect(view.values[4]).toBeCloseTo(10.311059453, 8);
});

it('dispatches both combinations through production WASM wrappers with the modal output', async () => {
  const engine = await import('../../../../lib/engine/wasm-solver');
  vi.spyOn(engine, 'initSolver').mockResolvedValue();
  vi.spyOn(engine, 'solveModal3D').mockReturnValue(replay.results.modal as ReturnType<typeof engine.solveModal3D>);
  const spectral = vi.spyOn(engine, 'solveSpectral3D').mockImplementation(config => replay.results[config.rule]);
  try {
    const results = await recompute();
    expect(results.CQC.baseShear).toBeCloseTo(17.549731954, 8);
    expect(spectral.mock.calls.map(([config]) => [config.rule, config.direction, config.xi])).toEqual([['SRSS', 'X', .05], ['CQC', 'X', .05]]);
    expect(spectral.mock.calls[0][0].modes).toEqual(replay.results.modal.modes);
  } finally { vi.restoreAllMocks(); }
});

it('supplies complete English, Spanish and Portuguese keys', () => {
  for (const locale of ['es', 'pt'] as const) {
    expect(Object.keys(translations[locale]).sort()).toEqual(Object.keys(translations.en).sort());
    expect(translations[locale].limitations).toHaveLength(4);
    expect(translations[locale].title).not.toEqual(translations.en.title);
  }
});

it('matches the closed form through the real production WASM boundary', async () => {
  const results = await recompute();
  for (const rule of ['SRSS', 'CQC'] as const) {
    expect(Math.abs(difference(results[rule].baseShear, benchmark.reference[rule]))).toBeLessThan(benchmark.relativeTolerance * 100);
    for (const [i, nodeId] of [5, 6].entries()) {
      const actual = results[rule].displacements.find(d => d.nodeId === nodeId)!.ux;
      expect(Math.abs(difference(actual, benchmark.reference[rule === 'SRSS' ? 'roofSRSS' : 'roofCQC'][i]))).toBeLessThan(benchmark.relativeTolerance * 100);
    }
  }
});
