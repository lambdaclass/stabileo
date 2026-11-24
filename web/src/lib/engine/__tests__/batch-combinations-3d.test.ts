import { factorsWithExactCancellation, factorsWithUnitResidual } from './combination-factor-fixture';
import { beforeAll, expect, it } from 'vitest';
import { initSolver, solve3D, netCombinationFactors, combineResults, combineResults3D, combineResultsBatch3D, combineResultsEnvelope3D, computeEnvelope3D } from '../wasm-solver';
import type { AnalysisResults3D, SolverInput3D } from '../types-3d';
import { readFileSync } from 'node:fs';
import { net_combination_factors, combine_results_2d, compute_envelope_2d, solve_pdelta_2d, solve_pdelta_3d, solve_2d, solve_3d, combine_results_3d, combine_results_batch_3d, combine_results_envelope_3d, compute_envelope_3d } from '../../wasm/dedaliano_engine.js';

beforeAll(async () => { await initSolver(); });

function cases(axial = 3): Map<number, AnalysisResults3D> {
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
    { type: 'nodal', data: { nodeId: 2, fx: id * axial, fy: 0, fz: -10 * id, mx: 0, my: 0, mz: 0 } },
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
    factors, cases: [...new Set(factors.map(f => f.caseId))].map(id => entries.find(c => c.caseId === id)!),
  }));
  expect(combine_results_batch_3d(input)).toEqual(reference);
  expect(combine_results_envelope_3d(input)).toEqual([reference, compute_envelope_3d(reference)]);
});

it('refuses duplicate case-table ids in all 3D WASM exports', () => {
  const entries = [...cases().values()].map(results => ({ caseId: 1, results }));
  entries[1].results.structuredDiagnostics = [{ code: 'known_issue', severity: 'warning', phase: 'NUM-INVARIANCE', message: 'second record' }];
  const input = { combinations: [[{ caseId: 1, factor: 1 }]], cases: entries };
  expect(() => combine_results_3d({ factors: input.combinations[0], cases: entries })).toThrow('duplicate case id 1');
  expect(() => combine_results_batch_3d(input)).toThrow('duplicate case id 1');
  expect(() => combine_results_envelope_3d(input)).toThrow('duplicate case id 1');
});

it('preserves empty combination slots', () => {
  const perCase = cases();
  expect(combineResultsBatch3D([], perCase, new Map())).toEqual([]);
  expect(combineResultsBatch3D([[]], perCase, new Map())).toEqual([null]);
  expect(combineResultsEnvelope3D([], perCase, new Map())).toEqual({ combinations: [], envelope: null });
  expect(combineResultsEnvelope3D([[]], perCase, new Map())).toEqual({ combinations: [null], envelope: null });
});

const combinationPaths3D = {
  'single wrapper': (factors: Array<{ caseId: number; factor: number }>, perCase: Map<number, AnalysisResults3D>) =>
    combineResults3D(factors, perCase, new Map()),
  'batch wrapper': (factors: Array<{ caseId: number; factor: number }>, perCase: Map<number, AnalysisResults3D>) =>
    combineResultsBatch3D([factors], perCase, new Map())[0],
  'fused wrapper': (factors: Array<{ caseId: number; factor: number }>, perCase: Map<number, AnalysisResults3D>) =>
    combineResultsEnvelope3D([factors], perCase, new Map()).combinations[0],
  'single export': (factors: Array<{ caseId: number; factor: number }>, perCase: Map<number, AnalysisResults3D>) =>
    combine_results_3d({ factors, cases: [...perCase].map(([caseId, results]) => ({ caseId, results })) }),
  'batch export': (factors: Array<{ caseId: number; factor: number }>, perCase: Map<number, AnalysisResults3D>) =>
    combine_results_batch_3d({ combinations: [factors], cases: [...perCase].map(([caseId, results]) => ({ caseId, results })) })[0],
  'fused export': (factors: Array<{ caseId: number; factor: number }>, perCase: Map<number, AnalysisResults3D>) =>
    combine_results_envelope_3d({ combinations: [factors], cases: [...perCase].map(([caseId, results]) => ({ caseId, results })) })[0][0],
};

