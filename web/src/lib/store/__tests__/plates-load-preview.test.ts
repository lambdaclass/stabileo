import { describe, it, expect, beforeEach } from 'vitest';
import { historyStore, modelStore, uiStore } from '..';
import { applyPlateMeshes, createPlate, pickedPlateDefs, planPlateMesh, previewPlateDefs } from '../physical-plates';

function plate(x0: number, w: number, h: number) {
  const c = [[x0, 0], [x0 + w, 0], [x0 + w, h], [x0, h]].map(([x, y]) => modelStore.addNode(x!, y!, 0));
  const r = createPlate({ outline: c, materialId: 1, thickness: 0.15 });
  const id = (r as { id: number }).id;
  applyPlateMeshes([planPlateMesh(id, { size: 0.5, followMembers: true, element: 'quad' })!]);
  return id;
}

describe('the floor-load panel with several plates picked whole', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro'; });

  it('previews every plate it adds, not only the first', () => {
    const a = plate(0, 2, 2), b = plate(10, 3, 2);
    const one = (id: number) => previewPlateDefs(pickedPlateDefs([id], 1, 4, false), { leftHand: false }).loads.length;
    expect(one(a)).toBeGreaterThan(0);
    expect(one(b)).toBeGreaterThan(one(a));
    const both = previewPlateDefs(pickedPlateDefs([a, b], 1, 4, false), { leftHand: false });
    expect(both.loads.length).toBe(one(a) + one(b));
    expect(both.problem).toBeUndefined();
    const defs = pickedPlateDefs([a, b], 1, 4, true);
    expect(defs.map((d) => d.def.target)).toEqual([{ by: 'group', groupId: a }, { by: 'group', groupId: b }]);
    expect(defs.every((d) => d.def.perPlanArea === true && d.def.distribution === 'slab')).toBe(true);
  });
});
