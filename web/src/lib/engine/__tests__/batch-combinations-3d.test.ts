import { beforeAll, expect, it } from 'vitest';
import { initSolver, solve3D, combineResults3D, combineResultsBatch3D, combineResultsEnvelope3D, computeEnvelope3D } from '../wasm-solver';
import type { AnalysisResults3D, SolverInput3D } from '../types-3d';
import { readFileSync } from 'node:fs';
import { solve_3d, combine_results_3d, combine_results_batch_3d, combine_results_envelope_3d, compute_envelope_3d } from '../../wasm/dedaliano_engine.js';

beforeAll(async () => { await initSolver(); });

function cases(): Map<number, AnalysisResults3D> {
  const model: SolverInput3D = {
    nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 5, y: 0, z: 0 }]]),
    elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1,
      releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false,
      releaseTStart: false, releaseTEnd: false }]]),
    materials: new Map([[1, { id: 1, e: 200000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iy: 1e-4, iz: 1e-4, j: 2e-4 }]]),
    supports: new Map([[1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
    loads: [],
  };
  return new Map([1, 2].map(id => [id, solve3D({ ...model, loads: [
    { type: 'nodal', data: { nodeId: 2, fx: id * 3, fy: 0, fz: -10 * id, mx: 0, my: 0, mz: 0 } },
  ] })]));
}

it('matches individual combinations and their envelope exactly', () => {
  const perCase = cases();
  const combinations = [
    [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }],
    [{ caseId: 2, factor: -0.7 }, { caseId: 1, factor: 0.9 }],
    [{ caseId: 1, factor: 0 }],
    [{ caseId: 1, factor: 1 }, { caseId: 1, factor: 0.5 }],
  ];
  const reference = combinations.map(factors => combineResults3D(factors, perCase, new Map()));
  const batch = combineResultsBatch3D(combinations, perCase, new Map());
  expect(batch).toEqual(reference);
  expect(computeEnvelope3D(batch.filter(r => r !== null))).toEqual(computeEnvelope3D(reference.filter(r => r !== null)));
  expect(combineResultsEnvelope3D(combinations, perCase, new Map()))
    .toEqual({ combinations: batch, envelope: computeEnvelope3D(batch.filter(r => r !== null)) });
  expect(batch[0]!.reactions[0].fz).toBeCloseTo(44, 10);
});

it('preserves raw WASM payloads with repeated factors and reversed case-table order', () => {
  const entries = [...cases()].reverse().map(([caseId, results]) => ({ caseId, results }));
  const combinations = [[{ caseId: 1, factor: 1 }, { caseId: 1, factor: 0.5 }, { caseId: 2, factor: -0.2 }]];
  const input = { combinations, cases: entries };
  const reference = combinations.map(factors => combine_results_3d({
    factors, cases: factors.map(f => entries.find(c => c.caseId === f.caseId)!),
  }));
  expect(combine_results_batch_3d(input)).toEqual(reference);
  expect(combine_results_envelope_3d(input)).toEqual([reference, compute_envelope_3d(reference)]);
});

it('refuses duplicate case-table ids in both new WASM exports', () => {
  const entries = [...cases().values()].map(results => ({ caseId: 1, results }));
  entries[1].results.structuredDiagnostics = [{ code: 'known_issue', severity: 'warning', phase: 'NUM-INVARIANCE', message: 'second record' }];
  const input = { combinations: [[{ caseId: 1, factor: 1 }]], cases: entries };
  expect(() => combine_results_batch_3d(input)).toThrow('duplicate case id 1');
  expect(() => combine_results_envelope_3d(input)).toThrow('duplicate case id 1');
});

