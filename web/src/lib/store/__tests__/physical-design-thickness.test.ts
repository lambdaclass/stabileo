import { afterEach, expect, it } from 'vitest';
import { modelStore } from '..';
import { fireChecks, patchFire } from '../fire';
import { physicalThickness } from '../physical';
import { applyPlateMeshes, createPlate, planPlateMesh } from '../physical-plates';

afterEach(() => modelStore.clear());

it.skip.each(['quad', 'tri'] as const)('known wrong result: #1928 fire dimensions follow the saved %s mesh', element => {
  modelStore.clear();
  const outline = [[0, 0], [6, 0], [6, 4], [0, 4]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
  const nominal = 0.15;
  const edited = 0.2;
  const plate = createPlate({ outline, materialId: 1, thickness: nominal });
  if ('problem' in plate) throw Error(plate.problem);
  patchFire({ rMinutes: 60 });
  const group = () => modelStore.model.groups.get(plate.id)!;
  const fire = () => fireChecks().find(row => row.groupId === plate.id);
  const plan = planPlateMesh(plate.id, { size: 1, element, followMembers: false })!;
  expect(plan.mesh).toBeTruthy();
  applyPlateMeshes([plan]);
  const ids = element === 'quad' ? group().members.quads! : group().members.plates!;
  expect(ids.length).toBeGreaterThan(1);
  const set = (id: number) => element === 'quad' ? modelStore.updateQuad(id, { thickness: edited }) : modelStore.updatePlate(id, { thickness: edited });
  expect(fire()?.data).toContainEqual(['h', nominal * 1000 + ' mm']);
  set(ids[0]!);
  modelStore.restore(modelStore.snapshot());
  expect(physicalThickness(group())).toBeNull();
  expect(fire()).toBeUndefined();
  ids.forEach(set);
  modelStore.restore(modelStore.snapshot());
  expect(physicalThickness(group())).toBe(edited);
  expect(fire()?.data).toContainEqual(['h', edited * 1000 + ' mm']);
});

it.skip('known wrong result: #1928 an unmeshed plate contributes a design dimension only with unified plates', () => {
  modelStore.clear();
  const outline = [[0, 0], [6, 0], [6, 4], [0, 4]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
  const plate = createPlate({ outline, materialId: 1, thickness: 0.15 });
  if ('problem' in plate) throw Error(plate.problem);
  patchFire({ rMinutes: 60 });
  expect(physicalThickness(modelStore.model.groups.get(plate.id)!)).toBe(__PUBLIC_FEATURES__.proPlatesUnified ? 0.15 : null);
  expect(fireChecks().some(row => row.groupId === plate.id)).toBe(!!__PUBLIC_FEATURES__.proPlatesUnified);
});
