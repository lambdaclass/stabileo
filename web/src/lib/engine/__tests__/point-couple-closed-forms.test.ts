/**
 * A point couple on a member, through the WASM boundary the app uses.
 *
 * The engine's equivalent loads for a couple carried the wrong sign on their
 * two moment terms (engine/src/element/fef.rs). The Rust tests pin the fix at
 * the source; this pins it where the app meets it, against closed forms:
 * a cantilever's wall takes exactly −M, a simple beam reacts ±M/L.
 */
import { describe, it, expect } from 'vitest';
import { solve } from '../wasm-solver';
import type { SolverInput } from '../types';

function beam(supports: Array<[number, string]>, a: number, m: number): SolverInput {
  return {
    nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 5, z: 0 }]]),
    materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
    elements: new Map([[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }]]),
    supports: new Map(supports.map(([nodeId, type], k) => [k + 1, { id: k + 1, nodeId, type }])),
    loads: [{ type: 'pointOnElement', data: { elementId: 1, a, p: 0, my: m } }],
  } as unknown as SolverInput;
}

describe('a point couple on a member', () => {
  it('cantilever: the wall takes −M, the tip rotates M·a/EI and rises M·a·(L − a/2)/EI', () => {
    const r = solve(beam([[1, 'fixed']], 2, 6));
    const EI = 200e6 * 1e-4;
    expect(r.reactions[0].my).toBeCloseTo(-6, 9);
    const tip = r.displacements.find((d) => d.nodeId === 2)!;
    expect(tip.ry).toBeCloseTo((6 * 2) / EI, 12);
    expect(tip.uz).toBeCloseTo((6 * 2 * (5 - 1)) / EI, 12);
  });

  it('simple beam: ±M/L, wherever the couple sits', () => {
    for (const a of [1, 2, 3.5]) {
      const r = solve(beam([[1, 'pinned'], [2, 'rollerX']], a, 6));
      expect(r.reactions.find((x) => x.nodeId === 1)!.rz).toBeCloseTo(1.2, 9);
      expect(r.reactions.find((x) => x.nodeId === 2)!.rz).toBeCloseTo(-1.2, 9);
    }
  });
});
