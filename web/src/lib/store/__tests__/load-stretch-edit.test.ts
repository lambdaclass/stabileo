/**
 * Editing where a member load sits (`modelStore.updateLoad`, the load tables' a and b cells): a
 * stretch that does not go forward or leaves the member, and a point off the member, are refused
 * whole, the load kept as it was, with no undo step. One rule with the write card's
 * (`model/loads/load-stretch.ts`).
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import '../index';
import { historyStore } from '../history.svelte';
import { addLoads } from '../load-ops';
import { appliedResultant } from '../../engine/statics-check';
import { checkStretch, checkPosition } from '../../model/loads/load-stretch';

beforeAll(async () => { await new Promise((r) => setTimeout(r, 0)); });
beforeEach(() => { modelStore.clear(); historyStore.clear(); });

/** A 5 m beam with qZ = −10 on 0–3 m. */
function beam() {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(5, 0, 0);
  const e = modelStore.addElement(a, b, 'frame');
  const [id] = addLoads([{ type: 'distributed3d', data: { id: 0, elementId: e, qYI: 0, qYJ: 0, qZI: -10, qZJ: -10, b: 3, caseId: 1 } }]);
  historyStore.clear();
  const data = () => modelStore.loads.find((l) => l.data.id === id)!.data as { a?: number; b?: number };
  return { e, id: id!, data };
}

describe('the stretch rule', () => {
  it('0 ≤ a < b ≤ L; an end at the member\'s own end stored as absent', () => {
    expect(checkStretch(1, 4, 5)).toEqual({ ok: true, a: 1, b: 4 });
    expect(checkStretch(0, 5, 5)).toEqual({ ok: true, a: undefined, b: undefined });
    expect(checkStretch(4, 3, 5)).toMatchObject({ ok: false, reason: 'order' });
    expect(checkStretch(3, 3, 5)).toMatchObject({ ok: false, reason: 'order' });
    expect(checkStretch(-1, undefined, 5)).toMatchObject({ ok: false, reason: 'order' });
    expect(checkStretch(6, undefined, 5)).toMatchObject({ ok: false, reason: 'outside' });
    expect(checkStretch(undefined, 6, 5)).toMatchObject({ ok: false, reason: 'outside' });
    expect(checkPosition(9, 5)).toBeNull();
    expect(checkPosition(5, 5)).toBe(5);
  });
});

describe('updateLoad keeps a stretch on its member', () => {
  it('a typed past b is refused: the load stays on 0–3 m and still pushes down', () => {
    const { id, data } = beam();
    expect(modelStore.updateLoad(id, { a: 4 })).toBe(false);
    expect(data()).toMatchObject({ b: 3 });
    expect(data().a).toBeUndefined();
    expect(historyStore.undoCount).toBe(0);
    expect(appliedResultant(modelStore.model as never, 1, { includeSelfWeight: false }).applied.fz).toBeCloseTo(-30, 9);
  });

  it('a past the member, b past it, b at the start: refused', () => {
    const { id, data } = beam();
    expect(modelStore.updateLoad(id, { a: 6 })).toBe(false);
    expect(modelStore.updateLoad(id, { b: 6 })).toBe(false);
    expect(modelStore.updateLoad(id, { b: 0 })).toBe(false);
    expect(modelStore.updateLoad(id, { a: -1 })).toBe(false);
    expect(data()).toEqual(expect.objectContaining({ b: 3 }));
    expect(data().a).toBeUndefined();
  });

  it('what fits is kept; b at the member\'s end is the whole member', () => {
    const { id, data } = beam();
    expect(modelStore.updateLoad(id, { a: 1 })).toBe(true);
    expect(data()).toMatchObject({ a: 1, b: 3 });
    expect(modelStore.updateLoad(id, { b: 5 })).toBe(true);
    expect(data().b).toBeUndefined();
    expect(modelStore.updateLoad(id, { a: 0 })).toBe(true);
    expect(data().a).toBeUndefined();
    // Both ends at once, the new a past the old b: one edit, read as the pair.
    expect(modelStore.updateLoad(id, { a: 4, b: 4.5 })).toBe(true);
    expect(data()).toMatchObject({ a: 4, b: 4.5 });
  });

  it('a point load off its member is refused', () => {
    const { e } = beam();
    const [p] = addLoads([{ type: 'pointOnElement3d', data: { id: 0, elementId: e, a: 2, py: 0, pz: -5, caseId: 1 } }]);
    historyStore.clear();
    expect(modelStore.updateLoad(p!, { a: 9 })).toBe(false);
    expect(modelStore.updateLoad(p!, { a: -0.5 })).toBe(false);
    expect((modelStore.loads.find((l) => l.data.id === p)!.data as { a: number }).a).toBe(2);
    expect(historyStore.undoCount).toBe(0);
    expect(modelStore.updateLoad(p!, { a: 5 })).toBe(true);
  });
});
