import { expect, it } from 'vitest';
import { certify_plastic_3d } from '../../../lib/wasm/dedaliano_engine.js';
import { run, portal, checks, cumulativeStep, viewer, historyWarnings, type Result } from './case';
import replayFile from '../../../../../research/benchmarks/plastic-collapse/results/stabileo_results.json';

const replay = replayFile.result as Result;
const METRES = 1e-9;

it('recomputes the replay with the production WASM wrapper', async () => {
  const result = await run();
  expect(result.isMechanism).toBe(true);
  expect(result.warnings).toHaveLength(1);
  expect(result.warnings![0]).toContain('not certified by this interval');
  const checked = JSON.parse(certify_plastic_3d(JSON.stringify(portal.input)));
  for (const answer of [result, checked.results as Result]) {
    const disclosures = answer.structuredDiagnostics?.filter(d => d.code === 'plastic_history_within_certificate');
    expect(disclosures).toHaveLength(1);
    expect(disclosures![0]).toMatchObject({ severity: 'info', value: answer.collapseFactor, threshold: checked.certificate.lambdaUpper });
    expect(disclosures![0].message).toBe(answer.warnings!.at(-1));
    expect(answer.collapseFactor).toBe(checked.certificate.lambdaLower);
    expect(answer.steps.at(-1)!.loadFactor).toBe(checked.certificate.solverCollapseFactor);
    expect(historyWarnings(answer)).toEqual([]);
    expect(checks(answer).every(c => c.passed)).toBe(true);
  }
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
