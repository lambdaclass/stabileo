/**
 * Pins the manual-vs-result selection distinction that the local-axes
 * "When selected" mode and the result-query linked-highlight rely on.
 *
 * - Manual element actions (click, box-select) mark elementSelectionManual=true.
 * - Bulk/result-driven setSelection (result-query, AI, diagnostics) leaves it false.
 * - A manual click AFTER a result-driven selection restores manual=true.
 * - releaseManualSelection() / clearSelection() reset it to false.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { uiStore } from '../ui.svelte';

describe('uiStore manual-selection semantics', () => {
  beforeEach(() => uiStore.clearSelection());

  it('clearSelection resets the manual flag to false', () => {
    uiStore.selectElement(1);
    uiStore.clearSelection();
    expect(uiStore.elementSelectionManual).toBe(false);
    expect(uiStore.selectedElements.size).toBe(0);
  });

  it('selectElement (manual click) marks manual=true and selects the element', () => {
    uiStore.selectElement(5);
    expect(uiStore.elementSelectionManual).toBe(true);
    expect([...uiStore.selectedElements]).toEqual([5]);
  });

  it('setSelection defaults to non-manual (result/query/AI highlight)', () => {
    uiStore.setSelection(new Set(), new Set([1, 2, 3]));
    expect(uiStore.elementSelectionManual).toBe(false);
    expect(uiStore.selectedElements.size).toBe(3);
  });

  it('setSelection(..., true) marks manual (box-select / element-row click)', () => {
    uiStore.setSelection(new Set(), new Set([7, 8]), true);
    expect(uiStore.elementSelectionManual).toBe(true);
  });

  it('a manual click AFTER a result-driven (bulk) selection restores manual=true', () => {
    uiStore.setSelection(new Set(), new Set([1, 2, 3, 4]));   // result-query highlight
    expect(uiStore.elementSelectionManual).toBe(false);
    uiStore.selectElement(2);                                 // manual click
    expect(uiStore.elementSelectionManual).toBe(true);
    expect([...uiStore.selectedElements]).toEqual([2]);
  });

  it('releaseManualSelection hands control back to result-query driving', () => {
    uiStore.selectElement(9);
    expect(uiStore.elementSelectionManual).toBe(true);
    uiStore.releaseManualSelection();
    expect(uiStore.elementSelectionManual).toBe(false);
  });
});
