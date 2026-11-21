import { beforeEach, expect, it, vi } from 'vitest';
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
  addPlateLoad, applyPlateMeshes, createPlate, meshBeforeAnalysis, planPlateMesh, plateEntry, setPlateMeshSpec,
} from '../physical-plates';

const fault = vi.hoisted(() => ({ dropMemberLoad: false, scaleCaseLoad: 1 }));

vi.mock('../../model/loads/load-magnitudes', async importOriginal => {
  const original = await importOriginal<typeof import('../../model/loads/load-magnitudes')>();
  return {
    ...original,
    scaledLoad: (load: Parameters<typeof original.scaledLoad>[0], factor: number) =>
      original.scaledLoad(load, factor * fault.scaleCaseLoad),
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
  it(`#2459 refuses a restored couple edited to zero in ${mode}`, async () => {
    const member = cantilever(mode);
    const snapshot = modelStore.snapshot();
    modelStore.restore({
      ...snapshot,
      nextId: { ...snapshot.nextId, load: 2 },
      loads: [{ type: 'pointOnElement', data: { id: 1, elementId: member, a: 1, p: 0, mz: 5 } }],
    });
    expect(modelStore.updateLoad(1, { my: 0 })).toBe(true);

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

function floor(curved = false, side = 2, holes: number[][] = []) {
  const a = modelStore.addNode(0, 0, 0);
  const b = modelStore.addNode(4, 0, 0);
  const c = modelStore.addNode(4, 5, 0);
  const d = modelStore.addNode(0, 5, 0);
  for (const node of [a, b, c, d]) modelStore.addSupport(node, 'fixed3d');
  const mid = curved ? modelStore.addNode(2, -2, 0) : undefined;
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

it('#2460 automatic solve refuses the complementary plate sweep', async () => {
  floor(true);
  expect(await runGlobalSolve({ directBase: true })).toMatchObject({
    ok: false, error: expect.stringMatching(/Test floor.*sweep/i),
  });
  expect(resultsStore.results3D).toBeNull();
});

it('#2460 direct solve refuses the complementary plate sweep', () => {
  const { id } = floor(true);
  expect(applyPlateMeshes([planPlateMesh(id)!]).plates).toBe(1);
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
  expect(applyPlateMeshes([plan]).refused).toEqual([{ id, reason: 'shellEdits', message: expect.stringMatching(/Test floor.*offset/i) }]);
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
  expect(remakeArc(arcId, { segments: 8 })).toBeNull();
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
