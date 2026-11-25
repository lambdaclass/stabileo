import { beforeEach, describe, expect, it } from 'vitest';
import { assessProject } from '../../provenance/applicability';
import { modelFeatures } from '../../provenance/model-features';
import { modelStore, uiStore } from '../../store';
import type { Load } from '../../store/model.svelte';
import { loadFixture, type JSONModel } from '../../templates/load-fixture';
import { runDirectAnalysis } from '../direct-analysis';
import {
  buildSolverInput2D, buildSolverInput3D, buildSolverLoads3D, prepareSolverInput3D,
  solveCombinations2D, solveCombinations3D, solveCombinations3DParallel,
  validateAndSolve2D, validateAndSolve2DAsync, validateAndSolve3D, validateAndSolve3DAsync,
} from '../solver-service';
import { solvePDelta, solvePDelta3D } from '../wasm-solver';

const loadCase = { id: 1, name: 'Test case', type: 'D' };
const combo = { id: 1, name: 'Test combination', factors: [{ caseId: 1, factor: 1 }] };
const force = 4;
const length = 2;

beforeEach(() => {
  uiStore.analysisMode = '3d';
  uiStore.useNative3DPresentation();
  modelStore.clear();
  modelStore.model.loadCases = [loadCase];
  modelStore.model.combinations = [combo];
});

function cantilever(space = false) {
  const root = modelStore.addNode(0, 0, 0);
  const tip = modelStore.addNode(length, 0, 0);
  const member = modelStore.addElement(root, tip);
  modelStore.addSupportEntry({ nodeId: root, type: space ? 'fixed3d' : 'fixed' });
  return { root, tip, member };
}

function setLoad(load: unknown) {
  modelStore.model.loads = [load as Load];
}

