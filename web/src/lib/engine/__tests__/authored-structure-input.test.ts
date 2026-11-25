import { beforeEach, describe, expect, it } from 'vitest';
import { assessProject } from '../../provenance/applicability';
import { modelFeatures } from '../../provenance/model-features';
import { readStamp } from '../../provenance/solve-stamp';
import { fragmentFromJSONModel } from '../../model/edit/fragment-code';
import { modelStore, resultsStore, uiStore } from '../../store';
import { createRecheckStore } from '../../store/recheck.svelte';
import { acceptAutosavePayload, deserializeProjectOrThrow, serializeProject } from '../../store/file';
import { projectOnto } from '../../store/switch-2d';
import { loadFixture, type JSONModel } from '../../templates/load-fixture';
import { runDirectAnalysis } from '../direct-analysis';
import {
  buildSolverInput2D, buildSolverInput3D, prepareSolverInput3D,
  solveCombinations2D, solveCombinations3D, solveCombinations3DParallel,
  validateAndSolve2D, validateAndSolve2DAsync, validateAndSolve3D, validateAndSolve3DAsync,
} from '../solver-service';
import { solvePDelta, solvePDelta3D } from '../wasm-solver';

const review = it.skipIf(process.env.STABILEO_REVIEW_REPRO !== '1');

const loadCase = { id: 1, name: 'Test case', type: 'D' };
const combo = { id: 1, name: 'Test combination', factors: [{ caseId: 1, factor: 1 }] };
let root: number;
let tip: number;
let member: number;
let support: number;

beforeEach(() => {
  uiStore.analysisMode = '3d';
  uiStore.useNative3DPresentation();
  modelStore.clear();
  root = modelStore.addNode(0, 0, 0);
  tip = modelStore.addNode(2, 0, 0);
  member = modelStore.addElement(root, tip);
  support = modelStore.addSupportEntry({ nodeId: root, type: 'fixed' });
  modelStore.model.loadCases = [loadCase];
  modelStore.model.combinations = [combo];
  modelStore.model.loads = [{ type: 'nodal', data: { id: 1, nodeId: tip, fx: 1, fz: 0, my: 0, caseId: 1 } }];
});

async function refuses(field: string, entries: Record<string, () => unknown>) {
  for (const [entry, run] of Object.entries(entries)) {
    let result: unknown;
    try {
      result = await run();
    } catch (error) {
      result = error instanceof Error ? error.message : String(error);
    }
    expect.soft(typeof result === 'string' ? result : typeof result, entry).toContain(field);
  }
}

function combinations(model = modelStore.model, combos = model.combinations) {
  return {
    'plane combinations': () => solveCombinations2D(model, [loadCase], combos),
    'space combinations': () => solveCombinations3D(model, [loadCase], combos),
    'space parallel combinations': () => solveCombinations3DParallel(model, [loadCase], combos),
    'space direct analysis': () => runDirectAnalysis(model, [loadCase], combos, { includeSelfWeight: false }),
  };
}

function analysisEntries() {
  const model = modelStore.model;
  return {
    'plane builder': () => buildSolverInput2D(model),
    'plane linear': () => validateAndSolve2D(model),
    'plane linear async': () => validateAndSolve2DAsync(model),
    'plane P-Delta': () => solvePDelta(buildSolverInput2D(model)!),
    'space builder': () => buildSolverInput3D(model),
    'space prepared input': () => prepareSolverInput3D(model, false).build(model.loads),
    'space linear': () => validateAndSolve3D(model),
    'space linear async': () => validateAndSolve3DAsync(model),
    'space P-Delta': () => solvePDelta3D(buildSolverInput3D(model)!),
    'store plane sync': () => modelStore.solve(false, 'xz'),
    'store plane async': () => modelStore.solveAsync(false, 'yz'),
    'store plane advanced': () => modelStore.buildSolverInput(false, 'xz'),
    'store space sync': () => modelStore.solve3D(false, false, true),
    'store space async': () => modelStore.solve3DAsync(false, false, true),
    ...combinations(model),
  };
}

function fixture(): JSONModel {
  const model = modelStore.model;
  return {
    name: 'Structure boundary',
    nodes: [...model.nodes.values()].map(node => ({ ...node, z: node.z ?? 0 })),
    elements: [...model.elements.values()].map(({ id, type, nodeI, nodeJ, materialId, sectionId, releaseI, releaseJ }) =>
      ({ id, type, nodeI, nodeJ, materialId, sectionId, releaseI, releaseJ })),
    supports: [...model.supports.values()].map(row => ({ ...row })),
    sections: [...model.sections.values()].map(row => ({ ...row })),
    materials: [...model.materials.values()].map(row => ({ ...row })),
    loads: model.loads.map(load => ({ type: load.type, data: { ...load.data } })),
    plates: [], quads: [], constraints: [],
    loadCases: [loadCase], combinations: [combo],
  };
}

