import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  buildSolverInput2D, solveCombinations2D, validateAndSolve2D, validateAndSolve2DAsync, validateAndSolve3D,
} from '../../engine/solver-service';
import { solvePDelta } from '../../engine/wasm-solver';
import { translation } from '../../model/edit/affine';
import { detach, fragmentOf } from '../../model/edit/fragment';
import { copyTransformed, insertFragment } from '../../model/edit/transformed-copy';
import { historyStore } from '../history.svelte';
import { copySelection, paste } from '../model-clipboard';
import { modelStore } from '../model.svelte';
import { placementStore } from '../placement.svelte';
import { uiStore } from '../ui.svelte';

const withSupports = { withSupports: true };
const weld = translation([4, 0, 0]);
const force = 1;
const caseId = 1;

beforeEach(() => {
  uiStore.analysisMode = '2d';
  uiStore.useNative3DPresentation();
  uiStore.includeSelfWeight = false;
  modelStore.clear();
});

afterEach(() => placementStore.cancel());

function source() {
  const root = modelStore.addNode(0, 0);
  const bearing = modelStore.addNode(0, 2);
  const member = modelStore.addElement(root, bearing);
  modelStore.addSupportEntry({ nodeId: root, type: 'fixed' });
  modelStore.addSupportEntry({ nodeId: bearing, type: 'rollerZ', isGlobal: false });
  return { bearing, root, set: { nodes: [], elements: [member] } };
}

function destination(x: number, local = true, sourceRoot?: number) {
  const bearing = modelStore.addNode(x, 2);
  const root = modelStore.addNode(x + 2, 2);
  modelStore.addElement(root, bearing);
  modelStore.addSupportEntry({ nodeId: root, type: 'fixed' });
  if (sourceRoot !== undefined) modelStore.addElement(sourceRoot, root);
  modelStore.addSupportEntry({ nodeId: bearing, type: 'rollerX', isGlobal: !local });
  modelStore.addNodalLoad(bearing, 0, -force, 0, caseId);
  return bearing;
}

async function expectVerticalReaction(bearing: number) {
  const input = buildSolverInput2D(modelStore.model);
  if (!input || typeof input === 'string') throw new Error(String(input));
  const secondOrder = solvePDelta(input);
  expect(secondOrder.isStable).toBe(true);
  const cases = solveCombinations2D(modelStore.model, [{ id: caseId, name: 'Unit load', type: 'D' }], [
    { id: 1, name: 'Unit load only', factors: [{ caseId, factor: 1 }] },
  ]);
  if (!cases || typeof cases === 'string') throw new Error(String(cases));
  expect(cases.perCase.size).toBe(1);
  expect(cases.perCombo.size).toBe(1);
  const results = [
    validateAndSolve2D(modelStore.model), await validateAndSolve2DAsync(modelStore.model),
    ...cases.perCase.values(), ...cases.perCombo.values(), secondOrder.results,
  ];
  for (const result of results) {
    if (!result || typeof result === 'string') throw new Error(String(result));
    const reaction = result.reactions.find(r => r.nodeId === bearing);
    expect.soft(reaction?.rx).toBeCloseTo(0, 12);
    expect.soft(reaction?.rz).toBeCloseTo(force, 12);
  }
}

const issue2294Weld = process.env.RUN_KNOWN_WRONG === '2294' ? it : it.skip;

for (const entry of ['copy', 'detached insertion', 'clipboard placement', 'paste in place'] as const) {
  issue2294Weld(`known wrong result: #2294 refuses a complete vertical roller copied onto a horizontal bearing (${entry})`, async () => {
    const { set, root } = source();
    const detached = detach(fragmentOf(set, withSupports));
    if (entry.startsWith('clipboard') || entry === 'paste in place') {
      uiStore.setSelection(new Set(), new Set(set.elements), false);
      expect(copySelection()).toBe(true);
    }
    if (entry === 'paste in place') modelStore.clear();
    const inPlace = entry === 'paste in place';
    const bearing = inPlace ? destination(0) : destination(4, true, root);
    await expectVerticalReaction(bearing);
    historyStore.clear();
    const before = modelStore.snapshot();
    const version = modelStore.modelVersion;
    if (entry === 'copy') {
      expect.soft(copyTransformed(set, [weld], withSupports).refused).toBe('changedSupportFrame');
    } else if (entry === 'detached insertion') {
      expect.soft(insertFragment(detached, [weld], withSupports).refused).toBe('changedSupportFrame');
    } else if (entry === 'clipboard placement') {
      expect(paste(false)).toBe(true);
      const [x, y, z] = placementStore.anchor;
      expect.soft(placementStore.commitAt([x + 4, y, z])?.refused).toBe('changedSupportFrame');
      expect.soft(placementStore.active).toBe(true);
    } else {
      expect.soft(paste(true)).toBe(false);
    }
    expect.soft(uiStore.toasts.at(-1)).toMatchObject({ type: 'error' });
    expect.soft(modelStore.snapshot()).toEqual(before);
    expect.soft(modelStore.modelVersion).toBe(version);
    expect.soft(historyStore.undoCount).toBe(0);
    await expectVerticalReaction(bearing);
  });
}

