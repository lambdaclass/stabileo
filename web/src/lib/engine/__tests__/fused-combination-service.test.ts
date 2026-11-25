import { factorsWithExactCancellation, factorsWithUnitResidual, issue2297Factors } from './combination-factor-fixture';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { modelStore, uiStore } from '../../store';
import * as solver from '../wasm-solver';
import * as pool from '../solver-pool';
import { solve_3d } from '../../wasm/dedaliano_engine.js';
import { finishSolve3D } from '../solve-finish';
import { certifiableMultiCaseOf, solveCombinations3D, solveCombinations3DParallel } from '../solver-service';
import { readFileSync } from 'node:fs';
import { compareSolveResults } from '../../../../scripts/solve-benchmark-comparison';

beforeAll(solver.initSolver);
beforeEach(() => {
  modelStore.clear();
  uiStore.analysisMode = 'pro';
  vi.stubGlobal('navigator', { hardwareConcurrency: 4 });
  vi.spyOn(pool, 'isPoolReady').mockReturnValue(true);
  vi.spyOn(pool, 'solveParallel').mockImplementation(async inputs => new Map(inputs.map(({ id, input }) => {
    const wire = structuredClone(input);
    return [id, finishSolve3D(solve_3d(solver.finiteObjectWire(wire)), wire as Parameters<typeof finishSolve3D>[1])];
  })));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('uses the fused operation and then honors active result scopes', async () => {
  await modelStore.loadExample('pipe-rack');
  const active = modelStore.combinations[0].id;
  modelStore.model.resultScopes = { active: [active] };
  const fused = vi.spyOn(solver, 'combineResultsEnvelope3D');
  const batch = vi.spyOn(solver, 'combineResultsBatch3D');
  const warnings = vi.spyOn(console, 'warn');
  const parallel = await modelStore.solveCombinations3DParallel(true, false, true);
  expect(fused).toHaveBeenCalledOnce();
  expect(batch).not.toHaveBeenCalled();
  expect(warnings).not.toHaveBeenCalled();
  expect(parallel && typeof parallel === 'object').toBe(true);
  if (!parallel || typeof parallel === 'string') throw new Error(String(parallel));
  expect(parallel.perCombo.size).toBe(modelStore.combinations.length);
  expect(parallel.envelope).toEqual(solver.computeEnvelope3D([parallel.perCombo.get(active)!]));
  compareSolveResults(parallel, modelStore.solveCombinations3D(true, false, true));
});

it('preserves map replacement order for repeated combination ids', async () => {
  await modelStore.loadExample('pipe-rack');
  const first = modelStore.combinations[0], second = modelStore.combinations[1];
  const combinations = [first, second, { ...first, factors: second.factors }, { ...first, factors: [] }];
  const fused = vi.spyOn(solver, 'combineResultsEnvelope3D');
  const batch = vi.spyOn(solver, 'combineResultsBatch3D');
  const warnings = vi.spyOn(console, 'warn');
  const result = await solveCombinations3DParallel(modelStore.model, modelStore.model.loadCases, combinations, true);
  expect(fused).not.toHaveBeenCalled();
  expect(batch).toHaveBeenCalledOnce();
  expect(warnings).not.toHaveBeenCalled();
  if (!result || typeof result === 'string') throw new Error(String(result));
  expect([...result.perCombo.keys()]).toEqual([first.id, second.id]);
  expect(result.perCombo.get(first.id)).toEqual(result.perCombo.get(second.id));
  expect(result.envelope).toEqual(solver.computeEnvelope3D([...result.perCombo.values()]));
});

it('keeps shell recovery on the separate combination and envelope path', async () => {
  await modelStore.loadExample('rc-qa-diagnostic-shells');
  const fused = vi.spyOn(solver, 'combineResultsEnvelope3D');
  const batch = vi.spyOn(solver, 'combineResultsBatch3D');
  const warnings = vi.spyOn(console, 'warn');
  const parallel = await modelStore.solveCombinations3DParallel(true, false, true);
  expect(fused).not.toHaveBeenCalled();
  expect(batch).toHaveBeenCalledOnce();
  expect(warnings).not.toHaveBeenCalled();
  expect(parallel && typeof parallel === 'object').toBe(true);
  compareSolveResults(parallel, modelStore.solveCombinations3D(true, false, true));
});

it.each([['sequential', solveCombinations3D], ['parallel', solveCombinations3DParallel]] as const)(
  'preserves distorted-shell combination, envelope and certificate inputs after cancellation in the %s service (#2283)',
  async (_name, solve) => {
    const cases = singleQuad();
    const caseId = cases[0]!.id;
    const run = async (weights: number[]) => {
      const solved = await solve(modelStore.model, cases, [{ id: 1, name: 'Identity', factors: weights.map(factor => ({ caseId, factor })) }]);
      if (!solved || typeof solved === 'string') throw new Error(String(solved));
      const combination = solved.perCombo.get(1)!;
      expect(combination.structuredDiagnostics).toContainEqual(expect.objectContaining({ phase: 'SH-MITC4-DISTORTION' }));
      const certificate = certifiableMultiCaseOf(solved.perCase, solved.perCombo);
      expect(certificate?.input.wire().combinations[0].factors).toEqual({ [`case#${caseId}`]: 1 });
      return { combination, envelope: solved.envelope };
    };
    const reference = await run([1]);
    expect(reference.combination.displacements.some(row => row.uz !== 0)).toBe(true);
    expect(reference.combination.quadStresses?.some(row => row.mx !== 0)).toBe(true);
    const big = 2 ** 54;
    expect(await run([big, 1, -big])).toStrictEqual(reference);
  },
);

function singleQuad() {
  const shell = JSON.parse(readFileSync(new URL('../../../../../engine/tests/fixtures/distorted-single-quad-combination.json', import.meta.url), 'utf8'));
  const nodes = new Map<number, number>();
  for (const { id, x, y, z } of Object.values(shell.nodes) as Array<{ id: number; x: number; y: number; z: number }>) {
    nodes.set(id, modelStore.addNode(x, y, z));
  }
  const { e, nu } = shell.materials[1];
  const material = modelStore.addMaterial({ name: 'Single quad fixture', e, nu, rho: 0 });
  const quad = shell.quads[1];
  modelStore.addQuad(quad.nodes.map((id: number) => nodes.get(id)!), material, quad.thickness);
  for (const { nodeId } of Object.values(shell.supports) as Array<{ nodeId: number }>) {
    modelStore.addSupport(nodes.get(nodeId)!, 'fixed3d');
  }
  const cases = modelStore.model.loadCases.slice(0, 1);
  const caseId = cases[0]!.id;
  for (const { data: { nodeId, fx, fy, fz, mx, my, mz } } of shell.loads) {
    modelStore.addNodalLoad3D(nodes.get(nodeId)!, fx, fy, fz, mx, my, mz, caseId);
  }
  return cases;
}

async function checkNamedQuadCancellation(residual: number[], cancelledWeights: number[]) {
  const cases = singleQuad();
  const caseId = cases[0]!.id;
  for (const solve of [solveCombinations3D, solveCombinations3DParallel]) {
    const run = (weights: number[]) => solve(modelStore.model, cases, [
      { id: 1, name: 'Identity', factors: weights.map(factor => ({ caseId, factor })) },
    ]);
    const control = await run([1]);
    if (!control || typeof control === 'string') throw new Error(String(control));
    expect(control.perCombo.get(1)?.displacements.some(row => row.uz !== 0)).toBe(true);
    const preserved = await run(residual);
    expect.soft(typeof preserved === 'string' ? preserved : preserved?.perCombo.get(1)?.displacements)
      .toStrictEqual(control.perCombo.get(1)?.displacements);
    const refused = await run(cancelledWeights);
    expect.soft(typeof refused === 'string' ? refused : refused?.perCombo.get(1)?.displacements)
      .toEqual(expect.stringMatching(/Repeated load case factors cancel to zero in this combination/));
  }
}

it('#2292 the named single quad refuses complete case cancellation', async () => {
  await checkNamedQuadCancellation([2 ** 54, 1, -(2 ** 54)], [1, -1]);
});

it('#2292 the named single quad distinguishes exact cancellation from a unit residual', async () => {
  await checkNamedQuadCancellation(factorsWithUnitResidual, factorsWithExactCancellation);
});

it('#2297 the reported seven factors preserve the unit case response', async () => {
  await checkNamedQuadCancellation(issue2297Factors, [...issue2297Factors, -1]);
});
