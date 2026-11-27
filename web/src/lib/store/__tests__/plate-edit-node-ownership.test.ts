import { afterEach, beforeAll, expect, it } from 'vitest';
import { modelStore } from '..';
import { modelFeatures } from '../../provenance/model-features';
import { closePlateHole, setPlateSideSagitta } from '../plate-shape';
import { applyPlateMeshes, applyPlateMeshesAsync, clearPlateMesh, createPlate, deletePlate, plateEntry, plateSides, planPlateMesh, setPlateSideArc } from '../physical-plates';

import { serializeProject, deserializeProject } from '../file';
import { plateLoops } from '../../model/physical/plate';
import { initSolver } from '../../engine/wasm-solver';

beforeAll(async () => { await initSolver(); });

function reopen() {
  const file = serializeProject();
  modelStore.clear();
  expect(deserializeProject(file)).toBe(true);
}

afterEach(() => modelStore.clear());

function fixture() {
  modelStore.clear();
  const nodes = (points: Array<[number, number]>) => points.map(([x, y]) => modelStore.addNode(x, y, 0));
  const outline = nodes([[0, 0], [6, 0], [6, 4], [0, 4]]);
  const hole = nodes([[2, 1], [3, 1], [3, 2], [2, 2]]);
  const plate = createPlate({ outline, holes: [hole], materialId: 1, thickness: 0.15 });
  if ('problem' in plate) throw Error(plate.problem);
  return { id: plate.id, outline, hole };
}

it('closing a saved hole deletes its authored nodes', () => {
  const { id, hole } = fixture();
  reopen();
  expect(closePlateHole(id, 0)).toBeNull();
  expect(hole.filter(n => modelStore.nodes.has(n))).toEqual(hole);
  expect(closePlateHole(id, 0)).toBe('needNodes');
});

it.each([0, 0.3])('changing a side to sagitta %s deletes the supplied arc node', sagitta => {
  const { id } = fixture();
  const mid = modelStore.addNode(3, -0.5, 0);
  expect(setPlateSideArc(id, 0, mid)).toBeNull();
  reopen();
  expect(setPlateSideSagitta(id, 0, sagitta)).toBeNull();
  expect(modelStore.nodes.has(mid)).toBe(true);
});

it.each([true, false])('straightening a generated side must retain a mass-bearing point (attached %s)', attached => {
  const { id, hole } = fixture();
  expect(setPlateSideSagitta(id, 0, 0.3)).toBeNull();
  const mid = plateSides(id)[0]!.mid!;
  const points = [{ nodeId: hole[0]!, m: 3 }, ...(attached ? [{ nodeId: mid, m: 2 }] : [])];
  modelStore.setMassSource({ kind: 'custom', factors: [], points });
  reopen();
  expect(setPlateSideSagitta(id, 0, 0)).toBeNull();
  expect(modelStore.nodes.has(mid)).toBe(attached);
  expect(modelStore.model.massSource?.points).toEqual(points);
});

it('deleting a plate preserves a point mass at a released corner', () => {
  const { id, outline } = fixture();
  const points = [{ nodeId: outline[0]!, m: 2 }];
  modelStore.setMassSource({ kind: 'custom', factors: [], points });
  deletePlate(id);
  expect(modelStore.model.massSource?.points).toEqual(points);
  expect(modelStore.nodes.has(outline[0]!)).toBe(true);
  expect(modelStore.nodes.has(outline[1]!)).toBe(false);
});

it.each([applyPlateMeshes, applyPlateMeshesAsync])('clearing a mesh preserves attached mass points (%p)', async apply => {
  const { id } = fixture();
  const plan = planPlateMesh(id, { size: 1, element: 'quad', followMembers: false });
  if (!plan?.mesh) throw Error(String(plan?.refused));
  expect((await apply([plan])).refused).toEqual([]);
  const [first, second] = plateLoops(plateEntry(id)!.group).owned;
  if (first === undefined || second === undefined) throw Error('expected two mesh-created nodes');
  const points = [{ nodeId: first, m: 2 }];
  modelStore.setMassSource({ kind: 'custom', factors: [], points });
  reopen();
  clearPlateMesh(id);
  expect(modelStore.model.massSource?.points).toEqual(points);
  expect(modelStore.nodes.has(first)).toBe(true);
  expect(modelStore.nodes.has(second)).toBe(false);
});

it('identifies plate edits that can affect the saved mass distribution', () => {
  const { hole } = fixture();
  const feature = () => modelFeatures(modelStore.snapshot()).has('physicalPlatePointMasses');
  expect(feature()).toBe(false);
  const outside = modelStore.addNode(9, 9, 0);
  const points = [{ nodeId: outside, m: 2 }];
  modelStore.setMassSource({ kind: 'custom', factors: [], points });
  expect(feature()).toBe(false);
  modelStore.setMassSource({ kind: 'custom', factors: [], points: [...points, { nodeId: hole[0]!, m: 3 }] });
  expect(feature()).toBe(true);
});
