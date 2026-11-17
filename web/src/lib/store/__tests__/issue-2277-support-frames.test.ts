import { beforeEach, expect, it } from 'vitest';
import { modelStore, uiStore } from '..';
import { hasNonlinearBehaviour } from '../../engine/member-behaviour';
import {
  buildSolverInput2D, solveCombinations2D, solveCombinations3D, solveCombinations3DParallel,
  validateAndSolve2D, validateAndSolve2DAsync, validateAndSolve3D, validateAndSolve3DAsync,
} from '../../engine/solver-service';
import { solvePDelta } from '../../engine/wasm-solver';
import type { PDeltaResult } from '../../engine/result-types';
import { rotation, translation } from '../../model/edit/affine';
import { detach, fragmentOf } from '../../model/edit/fragment';
import { copyTransformed, insertFragment } from '../../model/edit/transformed-copy';
import { transformInPlace } from '../../model/edit/transform-in-place';
import { loadFixture, type FixtureLoader, type JSONModel } from '../../templates/load-fixture';

const noRestraints = { tx: false, ty: false, tz: false, rx: false, ry: false, rz: false };

function supportAt(nodeId: number) {
  return [...modelStore.supports.values()].find(s => s.nodeId === nodeId)!;
}

beforeEach(() => {
  uiStore.analysisMode = '2d';
  uiStore.useNative3DPresentation();
  uiStore.includeSelfWeight = false;
  modelStore.clear();
});

const loadCase = { id: 1, type: 'D' as const, name: 'Applied load' };
const combination = { id: 1, name: 'Applied load only', factors: [{ caseId: loadCase.id, factor: 1 }] };

function bearingModel() {
  const fixed = modelStore.addNode(0, 0);
  const bearing = modelStore.addNode(2, 1);
  const member = modelStore.addElement(fixed, bearing);
  modelStore.addSupportEntry({ nodeId: fixed, type: 'fixed' });
  modelStore.addSupportEntry({ nodeId: bearing, type: 'rollerZ' });
  return { fixed, bearing, member };
}

for (const operation of ['copy', 'detached copy', 'in place'] as const) {
  it(`#2277 a plane quarter-turn carries the bearing reactions (${operation})`, async () => {
    const source = bearingModel();
    modelStore.addNodalLoad(source.bearing, 1, 0);
    const before = validateAndSolve2D(modelStore.model);
    if (!before || typeof before === 'string') throw new Error(String(before));
    expect(before.reactions.find(r => r.nodeId === source.bearing)!.rx).toBeCloseTo(-1, 9);

    modelStore.model.loads = [];
    const set = { nodes: [], elements: [source.member] };
    const turn = rotation([0, 0, 0], [0, 0, 1], 90);
    const report = operation === 'in place' ? transformInPlace(set, turn)
      : operation === 'copy' ? copyTransformed(set, [turn], { withSupports: true })
      : insertFragment(detach(fragmentOf(set, { withSupports: true })), [turn], { withSupports: true });
    expect(report.warnings.supportDropped).toBeUndefined();
    const bearing = 'maps' in report ? report.maps[0]!.nodes.get(source.bearing)! : source.bearing;
    modelStore.addNodalLoad(bearing, 0, 1);

    const m = modelStore.model;
    const direct = validateAndSolve2D(m);
    const asyncDirect = await validateAndSolve2DAsync(m);
    const cases = solveCombinations2D(m, [loadCase], [combination]);
    if (!cases || typeof cases === 'string') throw new Error(String(cases));
    expect(cases.perCase.size).toBe(1);
    expect(cases.perCombo.size).toBe(1);
    for (const result of [direct, asyncDirect, ...cases.perCase.values(), ...cases.perCombo.values()]) {
      if (!result || typeof result === 'string') throw new Error(String(result));
      const reaction = result.reactions.find(r => r.nodeId === bearing)!;
      expect(reaction.rx).toBeCloseTo(0, 9);
      expect(reaction.rz).toBeCloseTo(-1, 9);
    }
    const embedded = validateAndSolve3D(m);
    if (!embedded || typeof embedded === 'string') throw new Error(String(embedded));
    expect(embedded.reactions.find(r => r.nodeId === bearing)!.fz).toBeCloseTo(-1, 9);
  });
}