it('preserves empty and missing-case slots', () => {
  const perCase = cases();
  const combinations = [[], [{ caseId: 99, factor: 1 }], [{ caseId: 99, factor: 2 }, { caseId: 2, factor: 1 }]];
  expect(combineResultsBatch3D(combinations, perCase, new Map()))
    .toEqual(combinations.map(factors => combineResults3D(factors, perCase, new Map())));
  expect(combineResultsBatch3D([], perCase, new Map())).toEqual([]);
  const batch = combineResultsBatch3D(combinations, perCase, new Map());
  expect(combineResultsEnvelope3D(combinations, perCase, new Map()))
    .toEqual({ combinations: batch, envelope: computeEnvelope3D(batch.filter(r => r !== null)) });
  expect(combineResultsEnvelope3D([], perCase, new Map())).toEqual({ combinations: [], envelope: null });
  expect(combineResultsEnvelope3D(combinations.slice(0, 2), perCase, new Map()))
    .toEqual({ combinations: [null, null], envelope: null });
});

it('rejects non-finite factors', () => {
  for (const factor of [NaN, Infinity, -Infinity]) {
    expect(() => combineResultsBatch3D([[{ caseId: 1, factor }]], cases(), new Map())).toThrow();
    expect(() => combineResultsEnvelope3D([[{ caseId: 1, factor }]], cases(), new Map())).toThrow();
  }
});

it('preserves shell stress combination and refuses mismatched shells', () => {
  const perCase = cases();
  for (const [id, result] of perCase) result.quadStresses = [{
    elementId: 10, sigmaXx: id * 10, sigmaYy: -id * 3, tauXy: id,
    mx: id * 2, my: id, mxy: 0, vonMises: 20, qx: id, qy: -id,
  }];
  const combinations = [[{ caseId: 2, factor: -0.5 }, { caseId: 1, factor: 1.2 }]];
  expect(combineResultsBatch3D(combinations, perCase, new Map()))
    .toEqual(combinations.map(factors => combineResults3D(factors, perCase, new Map())));
  perCase.get(2)!.quadStresses![0].elementId = 11;
  expect(() => combineResults3D(combinations[0], perCase, new Map())).toThrow();
  expect(() => combineResultsBatch3D(combinations, perCase, new Map())).toThrow();
  expect(() => combineResultsEnvelope3D(combinations, perCase, new Map())).toThrow();
});

it('requires plate thickness and preserves face stresses', () => {
  const perCase = cases();
  for (const [id, result] of perCase) result.plateStresses = [{
    elementId: 10, sigmaXx: id * 10, sigmaYy: -id * 3, tauXy: id,
    mx: id * 2, my: id, mxy: 0, sigma1: 10, sigma2: -3, vonMises: 20,
  }];
  const combinations = [[{ caseId: 2, factor: -0.5 }, { caseId: 1, factor: 1.2 }]];
  expect(() => combineResultsBatch3D(combinations, perCase, new Map())).toThrow();
  expect(() => combineResultsEnvelope3D(combinations, perCase, new Map())).toThrow();
  const plates = new Map([[10, { thickness: 0.2 }]]);
  expect(combineResultsBatch3D(combinations, perCase, plates))
    .toEqual(combinations.map(factors => combineResults3D(factors, perCase, plates)));
  const batch = combineResultsBatch3D(combinations, perCase, plates);
  expect(combineResultsEnvelope3D(combinations, perCase, plates))
    .toEqual({ combinations: batch, envelope: computeEnvelope3D(batch.filter(r => r !== null)) });
});

