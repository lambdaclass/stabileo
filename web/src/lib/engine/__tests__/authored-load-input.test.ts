import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tp } from '../../i18n';
import { assessProject } from '../../provenance/applicability';
import {
  loadsGeneratedWith, modelFeatures, unverifiedSeismicLoads, type FeatureSnapshot,
} from '../../provenance/model-features';
import { modelStore, uiStore } from '../../store';
import { applyGeneratedModel } from '../../store/generator-apply';
import type { Load } from '../../store/model.svelte';
import { createRecheckStore } from '../../store/recheck.svelte';
import { loadFixture, type JSONModel } from '../../templates/load-fixture';
import { runDirectAnalysis } from '../direct-analysis';
import { tallyRoles } from '../generators/member-roles';
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

function cantilever(space = false, rise = 0, plane: 'xz' | 'yz' = 'xz') {
  const root = modelStore.addNode(0, 0, 0);
  const tip = modelStore.addNode(plane === 'xz' ? length : 0, plane === 'yz' ? length : 0, rise);
  const member = modelStore.addElement(root, tip);
  modelStore.addSupportEntry({ nodeId: root, type: space ? 'fixed3d' : 'fixed' });
  return { root, tip, member };
}

function setLoad(load: unknown) {
  modelStore.model.loads = [load as Load];
}

async function returnsRefusal(field: string, entries: Record<string, () => unknown>) {
  for (const [name, run] of Object.entries(entries)) {
    expect.soft(await run(), name).toEqual(expect.stringContaining(field));
  }
}

function throwsRefusal(field: string, entries: Record<string, () => unknown>) {
  for (const [name, run] of Object.entries(entries)) {
    expect.soft(run, name).toThrow(field);
  }
}

function planeSolves() {
  const model = modelStore.model;
  return {
    'plane sync': () => validateAndSolve2D(model),
    'plane async': () => validateAndSolve2DAsync(model),
    'plane combinations': () => solveCombinations2D(model, [loadCase], [combo], false),
  };
}

function planeBuilders() {
  const model = modelStore.model;
  return {
    'plane builder': () => buildSolverInput2D(model),
    'plane P-Delta': () => solvePDelta(buildSolverInput2D(model)!),
  };
}

function spaceSolves() {
  const model = modelStore.model;
  return {
    'space sync': () => validateAndSolve3D(model),
    'space async': () => validateAndSolve3DAsync(model),
    'space combinations': () => solveCombinations3D(model, [loadCase], [combo]),
    'space parallel combinations': () => solveCombinations3DParallel(model, [loadCase], [combo]),
    'space direct analysis': () => runDirectAnalysis(model, [loadCase], [combo], { includeSelfWeight: false }),
    'space store sync': () => modelStore.solve3D(false, false, true),
    'space store async': () => modelStore.solve3DAsync(false, false, true),
    'space store combinations': () => modelStore.solveCombinations3D(false, false, true),
    'space store parallel combinations': () => modelStore.solveCombinations3DParallel(false, false, true),
  };
}