describe('malformed structural model input', () => {
  it.each([
    ['support frame', 'dofFrame', () => Object.assign(modelStore.model.supports.get(support)!, { dofFrame: 'future' })],
    ['incomplete support mask', 'dofRestraints.tz', () => Object.assign(modelStore.model.supports.get(support)!, {
      dofRestraints: { tx: true, ty: true },
    })],
    ['unknown spring direction', 'curves.future', () => Object.assign(modelStore.model.supports.get(support)!, {
      curves: { future: [[0, 0], [1, 1]] },
    })],
    ['malformed end release', 'releaseI.mz', () => Object.assign(modelStore.model.elements.get(member)!, {
      releaseI: { my: false, mz: 'true', t: false },
    })],
    ['unknown member behaviour', '.behaviour', () => Object.assign(modelStore.model.elements.get(member)!, { behaviour: 'future' })],
    ['unknown shear basis', '.shearAreas.basis', () => Object.assign(modelStore.model.sections.get(1)!, { shearAreas: { basis: 'future' } })],
    ['missing shear area', '.shearAreas.asZ', () => Object.assign(modelStore.model.sections.get(1)!, {
      shearAreas: { basis: 'declared', asY: 1 },
    })],
    ['nonpositive shear area', '.shearAreas.asY', () => Object.assign(modelStore.model.sections.get(1)!, {
      shearAreas: { basis: 'declared', asY: 0, asZ: 1 },
    })],
    ['non-finite shear area', '.shearAreas.asY', () => Object.assign(modelStore.model.sections.get(1)!, {
      shearAreas: { basis: 'declared', asY: Infinity, asZ: 1 },
    })],
    ['null depth', '.z', () => Object.assign(modelStore.model.nodes.get(root)!, { z: null })],
    ['unknown combination analysis', 'analysis.perCombination', () => {
      modelStore.model.analysis = { perCombination: 'future' } as never;
    }],
    ['unknown shear analysis', 'analysis.shearDeformation', () => {
      modelStore.model.analysis = { shearDeformation: 'future' } as never;
    }],
    ['unknown self-weight direction', 'analysis.selfWeight[0].direction', () => {
      modelStore.model.analysis = { selfWeight: [{ caseId: 1, direction: 'future', factor: -1 }] } as never;
    }],
    ['invalid constraint DOF', 'constraints[0].dofs[1]', () => {
      modelStore.model.constraints = [{ type: 'rigidLink', masterNode: root, slaveNode: tip, dofs: [0, 6] }];
    }],
  ] as const)('refuses %s before reducing the model', async (_, field, mutate) => {
    mutate();
    await refuses(field, analysisEntries());
  });

  it.each([
    ['unknown method', { method: 'future' }, 'combinations[0].method'],
    ['null method', { method: null }, 'combinations[0].method'],
    ['missing factors', { factors: undefined }, 'combinations[0].factors'],
    ['non-finite factor', { factors: [{ caseId: 1, factor: Infinity }] }, 'combinations[0].factors[0].factor'],
  ])('refuses a combination with %s before case filtering', async (_, patch, field) => {
    await refuses(field, combinations(modelStore.model, [{ ...combo, ...patch }] as never));
  });

  it.each([
    ['unknown constraint type', () => ({ type: 'future' }), 'constraints[0].type'],
    ['unknown legacy DOF', () => ({ type: 'rigidLink', masterNode: root, slaveNode: tip, dofs: ['ux', 'future'] }), 'constraints[0].dofs[1]'],
    ['missing MPC terms', () => ({ type: 'linearMpc' }), 'constraints[0].terms'],
  ] as const)('refuses %s before restoring a snapshot', async (_, constraint, field) => {
    const before = modelStore.snapshot();
    const incoming = { ...before, constraints: [constraint()] };
    await refuses(field, { restore: () => modelStore.restore(incoming as never) });
    expect(modelStore.snapshot()).toEqual(before);
  });

  it.each([
    ['fixture release', 'releaseI.mz', (input: JSONModel) => Object.assign(input.elements[0]!, { releaseI: { mz: 'true' } })],
    ['fixture material', '.nu', (input: JSONModel) => { delete input.materials[0]!.nu; }],
    ['fixture support', '.dofFrame', (input: JSONModel) => Object.assign(input.supports[0]!, { dofFrame: 'future' })],
  ] as const)('refuses a malformed %s before replay and example apply', async (_, field, mutate) => {
    const before = modelStore.snapshot();
    const input = fixture();
    mutate(input);
    await refuses(field, {
      replay: () => loadFixture(input, modelStore.fixtureApi() as never),
      apply: () => modelStore.loadExample(input.name, async () => input),
    });
    expect(modelStore.snapshot()).toEqual(before);
  });
});

it('keeps omitted legacy fields and a supported constraint alias solvable', async () => {
  const before = await validateAndSolve3DAsync(modelStore.model);
  expect(before).toMatchObject({ reactions: expect.arrayContaining([{ nodeId: root, fx: expect.any(Number),
    fy: 0, fz: 0, mx: 0, my: 0, mz: 0 }]) });
  if (!before || typeof before === 'string') throw new Error(String(before));
  const plane = validateAndSolve2D(modelStore.model);
  expect(plane).toMatchObject({ reactions: expect.any(Array), displacements: expect.any(Array) });
  if (!plane || typeof plane === 'string') throw new Error(String(plane));
  expect(plane.reactions.length).toBeGreaterThan(0);
  expect(plane.displacements.length).toBeGreaterThan(0);
  const snapshot = modelStore.snapshot();
  snapshot.nodes = snapshot.nodes.map(([id, node]) => [id, { ...node, z: undefined }]);
  modelStore.restore(snapshot);
  expect(await validateAndSolve3DAsync(modelStore.model)).toMatchObject({
    reactions: before.reactions, displacements: before.displacements,
  });
  modelStore.restore({
    ...snapshot,
    constraints: [{ type: 'equalDof', masterNode: root, slaveNode: tip, dofs: ['uy'] }],
  } as never);
  expect(modelStore.model.constraints).toEqual([{ type: 'equalDOF', masterNode: root, slaveNode: tip, dofs: [1] }]);
  expect(validateAndSolve2D(modelStore.model)).toEqual(plane);
});

