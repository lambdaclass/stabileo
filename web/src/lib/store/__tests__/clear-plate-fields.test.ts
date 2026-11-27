import { beforeAll, beforeEach, expect, it } from 'vitest';
import { initSolver } from '../../engine/wasm-solver';
import { createArc, remakeArc } from '../curved-members';
import { modelStore, uiStore } from '../index';
import { applyPlateMeshes, applyPlateMeshesAsync, clearPlateMesh, createPlate, deletePlate, planPlateMesh, plateLoadDefs, plateShellKeys } from '../physical-plates';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { modelStore.clear(); uiStore.analysisMode = 'pro'; });

function panel(element: 'quad' | 'tri', x = 0) {
  const nodes = [[x, 0], [x + 4, 0], [x + 4, 4], [x, 4]].map(([px, py]) => modelStore.addNode(px!, py!, 0));
  const plate = createPlate({ name: 'Loaded panel', outline: nodes, materialId: 1, thickness: 0.2, mesh: { element, size: 1, followMembers: false } });
  if (!('id' in plate)) throw Error(plate.problem);
  expect(applyPlateMeshes([planPlateMesh(plate.id)!]).plates).toBe(1);
  const keys = plateShellKeys(plate.id);
  expect(keys.length).toBeGreaterThan(1);
  return { id: plate.id, nodes, keys };
}

function pressure(key: string, q: number) {
  return modelStore.addSurfaceLoad3D(Number(key.slice(1)), q, 1, key.startsWith('p') ? { on: 'plate' } : {});
}

for (const element of ['quad', 'tri'] as const) {
  it.skip.each(['pressure', 'offset', 'thickness'] as const)('known wrong result: #2461 clearing a ' + element + ' mesh retains a cell-specific %s', field => {
    const { id, keys } = panel(element);
    const key = keys.at(-1)!;
    if (field === 'pressure') pressure(key, -2);
    else if (field === 'thickness') {
      const update = key[0] === 'p' ? modelStore.updatePlate : modelStore.updateQuad;
      update(Number(key.slice(1)), { thickness: 0.25 });
    } else modelStore.setShellOffset(key[0] === 'p' ? 'plate' : 'quad', Number(key.slice(1)), { frame: 'local', x: 0, y: 0, z: 0.1 });
    const original = modelStore.snapshot();
    expect.soft(clearPlateMesh(id)).toMatchObject({ refused: ['Loaded panel'] });
    expect(modelStore.snapshot()).toEqual(original);
    deletePlate(id);
    expect(plateShellKeys(id)).toHaveLength(0);
  });

  it.skip('known wrong result: #2461 clearing a ' + element + ' mesh preserves exactly uniform pressure over a remesh', () => {
    const { id, keys } = panel(element);
    for (const key of keys) pressure(key, -2);
    expect(clearPlateMesh(id)).not.toHaveProperty('refused');
    expect(plateShellKeys(id)).toHaveLength(0);
    expect(plateLoadDefs(id).map(g => g.data)).toMatchObject([{ caseId: 1, q: -2 }]);
    expect(applyPlateMeshes([planPlateMesh(id)!]).plates).toBe(1);
    const loads = modelStore.loads.filter(l => l.type === 'surface3d');
    expect(loads).toHaveLength(plateShellKeys(id).length);
    expect(loads.every(l => l.data.q === -2 && l.data.caseId === 1)).toBe(true);
  });
}

it.skip('known wrong result: #2461 changing an arc preserves the touching plate and its hand load', () => {
  const { nodes, keys } = panel('quad');
  const arc = createArc(nodes[0]!, { x: 2, y: -1, z: 0 }, nodes[1]!, 4);
  const arcId = modelStore.elements.get(arc[0]!)!.arc!.id;
  pressure(keys[0]!, -2);
  const before = modelStore.snapshot();
  expect.soft(remakeArc(arcId, { segments: 6 })).toMatchObject({ platesCleared: 0, refused: ['Loaded panel'] });
  expect(modelStore.snapshot()).toEqual(before);
});


it.skip.each(['quad', 'tri'] as const)('known wrong result: #2461 preserves local %s stiffness during synchronous and asynchronous replacement', async element => {
  const { id, keys } = panel(element);
  const shell = Number(keys.at(-1)!.slice(1));
  const update = element === 'quad' ? modelStore.updateQuad : modelStore.updatePlate;
  const shells = () => element === 'quad' ? modelStore.quads : modelStore.plates;
  const nodes = shells().get(shell)!.nodes.slice().sort();
  update(shell, { thickness: 0.25 });
  for (const apply of [applyPlateMeshes, applyPlateMeshesAsync]) {
    expect((await apply([planPlateMesh(id)!])).plates).toBe(1);
    const saved = [...shells().values()].find(cell => JSON.stringify(cell.nodes.slice().sort()) === JSON.stringify(nodes));
    expect.soft(saved?.thickness).toBe(0.25);
  }
});

it.skip('known wrong result: #2461 checks an entire selection before clearing either mesh', () => {
  const empty = panel('quad'), loaded = panel('quad', 8);
  pressure(loaded.keys[0]!, -2);
  const before = modelStore.snapshot();
  expect.soft(clearPlateMesh([empty.id, loaded.id])).toMatchObject({ refused: ['Loaded panel'] });
  expect(modelStore.snapshot()).toEqual(before);
  deletePlate(loaded.id);
  expect(clearPlateMesh([empty.id])).not.toHaveProperty('refused');
  expect(plateShellKeys(empty.id)).toHaveLength(0);
});

it.skip.each(['own', 'other group', 'orphan'] as const)('known wrong result: #2461 refuses to clear a pressure whose %s target cannot follow the mesh', async owner => {
  const { addFloorLoadDef } = await import('../defined-loads');
  const { id, keys } = panel('quad');
  const quadId = Number(keys[0]!.slice(1));
  if (owner === 'orphan') modelStore.addSurfaceLoad3D(quadId, -2, 1, { fromDef: 99999 });
  else {
    const own = { quads: [quadId] };
    const target = owner === 'own' ? { by: 'own' as const }
      : { by: 'group' as const, groupId: modelStore.addGroup('Loaded cell', 'selection', own) };
    addFloorLoadDef('Cell pressure', { caseId: 1, q: -2, distribution: 'slab', target }, own);
  }
  const before = modelStore.snapshot();
  expect.soft(clearPlateMesh(id)).toMatchObject({ refused: ['Loaded panel'] });
  expect(modelStore.snapshot()).toEqual(before);
});