function spaceBuilders() {
  const model = modelStore.model;
  return {
    'space builder': () => buildSolverInput3D(model),
    'space prepared input': () => prepareSolverInput3D(model, false).build(model.loads),
    'space loads only': () => buildSolverLoads3D(model, model.loads, false, false),
    'space P-Delta': () => solvePDelta3D(buildSolverInput3D(model)!),
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
    await returnsRefusal(field, { ...planeSolves(), ...spaceSolves() });
    throwsRefusal(field, { ...planeBuilders(), ...spaceBuilders() });
  });

  it.each(['distributed', 'pointOnElement'] as const)('refuses a non-boolean %s isGlobal', async (type) => {
    const { member } = cantilever();
    setLoad({ type, data: {
      id: 1, elementId: member, isGlobal: 'false',
      ...(type === 'distributed' ? { qI: -force, qJ: -force } : { a: 1, p: -force }),
    } });
    const field = 'loads[0].data.isGlobal';
    await returnsRefusal(field, { ...planeSolves(), ...spaceSolves() });
    throwsRefusal(field, { ...planeBuilders(), ...spaceBuilders() });
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
      const field = 'loads[0].data.' + invalid;
      await returnsRefusal(field, spaceSolves());
      throwsRefusal(field, spaceBuilders());
      modelStore.model.supports.values().next().value!.uplift = true;
      await returnsRefusal(field, spaceSolves());
    },
  );

  it('refuses an unknown surface load target', async () => {
    const { root, tip } = cantilever(true);
    const third = modelStore.addNode(length, length, 0);
    const fourth = modelStore.addNode(0, length, 0);
    const quad = modelStore.addQuad([root, tip, third, fourth], 1, 0.2);
    setLoad({ type: 'surface3d', data: { id: 1, quadId: quad, on: 'futureSurface', q: force } });
    const field = 'loads[0].data.on';
    await returnsRefusal(field, spaceSolves());
    throwsRefusal(field, spaceBuilders());
  });

  describe.each(['xz', 'yz'] as const)('Basic %s projection', (plane) => {
    const discardedField = plane === 'xz' ? 'fy' : 'fx';
    it.each([
      ['missing projected force', 'nodal3d', 'fz', undefined],
      ['non-finite discarded force', 'nodal3d', discardedField, NaN],
      ['missing distributed ordinate', 'distributed3d', 'qZI', undefined],
    ] as const)('checks the authored load for %s before projection', async (_, type, key, invalid) => {
      const { tip, member } = cantilever(false, 0, plane);
      const data = type === 'nodal3d'
        ? { nodeId: tip, fx: 0, fy: 0, fz: -force, mx: 0, my: 0, mz: 0 }
        : { elementId: member, qYI: 0, qYJ: 0, qZI: -force, qZJ: -force };
      setLoad({ type, data: { id: 1, ...data, [key]: invalid } });
      const field = 'loads[0].data.' + key;
      await returnsRefusal(field, {
        'store plane sync': () => modelStore.solve(false, plane),
        'store plane async': () => modelStore.solveAsync(false, plane),
        'store plane combinations': () => modelStore.solveCombinations(false, plane),
      });
      throwsRefusal(field, { 'store plane advanced input': () => modelStore.buildSolverInput(false, plane) });
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
    expect.soft(() => loadFixture(fixture, modelStore.fixtureApi() as never), 'fixture replay').toThrow('loads[0].type');
    expect.soft(modelStore.snapshot()).toEqual(before);
    await expect.soft(modelStore.loadExample(fixture.name, async () => fixture), 'example apply').rejects.toThrow('loads[0].type');
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
    await returnsRefusal('loads[0].data.frame', {
      'restore and solve': () => modelStore.solve3D(false, false, true),
    });
  });
});

it.each(['xz', 'yz'] as const)('preserves a complete spatial force through Basic %s projection and P-Delta', async (plane) => {
  const { tip } = cantilever(false, 0, plane);
  setLoad({ type: 'nodal3d', data: {
    id: 1, nodeId: tip, fx: 0, fy: 0, fz: -force, mx: 0, my: 0, mz: 0,
  } });
  const result = await modelStore.solveAsync(false, plane);
  expect(result).toMatchObject({ reactions: [{ rz: force, my: expect.closeTo(force * length, 12) }] });
  const projected = modelStore.buildSolverInput(false, plane)!;
  const control = solvePDelta({
    ...projected,
    loads: [{ type: 'nodal', data: { nodeId: tip, fx: 0, fz: -force, my: 0 } }],
  });
  expect(solvePDelta(projected)).toMatchObject({
    converged: true, results: { reactions: control.results.reactions },
  });
  expect(modelFeatures(modelStore.snapshot(), { analysisMode: '2d' }).has('malformedAuthoredLoad')).toBe(false);
});

const rise = 1.5;
const span = Math.hypot(length, rise);
const localReaction = { fx: -force * rise, fz: force * length, my: -force * span ** 2 / 2 };
const globalReaction = { fx: 0, fz: force * span, my: -force * span * length / 2 };
const projectedReaction = { fx: 0, fz: force * length, my: -force * length ** 2 / 2 };

const globalAxial = -force * rise / span;
const globalTransverse = -force * length / span;

