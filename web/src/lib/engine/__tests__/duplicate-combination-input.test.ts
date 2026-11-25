import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { modelStore, uiStore } from '../../store';
import { setLocale } from '../../i18n';
import { mainThreadPDelta, runDirectAnalysis } from '../direct-analysis';
import { solveCombinations2D, solveCombinations3D, solveCombinations3DParallel } from '../solver-service';
import { initSolver } from '../wasm-solver';

const force = 4;
const loadCase = { id: 1, name: 'Dead', type: 'D' };
const first = { id: 1, name: 'First', factors: [{ caseId: loadCase.id, factor: 1 }] };
const second = { id: 2, name: 'Second', factors: [{ caseId: loadCase.id, factor: 2 }] };

beforeAll(async () => { await initSolver(); });
beforeEach(() => {
  modelStore.clear();
  uiStore.analysisMode = '3d';
  uiStore.useNative3DPresentation();
});

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

  directRun.mockClear();
  await setLocale('es');
  try {
    expect(await solve([first, { ...second, id: first.id }]))
      .toBe('Falta el campo combinations[1].id o su valor no es compatible.');
    expect(directRun).not.toHaveBeenCalled();
  } finally {
    await setLocale('en');
  }
});