describe('lossy structural dispatch', () => {
  it.each([null, false, 1])('refuses a supplied release container %s before canonicalisation can erase it', async (releaseI) => {
    const before = modelStore.snapshot();
    const badSnapshot = {
      ...before,
      elements: before.elements.map(([id, element]) => [id, { ...element, releaseI }]),
    };
    const badFixture = fixture();
    Object.assign(badFixture.elements[0]!, { releaseI });
    await refuses('releaseI', {
      restore: () => modelStore.restore(badSnapshot as never),
      replay: () => loadFixture(badFixture, modelStore.fixtureApi() as never),
      apply: () => modelStore.loadExample(badFixture.name, async () => badFixture),
    });
    expect(modelStore.snapshot()).toEqual(before);
  });

  it('refuses a coupled constraint before either plane adapter drops the equation', async () => {
    const model = modelStore.model;
    model.constraints = [{ type: 'linearMPC', terms: [
      { nodeId: tip, dof: 0, coefficient: 1 }, { nodeId: tip, dof: 1, coefficient: -1 },
    ] }];
    await refuses('constraints[0].terms', {
      builder: () => buildSolverInput2D(model),
      sync: () => validateAndSolve2D(model),
      async: () => validateAndSolve2DAsync(model),
      combination: () => solveCombinations2D(model, [loadCase], [combo]),
      'store XY': () => modelStore.solve(false, 'xy'),
      'store XZ': () => modelStore.solveAsync(false, 'xz'),
      'store advanced': () => modelStore.buildSolverInput(false, 'xz'),
    });
    expect(buildSolverInput3D(model)?.constraints).toEqual(model.constraints);
  });
});


it.each([
  ['analysis.selfWieght', () => ({ analysis: { selfWieght: [{ caseId: loadCase.id, direction: 'Z', factor: -1 }] } })],
  ['constraints[0].dof', () => ({ constraints: [{ type: 'rigidLink', masterNode: root, slaveNode: tip, dof: [0] }] })],
  ['analysis.selfWeight[0].element', () => ({ analysis: { selfWeight: [{ caseId: loadCase.id, direction: 'Z', factor: -1, element: member }] } })],
  ['constraints[0].terms[0].coefficent', () => ({ constraints: [{
    type: 'linearMPC', terms: [{ nodeId: tip, dof: 0, coefficent: 1 }],
  }] })],
] as const)('refuses %s through solve, restore and fixture apply', async (field, patch) => {
  const before = modelStore.snapshot();
  const input = { ...fixture(), ...patch() } as JSONModel;
  const incoming = { ...before, ...patch() } as typeof before;
  await refuses(field, {
    restore: () => modelStore.restore(incoming),
    replay: () => loadFixture(input, modelStore.fixtureApi() as never),
    apply: () => modelStore.loadExample(input.name, async () => input),
  });
  expect.soft(modelStore.snapshot()).toEqual(before);
  expect.soft(modelFeatures(incoming).has('malformedAuthoredStructure')).toBe(true);
  modelStore.restore(before);
  Object.assign(modelStore.model, patch());
  await refuses(field, analysisEntries());
});

it('preserves explicit self-weight and a one-DOF rigid link', async () => {
  const model = modelStore.model;
  model.constraints = [{ type: 'rigidLink', masterNode: root, slaveNode: tip, dofs: [4] }];
  model.analysis = { selfWeight: [{ caseId: loadCase.id, direction: 'Z', factor: -1, elements: [member] }] };
  const before = modelStore.snapshot();
  modelStore.restore(before);
  expect(modelFeatures(modelStore.snapshot()).has('malformedAuthoredStructure')).toBe(false);
  expect(buildSolverInput2D(model)?.constraints).toEqual([{ ...model.constraints[0], dofs: [2] }]);
  expect(buildSolverInput3D(model)?.constraints).toEqual(model.constraints);
  expect(await validateAndSolve2DAsync(model)).toMatchObject({ reactions: expect.any(Array) });
  expect(await validateAndSolve3DAsync(model)).toMatchObject({ reactions: expect.any(Array) });
});

