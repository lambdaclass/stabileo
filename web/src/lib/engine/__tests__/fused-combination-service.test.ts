import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { modelStore, uiStore } from '../../store';
import * as solver from '../wasm-solver';
import * as pool from '../solver-pool';
import { solve_3d } from '../../wasm/dedaliano_engine.js';
import { finishSolve3D } from '../solve-finish';
import { solveCombinations3DParallel } from '../solver-service';
import { compareSolveResults } from '../../../../scripts/solve-benchmark-comparison';

beforeAll(solver.initSolver);
beforeEach(() => {
  modelStore.clear();
  uiStore.analysisMode = 'pro';
  vi.stubGlobal('navigator', { hardwareConcurrency: 4 });
  vi.spyOn(pool, 'isPoolReady').mockReturnValue(true);
  vi.spyOn(pool, 'solveParallel').mockImplementation(async inputs => new Map(inputs.map(({ id, input }) => {
    const wire = structuredClone(input);
    solver.assertFiniteWire(wire);
    return [id, finishSolve3D(solve_3d(wire), wire as Parameters<typeof finishSolve3D>[1])];
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
