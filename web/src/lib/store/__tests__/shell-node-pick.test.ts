/**
 * CP4 — shell modeling UX (viewport node-pick).
 * Pins the pick state machine the ProShellTab creators rely on: start sets a
 * target+capacity, pushes dedupe and fill in order, and the buffer auto-stops
 * at capacity while keeping the picked nodes for the creator to read.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { uiStore } from '../ui.svelte';

describe('uiStore shell node-pick', () => {
  beforeEach(() => uiStore.cancelShellNodePick());

  it('start sets active target + capacity and clears prior selections', () => {
    uiStore.selectElement(3);
    uiStore.startShellNodePick('plate', 3);
    expect(uiStore.shellNodePick.active).toBe(true);
    expect(uiStore.shellNodePick.target).toBe('plate');
    expect(uiStore.shellNodePick.capacity).toBe(3);
    expect(uiStore.shellNodePick.picked).toEqual([]);
    expect(uiStore.selectedElements.size).toBe(0);
  });

  it('pushes fill in click order and highlight the picked nodes', () => {
    uiStore.startShellNodePick('quad', 4);
    uiStore.pushShellNodePick(10);
    uiStore.pushShellNodePick(20);
    expect(uiStore.shellNodePick.picked).toEqual([10, 20]);
    expect([...uiStore.selectedNodes]).toEqual([10, 20]);
    expect(uiStore.shellNodePick.active).toBe(true); // not full yet
  });

  it('ignores duplicate node ids', () => {
    uiStore.startShellNodePick('plate', 3);
    uiStore.pushShellNodePick(5);
    uiStore.pushShellNodePick(5);
    expect(uiStore.shellNodePick.picked).toEqual([5]);
  });

  it('auto-stops at capacity but keeps the picked buffer', () => {
    uiStore.startShellNodePick('plate', 3);
    uiStore.pushShellNodePick(1);
    uiStore.pushShellNodePick(2);
    uiStore.pushShellNodePick(3);
    expect(uiStore.shellNodePick.active).toBe(false);
    expect(uiStore.shellNodePick.picked).toEqual([1, 2, 3]);
    // further pushes are ignored once inactive
    uiStore.pushShellNodePick(4);
    expect(uiStore.shellNodePick.picked).toEqual([1, 2, 3]);
  });

  it('cancel resets the buffer', () => {
    uiStore.startShellNodePick('mesh', 4);
    uiStore.pushShellNodePick(7);
    uiStore.cancelShellNodePick();
    expect(uiStore.shellNodePick.active).toBe(false);
    expect(uiStore.shellNodePick.target).toBe(null);
    expect(uiStore.shellNodePick.picked).toEqual([]);
  });
});