it('solves a separated eccentric connection in plane', async () => {
  const model = modelStore.model;
  model.loads[0] = { type: 'nodal', data: { id: 1, nodeId: tip, fx: 0, fz: -1, my: 0, caseId: 1 } };
  model.constraints = [{ type: 'equalDOF', masterNode: root, slaveNode: tip, dofs: [4] }];
  const control = validateAndSolve2D(model);
  const advancedControl = solvePDelta(buildSolverInput2D(model)!);
  const combinationControl = solveCombinations2D(model, [loadCase], [combo]);
  expect(control).toMatchObject({ reactions: expect.any(Array), displacements: expect.any(Array) });
  expect(advancedControl.converged).toBe(true);
  expect(combinationControl).toMatchObject({ perCombo: expect.any(Map) });
  const expectedCombination = combinationControl && typeof combinationControl !== 'string'
    ? combinationControl.perCombo.get(combo.id) : undefined;
  if (!control || typeof control === 'string') throw new Error(String(control));
  expect(expectedCombination).toMatchObject({ reactions: control.reactions, displacements: control.displacements });
  const constraint = {
    type: 'eccentricConnection', masterNode: root, slaveNode: tip,
    offsetY: 1, releases: [true, false, true, false, false, false],
  } as const;
  model.constraints = [{ ...constraint, releases: [...constraint.releases] }];
  expect.soft(await validateAndSolve2DAsync(model)).toEqual(control);
  expect.soft(validateAndSolve2D(model)).toEqual(control);
  expect.soft(modelStore.solve(false, 'xy')).toEqual(control);
  const combination = solveCombinations2D(model, [loadCase], [combo]);
  expect.soft(combination && typeof combination !== 'string' ? combination.perCombo.get(combo.id) : undefined)
    .toMatchObject({ reactions: control.reactions, displacements: control.displacements });
  expect.soft(combination).toEqual(combinationControl);
  expect.soft(solvePDelta(modelStore.buildSolverInput(false, 'xy')!)).toEqual(advancedControl);
  expect.soft(buildSolverInput3D(model)?.constraints).toEqual(model.constraints);
  expect(assessProject(modelStore.snapshot(), null, 'basic').changes.map(change => change.id))
    .toContain('separated-planar-eccentric-connection');
});

it('rotates a short authored release mask before checking a YZ solve', async () => {
  const model = modelStore.model;
  const node = model.nodes.get(tip)!;
  node.y = node.x;
  node.x = 0;
  model.loads = [{ type: 'nodal3d', data: { id: 1, nodeId: tip, fx: 0, fy: 0, fz: -1, mx: 0, my: 0, mz: 0 } }];
  model.constraints = [{ type: 'equalDOF', masterNode: root, slaveNode: tip, dofs: [3] }];
  const control = modelStore.solve(false, 'yz');
  expect(control).toMatchObject({ reactions: expect.any(Array), displacements: expect.any(Array) });
  const connection = { type: 'eccentricConnection', masterNode: root, slaveNode: tip, offsetX: 1 } as const;
  model.constraints = [{ ...connection, releases: [false, true, true] }];
  expect(await modelStore.solveAsync(false, 'yz')).toEqual(control);
  model.constraints = [{ ...connection, releases: [true, false, true] }];
  await refuses('constraints[0].offsetX', { 'still coupled': () => modelStore.solveAsync(false, 'yz') });
});

it.each([0, 2] as const)('still refuses a live eccentric equation on DOF %s', async (dof) => {
  const model = modelStore.model;
  const releases = [true, false, true, false, false, false];
  releases[dof] = false;
  model.constraints = [{ type: 'eccentricConnection', masterNode: root, slaveNode: tip, offsetY: 1, releases }];
  await refuses('constraints[0].offsetY', {
    builder: () => buildSolverInput2D(model),
    sync: () => validateAndSolve2D(model),
    async: () => validateAndSolve2DAsync(model),
    combination: () => solveCombinations2D(model, [loadCase], [combo]),
    'store plane': () => modelStore.solveAsync(false, 'xz'),
  });
  expect(buildSolverInput3D(model)?.constraints).toEqual(model.constraints);
});

it('refuses a misspelled member hinge before applying release defaults', async () => {
  const before = modelStore.snapshot();
  const input = fixture();
  Object.assign(input.elements[0]!, { hingeStrat: true });
  const incoming = {
    ...before,
    elements: before.elements.map(([id, element]) => [id, { ...element, hingeStrat: true }]),
  };
  const file = { ...JSON.parse(serializeProject()), snapshot: incoming };
  const field = 'elements.' + member + '.hingeStrat';
  await refuses(field, {
    restore: () => modelStore.restore(incoming as never),
    'file import': () => deserializeProjectOrThrow(JSON.stringify(file)),
    'fixture fragment': () => fragmentFromJSONModel(input),
    replay: () => loadFixture(input, modelStore.fixtureApi() as never),
    apply: () => modelStore.loadExample(input.name, async () => input),
  });
  const refusals: string[] = [];
  expect.soft(acceptAutosavePayload(file, message => refusals.push(message))).toBeNull();
  expect.soft(refusals[0]).toContain(field);
  expect.soft(modelStore.snapshot()).toEqual(before);
  modelStore.restore(before);
  Object.assign(modelStore.model.elements.get(member)!, { hingeStrat: true });
  await refuses('.hingeStrat', analysisEntries());
});

