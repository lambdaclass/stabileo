/*
 * "Cómputo de materiales" reported no materials on a structure that had just
 * been solved.
 *
 * The take-off it ran reads VERIFICATION RECORDS — its own header says so —
 * so a model with no member checks has no quantities under it at all, and a
 * raft of plates has no member checks by construction. The answer was not
 * wrong so much as about something else: what the structure is MADE OF is a
 * property of the geometry, and the geometry was there the whole time.
 */
import { describe, it, expect } from 'vitest';
import { takeoffFromModel, steelRatio, type TakeoffModel } from '../model-takeoff';

const CONCRETE = { id: 1, name: 'H-25', rho: 24, fy: 25 };
const STEEL = { id: 2, name: 'F-24', rho: 78.5, fy: 235 };

function model(over: Partial<TakeoffModel> = {}): TakeoffModel {
  return {
    nodes: new Map(),
    elements: new Map(),
    sections: new Map([[1, { id: 1, a: 0.1 }]]),
    materials: new Map([[1, CONCRETE], [2, STEEL]]),
    plates: new Map(),
    quads: new Map(),
    ...over,
  } as TakeoffModel;
}

/** A 4 m × 4 m slab, 0.3 m thick, of concrete. */
function raft(): TakeoffModel {
  const nodes = new Map<number, any>([
    [1, { x: 0, y: 0, z: 0 }], [2, { x: 4, y: 0, z: 0 }],
    [3, { x: 4, y: 4, z: 0 }], [4, { x: 0, y: 4, z: 0 }],
  ]);
  return model({
    nodes,
    quads: new Map([[1, { id: 1, nodes: [1, 2, 3, 4], materialId: 1, thickness: 0.3 }]]),
  } as Partial<TakeoffModel>);
}

describe('what the model is made of', () => {
  it('counts a raft that has no members at all — the case that reported nothing', () => {
    const t = takeoffFromModel(raft());
    expect(t.byMaterial.length).toBe(1);
    expect(t.byMaterial[0].volume, '4 × 4 × 0.3').toBeCloseTo(4.8, 9);
    expect(t.concreteVolume).toBeCloseTo(4.8, 9);
    expect(t.byMaterial[0].shellCount).toBe(1);
    expect(t.byMaterial[0].shellArea).toBeCloseTo(16, 9);
  });

  it('weighs it with the material’s own density, and says nothing when there is none', () => {
    expect(takeoffFromModel(raft()).totalWeight, '4.8 m³ × 24 kN/m³').toBeCloseTo(115.2, 6);

    const noRho = raft();
    noRho.materials = new Map([[1, { id: 1, name: 'H-25', fy: 25 }]]);
    expect(takeoffFromModel(noRho).totalWeight, 'no density stated, no weight claimed').toBe(0);
  });

  it('measures a member as its section along its length', () => {
    const t = takeoffFromModel(model({
      nodes: new Map([[1, { x: 0, y: 0, z: 0 }], [2, { x: 0, y: 0, z: 3 }]]),
      elements: new Map([[1, { id: 1, nodeI: 1, nodeJ: 2, materialId: 2, sectionId: 1 }]]),
    } as Partial<TakeoffModel>));
    expect(t.byMaterial[0].memberLength).toBeCloseTo(3, 9);
    expect(t.byMaterial[0].volume, '0.1 m² × 3 m').toBeCloseTo(0.3, 9);
    expect(t.steelWeight).toBeCloseTo(0.3 * 78.5, 6);
  });

  it('groups by material, so a mixed structure reads as two lines', () => {
    const m = raft();
    m.nodes.set(5, { x: 0, y: 0, z: 3 } as never);
    m.elements = new Map([[1, { id: 1, nodeI: 1, nodeJ: 5, materialId: 2, sectionId: 1 }]]) as never;
    const t = takeoffFromModel(m);
    expect(t.byMaterial.map((b) => b.name).sort()).toEqual(['F-24', 'H-25']);
    expect(t.concreteVolume).toBeCloseTo(4.8, 9);
    expect(t.steelWeight).toBeGreaterThan(0);
  });

  it('reports what it could NOT measure instead of silently dropping it', () => {
    // A member pointing at a node that is not there, and a shell with no material.
    const t = takeoffFromModel(model({
      nodes: new Map([[1, { x: 0, y: 0, z: 0 }]]),
      elements: new Map([[7, { id: 7, nodeI: 1, nodeJ: 99, materialId: 1, sectionId: 1 }]]),
      quads: new Map([[3, { id: 3, nodes: [1, 1, 1, 1], materialId: 42, thickness: 0.2 }]]),
    } as Partial<TakeoffModel>));
    expect(t.skipped).toEqual([
      { kind: 'member', id: 7, reason: 'noNodes' },
      { kind: 'shell', id: 3, reason: 'noMaterial' },
    ]);
  });

  it('gives a steel ratio only where there is concrete to divide by', () => {
    expect(steelRatio(takeoffFromModel(raft())), 'a raft with no steel').toBe(0);
    const steelOnly = takeoffFromModel(model({
      nodes: new Map([[1, { x: 0, y: 0, z: 0 }], [2, { x: 1, y: 0, z: 0 }]]),
      elements: new Map([[1, { id: 1, nodeI: 1, nodeJ: 2, materialId: 2, sectionId: 1 }]]),
    } as Partial<TakeoffModel>));
    expect(steelRatio(steelOnly), 'no concrete is not a ratio of zero').toBeNull();
  });

  it('an empty model is empty, not an error', () => {
    const t = takeoffFromModel(model());
    expect(t.byMaterial).toEqual([]);
    expect(t.totalVolume).toBe(0);
  });
});
