import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  buildSolverInput2D, solveCombinations2D, validateAndSolve2D, validateAndSolve2DAsync, validateAndSolve3D,
} from '../../engine/solver-service';
import { solvePDelta } from '../../engine/wasm-solver';
import type { Reaction } from '../../engine/types';
import { t } from '../../i18n';
import { compose, reflection, rotation, translation } from '../../model/edit/affine';
import { detach, fragmentOf, fragmentFromMembers } from '../../model/edit/fragment';
import { mirrorSelectionInPlace, rotateSelectionInPlace, transformInPlace } from '../../model/edit/transform-in-place';
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
  for (const toast of uiStore.toasts) uiStore.dismissToast(toast.id);
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

async function expectPlaneReaction(bearing: number, rx = 0, rz = force) {
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
    const reaction = result.reactions.find((r: Reaction) => r.nodeId === bearing);
    expect.soft(reaction?.rx).toBeCloseTo(rx, 12);
    expect.soft(reaction?.rz).toBeCloseTo(rz, 12);
  }
}

for (const entry of ['copy', 'detached insertion', 'clipboard placement', 'paste in place'] as const) {
  it(`#2294 refuses a complete vertical roller copied onto a horizontal bearing (${entry})`, async () => {
    const { set, root } = source();
    const detached = detach(fragmentOf(set, withSupports));
    if (entry.startsWith('clipboard') || entry === 'paste in place') {
      uiStore.setSelection(new Set(), new Set(set.elements), false);
      expect(copySelection()).toBe(true);
    }
    if (entry === 'paste in place') modelStore.clear();
    const inPlace = entry === 'paste in place';
    const bearing = inPlace ? destination(0) : destination(4, true, root);
    await expectPlaneReaction(bearing);
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
    expect.soft(uiStore.toasts.at(-1)).toMatchObject({ type: 'error', message: t('edit.refused.changedSupportFrame') });
    expect.soft(modelStore.snapshot()).toEqual(before);
    expect.soft(modelStore.modelVersion).toBe(version);
    expect.soft(historyStore.undoCount).toBe(0);
    await expectPlaneReaction(bearing);
  });
}

it('#2294 refuses a change to a destination roller when copying geometry alone', () => {
  const { set } = source();
  destination(4);
  const before = modelStore.snapshot();
  expect.soft(copyTransformed(set, [weld]).refused).toBe('changedSupportFrame');
  expect(modelStore.snapshot()).toEqual(before);
});

it('#2294 refuses welding a carried local roller onto an unsupported horizontal member', () => {
  const { set } = source();
  const bearing = modelStore.addNode(4, 2);
  modelStore.addElement(bearing, modelStore.addNode(6, 2));
  const before = modelStore.snapshot();
  expect.soft(copyTransformed(set, [weld], withSupports).refused).toBe('changedSupportFrame');
  expect(modelStore.snapshot()).toEqual(before);
});

it('#2294 refuses when the other end of a bearing member welds off its transformed axis', () => {
  const { set } = source();
  const weldTol = 0.01;
  modelStore.addNode(4 + weldTol / 2, 0);
  const before = modelStore.snapshot();
  expect.soft(copyTransformed(set, [weld], { ...withSupports, weldTol }).refused).toBe('changedSupportFrame');
  expect(modelStore.snapshot()).toEqual(before);
});

it('#2294 refuses a repeat when a later copy changes the frame of an earlier copy', () => {
  const { set } = source();
  const horizontal = { A: [0, 1, 0, -1, 0, 0, 0, 0, 1], t: [2, 2, 0] } as const;
  const before = modelStore.snapshot();
  expect.soft(copyTransformed(set, [weld, { A: [...horizontal.A], t: [...horizontal.t] }], withSupports).refused).toBe('changedSupportFrame');
  expect(modelStore.snapshot()).toEqual(before);
});

it('#2294 refuses links that change the roller frame', () => {
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
  await expectPlaneReaction(bearing);
});