const portalInput = (dimension: '2d' | '3d') => readFileSync(new URL(
  dimension === '2d' ? '../../../../../engine/tests/fixtures/ex-portal-frame-input.json'
    : '../../../../../engine/tests/fixtures/ex-3d-portal-frame-input.json', import.meta.url), 'utf8');
const missingCase = { caseId: 99, factor: 2 };
const presentCase = { caseId: 2, factor: 1 };
const missingCaseReason = 'Cannot combine results: missing result for load case 99';

const splitFactors = (weights: number[]) => weights.map(factor => ({ caseId: 1, factor }));
const screenedRatio = (result: AnalysisResults3D & { resultSummary?: { secondOrderRatio?: number } }) =>
  result.resultSummary?.secondOrderRatio;

it('screens repeated factors once through all 3D combination routes (#2283)', () => {
  const linear = cases(-3).get(1)!;
  const ratio = screenedRatio(linear)!;
  expect(ratio).toBeGreaterThan(0);
  const nonlinear = JSON.parse(solve_pdelta_3d(portalInput('3d'), 20, 1e-9)).results;
  nonlinear.resultSummary = { ...nonlinear.resultSummary, secondOrderRatio: ratio };
  for (const result of [linear, nonlinear]) {
    const perCase = new Map([[1, result]]);
    const expected = combinationPaths3D['single export'](splitFactors([1]), perCase);
    expect(screenedRatio(expected)).toBe(ratio);
    for (const [path, combine] of Object.entries(combinationPaths3D)) {
      const split = combine(splitFactors([0.5, 0.5]), perCase);
      expect(screenedRatio(split), path).toBe(ratio);
      expect(split.displacements, path).toEqual(expected.displacements);
      expect(split.reactions, path).toEqual(expected.reactions);
      if (result === linear) expect(split, path).toStrictEqual(expected);
      const net = combine(splitFactors([1.5, -0.5]), perCase);
      expect(screenedRatio(net), path).toBe(ratio);
      expect(net.structuredDiagnostics, path).toStrictEqual(expected.structuredDiagnostics);
    }
    const split = splitFactors([0.5, 0.5]);
    const entry = { caseId: 1, results: result };
    const single = combine_results_3d({ factors: split, cases: [entry] });
    expect(combine_results_batch_3d({ combinations: [split], cases: [entry] })).toStrictEqual([single]);
    expect(combine_results_envelope_3d({ combinations: [split], cases: [entry] }))
      .toStrictEqual([[single], compute_envelope_3d([single])]);
  }
});

it('screens repeated factors once through both 2D combination routes (#2283)', () => {
  const ratio = screenedRatio(cases(-3).get(1)!)!;
  expect(ratio).toBeGreaterThan(0);
  const input = portalInput('2d');
  for (const result of [solve_2d(JSON.parse(input)), JSON.parse(solve_pdelta_2d(input, 20, 1e-9)).results]) {
    result.resultSummary = { ...result.resultSummary, secondOrderRatio: ratio };
    const perCase = new Map([[1, result]]);
    const combine = (weights: number[]) => combine_results_2d({
      factors: splitFactors(weights), cases: [{ caseId: 1, results: result }],
    });
    const expected = combine([1]);
    expect(screenedRatio(expected)).toBe(ratio);
    for (const weights of [[0.5, 0.5], [1.5, -0.5]]) {
      const raw = combine(weights);
      const admitted = combineResults(splitFactors(weights), perCase);
      expect(screenedRatio(raw)).toBe(ratio);
      expect(raw.structuredDiagnostics).toStrictEqual(expected.structuredDiagnostics);
      expect(JSON.stringify(admitted)).toBe(JSON.stringify(raw));
    }
  }
});

