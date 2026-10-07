/**
 * A load on a triangle names it by `quadId` with `on: 'plate'`; quads and triangles number from 1
 * each, so quad 1 and triangle 1 are two shells. What looks up the shell of a load must read `on`:
 * the marquee took the quad's outline for the triangle's load, "select what is loaded in this case"
 * selected the quad, hiding the quad hid the triangle's load, and the model code refused a
 * triangle's load when no quad had its number.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { boxSelect, type BoxSelectModel, type ScreenRect } from '../../viewport/box-select';
import { loadedInCase } from '../select-ops';
import { isLoadHidden, viewVisibility } from '../../store/view-state.svelte';
import { modelStore } from '../../store/model.svelte';
import { codeToModel, modelToCode } from '../code/format';

const triLoad = { type: 'surface3d', data: { id: 7, quadId: 1, on: 'plate', q: 2, caseId: 1 } };

describe('a triangle\'s load, where a quad has its number', () => {
  it('the marquee takes it by the triangle\'s outline', () => {
    const nodes = [{ id: 1, x: 0, y: 0 }, { id: 2, x: 1, y: 0 }, { id: 3, x: 0, y: 1 }, { id: 4, x: 10, y: 10 }, { id: 5, x: 11, y: 10 }, { id: 6, x: 11, y: 11 }, { id: 7, x: 10, y: 11 }];
    const model: BoxSelectModel = {
      nodes, elements: [], supports: [], loads: [triLoad as never],
      getNode: (id) => nodes.find((n) => n.id === id),
      getElement: () => undefined,
      getQuad: (id) => (id === 1 ? { nodes: [4, 5, 6, 7] } : undefined),
      getPlate: (id) => (id === 1 ? { nodes: [1, 2, 3] } : undefined),
    };
    const toScreen = (p: { x: number; y: number }) => ({ x: p.x * 10, y: 200 - p.y * 10 });
    const rect = (x0: number, y0: number, x1: number, y1: number): ScreenRect => ({ x1: x0 * 10, y1: 200 - y1 * 10, x2: x1 * 10, y2: 200 - y0 * 10 });
    const take = (r: ScreenRect) => boxSelect({ rect: r, isWindow: true, kinds: ['loads'], model, toScreen }).loads.has(7);
    expect(take(rect(-1, -1, 2, 2))).toBe(true);
    expect(take(rect(9, 9, 12, 12))).toBe(false);
  });

  it('"loaded in this case" is the triangle', () => {
    expect([...loadedInCase([triLoad as never], 1).shells]).toEqual(['p1']);
  });

  describe('hidden with the triangle, not with the quad', () => {
    beforeEach(() => {
      modelStore.clear();
      const n = [modelStore.addNode(0, 0, 0), modelStore.addNode(1, 0, 0), modelStore.addNode(1, 1, 0), modelStore.addNode(0, 1, 0)] as [number, number, number, number];
      modelStore.addQuad(n, 1, 0.2);
      modelStore.addPlate([modelStore.addNode(5, 0, 0), modelStore.addNode(6, 0, 0), modelStore.addNode(5, 1, 0)], 1, 0.2);
    });
    afterEach(() => { viewVisibility.showAll(); modelStore.clear(); });
    it('reads `on`', () => {
      viewVisibility.hide({ nodes: [], elements: [], shells: ['q1'] });
      expect(isLoadHidden(triLoad.data as never)).toBe(false);
      expect(isLoadHidden({ quadId: 1 })).toBe(true);
      viewVisibility.showAll();
      viewVisibility.hide({ nodes: [], elements: [], shells: ['p1'] });
      expect(isLoadHidden(triLoad.data as never)).toBe(true);
      expect(isLoadHidden({ quadId: 1 })).toBe(false);
    });
  });

  it('the model code takes a triangle\'s load with no quad of its number', () => {
    modelStore.clear();
    modelStore.addPlate([modelStore.addNode(0, 0, 0), modelStore.addNode(1, 0, 0), modelStore.addNode(0, 1, 0)], 1, 0.2);
    modelStore.addSurfaceLoad3D(1, 2, 1, { on: 'plate' });
    const r = codeToModel(modelToCode(modelStore.snapshot()));
    expect(r.errors).toEqual([]);
    modelStore.clear();
  });
});
