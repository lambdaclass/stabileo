/**
 * The project's quantities: reinforcement from the schedule's marks by diameter and role, and
 * steel per cubic metre over the detailed members only.
 */
import { describe, it, expect } from 'vitest';
import { projectQuantities, reinforcementTakeoff } from '../quantities';

const model = () => ({
  nodes: new Map([[1, { x: 0, y: 0, z: 0 }], [2, { x: 5, y: 0, z: 0 }], [3, { x: 10, y: 0, z: 0 }]]),
  elements: new Map([
    [1, { id: 1, nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }],
    [2, { id: 2, nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1 }],
  ]),
  sections: new Map([[1, { id: 1, a: 0.3 * 0.6 }]]),
  materials: new Map([[1, { id: 1, name: 'H-30', rho: 25, fy: 30, gradeId: 'H-30' }]]),
});
const mark = (diameterMm: number, quantity: number, cuttingLength: number, massKg: number, role: 'longitudinal' | 'transverse', owners: number[]) =>
  ({ diameterMm, quantity, cuttingLength, massKg, role, ownerElementIds: owners });

describe('quantities', () => {
  it('sums the marks by diameter, and longitudinal apart from transverse', () => {
    const r = reinforcementTakeoff([mark(16, 4, 5.2, 32.8, 'longitudinal', [1]), mark(16, 2, 3, 9.5, 'longitudinal', [1]), mark(8, 26, 1.6, 16.4, 'transverse', [1])])!;
    expect(r.byDiameter.map((d) => d.diameterMm)).toEqual([8, 16]);
    expect(r.byDiameter[1]).toEqual({ diameterMm: 16, quantity: 6, lengthM: 4 * 5.2 + 2 * 3, massKg: 32.8 + 9.5 });
    expect(r.longitudinalKg).toBeCloseTo(42.3, 9);
    expect(r.transverseKg).toBeCloseTo(16.4, 9);
    expect(reinforcementTakeoff([])).toBeNull();
  });

  it('takes the ratio over the detailed members, not the whole model', () => {
    const q = projectQuantities(model() as never, [mark(16, 4, 5.2, 90, 'longitudinal', [1])]);
    expect(q.model.concreteVolume).toBeCloseTo(0.18 * 10, 9);
    expect(q.detailedConcreteVolume).toBeCloseTo(0.18 * 5, 9);
    expect(q.kgPerM3).toBeCloseTo(90 / 0.9, 9);
    const none = projectQuantities(model() as never, []);
    expect(none.reinforcement).toBeNull();
    expect(none.kgPerM3).toBeNull();
  });
});
