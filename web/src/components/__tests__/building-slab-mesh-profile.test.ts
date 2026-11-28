import { render } from 'svelte/server';
import { afterEach, expect, it } from 'vitest';
import { modelStore } from '../../lib/store';
import { createPlate, applyPlateMeshes, planPlateMesh } from '../../lib/store/physical-plates';
import { meshDeferredSlabs } from '../../lib/model/building/deferred-slabs';
import { placeFrame, placeSlabs } from '../../lib/model/building/build-on-grid';
import type { StructuralGrid } from '../../lib/model/grid';
import BuildingSlabs from '../pro/building/BuildingSlabs.svelte';
import BuildingWalls from '../pro/building/BuildingWalls.svelte';

const grid: StructuralGrid = {
  axes: [
    { id: 'A', name: 'A', axis: 'x', at: 0 }, { id: 'B', name: 'B', axis: 'x', at: 6 },
    { id: '1', name: '1', axis: 'y', at: 0 }, { id: '2', name: '2', axis: 'y', at: 5 },
  ],
  levels: [{ id: 'N0', name: 'PB', z: 0 }, { id: 'N1', name: 'P1', z: 3 }],
};

const panel = () => render(BuildingSlabs, { props: { report() {} } }).body;
afterEach(() => modelStore.clear());

it('reports the grid slab before and after mesh preparation and reopening', () => {
  modelStore.clear();
  const member = { sectionId: 1, materialId: 1 };
  placeFrame(grid, { x: ['A','B'], y: ['1','2'], levels: ['N0','N1'], columns: member, beamsX: member, beamsY: member });
  expect(placeSlabs(grid, { levels: ['N1'], thickness: 0.15, materialId: 1, meshSize: 1, meshAtSolve: true }).created).toBe(1);
  expect(panel()).toContain('data-testid="building-slabs-waiting"');
  expect(meshDeferredSlabs().slabs).toBe(1);
  modelStore.restore(modelStore.snapshot());
  expect(panel()).toContain('data-testid="building-slabs-simplify"');
  expect(panel()).not.toContain('data-testid="building-slabs-waiting"');
});

it('excludes independently authored plate cells from the published grid slab simplifier', () => {
  modelStore.clear();
  const outline = [[0,0], [3,0], [3,2], [0,2]].map(([x,y]) => modelStore.addNode(x!,y!,0));
  const result = createPlate({ outline, materialId: 1, thickness: 0.15 });
  if ('problem' in result) throw Error(result.problem);
  const plan = planPlateMesh(result.id)!;
  expect(applyPlateMeshes([plan]).plates).toBe(1);
  expect(panel()).not.toContain('data-testid="building-slabs-simplify"');
});

it('offers deferred walls only when the wall builder can create them', () => {
  const html = render(BuildingWalls, { props: { meshSize: 1, report() {} } }).body;
  expect(html.includes('data-testid="building-wall-mesh-solve"')).toBe(Boolean(__PUBLIC_FEATURES__.proPlatesUnified));
});
