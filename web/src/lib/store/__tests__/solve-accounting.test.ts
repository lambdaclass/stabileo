import { beforeEach, expect, it, vi } from 'vitest';
import { runDirectAnalysis } from '../../engine/direct-analysis';
import { runGlobalSolve } from '../../engine/live-calc';
import { solveBuckling, solveBuckling3D, solveModal, solveModal3D, solvePDelta, solvePDelta3D } from '../../engine/wasm-solver';
import { modelStore, resultsStore, uiStore } from '..';
import { createArc } from '../curved-members';
import { syncDefinedLoadsForAnalysis } from '../defined-loads';
import {
  addPlateLoad, applyPlateMeshes, createPlate, meshBeforeAnalysis, planPlateMesh, plateEntry, setPlateMeshSpec,
} from '../physical-plates';

const fault = vi.hoisted(() => ({ dropMemberLoad: false }));
vi.mock('../../engine/member-loads', async importOriginal => {
  const original = await importOriginal<typeof import('../../engine/member-loads')>();
  return {
    ...original,
    globalDistributedToSolver: (...args: Parameters<typeof original.globalDistributedToSolver>) =>
      fault.dropMemberLoad ? [] : original.globalDistributedToSolver(...args),
  };
});

const issue2459 = process.env.RUN_KNOWN_WRONG === '2459' ? it : it.skip;
const issue2460 = process.env.RUN_KNOWN_WRONG === '2460' ? it : it.skip;
const issue2461 = process.env.RUN_KNOWN_WRONG === '2461' ? it : it.skip;

beforeEach(() => {
  modelStore.clear();
  resultsStore.clear();
  uiStore.analysisMode = 'pro';
  uiStore.useNative3DPresentation();
  uiStore.includeSelfWeight = false;
  meshBeforeAnalysis.value = true;
  fault.dropMemberLoad = false;
});

function cantilever(mode: '2d' | '3d') {
  uiStore.analysisMode = mode;
  const root = modelStore.addNode(0, 0, 0);
  const tip = modelStore.addNode(2, 0, 0);
  const member = modelStore.addElement(root, tip);
  modelStore.addSupportEntry({ nodeId: root, type: mode === '2d' ? 'fixed' : 'fixed3d' });
  modelStore.addCombination('D', [{ caseId: 1, factor: 1 }]);
  return member;
}

async function refusal(solve: () => unknown) {
  try {
    return await solve();
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return error.message;
  }
}

for (const mode of ['2d', '3d'] as const) {
  issue2459(`known wrong result: #2459 refuses a restored couple edited to zero in ${mode}`, async () => {
    const member = cantilever(mode);
    const snapshot = modelStore.snapshot();
    modelStore.restore({
      ...snapshot,
      nextId: { ...snapshot.nextId, load: 2 },
      loads: [{ type: 'pointOnElement', data: { id: 1, elementId: member, a: 1, p: 0, mz: 5 } }],
    });
    expect(modelStore.updateLoad(1, { my: 0 })).toBe(true);

    const model = modelStore.model;
    const densities = new Map([...model.materials].map(([id, material]) => [id, material.density]));
    const paths = mode === '2d' ? {
      linear: () => modelStore.solve(),
      async: () => modelStore.solveAsync(),
      combinations: () => modelStore.solveCombinations(),
      pdelta: () => solvePDelta(modelStore.buildSolverInput()!),
      modal: () => solveModal(modelStore.buildSolverInput()!, densities),
      buckling: () => solveBuckling(modelStore.buildSolverInput()!),
    } : {
      linear: () => modelStore.solve3D(),
      async: () => modelStore.solve3DAsync(),
      combinations: () => modelStore.solveCombinations3D(),
      parallel: () => modelStore.solveCombinations3DParallel(),
      pdelta: () => solvePDelta3D(modelStore.buildSolverInput3D()!),
      modal: () => solveModal3D(modelStore.buildSolverInput3D()!, densities),
      buckling: () => solveBuckling3D(modelStore.buildSolverInput3D()!),
      direct: () => runDirectAnalysis(model, model.loadCases, model.combinations, { includeSelfWeight: false }),
    };
    for (const [path, solve] of Object.entries(paths)) {
      expect.soft(await refusal(solve), path).toEqual(expect.stringMatching(/case.*1.*moment/i));
    }
  });
}

function floor(curved = false) {
  const a = modelStore.addNode(0, 0, 0);
  const b = modelStore.addNode(4, 0, 0);
  const c = modelStore.addNode(4, 5, 0);
  const d = modelStore.addNode(0, 5, 0);
  for (const node of [a, b, c, d]) modelStore.addSupport(node, 'fixed3d');
  const mid = curved ? modelStore.addNode(2, -2, 0) : undefined;
  if (curved) createArc(a, { x: 2, y: 2, z: 0 }, b, 4);
  const plate = createPlate({
    name: 'Test floor', outline: mid === undefined ? [a, b, c, d] : [a, mid, b, c, d],
    arcMids: mid === undefined ? undefined : [1], materialId: 1, thickness: 0.2, followArcs: false,
    mesh: { size: curved ? 1 : 2, element: curved ? 'tri' : 'quad', followMembers: false },
  });
  if (!('id' in plate)) throw new Error(plate.problem);
  addPlateLoad(plate.id, 1, 1);
  return plate.id;
}

issue2460('known wrong result: #2460 automatic solve refuses the complementary plate sweep', async () => {
  floor(true);
  expect(await runGlobalSolve({ directBase: true })).toMatchObject({
    ok: false, error: expect.stringMatching(/Test floor.*sweep/i),
  });
  expect(resultsStore.results3D).toBeNull();
});

issue2460('known wrong result: #2460 direct solve refuses the complementary plate sweep', () => {
  const id = floor(true);
  expect(applyPlateMeshes([planPlateMesh(id)!]).plates).toBe(1);
  syncDefinedLoadsForAnalysis();
  expect(modelStore.solve3D(false, false, true)).toEqual(expect.stringMatching(/Test floor.*sweep/i));
});

issue2461('known wrong result: #2461 automatic remesh refuses to discard a shell offset', async () => {
  const id = floor();
  expect(applyPlateMeshes([planPlateMesh(id)!]).plates).toBe(1);
  const shell = plateEntry(id)!.group.members.quads![0]!;
  modelStore.setShellOffset('quad', shell, { frame: 'local', x: 0, y: 0, z: 0.1 });
  setPlateMeshSpec([id], { size: 1 });
  expect(await runGlobalSolve({ directBase: true })).toMatchObject({
    ok: false, error: expect.stringMatching(/Test floor.*offset/i),
  });
  expect(modelStore.quads.get(shell)?.offset).toEqual({ frame: 'local', x: 0, y: 0, z: 0.1 });
  expect(resultsStore.results3D).toBeNull();
});

const droppedLoadTest = process.env.RUN_KNOWN_WRONG === 'accounting' ? it : it.skip;

droppedLoadTest('refuses a distributed member load lost in assembly', () => {
  const member = cantilever('3d');
  const model = modelStore.model;
  model.loads.push({ type: 'distributed3d', data: {
    id: 1, elementId: member, qYI: 0, qYJ: 0, qZI: -2, qZJ: -4, frame: 'global', caseId: 1,
  } });
  const result = modelStore.solve3D();
  if (!result || typeof result === 'string') throw new Error(String(result));
  expect(result.reactions[0]?.fz).toBeCloseTo(6, 12);
  fault.dropMemberLoad = true;
  expect(modelStore.solve3D()).toEqual(expect.stringMatching(/case.*1.*Fz.*-6.*0/i));
});
