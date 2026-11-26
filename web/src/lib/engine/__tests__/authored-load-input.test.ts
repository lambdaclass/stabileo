import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tp } from '../../i18n';
import { assessProject } from '../../provenance/applicability';
import {
  loadsGeneratedWith, modelFeatures, unverifiedSeismicLoads, type FeatureSnapshot,
} from '../../provenance/model-features';
import { modelStore, uiStore } from '../../store';
import { applyGeneratedModel } from '../../store/generator-apply';
import { deserializeProjectOrThrow, serializeProject } from '../../store/file';
import type { Load } from '../../store/model.svelte';
import { createRecheckStore } from '../../store/recheck.svelte';
import { loadFixture, prepareFixture, type JSONModel } from '../../templates/load-fixture';
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
  const { root, tip } = cantilever(false, 0, plane);
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
  const pdelta = solvePDelta(projected);
  expect(pdelta).toMatchObject({
    converged: true, results: { reactions: control.results.reactions },
  });
  const supportReaction = { nodeId: root, rz: expect.closeTo(force, 12) };
  expect.soft(control.results.reactions).toMatchObject([supportReaction]);
  expect.soft(pdelta.results.reactions).toMatchObject([supportReaction]);
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


it.each([
  ['fz', undefined],
  ['fy', NaN],
] as const)('shows the saved-model notice for a malformed spatial %s', (field, value) => {
  const { tip } = cantilever();
  setLoad({ type: 'nodal3d', data: {
    id: 1, nodeId: tip, fx: 0, fy: 0, fz: -force, mx: 0, my: 0, mz: 0, [field]: value,
  } });
  const saved: ReturnType<typeof modelStore.snapshot> = JSON.parse(JSON.stringify(modelStore.snapshot()));
  expect.soft(assessProject(saved, null, 'basic').changes.map(change => change.id)).toContain('malformed-authored-loads');
  const current = { ...saved, loads: [] };
  expect.soft(modelFeatures(current, { storedLoads: saved.loads }).has('malformedAuthoredLoad')).toBe(true);
});

it.each([
  ['distributed3d', 'isGlobal', { qYI: 0, qYJ: 0, qZI: -force, qZJ: -force, isGlobal: true }],
  ['pointOnElement3d', 'isGlobal', { a: 1, py: 0, pz: -force, frame: 'local', isGlobal: false }],
  ['distributed', 'frame', { qI: -force, qJ: -force, frame: 'global' }],
  ['distributed', 'on', { qI: -force, qJ: -force, on: 'plate' }],
])('refuses the %s selector %s from another load schema', async (type, selector, data) => {
  const { member } = cantilever(false, length);
  const load = { type, data: { id: 1, elementId: member, caseId: 1, ...data } };
  setLoad(load);
  const before = modelStore.snapshot();
  const fixture: JSONModel = {
    name: 'Wrong selector', nodes: [], elements: [], supports: [], materials: [], sections: [],
    loads: [load], plates: [], quads: [], constraints: [], loadCases: [loadCase], combinations: [combo],
  };
  await refuses('loads[0].data.' + selector, {
    ...planeEntries(), ...spaceEntries(),
    'plane store sync': () => modelStore.solve(false, 'xz'),
    'plane store async': () => modelStore.solveAsync(false, 'xz'),
    'plane store combinations': () => modelStore.solveCombinations(false, 'xz'),
    'plane store builder': () => modelStore.buildSolverInput(false, 'xz'),
    'fixture replay': () => loadFixture(fixture, modelStore.fixtureApi() as never),
    'example apply': () => modelStore.loadExample(fixture.name, async () => fixture),
  });
  expect(modelStore.snapshot()).toEqual(before);
});

it('shows the saved-model notice for a null load without losing valid load features', () => {
  cantilever();
  const saved = { ...modelStore.snapshot(), loads: JSON.parse('[null]') as ReturnType<typeof modelStore.snapshot>['loads'] };
  expect.soft(assessProject(saved, null, 'basic').changes.map(change => change.id)).toContain('malformed-authored-loads');
  setLoad({ type: 'distributed', data: { elementId: 1, qI: -force, qJ: -force } });
  const features = modelFeatures(modelStore.snapshot(), { storedLoads: saved.loads });
  expect.soft(features.has('malformedAuthoredLoad')).toBe(true);
  expect(features.has('distributedMemberLoads')).toBe(true);
});