it('preserves a named member and a supported legacy hinge through restore and fixture replay', () => {
  const model = modelStore.model;
  model.loads[0] = { type: 'nodal', data: { id: 1, nodeId: tip, fx: 0, fz: -1, my: 0, caseId: 1 } };
  const element = model.elements.get(member)!;
  element.name = 'Cantilever';
  element.releaseJ = { ...element.releaseJ, mz: true };
  const control = validateAndSolve2D(model);
  expect(control).toMatchObject({ reactions: expect.any(Array), displacements: expect.any(Array) });
  const before = modelStore.snapshot();
  const legacy = {
    ...before,
    elements: before.elements.map(([id, { releaseJ: _release, ...row }]) => [id, { ...row, hingeEnd: true }]),
  };
  modelStore.restore(legacy as unknown as typeof before);
  expect(model.elements.get(member)?.name).toBe('Cantilever');
  expect(validateAndSolve2D(model)).toEqual(control);
  const input = fixture();
  const row = input.elements[0]!;
  delete row.releaseJ;
  row.hingeEnd = true;
  row.name = 'Cantilever';
  modelStore.clear();
  loadFixture(input, modelStore.fixtureApi() as never);
  expect([...model.elements.values()][0]?.name).toBe('Cantilever');
  expect(validateAndSolve2D(model)).toEqual(control);
});

it('refuses a seventh eccentric release before any XZ or YZ projection', async () => {
  const before = modelStore.snapshot();
  const connection = { type: 'eccentricConnection' as const, masterNode: root, slaveNode: tip };
  const releases = [true, false, true, false, false, false, true];
  const constraints = [{ ...connection, releases }];
  const input = { ...fixture(), constraints };
  await refuses('constraints[0].releases', {
    restore: () => modelStore.restore({ ...before, constraints }),
    replay: () => loadFixture(input, modelStore.fixtureApi() as never),
    apply: () => modelStore.loadExample(input.name, async () => input),
  });
  expect.soft(modelStore.snapshot()).toEqual(before);
  modelStore.restore(before);
  const model = modelStore.model;
  model.constraints = constraints;
  await refuses('constraints[0].releases', {
    ...analysisEntries(),
    'switch to a plane': () => {
      const outcome = projectOnto('xz');
      return outcome.ok ? outcome : outcome.error;
    },
  });
  model.constraints = [{ ...connection, releases: releases.slice(0, 6) }];
  const plane = buildSolverInput2D(model);
  expect(plane?.constraints?.[0]).toMatchObject({ releases: [true, true, false] });
  const control = validateAndSolve2D(model);
  expect(control).toMatchObject({ reactions: expect.any(Array), displacements: expect.any(Array) });
  model.constraints = [{ ...connection, releases: releases.slice(0, 3) }];
  expect(validateAndSolve2D(model)).toEqual(control);
});

it.each([
  ['nodes', null, 'nodes'],
  ['nodes', [null], 'nodes[0]'],
  ['elements', [null], 'elements[0]'],
  ['supports', [null], 'supports[0]'],
  ['materials', [null], 'materials[0]'],
  ['sections', [null], 'sections[0]'],
  ['nodes', [{ x: 0, y: 0, z: 0 }], 'nodes[0].id'],
] as const)('refuses malformed fixture %s (%j) before any replay mutation', async (collection, value, field) => {
  const before = modelStore.snapshot();
  const input = { ...fixture(), [collection]: value } as JSONModel;
  await refuses(field, {
    replay: () => loadFixture(input, modelStore.fixtureApi() as never),
    apply: () => modelStore.loadExample(input.name, async () => input),
  });
  expect(modelStore.snapshot()).toEqual(before);
});

it('projects the reduced MPC equation in every plane analysis path', async () => {
  const model = modelStore.model;
  const axial = { nodeId: tip, dof: 0, coefficient: 1 };
  const normal = { nodeId: tip, dof: 1, coefficient: 1 };
  const mpc = (terms: typeof axial[]) => [{ type: 'linearMPC' as const, terms }];
  model.constraints = mpc([axial]);
  const linear = validateAndSolve2D(model);
  expect(linear).toMatchObject({ displacements: expect.arrayContaining([{ nodeId: tip, ux: 0, uz: 0, ry: 0 }]) });
  const advanced = solvePDelta(buildSolverInput2D(model)!);
  expect(advanced.converged).toBe(true);
  const combination = solveCombinations2D(model, [loadCase], [combo]);
  expect(combination).toMatchObject({ perCombo: expect.any(Map) });
  const terms = [normal, axial, { ...normal, coefficient: -1 }];
  model.constraints = mpc(terms);
  expect.soft(buildSolverInput2D(model)?.constraints).toEqual(mpc([axial]));
  expect.soft(validateAndSolve2D(model)).toEqual(linear);
  expect.soft(await validateAndSolve2DAsync(model)).toEqual(linear);
  expect.soft(modelStore.solve(false, 'xy')).toEqual(linear);
  expect.soft(await modelStore.solveAsync(false, 'xz')).toEqual(linear);
  expect.soft(solveCombinations2D(model, [loadCase], [combo])).toEqual(combination);
  const input = modelStore.buildSolverInput(false, 'xz');
  expect.soft(input && solvePDelta(input)).toEqual(advanced);
  expect.soft(assessProject(modelStore.snapshot(), null, 'basic').changes.map(change => change.id))
    .toContain('reduced-planar-mpc');
  model.constraints = mpc([axial, { ...normal, coefficient: 0 }]);
  expect.soft(validateAndSolve2D(model)).toEqual(linear);
  model.constraints = mpc([axial, { ...axial, coefficient: 2 }, { ...axial, coefficient: -2 }]);
  expect.soft(validateAndSolve2D(model)).toEqual(linear);
  const halfMax = { ...axial, coefficient: Number.MAX_VALUE / 2 };
  model.constraints = mpc([halfMax, halfMax]);
  expect.soft(buildSolverInput2D(model)?.constraints).toEqual(mpc([{ ...axial, coefficient: Number.MAX_VALUE }]));
  const max = { ...axial, coefficient: Number.MAX_VALUE };
  model.constraints = mpc([max, max, { ...axial, dof: 4, coefficient: Number.MIN_VALUE }]);
  await refuses('constraints[0].terms', {
    builder: () => buildSolverInput2D(model), sync: () => validateAndSolve2D(model),
    async: () => validateAndSolve2DAsync(model), combination: () => solveCombinations2D(model, [loadCase], [combo]),
  });
  const roundsAway = [axial, { ...normal, coefficient: 2 ** 54 }, normal, { ...normal, coefficient: -(2 ** 54) }];
  for (const mixed of [[normal, axial, { ...normal, nodeId: root, coefficient: -1 }], roundsAway]) {
    model.constraints = mpc(mixed);
    await refuses('constraints[0].terms', {
      builder: () => buildSolverInput2D(model), sync: () => validateAndSolve2D(model),
      async: () => validateAndSolve2DAsync(model), combination: () => solveCombinations2D(model, [loadCase], [combo]),
    });
  }
});

