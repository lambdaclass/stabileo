import { beforeEach, expect, it, vi } from 'vitest';
import { plateRemeshMessage } from '../../engine/plate-analysis-refusal';
import { accountingProjection } from '../../engine/accounting-source';
import {
  buildSolverInput2D, solveCombinations2D, validateAndSolve2D, validateAndSolve2DAsync, type ModelData,
} from '../../engine/solver-service';
import { runDirectAnalysis } from '../../engine/direct-analysis';
import { agrees, roundoff } from '../../engine/accounting-math';
import { runGlobalSolve, runLiveCalc } from '../../engine/live-calc';
import { solveBuckling, solveBuckling3D, solveModal, solveModal3D, solvePDelta, solvePDelta3D } from '../../engine/wasm-solver';
import { modelStore, resultsStore, uiStore } from '..';
import { createArc, remakeArc } from '../curved-members';
import { whatIf } from '../whatif.svelte';
import { syncDefinedLoadsForAnalysis } from '../defined-loads';
import {
  addPlateLoad, applyPlateMeshes, createPlate, meshBeforeAnalysis, planPlateMesh, plateEntry, plateStatus, setPlateMeshSpec, setPlateSideArc,
} from '../physical-plates';

const fault = vi.hoisted(() => ({ dropMemberLoad: false, scaleCaseLoad: 1, momentDelta: 0, stalePlanarMoment: 0 }));

vi.mock('../../model/loads/load-magnitudes', async importOriginal => {
  const original = await importOriginal<typeof import('../../model/loads/load-magnitudes')>();
  return {
    ...original,
    scaledLoad: (load: Parameters<typeof original.scaledLoad>[0], factor: number) => {
      const scaled = original.scaledLoad(load, factor * fault.scaleCaseLoad);
      return scaled.type === 'nodal3d' && load.data.id === 2
        ? { ...scaled, data: { ...scaled.data, mx: scaled.data.mx + fault.momentDelta } }
        : scaled;
    },
  };
});
vi.mock('../../engine/member-point-loads', async importOriginal => {
  const original = await importOriginal<typeof import('../../engine/member-point-loads')>();
  return {
    ...original,
    requirePlanarPointMoment: (load: Parameters<typeof original.requirePlanarPointMoment>[0]) =>
      fault.stalePlanarMoment || original.requirePlanarPointMoment(load),
    planePointLoad3D: (...[load, ...rest]: Parameters<typeof original.planePointLoad3D>) =>
      original.planePointLoad3D(fault.stalePlanarMoment ? { ...load, my: fault.stalePlanarMoment } : load, ...rest),
  };
});

vi.mock('../../engine/member-loads', async importOriginal => {
  const original = await importOriginal<typeof import('../../engine/member-loads')>();
  return {
    ...original,
    globalDistributedToSolver: (...args: Parameters<typeof original.globalDistributedToSolver>) =>
      fault.dropMemberLoad ? [] : original.globalDistributedToSolver(...args),
  };
});