it('refuses a misspelled load frame on an inclined member', async () => {
  const rise = length;
  const { member } = cantilever(true, rise);
  const load = { type: 'distributed3d', data: {
    id: 1, elementId: member, qYI: 0, qYJ: 0, qZI: -force, qZJ: -force,
  } };
  setLoad({ ...load, data: { ...load.data, frame: 'global' } });
  expect(validateAndSolve3D(modelStore.model)).toMatchObject({
    reactions: [{ fx: expect.closeTo(0, 12), fz: expect.closeTo(force * Math.hypot(length, rise), 12) }],
  });
  setLoad(load);
  expect(validateAndSolve3D(modelStore.model)).toMatchObject({
    reactions: [{ fx: expect.closeTo(-force * rise, 12), fz: expect.closeTo(force * length, 12) }],
  });
  const snapshot = modelStore.snapshot();
  const invalid = { ...load, data: { ...load.data, fram: 'global' } };
  modelStore.restore({ ...snapshot, loads: [invalid] });
  const fixture: JSONModel = {
    name: 'Misspelled frame', nodes: [], elements: [], supports: [], materials: [], sections: [],
    loads: [invalid], plates: [], quads: [], constraints: [], loadCases: [loadCase], combinations: [combo],
  };
  await refuses('loads[0].data.fram', {
    ...planeEntries(), ...spaceEntries(),
    'plane store sync': () => modelStore.solve(false, 'xz'),
    'plane store async': () => modelStore.solveAsync(false, 'xz'),
    'plane store nonlinear': () => modelStore.buildSolverInput(false, 'xz'),
    'fixture replay': () => loadFixture(fixture, modelStore.fixtureApi() as never),
    'example apply': () => modelStore.loadExample(fixture.name, async () => fixture),
  });
  expect(assessProject(modelStore.snapshot(), null, 'pro').changes.map(change => change.id)).toContain('malformed-authored-loads');
});

it.each([null, {}])('refuses and flags a non-array loads collection (%j)', async (loads) => {
  cantilever();
  const snapshot = modelStore.snapshot();
  const saved = { ...snapshot, loads } as typeof snapshot;
  expect.soft(assessProject(saved, null, 'basic').changes.map(change => change.id)).toContain('malformed-authored-loads');
  expect.soft(modelFeatures(snapshot, { storedLoads: saved.loads }).has('malformedAuthoredLoad')).toBe(true);
  expect.soft(modelFeatures({ ...snapshot, loads: undefined }).has('malformedAuthoredLoad')).toBe(false);
  const previousLoads = modelStore.model.loads;
  try {
    expect.soft(() => modelStore.restore(saved)).toThrow(/Field loads /);
  } finally {
    modelStore.model.loads = previousLoads;
  }
  const fixture: JSONModel = {
    name: 'Malformed load collection', nodes: [], elements: [], supports: [], materials: [], sections: [],
    loads: loads as JSONModel['loads'], plates: [], quads: [], constraints: [], loadCases: [loadCase], combinations: [combo],
  };
  modelStore.model.loads = loads as Load[];
  try {
    await refuses('Field loads ', {
      ...planeEntries(), ...spaceEntries(),
      'plane store sync': () => modelStore.solve(false, 'xz'),
      'plane store async': () => modelStore.solveAsync(false, 'xz'),
      'fixture replay': () => loadFixture(fixture, modelStore.fixtureApi() as never),
      'example apply': () => modelStore.loadExample(fixture.name, async () => fixture),
    });
  } finally {
    modelStore.model.loads = previousLoads;
  }
});

it.each([false, true])('finds a malformed row independently of planar torsion (torsion first = %s)', (torsionFirst) => {
  const { member } = cantilever();
  const snapshot = modelStore.snapshot();
  const torsion = { type: 'pointOnElement', data: { id: 1, elementId: member, a: 1, p: -force, mx: force } };
  const invalid = { ...snapshot, loads: torsionFirst ? [torsion, null] : [null, torsion] } as typeof snapshot;
  const features = modelFeatures(invalid);
  expect.soft(features.has('invalidPlanarMemberTorsion')).toBe(true);
  expect.soft(features.has('malformedAuthoredLoad')).toBe(true);
  expect(modelFeatures({ ...snapshot, loads: [torsion] }).has('malformedAuthoredLoad')).toBe(false);
});