async function outcome(run: () => unknown) {
  try {
    const result = await run();
    return typeof result === 'string' ? result : typeof result;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function refuses(field: string, entries: Record<string, () => unknown>) {
  for (const [name, run] of Object.entries(entries)) {
    expect.soft(await outcome(run), name).toContain(field);
  }
}

function planeEntries() {
  const model = modelStore.model;
  return {
    'plane builder': () => buildSolverInput2D(model),
    'plane sync': () => validateAndSolve2D(model),
    'plane async': () => validateAndSolve2DAsync(model),
    'plane combinations': () => solveCombinations2D(model, [loadCase], [combo], false),
    'plane P-Delta': () => solvePDelta(buildSolverInput2D(model)!),
  };
}

function spaceEntries() {
  const model = modelStore.model;
  return {
    'space builder': () => buildSolverInput3D(model),
    'space prepared input': () => prepareSolverInput3D(model, false).build(model.loads),
    'space loads only': () => buildSolverLoads3D(model, model.loads, false, false),
    'space sync': () => validateAndSolve3D(model),
    'space async': () => validateAndSolve3DAsync(model),
    'space combinations': () => solveCombinations3D(model, [loadCase], [combo]),
    'space parallel combinations': () => solveCombinations3DParallel(model, [loadCase], [combo]),
    'space direct analysis': () => runDirectAnalysis(model, [loadCase], [combo], { includeSelfWeight: false }),
    'space P-Delta': () => solvePDelta3D(buildSolverInput3D(model)!),
    'space store sync': () => modelStore.solve3D(false, false, true),
    'space store async': () => modelStore.solve3DAsync(false, false, true),
    'space store builder': () => modelStore.buildSolverInput3D(),
  };
}

describe('malformed authored loads', () => {
  it.each([
    ['unknown discriminator', { type: 'futureLoad', data: {} }, 'loads[0].type'],
    ['missing discriminator', { data: {} }, 'loads[0].type'],
    ['missing payload', { type: 'nodal' }, 'loads[0].data'],
    ['null payload', { type: 'nodal', data: null }, 'loads[0].data'],
  ])('refuses %s before conversion', async (_, load, field) => {
    cantilever();
    setLoad(load);
    await refuses(field, { ...planeEntries(), ...spaceEntries() });
  });

  it.each(['distributed', 'pointOnElement'] as const)('refuses a non-boolean %s isGlobal', async (type) => {
    const { member } = cantilever();
    setLoad({ type, data: {
      id: 1, elementId: member, isGlobal: 'false',
      ...(type === 'distributed' ? { qI: -force, qJ: -force } : { a: 1, p: -force }),
    } });
    await refuses('loads[0].data.isGlobal', { ...planeEntries(), ...spaceEntries() });
  });

  it.each(['distributed3d', 'pointOnElement3d', 'surface3d', 'thermalQuad3d'] as const)(
    'refuses an unknown spatial %s selector in linear and nonlinear analysis',
    async (type) => {
      const { member, root, tip } = cantilever(true);
      const other = modelStore.addNode(0, length, 0);
      const plate = modelStore.addPlate([root, tip, other], 1, 0.2);
      const invalid = type === 'thermalQuad3d' ? 'on' : 'frame';
      const data = {
        distributed3d: { elementId: member, qYI: 0, qYJ: 0, qZI: -force, qZJ: -force },
        pointOnElement3d: { elementId: member, a: 1, py: 0, pz: -force },
        surface3d: { quadId: plate, on: 'plate', q: force },
        thermalQuad3d: { quadId: plate, dtUniform: 1, dtGradient: 0 },
      }[type];
      if (type === 'distributed3d' || type === 'pointOnElement3d') modelStore.model.plates.clear();
      setLoad({ type, data: { id: 1, ...data, [invalid]: 'futureValue' } });
      await refuses('loads[0].data.' + invalid, spaceEntries());
      modelStore.model.supports.values().next().value!.uplift = true;
      await refuses('loads[0].data.' + invalid, {
        'nonlinear sync': () => modelStore.solve3D(false, false, true),
        'nonlinear async': () => modelStore.solve3DAsync(false, false, true),
        'nonlinear combination': () => modelStore.solveCombinations3D(false, false, true),
        'nonlinear parallel combination': () => modelStore.solveCombinations3DParallel(false, false, true),
      });
    },
  );

  it('refuses an unknown surface load target', async () => {
    const { root, tip } = cantilever(true);
    const third = modelStore.addNode(length, length, 0);
    const fourth = modelStore.addNode(0, length, 0);
    const quad = modelStore.addQuad([root, tip, third, fourth], 1, 0.2);
    setLoad({ type: 'surface3d', data: { id: 1, quadId: quad, on: 'futureSurface', q: force } });
    await refuses('loads[0].data.on', spaceEntries());
  });

  it.each([
    ['missing projected force', 'nodal3d', 'fz', undefined],
    ['non-finite force on the discarded axis', 'nodal3d', 'fy', NaN],
    ['missing distributed ordinate', 'distributed3d', 'qZI', undefined],
  ] as const)('checks the authored load for %s before XZ projection', async (_, type, key, invalid) => {
    const { tip, member } = cantilever();
    const data = type === 'nodal3d'
      ? { nodeId: tip, fx: 0, fy: 0, fz: -force, mx: 0, my: 0, mz: 0 }
      : { elementId: member, qYI: 0, qYJ: 0, qZI: -force, qZJ: -force };
    setLoad({ type, data: { id: 1, ...data, [key]: invalid } });
    await refuses('loads[0].data.' + key, {
      'store plane sync': () => modelStore.solve(false, 'xz'),
      'store plane async': () => modelStore.solveAsync(false, 'xz'),
      'store plane combinations': () => modelStore.solveCombinations(false, 'xz'),
      'store plane advanced input': () => modelStore.buildSolverInput(false, 'xz'),
    });
  });

  it('refuses an unknown load in both fixture apply paths before mutating the model', async () => {
    cantilever();
    const before = modelStore.snapshot();
    const fixture: JSONModel = {
      name: 'Malformed load fixture', nodes: [], elements: [], supports: [], materials: [], sections: [],
      loads: [{ type: 'futureLoad', data: {} }], plates: [], quads: [], constraints: [],
      loadCases: [loadCase], combinations: [combo],
    };
    expect.soft(await outcome(() => loadFixture(fixture, modelStore.fixtureApi() as never)), 'fixture replay').toContain('loads[0].type');
    expect.soft(modelStore.snapshot()).toEqual(before);
    expect.soft(await outcome(() => modelStore.loadExample(fixture.name, async () => fixture)), 'example apply').toContain('loads[0].type');
    expect.soft(modelStore.snapshot()).toEqual(before);
  });

  it('refuses a stored member-load frame on the solve after restoring it', async () => {
    const { member } = cantilever(true);
    const snapshot = modelStore.snapshot();
    snapshot.loads = [{ type: 'distributed3d', data: {
      id: 1, elementId: member, qYI: 0, qYJ: 0, qZI: -force, qZJ: -force,
      frame: 'futureFrame',
    } }] as unknown as typeof snapshot.loads;
    modelStore.restore(snapshot);
    expect(modelFeatures(modelStore.snapshot()).has('malformedAuthoredLoad')).toBe(true);
    await refuses('loads[0].data.frame', {
      'restore and solve': () => modelStore.solve3D(false, false, true),
    });
  });
});

it('preserves a complete spatial force through Basic XZ projection and P-Delta', async () => {
  const { tip } = cantilever();
  setLoad({ type: 'nodal3d', data: {
    id: 1, nodeId: tip, fx: 0, fy: 0, fz: -force, mx: 0, my: 0, mz: 0,
  } });
  const result = await modelStore.solveAsync(false, 'xz');
  expect(result).toMatchObject({ reactions: [{ rz: force, my: expect.closeTo(force * length, 12) }] });
  const projected = modelStore.buildSolverInput(false, 'xz')!;
  const control = solvePDelta({
    ...projected,
    loads: [{ type: 'nodal', data: { nodeId: tip, fx: 0, fz: -force, my: 0 } }],
  });
  expect(solvePDelta(projected)).toMatchObject({
    converged: true, results: { reactions: control.results.reactions },
  });
  expect(modelFeatures(modelStore.snapshot()).has('malformedAuthoredLoad')).toBe(false);
});

it.each([undefined, 'local', 'global', 'projected'] as const)(
  'preserves a supported distributed frame (%s) in spatial linear and P-Delta solves',
  (frame) => {
    const { member } = cantilever(true);
    setLoad({ type: 'distributed3d', data: {
      id: 1, elementId: member, qYI: 0, qYJ: 0, qZI: -force, qZJ: -force, frame,
    } });
    const result = modelStore.solve3D(false, false, true);
    expect(result).toMatchObject({ reactions: [{ fz: expect.closeTo(force * length, 12) }] });
    expect(solvePDelta3D(modelStore.buildSolverInput3D()!)).toMatchObject({
      converged: true, results: { reactions: [{ fz: expect.closeTo(force * length, 12) }] },
    });
  },
);


const reviewTest = process.env.STABILEO_REVIEW_2588 === '1' ? it : it.skip;

reviewTest.each([
  ['fz', undefined],
  ['fy', NaN],
] as const)('review 2588 shows the saved-model notice for a malformed spatial %s', (field, value) => {
  const { tip } = cantilever();
  setLoad({ type: 'nodal3d', data: {
    id: 1, nodeId: tip, fx: 0, fy: 0, fz: -force, mx: 0, my: 0, mz: 0, [field]: value,
  } });
  const saved = modelStore.snapshot();
  expect.soft(assessProject(saved, null, 'basic').changes.map(change => change.id)).toContain('malformed-authored-loads');
  const current = { ...saved, loads: [] };
  expect.soft(modelFeatures(current, { storedLoads: saved.loads }).has('malformedAuthoredLoad')).toBe(true);
});
