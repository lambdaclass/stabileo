import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { modelStore, uiStore } from '../../store';
import { setLocale } from '../../i18n';
import { mainThreadPDelta, runDirectAnalysis } from '../direct-analysis';
import { solveCombinations2D, solveCombinations3D, solveCombinations3DParallel } from '../solver-service';
import * as solver from '../wasm-solver';
import * as pool from '../solver-pool';
import { solve_3d, solve_pdelta_3d } from '../../wasm/dedaliano_engine.js';
import { finishSolve3D } from '../solve-finish';

const force = 4;
const loadCase = { id: 1, name: 'Dead', type: 'D' };
const first = { id: 1, name: 'First', factors: [{ caseId: loadCase.id, factor: 1 }] };
const second = { id: 2, name: 'Second', factors: [{ caseId: loadCase.id, factor: 2 }] };

beforeAll(async () => { await solver.initSolver(); });
beforeEach(() => {
  modelStore.clear();
  uiStore.analysisMode = '3d';
  uiStore.useNative3DPresentation();
});

afterEach(() => vi.restoreAllMocks());

it.each([
  'planar solve-each', 'planar superposition', 'planar store',
  'spatial solve-each', 'spatial superposition', 'spatial parallel',
  'spatial store', 'spatial parallel store',
  'P-Delta', 'P-Delta parallel', 'direct analysis',
] as const)('refuses repeated combination IDs before %s', async (entry) => {
  const planar = entry.startsWith('planar');
  const root = modelStore.addNode(0, 0, 0);
  const tip = modelStore.addNode(2, 0, 0);
  modelStore.addElement(root, tip);
  modelStore.addSupport(root, planar ? 'fixed' : 'fixed3d');
  if (planar) modelStore.addNodalLoad(tip, force, 0, 0);
  else modelStore.addNodalLoad3D(tip, force, 0, 0, 0, 0, 0);
  modelStore.model.loadCases = [loadCase];
  const model = {
    ...modelStore.model,
    analysis: {
      combinationMethod: entry.endsWith('superposition') ? 'superpose' as const : 'solveEach' as const,
      perCombination: entry.startsWith('P-Delta') ? 'pdelta' as const : 'linear' as const,
    },
  };
  const directRun = vi.fn(mainThreadPDelta);
  const planarBatch = vi.spyOn(solver, 'solveMultiCase2D');
  const spatialBatch = vi.spyOn(solver, 'solveMultiCase3D');
  const planarLinear = vi.spyOn(solver, 'solve');
  const spatialLinear = vi.spyOn(solver, 'solve3D');
  const pdelta = vi.spyOn(solver, 'solvePDelta3D');
  vi.spyOn(pool, 'isPoolReady').mockReturnValue(true);
  const workerBatch = vi.spyOn(pool, 'solveParallel').mockImplementation(async inputs => new Map(
    inputs.map(({ id, input }) => {
      const wire = solver.finiteObjectWire(input);
      return [id, finishSolve3D(solve_3d(wire), wire as Parameters<typeof finishSolve3D>[1])];
    }),
  ));
  const workerPdelta = vi.spyOn(pool, 'pdelta3DInWorker').mockImplementation(async (wire, iterations, tolerance) =>
    JSON.parse(solve_pdelta_3d(solver.finiteWireJson(wire), iterations, tolerance)),
  );
  const expectedDispatch = {
    'planar solve-each': [planarBatch],
    'planar superposition': [planarBatch],
    'planar store': [planarBatch],
    'spatial solve-each': [spatialBatch],
    'spatial superposition': [spatialBatch],
    'spatial parallel': [workerBatch],
    'spatial store': [spatialBatch],
    'spatial parallel store': [workerBatch],
    'P-Delta': [spatialBatch, pdelta],
    'P-Delta parallel': [spatialBatch, workerPdelta],
    'direct analysis': [directRun],
  }[entry];
  const dispatch = { planarBatch, spatialBatch, planarLinear, spatialLinear, pdelta, workerBatch, workerPdelta, directRun };
  const dispatchCounts = () => Object.fromEntries(Object.entries(dispatch).map(([name, spy]) => [name, spy.mock.calls.length]));
  const solve = (combinations: typeof first[]) => {
    modelStore.model.combinations = combinations;
    if (entry === 'planar store') return modelStore.solveCombinations(false, 'xz');
    if (entry === 'spatial store') return modelStore.solveCombinations3D(false, false, true);
    if (entry === 'spatial parallel store') return modelStore.solveCombinations3DParallel(false, false, true);
    if (planar) return solveCombinations2D(model, [loadCase], combinations, false);
    if (entry === 'direct analysis') {
      return runDirectAnalysis(model, [loadCase], combinations, { includeSelfWeight: false, run: directRun });
    }
    if (entry.endsWith('parallel')) return solveCombinations3DParallel(model, [loadCase], combinations);
    return solveCombinations3D(model, [loadCase], combinations);
  };

  const single = await solve([first]);
  const distinct = await solve([first, second]);
  for (const [result, expected] of [
    [single, [[first.id, -force]]],
    [distinct, [[first.id, -force], [second.id, -2 * force]]],
  ] as const) {
    if (!result || typeof result === 'string') throw new Error(String(result));
    expect([...result.perCombo.keys()]).toEqual(expected.map(([id]) => id));
    for (const [id, reaction] of expected) {
      const reactions = result.perCombo.get(id)?.reactions;
      expect(reactions).toHaveLength(1);
      const rootReaction = reactions?.[0];
      expect(rootReaction?.nodeId).toBe(root);
      expect(rootReaction && ('fx' in rootReaction ? rootReaction.fx : rootReaction.rx)).toBeCloseTo(reaction, 12);
    }
  }

  for (const spy of expectedDispatch) expect(spy).toHaveBeenCalled();
  const before = dispatchCounts();
  await setLocale('es');
  try {
    expect.soft(await solve([first, { ...second, id: first.id }]))
      .toBe('Falta el campo combinations[1].id o su valor no es compatible.');
    expect(dispatchCounts()).toEqual(before);
  } finally {
    await setLocale('en');
  }
});