it.each([
  ['my', '5'], ['mz', '5'], ['my', null], ['mz', null],
] as const)('flags a malformed saved planar %s of %j before resolving moment aliases', async (field, value) => {
  const { root, tip } = cantilever();
  const data = { id: 1, nodeId: tip, fx: 0, fz: 0, caseId: 1 };
  setLoad({ type: 'nodal', data: { ...data, mz: force } });
  const control = validateAndSolve2D(modelStore.model);
  expect(control).toMatchObject({ reactions: [{ nodeId: root, my: expect.closeTo(-force, 12) }], displacements: expect.any(Array) });
  setLoad({ type: 'nodal', data: { ...data, [field]: value } });
  const saved: ReturnType<typeof modelStore.snapshot> = JSON.parse(JSON.stringify(modelStore.snapshot()));
  const part = `loads[0].data.${field}`;
  expect.soft(assessProject(saved, null, 'basic').changes.map(entry => entry.id)).toContain('malformed-authored-loads');
  expect.soft(modelFeatures({ ...saved, loads: [] }, { storedLoads: saved.loads })).toContain('malformedAuthoredLoad');
  expect(deserializeProjectOrThrow(JSON.stringify({ ...JSON.parse(serializeProject()), snapshot: saved }))).toBe(true);
  expect.soft(modelStore.model.loads[0]).toMatchObject({ type: 'nodal', data: { [field]: value } });
  const fixture: JSONModel = {
    name: 'Malformed nodal moment', nodes: [], elements: [], supports: [], materials: [], sections: [],
    loads: saved.loads, plates: [], quads: [], constraints: [], loadCases: [loadCase], combinations: [combo],
  };
  await refuses(part, {
    'fixture replay': () => loadFixture(fixture, modelStore.fixtureApi() as never),
    'example apply': () => modelStore.loadExample(fixture.name, async () => fixture),
    ...planeEntries(), ...spaceEntries(),
    'plane store sync': () => modelStore.solve(false, 'xz'),
    'plane store async': () => modelStore.solveAsync(false, 'xz'),
    'plane store advanced': () => modelStore.buildSolverInput(false, 'xz'),
  });
});

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

it.each(['2d', '3d', 'pro'].flatMap(mode => [[mode, {}], [mode, null]] as const))(
  'flags a present non-array loads collection in %s (%j)',
  async (analysisMode, malformedLoads) => {
    cantilever(analysisMode !== '2d');
    const snapshot = {
      ...modelStore.snapshot(), analysisMode, loads: [completeForce], solvedWith: undefined, pendingRecheckNotice: undefined,
    };
    const loads = malformedLoads as unknown as FeatureSnapshot['loads'];
    const malformed = { ...snapshot, loads };
    expect.soft(assessProject(malformed, null, analysisMode).changes.map(({ id }) => id))
      .toContain('malformed-authored-loads');

    const recheck = createRecheckStore();
    for (const [current, stored] of [[malformed, undefined], [snapshot, loads]] as const) {
      recheck.openProject(current, analysisMode, stored);
      await vi.waitFor(() => expect(recheck.pending).toBe(false));
      expect.soft(recheck.assessment?.changes.map(({ id }) => id)).toContain('malformed-authored-loads');
      expect.soft(recheck.noticeOpen).toBe(true);
    }
  },
);