it('reduces MPC terms after rotating a YZ plane', async () => {
  const model = modelStore.model;
  Object.assign(model.nodes.get(tip)!, { x: 0, y: 2 });
  model.loads[0] = { type: 'nodal3d', data: { id: 1, nodeId: tip, fx: 0, fy: 1, fz: 0, mx: 0, my: 0, mz: 0, caseId: 1 } };
  const axial = { nodeId: tip, dof: 1, coefficient: 1 };
  const normal = { nodeId: tip, dof: 0, coefficient: 1 };
  model.constraints = [{ type: 'linearMPC', terms: [axial] }];
  const control = modelStore.solve(false, 'yz');
  expect(control).toMatchObject({ displacements: expect.any(Array), reactions: expect.any(Array) });
  model.constraints = [{ type: 'linearMPC', terms: [axial, normal, { ...normal, coefficient: -1 }] }];
  expect(await modelStore.solveAsync(false, 'yz')).toEqual(control);
  expect(projectOnto('yz')).toMatchObject({ ok: true });
  expect(modelStore.solve(false, 'xy')).toEqual(control);
});

it('refuses an unknown combination method key before combining opposing cases', async () => {
  const model = modelStore.model;
  const cases = [loadCase, { ...loadCase, id: 2, name: 'Opposing case' }];
  model.loadCases = cases;
  model.loads.push({ type: 'nodal', data: { id: 2, nodeId: tip, fx: -1, fz: 0, my: 0, caseId: 2 } });
  const factors = [{ caseId: 1, factor: 1 }, { caseId: 2, factor: 1 }];
  const correct = { ...combo, method: 'srss' as const, factors };
  const linear = solveCombinations3D(model, cases, [{ ...combo, factors }]);
  const srss = solveCombinations3D(model, cases, [correct]);
  expect(linear && typeof linear !== 'string' ? linear.perCombo.get(combo.id) : linear)
    .toMatchObject({ reactions: expect.arrayContaining([{ nodeId: root, fx: 0, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 }]) });
  expect(srss && typeof srss !== 'string' ? srss.perCombo.get(combo.id) : srss)
    .toMatchObject({ reactions: expect.arrayContaining([expect.objectContaining({ nodeId: root, fx: expect.closeTo(Math.SQRT2, 12) })]) });

  const misspelled = { ...combo, methdo: 'srss', factors };
  const before = modelStore.snapshot();
  const input = { ...fixture(), loadCases: cases, combinations: [misspelled] };
  await refuses('combinations[0].methdo', {
    restore: () => modelStore.restore({ ...before, combinations: [misspelled] }),
    'fixture replay': () => loadFixture(input, modelStore.fixtureApi() as never),
    'example apply': () => modelStore.loadExample(input.name, async () => input),
  });
  expect.soft(modelStore.snapshot()).toEqual(before);
  model.combinations = [misspelled];
  const runs = {
    'plane combinations': () => solveCombinations2D(model, cases, [misspelled]),
    'plane store combinations': () => modelStore.solveCombinations(false, 'xz'),
    'space combinations': () => solveCombinations3D(model, cases, [misspelled]),
    'space parallel combinations': () => solveCombinations3DParallel(model, cases, [misspelled]),
    'space direct analysis': () => runDirectAnalysis(model, cases, [misspelled], { includeSelfWeight: false }),
    'space store combinations': () => modelStore.solveCombinations3D(false, false, true),
    'space store parallel combinations': () => modelStore.solveCombinations3DParallel(false, false, true),
  };
  await refuses('combinations[0].methdo', runs);
  model.supports.get(support)!.uplift = true;
  await refuses('combinations[0].methdo', runs);
});

