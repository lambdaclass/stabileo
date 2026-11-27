import { afterEach, expect, it } from 'vitest';
import { modelStore } from '..';
import { closePlateHole, setPlateSideSagitta } from '../plate-shape';
import { createPlate, deletePlate, plateSides, setPlateSideArc } from '../physical-plates';

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

it.skip('known wrong result: closing a saved hole deletes its authored nodes', () => {
  const { id, hole } = fixture();
  modelStore.restore(modelStore.snapshot());
  expect(closePlateHole(id, 0)).toBeNull();
  expect(hole.filter(n => modelStore.nodes.has(n))).toEqual(hole);
  expect(closePlateHole(id, 0)).toBe('needNodes');
});

it.skip.each([0, 0.3])('known wrong result: changing a side to sagitta %s deletes the supplied arc node', sagitta => {
  const { id } = fixture();
  const mid = modelStore.addNode(3, -0.5, 0);
  expect(setPlateSideArc(id, 0, mid)).toBeNull();
  modelStore.restore(modelStore.snapshot());
  expect(setPlateSideSagitta(id, 0, sagitta)).toBeNull();
  expect(modelStore.nodes.has(mid)).toBe(true);
});

it.skip.each([true, false])('known wrong result: straightening a generated side must retain a mass-bearing point (attached %s)', attached => {
  const { id } = fixture();
  expect(setPlateSideSagitta(id, 0, 0.3)).toBeNull();
  const mid = plateSides(id)[0]!.mid!;
  const points = attached ? [{ nodeId: mid, m: 2 }] : [];
  modelStore.setMassSource({ kind: 'custom', factors: [], points });
  modelStore.restore(modelStore.snapshot());
  expect(setPlateSideSagitta(id, 0, 0)).toBeNull();
  expect(modelStore.nodes.has(mid)).toBe(attached);
  expect(modelStore.model.massSource?.points).toEqual(points);
});

it.skip('known wrong result: deleting a plate silently removes a point mass at a released corner', () => {
  const { id, outline } = fixture();
  const points = [{ nodeId: outline[0]!, m: 2 }];
  modelStore.setMassSource({ kind: 'custom', factors: [], points });
  deletePlate(id);
  expect(modelStore.model.massSource?.points).toEqual(points);
  expect(modelStore.nodes.has(outline[0]!)).toBe(true);
  expect(modelStore.nodes.has(outline[1]!)).toBe(false);
});
