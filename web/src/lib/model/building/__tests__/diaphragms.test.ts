import { describe, it, expect, beforeEach } from 'vitest';
import { historyStore, modelStore } from '../../../store';
import { placeFrame } from '../build-on-grid';
import { addLevelDiaphragms } from '../diaphragms';
import type { StructuralGrid } from '../../grid';

const grid: StructuralGrid = {
  axes: [
    { id: 'A', name: 'A', axis: 'x', at: 0 }, { id: 'B', name: 'B', axis: 'x', at: 6 },
    { id: '1', name: '1', axis: 'y', at: 0 }, { id: '2', name: '2', axis: 'y', at: 5 },
  ],
  levels: [{ id: 'N0', name: 'PB', z: 0 }, { id: 'N1', name: 'P1', z: 3 }, { id: 'N2', name: 'P2', z: 6 }],
};
const S = { sectionId: 1, materialId: 1 };

describe('a rigid diaphragm per level', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); });

  it('one per level above the supported base, never twice, in one undo step', () => {
    placeFrame(grid, { x: ['A', 'B'], y: ['1', '2'], levels: ['N0', 'N2'], columns: S, beamsX: S, beamsY: S }, { fixBase: true });
    const r = addLevelDiaphragms();
    expect(r).toEqual({ added: 2, base: 1, existing: 0 });
    expect(modelStore.constraints.every((c) => c.type === 'diaphragm' && c.slaveNodes.length === 3)).toBe(true);
    expect(addLevelDiaphragms()).toEqual({ added: 0, base: 1, existing: 2 });
    historyStore.undo();
    expect(modelStore.constraints).toHaveLength(0);
  });
});