it('preserves solved displacements when reducing overflowing homogeneous MPC terms', async () => {
  const model = modelStore.model;
  const axial = { nodeId: tip, dof: 0, coefficient: 1 };
  model.constraints = [{ type: 'linearMPC', terms: [axial] }];
  const reference = validateAndSolve2D(model);
  expect(reference).toMatchObject({ displacements: expect.arrayContaining([{ nodeId: tip, ux: 0, uz: 0, ry: 0 }]) });
  const combination = solveCombinations2D(model, [loadCase], [combo]);
  expect(combination).toMatchObject({ perCombo: expect.any(Map) });
  const advanced = solvePDelta(buildSolverInput2D(model)!);
  expect(advanced.converged).toBe(true);
  const max = { ...axial, coefficient: Number.MAX_VALUE };
  model.constraints = [{ type: 'linearMPC', terms: [max, max] }];
  expect.soft(validateAndSolve2D(model)).toEqual(reference);
  expect.soft(await validateAndSolve2DAsync(model)).toEqual(reference);
  expect.soft(modelStore.solve(false, 'xz')).toEqual(reference);
  expect.soft(await modelStore.solveAsync(false, 'xz')).toEqual(reference);
  expect.soft(solveCombinations2D(model, [loadCase], [combo])).toEqual(combination);
  const input = modelStore.buildSolverInput(false, 'xz');
  expect.soft(input && solvePDelta(input)).toEqual(advanced);
  const rotation = { ...max, dof: 4, coefficient: 1 };
  model.constraints = [{ type: 'linearMPC', terms: [max, max, rotation] }];
  expect.soft(buildSolverInput2D(model)?.constraints).toEqual([{
    type: 'linearMPC', terms: [max, { ...rotation, dof: 2, coefficient: -0.5 }],
  }]);
});

it('scopes both constraint notices to the saved solve plane', () => {
  const model = modelStore.model;
  const offset = { type: 'eccentricConnection' as const, masterNode: root, slaveNode: tip, offsetX: 1, releases: [false, true, true] };
  const term = { nodeId: root, dof: 1, coefficient: 1 };
  const mpc = { type: 'linearMPC' as const, terms: [term, { ...term, coefficient: -1 }] };
  model.constraints = [offset, mpc];
  const previousPlane = uiStore.drawPlane2D;
  uiStore.analysisMode = '2d';
  uiStore.drawPlane2D = 'xz';
  try {
    const result = modelStore.solve(false, uiStore.drawPlane2D);
    if (!result || typeof result === 'string') throw new Error(String(result));
    expect(result.reactions).not.toHaveLength(0);
    resultsStore.setResults(result);
  } finally {
    uiStore.drawPlane2D = previousPlane;
  }
  const saved = modelStore.snapshot();
  const original = readStamp(saved.solvedWith);
  expect.soft(original?.drawPlane2D).toBe('xz');
  const notices = (plane = original?.drawPlane2D) => {
    const stamp = readStamp({ ...original, resultsVersion: 1, drawPlane2D: plane });
    return assessProject(saved, stamp, 'basic').changes.map(change => change.id);
  };
  for (const change of ['separated-planar-eccentric-connection', 'reduced-planar-mpc']) {
    expect.soft(notices()).not.toContain(change);
    expect.soft(notices('yz')).toContain(change);
    expect.soft(notices('xy')).not.toContain(change);
  }
});

it.each([undefined])('checks saved constraints and combinations independently of supports (%j)', (supports) => {
  const snapshot = { ...modelStore.snapshot(), supports };
  const changes = (saved: typeof snapshot) =>
    assessProject(saved as never, null, 'basic').changes.map(change => change.id);
  expect.soft(changes(snapshot)).not.toContain('malformed-structural-input');
  expect.soft(changes({ ...snapshot, constraints: [{ type: 'unknownKind' }] as never })).toContain('malformed-structural-input');
  expect.soft(changes({ ...snapshot, combinations: [{ ...combo, method: 'unsupported' }] as never })).toContain('malformed-structural-input');
  expect(() => modelStore.restore({ ...snapshot, constraints: [{ type: 'unknownKind' }] } as never))
    .toThrow(/constraints\[0\]\.type/);
});

review('refuses a misspelled restraint mask whose authored DOFs override the support type', async () => {
  const model = modelStore.model;
  const mask = { tx: false, ty: false, tz: true, rx: false, ry: false, rz: false };
  const tipSupport = modelStore.addSupportEntry({ nodeId: tip, type: 'fixed3d', dofRestraints: mask });
  const control = validateAndSolve3D(model);
  expect(control).toMatchObject({ displacements: expect.arrayContaining([{ nodeId: tip, ux: expect.any(Number),
    uy: 0, uz: 0, rx: 0, ry: 0, rz: 0 }]) });
  if (!control || typeof control === 'string') throw new Error(String(control));
  const tipDisplacement = control.displacements.find(row => row.nodeId === tip);
  expect(tipDisplacement?.ux).toBeGreaterThan(0);
  const row = model.supports.get(tipSupport)!;
  delete row.dofRestraints;
  expect(validateAndSolve3D(model)).toMatchObject({
    displacements: expect.arrayContaining([{ ...tipDisplacement, ux: 0 }]),
  });
  const before = modelStore.snapshot();
  const invalid = { ...row, dofRestaints: mask };
  const saved = { ...before, supports: before.supports.map(([id, entry]) => [id, id === tipSupport ? invalid : entry] as const) };
  const input = fixture();
  Object.assign(input.supports.find(entry => entry.id === tipSupport)!, { dofRestaints: mask });
  const field = `supports.${tipSupport}.dofRestaints`;
  await refuses(field, {
    restore: () => modelStore.restore(saved as never),
    'file import': () => deserializeProjectOrThrow(JSON.stringify({ ...JSON.parse(serializeProject()), snapshot: saved })),
    replay: () => loadFixture(input, modelStore.fixtureApi() as never),
    apply: () => modelStore.loadExample(input.name, async () => input),
  });
  expect.soft(modelStore.snapshot()).toEqual(before);
  expect.soft(modelFeatures(saved as never)).toContain('malformedAuthoredStructure');
  model.supports.set(tipSupport, invalid);
  await refuses(field, analysisEntries());
});