it('preserves the distorted-shell containment refusal', () => {
  const solver = JSON.parse(readFileSync(new URL('../../../../../verify/samples/plastic-3d-portal.input.json', import.meta.url), 'utf8')).solver;
  Object.assign(solver, { nodes: {}, elements: {}, supports: {}, loads: [], quads: {} });
  solver.materials['1'].e = 10000;
  for (let i = 0; i <= 6; i++) for (let j = 0; j < 2; j++) {
    const shift = i === 0 || i === 6 ? 0 : (i % 2 ? 0.1 : -0.1) * (j === 0 ? -1 : 1);
    const id = 1 + 2 * i + j;
    solver.nodes[id] = { id, x: i + shift, y: 0.2 * j, z: 0 };
  }
  for (let i = 0; i < 6; i++) solver.quads[i + 1] = { id: i + 1, nodes: [2*i+1, 2*i+3, 2*i+4, 2*i+2], materialId: 1, thickness: 0.1 };
  for (const nodeId of [1, 2]) solver.supports[nodeId] = { nodeId, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true };
  for (const nodeId of [13, 14]) solver.loads.push({ type: 'nodal', data: { nodeId, fx: 0, fy: 0, fz: 0.5, mx: 0, my: 0, mz: 0 } });
  const result = solve_3d(solver);
  const perCase = new Map([[1, result]]);
  const identity = [[{ caseId: 1, factor: 1 }]];
  expect(combineResultsBatch3D(identity, perCase, new Map())[0])
    .toEqual(combineResults3D(identity[0], perCase, new Map()));
  expect(() => combineResultsBatch3D([[{ caseId: 1, factor: 1.5 }]], perCase, new Map()))
    .toThrow(/SH-MITC4-DISTORTION/);
  expect(() => combineResultsEnvelope3D([[{ caseId: 1, factor: 1.5 }]], perCase, new Map()))
    .toThrow(/SH-MITC4-DISTORTION/);
  expect(combineResultsEnvelope3D(identity, perCase, new Map()).envelope)
    .toEqual(computeEnvelope3D(combineResultsBatch3D(identity, perCase, new Map()).filter(r => r !== null)));
  expect(() => combineResultsEnvelope3D([...identity, ...identity], perCase, new Map()))
    .toThrow(/SH-MITC4-DISTORTION/);
});

const failure = (run: () => unknown): string => {
  try { run(); } catch (error) { return error instanceof Error ? error.message : String(error); }
  throw new Error('Expected a refusal');
};

it('preserves combination overflow paths before envelope processing', () => {
  const perCase = cases();
  perCase.get(1)!.reactions[0].fz = Number.MAX_VALUE;
  const plates = new Map();
  const combine = (factor: number) => {
    const factors = [{ caseId: 1, factor }];
    return [
      () => combineResults3D(factors, perCase, plates),
      () => combineResultsBatch3D([factors], perCase, plates)[0],
      () => combineResultsEnvelope3D([factors], perCase, plates).combinations[0],
    ];
  };
  const [single, ...batched] = combine(2).map(failure);
  expect(single).toBe('Cannot combine results: result 0 has a non-finite number at reactions[0].fz=inf');
  expect(batched).toEqual([single, single]);
  expect(combine(1).map(run => run()?.reactions[0].fz)).toEqual([
    Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE,
  ]);
});

it('preserves the existing positional envelope calculation', () => {
  const perCase = cases();
  perCase.get(2)!.displacements[1].nodeId = 9;
  const factors = [[{ caseId: 1, factor: 1 }], [{ caseId: 2, factor: 1 }]];
  const batch = combineResultsBatch3D(factors, perCase, new Map());
  expect(combineResultsEnvelope3D(factors, perCase, new Map()))
    .toEqual({ combinations: batch, envelope: computeEnvelope3D(batch.filter(r => r !== null)) });
});

it('preserves the envelope station overflow refusal', () => {
  const force = cases().get(1)!.elementForces[0];
  const perCase = new Map<number, AnalysisResults3D>([[1, {
    displacements: [], reactions: [], elementForces: [{ ...force, vyStart: Number.MAX_VALUE }],
  }]]);
  const factors = [[{ caseId: 1, factor: 1 }]];
  const reference = failure(() => computeEnvelope3D(combineResultsBatch3D(factors, perCase, new Map()).filter(r => r !== null)));
  expect(reference).toContain('Cannot compute the envelope:');
  expect(failure(() => combineResultsEnvelope3D(factors, perCase, new Map()))).toBe(reference);
});

it('preserves warning diagnostics in both combinations and envelope', () => {
  const perCase = cases();
  perCase.get(1)!.structuredDiagnostics = [{ code: 'known_issue', severity: 'warning', phase: 'NUM-INVARIANCE', message: 'conditioning' }];
  const factors = [[{ caseId: 1, factor: 1 }], [{ caseId: 2, factor: 1 }]];
  const batch = combineResultsBatch3D(factors, perCase, new Map());
  expect(combineResultsEnvelope3D(factors, perCase, new Map()))
    .toEqual({ combinations: batch, envelope: computeEnvelope3D(batch.filter(r => r !== null)) });
});
