import { expect, it } from 'vitest';
import { run, portal, checks, hingeNode, cumulativeStep, governing, mechanisms, viewer, PAPER, type Result } from './case';
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
  expect(list.map(c => c.id)).toEqual(['collapse', 'mechanism', 'hinges', 'yield', 'equilibrium', ...(mode === 'combined' ? ['corner'] : [])]);
  expect(list.filter(c => !c.passed)).toEqual([]);
});

it.each([0.75, 3])('tied portal at V/H=%s still checks actual hinge moments', async vertical => {
  const model = { ...PAPER, vertical };
  const result = await run(model);
  const hingeCheck = () => checks(result, model).find(c => c.id === 'hinges')?.passed;
  expect(hingeCheck()).toBe(true);
  result.steps.find(s => s.hingesFormed?.length)!.hingesFormed![0].momentY = 0;
  expect(hingeCheck()).toBe(false);
});

it.each(['horizontal', 'vertical'] as const)('pure loading checks equilibrium with zero %s load', async direction => {
  const model = { ...PAPER, [direction]: 0 };
  const result = await run(model);
  expect(checks(result, model).find(c => c.id === 'equilibrium')?.passed).toBe(true);
  const reaction = result.steps[0].results.reactions![0];
  reaction[direction === 'horizontal' ? 'fx' : 'fz'] += portal.equilibriumTolerance * 2;
  expect(checks(result, model).find(c => c.id === 'equilibrium')?.passed).toBe(false);
});

it('beam midspan cannot yield in the reverse bending sense', async () => {
  const params = { ...PAPER, vertical: 4 * PAPER.horizontal };
  const result = await run(params);
  const hinges = () => checks(result, params).find(row => row.id === 'hinges')!.passed;
  expect(hinges()).toBe(true);
  const hinge = result.steps.flatMap(step => step.hingesFormed ?? []).find(h => hingeNode(h) === 5)!;
  hinge.momentY *= -1;
  for (const step of result.steps) {
    const member = step.results.elementForces!.find(f => f.elementId === hinge.elementId)!;
    member[hinge.end === 'start' ? 'myStart' : 'myEnd'] *= -1;
  }
  expect(hinges()).toBe(false);
});

it.skipIf(!process.env.RUN_KNOWN_WRONG)('known wrong result: #2505 checks either member end at the left joint on both sides of the mechanism transitions', async () => {
  for (const vertical of [0.5, 0.75, 3, 4]) {
    const p = { ...PAPER, vertical };
    const result = await run(p);
    const hinge = result.steps.flatMap(s => s.hingesFormed ?? []).find(h => hingeNode(h) === 2)!;
    expect(checks(result, p).find(c => c.id === 'hinges')?.passed).toBe(true);
    const column = hinge.elementId === 1;
    hinge.elementId = column ? 2 : 1;
    hinge.end = column ? 'start' : 'end';
    hinge.momentY *= -1;
    expect(checks(result, p).find(c => c.id === 'hinges')?.passed).toBe(true);
    hinge.momentY *= -1;
    expect(checks(result, p).find(c => c.id === 'hinges')?.passed).toBe(false);
  }
});
