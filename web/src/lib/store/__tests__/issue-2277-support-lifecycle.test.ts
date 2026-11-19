import { beforeEach, expect, it } from 'vitest';
import { modelStore, uiStore } from '..';
import type { Support } from '../model.svelte';
import { imposedUnsupported } from '../../engine/case-displacements';
import { hasNonlinearBehaviour } from '../../engine/member-behaviour';
import { buildSolverInput3D, solveCombinations2D, solveCombinations3D, solveCombinations3DParallel, validateAndSolve2D, validateAndSolve3D, validateAndSolve3DAsync } from '../../engine/solver-service';
import { translation, rotation } from '../../model/edit/affine';
import { copyTransformed } from '../../model/edit/transformed-copy';
import { transformInPlace } from '../../model/edit/transform-in-place';
import { loadFixture, type JSONModel } from '../../templates/load-fixture';
import beamFixture from '../../templates/fixtures/rc-beam-flexure.json';
import portalFixture from '../../templates/fixtures/portal-frame-braced.json';

const ambiguous = /rollerZ.*ambiguous.*explicit/i;
const verticalSlider = { tx: true, ty: true, tz: false, rx: false, ry: false, rz: true };
const fixed = { rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true };

function supportAt(nodeId: number): Support {
  return [...modelStore.supports.values()].find(s => s.nodeId === nodeId)!;
}

function bareBeam(): JSONModel {
  return {
    ...beamFixture as JSONModel,
    supports: beamFixture.supports.map(({ id, nodeId, type }) => ({ id, nodeId, type: type === 'rollerZ' ? type : 'fixed3d' })),
  };
}

function recordedPortal(): JSONModel {
  return {
    ...portalFixture as JSONModel,
    supports: portalFixture.supports.map(({ id, nodeId, type }) => ({ id, nodeId, type })),
  };
}

beforeEach(() => {
  uiStore.analysisMode = 'pro';
  uiStore.includeSelfWeight = false;
  modelStore.clear();
});

for (const path of ['single', 'bulk', 'record', 'edit'] as const) {
  it(`#2277 a bare rollerZ stays unresolved through ${path}`, async () => {
    await modelStore.loadExample('rc-beam-flexure');
    const node = 3;
    const id = path === 'single' ? modelStore.addSupport(node, 'rollerZ')
      : path === 'bulk' ? modelStore.addSupports([node], 'rollerZ')[0]!
      : path === 'record' ? modelStore.addSupportEntry({ nodeId: node, type: 'rollerZ' })
      : supportAt(node).id;
    if (path === 'edit') {
      modelStore.updateSupport(id, { type: 'rollerY' });
      modelStore.updateSupport(id, { type: 'rollerZ' });
    }
    expect(modelStore.supports.get(id)!.type).toBe('rollerZ');
    expect(modelStore.supports.get(id)!.dofRestraints).toBeUndefined();
    expect(() => buildSolverInput3D(modelStore.model)).toThrow(ambiguous);
    modelStore.updateSupport(id, { dofRestraints: verticalSlider });
    expect(buildSolverInput3D(modelStore.model)!.supports.get(node)).toMatchObject({ rz: false });
  });
}

for (const operation of ['translate copy', 'rotate copy', 'rotate in place'] as const) {
  it(`#2277 ${operation} carries unresolved supports to the solver refusal`, async () => {
    await modelStore.loadExample('rc-beam-flexure');
    const original = supportAt(3);
    modelStore.model.supports.set(original.id, { id: original.id, nodeId: original.nodeId, type: 'rollerZ' });
    const transform = operation === 'translate copy' ? translation([0, 2, 0]) : rotation([0, 2, 0], [0, 0, 1], 90);
    const source = { nodes: [original.nodeId], elements: [] };
    let node = original.nodeId;
    if (operation === 'rotate in place') {
      transformInPlace(source, transform);
    } else {
      const copy = copyTransformed({ nodes: [], elements: [...modelStore.elements.keys()] }, [transform], { withSupports: true });
      node = copy.maps[0]!.nodes.get(original.nodeId)!;
      modelStore.removeSupport(original.id);
    }
    expect(supportAt(node).type).toBe('rollerZ');
    expect(supportAt(node).dofRestraints).toBeUndefined();
    expect(() => buildSolverInput3D(modelStore.model)).toThrow(ambiguous);
  });
}

