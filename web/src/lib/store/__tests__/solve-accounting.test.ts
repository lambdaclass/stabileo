import { beforeEach, expect, it, vi } from 'vitest';
import { POINT_END_TOL } from '../../engine/member-point-loads';
import { plateRemeshMessage } from '../../engine/plate-analysis-refusal';
import { accountingCaseSources, accountingProjection, scenarioSurfaceExpectations, withScenarioSurfaceIntent } from '../../engine/accounting-source';
import {
  buildSolverInput2D, buildSolverInput3D, notionalSourceLoads3D, prepareSolverInput3D, caseSolverLoads3D, comboSolverLoads3D, solveCombinations2D, validateAndSolve2D, validateAndSolve2DAsync, type ModelData,
} from '../../engine/solver-service';
import type { ShellLoadSpec } from '../../engine/shell-load-integration';
import type { SolverLoad3D } from '../../engine/types-3d';
import { withCaseEffects } from '../../engine/case-effects';
import { G } from '../../engine/dynamics/requests';
import { caseMassLoads, withMassSource } from '../../engine/dynamics/mass-source-model';
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

const fault = vi.hoisted(() => ({ dropSceneCase: 0, integrateDrift: 0, signedForceDelta: 0, dropMemberLoad: false, dropLineIntensity: 0, scaleCaseLoad: 1, momentDelta: 0, stalePlanarMoment: 0, surfaceFactorOffset: 0, cornerPressureDelta: 0, assemblyDrift: null as { shell: number; relative: number } | null, combinationDrift: null as { shell: number; relative: number } | null, dropNodalFy: false }));

vi.mock('../../engine/case-effects', async importOriginal => {
  const original = await importOriginal<typeof import('../../engine/case-effects')>();
  function drop<M extends ModelData>(expanded: M): M {
    return fault.dropSceneCase ? {
      ...expanded,
      loads: expanded.loads.filter(load => load.type !== 'surface3d' || load.data.caseId !== fault.dropSceneCase),
    } : expanded;
  }
  const expand = original.withCaseEffects;
  vi.spyOn(original, 'withCaseEffects').mockImplementation((...args) => drop(expand(...args)));
  return {
    ...original,
    singleSolveModel: (...args: Parameters<typeof original.singleSolveModel>) => drop(original.singleSolveModel(...args)),
  };
});

vi.mock('../../engine/shell-load-integration', async importOriginal => {
  const original = await importOriginal<typeof import('../../engine/shell-load-integration')>();
  return {
    ...original,
    shellLoadForces: (...args: Parameters<typeof original.shellLoadForces>) => {
      const result = original.shellLoadForces(...args);
      if (!result || args[0] !== 'quad' || !fault.integrateDrift) return result;
      return {
        ...result,
        forces: result.forces.map(([x, y, z], i) => [x, y, z * (1 + (i % 2 ? -1 : 1) * fault.integrateDrift)]),
      };
    },
  };
});

vi.mock('../../model/loads/load-magnitudes', async importOriginal => {
  const original = await importOriginal<typeof import('../../model/loads/load-magnitudes')>();
  return {
    ...original,
    scaledLoad: (load: Parameters<typeof original.scaledLoad>[0], factor: number) => {
      const offset = load.type === 'surface3d' ? fault.surfaceFactorOffset : 0;
      const scaled = original.scaledLoad(load, factor * fault.scaleCaseLoad + offset);
      if (scaled.type === 'surface3d' && fault.cornerPressureDelta) {
        const { q } = scaled.data;
        const delta = fault.cornerPressureDelta;
        scaled.data.qNodes = [q + delta, q - delta, q + delta, q - delta];
      }
      if (scaled.type === 'nodal3d' && fault.dropNodalFy) scaled.data.fy = 0;
      return scaled.type === 'nodal3d' && load.data.id === 2
        ? { ...scaled, data: { ...scaled.data, mx: scaled.data.mx + fault.momentDelta } }
        : scaled;
    },
  };
});
const combinationSigns = vi.hoisted(() => new WeakMap<SolverLoad3D, number>());

vi.mock('../../engine/accounting-math', async importOriginal => {
  const original = await importOriginal<typeof import('../../engine/accounting-math')>();
  return {
    ...original,
    scaleAssembledMagnitudes3D: (...args: Parameters<typeof original.scaleAssembledMagnitudes3D>) => {
      original.scaleAssembledMagnitudes3D(...args);
      const [source, scaled] = args;
      const sign = combinationSigns.get(source);
      if (fault.combinationDrift && sign !== undefined && scaled.type === 'nodal') {
        scaled.data.fz *= 1 + sign * fault.combinationDrift.relative;
      }
    },
  };
});

