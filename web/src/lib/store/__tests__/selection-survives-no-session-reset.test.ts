/**
 * Selection state kept outside the visible sets must not outlive a clear or a session reset.
 *
 * - The member selection set aside while shells are picked comes back only to a mode that picks
 *   members, and only if nothing cleared the selection in between: given back to Nodes after a
 *   clear, or to another tab after a switch, it selected members the reader never picked there,
 *   and Delete removed them.
 * - The selection history ("previous selection") forgets the project left behind, through
 *   onSessionReset: its ids would select whatever carries them in the next one.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { uiStore } from '../ui.svelte';

describe('the member selection set aside in Shells mode', () => {
  beforeEach(() => {
    uiStore.selectMode = 'elements';
    uiStore.clearSelection();
  });

  it('comes back when members are picked again', () => {
    uiStore.setSelection(new Set(), new Set([3, 4]), true);
    uiStore.selectMode = 'shells';
    expect([...uiStore.selectedElements]).toEqual([]);
    uiStore.selectMode = 'elements';
    expect([...uiStore.selectedElements]).toEqual([3, 4]);
  });

  it('does not come back after a session reset (tab switch)', () => {
    uiStore.setSelection(new Set(), new Set([3, 4]), true);
    uiStore.selectMode = 'shells';
    // tabs.svelte.ts calls resetSession() and then restores the tab's selectMode.
    uiStore.resetSession();
    uiStore.selectMode = 'elements';
    expect([...uiStore.selectedElements]).toEqual([]);
  });

  it('does not come back after the selection was cleared in Shells mode', () => {
    uiStore.setSelection(new Set(), new Set([7]), true);
    uiStore.selectMode = 'shells';
    uiStore.clearSelection();
    uiStore.selectMode = 'elements';
    expect([...uiStore.selectedElements]).toEqual([]);
  });

  it('is not given to a mode that does not pick members', () => {
    uiStore.setSelection(new Set(), new Set([7]), true);
    uiStore.selectMode = 'shells';
    uiStore.selectMode = 'nodes';
    expect([...uiStore.selectedElements]).toEqual([]);
    // Nor held back for a later return to members.
    uiStore.selectMode = 'elements';
    expect([...uiStore.selectedElements]).toEqual([]);
  });
});

/*
 * The selection history records through an $effect, which the Node test environment does not run,
 * so its own entries cannot be built here. What it relies on can: selection-history.svelte.ts
 * empties itself from an onSessionReset hook, and this pins that resetSession runs such hooks.
 */
describe('state kept outside the store, across a session reset', () => {
  it('is told of every reset, and not of a mere clear', () => {
    let resets = 0;
    uiStore.onSessionReset(() => { resets++; });
    uiStore.clearSelection();
    expect(resets).toBe(0);
    uiStore.resetSession();
    expect(resets).toBe(1);
  });
});