for (const nonlinear of [false, true]) {
  it(`#2277 selecting fixed3d restrains every DOF nonlinear=${nonlinear}`, async () => {
    await modelStore.loadExample('rc-beam-flexure');
    const id = modelStore.addSupport(3, 'rollerYZ');
    modelStore.updateSupport(id, { type: 'fixed3d' });
    if (nonlinear) modelStore.updateSupport(supportAt(1).id, { uplift: true });
    const m = modelStore.model;
    expect(hasNonlinearBehaviour(m)).toBe(nonlinear);
    expect(supportAt(3).dofRestraints).toBeUndefined();
    expect(buildSolverInput3D(m)!.supports.get(3)).toMatchObject(fixed);
    m.loads = [];
    const force = 1;
    modelStore.addNodalLoad3D(3, 0, 0, -force, 0, 0, 0);
    const result = validateAndSolve3D(m);
    if (!result || typeof result === 'string') throw new Error(String(result));
    expect(result.reactions.find(r => r.nodeId === 3)!.fz).toBeCloseTo(force, 9);
  });
}

for (const type of ['fixed3d', 'pinned3d', 'spring3d', 'rollerY', 'rollerXY'] as const) {
  it(`#2277 ${type} replaces a rotated local restraint definition`, async () => {
    await modelStore.loadExample('3d-portal-frame');
    const member = [...modelStore.elements.values()].find(e => modelStore.nodes.get(e.nodeI)!.x === modelStore.nodes.get(e.nodeJ)!.x)!;
    const node = member.nodeI;
    const id = modelStore.addSupportEntry({
      nodeId: node, type: 'custom3d', dofFrame: 'local', dofLocalElementId: member.id, dofRestraints: verticalSlider,
    });
    modelStore.updateSupport(id, { type });
    const support = supportAt(node);
    expect(support.dofFrame).toBe(type.startsWith('roller') ? 'global' : undefined);
    expect(support.dofLocalElementId).toBeUndefined();
    const load = { type: 'displacement3d' as const, data: { id: 1, nodeId: node, dz: 1 } };
    expect(imposedUnsupported(modelStore.supports, [load])).toEqual(type === 'spring3d' ? [{ loadId: 1, nodeId: node, field: 'dz' }] : []);
    modelStore.updateSupport(id, { type: 'custom3d', dofRestraints: verticalSlider, dofFrame: 'local', dofLocalElementId: member.id });
    expect(supportAt(node)).toMatchObject({ dofRestraints: verticalSlider, dofFrame: 'local', dofLocalElementId: member.id });
    modelStore.updateSupport(id, { type, dofRestraints: verticalSlider });
    expect(supportAt(node).dofRestraints).toEqual(verticalSlider);
    expect(supportAt(node).dofFrame).toBeUndefined();
    expect(supportAt(node).dofLocalElementId).toBeUndefined();
  });
}

for (const mode of ['3d', 'pro'] as const) {
  for (const nonlinear of [false, true]) {
    for (const entry of ['input', 'sync', 'async', 'combinations', 'parallel'] as const) {
      it(`#2277 recorded bare bearing refuses through ${mode} ${entry} nonlinear=${nonlinear}`, async () => {
        uiStore.analysisMode = mode;
        await modelStore.loadExample('rc-beam-flexure', async () => bareBeam());
        const m = modelStore.model;
        if (nonlinear) modelStore.updateSupport(supportAt(1).id, { uplift: true });
        expect(hasNonlinearBehaviour(m)).toBe(nonlinear);
        const solve = async () => entry === 'sync' ? validateAndSolve3D(m)
          : entry === 'async' ? validateAndSolve3DAsync(m)
          : entry === 'combinations' ? solveCombinations3D(m, m.loadCases, m.combinations)
          : solveCombinations3DParallel(m, m.loadCases, m.combinations);
        if (entry === 'input') expect(() => buildSolverInput3D(m)).toThrow(ambiguous);
        else expect(await solve()).toMatch(ambiguous);
        modelStore.updateSupport(supportAt(3).id, { dofRestraints: verticalSlider });
        if (entry === 'input') expect(buildSolverInput3D(m)!.supports.get(3)).toMatchObject({ rz: false });
        else {
          const result = await solve();
          if (!result || typeof result === 'string') throw new Error(String(result));
          const answers = 'perCase' in result ? [...result.perCase.values(), ...result.perCombo.values()] : [result];
          expect(answers.length).toBeGreaterThan(0);
          for (const answer of answers) expect(answer.reactions.find(r => r.nodeId === 3)!.fz).toBeCloseTo(0, 9);
        }
      });
    }
  }
}

