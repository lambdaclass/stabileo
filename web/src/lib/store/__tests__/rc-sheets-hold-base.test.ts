import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { historyStore } from '../history.svelte';
import '../index';
import { supportWallBase } from '../rc-sheets-resize';

describe('holding a wall base all along', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); });

  it('gives the base nodes nothing holds the support the base already has, in one undo step', () => {
    const n = [0, 1, 2, 3].map((x) => modelStore.addNode(x, 0, 0));
    modelStore.addSupport(n[0]!, 'pinned3d');
    const row = { family: 'wall', demand: { base: { nodes: 4, held: 1, unheld: [n[1], n[2], n[3]] } } } as never;
    expect(supportWallBase(row)).toBe(3);
    const types = [...modelStore.supports.values()].map((s) => [s.nodeId, s.type]);
    expect(types).toEqual(expect.arrayContaining([[n[1], 'pinned3d'], [n[2], 'pinned3d'], [n[3], 'pinned3d']]));
    historyStore.undo();
    expect(modelStore.supports.size).toBe(1);
  });

  it('does nothing for a wall already held, or another family', () => {
    expect(supportWallBase({ family: 'wall', demand: { base: { nodes: 2, held: 2, unheld: [] } } } as never)).toBe(0);
    expect(supportWallBase({ family: 'beam' } as never)).toBe(0);
  });
});
