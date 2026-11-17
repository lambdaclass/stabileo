import { describe, it, expect, beforeEach } from 'vitest';
import { historyStore, modelStore } from '../../../store';
import { placeFrame, placeWall } from '../../../model/building/build-on-grid';
import { modelLevelCentres } from '../../../store/design-desk';
import type { StructuralGrid } from '../../../model/grid';

const grid: StructuralGrid = {
  axes: [
    { id: 'x0', name: '1', axis: 'x', at: 0 }, { id: 'x1', name: '2', axis: 'x', at: 6 }, { id: 'x2', name: '3', axis: 'x', at: 12 },
    { id: 'y0', name: 'A', axis: 'y', at: 0 }, { id: 'y1', name: 'B', axis: 'y', at: 5 },
  ],
  levels: [{ id: 'N0', name: 'PB', z: 0 }, { id: 'N1', name: 'P1', z: 3 }],
};
let conc = 0;

describe('centres of mass and rigidity by level', () => {
  beforeEach(() => {
    modelStore.clear(); historyStore.clear();
    modelStore.setGrid(grid);
    conc = modelStore.addMaterial({ name: 'H-30', e: 25740, nu: 0.2, rho: 25, fy: 30, fc: 30 });
    const col = modelStore.addSection({ name: '40×40', a: 0.16, iz: 0.002133, iy: 0.002133, b: 0.4, h: 0.4, shape: 'rect' } as never);
    placeFrame(grid, { x: ['x0', 'x2'], y: ['y0', 'y1'], levels: ['N0', 'N1'], columns: { sectionId: col, materialId: conc }, beamsX: { sectionId: col, materialId: conc }, beamsY: { sectionId: col, materialId: conc } }, { fixBase: true });
  });

  it('a symmetric storey has its centres together at the middle', () => {
    const p1 = modelLevelCentres().find((l) => l.levelId === 'N1')!;
    expect(p1.cm!.x).toBeCloseTo(6, 6); expect(p1.cm!.y).toBeCloseTo(2.5, 6);
    expect(p1.cr!.x).toBeCloseTo(6, 6); expect(p1.cr!.y).toBeCloseTo(2.5, 6);
    expect(p1.ex).toBeCloseTo(0, 6);
    // Six columns of 12·E·I/h³ each way.
    expect(p1.kx).toBeCloseTo(6 * 12 * 25740e3 * 0.002133 / 27, 0);
  });

  it('a wall on one side pulls the centre of rigidity to it, and the eccentricity says how far', () => {
    placeWall(grid, { axis: 'x0', from: 'y0', to: 'y1', levelFrom: 'N0', levelTo: 'N1', thickness: 0.2, materialId: conc, meshSize: 1 });
    const p1 = modelLevelCentres().find((l) => l.levelId === 'N1')!;
    // The wall runs along Y on x = 0: it stiffens Y and moves the CR's x toward 0.
    expect(p1.cr!.x).toBeLessThan(3);
    expect(p1.ex!).toBeGreaterThan(2);
  });
});