it('#2277 replay in the upright workspace leaves geometry and its loads in recorded coordinates', async () => {
  await modelStore.loadExample('portal-frame-braced');
  expect(uiStore.viewportPresentation3D).toBe('upright2dIn3d');
  const nodes = [...modelStore.nodes.values()].map(n => ({ ...n }));
  const supports = [...modelStore.supports.values()].map(s => ({ ...s }));
  const loads = JSON.parse(JSON.stringify(modelStore.loads));
  loadFixture(recordedPortal(), modelStore.fixtureApi() as never);
  expect(uiStore.viewportPresentation3D).toBe('upright2dIn3d');
  expect([...modelStore.nodes.values()].slice(0, nodes.length)).toEqual(nodes);
  expect([...modelStore.supports.values()].slice(0, supports.length)).toEqual(supports);
  expect(modelStore.loads.slice(0, loads.length)).toEqual(loads);
  expect(modelStore.loads.slice(loads.length).map(l => l.type)).toEqual(portalFixture.loads.map(l => l.type));
  expect([...modelStore.nodes.values()].slice(nodes.length).map(n => [n.x, n.y, n.z ?? 0])).toEqual(portalFixture.nodes.map(n => [n.x, n.y, n.z]));
  expect(supportAt(portalFixture.supports.find(s => s.type === 'rollerZ')!.nodeId + nodes.length).dofRestraints).toBeUndefined();
});

it('#2277 a recorded plane roller retains its plane and embedded answers', async () => {
  uiStore.analysisMode = '2d';
  await modelStore.loadExample('portal-frame-braced', async () => recordedPortal());
  const m = modelStore.model;
  const roller = [...m.supports.values()].find(s => s.type === 'rollerZ')!;
  expect(roller.dofRestraints).toBeUndefined();
  const direct = validateAndSolve2D(m);
  const combinations = solveCombinations2D(m, m.loadCases, m.combinations);
  if (!direct || typeof direct === 'string') throw new Error(String(direct));
  if (!combinations || typeof combinations === 'string') throw new Error(String(combinations));
  expect(combinations.perCombo.size).toBe(m.combinations.length);
  for (const result of [direct, ...combinations.perCase.values(), ...combinations.perCombo.values()]) {
    expect(result.reactions.find(r => r.nodeId === roller.nodeId)!.rz).toBeCloseTo(0, 9);
  }
  uiStore.analysisMode = '3d';
  const embedded = validateAndSolve3D(m);
  if (!embedded || typeof embedded === 'string') throw new Error(String(embedded));
  for (const r of direct.reactions) {
    const spatial = embedded.reactions.find(s => s.nodeId === r.nodeId)!;
    expect(spatial.fx).toBeCloseTo(r.rx, 9);
    expect(spatial.fz).toBeCloseTo(r.rz, 9);
    expect(spatial.my).toBeCloseTo(-r.my, 9);
  }
});

const issue2304 = process.env.RUN_KNOWN_WRONG === '2304' ? it : it.skip;
const yRoller = { tx: true, ty: false, tz: true, rx: true, ry: true, rz: false };
const loadCase = { id: 1, type: 'D' as const, name: 'Applied load' };
const combination = { id: 1, name: 'Applied load only', factors: [{ caseId: loadCase.id, factor: 1 }] };
const appliedZ = -1;

