import { expect, it } from 'vitest';
import { run, portal, cumulativeStep, viewer } from './case';
import replay from '../../../../../research/benchmarks/plastic-collapse/results/stabileo_results.json';

it('recomputes the replay with the production WASM wrapper', async () => {
  const result = await run();
  expect(result.isMechanism).toBe(true);
  expect(result.warnings ?? []).toEqual([]);
  expect(Math.abs(result.collapseFactor - portal.reference.combined)).toBeLessThan(portal.tolerance);
  expect(Math.abs(result.collapseFactor - replay.result.collapseFactor)).toBeLessThan(portal.tolerance);
  expect(result.steps).toHaveLength(replay.result.steps.length);
  const frame = viewer(cumulativeStep(result.steps, result.steps.length - 1));
  expect(frame.displacement?.every(Number.isFinite)).toBe(true);
  expect(frame.range.max).toBeGreaterThan(0);
});
