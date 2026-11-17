import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { modelStore, uiStore } from '..';
import { whatIf } from '../whatif.svelte';
import { copySelection, paste } from '../model-clipboard';
import { hasNonlinearBehaviour } from '../../engine/member-behaviour';
import {
  solveCombinations3D, solveCombinations3DParallel,
  validateAndSolve2D, validateAndSolve3D, validateAndSolve3DAsync,
} from '../../engine/solver-service';

const regression = process.env.RUN_KNOWN_WRONG === '2277' ? it : it.skip;
const vertical = { tx: false, ty: false, tz: true, rx: false, ry: false, rz: false };
const horizontal = { ...vertical, tx: true, tz: false };
const bearingRestraints = { ...vertical, tx: true };
const loadCase = { id: 1, type: 'D' as const, name: 'Applied load' };
const combination = { id: 1, name: 'Applied load only', factors: [{ caseId: loadCase.id, factor: 1 }] };

beforeEach(() => {
  uiStore.analysisMode = '2d';
  uiStore.useNative3DPresentation();
  uiStore.includeSelfWeight = false;
  modelStore.clear();
});

afterEach(() => {
  whatIf.abandon();
  vi.useRealTimers();
});

function localBearing(type: 'rollerXY' | 'rollerY' = 'rollerXY') {
  uiStore.analysisMode = '3d';
  const base = modelStore.addNode(0, 0, 0);
  const node = modelStore.addNode(0, 0, 2);
  const member = modelStore.addElement(base, node);
  const fixed = modelStore.addSupportEntry({ nodeId: base, type: 'fixed3d' });
  const id = modelStore.addSupportEntry({
    nodeId: node, type, dofRestraints: bearingRestraints,
    dofFrame: 'local', dofLocalElementId: member,
  });
  modelStore.addNodalLoad3D(node, 1, 0, 0, 0, 0, 0, loadCase.id);
  return { id, node, member, fixed };
}

function planeBearing(type: 'rollerY' | 'rollerZ', explicit: boolean) {
  const base = modelStore.addNode(0, 0);
  const node = modelStore.addNode(2, 1);
  const member = modelStore.addElement(base, node);
  modelStore.addSupportEntry({ nodeId: base, type: 'fixed' });
  const id = modelStore.addSupportEntry({
    nodeId: node, type,
    ...(explicit ? { dofRestraints: vertical, dofFrame: 'local', dofLocalElementId: member } as const : {}),
  });
  modelStore.addNodalLoad(node, 1, 0);
  return { id, node, member };
}

function reactionX(node: number): number {
  const result = validateAndSolve3D(modelStore.model);
  if (!result || typeof result === 'string') throw new Error(String(result));
  return result.reactions.find(r => r.nodeId === node)!.fx;
}

for (const mode of ['3d', 'pro'] as const) {
  for (const nonlinear of [false, true]) {
    regression(`known wrong result: #2277 unchanged roller with settlement in ${mode}, nonlinear=${nonlinear}`, async () => {
      const { id, node, member, fixed } = localBearing();
      uiStore.analysisMode = mode;
      if (nonlinear) modelStore.updateSupport(fixed, { uplift: true });
      const model = modelStore.model;
      expect(hasNonlinearBehaviour(model)).toBe(nonlinear);
      expect(reactionX(node)).toBeCloseTo(-1, 9);

      const dz = -0.001;
      const edit = () => modelStore.updateSupport(id, { type: 'rollerXY', dz });
      if (mode === 'pro') modelStore.batch(edit);
      else edit();

      const direct = validateAndSolve3D(model);
      const asyncDirect = await validateAndSolve3DAsync(model);
      const cases = solveCombinations3D(model, [loadCase], [combination]);
      const parallel = await solveCombinations3DParallel(model, [loadCase], [combination]);
      if (!cases || typeof cases === 'string') throw new Error(String(cases));
      if (!parallel || typeof parallel === 'string') throw new Error(String(parallel));
      for (const result of [
        direct, asyncDirect, cases.perCase.get(loadCase.id), cases.perCombo.get(combination.id),
        parallel.perCase.get(loadCase.id), parallel.perCombo.get(combination.id),
      ]) {
        if (!result || typeof result === 'string') throw new Error(String(result));
        expect(result.reactions.find(r => r.nodeId === node)!.fx).toBeCloseTo(-1, 9);
      }
      expect(modelStore.supports.get(id)).toMatchObject({
        type: 'rollerXY', dz, dofRestraints: bearingRestraints, dofFrame: 'local', dofLocalElementId: member,
      });
    });
  }
}