it('#2294 permits a weld onto a global roller with a unit vertical reaction', async () => {
  const { set, root } = source();
  const bearing = destination(4, false, root);
  const report = copyTransformed(set, [weld]);
  expect(report.welded).toBe(1);
  expect(report.elements).toHaveLength(1);
  expect(report.refused).toBeUndefined();
  await expectPlaneReaction(bearing);
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

it('plans spatial insertion in the displayed coordinates of an upright plane model', () => {
  const { bearing } = source();
  uiStore.analysisMode = 'pro';
  uiStore.useUpright2DIn3DPresentation();
  const frag = fragmentFromMembers(
    [{ id: 1, x: 4, y: 0, z: 2 }, { id: 2, x: 0, y: 2, z: 0 }],
    [{ nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }],
  );
  const report = insertFragment(frag, [translation([0, 0, 0])]);
  expect(report.welded).toBe(0);
  expect(report.nodes).toHaveLength(2);
  expect(modelStore.nodes.get(bearing)).toMatchObject({ x: 0, y: 0, z: 2 });
  const inserted = report.maps[0]!.nodes.get(2)!;
  expect(modelStore.nodes.get(inserted)).toMatchObject({ x: 0, y: 2 });
});

function moveOntoBearing(entry: 'rotate' | 'mirror' | 'move' | 'placement', gap = 0) {
  const mirror = entry === 'mirror';
  const movingRoot = modelStore.addNode(mirror ? 5 : 3, mirror ? 1 : 2);
  const tip = modelStore.addNode(mirror ? 3 : 5, mirror ? 3 : 2);
  const member = modelStore.addElement(movingRoot, tip);
  modelStore.addSupportEntry({ nodeId: movingRoot, type: 'fixed' });
  const bearing = modelStore.addNode((mirror ? 5 : 4) + gap, 3);
  const fixed = modelStore.addNode(6, 3);
  modelStore.addElement(bearing, fixed);
  modelStore.addElement(movingRoot, fixed);
  modelStore.addSupportEntry({ nodeId: fixed, type: 'fixed' });
  modelStore.addSupportEntry({ nodeId: bearing, type: 'rollerX', isGlobal: false });
  modelStore.addNodalLoad(bearing, 0, -force, 0, caseId);
  return { bearing, movingRoot, tip, set: { nodes: [], elements: [member] } };
}

for (const entry of ['move', 'rotate', 'mirror', 'placement'] as const) {
  it(`#2294 refuses a member moved onto a stationary local roller (${entry})`, async () => {
    const { bearing, movingRoot, tip, set } = moveOntoBearing(entry);
    await expectPlaneReaction(bearing);
    historyStore.clear();
    const before = modelStore.snapshot();
    const version = modelStore.modelVersion;
    if (entry === 'placement') {
      placementStore.start({ fragment: fragmentOf(set), label: 'Move', mode: 'move', moveSet: set, anchors: [[4, 2, 0]], rotation: 90 });
      placementStore.commit();
      expect.soft(placementStore.active).toBe(true);
    } else {
      const report = entry === 'rotate' ? rotateSelectionInPlace([movingRoot, tip], 90)
        : entry === 'mirror' ? mirrorSelectionInPlace([movingRoot, tip], 'x')
        : transformInPlace(set, rotation([4, 2, 0], [0, 0, 1], 90));
      expect.soft(report?.refused).toBe('changedSupportFrame');
      expect.soft(report?.movedNodes).toBe(0);
      expect.soft(report?.welded).toBe(0);
    }
    expect.soft(uiStore.toasts.at(-1)).toMatchObject({ type: 'error', message: t('edit.refused.changedSupportFrame') });
    expect.soft(modelStore.snapshot()).toEqual(before);
    expect.soft(modelStore.modelVersion).toBe(version);
    expect.soft(historyStore.undoCount).toBe(0);
    await expectPlaneReaction(bearing);
  });
}

it('#2294 moves the member when it lands outside the weld tolerance', async () => {
  const weldTol = 0.01;
  const { bearing, set } = moveOntoBearing('move', 2 * weldTol);
  const report = transformInPlace(set, rotation([4, 2, 0], [0, 0, 1], 90), { weldTol });
  expect(report).toMatchObject({ movedNodes: 2, welded: 0 });
  expect(report.refused).toBeUndefined();
  await expectPlaneReaction(bearing);
});

it('#2294 welds a moved member that points along the existing bearing member', async () => {
  const { bearing, movingRoot, set } = moveOntoBearing('move');
  modelStore.updateNode(movingRoot, 8, 2);
  const report = transformInPlace(set, translation([-1, 1, 0]));
  expect(report).toMatchObject({ movedNodes: 2, welded: 1 });
  expect(report.refused).toBeUndefined();
  await expectPlaneReaction(bearing);
});

function threeRays() {
  const bearing = modelStore.addNode(0, 0);
  const roots = [[2, 0], [2, 2], [-2, 2]].map(([x, y]) => {
    const root = modelStore.addNode(x!, y!);
    modelStore.addSupportEntry({ nodeId: root, type: 'fixed' });
    return root;
  });
  const elements = roots.map(root => modelStore.addElement(bearing, root));
  modelStore.addSupportEntry({ nodeId: bearing, type: 'rollerX', isGlobal: false });
  return { bearing, root: roots[0]!, set: { nodes: [], elements } };
}

function loadAlongBearing(bearing: number, degrees: number) {
  const angle = degrees * Math.PI / 180;
  const rx = force * Math.sin(angle);
  const rz = force * Math.cos(angle);
  modelStore.addNodalLoad(bearing, -rx, -rz, 0, caseId);
  return expectPlaneReaction(bearing, rx, rz);
}

for (const entry of ['copy', 'detached insertion', 'clipboard placement', 'in place'] as const) {
  it(`#2294 refuses a rigid quarter-turn that redirects a local roller (${entry})`, async () => {
    const { bearing, root, set } = threeRays();
    const turn = compose(translation([8, 0, 0]), rotation([0, 0, 0], [0, 0, 1], 90));
    historyStore.clear();
    const before = modelStore.snapshot();
    const version = modelStore.modelVersion;
    let actualBearing: number | undefined;
    let actualRoot: number | undefined;
    if (entry === 'in place') {
      const report = transformInPlace(set, turn);
      expect.soft(report.refused).toBe('changedSupportFrame');
      if (report.movedNodes > 0) actualBearing = bearing;
    } else {
      const frag = detach(fragmentOf(set, withSupports));
      if (entry === 'clipboard placement') {
        placementStore.start({ fragment: frag, label: 'Copy', anchors: [[0, 0, 0]], target: [8, 0, 0], rotation: 90 });
      }
      const report = entry === 'copy' ? copyTransformed(set, [turn], withSupports)
        : entry === 'detached insertion' ? insertFragment(frag, [turn], withSupports) : placementStore.commit();
      expect.soft(report?.refused).toBe('changedSupportFrame');
      expect.soft(report?.welded).toBe(0);
      actualBearing = report?.maps[0]?.nodes.get(bearing);
      actualRoot = report?.maps[0]?.nodes.get(root);
    }
    expect.soft(uiStore.toasts.at(-1)).toMatchObject({ type: 'error', message: t('edit.refused.changedSupportFrame') });
    expect.soft(modelStore.snapshot()).toEqual(before);
    expect.soft(modelStore.modelVersion).toBe(version);
    expect.soft(historyStore.undoCount).toBe(0);
    if (actualRoot !== undefined) modelStore.addElement(root, actualRoot);
    await loadAlongBearing(actualBearing ?? bearing, actualBearing === undefined ? 60 : 150);
  });
}

for (const [label, makeTransform, degrees] of [
  ['opposite quarter-turn', () => rotation([0, 0, 0], [0, 0, 1], -90), -30],
  ['reflection across the X axis', () => reflection([0, 0, 0], [0, 1, 0]), -60],
] as const) {
  it(`#2294 preserves a copied local roller’s restraint under the ${label}`, async () => {
    const { bearing, root, set } = threeRays();
    const turn = compose(translation([8, 0, 0]), makeTransform());
    const report = copyTransformed(set, [turn], withSupports);
    expect(report.refused).toBeUndefined();
    expect(report.welded).toBe(0);
    const nodes = report.maps[0]!.nodes;
    modelStore.addElement(root, nodes.get(root)!);
    await loadAlongBearing(nodes.get(bearing)!, degrees);
  });
}
