import { afterEach, expect, it } from 'vitest';
import { modelStore } from '..';
import { modelFeatures } from '../../provenance/model-features';
import { plateGeometry } from '../../model/physical/plate';
import { createPlate, editPlateHole, plateEntry, setPlateSideArc } from '../physical-plates';
import { setPlateSideSagitta } from '../plate-shape';

afterEach(() => modelStore.clear());

it.each(['node', 'sagitta'] as const)('an outside edge edit through %s preserves a saved opening', entry => {
  modelStore.clear();
  const nodes = (xy: number[][]) => xy.map(([x,y]) => modelStore.addNode(x!, y!, 0));
  const outer = nodes([[0,0], [8,0], [8,6], [0,6]]);
  const hole = nodes([[2,2], [3,1.5], [4,2], [4,4], [2,4]]);
  const plate = createPlate({ outline: outer, holes: [hole], thickness: 0.15, materialId: 1 });
  if ('problem' in plate) throw Error(plate.problem);
  const id = plate.id;
  const group = plateEntry(id)!;
  expect(modelFeatures(modelStore.snapshot()).has('curvedPlateOpenings')).toBe(false);
  modelStore.setGroupData(id, { ...group.group.data, surface: { ...group.surface, arcMids: [outer.length + 1] } });
  modelStore.restore(modelStore.snapshot());
  const opening = () => plateGeometry(modelStore, plateEntry(id)!.group)!.holes[0]!;
  expect(modelFeatures(modelStore.snapshot()).has('curvedPlateOpenings')).toBe(true);
  const expected = opening();
  expect(expected.length).toBeGreaterThan(hole.length);
  const extra = nodes([[5,2], [6,2], [6,3], [5,3]]);
  expect(editPlateHole(id, { append: extra })).toBeNull();
  expect(opening()).toEqual(expected);
  expect(editPlateHole(id, { remove: 1 })).toBeNull();
  expect(opening()).toEqual(expected);
  expect(editPlateHole(id, { remove: 1 })).toBe('needNodes');
  const start = nodes([[4, -0.5]])[0]!;
  const update = (curved: boolean) => entry === 'node'
    ? setPlateSideArc(id, 0, curved ? start : null)
    : setPlateSideSagitta(id, 0, curved ? 0.5 : 0);
  expect(update(true)).toBeNull();
  expect(opening()).toEqual(expected);
  expect(plateEntry(id)!.surface.arcMids).toEqual([1, outer.length + 2]);
  expect(update(false)).toBeNull();
  expect(opening()).toEqual(expected);
  expect(plateEntry(id)!.surface.arcMids).toEqual([outer.length + 1]);
});
