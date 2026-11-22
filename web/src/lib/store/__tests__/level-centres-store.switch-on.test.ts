/**
 * Each level's centre of mass and centre of rigidity, read from the model for the results' Centres
 * table: at the grid's levels, or, with none declared, at the elevations the columns run between.
 * Four columns of one storey, one of them twice as stiff: the centre of rigidity moves toward it by
 * the stiffness-weighted mean of the column positions, the centre of mass stays at the middle.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { historyStore, modelStore } from '../index';
import { centreLevels, modelLevelCentres } from '../level-centres';

beforeEach(() => { modelStore.clear(); historyStore.clear(); });

function storey(): void {
  const conc = modelStore.addMaterial({ name: 'H-30', e: 27000, nu: 0.2, rho: 25, fy: 30, fc: 30 });
  const col = modelStore.addSection({ name: '30×30', a: 0.09, iy: 0.3 ** 4 / 12, iz: 0.3 ** 4 / 12, j: 0.1406 * 0.3 ** 4, b: 0.3, h: 0.3, shape: 'rect' } as never);
  const stiff = modelStore.addSection({ name: '30×30 ×2', a: 0.09, iy: 2 * 0.3 ** 4 / 12, iz: 2 * 0.3 ** 4 / 12, j: 0.1406 * 0.3 ** 4, b: 0.3, h: 0.3, shape: 'rect' } as never);
  const beam = modelStore.addSection({ name: '20×40', a: 0.08, iy: 0.2 * 0.4 ** 3 / 12, iz: 0.4 * 0.2 ** 3 / 12, j: 0.001, b: 0.2, h: 0.4, shape: 'rect' } as never);
  const at = [[0, 0], [6, 0], [6, 4], [0, 4]] as const;
  const top = at.map(([x, y], i) => {
    const b = modelStore.addNode(x, y, 0), t = modelStore.addNode(x, y, 3);
    const e = modelStore.addElement(b, t, 'frame');
    modelStore.updateElementSection(e, i === 1 ? stiff : col); modelStore.updateElementMaterial(e, conc);
    modelStore.addSupport(b, 'fixed3d');
    return t;
  });
  top.forEach((t, i) => {
    const e = modelStore.addElement(t, top[(i + 1) % 4]!, 'frame');
    modelStore.updateElementSection(e, beam); modelStore.updateElementMaterial(e, conc);
  });
}

describe('the centres by level the results show', () => {
  it('without grid levels, at the elevations the columns run between', () => {
    storey();
    expect(centreLevels().map((l) => [l.name, l.z])).toEqual([['N0', 0], ['N1', 3]]);
    const [base, floor] = modelLevelCentres();
    expect(base!.cr).toBeNull();
    // The column at (6, 0) carries 2 of 5 parts of the stiffness either way.
    expect(floor!.cr!.x).toBeCloseTo((6 * 2 + 6 * 1) / 5, 9);
    expect(floor!.cr!.y).toBeCloseTo((4 * 1 + 4 * 1) / 5, 9);
    expect(floor!.cm!.x).toBeCloseTo(3, 9);
    expect(floor!.cm!.y).toBeCloseTo(2, 9);
    expect(floor!.ex).toBeCloseTo(3 - 3.6, 9);
    expect(floor!.weight).toBeGreaterThan(0);
  });

  it('at the grid\'s levels when it declares them', () => {
    storey();
    modelStore.setGrid({ axes: [], levels: [{ id: 'pb', name: 'PB', z: 0 }, { id: 'p1', name: 'Piso 1', z: 3 }] } as never);
    expect(modelLevelCentres().map((c) => c.name)).toEqual(['PB', 'Piso 1']);
  });
});
