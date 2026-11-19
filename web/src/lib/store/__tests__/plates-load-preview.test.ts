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
    const slab = { caseId: 1, q: 4, target: { by: 'own' }, distribution: 'slab' } as const;
    const one = (id: number) => previewPlateDefs(pickedPlateDefs([id], slab), { leftHand: false }).loads.length;
    expect(one(a)).toBeGreaterThan(0);
    expect(one(b)).toBeGreaterThan(one(a));
    const both = previewPlateDefs(pickedPlateDefs([a, b], slab), { leftHand: false });
    expect(both.loads.length).toBe(one(a) + one(b));
    expect(both.problem).toBeUndefined();
    const defs = pickedPlateDefs([a, b], { ...slab, perPlanArea: true });
    expect(defs.map((d) => d.def.target)).toEqual([{ by: 'group', groupId: a }, { by: 'group', groupId: b }]);
    expect(defs.every((d) => d.def.perPlanArea === true && d.def.distribution === 'slab')).toBe(true);
  });

  it('adds to each plate the distribution and span chosen, not a slab load in their place', () => {
    const a = plate(0, 2, 2), b = plate(10, 3, 2);
    const defs = pickedPlateDefs([a, b], { caseId: 1, q: 4, target: { by: 'own' }, distribution: 'oneWay', spanAxis: 'y' });
    expect(defs.map((d) => [d.def.target, d.def.distribution, d.def.spanAxis])).toEqual([
      [{ by: 'group', groupId: a }, 'oneWay', 'y'],
      [{ by: 'group', groupId: b }, 'oneWay', 'y'],
    ]);
  });
});
