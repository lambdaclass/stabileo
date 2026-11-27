import { afterEach, expect, it } from 'vitest';
import { modelStore, resultsStore, uiStore } from '../../../store';
import { runGlobalSolve } from '../../../engine/live-calc';
import { tp } from '../../../i18n';
import { modelFeatures } from '../../../provenance/model-features';
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

it.each(['first', 'last', 'corners', 'thermal', 'offset'] as const)('preserves a cell-specific %s edit when simplifying a reopened slab', mode => {
  const { cells } = panelMesh();
  const first = cells[0]!, last = cells[cells.length - 1]!;
  if (mode === 'thermal') modelStore.addThermalLoadQuad3D(last, 1, 2, 1);
  else if (mode === 'offset') modelStore.setShellOffset('quad', last, { frame: 'global', x: 0, y: 0, z: 1 });
  else if (mode === 'corners') {
    for (const cell of cells) modelStore.addSurfaceLoad3D(cell, 1, 1, { qNodes: [1, 2, 3, 4] });
  } else modelStore.addSurfaceLoad3D(mode === 'first' ? first : last, 1, 1);
  modelStore.restore(modelStore.snapshot());
  const before = modelStore.snapshot();
  expect(simplifySlabs().slabs).toBe(0);
  expect(modelStore.snapshot()).toEqual(before);
});

it('carries a constant corner field as the same pressure on the original panel', () => {
  const { cells } = panelMesh();
  for (const id of cells) modelStore.addSurfaceLoad3D(id, 0, 1, { qNodes: [2, 2, 2, 2] });
  expect(simplifySlabs().slabs).toBe(1);
  expect(modelStore.loads).toHaveLength(1);
  expect(modelStore.loads[0]).toMatchObject({ type: 'surface3d', data: { q: 2, caseId: 1 } });
});

it('preserves load origin and multiplicity over simplification and subdivision', () => {
  const { cells } = panelMesh();
  for (const quadId of cells) {
    for (let i = 0; i < 2; i++) modelStore.addSurfaceLoad3D(quadId, 1, 1, { generatedBy: 'plan' });
    modelStore.addThermalLoadQuad3D(quadId, 2, 1, 1);
  }
  modelStore.replaceLoads(modelStore.loads.map(l => l.type === 'thermalQuad3d' ? { ...l, data: { ...l.data, generatedBy: 'plan' } } : l));
  expect(simplifySlabs().slabs).toBe(1);
  expect(modelStore.loads).toHaveLength(3);
  expect(modelStore.loads.every(l => 'generatedBy' in l.data && l.data.generatedBy === 'plan')).toBe(true);
  expect(meshDeferredSlabs().slabs).toBe(1);
  expect(modelStore.loads).toHaveLength(modelStore.quads.size * 3);
  expect(modelStore.loads.every(l => 'generatedBy' in l.data && l.data.generatedBy === 'plan')).toBe(true);
});

function loadedFootprint() {
  const { id, panel, cells } = panelMesh();
  const node = modelStore.addNode(0, 0, -3);
  const section = modelStore.addSection({ ...modelStore.sections.get(1)!, b: 0.3, h: 0.3 });
  modelStore.updateElement(modelStore.addElement(node, panel[0]), { sectionId: section });
  modelStore.addThermalLoadQuad3D(cells[cells.length - 1]!, 1, 0, 1);
  expect(slabsWithoutFootprints()).toContain(id);
  return id;
}

it('preserves a loaded mesh when solve preparation requests column footprints', () => {
  loadedFootprint();
  const before = modelStore.snapshot();
  expect(representFootprints().slabs).toBe(0);
  expect(modelStore.snapshot()).toEqual(before);
});

it.each(['3d', 'pro'] as const)('stops the %s solve before replacing a loaded slab', async mode => {
  const previous = uiStore.analysisMode;
  uiStore.analysisMode = mode;
  try {
    for (const perCombination of ['linear', 'pdelta'] as const) {
      loadedFootprint();
      modelStore.setAnalysis({ combinationMethod: 'solveEach', perCombination });
      const before = modelStore.snapshot();
      expect(await runGlobalSolve()).toMatchObject({ ok: false, error: tp('building.slabs.cannotSimplify', { names: 'L1' }) });
      expect(resultsStore.results3D).toBeNull();
      expect(modelStore.snapshot().loads).toEqual(before.loads);
      expect(modelStore.snapshot().quads).toEqual(before.quads);
    }
  } finally {
    uiStore.analysisMode = previous;
  }
});

it('identifies the retained deferred panel after subdivision and simplification', () => {
  modelStore.clear();
  expect(modelFeatures(modelStore.snapshot())).not.toContain('deferredSlabPanels');
  panelMesh();
  expect(modelFeatures(modelStore.snapshot())).toContain('deferredSlabPanels');
  expect(simplifySlabs().slabs).toBe(1);
  expect(modelFeatures(modelStore.snapshot())).toContain('deferredSlabPanels');
});
