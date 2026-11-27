import { afterEach, expect, it } from 'vitest';
import { modelStore } from '../../../store';
import { meshDeferredSlabs, representFootprints, simplifySlabs, slabsWithoutFootprints } from '../deferred-slabs';

function panelMesh() {
  modelStore.clear();
  const panel = [[0, 0], [4, 0], [4, 4], [0, 4]].map(([x,y]) => modelStore.addNode(x!, y!, 0)) as [number, number, number, number];
  const quad = modelStore.addQuad(panel, 1, 0.15);
  const id = modelStore.addGroup('L1', 'physicalMember', { quads: [quad] }, {
    data: { kind: 'slab', provenance: 'declared', meshAtSolve: { size: 1, meshed: false, panel } },
  });
  expect(meshDeferredSlabs().slabs).toBe(1);
  const cells = modelStore.model.groups.get(id)!.members.quads!;
  expect(cells.length).toBeGreaterThan(1);
  return { id, panel, cells };
}

afterEach(() => modelStore.clear());

it.skip.each(['first', 'last', 'corners', 'thermal', 'offset'] as const)('preserves a cell-specific %s edit when simplifying a reopened slab (known wrong result: #1928)', mode => {
  const { cells } = panelMesh();
  const first = cells[0]!, last = cells[cells.length - 1]!;
  if (mode === 'thermal') modelStore.addThermalLoadQuad3D(last, 1, 2, 1);
  else if (mode === 'offset') modelStore.setShellOffset('quad', last, { dx: 0, dy: 0, dz: 1 });
  else if (mode === 'corners') {
    for (const cell of cells) modelStore.addSurfaceLoad3D(cell, 1, 1, { qNodes: [1, 2, 3, 4] });
  } else modelStore.addSurfaceLoad3D(mode === 'first' ? first : last, 1, 1);
  modelStore.restore(modelStore.snapshot());
  const before = modelStore.snapshot();
  expect(simplifySlabs().slabs).toBe(0);
  expect(modelStore.snapshot()).toEqual(before);
});

it.skip('preserves load origin and multiplicity over simplification and subdivision (known wrong result: #1928)', () => {
  const { cells } = panelMesh();
  for (const quadId of cells) {
    for (let i = 0; i < 2; i++) modelStore.addSurfaceLoad3D(quadId, 1, 1, { generatedBy: 'plan' });
    modelStore.addLoadEntries([{ type: 'thermalQuad3d', data: { id: 0, quadId, dtUniform: 2, dtGradient: 1, generatedBy: 'plan', caseId: 1 } }]);
  }
  expect(simplifySlabs().slabs).toBe(1);
  expect(modelStore.loads).toHaveLength(3);
  expect(modelStore.loads.every(l => 'generatedBy' in l.data && l.data.generatedBy === 'plan')).toBe(true);
  expect(meshDeferredSlabs().slabs).toBe(1);
  expect(modelStore.loads).toHaveLength(modelStore.quads.size * 3);
  expect(modelStore.loads.every(l => 'generatedBy' in l.data && l.data.generatedBy === 'plan')).toBe(true);
});

it.skip('preserves a loaded mesh when solve preparation requests column footprints (known wrong result: #1928)', () => {
  const { id, panel, cells } = panelMesh();
  const node = modelStore.addNode(0, 0, -3);
  const section = modelStore.addSection({ ...modelStore.sections.get(1)!, b: 0.3, h: 0.3 });
  modelStore.updateElement(modelStore.addElement(node, panel[0]), { sectionId: section });
  modelStore.addThermalLoadQuad3D(cells[cells.length - 1]!, 1, 0, 1);
  expect(slabsWithoutFootprints()).toContain(id);
  const before = modelStore.snapshot();
  expect(representFootprints().slabs).toBe(0);
  expect(modelStore.snapshot()).toEqual(before);
});