regression('known wrong result: #2277 the same recorded plane type accepts a replacement mask and keeps its axes', () => {
  const { id, member } = planeBearing('rollerY', true);
  modelStore.updateSupport(id, { type: 'rollerY', dofRestraints: horizontal });
  expect(modelStore.supports.get(id)).toMatchObject({
    type: 'rollerY', dofRestraints: horizontal, dofFrame: 'local', dofLocalElementId: member,
  });
  modelStore.updateSupport(id, { type: 'rollerY', dofRestraints: vertical, dofFrame: 'global' });
  expect(modelStore.supports.get(id)).toMatchObject({ type: 'rollerY', dofRestraints: vertical, dofFrame: 'global' });
  expect(modelStore.supports.get(id)!.dofLocalElementId).toBeUndefined();
});

regression('known wrong result: #2277 resubmitting a standing plane roller keeps the embedded answer', () => {
  const { id, node } = planeBearing('rollerZ', false);
  const plane = validateAndSolve2D(modelStore.model);
  if (!plane || typeof plane === 'string') throw new Error(String(plane));
  expect(plane.reactions.find(r => r.nodeId === node)!.rx).toBeCloseTo(-1, 9);
  uiStore.analysisMode = '3d';
  uiStore.useUpright2DIn3DPresentation();
  expect(reactionX(node)).toBeCloseTo(-1, 9);
  const dx = 0.001;
  modelStore.updateSupport(id, { dx });
  const settledReaction = reactionX(node);
  expect(settledReaction).not.toBeCloseTo(-1, 9);
  modelStore.updateSupport(id, { dx: 0 });
  modelStore.updateSupport(id, { type: 'rollerZ', dx });
  expect(reactionX(node)).toBeCloseTo(settledReaction, 9);
  expect(uiStore.viewportPresentation3D).toBe('upright2dIn3d');
  expect(modelStore.supports.get(id)).toMatchObject({ type: 'rollerZ', dx });
  expect(modelStore.supports.get(id)!.dofRestraints).toBeUndefined();
});

for (const type of ['rollerXY', 'rollerY'] as const) {
  regression(`known wrong result: #2277 Explore preserves the original bearing when ${type} is resubmitted`, () => {
    const { id, node, member } = localBearing(type);
    expect(reactionX(node)).toBeCloseTo(-1, 9);
    vi.useFakeTimers();
    whatIf.open();
    whatIf.setSupportType(id, type);
    vi.advanceTimersByTime(61);
    expect(reactionX(node)).toBeCloseTo(-1, 9);
    expect(modelStore.supports.get(id)).toMatchObject({
      type, dofRestraints: bearingRestraints, dofFrame: 'local', dofLocalElementId: member,
    });
  });
}

regression('known wrong result: #2277 changing a preset in Explore resets the mask and local axes', () => {
  const { id, node } = localBearing();
  vi.useFakeTimers();
  whatIf.open();
  whatIf.setSupportType(id, 'rollerYZ');
  vi.advanceTimersByTime(61);
  const edited = modelStore.supports.get(id)!;
  expect(edited).toMatchObject({ type: 'rollerYZ', dofRestraints: horizontal, dofFrame: 'global' });
  expect(edited.dofLocalElementId).toBeUndefined();
  expect(reactionX(node)).toBeCloseTo(-1, 9);
});

it('#2277 clipboard paste preserves the explicit mask and remaps its local member', () => {
  const { member } = localBearing();
  uiStore.setSelection(new Set(), new Set([member]), false);
  expect(copySelection()).toBe(true);
  modelStore.clear();
  const unusedBase = modelStore.addNode(4, 0, 0);
  const unusedEnd = modelStore.addNode(4, 0, 2);
  const unusedMember = modelStore.addElement(unusedBase, unusedEnd);
  modelStore.deleteEntities({ elements: [unusedMember], nodes: [unusedBase, unusedEnd] });
  expect(paste(true)).toBe(true);
  const bearing = [...modelStore.supports.values()].find(s => s.type === 'rollerXY')!;
  const copiedMember = [...modelStore.elements.values()].find(e => e.nodeJ === bearing.nodeId)!;
  expect(copiedMember.id).not.toBe(member);
  expect(bearing).toMatchObject({
    dofRestraints: bearingRestraints, dofFrame: 'local', dofLocalElementId: copiedMember.id,
  });
  expect(reactionX(bearing.nodeId)).toBeCloseTo(-1, 9);
});
