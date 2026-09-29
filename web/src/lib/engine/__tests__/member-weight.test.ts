/**
 * A member's weight per metre is Σ ρᵢ·Aᵢ for a section drawn in several materials, not ρ times
 * its transformed area; and the quantities split its volume by material.
 */
import { describe, it, expect } from 'vitest';
import { weightPerMetre } from '../member-weight';
import { takeoffFromModel } from '../model-takeoff';

const steel = { id: 1, name: 'F-24', rho: 78.5 }, concrete = { id: 2, name: 'H-30', rho: 24 };
const materials = new Map([[1, steel], [2, concrete]]);
// A filled tube: 43 cm² of steel, 334 cm² of concrete; transformed to steel with n = 0.135.
const filled = { a: 0.0043 + 0.135 * 0.0334, drawn: { areas: [{ materialId: null, a: 0.0043 }, { materialId: 2, a: 0.0334 }] } };

describe('weight per metre', () => {
  it('a plain section: ρ·A', () => {
    expect(weightPerMetre(steel, { a: 0.005 }, materials)).toBeCloseTo(78.5 * 0.005, 12);
  });
  it('a filled tube: each material at its own density, the member\'s for the parts with none', () => {
    expect(weightPerMetre(steel, filled, materials)).toBeCloseTo(78.5 * 0.0043 + 24 * 0.0334, 12);
    expect(weightPerMetre(steel, filled, materials)).not.toBeCloseTo(78.5 * filled.a, 3);
  });
  it('the quantities put the concrete in the concrete bucket', () => {
    const t = takeoffFromModel({
      nodes: new Map([[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 0, y: 0, z: 3 }]]),
      elements: new Map([[1, { id: 1, nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }]]),
      sections: new Map([[1, { id: 1, ...filled }]]),
      materials,
    } as never);
    const byId = new Map(t.byMaterial.map((b) => [b.materialId, b]));
    expect(byId.get(1)!.volume).toBeCloseTo(0.0043 * 3, 12);
    expect(byId.get(2)!.volume).toBeCloseTo(0.0334 * 3, 12);
  });
});
