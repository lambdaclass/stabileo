import { expect, it } from 'vitest';
import { run, portal, checks, cumulativeStep, governing, mechanisms, viewer, PAPER, type Result } from './case';
import replayFile from '../../../../../research/benchmarks/plastic-collapse/results/stabileo_results.json';

const replay = replayFile.result as Result;
const METRES = 1e-9;

it('recomputes the replay with the production WASM wrapper', async () => {
  const result = await run();
  expect(result.isMechanism).toBe(true);
  expect(result.warnings ?? []).toEqual([]);
  expect(Math.abs(result.collapseFactor - portal.reference.combined)).toBeLessThan(portal.tolerance);
  expect(Math.abs(result.collapseFactor - replay.collapseFactor)).toBeLessThan(portal.tolerance);
  expect(checks(result).every(c => c.passed)).toBe(true);
  expect(result.steps).toHaveLength(replay.steps.length);
  result.steps.forEach((step, i) => {
    const recorded = replay.steps[i];
    expect(Math.abs(step.loadFactor - recorded.loadFactor)).toBeLessThan(portal.tolerance);
    expect(step.hingesFormed?.map(h => [h.elementId, h.end, Math.sign(h.momentY)])).toEqual(recorded.hingesFormed?.map(h => [h.elementId, h.end, Math.sign(h.momentY)]));
    expect(step.results.displacements.map(d => d.nodeId)).toEqual(recorded.results.displacements.map(d => d.nodeId));
    step.results.displacements.forEach((d, j) => {
      const r = recorded.results.displacements[j];
      expect(Math.abs(d.ux - r.ux), `event ${i} node ${d.nodeId} ux`).toBeLessThan(METRES);
      expect(Math.abs(d.uz - r.uz), `event ${i} node ${d.nodeId} uz`).toBeLessThan(METRES);
    });
  });
  const frame = viewer(cumulativeStep(result.steps, result.steps.length - 1));
  expect(frame.displacement?.every(Number.isFinite)).toBe(true);
  expect(frame.range.max).toBeGreaterThan(0);
});

it.each([[0.5, 3], [1, 3], [4, 3], [2, 2.5], [2, 5]])('collapses at the lowest hand bound and passes the page checks for V/H = %s, h = %s m', async (ratio, height) => {
  const p = { ...PAPER, vertical: ratio * PAPER.horizontal, height };
  const result = await run(p);
  const mode = governing(p)!;
  expect(Math.abs(result.collapseFactor - mechanisms(p)[mode])).toBeLessThan(portal.tolerance);
  const list = checks(result, p);
  expect(list.map(c => c.id)).toContain('hinges');
  expect(list.filter(c => !c.passed)).toEqual([]);
});