issue2294Weld('known wrong result: #2294 refuses a change to a destination roller when copying geometry alone', () => {
  const { set } = source();
  destination(4);
  const before = modelStore.snapshot();
  expect.soft(copyTransformed(set, [weld]).refused).toBe('changedSupportFrame');
  expect(modelStore.snapshot()).toEqual(before);
});

issue2294Weld('known wrong result: #2294 refuses welding a carried local roller onto an unsupported horizontal member', () => {
  const { set } = source();
  const bearing = modelStore.addNode(4, 2);
  modelStore.addElement(bearing, modelStore.addNode(6, 2));
  const before = modelStore.snapshot();
  expect.soft(copyTransformed(set, [weld], withSupports).refused).toBe('changedSupportFrame');
  expect(modelStore.snapshot()).toEqual(before);
});

issue2294Weld('known wrong result: #2294 refuses when the other end of a bearing member welds off its transformed axis', () => {
  const { set } = source();
  const weldTol = 0.01;
  modelStore.addNode(4 + weldTol / 2, 0);
  const before = modelStore.snapshot();
  expect.soft(copyTransformed(set, [weld], { ...withSupports, weldTol }).refused).toBe('changedSupportFrame');
  expect(modelStore.snapshot()).toEqual(before);
});

issue2294Weld('known wrong result: #2294 refuses a repeat when a later copy changes the frame of an earlier copy', () => {
  const { set } = source();
  const horizontal = { A: [0, 1, 0, -1, 0, 0, 0, 0, 1], t: [2, 2, 0] } as const;
  const before = modelStore.snapshot();
  expect.soft(copyTransformed(set, [weld, { A: [...horizontal.A], t: [...horizontal.t] }], withSupports).refused).toBe('changedSupportFrame');
  expect(modelStore.snapshot()).toEqual(before);
});

issue2294Weld('known wrong result: #2294 refuses links that change the roller frame', () => {
  const { set } = source();
  const before = modelStore.snapshot();
  const link = { type: 'frame' as const, materialId: 1, sectionId: 1 };
  expect.soft(copyTransformed(set, [weld], { ...withSupports, link }).refused).toBe('changedSupportFrame');
  expect(modelStore.snapshot()).toEqual(before);
});

it('#2294 leaves a roller frame intact when its member end falls outside the weld tolerance', () => {
  const { set } = source();
  const weldTol = 0.01;
  modelStore.addNode(4 + 2 * weldTol, 0);
  const report = copyTransformed(set, [weld], { ...withSupports, weldTol });
  expect(report).toMatchObject({ welded: 0, elements: [expect.any(Number)] });
  expect(report.refused).toBeUndefined();
});

it('#2294 permits duplicate and same-direction welds at a local roller', async () => {
  const { bearing, root, set } = source();
  modelStore.addNodalLoad(bearing, 0, -force, 0, caseId);
  const duplicate = copyTransformed(set, [translation([0, 0, 0])], withSupports);
  expect(duplicate).toMatchObject({ welded: 2, duplicates: 1, elements: [] });
  expect(duplicate.refused).toBeUndefined();

  const extraRoot = modelStore.addNode(-4, -1);
  const extra = modelStore.addElement(extraRoot, modelStore.addNode(-4, 2));
  modelStore.addElement(root, extraRoot);
  const sameDirection = copyTransformed({ nodes: [], elements: [extra] }, [weld]);
  expect(sameDirection.welded).toBe(1);
  expect(sameDirection.elements).toHaveLength(1);
  expect(sameDirection.refused).toBeUndefined();
  await expectVerticalReaction(bearing);
});

it('#2294 permits a weld onto a global roller with a unit vertical reaction', async () => {
  const { set, root } = source();
  const bearing = destination(4, false, root);
  const report = copyTransformed(set, [weld]);
  expect(report.welded).toBe(1);
  expect(report.elements).toHaveLength(1);
  expect(report.refused).toBeUndefined();
  await expectVerticalReaction(bearing);
});

it('#2294 permits a spatial weld at a roller with explicit global restraints', () => {
  uiStore.analysisMode = '3d';
  uiStore.useNative3DPresentation();
  const bearing = modelStore.addNode(4, 0, 2);
  const root = modelStore.addNode(6, 0, 2);
  modelStore.addElement(root, bearing);
  modelStore.addSupportEntry({ nodeId: root, type: 'fixed3d' });
  modelStore.addSupportEntry({
    nodeId: bearing, type: 'custom3d', dofFrame: 'global',
    dofRestraints: { tx: false, ty: false, tz: true, rx: false, ry: false, rz: false },
  });
  const sourceRoot = modelStore.addNode(0, 0, 0);
  const member = modelStore.addElement(sourceRoot, modelStore.addNode(0, 0, 2));
  modelStore.addElement(sourceRoot, root);
  const report = copyTransformed({ nodes: [], elements: [member] }, [weld]);
  expect(report.welded).toBe(1);
  expect(report.elements).toHaveLength(1);
  expect(report.refused).toBeUndefined();
  modelStore.addNodalLoad3D(bearing, 0, 0, -force, 0, 0, 0);
  const result = validateAndSolve3D(modelStore.model);
  if (!result || typeof result === 'string') throw new Error(String(result));
  expect(result.reactions.find(r => r.nodeId === bearing)?.fz).toBeCloseTo(force, 12);
});