it.each(Object.entries(combinationPaths3D))('refuses a missing factored 3D case in the %s (#2283)', (_path, combine) => {
  const linear = cases().get(2)!;
  const nonlinear = JSON.parse(solve_pdelta_3d(portalInput('3d'), 20, 1e-9)).results;
  for (const result of [linear, nonlinear]) {
    const perCase = new Map([[2, result]]);
    const expected = combine([presentCase], perCase);
    expect(expected.displacements).toEqual(result.displacements);
    for (const factor of [0, -0]) {
      expect(combine([{ ...missingCase, factor }, presentCase], perCase)).toEqual(expected);
    }
    for (const factor of [2, Number.MIN_VALUE, -Number.MIN_VALUE]) {
      expect(() => combine([{ ...missingCase, factor }, presentCase], perCase)).toThrow(missingCaseReason);
    }
    expect(() => combine([missingCase], new Map())).toThrow(missingCaseReason);
  }
});

it.each(['wrapper', 'export'])('refuses a missing factored 2D case in the %s (#2283)', path => {
  const input = portalInput('2d');
  const linear = solve_2d(JSON.parse(input));
  const nonlinear = JSON.parse(solve_pdelta_2d(input, 20, 1e-9)).results;
  for (const result of [linear, nonlinear]) {
    const combine = (factors: typeof missingCase[], hasResult = true) => path === 'wrapper'
      ? combineResults(factors, hasResult ? new Map([[2, result]]) : new Map())
      : combine_results_2d({ factors, cases: hasResult ? [{ caseId: 2, results: result }] : [] });
    const expected = combine([presentCase]);
    expect(expected.displacements).toEqual(result.displacements);
    for (const factor of [0, -0]) {
      expect(combine([{ ...missingCase, factor }, presentCase])).toEqual(expected);
    }
    for (const factor of [2, Number.MIN_VALUE, -Number.MIN_VALUE]) {
      expect(() => combine([{ ...missingCase, factor }, presentCase])).toThrow(missingCaseReason);
    }
    expect(() => combine([missingCase], false)).toThrow(missingCaseReason);
  }
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
  const solver = JSON.parse(readFileSync(new URL('../../../../../engine/tests/fixtures/certificates/plastic-3d-portal.input.json', import.meta.url), 'utf8')).solver;
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
  const expected = combineResults3D(identity[0], perCase, new Map());
  for (const [path, combine] of Object.entries(combinationPaths3D)) {
    expect(combine(splitFactors([0.5, 0.5]), perCase), path).toStrictEqual(expected);
    expect(combine(splitFactors([1.5, -0.5]), perCase).structuredDiagnostics, path)
      .toStrictEqual(expected!.structuredDiagnostics);
    const below = (1 - Number.EPSILON / 2) / 2;
    expect(combine(splitFactors([below, below]), perCase), path).not.toBeNull();
    const above = (1 + Number.EPSILON) / 2;
    expect(() => combine(splitFactors([above, above]), perCase), path).toThrow(/SH-MITC4-DISTORTION/);
  }
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

const netFactorOverflow = 'Cannot combine results: load case 1 has a non-finite number at net factor=inf';

it.each(['2d export', '2d wrapper', ...Object.keys(combinationPaths3D)])(
  'reports overflow before recovery in %s (#2222)', path => {
    const planar = path.startsWith('2d');
    const input = portalInput(planar ? '2d' : '3d');
    const linear = planar ? solve_2d(JSON.parse(input)) : solve_3d(JSON.parse(input));
    const solveNonlinear = planar ? solve_pdelta_2d : solve_pdelta_3d;
    const nonlinear = JSON.parse(solveNonlinear(input, 20, 1e-9)).results;
    for (const result of [linear, nonlinear]) {
      const perCase = new Map([[1, result]]);
      const combine = (factors: ReturnType<typeof splitFactors>) => {
        if (path === '2d export') return combine_results_2d({ factors, cases: [{ caseId: 1, results: result }] });
        if (path === '2d wrapper') return combineResults(factors, perCase);
        return combinationPaths3D[path as keyof typeof combinationPaths3D](factors, perCase);
      };
      const control = combine(splitFactors([1]));
      expect(control.displacements.some((row: { ux: number }) => row.ux !== 0)).toBe(true);
      expect(combine(splitFactors([0.5, 0.5]))).toStrictEqual(control);
      expect(failure(() => combine(splitFactors([Number.MAX_VALUE, Number.MAX_VALUE])))).toBe(netFactorOverflow);
    }
  },
);

it.each([
  ['export', net_combination_factors],
  ['wrapper', netCombinationFactors],
])('reports net factor overflow at the representable boundary in the %s (#2222)', (_path, resolve) => {
  const halfMax = Number.MAX_VALUE / 2;
  expect(resolve(splitFactors([halfMax, halfMax]))).toStrictEqual(splitFactors([Number.MAX_VALUE]));
  expect(failure(() => resolve(splitFactors([halfMax, 2 ** 1023])))).toBe(netFactorOverflow);
});

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

it('refuses node 2 and node 9 in the same slot', () => {
  const perCase = cases();
  perCase.get(2)!.displacements[1].nodeId = 9;
  const factors = [[{ caseId: 1, factor: 1 }], [{ caseId: 2, factor: 1 }]];
  const batch = combineResultsBatch3D(factors, perCase, new Map());
  const input = { combinations: factors, cases: [...perCase].map(([caseId, results]) => ({ caseId, results })) };
  const expected = /Cannot compute the envelope: result 1.*displacements.*node id 9/;
  expect(() => combineResultsEnvelope3D(factors, perCase, new Map())).toThrow(expected);
  expect(() => combine_results_envelope_3d(input)).toThrow(expected);
  expect(() => computeEnvelope3D(batch.filter(r => r !== null))).toThrow(expected);
  expect(() => compute_envelope_3d([...perCase.values()])).toThrow(expected);
});

it('refuses mismatched IDs within one combination', () => {
  const perCase = cases();
  perCase.get(2)!.reactions[0].nodeId = 9;
  const factors = [{ caseId: 1, factor: 1 }, { caseId: 2, factor: 1 }];
  const expected = /Cannot combine results: case 2.*reactions.*node id 9/;
  expect(() => combineResults3D(factors, perCase, new Map())).toThrow(expected);
  expect(() => combineResultsBatch3D([factors], perCase, new Map())).toThrow(expected);
  expect(() => combineResultsEnvelope3D([factors], perCase, new Map())).toThrow(expected);
});

it('matches permuted rows in the fused and standalone envelopes', () => {
  const perCase = cases();
  const second = perCase.get(2)!;
  const reaction = second.reactions[0];
  perCase.get(1)!.reactions.push({ ...reaction, nodeId: 2, fz: 1 });
  second.reactions.push({ ...reaction, nodeId: 2, fz: -2 });
  const factors = [[{ caseId: 1, factor: 1 }], [{ caseId: 2, factor: 1 }]];
  const expected = combineResultsEnvelope3D(factors, perCase, new Map()).envelope!;
  expect(expected.maxAbsResults3D.displacements[1].uz).toBe(second.displacements[1].uz);
  expect(expected.maxAbsResults3D.reactions[1].fz).toBe(-2);

  second.displacements.reverse();
  second.reactions.reverse();
  const batch = combineResultsBatch3D(factors, perCase, new Map());
  expect(combineResultsEnvelope3D(factors, perCase, new Map())).toEqual({ combinations: batch, envelope: expected });
  expect(computeEnvelope3D(batch.filter(r => r !== null))).toEqual(expected);
  const together = factors.flat();
  const sum = combineResults3D(together, perCase, new Map());
  expect(sum?.reactions.map(r => r.nodeId)).toEqual([1, 2]);
  expect(sum?.reactions[1].fz).toBe(-1);
  expect(combineResultsBatch3D([together], perCase, new Map())).toEqual([sum]);
});

it('refuses different node sets in the 2D WASM envelope', () => {
  const result = (id: number) => ({
    displacements: [{ nodeId: id, ux: id, uz: 0, ry: 0 }],
    reactions: [],
    elementForces: [],
  });
  expect(() => compute_envelope_2d([result(2), result(9)]))
    .toThrow(/Cannot compute the envelope: result 1.*displacements.*node id 9/);
});

it('refuses unmatched P-Delta results in both WASM envelopes', () => {
  const input2D = readFileSync(new URL('../../../../../engine/tests/fixtures/ex-portal-frame-input.json', import.meta.url), 'utf8');
  const input3D = readFileSync(new URL('../../../../../engine/tests/fixtures/ex-3d-portal-frame-input.json', import.meta.url), 'utf8');
  const cases = [
    [compute_envelope_2d, JSON.parse(solve_pdelta_2d(input2D, 20, 1e-9)).results],
    [compute_envelope_3d, JSON.parse(solve_pdelta_3d(input3D, 20, 1e-9)).results],
  ] as const;
  for (const [envelope, result] of cases) {
    const control = envelope([result, result]);
    expect(control).toBeTruthy();
    const incomplete = { ...result, displacements: result.displacements.slice(0, -1) };
    expect(() => envelope([result, incomplete])).toThrow(/result 1 displacements are missing node id/);
  }
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

it.each(Object.entries(combinationPaths3D))('preserves a distorted quad after repeated case cancellation via %s (#2283)', (path, combine) => {
  const model = readFileSync(new URL('../../../../../engine/tests/fixtures/distorted-single-quad-combination.json', import.meta.url), 'utf8');
  const linear = solve_3d(JSON.parse(model));
  const nonlinear = JSON.parse(solve_pdelta_3d(model, 20, 1e-9)).results;
  const big = 2 ** 54;
  const below = 1 - Number.EPSILON / 2;
  const above = 1 + Number.EPSILON;
  for (const result of [linear, nonlinear]) {
    expect(result.quadStresses).toHaveLength(1);
    expect(result.displacements.some((row: { uz: number }) => row.uz !== 0)).toBe(true);
    expect(result.reactions.some((row: { fz: number }) => row.fz !== 0)).toBe(true);
    expect(result.structuredDiagnostics).toContainEqual(expect.objectContaining({ phase: 'SH-MITC4-DISTORTION', severity: 'warning' }));
    const perCase = new Map([[1, result]]);
    const run = (weights: number[]) => combine(splitFactors(weights), perCase);
    expect(run([big, 1, -big]), path).toStrictEqual(run([1]));
    expect(run([big, below, -big]), path).toStrictEqual(run([below]));
    expect(() => run([big, above, -big]), path).toThrow(/SH-MITC4-DISTORTION/);
  }
});

it('preserves 2D results after repeated case cancellation in the wrapper and export (#2283)', () => {
  const model = portalInput('2d');
  const big = 2 ** 54;
  for (const result of [solve_2d(JSON.parse(model)), JSON.parse(solve_pdelta_2d(model, 20, 1e-9)).results]) {
    expect(result.displacements.some((row: { ux: number }) => row.ux !== 0)).toBe(true);
    expect(result.reactions.some((row: { rz: number }) => row.rz !== 0)).toBe(true);
    const perCase = new Map([[1, result]]);
    const raw = (weights: number[]) => combine_results_2d({ factors: splitFactors(weights), cases: [{ caseId: 1, results: result }] });
    expect(raw([big, 1, -big])).toStrictEqual(raw([1]));
    expect(combineResults(splitFactors([big, 1, -big]), perCase)).toStrictEqual(combineResults(splitFactors([1]), perCase));
  }
});

const cancelled = /Repeated load case factors cancel to zero in this combination/;

it('#2292 spatial combination routes refuse complete case cancellation', () => {
  const model = readFileSync(new URL('../../../../../engine/tests/fixtures/distorted-single-quad-combination.json', import.meta.url), 'utf8');
  for (const result of [solve_3d(JSON.parse(model)), JSON.parse(solve_pdelta_3d(model, 20, 1e-9)).results]) {
    const perCase = new Map([[1, result]]);
    for (const [path, combine] of Object.entries(combinationPaths3D)) {
      const run = (weights: number[]) => combine(splitFactors(weights), perCase);
      expect(run([1]).displacements.some((row: { uz: number }) => row.uz !== 0), path).toBe(true);
      expect(run([2 ** 54, 1, -(2 ** 54)]), path).toStrictEqual(run([1]));
      expect(run([1, -1 - Number.EPSILON]), path).toStrictEqual(run([-Number.EPSILON]));
      expect(run([1, -1 + Number.EPSILON]), path).toStrictEqual(run([Number.EPSILON]));
      expect(run([0, -0]).displacements.every((row: { uz: number }) => row.uz === 0), path).toBe(true);
      expect.soft(() => run([1, -1]), path).toThrow(cancelled);
    }
  }
});

it('#2292 planar combination routes refuse complete case cancellation', () => {
  const model = portalInput('2d');
  for (const result of [solve_2d(JSON.parse(model)), JSON.parse(solve_pdelta_2d(model, 20, 1e-9)).results]) {
    const perCase = new Map([[1, result]]);
    for (const combine of [
      (weights: number[]) => combineResults(splitFactors(weights), perCase),
      (weights: number[]) => combine_results_2d({ factors: splitFactors(weights), cases: [{ caseId: 1, results: result }] }),
    ]) {
      expect(combine([1]).displacements.some((row: { uz: number }) => row.uz !== 0)).toBe(true);
      expect(combine([2 ** 54, 1, -(2 ** 54)])).toStrictEqual(combine([1]));
      expect(combine([1, -1 - Number.EPSILON])).toStrictEqual(combine([-Number.EPSILON]));
      expect(combine([1, -1 + Number.EPSILON])).toStrictEqual(combine([Number.EPSILON]));
      expect(combine([0, -0]).displacements.every((row: { uz: number }) => row.uz === 0)).toBe(true);
      expect.soft(() => combine([1, -1])).toThrow(cancelled);
    }
  }
  for (const net of [netCombinationFactors, net_combination_factors]) {
    expect.soft(() => net(splitFactors([1, -1]))).toThrow(cancelled);
    expect(net([...splitFactors([1, -1]), { caseId: 2, factor: 1 }]))
      .toStrictEqual([{ caseId: 2, factor: 1 }, { caseId: 1, factor: 0 }]);
  }
});

function resultOrRefusal<T>(run: () => T): T | string {
  try { return run(); } catch (error) { return String(error); }
}

it('#2292 WASM combination routes distinguish exact cancellation from a unit residual', () => {
  const models = [
    [portalInput('2d'), solve_2d, solve_pdelta_2d],
    [portalInput('3d'), solve_3d, solve_pdelta_3d],
  ] as const;
  for (const [index, [model, linear, nonlinear]] of models.entries()) {
    for (const result of [linear(JSON.parse(model)), JSON.parse(nonlinear(model, 20, 1e-9)).results]) {
      const perCase = new Map([[1, result]]);
      const paths = index === 0 ? {
        'planar wrapper': (weights: number[]) => combineResults(splitFactors(weights), perCase),
        'planar export': (weights: number[]) => combine_results_2d({ factors: splitFactors(weights), cases: [{ caseId: 1, results: result }] }),
      } : Object.fromEntries(Object.entries(combinationPaths3D).map(([path, combine]) => [
        path, (weights: number[]) => combine(splitFactors(weights), perCase),
      ]));
      for (const [path, run] of Object.entries(paths)) {
        const control = run([1]);
        expect(control.displacements.some((row: { uz: number }) => row.uz !== 0), path).toBe(true);
        expect.soft(() => run(factorsWithExactCancellation), path).toThrow(cancelled);
        expect.soft(resultOrRefusal(() => run(factorsWithUnitResidual)), path).toStrictEqual(control);
      }
    }
  }
});

it('#2292 case-factor resolution preserves exact signed residuals and rounds once', () => {
  const subnormal = Number.MIN_VALUE;
  const halfUlp = Number.EPSILON / 2;
  const halfMaxUlp = 2 ** 970;
  for (const resolver of [net_combination_factors, netCombinationFactors]) {
    const run = (weights: number[]) => resolver(splitFactors(weights));
    expect.soft(() => run(factorsWithExactCancellation)).toThrow(cancelled);
    expect.soft(resultOrRefusal(() => run(factorsWithUnitResidual))).toStrictEqual(splitFactors([1]));
    expect.soft(run([...factorsWithUnitResidual, -2])).toStrictEqual(splitFactors([-1]));
    const tinyResidual = factorsWithUnitResidual.map((factor, index) => index === 2 ? subnormal : factor);
    expect.soft(resultOrRefusal(() => run(tinyResidual))).toStrictEqual(splitFactors([subnormal]));
    expect.soft(resultOrRefusal(() => run(tinyResidual.map(factor => -factor)))).toStrictEqual(splitFactors([-subnormal]));
    expect(run([1, halfUlp])).toStrictEqual(splitFactors([1]));
    expect(run([1 + Number.EPSILON, halfUlp])).toStrictEqual(splitFactors([1 + 2 * Number.EPSILON]));
    expect(run([Number.MAX_VALUE, halfMaxUlp - 2 ** 917])).toStrictEqual(splitFactors([Number.MAX_VALUE]));
    expect(failure(() => run([Number.MAX_VALUE, halfMaxUlp]))).toBe(netFactorOverflow);
    expect.soft(resolver([...splitFactors(factorsWithExactCancellation), { caseId: 2, factor: 1 }]))
      .toStrictEqual([{ caseId: 2, factor: 1 }, { caseId: 1, factor: 0 }]);
  }
});

it.each([
  ['planar linear', 'ex-portal-frame-input.json', compute_envelope_2d, solve_2d, 'vStart', 'moment', 1],
  ['planar P-Delta', 'ex-portal-frame-input.json', compute_envelope_2d,
    (model: object) => JSON.parse(solve_pdelta_2d(JSON.stringify(model), 20, 1e-9)).results, 'vStart', 'moment', 1],
  ['spatial linear', 'ex-3d-portal-frame-input.json', compute_envelope_3d, solve_3d, 'vzStart', 'momentY', -1],
  ['spatial P-Delta', 'ex-3d-portal-frame-input.json', compute_envelope_3d,
    (model: object) => JSON.parse(solve_pdelta_3d(JSON.stringify(model), 20, 1e-9)).results, 'vzStart', 'momentY', -1],
] as const)('known wrong result: #1350 — %s WASM envelope locates overflow in a later case', (_name, fixture, envelope, solve, component, kind, sign) => {
  const model = JSON.parse(readFileSync(new URL(`../../../../../engine/tests/fixtures/${fixture}`, import.meta.url), 'utf8'));
  const result = solve(model);
  const force = result.elementForces[0];
  const changed = (slope: number) => ({
    ...result,
    elementForces: [{ ...force, [component]: slope }, ...result.elementForces.slice(1)],
  });
  const finite = changed(sign * (Number.MAX_VALUE / force.length / 2));
  expect(envelope([result, finite])).toBeTruthy();
  expect(() => envelope([result, changed(sign * Number.MAX_VALUE)]))
    .toThrow(new RegExp(`${kind} of element ${force.elementId}.*result 1`));
});