it.each([
  [undefined, localReaction, 0, -force],
  ['local', localReaction, 0, -force],
  ['global', globalReaction, globalAxial, globalTransverse],
  ['projected', projectedReaction, globalAxial * length / span, globalTransverse * length / span],
] as const)(
  'preserves a supported distributed frame (%s) in spatial linear and P-Delta solves',
  (frame, { fx, fz, my }, axial, transverse) => {
    const { member } = cantilever(true, rise);
    setLoad({ type: 'distributed3d', data: {
      id: 1, elementId: member, qYI: 0, qYJ: 0, qZI: -force, qZJ: -force, frame,
    } });
    const reaction = { fx: expect.closeTo(fx, 12), fz: expect.closeTo(fz, 12), my: expect.closeTo(my, 12) };
    expect.soft(modelStore.solve3D(false, false, true)).toMatchObject({ reactions: [reaction] });
    const input = modelStore.buildSolverInput3D()!;
    const control = solvePDelta3D({
      ...input,
      loads: [{ type: 'distributed', data: {
        elementId: member, qXI: axial, qXJ: axial, qYI: 0, qYJ: 0,
        qZI: transverse, qZJ: transverse, a: 0, b: span,
      } }],
    });
    const forces = { fx: reaction.fx, fz: reaction.fz };
    expect(control).toMatchObject({ converged: true, results: { reactions: [forces] } });
    expect(solvePDelta3D(input)).toMatchObject({
      converged: true,
      results: { reactions: [{ ...forces, my: expect.closeTo(control.results.reactions[0]!.my, 12) }] },
    });
  },
);

const incompleteForce = { type: 'nodal3d', data: { nodeId: 2, fx: 0, fy: 0, mx: 0, my: 0, mz: 0 } };
const completeForce = { ...incompleteForce, data: { ...incompleteForce.data, fz: -force } };
const incompleteThermal = { type: 'thermal', data: { elementId: 1, dtUniform: 1 } };
const unknownFrame = {
  type: 'distributed3d', data: { elementId: 1, qYI: 0, qYJ: 0, qZI: -force, qZJ: -force, frame: 'futureFrame' },
};

describe('malformed authored load provenance', () => {
  it('flags numeric data masked by Basic projection in current and stored rows', () => {
    cantilever();
    const snapshot = { ...modelStore.snapshot(), analysisMode: '2d', loads: [incompleteForce] };
    expect.soft(modelFeatures(snapshot)).toContain('malformedAuthoredLoad');
    expect.soft(modelFeatures({ ...snapshot, loads: [completeForce] }, { storedLoads: snapshot.loads }))
      .toContain('malformedAuthoredLoad');
    expect.soft(modelFeatures({ ...snapshot, loads: [completeForce] })).not.toContain('malformedAuthoredLoad');
    expect.soft(modelFeatures({ ...snapshot, analysisMode: '3d' })).not.toContain('malformedAuthoredLoad');
    expect.soft(modelFeatures({ ...snapshot, loads: [incompleteThermal] })).not.toContain('malformedAuthoredLoad');
  });

  it.each(['2d', '3d'])('finds a later bad selector after an unrelated numeric refusal in %s', (analysisMode) => {
    cantilever();
    const snapshot = { ...modelStore.snapshot(), analysisMode, loads: [incompleteThermal, unknownFrame] };
    expect.soft(modelFeatures(snapshot)).toContain('malformedAuthoredLoad');
    expect.soft(modelFeatures({ ...snapshot, loads: [unknownFrame, incompleteThermal] })).toContain('malformedAuthoredLoad');
    expect.soft(modelFeatures({ ...snapshot, loads: [incompleteThermal] })).not.toContain('malformedAuthoredLoad');
  });

  it('flags a null row while inspecting neighboring loads, seismic cases and combinations', () => {
    cantilever(true);
    const seismicForce = { ...completeForce, data: { ...completeForce.data, caseId: 1, generatedBy: 'auto' } };
    const loads = [seismicForce, null] as unknown as NonNullable<FeatureSnapshot['loads']>;
    const snapshot = { ...modelStore.snapshot(), loads, loadCases: [{ ...loadCase, type: 'E' }] };
    const features = modelFeatures(snapshot);
    expect.soft(assessProject(snapshot, null).changes.map(({ id }) => id)).toContain('malformed-authored-loads');
    expect.soft(features).toContain('malformedAuthoredLoad');
    expect.soft(features).toContain('nodalForces');
    expect.soft(modelFeatures({ ...snapshot, loads: [seismicForce] }, { storedLoads: loads }))
      .toContain('malformedAuthoredLoad');
    expect.soft(unverifiedSeismicLoads(snapshot)).toEqual([seismicForce]);
    expect.soft(loadsGeneratedWith({ ...snapshot, loads: [...loads].reverse() })).toBe(0);
  });
});