it('#2277 the 2D second-order solve uses the rotated bearing axis', () => {
  const { bearing, member } = bearingModel();
  transformInPlace({ nodes: [], elements: [member] }, rotation([0, 0, 0], [0, 0, 1], 90));
  modelStore.addNodalLoad(bearing, 1, -1);
  const input = buildSolverInput2D(modelStore.model);
  if (!input) throw new Error('Expected a plane solver input');
  const result: PDeltaResult = solvePDelta(input);
  expect(result.isStable).toBe(true);
  expect(result.iterations).toBeGreaterThan(0);
  expect(result.results.reactions.find(r => r.nodeId === bearing)!.rx).toBeCloseTo(0, 9);
  expect(result.results.reactions.reduce((sum, r) => sum + r.rx, 0)).toBeCloseTo(-1, 9);
});

for (const nonlinear of [false, true]) {
  it(`#2277 a standing plane copy carries the bearing through an XZ quarter-turn (nonlinear=${nonlinear})`, async () => {
    const source = bearingModel();
    uiStore.analysisMode = 'pro';
    uiStore.useUpright2DIn3DPresentation();
    const turn = rotation([0, 0, 0], [0, 1, 0], -90);
    const report = copyTransformed({ nodes: [], elements: [source.member] }, [turn], { withSupports: true });
    expect(report.warnings.supportDropped).toBeUndefined();
    const bearing = report.maps[0]!.nodes.get(source.bearing)!;
    expect(modelStore.nodes.get(bearing)!.x).toBeCloseTo(-1, 9);
    expect(modelStore.nodes.get(bearing)!.y).toBeCloseTo(0, 9);
    expect(modelStore.nodes.get(bearing)!.z).toBeCloseTo(2, 9);
    if (nonlinear) modelStore.updateSupport(supportAt(source.fixed).id, { uplift: true });
    modelStore.addNodalLoad3D(bearing, 0, 0, -1, 0, 0, 0);
    const m = modelStore.model;
    expect(hasNonlinearBehaviour(m)).toBe(nonlinear);
    const direct = validateAndSolve3D(m);
    const asyncDirect = await validateAndSolve3DAsync(m);
    const cases = solveCombinations3D(m, [loadCase], [combination]);
    const parallel = await solveCombinations3DParallel(m, [loadCase], [combination]);
    if (!cases || typeof cases === 'string') throw new Error(String(cases));
    if (!parallel || typeof parallel === 'string') throw new Error(String(parallel));
    expect(cases.perCase.size).toBe(1);
    expect(cases.perCombo.size).toBe(1);
    expect(parallel.perCase.size).toBe(cases.perCase.size);
    expect(parallel.perCombo.size).toBe(cases.perCombo.size);
    for (const result of [direct, asyncDirect, ...cases.perCase.values(), ...cases.perCombo.values(), ...parallel.perCase.values(), ...parallel.perCombo.values()]) {
      if (!result || typeof result === 'string') throw new Error(String(result));
      const reaction = result.reactions.find(r => r.nodeId === bearing)!;
      expect(reaction.fx).toBeCloseTo(0, 9);
      expect(reaction.fz).toBeCloseTo(1, 9);
    }
  });
}

function localBearing(elementId: number | undefined): JSONModel {
  return {
    name: 'Local bearing fixture',
    materials: [], sections: [],
    nodes: [{ id: 11, x: 0, y: 0, z: 0 }, { id: 12, x: 1, y: 0, z: 0 }, { id: 13, x: 0, y: 0, z: 1 }],
    elements: [
      { id: 2, type: 'frame', nodeI: 11, nodeJ: 12, materialId: 1, sectionId: 1 },
      { id: 1, type: 'frame', nodeI: 11, nodeJ: 13, materialId: 1, sectionId: 1 },
    ],
    supports: [{ id: 41, nodeId: 11, type: 'spring3d', kx: 1, dofFrame: 'local', dofLocalElementId: elementId }],
    loads: [], plates: [], quads: [], constraints: [], loadCases: [], combinations: [],
  };
}

