/**
 * A basement wall's earth pressure, defined by the wall. A 5 m wall 3 m deep, grade at its top,
 * γ = 18 kN/m³, K = 0,5, q = 10 kPa: the soil pushes K·(γ·H²/2 + q·H)·L = 0,5·(81 + 30)·5 =
 * 277,5 kN, all of it into the soil's side's normal. Applied again it replaces itself.
 */
import { describe, it, expect } from 'vitest';
import { historyStore, modelStore } from '..';
import { placeWall } from '../../model/building/build-on-grid';
import { physicalGroups } from '../physical';
import { applyEarthPressure } from '../earth-pressure';
import type { StructuralGrid } from '../../model/grid';

const grid: StructuralGrid = {
  axes: [{ id: 'x0', name: '1', axis: 'x', at: 0 }, { id: 'x1', name: '2', axis: 'x', at: 5 }, { id: 'y0', name: 'A', axis: 'y', at: 0 }],
  levels: [{ id: 'S', name: 'Sub', z: -3 }, { id: 'P', name: 'PB', z: 0 }],
};

describe('earth pressure on a basement wall', () => {
  it('pushes K·(γH²/2 + qH)·L into the wall, once', () => {
    modelStore.clear(); historyStore.clear();
    const mat = modelStore.addMaterial({ name: 'H-25', e: 23500, nu: 0.2, rho: 25, fy: 25, fc: 25 });
    expect(placeWall(grid, { axis: 'y0', from: 'x0', to: 'x1', levelFrom: 'S', levelTo: 'P', thickness: 0.25, materialId: mat, meshSize: 1 }).created).toBe(1);
    const wall = physicalGroups().find((g) => g.physical.kind === 'wall')!;
    const soil = { gradeZ: 0, gamma: 18, k: 0.5, surcharge: 10, side: { x: 2.5, y: -1 } };
    const r = applyEarthPressure([wall.id], soil);
    expect(r.shells).toBe((wall.members.quads ?? []).length);
    // Pushed from the soil (−y) toward +y, 277,5 kN.
    expect(r.force.y).toBeCloseTo(277.5, 6);
    expect(Math.abs(r.force.x)).toBeLessThan(1e-6);
    const total = () => {
      const loads = modelStore.model.loads.filter((l) => l.type === 'surface3d' && (l.data as { caseId: number }).caseId === r.caseId);
      // The pressure integrates to the resultant: area × mean pressure, by the generator's own forces.
      return loads.length;
    };
    const n = total();
    expect(n).toBe(r.shells);
    applyEarthPressure([wall.id], soil);
    expect(total()).toBe(n);
    expect(physicalGroups().find((g) => g.id === wall.id)!.physical.retains).toEqual(soil);
  });
});
