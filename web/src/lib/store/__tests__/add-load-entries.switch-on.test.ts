import { describe, it, expect } from 'vitest';
import { historyStore, modelStore } from '..';

describe('many loads written at once', () => {
  it('take consecutive new ids after the existing ones, in one undo step', () => {
    modelStore.clear(); historyStore.clear();
    const n = modelStore.addNode(0, 0, 0);
    const first = modelStore.addLoadEntry({ type: 'nodal3d', data: { id: 0, nodeId: n, fx: 1, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 } } as never);
    const ids = modelStore.addLoadEntries(Array.from({ length: 3 }, (_, k) => ({ type: 'nodal3d', data: { id: 0, nodeId: n, fx: k, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 } }) as never));
    expect(ids).toEqual([first + 1, first + 2, first + 3]);
    expect(modelStore.loads.map((l) => (l.data as { fx: number }).fx)).toEqual([1, 0, 1, 2]);
    historyStore.undo();
    expect(modelStore.loads).toHaveLength(1);
    expect(modelStore.addLoadEntries([])).toEqual([]);
  });
});