describe('authored load refusal and recheck', () => {
  it.each([
    ['xz', 'sync', 'fy'],
    ['xz', 'async', 'fy'],
    ['yz', 'sync', 'fx'],
    ['yz', 'async', 'fx'],
  ] as const)('Basic %s %s clears the previous kinematic result on a refused solve', async (plane, entry, field) => {
    const { tip } = cantilever(false, 0, plane);
    const load = { ...completeForce, data: { ...completeForce.data, nodeId: tip } };
    const solve = () => entry === 'sync' ? modelStore.solve(false, plane) : modelStore.solveAsync(false, plane);
    setLoad(load);
    expect(await solve()).toMatchObject({ reactions: [{ rz: force }] });
    expect(modelStore.kinematicResult).toMatchObject({ isSolvable: true });

    setLoad({ ...load, data: { ...load.data, [field]: NaN } });
    expect.soft(await solve()).toEqual(expect.stringContaining('loads[0].data.' + field));
    expect.soft(modelStore.kinematicResult).toBeNull();

    setLoad(load);
    expect(await solve()).toMatchObject({ reactions: [{ rz: force }] });
    expect(modelStore.kinematicResult).toMatchObject({ isSolvable: true });
  });

  it.each(['2d', '3d', 'pro'].flatMap(mode => [
    [mode, undefined], [mode, 7],
  ] as const))('rechecks generated seismic payloads in %s with type %s', async (analysisMode, type) => {
    const generated = { ...(type === undefined ? {} : { type }), data: { caseId: 1, generatedBy: 'auto' } };
    const generatedLoads = [generated];
    const staticLoad = { type: 'nodal3d', data: {
      ...completeForce.data, caseId: 1, generatedBy: 'auto', seismicGeneration: 'static',
    } };
    const snapshot: FeatureSnapshot = {
      analysisMode,
      loads: [...generatedLoads, staticLoad],
      loadCases: [{ id: 1, type: 'E', generated: true }],
      combinations: [combo],
    };
    const features = modelFeatures(snapshot);
    expect.soft(modelFeatures({ ...snapshot, loads: generatedLoads })).toContain('generatedLoads');
    expect.soft(features).toContain('malformedAuthoredLoad');
    expect.soft(features).toContain('nodalForces');
    expect.soft(unverifiedSeismicLoads(snapshot)).toEqual([generated]);
    expect.soft(loadsGeneratedWith({ ...snapshot, loads: generatedLoads })).toBe(0);

    expect.soft(modelFeatures({ ...snapshot, loads: [] }, { storedLoads: generatedLoads }))
      .toContain('occupiedGeneratedLoadCases');
    expect.soft(modelFeatures({ ...snapshot, loads: [] })).not.toContain('occupiedGeneratedLoadCases');

    const recheck = createRecheckStore();
    recheck.openProject(snapshot, analysisMode);
    await vi.waitFor(() => expect(recheck.pending).toBe(false));
    expect.soft(recheck.assessment?.changes.map(({ id }) => id)).toEqual(expect.arrayContaining([
      'malformed-authored-loads', 'seismic-modal-generation-unavailable',
    ]));
    recheck.openProject({ ...snapshot, loads: [staticLoad] }, analysisMode);
    await vi.waitFor(() => expect(recheck.pending).toBe(false));
    expect(recheck.assessment?.changes.map(({ id }) => id)).not.toContain('seismic-modal-generation-unavailable');
  });
});