for (const mode of ['2d', '3d', 'pro'] as const) {
  it(`#2277 ${mode} fixture replay binds the local support to the replayed member`, async () => {
    uiStore.analysisMode = mode;
    const fixture = localBearing(1);
    await modelStore.loadExample(fixture.name, async () => fixture);
    const s = supportAt(1);
    expect(s.dofFrame).toBe('local');
    expect(s.dofLocalElementId).toBe(2);
    expect(modelStore.elements.get(s.dofLocalElementId!)!.nodeJ).toBe(3);
    expect(fixture.supports[0]!.dofLocalElementId).toBe(1);

    const member = s.dofLocalElementId!;
    const copy = copyTransformed({ nodes: [], elements: [member] }, [translation([3, 0, 0])], { withSupports: true });
    expect(supportAt(copy.maps[0]!.nodes.get(s.nodeId)!)).toMatchObject({
      dofFrame: 'local', dofLocalElementId: copy.maps[0]!.elements.get(member),
    });
    const missing = copyTransformed({ nodes: [s.nodeId], elements: [] }, [translation([5, 0, 0])], { withSupports: true });
    expect(missing.warnings.supportDropped).toBe(1);
  });
}

for (const reference of [undefined, 3]) {
  it(`#2277 fixture replay rejects an unresolved local member (${reference}) before edits`, async () => {
    const source = bearingModel();
    const api = modelStore.fixtureApi() as unknown as FixtureLoader;
    const fixture = localBearing(reference);
    expect(() => loadFixture(fixture, api)).toThrow(/support 41.*local.*element/i);
    expect([...modelStore.elements.keys()]).toEqual([source.member]);
    await expect(modelStore.loadExample(fixture.name, async () => fixture)).rejects.toThrow(/support 41.*local.*element/i);
    expect([...modelStore.elements.keys()]).toEqual([source.member]);
    expect(supportAt(source.bearing).type).toBe('rollerZ');
  });
}

for (const mode of ['3d', 'pro'] as const) {
  for (const type of ['spring3d', 'rollerY'] as const) {
    it(`#2277 ${mode} ${type} keeps axes supplied in the preset edit`, () => {
      const { fixed, bearing, member } = bearingModel();
      const other = modelStore.addElement(fixed, modelStore.addNode(0, 0, 2));
      uiStore.analysisMode = mode;
      const id = modelStore.addSupportEntry({
        nodeId: bearing, type: 'custom3d', dofFrame: 'local', dofLocalElementId: other, dofRestraints: noRestraints,
      });
      modelStore.updateSupport(id, { type, kx: 1, dofFrame: 'local', dofLocalElementId: member });
      expect(supportAt(bearing)).toMatchObject({ type, dofFrame: 'local', dofLocalElementId: member });
      modelStore.updateSupport(id, { angle: 5 });
      expect(supportAt(bearing)).toMatchObject({ dofFrame: 'local', dofLocalElementId: member });
      modelStore.updateSupport(id, { dofFrame: 'global' });
      expect(supportAt(bearing).dofFrame).toBe('global');
      expect(supportAt(bearing).dofLocalElementId).toBeUndefined();
    });
  }
}

for (const bulk of [false, true]) {
  it(`#2277 roller placement keeps axes explicitly supplied with the preset (bulk=${bulk})`, () => {
    const { bearing, member } = bearingModel();
    uiStore.analysisMode = 'pro';
    const axes = { dofFrame: 'local', dofLocalElementId: member } as const;
    if (bulk) modelStore.addSupports([bearing], 'rollerY', undefined, axes);
    else modelStore.addSupport(bearing, 'rollerY', undefined, axes);
    expect(supportAt(bearing)).toMatchObject(axes);
  });
}

for (const inPlace of [false, true]) {
  it(`#2277 a plane turn off the coordinate axes reports the unrepresentable bearing (in place=${inPlace})`, () => {
    const { bearing, member } = bearingModel();
    const set = { nodes: [], elements: [member] };
    const turn = rotation([0, 0, 0], [0, 0, 1], 45);
    const report = inPlace ? transformInPlace(set, turn) : copyTransformed(set, [turn], { withSupports: true });
    const target = 'maps' in report ? report.maps[0]!.nodes.get(bearing)! : bearing;
    expect(report.warnings.supportDropped).toBe(1);
    expect(supportAt(target)).toBeUndefined();
  });
}

