import { describe, expect, it } from 'vitest';
import { benchmark, convergence, fill, firstPeak, frameFrom, percentAgainstReference, point, SolveFailure, failureCode, viewer } from '../case';
import { strings } from '../i18n';
import replay from '../../../../../../research/benchmarks/lee-frame-1968/results/stabileo_results.json';

const REGRESSION = 1e-8;

describe('Lee frame', () => {
  it('builds the pinned frame of de Souza et al. (2020) §3.3 in SI units', () => {
    const s = benchmark.input.solver;
    const nodes = Object.values(s.nodes);
    expect(nodes).toHaveLength(21);
    nodes.forEach((n, i) => {
      expect(n.id).toBe(i + 1);
      expect(n.x).toBeCloseTo(i <= 10 ? 0 : 0.12 * (i - 10), 12);
      expect(n.z).toBeCloseTo(i <= 10 ? 0.12 * i : 1.2, 12);
    });
    const elements = Object.values(s.elements);
    expect(elements).toHaveLength(20);
    elements.forEach((e, i) => expect(e).toEqual({ id: i + 1, type: 'frame', nodeI: i + 1, nodeJ: i + 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }));
    expect(Object.values(s.supports).map(x => [x.nodeId, x.type])).toEqual([[1, 'pinned'], [21, 'pinned']]);
    expect(s.loads).toEqual([{ type: 'nodal', data: { nodeId: 13, fx: 0, fz: -1, my: 0 } }]);
    expect(benchmark.loadNode).toBe(13);
    expect(s.nodes['13']).toEqual({ id: 13, x: .24, z: 1.2 });
    expect(s.materials['1'].e).toBe(7200);
    expect(s.sections['1']).toEqual({ id: 1, a: 6e-4, iz: 2e-8 });
    expect(s.materials['1'].e * 1000 * s.sections['1'].iz).toBeCloseTo(.144, 12);
    const { solver: _, ...arcLength } = benchmark.input;
    expect(arcLength).toEqual({ maxSteps: 90, maxIter: 40, tolerance: 1e-8, initialDs: .1, minDs: 1e-6, maxDs: .2, targetIter: 5 });
  });

  it('rejects incomplete and non-finite solver results with codes the page localizes', () => {
    const run = (r: Parameters<typeof frameFrom>[0]) => { try { frameFrom(r, 1); return null; } catch (e) { return failureCode(e); } };
    expect(run({ converged: false, steps: [], finalLoadFactor: 1, results: { displacements: [] } })).toBe('incomplete');
    expect(run({ converged: true, steps: [1], finalLoadFactor: NaN, results: { displacements: [] } })).toBe('invalid');
    expect(failureCode(new Error('x'))).toBe('solveError');
    expect(failureCode(new SolveFailure('invalid'))).toBe('invalid');
  });

  it('shows the first sampled peak at step 47 of the replay, then the descending branch', () => {
    const peak = firstPeak(replay.frames)!;
    expect(peak.step).toBe(benchmark.regression.firstPeakStep);
    expect(peak.step).toBe(47);
    expect(Math.abs(peak.load - benchmark.regression.firstLimitLoad)).toBeLessThan(REGRESSION);
    expect(Math.abs(peak.load - 1.8657781212)).toBeLessThan(REGRESSION);
    expect(Math.abs(point(peak)[0] - 48.5252446)).toBeLessThan(1e-6);
    expect(Math.abs(point(peak)[1] - peak.load)).toBe(0);
    expect(replay.frames).toHaveLength(90);
    replay.frames.forEach((f, i) => expect(f.step).toBe(i + 1));
    expect(replay.frames.at(-1)!.load).toBeLessThan(peak.load * .5);
    expect(viewer(peak).displacement).toHaveLength(42);
    expect(viewer(peak).values[12]).toBeCloseTo(Math.hypot(...[0, 1].map(k => viewer(peak).displacement[24 + k])), 15);
  });

  it('pins the mesh and step study shown on the page', () => {
    expect(convergence.elements40).toEqual({ split: 2, stepScale: .25, maxSteps: 300, firstPeak: 1.8582372627054071 });
    expect(convergence.elements80).toEqual({ split: 4, stepScale: .0625, maxSteps: 1000, firstPeak: 1.8563164846311262 });
    expect(convergence.stepEffectBound).toBe(1e-4);
  });

  it('compares with the Figure 10 reading only to the nearest percent', () => {
    expect(benchmark.reference.load).toBe(1.83);
    expect(benchmark.reference.displayedPercentDigits).toBe(0);
    expect(percentAgainstReference(benchmark.regression.firstLimitLoad)).toBe(2);
    expect(percentAgainstReference(convergence.elements80.firstPeak)).toBe(1);
  });

  it('fills every placeholder of the localized templates', () => {
    for (const s of Object.values(strings)) {
      expect(fill(s.convergence, { peak: 'a', step: 'b', p40: 'c', p80: 'd', bound: 'e' })).not.toMatch(/\{\w+\}/);
      expect(fill(s.readout, { step: 'a', load: 'b', u: 'c' })).not.toMatch(/\{\w+\}/);
    }
  });

  it('has complete dictionaries in all six site locales, translated', () => {
    expect(Object.keys(strings).sort()).toEqual(['de', 'en', 'es', 'fr', 'pt', 'tr']);
    for (const [locale, dictionary] of Object.entries(strings)) {
      expect(Object.keys(dictionary)).toEqual(Object.keys(strings.en));
      if (locale !== 'en') for (const key of ['lead', 'description', 'provenance', 'convergence', 'paperWhy', 'codeWhy', 'readout'] as const) expect(dictionary[key]).not.toBe(strings.en[key]);
      expect(JSON.stringify(dictionary)).not.toMatch(/provisional|pending|not checked|questions for the authors/i);
    }
  });
});

it('runs the shared case through the production WASM wrapper', async () => {
  const { initSolver, solveArcLength } = await import('../../../../lib/engine/wasm-solver');
  await initSolver();
  const result = solveArcLength(benchmark.input);
  const frame = frameFrom(result, benchmark.input.maxSteps);
  expect(frame.load).toBeCloseTo(replay.frames.at(-1)!.load, 8);
  expect(point(frame)[0]).toBeCloseTo(point(replay.frames.at(-1)!)[0], 7);
  const peakRun = solveArcLength({ ...benchmark.input, maxSteps: benchmark.regression.firstPeakStep });
  const peak = firstPeak([frameFrom(solveArcLength({ ...benchmark.input, maxSteps: 46 }), 46), frameFrom(peakRun, 47), frameFrom(solveArcLength({ ...benchmark.input, maxSteps: 48 }), 48)])!;
  expect(peak.step).toBe(47);
  expect(peak.load).toBeCloseTo(benchmark.regression.firstLimitLoad, 8);
  expect(Math.abs(point(peak)[0] - point(replay.frames[46])[0])).toBeLessThan(1e-7);
});
