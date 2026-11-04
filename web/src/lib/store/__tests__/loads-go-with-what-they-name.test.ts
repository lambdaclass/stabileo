/**
 * A load names a node or a member by its number, and numbers are reused. Deleting the node or the
 * member takes every load on it, whatever its type, in the same undo step; and a load that names
 * one the model does not have (an older file, a paste) is refused by the solve, by number, rather
 * than dropped without a word.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { historyStore } from '../history.svelte';
import { uiStore } from '../ui.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { modelStore.clear(); historyStore.clear(); uiStore.analysisMode = 'pro'; });
afterEach(() => { uiStore.analysisMode = '3d'; });

/** A triangle a-b-c on fixed a and c, a load at b, and a tendon on b-c. */
function tendonFrame() {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(3, 0, 3), c = modelStore.addNode(6, 0, 0);
  modelStore.addElement(a, b); const beam = modelStore.addElement(b, c); modelStore.addElement(a, c);
  modelStore.addSupport(a, 'fixed3d' as never); modelStore.addSupport(c, 'fixed3d' as never);
  modelStore.addNodalLoad3D(b, 10, 0, 0, 0, 0, 0, 1);
  modelStore.addLoadEntry({ type: 'prestress3d', data: { id: 0, elementId: beam, force: 500, eI: 0, eM: -0.2, eJ: 0 } });
  historyStore.clear();
  return { a, b, c, beam };
}
const tendons = () => modelStore.loads.filter((l) => l.type === 'prestress3d');

describe('a member deleted', () => {
  it('takes its tendon with it, and undo brings both back', () => {
    const { beam } = tendonFrame();
    modelStore.removeElement(beam);
    expect(tendons()).toHaveLength(0);
    historyStore.undo();
    expect(modelStore.elements.has(beam)).toBe(true);
    expect(tendons().map((l) => l.data.elementId)).toEqual([beam]);
  });
});

describe('a node deleted', () => {
  it('takes its imposed displacement with it, and the solve still runs', () => {
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3), c = modelStore.addNode(4, 0, 3);
    modelStore.addElement(a, b); modelStore.addElement(b, c);
    modelStore.addSupport(a, 'fixed3d' as never); modelStore.addSupport(c, 'fixed3d' as never);
    modelStore.addNodalLoad3D(b, 10, 0, 0, 0, 0, 0, 1);
    modelStore.addLoadEntry({ type: 'displacement3d', data: { id: 0, nodeId: c, dz: -0.01 } });
    modelStore.removeNode(c);
    expect(modelStore.loads.filter((l) => l.type === 'displacement3d')).toHaveLength(0);
    expect(typeof modelStore.solve3D(false, false, true)).not.toBe('string');
  });
});

describe('a load on a member or a node the model does not have', () => {
  it('is refused by the solve, naming the number, not dropped', () => {
    tendonFrame();
    modelStore.addLoadEntry({ type: 'prestress3d', data: { id: 0, elementId: 99, force: 500, eI: 0, eM: -0.2, eJ: 0 } });
    const r = modelStore.solve3D(false, false, true);
    expect(typeof r).toBe('string');
    expect(r as string).toContain('99');
  });

  it('on a node, too, and the combinations refuse it alike', () => {
    tendonFrame();
    modelStore.addLoadEntry({ type: 'nodal3d', data: { id: 0, nodeId: 77, fx: 1, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 } });
    const r = modelStore.solve3D(false, false, true);
    expect(r as string).toContain('77');
    modelStore.addCombination('1.0 D', [{ caseId: 1, factor: 1 }]);
    const c = modelStore.solveCombinations3D(false, false, true);
    expect(c as string).toContain('77');
  });
});
