/**
 * CP5 — shell offsets (gated). Pins the ephemeral expansion that makes shell
 * offsets mechanically equivalent to a rigid mid-surface offset WITHOUT any
 * solver change: per-corner helper nodes + all-6-DOF rigid eccentric
 * constraints, reusing the same EccentricConnection as member offsets.
 */
import { describe, it, expect } from 'vitest';
import { expandShellOffsets, modelHasShellOffsets, hasShellOffset } from '../shell-offsets';
import type { SolverInput3D } from '../types-3d';
import type { Quad, Plate } from '../../store/model.svelte';

function baseInput(): SolverInput3D {
  // Unit square quad in the XY plane, nodes 1..4 CCW.
  return {
    nodes: new Map([
      [1, { id: 1, x: 0, y: 0, z: 0 }],
      [2, { id: 2, x: 1, y: 0, z: 0 }],
      [3, { id: 3, x: 1, y: 1, z: 0 }],
      [4, { id: 4, x: 0, y: 1, z: 0 }],
    ]),
    materials: new Map(),
    sections: new Map(),
    elements: new Map(),
    supports: new Map(),
    loads: [],
    quads: new Map([[7, { id: 7, nodes: [1, 2, 3, 4], materialId: 1, thickness: 0.2 }]]),
    plates: new Map(),
    constraints: [],
  };
}

describe('modelHasShellOffsets / hasShellOffset', () => {
  it('detects a non-zero offset, ignores zero', () => {
    expect(hasShellOffset({ offset: { frame: 'global', x: 0, y: 0, z: 0.1 } })).toBe(true);
    expect(hasShellOffset({ offset: { frame: 'global', x: 0, y: 0, z: 0 } })).toBe(false);
    expect(hasShellOffset({})).toBe(false);
    const quads = new Map<number, Quad>([[7, { id: 7, nodes: [1, 2, 3, 4], materialId: 1, thickness: 0.2, offset: { frame: 'local', x: 0, y: 0, z: -0.1 } }]]);
    expect(modelHasShellOffsets(undefined, quads)).toBe(true);
  });
});

describe('expandShellOffsets', () => {
  it('no-op when no shell carries an offset', () => {
    const input = baseInput();
    const quads = new Map<number, Quad>([[7, { id: 7, nodes: [1, 2, 3, 4], materialId: 1, thickness: 0.2 }]]);
    const helpers = expandShellOffsets(input, new Map(), quads);
    expect(helpers.size).toBe(0);
    expect(input.nodes.size).toBe(4);
    expect(input.quads!.get(7)!.nodes).toEqual([1, 2, 3, 4]);
    expect(input.constraints!.length).toBe(0);
  });

  it('helper ids are max-node+sequential and retarget the solver quad (model array untouched)', () => {
    const input = baseInput();
    const modelArray: [number, number, number, number] = [1, 2, 3, 4];
    // The solver input reuses the model's nodes array reference (as buildSolverInput3D does).
    input.quads!.set(7, { id: 7, nodes: modelArray, materialId: 1, thickness: 0.2 });
    const quads = new Map<number, Quad>([[7, { id: 7, nodes: modelArray, materialId: 1, thickness: 0.2, offset: { frame: 'global', x: 0, y: 0, z: 0.5 } }]]);

    expandShellOffsets(input, new Map(), quads);

    // 4 helper nodes 5..8 created at z = 0.5
    expect(input.nodes.size).toBe(8);
    for (let h = 5; h <= 8; h++) expect(input.nodes.get(h)!.z).toBeCloseTo(0.5, 9);
    // solver quad now points at helpers; model's array is NOT mutated
    expect(input.quads!.get(7)!.nodes).toEqual([5, 6, 7, 8]);
    expect(modelArray).toEqual([1, 2, 3, 4]);
    // 4 all-rigid eccentric constraints, master = original corner
    const ec = input.constraints!.filter((c: any) => c.type === 'eccentricConnection');
    expect(ec.length).toBe(4);
    expect((ec[0] as any).masterNode).toBe(1);
    expect((ec[0] as any).slaveNode).toBe(5);
    expect((ec[0] as any).offsetZ).toBeCloseTo(0.5, 9);
    expect((ec[0] as any).releases).toEqual([false, false, false, false, false, false]);
  });

  it('local offset along normal resolves to the global normal direction', () => {
    const input = baseInput();
    const quads = new Map<number, Quad>([[7, { id: 7, nodes: [1, 2, 3, 4], materialId: 1, thickness: 0.2, offset: { frame: 'local', x: 0, y: 0, z: 0.3 } }]]);
    expandShellOffsets(input, new Map(), quads);
    // Square in XY → normal is +Z, so a local-z offset of 0.3 lands helpers at z=+0.3
    for (let h = 5; h <= 8; h++) expect(input.nodes.get(h)!.z).toBeCloseTo(0.3, 9);
  });

  it('plate (3 corners) creates 3 helpers', () => {
    const input = baseInput();
    input.quads = new Map();
    input.plates = new Map([[2, { id: 2, nodes: [1, 2, 3], materialId: 1, thickness: 0.15 }]]);
    const plates = new Map<number, Plate>([[2, { id: 2, nodes: [1, 2, 3], materialId: 1, thickness: 0.15, offset: { frame: 'global', x: 0, y: 0, z: 0.1 } }]]);
    const helpers = expandShellOffsets(input, plates, new Map());
    expect(helpers.size).toBe(3);
    expect(input.plates!.get(2)!.nodes).toEqual([5, 6, 7]);
  });
});
