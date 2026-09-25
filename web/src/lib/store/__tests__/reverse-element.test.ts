/**
 * Reversing a member describes the same structure: every load, release and
 * end record follows it, so the solution does not move.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { historyStore, modelStore, uiStore } from '..';

function peak(r: { displacements: Array<Record<string, number>> }) {
  return r.displacements.map((d) => [d.nodeId, +(d.ux ?? 0).toFixed(9), +(d.uz ?? d.uy ?? 0).toFixed(9)]);
}
function reactions(r: { reactions: Array<Record<string, number>> }) {
  return r.reactions.map((x) => [x.nodeId, +(x.rx ?? x.fx ?? 0).toFixed(6), +(x.rz ?? x.fz ?? 0).toFixed(6), +(x.my ?? 0).toFixed(6)]);
}

beforeEach(() => { historyStore.clear(); modelStore.clear(); });

describe('reverseElement', () => {
  it('2D: local and global loads, a partial load, a point load, a gradient and a hinge', () => {
    uiStore.analysisMode = '2d';
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(6, 1), c = modelStore.addNode(10, 1);
    const e1 = modelStore.addElement(a, b);
    modelStore.addElement(b, c);
    modelStore.addSupport(a, 'fixed'); modelStore.addSupport(c, 'pinned');
    modelStore.addDistributedLoad(e1, -10, -4, undefined, false, undefined, 1, 4.5);
    modelStore.addDistributedLoad(e1, -3, -3, 20, true);
    modelStore.addPointLoadOnElement(e1, 2, -7, { px: 2, my: 3 });
    modelStore.addThermalLoad(e1, 10, 25);
    modelStore.toggleRelease(e1, 'j', 'mz');
    const before = modelStore.solve(false) as never;
    modelStore.reverseElement(e1);
    expect(modelStore.elements.get(e1)!.nodeI).toBe(b);
    expect(modelStore.elements.get(e1)!.releaseI.mz).toBe(true);
    const after = modelStore.solve(false) as never;
    expect(reactions(after)).toEqual(reactions(before));
    expect(peak(after)).toEqual(peak(before));
    modelStore.reverseElement(e1);
    expect(reactions(modelStore.solve(false) as never)).toEqual(reactions(before));
  });

  it('3D: local qY/qZ, a point load and a roll angle', () => {
    uiStore.analysisMode = '3d';
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(5, 2, 1);
    const e = modelStore.addElement(a, b);
    modelStore.addSupport(a, 'fixed3d');
    modelStore.updateElement(e, { rollAngle: 30 });
    modelStore.model.loads = [
      { type: 'distributed3d', data: { id: 900, elementId: e, qYI: 2, qYJ: 5, qZI: -8, qZJ: -3, a: 0.5, b: 4 } },
      { type: 'pointOnElement3d', data: { id: 901, elementId: e, a: 1.5, py: 3, pz: -6 } },
    ];
    const before = modelStore.solve3D(false, false, false) as never;
    modelStore.reverseElement(e);
    const after = modelStore.solve3D(false, false, false) as never;
    expect(reactions(after)).toEqual(reactions(before));
  });
});
