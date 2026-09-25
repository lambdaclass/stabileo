/**
 * Delete what is selected: every kind at once, one undo step — the operation
 * behind the Delete key and the on-screen button a phone needs.
 */
import { describe, it, expect } from 'vitest';
import { historyStore, modelStore, uiStore } from '../../store';
import { deleteSelection, selectionSummary } from '../delete-selection';

function frame() {
  historyStore.clear(); uiStore.analysisMode = '2d'; modelStore.clear();
  const n = [modelStore.addNode(0, 0), modelStore.addNode(0, 3), modelStore.addNode(4, 3), modelStore.addNode(4, 0)];
  const e = [modelStore.addElement(n[0], n[1]), modelStore.addElement(n[1], n[2]), modelStore.addElement(n[2], n[3])];
  const s = [modelStore.addSupport(n[0], 'fixed' as never), modelStore.addSupport(n[3], 'fixed' as never)];
  const l = modelStore.addNodalLoad(n[1], 10, 0, 0);
  return { n, e, s, l };
}

describe('delete selection', () => {
  it('summarises the selection by kind', () => {
    const { e, s } = frame();
    uiStore.clearSelection();
    uiStore.selectElement(e[1], false);
    uiStore.selectedSupports = new Set([s[0]]);
    expect(selectionSummary()).toEqual([{ kind: 'elements', n: 1 }, { kind: 'supports', n: 1 }]);
  });

  it('deletes every selected kind in one undo step, and clears the selection', () => {
    const { e, s, l } = frame();
    uiStore.clearSelection();
    uiStore.selectElement(e[1], false);
    uiStore.selectedSupports = new Set([s[0]]);
    uiStore.selectedLoads = new Set([l]);
    expect(deleteSelection()).toBe(true);
    expect(modelStore.elements.has(e[1])).toBe(false);
    expect(modelStore.supports.has(s[0])).toBe(false);
    expect(modelStore.loads.length).toBe(0);
    expect(selectionSummary()).toEqual([]);
    historyStore.undo();
    expect(modelStore.elements.has(e[1])).toBe(true);
    expect(modelStore.supports.has(s[0])).toBe(true);
    expect(modelStore.loads.length).toBe(1);
  });

  it('does nothing with nothing selected', () => {
    frame();
    uiStore.clearSelection();
    expect(deleteSelection()).toBe(false);
    expect(modelStore.elements.size).toBe(3);
  });
});