beforeEach(() => {
  modelStore.clear();
  resultsStore.clear();
  uiStore.analysisMode = 'pro';
  uiStore.useNative3DPresentation();
  uiStore.includeSelfWeight = false;
  meshBeforeAnalysis.value = true;
  fault.dropMemberLoad = false;
  fault.scaleCaseLoad = 1;
  fault.momentDelta = 0;
  fault.stalePlanarMoment = 0;
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

it.each(['distributed', 'pointOnElement'] as const)(
  '#2470 accepts exactly axial planar %s loads',
  async type => {
    const elementId = cantilever('2d');
    const model = modelStore.model;
    const withLoad = (angle: number, magnitude: number, isGlobal: boolean): ModelData => {
      const data = { id: 1, elementId, caseId: 1, angle, isGlobal };
      return {
        ...model,
        loads: type === 'distributed'
          ? [{ type, data: { ...data, a: 0.5, b: 1.5, qI: magnitude, qJ: magnitude } }]
          : [{ type, data: { ...data, a: 1, p: magnitude } }],
      };
    };
    const cases = [{ id: 1, name: 'A', type: 'D' }, { id: 2, name: 'B', type: 'L' }];
    const combinations = [{ id: 1, name: 'A only', factors: [{ caseId: 1, factor: 1 }] }];
    for (const isGlobal of [false, true]) {
      const input = withLoad(90, -2, isGlobal);
      const zero = expect.toSatisfy((value: unknown) => value === 0);
      const expected = { reactions: [expect.objectContaining({ rx: expect.closeTo(2, 10), rz: zero, my: zero })] };
      expect.soft(await refusal(() => validateAndSolve2D(input)), 'linear').toMatchObject(expected);
      expect.soft(await refusal(() => validateAndSolve2DAsync(input)), 'async').toMatchObject(expected);
      expect.soft(await refusal(() => solvePDelta(buildSolverInput2D(input)!).results), 'P-Delta').toMatchObject(expected);
      for (const name of ['A', 'B']) {
        const combined = solveCombinations2D(input, [cases[0]!, { ...cases[1]!, name }], combinations);
        const result = combined && typeof combined === 'object' ? combined.perCase.get(1) : combined;
        expect.soft(result, name === 'B' ? 'batch' : 'fallback').toMatchObject(expected);
      }
      expect.soft(await refusal(() => buildSolverInput2D(withLoad(90, -(2 ** 24), isGlobal))), 'large axial load')
        .toMatchObject({
          loads: [expect.objectContaining(type === 'distributed'
            ? { type: 'axialDistributed' }
            : { type, data: expect.objectContaining({ p: 0, px: -(2 ** 24) }) })],
        });
      const nearAxial = withLoad(90 - 2 ** -46, -2, isGlobal);
      const root = model.elements.get(elementId)!.nodeI;
      nearAxial.loads.push({ type: 'nodal', data: { id: 2, nodeId: root, fx: 0, fz: 1, my: 0, caseId: 1 } });
      expect.soft(() => buildSolverInput2D(nearAxial), 'real transverse component').toThrow(/Load case.*Mz/);
    }
  },
);

for (const mode of ['2d', '3d'] as const) {
  it(`#2459 refuses a restored couple edited to zero in ${mode}`, async () => {
    const member = cantilever(mode);
    const snapshot = modelStore.snapshot();
    modelStore.restore({
      ...snapshot,
      nextId: { ...snapshot.nextId, load: 2 },
      loads: [{ type: 'pointOnElement', data: { id: 1, elementId: member, a: 1, p: 0, mz: 5 } }],
    });
    expect(modelStore.updateLoad(1, { my: 0 })).toBe(true);
    expect(modelStore.loads[0]?.data).toMatchObject({ my: 0 });
    expect(modelStore.loads[0]?.data).not.toHaveProperty('mz');
    const cleared = modelStore.snapshot();
    modelStore.restore({
      ...cleared,
      loads: [{ type: 'pointOnElement', data: {
        id: 1, elementId: member, a: 1, p: 0, my: 5, mz: 5, enteredZeroMoment: true,
      } }],
    });
    const result = mode === '2d' ? modelStore.solve() : modelStore.solve3D();
    if (!result || typeof result === 'string') throw new Error(String(result));
    const reaction = result.reactions[0]!;
    expect(Math.abs(reaction.my)).toBe(0);
    if ('mz' in reaction) expect(Math.abs(reaction.mz)).toBe(0);
    expect(modelStore.loads[0]?.data).toMatchObject({ my: 0 });
    expect(modelStore.loads[0]?.data).not.toHaveProperty('mz');
    expect(modelStore.loads[0]?.data).not.toHaveProperty('enteredZeroMoment');
    fault.stalePlanarMoment = 5;

    const model = modelStore.model;
    const densities = new Map([...model.materials].map(([id, material]) => [id, material.rho]));
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
      expect.soft(await refusal(solve), path).toEqual(expect.stringMatching(/case.*1.*M[xyz].*0.*5/i));
    }
  });
}

function floor(curved = false, side = 2, holes: number[][] = [], plateSide = -2) {
  const a = modelStore.addNode(0, 0, 0);
  const b = modelStore.addNode(4, 0, 0);
  const c = modelStore.addNode(4, 5, 0);
  const d = modelStore.addNode(0, 5, 0);
  for (const node of [a, b, c, d]) modelStore.addSupport(node, 'fixed3d');
  const mid = curved ? modelStore.addNode(2, plateSide, 0) : undefined;
  const members = curved ? createArc(a, { x: 2, y: side, z: 0 }, b, 4) : [];
  const plate = createPlate({
    name: 'Test floor', outline: mid === undefined ? [a, b, c, d] : [a, mid, b, c, d],
    holes, arcMids: mid === undefined ? undefined : [1], materialId: 1, thickness: 0.2, followArcs: false,
    mesh: { size: curved ? 1 : 2, element: curved ? 'tri' : 'quad', followMembers: false },
  });
  if (!('id' in plate)) throw new Error(plate.problem);
  addPlateLoad(plate.id, 1, 1);
  return { id: plate.id, members };
}

function complementaryMeshMarkedCurrent() {
  const { id } = floor(true, 2, [], 2);
  expect(applyPlateMeshes([planPlateMesh(id)!]).plates).toBe(1);
  expect(setPlateSideArc(id, 0, modelStore.addNode(2, -2, 0))).toBeNull();
  const { group, surface } = plateEntry(id)!;
  const { signature } = planPlateMesh(id)!;
  modelStore.setGroupData(id, {
    ...group.data, surface: { ...surface, meshed: { ...surface.meshed!, signature } },
  });
  expect(plateStatus(id)).toBe('current');
}

it('#2460 automatic solve refuses the complementary plate sweep', async () => {
  complementaryMeshMarkedCurrent();
  expect(await runGlobalSolve({ directBase: true })).toMatchObject({
    ok: false, error: expect.stringMatching(/Test floor.*sweep/i),
  });
  expect(resultsStore.results3D).toBeNull();
});

it('#2460 direct solve refuses the complementary plate sweep', () => {
  complementaryMeshMarkedCurrent();
  syncDefinedLoadsForAnalysis();
  expect(modelStore.solve3D(false, false, true)).toEqual(expect.stringMatching(/Test floor.*sweep/i));
});

it('#2461 automatic remesh refuses to discard a shell offset', async () => {
  const { id } = floor();
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


it('refuses a distributed member load lost in assembly', () => {
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

it('#2460 solves the declared sweep with an opening', () => {
  const hole = [[1, 1], [2, 1], [2, 2], [1, 2]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
  const { id } = floor(true, -2, [hole]);
  expect(applyPlateMeshes([planPlateMesh(id)!]).plates).toBe(1);
  syncDefinedLoadsForAnalysis();
  const result = modelStore.solve3D(false, false, true);
  if (!result || typeof result === 'string') throw new Error(String(result));
  const pressureArea = (4 * 5) - 1 + (4 * 2 * Math.sin(Math.PI / 4));
  expect(result.reactions.reduce((sum, r) => sum + r.fz, 0)).toBeCloseTo(pressureArea, 8);
});

it('refuses missing materialized pressure on a valid plate', () => {
  const { id } = floor();
  expect(applyPlateMeshes([planPlateMesh(id)!]).plates).toBe(1);
  syncDefinedLoadsForAnalysis();
  expect(modelStore.loads.some(load => load.type === 'surface3d')).toBe(true);
  modelStore.replaceLoads([]);
  expect(modelStore.solve3D(false, false, true)).toEqual(expect.stringMatching(/case.*1.*Test floor.*Fz.*-20.*0/i));
});

it('#2461 blocks manual replacement and leaves an edited mesh solvable', () => {
  const { id } = floor();
  expect(applyPlateMeshes([planPlateMesh(id)!]).plates).toBe(1);
  const shell = plateEntry(id)!.group.members.quads![0]!;
  const plan = planPlateMesh(id, { size: 1 })!;
  modelStore.setShellOffset('quad', shell, { frame: 'local', x: 0, y: 0, z: 0.1 });
  const { refused } = applyPlateMeshes([plan]);
  expect(refused).toEqual([{ id, reason: 'shellEdits' }]);
  expect(plateRemeshMessage(plateEntry(id)!.name, refused[0]!.reason)).toMatch(/Test floor.*offset/i);
  syncDefinedLoadsForAnalysis();
  expect(modelStore.solve3D(false, false, true)).toMatchObject({ reactions: expect.any(Array) });
  modelStore.setShellOffset('quad', shell, undefined);
  expect(applyPlateMeshes([plan]).plates).toBe(1);
  syncDefinedLoadsForAnalysis();
  expect(modelStore.solve3D(false, false, true)).toMatchObject({ reactions: expect.any(Array) });
});

it('#2461 refuses arc replacement that would remove a shell edit', () => {
  const { id, members } = floor(true, -2);
  expect(applyPlateMeshes([planPlateMesh(id)!]).plates).toBe(1);
  const shell = plateEntry(id)!.group.members.plates![0]!;
  modelStore.setShellOffset('plate', shell, { frame: 'local', x: 0, y: 0, z: 0.1 });
  const arcId = modelStore.elements.get(members[0]!)!.arc!.id;
  const snapshot = modelStore.snapshot();
  expect(remakeArc(arcId, { segments: 8 })).toMatchObject({ refused: ['Test floor'] });
  expect(modelStore.snapshot()).toEqual(snapshot);
});

it('blocks a lost case load before dispatched combinations or live results', async () => {
  const member = cantilever('3d');
  uiStore.analysisMode = 'pro';
  modelStore.model.loads.push({ type: 'distributed3d', data: {
    id: 1, elementId: member, qYI: 0, qYJ: 0, qZI: -2, qZJ: -4, frame: 'global', caseId: 1,
  } }, { type: 'distributed3d', data: {
    id: 2, elementId: member, qYI: 0, qYJ: 0, qZI: 2, qZJ: 4, frame: 'global', caseId: 2,
  } });
  fault.dropMemberLoad = true;
  const diagnostic = expect.stringMatching(/case.*1.*Fz.*-6.*0/i);
  expect(modelStore.solveCombinations3D(false, false, true)).toEqual(diagnostic);
  expect(await modelStore.solveCombinations3DParallel(false, false, true)).toEqual(diagnostic);
  modelStore.setAnalysis({ perCombination: 'pdelta' });
  expect(modelStore.solveCombinations3D(false, false, true)).toEqual(diagnostic);
  await runLiveCalc('pro', uiStore.axisConvention3D);
  expect(resultsStore.results3D).toBeNull();
});

it('accepts the roundoff boundary and refuses just beyond it', () => {
  expect(agrees(0, roundoff, 1)).toBe(true);
  expect(agrees(0, roundoff + Number.EPSILON, 1)).toBe(false);
  expect(agrees(0, Number.MIN_VALUE, 0)).toBe(false);
});

it('refuses force lost before the XZ solver builder and solves an in-plane control', () => {
  const member = cantilever('3d');
  const node = modelStore.elements.get(member)!.nodeJ;
  const load = modelStore.addNodalLoad3D(node, 0, 0, -2, 0, 0, 0, 1);
  const result = modelStore.solve(false, 'xz');
  if (!result || typeof result === 'string') throw new Error(String(result));
  expect(result.reactions[0]?.rz).toBeCloseTo(2, 12);
  expect(modelStore.updateLoad(load, { fy: 3 })).toBe(true);
  expect(modelStore.solve(false, 'xz')).toEqual(expect.stringMatching(/case.*1.*Fy.*3.*0/i));
});

it.each([false, true])('accounts for a what-if plate pressure change with nonlinear supports %s', async nonlinear => {
  const { id } = floor();
  expect(applyPlateMeshes([planPlateMesh(id)!]).plates).toBe(1);
  syncDefinedLoadsForAnalysis();
  if (nonlinear) modelStore.updateSupport(modelStore.model.supports.keys().next().value!, { uplift: true });
  const index = modelStore.loads.findIndex(load => load.type === 'surface3d');
  expect(index).toBeGreaterThanOrEqual(0);
  const area = (() => {
    const load = modelStore.loads[index]!;
    if (load.type !== 'surface3d') throw new Error(load.type);
    const map = load.data.on === 'plate' ? modelStore.plates : modelStore.quads;
    const corners = map.get(load.data.quadId)!.nodes.map(id => modelStore.nodes.get(id)!);
    return Math.abs(corners.reduce((sum, a, i) => {
      const b = corners[(i + 1) % corners.length]!;
      return sum + a.x * b.y - a.y * b.x;
    }, 0)) / 2;
  })();
  vi.useFakeTimers();
  try {
    whatIf.open();
    whatIf.setLoadFactor(index, 0.5);
    await vi.advanceTimersByTimeAsync(60);
    const result = await modelStore.solve3DAsync(false, false, true);
    if (!result || typeof result === 'string') throw new Error(String(result));
    expect(result.reactions.reduce((sum, r) => sum + r.fz, 0)).toBeCloseTo(20 - area / 2, 8);
  } finally {
    whatIf.abandon();
    vi.useRealTimers();
  }
});

async function outcome(solve: () => unknown) {
  const result = await refusal(solve);
  return result && typeof result === 'object' ? 'returned a result' : result;
}

for (const plane of ['xz', 'yz'] as const) {
  it.each([false, true])('#2470 detects a row lost in planar projection to ' + plane + ' (partial batch: %s)', async partial => {
    cantilever('2d');
    const model = modelStore.model;
    const tip = [...model.nodes.keys()].at(-1)!;
    const cases = [{ id: 1, name: 'A', type: 'D' }, { id: 2, name: 'B', type: 'L' }];
    const kept = { type: 'nodal' as const, data: { id: 2, nodeId: tip, fx: 0, fz: -2, my: 0, caseId: partial ? 1 : 2 } };
    const source: ModelData = {
      ...model,
      nodes: new Map([...model.nodes].map(([id, node]) => [id, plane === 'xz' ? node : { ...node, x: 0, y: node.x }])),
      loads: [
        { type: 'nodal3d', data: { id: 1, nodeId: tip, fx: 0, fy: 0, fz: -3, mx: 0, my: 0, mz: 0, caseId: 1 } },
        { type: 'nodal3d', data: { ...kept.data, fy: 0, mx: 0, mz: 0 } },
      ],
      loadCases: cases,
    };
    const projected: ModelData = { ...model, loads: [kept], loadCases: cases, [accountingProjection]: { plane, source } };
    const combos = [{ id: 1, name: 'A only', factors: [{ caseId: 1, factor: 1 }] }];
    const paths = {
      linear: () => validateAndSolve2D(projected),
      async: () => validateAndSolve2DAsync(projected),
      pdelta: () => solvePDelta(buildSolverInput2D(projected)!),
      batch: () => solveCombinations2D(projected, cases, combos),
      fallback: () => solveCombinations2D(projected, cases.map(c => ({ ...c, name: 'A' })), combos),
    };
    const amounts = partial ? '-5.*-2' : '-3.*0';
    for (const [path, solve] of Object.entries(paths)) {
      expect.soft(await outcome(solve), path).toEqual(expect.stringMatching(new RegExp('case.*1.*Fz.*' + amounts, 'i')));
    }
    if (!partial) {
      const onlyKept = [{ id: 3, name: 'B only', factors: [{ caseId: 2, factor: 1 }] }];
      expect(solveCombinations2D(projected, [cases[1]!], onlyKept)).toMatchObject({ perCase: expect.any(Map) });
    }
    const complete: ModelData = { ...projected, loads: [{ ...kept, data: { ...kept.data, id: 1, fz: -3, caseId: 1 } }, kept] };
    expect(validateAndSolve2D(complete)).toMatchObject({ reactions: expect.any(Array) });
  });
}

it.each([
  { kind: 'nodal', multiplier: 0, applied: 0 },
  { kind: 'member', multiplier: 2, applied: -12 },
])('#2470 refuses a $kind load changed by case expansion', async ({ kind, multiplier, applied }) => {
  const member = cantilever('3d');
  const model = modelStore.model;
  const source = modelStore.addLoadCase('Source', 'L');
  const tip = [...model.nodes.keys()].at(-1)!;
  modelStore.updateLoadCaseFields(source, { reference: true });
  modelStore.updateLoadCaseFields(1, { includes: [{ caseId: source, factor: 1.5 }] });
  model.loads.push(kind === 'nodal'
    ? { type: 'nodal3d', data: { id: 1, nodeId: tip, fx: 0, fy: 0, fz: -4, mx: 0, my: 0, mz: 0, caseId: source } }
    : { type: 'distributed3d', data: { id: 1, elementId: member, qYI: 0, qYJ: 0, qZI: -2, qZJ: -2, frame: 'global', caseId: source } });

  expect(modelStore.solve3D(false, false, true)).toMatchObject({ reactions: [expect.objectContaining({ fz: 6 })] });
  expect(modelStore.solveCombinations3D(false, false, true)).toMatchObject({ perCase: expect.any(Map) });
  fault.scaleCaseLoad = multiplier;
  const paths = {
    linear: () => modelStore.solve3D(false, false, true),
    async: () => modelStore.solve3DAsync(false, false, true),
    combinations: () => modelStore.solveCombinations3D(false, false, true),
    parallel: () => modelStore.solveCombinations3DParallel(false, false, true),
    direct: () => runDirectAnalysis(model, model.loadCases, model.combinations, { includeSelfWeight: false }),
  };
  const diagnostic = expect.stringMatching(new RegExp('case.*1.*Fz.*-6.*' + applied, 'i'));
  for (const [path, solve] of Object.entries(paths)) {
    expect.soft(await outcome(solve), path).toEqual(diagnostic);
  }
  expect.soft(modelStore.singleSolveInput3D(false, false, true), 'input').toBeNull();
  modelStore.setAnalysis({ perCombination: 'pdelta' });
  expect.soft(await outcome(() => modelStore.solveCombinations3D(false, false, true)), 'pdelta').toEqual(diagnostic);
  expect.soft(await outcome(() => modelStore.solveCombinations3DParallel(false, false, true)), 'pdelta parallel').toEqual(diagnostic);
  modelStore.updateSupport(model.supports.keys().next().value!, { uplift: true });
  expect.soft(await outcome(() => modelStore.solve3DAsync(false, false, true)), 'nonlinear single').toEqual(diagnostic);
  expect.soft(await outcome(() => modelStore.solveCombinations3DParallel(false, false, true)), 'nonlinear combinations').toEqual(diagnostic);
});

it.each([false, true])('accounts for the active structure (reference case: %s) (#2470)', async reference => {
  const active = cantilever('3d');
  const model = modelStore.model;
  const combination = model.combinations.at(-1)!;
  const { nodeI: root, nodeJ: tip } = model.elements.get(active)!;
  const end = modelStore.addNode(0, 2, 0);
  const inactive = modelStore.addElement(root, end);
  const loadCase = reference ? modelStore.addLoadCase('Reference', 'L') : 1;
  if (reference) {
    modelStore.updateLoadCaseFields(loadCase, { reference: true });
    modelStore.updateLoadCaseFields(1, { includes: [{ caseId: loadCase, factor: 1.5 }] });
  }
  model.loads.push(
    { type: 'nodal3d', data: { id: 1, nodeId: tip, fx: 0, fy: 0, fz: -2, mx: 0, my: 0, mz: 0, caseId: loadCase } },
    { type: 'nodal3d', data: { id: 2, nodeId: end, fx: 0, fy: 0, fz: -4, mx: 0, my: 0, mz: 0, caseId: loadCase } },
    { type: 'distributed3d', data: { id: 3, elementId: inactive, qYI: 0, qYJ: 0, qZI: -3, qZJ: -3, frame: 'global', caseId: loadCase } },
  );

  const factor = reference ? 1.5 : 1;
  expect(modelStore.solve3D(false, false, true)).toMatchObject({ reactions: [expect.objectContaining({ fz: expect.closeTo(12 * factor, 12) })] });
  modelStore.updateElement(inactive, { behaviour: 'inactive' });
  for (const nonlinear of [false, true]) {
    if (nonlinear) modelStore.updateSupport(model.supports.keys().next().value!, { uplift: true });
    const expected = { reactions: [expect.objectContaining({ fz: expect.closeTo(2 * factor, 12) })] };
    expect.soft(modelStore.solve3D(false, false, true), 'single').toMatchObject(expected);
    expect.soft(await modelStore.solve3DAsync(false, false, true), 'async single').toMatchObject(expected);
    const bundles = [
      modelStore.solveCombinations3D(false, false, true),
      await modelStore.solveCombinations3DParallel(false, false, true),
    ];
    for (const bundle of bundles) {
      expect.soft(bundle).toMatchObject({ perCombo: expect.any(Map) });
      if (bundle && typeof bundle !== 'string') expect.soft(bundle.perCombo.get(combination.id)).toMatchObject(expected);
    }
  }
});

it.each(['xz', 'yz'] as const)('refuses a small spatial couple lost in %s projection (#2470)', async plane => {
  cantilever('3d');
  const model = modelStore.model;
  for (const [id, node] of model.nodes) {
    model.nodes.set(id, plane === 'xz'
      ? { ...node, x: 2 ** 20 + node.x, y: 2 }
      : { ...node, x: 2, y: 2 ** 20 + node.x });
  }
  const tip = [...model.nodes.keys()].at(-1)!;
  const load = modelStore.addNodalLoad3D(tip, 0, 0, -(2 ** 20), 0, 0, 0, 1);
  expect(modelStore.solve(false, plane)).toMatchObject({ reactions: [expect.objectContaining({ rz: expect.closeTo(2 ** 20, 7) })] });
  const moment = plane === 'xz' ? 'mx' : 'my';
  expect(modelStore.updateLoad(load, { [moment]: 2 ** -8 })).toBe(true);
  const paths = {
    linear: () => modelStore.solve(false, plane),
    async: () => modelStore.solveAsync(false, plane),
    combinations: () => modelStore.solveCombinations(false, plane),
    pdelta: () => solvePDelta(modelStore.buildSolverInput(false, plane)!),
  };
  const diagnostic = expect.stringMatching(new RegExp('case.*1.*' + moment, 'i'));
  for (const [path, solve] of Object.entries(paths)) expect.soft(await outcome(solve), path).toEqual(diagnostic);
});

it('checks a stale spatial moment at its own roundoff boundary (#2470)', async () => {
  cantilever('3d');
  const model = modelStore.model;
  for (const [id, node] of model.nodes) model.nodes.set(id, { ...node, x: 2 ** 20 + node.x });
  const tip = [...model.nodes.keys()].at(-1)!;
  const source = modelStore.addLoadCase('Reference', 'L');
  modelStore.updateLoadCaseFields(source, { reference: true });
  modelStore.updateLoadCaseFields(1, { includes: [{ caseId: source, factor: 2 }] });
  model.loads.push(
    { type: 'nodal3d', data: { id: 1, nodeId: tip, fx: 0, fy: 0, fz: -(2 ** 20), mx: 0, my: 0, mz: 0, caseId: 1 } },
    { type: 'nodal3d', data: { id: 2, nodeId: tip, fx: 0, fy: 0, fz: 0, mx: 0.5, my: 0, mz: 0, caseId: source } },
    { type: 'nodal3d', data: { id: 3, nodeId: tip, fx: 0, fy: 0, fz: 0, mx: -0.5, my: 0, mz: 0, caseId: source } },
  );
  const solve = () => modelStore.solve3D(false, false, true);
  expect(solve()).toMatchObject({ reactions: [expect.objectContaining({ fz: expect.closeTo(2 ** 20, 7), mx: 0 })] });
  fault.momentDelta = 2 * roundoff;
  expect(solve()).toMatchObject({ reactions: expect.any(Array) });
  fault.momentDelta += Number.EPSILON;
  const paths = {
    linear: solve,
    async: () => modelStore.solve3DAsync(false, false, true),
    combinations: () => modelStore.solveCombinations3D(false, false, true),
    parallel: () => modelStore.solveCombinations3DParallel(false, false, true),
    direct: () => runDirectAnalysis(model, model.loadCases, model.combinations, { includeSelfWeight: false }),
  };
  const diagnostic = expect.stringMatching(/case.*1.*Mx/i);
  for (const [path, run] of Object.entries(paths)) expect.soft(await outcome(run), path).toEqual(diagnostic);
  expect.soft(modelStore.singleSolveInput3D(false, false, true), 'input').toBeNull();
  modelStore.setAnalysis({ perCombination: 'pdelta' });
  expect.soft(await outcome(paths.combinations), 'pdelta').toEqual(diagnostic);
  expect.soft(await outcome(paths.parallel), 'pdelta parallel').toEqual(diagnostic);
  modelStore.updateSupport(model.supports.keys().next().value!, { uplift: true });
  expect.soft(await outcome(paths.async), 'nonlinear single').toEqual(diagnostic);
  expect.soft(await outcome(paths.parallel), 'nonlinear combinations').toEqual(diagnostic);
});

it('#2470 solves an inclined member with zero entered Mz under a vertical line load', async () => {
  const member = cantilever('3d');
  const model = modelStore.model;
  const combination = model.combinations.at(-1)!;
  const { nodeI: root, nodeJ: tip } = model.elements.get(member)!;
  model.nodes.set(root, { ...model.nodes.get(root)!, y: 2 });
  model.nodes.set(tip, { ...model.nodes.get(tip)!, y: 2, z: 3 });
  const q = -7 / 4;
  model.loads.push({
    type: 'distributed3d',
    data: { id: 1, elementId: member, qYI: 0, qYJ: 0, qZI: q, qZJ: q, frame: 'global', caseId: 1 },
  });

  const vertical = -q * Math.hypot(2, 3);
  const equilibrium = {
    fx: expect.closeTo(0, 12), fy: expect.closeTo(0, 12), fz: expect.closeTo(vertical, 12),
    mx: expect.closeTo(0, 12), mz: expect.closeTo(0, 12),
  };
  const expected = { reactions: [expect.objectContaining({ ...equilibrium, my: expect.closeTo(-vertical, 12) })] };
  expect.soft(modelStore.solve3D(false, false, true), 'linear').toMatchObject(expected);
  expect.soft(await modelStore.solve3DAsync(false, false, true), 'async linear').toMatchObject(expected);
  const expectCombination = (bundle: ReturnType<typeof modelStore.solveCombinations3D>, label: string, pdelta = false) => {
    expect.soft(bundle && typeof bundle === 'object' ? bundle.perCombo.get(combination.id) : bundle, label)
      .toMatchObject(pdelta ? { reactions: [expect.objectContaining(equilibrium)] } : expected);
  };
  expectCombination(modelStore.solveCombinations3D(false, false, true), 'linear combinations');
  expectCombination(await modelStore.solveCombinations3DParallel(false, false, true), 'parallel linear combinations');
  expect.soft(modelStore.singleSolveInput3D(false, false, true), 'input').toMatchObject({ dim: '3d' });
  modelStore.setAnalysis({ perCombination: 'pdelta' });
  expectCombination(modelStore.solveCombinations3D(false, false, true), 'P-Delta combinations', true);
  expectCombination(await modelStore.solveCombinations3DParallel(false, false, true), 'parallel P-Delta combinations', true);
  const direct = await runDirectAnalysis(model, model.loadCases, [combination], {
    includeSelfWeight: false,
    settings: { notional: 0, tauB: 'iterate' },
  });
  expect.soft(typeof direct === 'object' ? direct.perCombo.get(combination.id) : direct, 'direct analysis')
    .toMatchObject({ reactions: [expect.objectContaining(equilibrium)] });
});

it('#2470 solves an inclined planar member with a vertical point load at its support', async () => {
  const elementId = cantilever('2d');
  const model = modelStore.model;
  const { nodeI: root, nodeJ: tip } = model.elements.get(elementId)!;
  model.nodes.set(root, { ...model.nodes.get(root)!, y: 2 });
  model.nodes.set(tip, { ...model.nodes.get(tip)!, y: 5 });
  const force = 5;
  model.loads.push({
    type: 'pointOnElement',
    data: { id: 1, elementId, a: 0, p: -force, angle: 0, isGlobal: true, caseId: 1 },
  });

  const expected = { reactions: [expect.objectContaining({
    rx: expect.closeTo(0, 12), rz: expect.closeTo(force, 12), my: expect.closeTo(0, 12),
  })] };
  expect.soft(await refusal(() => validateAndSolve2D(model)), 'linear').toMatchObject(expected);
  expect.soft(await refusal(() => validateAndSolve2DAsync(model)), 'async linear').toMatchObject(expected);
  expect.soft(await refusal(() => solvePDelta(buildSolverInput2D(model)!).results), 'P-Delta').toMatchObject(expected);
  const combination = model.combinations.at(-1)!;
  const cases = [{ id: 1, name: 'D', type: 'D' }, { id: 2, name: 'L', type: 'L' }];
  for (const name of ['D', 'L']) {
    const bundle = solveCombinations2D(model, [cases[0]!, { ...cases[1]!, name }], [combination]);
    expect.soft(bundle && typeof bundle === 'object' ? bundle.perCombo.get(combination.id) : bundle, name === 'L' ? 'batch' : 'fallback')
      .toMatchObject(expected);
  }
});

it.each(['xz', 'yz'] as const)(
  '#2470 a vertical force gives no allowance for a dropped orthogonal force in %s',
  async plane => {
    const member = cantilever('3d');
    const model = modelStore.model;
    const root = model.elements.get(member)!.nodeI;
    if (plane === 'yz') {
      for (const [id, node] of model.nodes) model.nodes.set(id, { ...node, x: 0, y: node.x });
    }
    const vertical = 2 ** 20;
    const load = modelStore.addNodalLoad3D(root, 0, 0, -vertical, 0, 0, 0, 1);
    expect(modelStore.solve(false, plane)).toMatchObject({ reactions: [expect.objectContaining({ rz: vertical })] });

    const component = plane === 'xz' ? 'fy' : 'fx';
    expect(modelStore.updateLoad(load, { [component]: Number.EPSILON })).toBe(true);
    const paths = {
      linear: () => modelStore.solve(false, plane),
      async: () => modelStore.solveAsync(false, plane),
      combinations: () => modelStore.solveCombinations(false, plane),
      pdelta: () => solvePDelta(modelStore.buildSolverInput(false, plane)!),
    };
    const diagnostic = expect.stringMatching(new RegExp('case.*1.*' + component, 'i'));
    for (const [name, solve] of Object.entries(paths)) expect.soft(await outcome(solve), name).toEqual(diagnostic);
  },
);