vi.mock('../../engine/solver-shells', async importOriginal => {
  const original = await importOriginal<typeof import('../../engine/solver-shells')>();
  return {
    ...original,
    convertSurfaceLoad: (...args: Parameters<typeof original.convertSurfaceLoad>) => {
      const assembled = original.convertSurfaceLoad(...args);
      if (args[0].quadId === fault.combinationDrift?.shell) {
        assembled.forEach((row, i) => combinationSigns.set(row, i % 2 ? -1 : 1));
      }
      if (fault.signedForceDelta) {
        assembled.forEach((row, i) => {
          if (row.type === 'nodal') row.data.fz += i % 2 ? -fault.signedForceDelta : fault.signedForceDelta;
        });
      }
      const drift = fault.assemblyDrift;
      if (!drift || args[0].quadId !== drift.shell) return assembled;
      return assembled.map((row, i) => row.type === 'nodal'
        ? { ...row, data: { ...row.data, fz: row.data.fz * (1 + (i % 2 ? -drift.relative : drift.relative)) } }
        : row);
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
      fault.dropMemberLoad || (fault.dropLineIntensity !== 0 && args[1][2] === fault.dropLineIntensity)
        ? [] : original.globalDistributedToSolver(...args),
  };
});


beforeEach(() => {
  modelStore.clear();
  resultsStore.clear();
  uiStore.analysisMode = 'pro';
  uiStore.useNative3DPresentation();
  uiStore.includeSelfWeight = false;
  meshBeforeAnalysis.value = true;
  fault.dropSceneCase = 0;
  fault.signedForceDelta = 0;
  fault.integrateDrift = 0;
  fault.dropMemberLoad = false;
  fault.dropLineIntensity = 0;
  fault.scaleCaseLoad = 1;
  fault.momentDelta = 0;
  fault.stalePlanarMoment = 0;
  fault.surfaceFactorOffset = 0;
  fault.cornerPressureDelta = 0;
  fault.assemblyDrift = null;
  fault.combinationDrift = null;
  fault.dropNodalFy = false;
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
        id: 1, elementId: member, a: 1, p: 0, my: 0, mz: 0, enteredZeroMoment: true,
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

it('#2479 refuses a wrong what-if plate-pressure factor throughout spatial analysis', async () => {
  const { id } = floor();
  const [a, b] = modelStore.nodes.keys();
  modelStore.addElement(a!, b!);
  expect(applyPlateMeshes([planPlateMesh(id)!]).plates).toBe(1);
  syncDefinedLoadsForAnalysis();
  const index = modelStore.loads.findIndex(load => load.type === 'surface3d');
  expect(index).toBeGreaterThanOrEqual(0);
  modelStore.addCombination('D', [{ caseId: 1, factor: 1 }]);
  const model = modelStore.model;
  const solve = () => modelStore.solve3D(false, false, true);

  vi.useFakeTimers();
  try {
    whatIf.open();
    for (const factor of [0, 2]) {
      whatIf.setLoadFactor(index, factor);
      await vi.advanceTimersByTimeAsync(60);
      const load = modelStore.loads[index]!.data;
      expect(load).toMatchObject({ q: factor });
      expect(solve()).toMatchObject({ reactions: expect.any(Array) });
    }

    fault.surfaceFactorOffset = 0.25;
    whatIf.setLoadFactor(index, 0.5);
    await vi.advanceTimersByTimeAsync(60);
    expect(modelStore.loads[index]!.data).toMatchObject({ q: 0.75 });
    fault.surfaceFactorOffset = 0;
    const paths = {
      linear: solve,
      async: () => modelStore.solve3DAsync(false, false, true),
      combinations: () => modelStore.solveCombinations3D(false, false, true),
      parallel: () => modelStore.solveCombinations3DParallel(false, false, true),
      pdelta: () => solvePDelta3D(modelStore.buildSolverInput3D()!),
      modal: () => solveModal3D(modelStore.buildSolverInput3D()!,
        new Map([...modelStore.materials].map(([key, material]) => [key, material.rho]))),
      buckling: () => solveBuckling3D(modelStore.buildSolverInput3D()!),
      direct: () => runDirectAnalysis(model, model.loadCases, model.combinations, { includeSelfWeight: false }),
    };
    const diagnostic = expect.stringMatching(/case.*1.*Test floor.*Fz/i);
    for (const [name, run] of Object.entries(paths)) {
      expect.soft(await outcome(run), name).toEqual(diagnostic);
    }
    expect.soft(modelStore.singleSolveInput3D(false, false, true), 'input').toBeNull();
    await runLiveCalc('pro', uiStore.axisConvention3D);
    expect.soft(uiStore.liveCalcError, 'live').toEqual(diagnostic);
    expect.soft(resultsStore.results3D, 'live results').toBeNull();
    expect.soft(await runGlobalSolve({ directBase: true }), 'global').toMatchObject({ ok: false, error: diagnostic });

    modelStore.setAnalysis({ perCombination: 'pdelta' });
    expect.soft(await outcome(paths.combinations), 'P-Delta combinations').toEqual(diagnostic);
    expect.soft(await outcome(paths.parallel), 'P-Delta parallel').toEqual(diagnostic);
    modelStore.updateSupport(model.supports.keys().next().value!, { uplift: true });
    expect.soft(await outcome(paths.async), 'nonlinear single').toEqual(diagnostic);
    expect.soft(await outcome(paths.parallel), 'nonlinear combinations').toEqual(diagnostic);
  } finally {
    whatIf.abandon();
    vi.useRealTimers();
  }
});

it('#2479 refuses a missing reference case with cancelling pressures on two floors', async () => {
  const source = modelStore.addLoadCase('Opposite pressures');
  expect(modelStore.updateLoadCaseFields(source, { reference: true })).toBe(true);
  const setFactor = (factor: number) =>
    expect(modelStore.updateLoadCaseFields(1, { includes: [{ caseId: source, factor }] })).toBe(true);
  setFactor(2);
  const combo = modelStore.addCombination('Floor pressures', [{ caseId: 1, factor: 1 }]);
  const model = modelStore.model;
  const floors = [0, 3].map(z => {
    const nodes = [[0, 0], [4, 0], [4, 5], [0, 5]].map(([x, y]) => modelStore.addNode(x!, y!, z)) as [number, number, number, number];
    for (const node of nodes) modelStore.addSupport(node, 'fixed3d');
    return { nodes, quadId: modelStore.addQuad(nodes, 1, 0.2) };
  });
  modelStore.addElement(floors[0]!.nodes[0], floors[1]!.nodes[0]);
  for (const [i, { quadId }] of floors.entries()) {
    const baseline = { id: i + 1, quadId, q: i === 0 ? 1 : -1, caseId: source };
    model.loads.push(withScenarioSurfaceIntent({ type: 'surface3d', data: { ...baseline, q: baseline.q / 2 } },
      { baseline, factor: 0.5 }));
  }
  const opts = { includeSelfWeight: false, leftHand: false };
  const linear = () => modelStore.solve3D(false, false, true);
  const perCase = () => modelStore.solveCombinations3D(false, false, true);
  const parallel = () => modelStore.solveCombinations3DParallel(false, false, true);
  function checkReactions(result: ReturnType<typeof linear>) {
    if (!result || typeof result === 'string') throw new Error(String(result));
    for (const [i, { nodes }] of floors.entries()) {
      for (const node of nodes) {
        expect(result.reactions.find(row => row.nodeId === node)?.fz).toBeCloseTo((i === 0 ? 1 : -1) * 4 * 5 / 4, 8);
      }
    }
  }
  checkReactions(linear());
  const combinations = perCase();
  if (!combinations || typeof combinations === 'string') throw new Error(String(combinations));
  checkReactions(combinations.perCombo.get(combo)!);
  const scope = new Set([1]);
  const massFactors = [{ caseId: 1, name: 'Dead load', type: 'D', factor: 1, basis: 'stated' as const }];
  const expanded = (): ModelData => withCaseEffects(model, model.loadCases, opts, scope);
  expect(caseMassLoads(expanded(), massFactors, false)[0]?.surface).toEqual(
    floors.map(({ quadId }, i) => ({ quadId, q: i === 0 ? 1 : -1 })),
  );

  fault.dropSceneCase = 1;
  const diagnostic = expect.stringMatching(/case.*(?:surface3d|shell)/i);
  for (const [name, run] of Object.entries({
    linear, perCase, parallel,
    async: () => modelStore.solve3DAsync(false, false, true),
    direct: () => runDirectAnalysis(model, model.loadCases, model.combinations, opts),
  })) expect.soft(await outcome(run), name).toEqual(diagnostic);
  const missing = expanded();
  expect.soft(() => caseMassLoads(missing, massFactors, false), 'mass source').toThrow(/case.*surface3d/i);
  expect.soft(() => notionalSourceLoads3D(missing, false, 1, scenarioSurfaceExpectations(missing[accountingCaseSources]!)(1)), 'notional source')
    .toThrow(/case.*surface3d/i);
  expect.soft(modelStore.singleSolveInput3D(false, false, true), 'input').toBeNull();
  expect.soft(await runGlobalSolve({ directBase: true }), 'global').toMatchObject({ ok: false, error: diagnostic });
  modelStore.setAnalysis({ perCombination: 'pdelta' });
  expect.soft(await outcome(perCase), 'P-Delta').toEqual(diagnostic);
  expect.soft(await outcome(parallel), 'P-Delta parallel').toEqual(diagnostic);
  modelStore.updateSupport(model.supports.keys().next().value!, { uplift: true });
  expect.soft(await outcome(() => modelStore.solve3DAsync(false, false, true)), 'nonlinear single').toEqual(diagnostic);
  expect.soft(await outcome(parallel), 'nonlinear combinations').toEqual(diagnostic);

  setFactor(0);
  expect(linear()).toMatchObject({ reactions: expect.any(Array) });
});

it('#2479 checks nodal pressure independently of the production integrator', async () => {
  await checkAlternatingExplorePressures('integration');
});

it('#2479 accounts for declared factors when checking supplied solver loads', () => {
  const { id } = floor();
  expect(applyPlateMeshes([planPlateMesh(id)!]).plates).toBe(1);
  syncDefinedLoadsForAnalysis();
  const model = modelStore.model;
  const source = modelStore.addLoadCase('Reference pressure');
  model.loads = model.loads.map(load => {
    if (load.type !== 'surface3d') return load;
    const baseline = { ...load.data, caseId: source };
    return withScenarioSurfaceIntent({ ...load, data: { ...baseline, q: baseline.q / 2 } }, { baseline, factor: 0.5 });
  });
  expect(modelStore.updateLoadCaseFields(source, { reference: true })).toBe(true);
  expect(modelStore.updateLoadCaseFields(1, { includes: [{ caseId: source, factor: 2 }] })).toBe(true);
  const expanded = withCaseEffects(model, model.loadCases, { includeSelfWeight: false, leftHand: false }, new Set([1]));
  const prepared = prepareSolverInput3D(expanded, false);
  const input = prepared.build(prepared.model.loads);
  const loads = input?.loads.filter(load => load.type === 'nodal') ?? [];
  expect(loads.length).toBeGreaterThan(0);
  expect(loads.reduce((total, load) => total + load.data.fz, 0)).toBeCloseTo(-4 * 5, 8);
});

it.each(['case', 'assembly'] as const)(
  '#2479 clears a successful live result after a %s refusal',
  async stage => checkAlternatingExplorePressures(stage, true),
);

const halfRegion: ShellLoadSpec['region'] = {
  normal: [0, 0, 1], points: [[0, 0, 0], [2, 0, 0], [2, 5, 0], [0, 5, 0]],
};

it('#2479 accepts signed pressures with zero equivalent force at two corners', async () => {
  const nodes = [[0, 0], [4, 0], [4, 5], [0, 5]].map(([x, y]) => modelStore.addNode(x!, y!, 0)) as [number, number, number, number];
  for (const node of nodes) modelStore.addSupport(node, 'fixed3d');
  modelStore.addElement(nodes[0], nodes[1]);
  const quadId = modelStore.addQuad(nodes, 1, 0.2);
  const baseline = { id: 1, caseId: 1, quadId, q: 0, qNodes: [2, -4, -4, 2] };
  const data = { ...baseline, qNodes: baseline.qNodes.map(q => q / 2) };
  const model = modelStore.model;
  model.loads.push(withScenarioSurfaceIntent({ type: 'surface3d', data }, { baseline, factor: 0.5 }));
  const comboId = modelStore.addCombination('Signed pressure', [{ caseId: 1, factor: 2 }]);
  const combo = model.combinations.find(c => c.id === comboId)!;
  const expected = [0, 5, 5, 0];
  const checkWires = (wires: readonly SolverLoad3D[] | undefined, factor = 1) => {
    expect(wires).toHaveLength(nodes.length);
    for (const [i, nodeId] of nodes.entries()) {
      const load = wires?.find(row => row.type === 'nodal' && row.data.nodeId === nodeId);
      expect(load?.type === 'nodal' && load.data.fz).toBeCloseTo(expected[i]! * factor, 10);
    }
  };
  const factored = () => comboSolverLoads3D(combo, caseSolverLoads3D(model, model.loadCases, false, false));
  const notional = () => notionalSourceLoads3D(model, false, 1, [{ baseline, factor: 0.5 }]);
  checkWires(buildSolverInput3D(model)?.loads);
  checkWires(factored(), 2);
  checkWires(notional());

  const checkReactions = (result: ReturnType<typeof modelStore.solve3D>, factor = 1) => {
    if (!result || typeof result === 'string') throw new Error(String(result));
    for (const [i, nodeId] of nodes.entries()) {
      expect(result.reactions.find(row => row.nodeId === nodeId)?.fz).toBeCloseTo(-expected[i]! * factor, 10);
    }
  };
  const checkCombination = (result: ReturnType<typeof modelStore.solveCombinations3D>) => {
    if (!result || typeof result === 'string') throw new Error(String(result));
    checkReactions(result.perCombo.get(comboId) ?? null, 2);
  };
  checkReactions(modelStore.solve3D(false, false, true));
  checkReactions(await modelStore.solve3DAsync(false, false, true));
  checkCombination(modelStore.solveCombinations3D(false, false, true));
  checkCombination(await modelStore.solveCombinations3DParallel(false, false, true));
  const direct = await runDirectAnalysis(model, model.loadCases, [combo], { includeSelfWeight: false });
  if (typeof direct === 'string') throw new Error(direct);
  checkReactions(direct.perCombo.get(comboId) ?? null, 2);
  expect(await runGlobalSolve({ directBase: true })).toMatchObject({ ok: true });
  resultsStore.clear();
  uiStore.liveCalcError = null;
  await runLiveCalc('pro', uiStore.axisConvention3D);
  expect(uiStore.liveCalcError).toBeNull();
  checkReactions(resultsStore.results3D);
  modelStore.setAnalysis({ perCombination: 'pdelta' });
  checkCombination(modelStore.solveCombinations3D(false, false, true));
  modelStore.updateSupport(nodes[0], { uplift: true });
  checkReactions(await modelStore.solve3DAsync(false, false, true));
  checkCombination(await modelStore.solveCombinations3DParallel(false, false, true));

  const nodalRoundoff = roundoff * (2 * 4 * 5 * (1 / 9 + 1 / 18));
  fault.signedForceDelta = nodalRoundoff / 2;
  checkWires(buildSolverInput3D(model)?.loads);
  checkWires(factored(), 2);
  checkWires(notional());
  fault.signedForceDelta = 2 * nodalRoundoff;
  for (const run of [() => buildSolverInput3D(model), factored, notional]) {
    expect(run).toThrow(/case.*node.*Fz/i);
  }
});

it.each([
  { name: 'triangle with corner pressures', xy: [[0, 0], [4, 0], [0, 5]], field: { q: 0, qNodes: [0, 6, 0] },
    expected: [2.5, 5, 2.5] },
  { name: 'triangle with cancelling corner pressures', xy: [[0, 0], [4, 0], [0, 5]], field: { q: 0, qNodes: [2, -4, 0] },
    expected: [0, -5 / 2, -5 / 6] },
  { name: 'rectangle with corner pressures', xy: [[0, 0], [4, 0], [4, 5], [0, 5]], field: { q: 0, qNodes: [0, 6, 6, 0] },
    expected: [5, 10, 10, 5] },
  { name: 'rectangle with a varying field', xy: [[0, 0], [4, 0], [4, 5], [0, 5]],
    field: { q: 0, vary: { dir: [1, 0, 0], c1: 0, q1: 0, c2: 4, q2: 6 } }, expected: [5, 10, 10, 5] },
  { name: 'rectangle with a clipped field', xy: [[0, 0], [4, 0], [4, 5], [0, 5]], field: { q: 4, region: halfRegion },
    expected: [7.5, 2.5, 2.5, 7.5] },
  { name: 'rectangle with a clipped signed field', xy: [[0, 0], [4, 0], [4, 5], [0, 5]],
    field: { q: 0, region: halfRegion, vary: { dir: [1, 0, 0], c1: 0, q1: 8, c2: 2, q2: -10 } },
    expected: [0, -5 / 2, -5 / 2, 0] },
  { name: 'trapezoid under whole pressure', xy: [[0, 0], [4, 0], [5, 5], [0, 5]], field: { q: 4 },
    expected: [65 / 6, 65 / 6, 35 / 3, 35 / 3] },
  { name: 'trapezoid with nonuniform corner pressures', xy: [[0, 0], [4, 0], [5, 5], [0, 5]], field: { q: 0, qNodes: [0, 0, 6, 6] },
    expected: [45 / 8, 45 / 8, 95 / 8, 95 / 8] },
  { name: 'trapezoid under partial pressure', xy: [[0, 0], [4, 0], [5, 5], [0, 5]], field: { q: 4, region: halfRegion },
    expected: null },
] satisfies { name: string; xy: number[][]; field: ShellLoadSpec; expected: number[] | null }[])(
  '#2479 checks $name against analytic nodal forces',
  ({ xy, field, expected }) => {
    const nodes = xy.map(([x, y]) => modelStore.addNode(x!, y!, 0));
    for (const node of nodes) modelStore.addSupport(node, 'fixed3d');
    const triangle = nodes.length === 3;
    const quadId = triangle
      ? modelStore.addPlate(nodes as [number, number, number], 1, 0.2)
      : modelStore.addQuad(nodes as [number, number, number, number], 1, 0.2);
    const baseline = { ...field, id: 1, caseId: 1, quadId, ...(triangle ? { on: 'plate' as const } : {}) };
    const data = {
      ...baseline, q: baseline.q / 2, qNodes: baseline.qNodes?.map(q => q / 2),
      vary: baseline.vary && { ...baseline.vary, q1: baseline.vary.q1 / 2, q2: baseline.vary.q2 / 2 },
    };
    const model = modelStore.model;
    model.loads.push(withScenarioSurfaceIntent({ type: 'surface3d', data }, { baseline, factor: 0.5 }));
    if (!expected) {
      expect(() => buildSolverInput3D(model)).toThrow(/case.*surface3d/i);
      return;
    }
    const loads = buildSolverInput3D(model)?.loads;
    expect(loads).toHaveLength(nodes.length);
    nodes.forEach((nodeId, i) => {
      const wire = loads?.find(load => load.type === 'nodal' && load.data.nodeId === nodeId);
      expect(wire?.type === 'nodal' && wire.data.fz).toBeCloseTo(-expected[i]!, 10);
    });
  },
);

it('#2479 refuses alternating equivalent nodal force errors introduced during assembly', async () => {
  await checkAlternatingExplorePressures('assembly');
});

it('#2479 refuses alternating equivalent nodal force errors introduced by combination scaling', async () => {
  await checkAlternatingExplorePressures('combination');
});

it('#2479 refuses alternating what-if corner pressures introduced only by case scaling', async () => {
  await checkAlternatingExplorePressures('case');
});

it('#2479 refuses alternating what-if corner pressures with unchanged resultants', async () => {
  await checkAlternatingExplorePressures('slider');
});

async function checkAlternatingExplorePressures(stage: 'slider' | 'case' | 'assembly' | 'integration' | 'combination', liveOnly = false) {
  const { id } = floor();
  const [a, b] = modelStore.nodes.keys();
  modelStore.addElement(a!, b!);
  expect(applyPlateMeshes([planPlateMesh(id)!]).plates).toBe(1);
  syncDefinedLoadsForAnalysis();
  const index = modelStore.loads.findIndex(load => load.type === 'surface3d');
  const target = modelStore.loads[index];
  if (target?.type !== 'surface3d') throw new Error('Missing floor pressure');
  const corners = modelStore.quads.get(target.data.quadId)!.nodes.map(id => modelStore.nodes.get(id)!);
  const xs = corners.map(node => node.x), ys = corners.map(node => node.y);
  const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));

  const included = modelStore.addLoadCase('Included pressure');
  expect(modelStore.updateLoadCaseFields(1, { reference: true })).toBe(true);
  expect(modelStore.updateLoadCaseFields(included, { includes: [{ caseId: 1, factor: 2 }] })).toBe(true);
  const combo = modelStore.addCombination('Design pressure', [{ caseId: included, factor: 1.5 }]);
  const model = modelStore.model;
  if (stage === 'combination') {
    for (const other of [...model.combinations]) {
      if (other.id !== combo) modelStore.removeCombination(other.id);
    }
  }
  const paths = {
    linear: () => modelStore.solve3D(false, false, true),
    async: () => modelStore.solve3DAsync(false, false, true),
    combinations: () => modelStore.solveCombinations3D(false, false, true),
    parallel: () => modelStore.solveCombinations3DParallel(false, false, true),
    pdelta: () => solvePDelta3D(modelStore.buildSolverInput3D()!),
    modal: () => solveModal3D(modelStore.buildSolverInput3D()!,
      new Map([...modelStore.materials].map(([key, material]) => [key, material.rho]))),
    buckling: () => solveBuckling3D(modelStore.buildSolverInput3D()!),
    direct: () => runDirectAnalysis(model, model.loadCases, model.combinations, { includeSelfWeight: false }),
  };

  const notionalCase = { id: included + 1, type: 'L' as const, notional: { sourceCaseId: 1, ratio: 0.002, dir: '+X' as const } };
  const notional = () => withCaseEffects(model, [...model.loadCases, notionalCase],
    { includeSelfWeight: false, leftHand: false }, new Set([notionalCase.id]));

  const requested = 0.5;
  const inject = (delta: number) => {
    fault.cornerPressureDelta = stage === 'case' ? delta * 2 : 0;
    const drift = { shell: target.data.quadId, relative: delta / requested };
    if (stage === 'assembly') fault.assemblyDrift = drift;
    if (stage === 'integration') fault.integrateDrift = drift.relative;
    if (stage === 'combination') fault.combinationDrift = drift;
  };
  const apply = async (delta: number) => {
    fault.integrateDrift = 0;
    fault.assemblyDrift = null;
    fault.combinationDrift = null;
    fault.cornerPressureDelta = stage === 'slider' ? delta : 0;
    whatIf.setLoadFactor(index, requested);
    await vi.advanceTimersByTimeAsync(60);
    inject(delta);
  };
  const within = requested * (roundoff - Number.EPSILON);
  const beyond = requested * (roundoff + 2 * Number.EPSILON);
  vi.useFakeTimers();
  try {
    whatIf.open();
    const nodalDrift = stage === 'assembly' || stage === 'integration';
    const diagnostic = expect.stringMatching(nodalDrift
      ? /case.*Test floor.*node.*Fz/i : /case.*Test floor.*q\[1\]/i);
    if (liveOnly) {
      await apply(0);
      await runLiveCalc('pro', uiStore.axisConvention3D);
      expect(resultsStore.results3D).toMatchObject({ reactions: expect.any(Array) });
      inject(0.25);
      await runLiveCalc('pro', uiStore.axisConvention3D);
      expect.soft(uiStore.liveCalcError).toEqual(diagnostic);
      expect.soft(resultsStore.results3D).toBeNull();
      return;
    }
    if (stage === 'combination') {
      const assembleCombination = () => {
        const expanded = withCaseEffects(model, model.loadCases, { includeSelfWeight: false, leftHand: false });
        const cases = caseSolverLoads3D(expanded, model.loadCases, false, false);
        const combination = model.combinations.find(c => c.id === combo)!;
        return comboSolverLoads3D(combination, cases);
      };
      const diagnostic = expect.stringMatching(/case.*Design pressure.*node.*Fz/i);
      for (const delta of [0, within]) {
        await apply(delta);
        expect(assembleCombination().length).toBeGreaterThan(0);
      }
      modelStore.setAnalysis({ perCombination: 'pdelta' });
      const correct = paths.combinations();
      if (!correct || typeof correct === 'string') throw new Error(String(correct));
      const expected = (20 - area * (1 - requested)) * 2 * 1.5;
      expect(correct.perCombo.get(combo)!.reactions.reduce((sum, r) => sum + r.fz, 0)).toBeCloseTo(expected, 8);

      await apply(beyond);
      expect.soft(await outcome(assembleCombination), 'just beyond nodal force roundoff').toEqual(diagnostic);
      await apply(0.25);
      expect.soft(await outcome(paths.direct), 'direct').toEqual(diagnostic);
      modelStore.setAnalysis({ perCombination: 'pdelta' });
      expect.soft(await outcome(paths.combinations), 'P-Delta combinations').toEqual(diagnostic);
      expect.soft(await outcome(paths.parallel), 'P-Delta parallel').toEqual(diagnostic);
      modelStore.updateSupport(model.supports.keys().next().value!, { uplift: true });
      expect.soft(await outcome(paths.combinations), 'nonlinear combinations').toEqual(diagnostic);
      expect.soft(await outcome(paths.parallel), 'nonlinear parallel').toEqual(diagnostic);
      return;
    }
    for (const delta of [0, within]) {
      await apply(delta);
      if (nodalDrift) expect(notional().loads.some(load => load.data.caseId === notionalCase.id)).toBe(true);
      const expected = (20 - area * (1 - requested)) * 2;
      const result = paths.linear();
      if (!result || typeof result === 'string') throw new Error(String(result));
      expect(result.reactions.reduce((sum, r) => sum + r.fz, 0)).toBeCloseTo(expected, 8);
      const combinations = paths.combinations();
      if (!combinations || typeof combinations === 'string') throw new Error(String(combinations));
      expect(combinations.perCombo.get(combo)!.reactions.reduce((sum, r) => sum + r.fz, 0)).toBeCloseTo(expected * 1.5, 8);
    }

    await apply(beyond);
    expect.soft(paths.linear(), 'just beyond corner roundoff').toEqual(diagnostic);

    await apply(0.25);
    const sliderLoad = modelStore.loads[index];
    if (sliderLoad?.type !== 'surface3d') throw new Error('Missing floor pressure');
    expect(sliderLoad.data.q).toBe(requested);
    expect(sliderLoad.data.qNodes).toEqual(stage === 'slider' ? [0.75, 0.25, 0.75, 0.25] : undefined);
    for (const [name, run] of Object.entries(paths)) {
      if (stage === 'case' && (name === 'pdelta' || name === 'modal' || name === 'buckling')) continue;
      expect.soft(await outcome(run), name).toEqual(diagnostic);
    }
    if (nodalDrift) expect.soft(await outcome(notional), 'notional source').toEqual(expect.stringMatching(/case.*node.*Fz/i));
    expect.soft(modelStore.singleSolveInput3D(false, false, true), 'input').toBeNull();
    await runLiveCalc('pro', uiStore.axisConvention3D);
    expect.soft(uiStore.liveCalcError, 'live').toEqual(diagnostic);
    expect.soft(resultsStore.results3D, 'live results').toBeNull();
    expect.soft(await runGlobalSolve({ directBase: true }), 'global').toMatchObject({ ok: false, error: diagnostic });

    modelStore.setAnalysis({ perCombination: 'pdelta' });
    expect.soft(await outcome(paths.combinations), 'P-Delta combinations').toEqual(diagnostic);
    expect.soft(await outcome(paths.parallel), 'P-Delta parallel').toEqual(diagnostic);
    modelStore.updateSupport(model.supports.keys().next().value!, { uplift: true });
    expect.soft(await outcome(paths.async), 'nonlinear single').toEqual(diagnostic);
    expect.soft(await outcome(paths.parallel), 'nonlinear combinations').toEqual(diagnostic);
  } finally {
    fault.integrateDrift = 0;
    fault.cornerPressureDelta = 0;
    fault.assemblyDrift = null;
    fault.combinationDrift = null;
    whatIf.abandon();
    vi.useRealTimers();
  }
}

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

it('#2470 preserves a transverse force at its entered station near either member end', async () => {
  const elementId = cantilever('3d');
  const model = modelStore.model;
  const combination = model.combinations.at(-1)!;
  for (const a of [0, POINT_END_TOL / 2, 2 * POINT_END_TOL, 2 - 2 * POINT_END_TOL, 2 - POINT_END_TOL / 2, 2]) {
    model.loads.splice(0, model.loads.length, { type: 'pointOnElement3d', data: {
      id: 1, elementId, a, py: 0, pz: -1, frame: 'global', caseId: 1,
    } });
    const expected = { reactions: [expect.objectContaining({ fz: expect.closeTo(1, 12), my: expect.closeTo(-a, 12) })] };
    expect.soft(await refusal(() => modelStore.solve3D(false, false, true)), 'linear at ' + a).toMatchObject(expected);
    expect.soft(await refusal(() => modelStore.solve3DAsync(false, false, true)), 'async linear at ' + a).toMatchObject(expected);
    expect.soft(await refusal(() => solvePDelta3D(modelStore.buildSolverInput3D()!).results), 'P-Delta at ' + a).toMatchObject(expected);
    for (const perCombination of ['linear', 'pdelta'] as const) {
      modelStore.setAnalysis({ perCombination });
      for (const solve of [
        () => modelStore.solveCombinations3D(false, false, true),
        () => modelStore.solveCombinations3DParallel(false, false, true),
      ]) {
        const result = await solve();
        expect.soft(result && typeof result === 'object'
          ? result.perCombo.get(combination.id) : result, perCombination + ' combination at ' + a).toMatchObject(expected);
      }
    }
    const direct = await runDirectAnalysis(model, model.loadCases, [combination], {
      includeSelfWeight: false, settings: { notional: 0, tauB: 'iterate' },
    });
    expect.soft(typeof direct === 'object' ? direct.perCombo.get(combination.id) : direct, 'direct analysis at ' + a).toMatchObject(expected);
  }
});

it('#2470 preserves cancelling projections on nearly vertical planar members', async () => {
  const elementId = cantilever('2d');
  const model = modelStore.model;
  const { nodeJ } = model.elements.get(elementId)!;
  model.nodes.set(nodeJ, { ...model.nodes.get(nodeJ)!, x: Number.EPSILON / 2, y: 2 });
  const data = { id: 1, elementId, a: 0.5, angle: 0, isGlobal: true, caseId: 1 };
  const expected = { reactions: [expect.objectContaining({ rx: expect.closeTo(0, 12), rz: expect.closeTo(1, 12) })] };
  const combination = model.combinations.at(-1)!;
  const dead = { id: 1, name: 'D', type: 'D' };
  const live = { id: 2, name: 'L', type: 'L' };

  for (const load of [
    { type: 'pointOnElement', data: { ...data, p: -1 } },
    { type: 'distributed', data: { ...data, b: 1.5, qI: -1, qJ: -1 } },
  ] satisfies ModelData['loads']) {
    const input = { ...model, loads: [load] };
    expect.soft(await refusal(() => validateAndSolve2D(input)), load.type + ' linear').toMatchObject(expected);
    expect.soft(await refusal(() => validateAndSolve2DAsync(input)), load.type + ' async linear').toMatchObject(expected);
    expect.soft(await refusal(() => solvePDelta(buildSolverInput2D(input)!).results), load.type + ' P-Delta').toMatchObject(expected);
    for (const name of [dead.name, live.name]) {
      const result = solveCombinations2D(input, [dead, { ...live, name }], [combination]);
      expect.soft(result && typeof result === 'object' ? result.perCombo.get(combination.id) : result, load.type + ' ' + name)
        .toMatchObject(expected);
    }
  }
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

it('#2479 refuses the loss of a 0.01 orthogonal force alongside 1e12 at the origin', async () => {
  const member = cantilever('3d');
  const model = modelStore.model;
  const root = model.elements.get(member)!.nodeI;
  const dominant = 1e12;
  const orthogonal = 0.01;
  const load = modelStore.addNodalLoad3D(root, dominant, orthogonal, 0, 0, 0, 0, 1);
  const diagnostic = expect.stringMatching(/case.*1.*Fy.*0\.01.*0/i);
  const planarPaths = {
    linear: () => modelStore.solve(false, 'xz'),
    async: () => modelStore.solveAsync(false, 'xz'),
    combinations: () => modelStore.solveCombinations(false, 'xz'),
    pdelta: () => solvePDelta(modelStore.buildSolverInput(false, 'xz')!),
  };
  for (const [name, run] of Object.entries(planarPaths)) {
    expect.soft(await outcome(run), name).toEqual(diagnostic);
  }
  expect(modelStore.updateLoad(load, { fy: 0 })).toBe(true);
  expect(planarPaths.linear()).toMatchObject({ reactions: [expect.objectContaining({ rx: -dominant })] });

  expect(modelStore.updateLoad(load, { fx: dominant / 2, fy: orthogonal / 2 })).toBe(true);
  const reference = modelStore.addLoadCase('Reference', 'L');
  modelStore.updateLoadCaseFields(reference, { reference: true });
  modelStore.updateLoadCaseFields(1, { includes: [{ caseId: reference, factor: 2 }] });
  model.loads[0]!.data.caseId = reference;
  const spatialPaths = {
    linear: () => modelStore.solve3D(false, false, true),
    async: () => modelStore.solve3DAsync(false, false, true),
    combinations: () => modelStore.solveCombinations3D(false, false, true),
    parallel: () => modelStore.solveCombinations3DParallel(false, false, true),
    direct: () => runDirectAnalysis(model, model.loadCases, model.combinations, { includeSelfWeight: false }),
  };
  expect(spatialPaths.linear()).toMatchObject({ reactions: [expect.objectContaining({ fx: -dominant, fy: -orthogonal })] });
  fault.dropNodalFy = true;
  for (const [name, run] of Object.entries(spatialPaths)) {
    expect.soft(await outcome(run), name).toEqual(diagnostic);
  }
  modelStore.setAnalysis({ perCombination: 'pdelta' });
  expect.soft(await outcome(spatialPaths.parallel), 'P-Delta').toEqual(diagnostic);
  modelStore.updateSupport(model.supports.keys().next().value!, { uplift: true });
  expect.soft(await outcome(spatialPaths.async), 'nonlinear single').toEqual(diagnostic);
  expect.soft(await outcome(spatialPaths.parallel), 'nonlinear combinations').toEqual(diagnostic);
});

it('#2470 solves a fixed-ended beam with a subnormal live line load', async () => {
  const elementId = cantilever('3d');
  const model = modelStore.model;
  const { nodeI, nodeJ } = model.elements.get(elementId)!;
  model.nodes.set(nodeI, { ...model.nodes.get(nodeI)!, z: 3 });
  model.nodes.set(nodeJ, { ...model.nodes.get(nodeJ)!, x: 3, z: 3 });
  modelStore.addSupportEntry({ nodeId: nodeJ, type: 'fixed3d' });
  model.loadCases.splice(0, model.loadCases.length, { id: 1, name: 'D', type: 'D' }, { id: 2, name: 'L', type: 'L' });
  model.combinations.splice(0, model.combinations.length,
    { id: 1, name: '1.4D', factors: [{ caseId: 1, factor: 1.4 }] },
    { id: 2, name: '1.2D+1.6L', factors: [{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }] });
  const live = { id: 2, elementId, qYI: 0, qYJ: 0, qZI: -Number.MIN_VALUE, qZJ: -Number.MIN_VALUE, caseId: 2 };
  model.loads.push(
    { type: 'distributed3d', data: { ...live, id: 1, qZI: -5, qZJ: -5, caseId: 1 } },
    { type: 'distributed3d', data: live },
  );
  const expected = (fz: number) => ({
    reactions: [expect.objectContaining({ fz: expect.closeTo(fz, 12) }), expect.objectContaining({ fz: expect.closeTo(fz, 12) })],
  });
  const singlePaths = {
    linear: () => modelStore.solve3D(false, false, true),
    async: () => modelStore.solve3DAsync(false, false, true),
    pdelta: () => {
      const input = modelStore.buildSolverInput3D();
      return input && solvePDelta3D(input).results;
    },
  };
  for (const [path, solve] of Object.entries(singlePaths)) {
    expect.soft(await refusal(solve), path).toMatchObject(expected(7.5));
  }
  const comboPaths = {
    sync: () => modelStore.solveCombinations3D(false, false, true),
    parallel: () => modelStore.solveCombinations3DParallel(false, false, true),
  };
  for (const perCombination of ['linear', 'pdelta'] as const) {
    modelStore.setAnalysis({ perCombination });
    for (const [path, solve] of Object.entries(comboPaths)) {
      const result = await solve();
      expect.soft(result && typeof result === 'object' ? result.perCombo.get(2) : result, perCombination + ' ' + path)
        .toMatchObject(expected(9));
    }
  }
  const direct = await runDirectAnalysis(model, model.loadCases, model.combinations, {
    includeSelfWeight: false, settings: { notional: 0, tauB: 'iterate' },
  });
  expect.soft(typeof direct === 'object' ? direct.perCombo.get(2) : direct, 'direct').toMatchObject(expected(9));

  const supportId = [...model.supports.keys()][0]!;
  modelStore.updateSupport(supportId, { uplift: true });
  expect.soft(await singlePaths.linear(), 'nonlinear').toMatchObject(expected(7.5));
  expect.soft(await singlePaths.async(), 'async nonlinear').toMatchObject(expected(7.5));
  for (const [path, solve] of Object.entries(comboPaths)) {
    const result = await solve();
    expect.soft(result && typeof result === 'object' ? result.perCombo.get(2) : result, 'nonlinear ' + path)
      .toMatchObject(expected(9));
  }

  live.qZI = live.qZJ = -1e-300;
  modelStore.setAnalysis({ perCombination: 'linear' });
  modelStore.updateSupport(supportId, { uplift: false });
  const kept = await comboPaths.sync();
  if (!kept || typeof kept === 'string') throw new Error(String(kept));
  expect(kept.perCombo.get(2)).toMatchObject(expected(9));
  const liveResult = kept.perCase.get(2)!;
  expect(liveResult.reactions.map(({ fz }) => fz / 1e-300))
    .toEqual([expect.closeTo(1.5, 12), expect.closeTo(1.5, 12)]);
  fault.dropLineIntensity = -1e-300;
  const mismatch = expect.stringMatching(/case.*2.*\(L\).*Fz.*-3e-300.*0/i);
  for (const [path, solve] of Object.entries(comboPaths)) expect.soft(await solve(), path).toEqual(mismatch);
  expect(modelStore.solve3D(false, false, true)).toEqual(mismatch);
});

it('#2470 solves a planar beam with a subnormal global line load', async () => {
  const elementId = cantilever('2d');
  const model = modelStore.model;
  const { nodeJ } = model.elements.get(elementId)!;
  model.nodes.set(nodeJ, { ...model.nodes.get(nodeJ)!, x: 3 });
  const cases = [{ id: 1, name: 'D', type: 'D' }, { id: 2, name: 'L', type: 'L' }];
  const combination = { id: 1, name: 'D+L', factors: [{ caseId: 1, factor: 1 }, { caseId: 2, factor: 1 }] };
  const live = { id: 2, elementId, qI: -Number.MIN_VALUE, qJ: -Number.MIN_VALUE, isGlobal: true, caseId: 2 };
  const makeInput = (q: number): ModelData => ({
    ...model, loads: [
      { type: 'distributed', data: { id: 1, elementId, qI: -5, qJ: -5, caseId: 1 } },
      { type: 'distributed', data: { ...live, qI: q, qJ: q } },
    ],
  });
  const input = makeInput(-Number.MIN_VALUE);
  const expected = { reactions: [expect.objectContaining({ rz: expect.closeTo(15, 12) })] };
  expect.soft(await refusal(() => validateAndSolve2D(input)), 'linear').toMatchObject(expected);
  expect.soft(await refusal(() => validateAndSolve2DAsync(input)), 'async').toMatchObject(expected);
  expect.soft(await refusal(() => solvePDelta(buildSolverInput2D(input)!).results), 'P-Delta').toMatchObject(expected);
  for (const name of ['D', 'L']) {
    const withCases = [cases[0]!, { ...cases[1]!, name }];
    const result = solveCombinations2D(input, withCases, [combination]);
    expect.soft(result && typeof result === 'object' ? result.perCombo.get(1) : result, name).toMatchObject(expected);
    expect.soft(solveCombinations2D(makeInput(-1e-300), withCases, [combination]), name + ' normal-range loss')
      .toEqual(expect.stringMatching(/case.*2.*Fy.*-3e-300.*0/i));
  }
  expect.soft(validateAndSolve2D(makeInput(-2 * Number.MIN_VALUE)), 'six subnormal units')
    .toMatchObject(expected);
  expect.soft(validateAndSolve2D(makeInput(-3 * Number.MIN_VALUE)), 'eight subnormal units')
    .toEqual(expect.stringMatching(/case.*2.*Fy.*assembled 0/i));
  expect(validateAndSolve2D(makeInput(-1e-300))).toEqual(expect.stringMatching(/case.*2.*Fy.*-3e-300.*0/i));
});

it('#2543 refuses an incorrect pressure in a reference case used only for modal mass', () => {
  const source = modelStore.addLoadCase('Modal mass reference', 'D');
  expect(modelStore.updateLoadCaseFields(source, { reference: true })).toBe(true);
  const nodes = [[0, 0], [4, 0], [4, 5], [0, 5]].map(([x, y]) => modelStore.addNode(x!, y!, 3)) as [number, number, number, number];
  const quadId = modelStore.addQuad(nodes, 1, 0.2);
  for (const node of nodes.slice(0, 3)) modelStore.addSupport(node, 'fixed3d');
  const model = modelStore.model;
  const solverInput = buildSolverInput3D(model, false, false)!;
  expect(solverInput).not.toBeNull();
  const baseline = { id: 1, quadId, q: 1, caseId: source };
  const factors = [{ caseId: source, name: 'Modal mass reference', type: 'D', factor: 1, basis: 'stated' as const }];
  const pressurized = (q: number) => ({
    ...model,
    loads: [withScenarioSurfaceIntent({ type: 'surface3d', data: { ...baseline, q } }, { baseline, factor: 0.5 })],
  });
  const masses = (q: number, scoped: boolean) => {
    const withPressure = pressurized(q);
    const selected = scoped ? withCaseEffects(withPressure, model.loadCases,
      { includeSelfWeight: false, leftHand: false }, new Set([source])) : withPressure;
    return caseMassLoads(selected, factors, false)[0]?.surface;
  };
  const modalMass = (q: number) => withMassSource(pressurized(q), model.loadCases,
    { kind: 'custom', factors: [{ caseId: source, factor: 1 }] }, solverInput);
  expect(modalMass(0.5).report.addedT.get(source)).toBeCloseTo(0.5 * 4 * 5 / G, 10);
  expect(() => modalMass(0.75)).toThrow(/case.*Modal mass reference.*q\[1\]/i);
  for (const scoped of [false, true]) {
    expect(masses(0.5, scoped)).toEqual([{ quadId, q: 0.5 }]);
    const within = 0.5 * (roundoff - Number.EPSILON);
    const beyond = 0.5 * (roundoff + Number.EPSILON);
    expect(masses(0.5 + within, scoped)).toEqual([{ quadId, q: 0.5 }]);
    for (const q of [0.5 + beyond, 0.75]) {
      expect.soft(() => masses(q, scoped)).toThrow(/case.*Modal mass reference.*q\[1\]/i);
    }
  }
});

const memberAccountingWitness = process.env.RUN_KNOWN_WRONG === '2471' ? it : it.skip;

memberAccountingWitness('known wrong result: #2471 detects a lost self-equilibrated line load in spatial analysis', async () => {
  const member = cantilever('3d');
  const model = modelStore.model;
  model.loads.push({ type: 'distributed3d', data: {
    id: 1, elementId: member, qXI: 2, qXJ: -2, qYI: 0, qYJ: 0, qZI: 0, qZJ: 0, frame: 'global', caseId: 1,
  } });
  const paths = {
    linear: () => modelStore.solve3D(false, false, true),
    async: () => modelStore.solve3DAsync(false, false, true),
    advanced: () => buildSolverInput3D(model),
    combinations: () => modelStore.solveCombinations3D(false, false, true),
    parallel: () => modelStore.solveCombinations3DParallel(false, false, true),
    direct: () => runDirectAnalysis(model, model.loadCases, model.combinations, { includeSelfWeight: false }),
  };
  expect(paths.advanced()?.loads).toEqual([expect.objectContaining({
    type: 'distributed', data: expect.objectContaining({ elementId: member, qXI: 2, qXJ: -2 }),
  })]);
  expect(paths.linear()).toMatchObject({ elementForces: [expect.objectContaining({
    distributedLoadsX: [{ qI: 2, qJ: -2, a: 0, b: 2 }],
  })] });
  fault.dropMemberLoad = true;
  const diagnostic = expect.stringMatching(new RegExp('case.*member.*' + member + '.*Fx', 'i'));
  for (const [path, solve] of Object.entries(paths)) expect.soft(await outcome(solve), path).toEqual(diagnostic);
  expect.soft(modelStore.singleSolveInput3D(false, false, true)).toBeNull();
  modelStore.setAnalysis({ perCombination: 'pdelta' });
  expect.soft(await outcome(paths.combinations), 'P-Delta').toEqual(diagnostic);
  expect.soft(await outcome(paths.parallel), 'parallel P-Delta').toEqual(diagnostic);
});

memberAccountingWitness('known wrong result: #2471 detects a lost self-equilibrated line load before a planar projection solve', async () => {
  const elementId = cantilever('2d');
  const model = modelStore.model;
  const cases = [{ id: 1, name: 'Dead', type: 'D' }, { id: 2, name: 'Live', type: 'L' }];
  const combos = [{ id: 1, name: 'Dead only', factors: [{ caseId: 1, factor: 1 }] }];
  const source: ModelData = {
    ...model, loadCases: cases,
    loads: [{ type: 'distributed3d', data: {
      id: 1, elementId, qXI: 2, qXJ: -2, qYI: 0, qYJ: 0, qZI: 0, qZJ: 0, frame: 'global', caseId: 1,
    } }],
  };
  const projected: ModelData = { ...model, loads: [], loadCases: cases, [accountingProjection]: { plane: 'xz', source } };
  const complete: ModelData = { ...projected, loads: [{
    type: 'distributed', data: { id: 1, elementId, qI: 2, qJ: -2, angle: 90, isGlobal: true, caseId: 1 },
  }] };
  expect(buildSolverInput2D(complete)?.loads).toEqual([expect.objectContaining({
    type: 'axialDistributed', data: expect.objectContaining({ elementId, qI: 2, qJ: -2 }),
  })]);
  expect(validateAndSolve2D(complete)).toMatchObject({ elementForces: [expect.objectContaining({
    distributedLoadsX: [{ qI: 2, qJ: -2, a: 0, b: 2 }],
  })] });
  const diagnostic = expect.stringMatching(new RegExp('case.*member.*' + elementId + '.*Fx', 'i'));
  const paths = {
    linear: () => validateAndSolve2D(projected),
    async: () => validateAndSolve2DAsync(projected),
    pdelta: () => solvePDelta(buildSolverInput2D(projected)!),
    batch: () => solveCombinations2D(projected, cases, combos),
    fallback: () => solveCombinations2D(projected, cases.map(c => ({ ...c, name: 'Same' })), combos),
  };
  for (const [path, solve] of Object.entries(paths)) expect.soft(await outcome(solve), path).toEqual(diagnostic);
});