const testMemberlessTurn = process.env.RUN_KNOWN_WRONG === '2277' ? it : it.skip;

for (const operation of ['copy', 'detached copy', 'in place'] as const) {
  testMemberlessTurn(`known wrong result: #2277 a memberless local plane roller turns with its node (${operation})`, async () => {
    const node = modelStore.addNode(2, 1);
    modelStore.addSupportEntry({ nodeId: node, type: 'rollerZ', isGlobal: false });
    const set = { nodes: [node], elements: [] };
    const turn = rotation([0, 0, 0], [0, 0, 1], 90);
    const report = operation === 'in place' ? transformInPlace(set, turn)
      : operation === 'copy' ? copyTransformed(set, [turn], { withSupports: true })
      : insertFragment(detach(fragmentOf(set, { withSupports: true })), [turn], { withSupports: true });
    expect(report.warnings.supportDropped).toBeUndefined();
    const bearing = 'maps' in report ? report.maps[0]!.nodes.get(node)! : node;
    if (bearing !== node) modelStore.removeNode(node);
    const tip = modelStore.nodes.get(bearing)!;
    const root = modelStore.addNode(tip.x - 2, tip.y);
    modelStore.addSupportEntry({ nodeId: root, type: 'fixed' });
    modelStore.addElement(root, bearing);
    modelStore.addNodalLoad(bearing, 1, -1);
    const m = modelStore.model;

    const direct = validateAndSolve2D(m);
    const asyncDirect = await validateAndSolve2DAsync(m);
    const cases = solveCombinations2D(m, [loadCase], [combination]);
    if (!cases || typeof cases === 'string') throw new Error(String(cases));
    expect(cases.perCase.size).toBe(1);
    expect(cases.perCombo.size).toBe(1);
    const input = buildSolverInput2D(m);
    if (!input) throw new Error('Expected a plane solver input');
    const secondOrder: PDeltaResult = solvePDelta(input);
    expect(secondOrder.isStable).toBe(true);
    expect(secondOrder.iterations).toBeGreaterThan(0);
    for (const result of [direct, asyncDirect, ...cases.perCase.values(), ...cases.perCombo.values(), secondOrder.results]) {
      if (!result || typeof result === 'string') throw new Error(String(result));
      const reaction = result.reactions.find(r => r.nodeId === bearing)!;
      expect.soft(reaction.rx).toBeCloseTo(0, 9);
      expect.soft(reaction.rz).toBeCloseTo(1, 9);
    }
    const embedded = validateAndSolve3D(m);
    if (!embedded || typeof embedded === 'string') throw new Error(String(embedded));
    const reaction = embedded.reactions.find(r => r.nodeId === bearing)!;
    expect.soft(reaction.fx).toBeCloseTo(0, 9);
    expect.soft(reaction.fz).toBeCloseTo(1, 9);
  });
}

it('#2277 a rigidly carried member still defines its local plane roller axis', () => {
  const root = modelStore.addNode(0, 0);
  const bearing = modelStore.addNode(2, 0);
  const member = modelStore.addElement(root, bearing);
  modelStore.addSupportEntry({ nodeId: root, type: 'fixed' });
  modelStore.addSupportEntry({ nodeId: bearing, type: 'rollerZ', isGlobal: false });
  const report = transformInPlace({ nodes: [], elements: [member] }, rotation([0, 0, 0], [0, 0, 1], 90));
  expect(report.warnings.supportDropped).toBeUndefined();
  modelStore.addNodalLoad(bearing, 1, 1);
  const result = validateAndSolve2D(modelStore.model);
  if (!result || typeof result === 'string') throw new Error(String(result));
  expect(result.reactions.find(r => r.nodeId === bearing)!.rx).toBeCloseTo(0, 9);
  expect(result.reactions.find(r => r.nodeId === bearing)!.rz).toBeCloseTo(-1, 9);
});
