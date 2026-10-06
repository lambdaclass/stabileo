/**
 * Reversing a member describes the same structure: every load, release and
 * end record follows it, so the solution does not move.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { historyStore, modelStore, uiStore } from '..';
import type { AnalysisResults3D } from '../../engine/types-3d';

function spaceResults() {
  const r = modelStore.solve3D(false, false, false);
  expect(r).toBeTypeOf('object');
  expect(r).not.toBeNull();
  return r as AnalysisResults3D;
}

function sameSpaceResults(actual: AnalysisResults3D, expected: AnalysisResults3D) {
  for (const key of ['reactions', 'displacements'] as const) {
    for (const row of expected[key]) {
      const other = actual[key].find((r) => r.nodeId === row.nodeId)!;
      expect(other).toBeDefined();
      for (const [field, value] of Object.entries(row)) {
        if (typeof value === 'number') expect((other as unknown as Record<string, number>)[field]).toBeCloseTo(value, 8);
      }
    }
  }
}

function peak(r: { displacements: Array<Record<string, number>> }) {
  return r.displacements.map((d) => [d.nodeId, +(d.ux ?? 0).toFixed(9), +(d.uz ?? d.uy ?? 0).toFixed(9)]);
}
function reactions(r: { reactions: Array<Record<string, number>> }) {
  // Rounded, and a round-off below the last digit is zero whatever its sign (−0 is not 0 to toEqual).
  const r6 = (v: number) => +v.toFixed(6) + 0;
  return r.reactions.map((x) => [x.nodeId, r6(x.rx ?? x.fx ?? 0), r6(x.rz ?? x.fz ?? 0), r6(x.my ?? 0)]);
}

beforeEach(() => { historyStore.clear(); modelStore.clear(); });

describe('reverseElement', () => {
  it.each([false, true])('3D preserves a section rotation and shared section (explicit Y: %s)', (explicitY) => {
    uiStore.analysisMode = '3d';
    modelStore.clear();
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(6, 0, 0);
    const e = modelStore.addElement(a, b);
    modelStore.addSupport(a, 'fixed3d');
    const sectionId = modelStore.elements.get(e)!.sectionId;
    modelStore.updateSection(sectionId, { rotation: 30, iy: 0.0001, iz: 0.00001 });
    modelStore.updateElement(e, { rollAngle: 12, ...(explicitY ? { localYx: 0, localYy: 1, localYz: 0 } : {}) });
    modelStore.addNodalLoad3D(b, 0, 0, -10, 0, 0, 0);
    modelStore.addDistributedLoad3D(e, 2, 5, -8, -3, 0.5, 4);
    modelStore.addPointLoadOnElement3D(e, 1.5, 3, -6);
    const before = spaceResults();
    expect(Math.abs(before.displacements.find((d) => d.nodeId === b)!.uy)).toBeGreaterThan(1e-6);
    modelStore.reverseElement(e);
    sameSpaceResults(spaceResults(), before);
    expect(modelStore.sections.get(sectionId)!.rotation).toBe(30);
    modelStore.reverseElement(e);
    sameSpaceResults(spaceResults(), before);
    expect(modelStore.elements.get(e)!.rollAngle).toBe(12);
  });

  it.each([false, true])('3D preserves thermal reactions when reversing (explicit Y: %s)', (explicitY) => {
    uiStore.analysisMode = '3d';
    modelStore.clear();
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(6, 0, 0);
    const e = modelStore.addElement(a, b);
    modelStore.addSupport(a, 'fixed3d'); modelStore.addSupport(b, 'fixed3d');
    if (explicitY) modelStore.updateElement(e, { localYx: 0, localYy: 1, localYz: 0 });
    modelStore.addThermalLoad(e, 10, 30);
    const before = spaceResults();
    expect(Math.abs(before.reactions[0].my)).toBeGreaterThan(1);
    modelStore.reverseElement(e);
    sameSpaceResults(spaceResults(), before);
    modelStore.reverseElement(e);
    sameSpaceResults(spaceResults(), before);
  });

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
