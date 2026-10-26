import { describe, it, expect, beforeEach } from 'vitest';
import { historyStore, modelStore } from '../../../store';
import { placeFrame, placeWall } from '../build-on-grid';
import { physicalGroups, physicalSection, physicalThickness, setPhysicalSection, setPhysicalThickness } from '../../../store/physical';
import type { StructuralGrid } from '../../grid';

const grid: StructuralGrid = {
  axes: [
    { id: 'A', name: 'A', axis: 'x', at: 0 }, { id: 'B', name: 'B', axis: 'x', at: 6 },
    { id: '1', name: '1', axis: 'y', at: 0 }, { id: '2', name: '2', axis: 'y', at: 5 },
  ],
  levels: [{ id: 'N0', name: 'PB', z: 0 }, { id: 'N1', name: 'P1', z: 3 }, { id: 'N2', name: 'P2', z: 6 }],
};

describe('editing an element edits its pieces', () => {
  beforeEach(() => { modelStore.clear(); historyStore.clear(); });

  it('a column\'s section goes to all its bars, a wall\'s thickness to all its shells, each one undo step', () => {
    placeFrame(grid, { x: ['A', 'A'], y: ['1', '1'], levels: ['N0', 'N2'], columns: { sectionId: 1, materialId: 1 }, beamsX: null, beamsY: null });
    placeWall(grid, { axis: '2', from: 'A', to: 'B', levelFrom: 'N0', levelTo: 'N1', thickness: 0.2, materialId: 1, meshSize: 1 });
    const sec = modelStore.addSection({ name: '40×40', a: 0.16, iz: 0.002133, iy: 0.002133, b: 0.4, h: 0.4, shape: 'rect' } as never);
    const col = physicalGroups().find((g) => g.physical.kind === 'column')!;
    const wall = physicalGroups().find((g) => g.physical.kind === 'wall')!;
    setPhysicalSection(col.id, sec);
    expect(physicalSection(col)).toBe(sec);
    setPhysicalThickness(wall.id, 0.25);
    expect(physicalThickness(wall)).toBe(0.25);
    historyStore.undo();
    expect(physicalThickness(wall)).toBe(0.2);
    historyStore.undo();
    expect(physicalSection(col)).toBe(1);
  });
});