it.each(['2d', '3d', 'pro'])('accepts empty or omitted loads evidence in %s rechecks', async (analysisMode) => {
  cantilever(analysisMode !== '2d');
  const { loads: _loads, ...snapshot } = modelStore.snapshot();
  const unloaded = { ...snapshot, analysisMode, solvedWith: undefined, pendingRecheckNotice: undefined };
  const empty = { ...unloaded, loads: [] };
  const recheck = createRecheckStore();
  for (const [current, stored] of [[unloaded, empty.loads], [empty, undefined]] as const) {
    recheck.openProject(current, analysisMode, stored);
    await vi.waitFor(() => expect(recheck.pending).toBe(false));
    expect(recheck.loadFailed).toBe(false);
    expect(recheck.assessment?.changes.map(({ id }) => id)).not.toContain('malformed-authored-loads');
  }
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

function loadTargetFixture(): JSONModel {
  return {
    name: 'Load targets fixture',
    nodes: [
      { id: 11, x: 0, y: 0, z: 0 },
      { id: 12, x: length, y: 0, z: 0 },
      { id: 13, x: length, y: length, z: 0 },
      { id: 14, x: 0, y: length, z: 0 },
    ],
    elements: [{ id: 1, type: 'frame', nodeI: 11, nodeJ: 12, materialId: 1, sectionId: 1 }],
    plates: [{ id: 1, nodes: [11, 12, 13], materialId: 1, thickness: 0.2 }],
    quads: [{ id: 41, nodes: [11, 12, 13, 14], materialId: 1, thickness: 0.2 }],
    materials: [], sections: [], supports: [], loads: [], constraints: [],
    loadCases: [loadCase], combinations: [combo],
  };
}

function applyGeneratedFixture(json: JSONModel) {
  return applyGeneratedModel({
    json, counts: tallyRoles([]), totalLengthM: 0, slopePercent: null, assumptions: [], sections: {},
  }, { source: 'generator-structure', params: {}, atIso: '2026-11-25T00:00:00Z' });
}

const missingTargetCases = [
  ['nodal', 'nodeId', 1, 12, { fx: 0, fz: -force }],
  ['nodal3d', 'nodeId', 1, 12, { fx: 0, fy: 0, fz: -force, mx: 0, my: 0, mz: 0 }],
  ['displacement3d', 'nodeId', 1, 12, { dz: 0.001 }],
  ['distributed', 'elementId', 11, 1, { qI: -force, qJ: -force }],
  ['pointOnElement', 'elementId', 11, 1, { a: length / 2, p: -force }],
  ['thermal', 'elementId', 11, 1, { dtUniform: 1, dtGradient: 0 }],
  ['distributed3d', 'elementId', 11, 1, { qYI: 0, qYJ: 0, qZI: -force, qZJ: -force }],
  ['pointOnElement3d', 'elementId', 11, 1, { a: length / 2, py: 0, pz: -force }],
  ['prestress3d', 'elementId', 11, 1, { force, eI: 0, eM: 0, eJ: 0 }],
  ['surface3d', 'quadId', 1, 41, { q: force }],
  ['surface3d', 'quadId', 41, 1, { on: 'plate', q: force }],
  ['thermalQuad3d', 'quadId', 1, 41, { dtUniform: 1, dtGradient: 0 }],
  ['thermalQuad3d', 'quadId', 41, 1, { on: 'plate', dtUniform: 1, dtGradient: 0 }],
] as const;

describe('fixture load target preflight (#2583)', () => {
  it.each(missingTargetCases)(
    'refuses fixture %s with %s %i outside its target collection',
    async (type, field, missing, existing, data) => {
      cantilever();
      const before = modelStore.snapshot();
      const fixture = loadTargetFixture();
      fixture.loads = [{ type, data: { ...data, [field]: missing } }];
      const refusal = tp('svc.engine.invalidInputField', { path: `loads[0].data.${field}` });

      expect.soft(() => prepareFixture(fixture), 'fixture preflight').toThrow(refusal);
      expect.soft(() => loadFixture(fixture, modelStore.fixtureApi() as never), 'direct replay').toThrow(refusal);
      expect.soft(modelStore.snapshot(), 'after direct replay').toEqual(before);
      const exampleError = await modelStore.loadExample(fixture.name, async () => fixture).catch((error: unknown) => error);
      expect.soft(exampleError, 'example apply').toMatchObject({ message: refusal });
      expect.soft(modelStore.snapshot(), 'after example apply').toEqual(before);
      expect.soft(() => applyGeneratedFixture(fixture), 'generator apply').toThrow(refusal);
      expect.soft(modelStore.snapshot(), 'after generator apply').toEqual(before);

      const valid = { ...fixture, loads: [{ type, data: { ...data, [field]: existing } }] };
      expect(() => prepareFixture(valid)).not.toThrow();
    },
  );
});

it.each(['plane', 'space'] as const)('solves valid %s fixture loads after remapping their targets', async (mode) => {
  const fixture = loadTargetFixture();
  fixture.nodes = fixture.nodes.slice(0, 2);
  fixture.plates = [];
  fixture.quads = [];
  fixture.supports = [{ id: 1, nodeId: 11, type: mode === 'plane' ? 'fixed' : 'fixed3d' }];
  fixture.loads = mode === 'plane' ? [
    { type: 'nodal', data: { nodeId: 12, fx: 0, fz: -force } },
    { type: 'distributed', data: { elementId: 1, qI: -force, qJ: -force } },
  ] : [
    { type: 'nodal3d', data: { nodeId: 12, fx: 0, fy: 0, fz: -force, mx: 0, my: 0, mz: 0 } },
    { type: 'distributed3d', data: { elementId: 1, qYI: 0, qYJ: 0, qZI: -force, qZJ: -force, frame: 'global' } },
  ];
  const reaction = expect.closeTo(force + force * length, 12);
  for (const apply of [
    () => loadFixture(fixture, modelStore.fixtureApi() as never),
    () => modelStore.loadExample(fixture.name, async () => fixture),
    () => applyGeneratedFixture(fixture),
  ]) {
    modelStore.clear();
    await apply();
    if (mode === 'plane') {
      expect(modelStore.solve(false, 'xy')).toMatchObject({ reactions: [{ rz: reaction }] });
    } else {
      expect(modelStore.solve3D(false, false, true)).toMatchObject({ reactions: [{ fz: reaction }] });
    }
  }
});
