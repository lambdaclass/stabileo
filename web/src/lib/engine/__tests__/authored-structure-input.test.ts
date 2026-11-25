import { beforeEach, describe, expect, it } from 'vitest';
import { modelStore, uiStore } from '../../store';
import { loadFixture, type JSONModel } from '../../templates/load-fixture';
import { runDirectAnalysis } from '../direct-analysis';
import {
  buildSolverInput2D, buildSolverInput3D, prepareSolverInput3D,
  solveCombinations2D, solveCombinations3D, solveCombinations3DParallel,
  validateAndSolve2D, validateAndSolve2DAsync, validateAndSolve3D, validateAndSolve3DAsync,
} from '../solver-service';
import { solvePDelta, solvePDelta3D } from '../wasm-solver';

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
    ['unknown constraint type', { type: 'future' }, 'constraints[0].type'],
    ['unknown legacy DOF', { type: 'rigidLink', dofs: ['ux', 'future'] }, 'constraints[0].dofs[1]'],
    ['missing MPC terms', { type: 'linearMpc' }, 'constraints[0].terms'],
  ])('refuses %s before restoring a snapshot', async (_, patch, field) => {
    const before = modelStore.snapshot();
    const incoming = { ...before, constraints: [{ masterNode: root, slaveNode: tip, ...patch }] };
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