describe('planar load notices and fixture collection refusals (#2583)', () => {
  it('opens a Basic saved-result notice for a nodal row missing both vertical component names', async () => {
    const { tip } = cantilever();
    const load = { type: 'nodal', data: { id: 1, nodeId: tip, fx: 0, my: 0 } };
    setLoad(load);
    const field = 'loads[0].data.fz/fy';
    const valid = { ...load, data: { ...load.data, fz: 0 } };
    const snapshot = {
      ...modelStore.snapshot(), analysisMode: '2d', loads: [load], solvedWith: undefined, pendingRecheckNotice: undefined,
    };
    const restored = { ...snapshot, loads: [valid] };
    const recheck = createRecheckStore();
    for (const [current, stored] of [[snapshot, undefined], [restored, snapshot.loads]] as const) {
      recheck.openProject(current, '2d', stored);
      await vi.waitFor(() => expect(recheck.pending).toBe(false));
      expect.soft(recheck.assessment?.changes.map(({ id }) => id)).toContain('malformed-authored-loads');
      expect.soft(recheck.noticeOpen).toBe(true);
    }

    for (const plane of ['xy', 'xz', 'yz'] as const) {
      if (plane === 'yz') Object.assign(modelStore.nodes.get(tip)!, { x: 0, y: length });
      await returnsRefusal(field, {
        sync: () => modelStore.solve(false, plane),
        async: () => modelStore.solveAsync(false, plane),
        combinations: () => modelStore.solveCombinations(false, plane),
      });
      throwsRefusal(field, { 'advanced input': () => modelStore.buildSolverInput(false, plane) });
    }
  });

  it.each([null, {}, undefined])('refuses a malformed fixture loads collection (%j) before replay', async (loads) => {
    cantilever();
    const before = modelStore.snapshot();
    const fixture: JSONModel = {
      name: 'Malformed collection fixture', nodes: [], elements: [], supports: [], materials: [], sections: [],
      loads: loads as unknown as JSONModel['loads'], plates: [], quads: [], constraints: [],
      loadCases: [loadCase], combinations: [combo],
    };
    const refusal = tp('svc.engine.invalidInputField', { path: 'loads' });
    expect.soft(() => loadFixture(fixture, modelStore.fixtureApi() as never), 'fixture replay').toThrow(refusal);
    expect.soft(modelStore.snapshot()).toEqual(before);
    await expect.soft(modelStore.loadExample(fixture.name, async () => fixture), 'example apply').rejects.toThrow(refusal);
    expect.soft(modelStore.snapshot()).toEqual(before);
    expect.soft(() => applyGeneratedModel({
      json: fixture, counts: tallyRoles([]), totalLengthM: 0, slopePercent: null, assumptions: [], sections: {},
    }, { source: 'generator-structure', params: {}, atIso: '2026-11-25T00:00:00Z' }), 'generated model apply').toThrow(refusal);
    expect.soft(modelStore.snapshot()).toEqual(before);
  });
});

it('solves a legacy fy-only nodal load without a malformed-load notice', async () => {
  const { tip } = cantilever();
  const load = { type: 'nodal', data: { id: 1, nodeId: tip, fx: 0, my: 0, fy: -force } };
  setLoad(load);
  const snapshot = {
    ...modelStore.snapshot(), analysisMode: '2d', loads: [load], solvedWith: undefined, pendingRecheckNotice: undefined,
  };
  const recheck = createRecheckStore();
  recheck.openProject(snapshot, '2d', snapshot.loads);
  await vi.waitFor(() => expect(recheck.pending).toBe(false));
  expect(recheck.loadFailed).toBe(false);
  expect(recheck.assessment?.solvedVersion).toBe(0);
  expect(recheck.assessment?.changes.map(({ id }) => id)).not.toContain('malformed-authored-loads');

  const input = modelStore.buildSolverInput(false, 'xy')!;
  const control = solvePDelta({
    ...input,
    loads: [{ type: 'nodal', data: { nodeId: tip, fx: 0, fz: -force, my: 0 } }],
  });
  expect(await modelStore.solveAsync(false, 'xy')).toMatchObject({ reactions: [{ rz: force }] });
  expect(solvePDelta(input)).toMatchObject({
    converged: true, results: { reactions: control.results.reactions },
  });
});

it('accepts an empty loads collection through fixture replay and example apply', async () => {
  const fixture: JSONModel = {
    name: 'Unloaded fixture', nodes: [{ id: 1, x: 0, y: 0, z: 0 }], elements: [], supports: [],
    materials: [], sections: [], loads: [], plates: [], quads: [], constraints: [],
    loadCases: [loadCase], combinations: [combo],
  };
  loadFixture(fixture, modelStore.fixtureApi() as never);
  expect(modelStore.nodes.size).toBe(1);
  expect(modelStore.loads).toEqual([]);
  await modelStore.loadExample(fixture.name, async () => fixture);
  expect(modelStore.nodes.size).toBe(1);
  expect(modelStore.loads).toEqual([]);
});
