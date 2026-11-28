import { expect, it } from 'vitest';
import { assignConcrete } from '../../model/building/assign-concrete';
import { modelStore, uiStore } from '..';
import { drawState } from '../draw-state.svelte';
import { createPlate, physicalPlates, plateEntry, planPlateMesh, applyPlateMeshes } from '../physical-plates';
import { deserializeProject, serializeProject } from '../file';

it.each(['node entry', 'viewport outline'] as const)('known wrong result: #1928 a plate from %s participates only in its profile’s level assignments', command => {
  const unified = __PUBLIC_FEATURES__.proPlatesUnified;
  modelStore.clear();
  uiStore.analysisMode = 'pro';
  modelStore.setGrid({ axes: [], levels: [{ id: 'ground', name: 'Ground', z: 0 }, { id: 'roof', name: 'Roof', z: 3 }] });
  modelStore.addGroup('P1', 'selection', {});
  const material = modelStore.addMaterial({ ...modelStore.materials.get(1)!, name: 'Assigned concrete' });
  for (const kind of ['slab', 'wall'] as const) {
    const coords = kind === 'slab' ? [[0, 0, 3], [4, 0, 3], [4, 4, 3], [0, 4, 3]] : [[6, 0, 0], [10, 0, 0], [10, 0, 3], [6, 0, 3]];
    const outline = coords.map(([x, y, z]) => modelStore.addNode(x!, y!, z!));
    if (command === 'node entry') {
      expect(createPlate({ outline, materialId: 1, thickness: 0.2 })).toHaveProperty('id');
    } else {
      drawState.plateMaterialId = 1;
      drawState.plateCorners = 'outline';
      drawState.startPlate();
      for (const n of outline) drawState.pickPlateNode(n);
      drawState.pickPlateNode(outline[0]!);
    }
    const p = physicalPlates().find(e => e.physical.kind === kind)!;
    const plan = planPlateMesh(p.id);
    expect(plan).not.toBeNull();
    expect(applyPlateMeshes([plan!])).toMatchObject({ plates: 1 });
    expect(deserializeProject(serializeProject())).toBe(true);
    const saved = plateEntry(p.id)!;
    const ids = saved.group.members.quads!;
    expect(ids.length).toBeGreaterThan(0);
    expect.soft(saved.name).toBe(unified ? (kind === 'slab' ? 'L1' : 'M1') : (kind === 'slab' ? 'P1' : 'P2'));
    expect.soft(saved.physical.levelFrom).toBe(unified ? (kind === 'wall' ? 'ground' : 'roof') : undefined);
    expect.soft(saved.physical.levelTo).toBe(unified ? 'roof' : undefined);
    expect(assignConcrete(kind, material, 'other')).toBe(0);
    expect.soft(assignConcrete(kind, material, 'roof')).toBe(unified ? ids.length : 0);
    expect.soft(ids.map(id => modelStore.quads.get(id)!.materialId)).toEqual(ids.map(() => unified ? material : 1));
    expect(assignConcrete(kind, material)).toBe(unified ? 0 : ids.length);
  }
});

it('preserves explicit level assignments and does not invent a published level without a grid', () => {
  modelStore.clear();
  const outline = [[0, 0], [2, 0], [2, 2], [0, 2]].map(([x, y]) => modelStore.addNode(x!, y!, 3));
  const made = createPlate({ name: 'Authored name', outline, materialId: 1, thickness: 0.2 });
  if (!('id' in made)) throw new Error(JSON.stringify(made));
  const p = plateEntry(made.id)!;
  expect(p.name).toBe('Authored name');
  expect(p.physical.levelFrom).toBe(__PUBLIC_FEATURES__.proPlatesUnified ? 'z:3.000' : undefined);
  modelStore.setGroupData(p.id, { ...p.group.data, levelFrom: 'authored' });
  const plan = planPlateMesh(p.id);
  expect(plan).not.toBeNull();
  expect(applyPlateMeshes([plan!])).toMatchObject({ plates: 1 });
  expect(deserializeProject(serializeProject())).toBe(true);
  const material = modelStore.addMaterial({ ...modelStore.materials.get(1)!, name: 'Specified material' });
  const cells = plateEntry(p.id)!.group.members.quads!;
  expect(cells.length).toBeGreaterThan(0);
  expect(assignConcrete('slab', material, 'authored')).toBe(cells.length);
  expect(cells.every(id => modelStore.quads.get(id)?.materialId === material)).toBe(true);
});