function nativeBearing(nonlinear = false) {
  const root = modelStore.addNode(0, 0, 0);
  const tip = modelStore.addNode(4, 0, 0);
  modelStore.addElement(root, tip);
  modelStore.addSupportEntry({ nodeId: root, type: 'fixed3d', ...(nonlinear ? { uplift: true } : {}) });
  const id = modelStore.addSupportEntry({ nodeId: tip, type: 'rollerY', dofRestraints: yRoller });
  modelStore.addNodalLoad3D(tip, 0, 0, appliedZ, 0, 0, 0, loadCase.id);
  return { tip, id };
}

function tipReaction(tip: number): number {
  const solved = validateAndSolve3D(modelStore.model);
  if (!solved || typeof solved === 'string') throw new Error(String(solved));
  return solved.reactions.find(reaction => reaction.nodeId === tip)?.fz ?? 0;
}

issue2304('known wrong result: #2304 a native Y roller survives a snapshot and can be edited to release global Z', () => {
  const { tip, id } = nativeBearing();
  expect(supportAt(tip).type).toBe('rollerY');
  expect(tipReaction(tip)).toBeCloseTo(-appliedZ, 12);
  const snapshot = modelStore.snapshot();
  expect.soft(new Map(snapshot.supports).get(id)?.type).toBe('rollerY');
  modelStore.restore(JSON.parse(JSON.stringify(snapshot)));
  expect.soft(supportAt(tip).type).toBe('rollerY');
  modelStore.updateSupport(id, { type: 'rollerZ' });
  expect.soft(validateAndSolve3D(modelStore.model)).toMatch(ambiguous);
  modelStore.updateSupport(id, { type: 'rollerZ', dofRestraints: verticalSlider });
  expect(tipReaction(tip)).toBeCloseTo(0, 12);
});

for (const nonlinear of [false, true]) {
  issue2304(`known wrong result: #2304 a type-only Z edit refuses an old relabelled snapshot (nonlinear=${nonlinear})`, async () => {
    const { tip, id } = nativeBearing(nonlinear);
    const snapshot = modelStore.snapshot();
    snapshot.supports = snapshot.supports.map(([key, support]) =>
      [key, key === id ? { ...support, type: 'rollerZ' } : support]);
    modelStore.restore(snapshot);
    expect(hasNonlinearBehaviour(modelStore.model)).toBe(nonlinear);
    expect(tipReaction(tip)).toBeCloseTo(-appliedZ, 12);
    modelStore.updateSupport(id, { type: 'rollerZ' });
    const model = modelStore.model;
    expect.soft(() => buildSolverInput3D(model)).toThrow(ambiguous);
    expect.soft(validateAndSolve3D(model)).toMatch(ambiguous);
    expect.soft(await validateAndSolve3DAsync(model)).toMatch(ambiguous);
    expect.soft(solveCombinations3D(model, [loadCase], [combination])).toMatch(ambiguous);
    expect.soft(await solveCombinations3DParallel(model, [loadCase], [combination])).toMatch(ambiguous);
    modelStore.updateSupport(id, { type: 'rollerZ', dofRestraints: verticalSlider });
    modelStore.updateSupport(id, { type: 'rollerZ' });
    expect(tipReaction(tip)).toBeCloseTo(0, 12);
  });
}

it('#2304 a recorded plane Y alias keeps its plane reaction after snapshot replay', () => {
  uiStore.analysisMode = '2d';
  const root = modelStore.addNode(0, 0);
  const tip = modelStore.addNode(4, 0);
  modelStore.addElement(root, tip);
  modelStore.addSupportEntry({ nodeId: root, type: 'fixed' });
  modelStore.addSupportEntry({ nodeId: tip, type: 'rollerY' });
  modelStore.addNodalLoad(tip, appliedZ, 0);
  modelStore.restore(modelStore.snapshot());
  const result = validateAndSolve2D(modelStore.model);
  if (!result || typeof result === 'string') throw new Error(String(result));
  expect(result.reactions.find(r => r.nodeId === tip)?.rx).toBeCloseTo(-appliedZ, 12);
});