review.each(['xz', 'yz'] as const)('solves an unscalable singleton MPC in %s', async (plane) => {
  const model = modelStore.model;
  if (plane === 'yz') {
    Object.assign(model.nodes.get(tip)!, { x: 0, y: 2 });
    model.loads[0] = { type: 'nodal3d', data: { id: 1, nodeId: tip, fx: 0, fy: 1, fz: 0, mx: 0, my: 0, mz: 0, caseId: 1 } };
  }
  const axial = { nodeId: tip, dof: plane === 'yz' ? 1 : 0, coefficient: 1 };
  model.constraints = [{ type: 'linearMPC', terms: [axial] }];
  const linear = modelStore.solve(false, plane);
  const combination = modelStore.solveCombinations(false, plane);
  const advanced = solvePDelta(modelStore.buildSolverInput(false, plane)!);
  expect(linear).toMatchObject({ reactions: expect.any(Array),
    displacements: expect.arrayContaining([{ nodeId: tip, ux: 0, uz: 0, ry: 0 }]) });
  expect(combination).toMatchObject({ perCombo: expect.any(Map) });
  expect(advanced.converged).toBe(true);
  const max = { ...axial, coefficient: Number.MAX_VALUE };
  const min = { ...axial, coefficient: Number.MIN_VALUE };
  model.constraints = [{ type: 'linearMPC', terms: [max, max, min] }];
  const input = modelStore.buildSolverInput(false, plane);
  expect.soft(input?.constraints).toEqual([{ type: 'linearMPC', terms: [{ ...axial, dof: 0 }] }]);
  expect.soft(modelStore.solve(false, plane)).toEqual(linear);
  expect.soft(await modelStore.solveAsync(false, plane)).toEqual(linear);
  expect.soft(modelStore.solveCombinations(false, plane)).toEqual(combination);
  expect.soft(input && solvePDelta(input)).toEqual(advanced);
  if (plane === 'xz') {
    expect.soft(validateAndSolve2D(model)).toEqual(linear);
    expect.soft(await validateAndSolve2DAsync(model)).toEqual(linear);
    expect.soft(solveCombinations2D(model, [loadCase], [combo])).toEqual(combination);
  }
  expect.soft(projectOnto(plane)).toMatchObject({ ok: true });
});

review('uses the saved project plane for older stamps and checks plausible planes when it is absent', async () => {
  const model = modelStore.model;
  Object.assign(model.nodes.get(tip)!, { x: 0, y: 2 });
  model.constraints = [{
    type: 'eccentricConnection', masterNode: root, slaveNode: tip, offsetX: 1, releases: [false, true, true],
  }];
  const stamp = readStamp({ ...modelStore.snapshot().solvedWith, id: 'legacy-plane', resultsVersion: 1, drawPlane2D: undefined });
  expect(stamp).toMatchObject({ resultsVersion: 1 });
  const saved = { ...modelStore.snapshot(), solvedWith: stamp! };
  const change = 'separated-planar-eccentric-connection';
  const recheck = createRecheckStore();
  for (const [drawPlane2D, applies] of [['yz', true], [undefined, true], ['xz', false]] as const) {
    const snapshot = JSON.parse(JSON.stringify({ ...saved, drawPlane2D }));
    const notices = assessProject(snapshot, stamp, 'basic').changes.map(entry => entry.id);
    expect.soft(notices.includes(change), String(drawPlane2D)).toBe(applies);
    recheck.openProject(snapshot, 'basic');
    await recheck.retry();
    expect.soft(recheck.assessment?.changes.some(entry => entry.id === change), String(drawPlane2D)).toBe(applies);
  }
  const stampedXZ = { ...stamp!, drawPlane2D: 'xz' as const };
  expect(assessProject({ ...saved, drawPlane2D: 'yz' } as never, stampedXZ, 'basic').changes.map(entry => entry.id))
    .not.toContain(change);
});

review.each(['nodes', 'elements', 'supports', 'materials', 'sections', 'connectors'] as const)(
  'flags a malformed supplied %s collection in a partial snapshot', (collection) => {
    const notices = (raw: unknown) => assessProject(raw as never, null, 'basic').changes.map(entry => entry.id);
    for (const value of [null, {}, [null]]) {
      expect.soft(notices({ [collection]: value }), JSON.stringify(value)).toContain('malformed-structural-input');
    }
    expect.soft(notices({ [collection]: [] })).not.toContain('malformed-structural-input');
    expect.soft(notices({})).not.toContain('malformed-structural-input');
    expect.soft(notices({ ...modelStore.snapshot(), [collection]: null })).toContain('malformed-structural-input');
  },
);
