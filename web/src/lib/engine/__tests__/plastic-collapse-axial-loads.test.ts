/**
 * Plastic collapse with loads along members (Codex review of #437). Both failed before the fix.
 *
 * - A sign-changing axial span load makes |N| peak inside a bar, not at its ends: a truss was
 *   read at its ends only and yielded far too late.
 * - Angled and global point loads reach the solve with an axial part (`px`). When the member
 *   they act on yielded axially, that part was deleted with it (the members that remain lost
 *   load), and on a frame a purely axial point load was taken for a transverse one: immediate
 *   collapse.
 */
import { describe, it, expect } from 'vitest';
import { plasticCollapse2D } from '../plastic-collapse';
import type { SolverInput, SolverLoad } from '../types';

function model(L: number, elementIds: number[], type: 'truss' | 'frame', supports: Array<[number, string]>, loads: SolverLoad[]): SolverInput {
  return {
    nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: L, z: 0 }]]),
    materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
    elements: new Map(elementIds.map((id) => [id, { id, type, nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }])),
    supports: new Map(supports.map(([nodeId, t], k) => [k + 1, { id: k + 1, nodeId, type: t as never }])),
    loads,
  } as unknown as SolverInput;
}

describe('plastic collapse under loads along members', () => {
  it('a truss yields where |N| peaks inside it, not at its ends', () => {
    // Fixed at both ends, 4 m, q_x = 10 → −10 kN/m over [1.8, 2.2]: the load's resultant is 0,
    // the ends carry N = 1/15 and midspan N = −14/15. With Np = 1, λc = 15/14 (it was 15).
    const m = model(4, [1], 'truss', [[1, 'fixed'], [2, 'fixed']], [
      { type: 'axialDistributed', data: { elementId: 1, qI: 10, qJ: -10, a: 1.8, b: 2.2 } },
    ]);
    const r = plasticCollapse2D(m, { mp: () => Infinity, np: () => 1 });
    expect(r.collapseFactor).toBeCloseTo(15 / 14, 6);
    expect(r.hinges[0].kind).toBe('axial');
    expect(r.hinges[0].x).toBeCloseTo(2, 6);
  });

  for (const type of ['truss', 'frame'] as const) {
    it(`${type}: an axial point load stays on the structure after its member yields`, () => {
      // Two equal bars side by side, pinned at 1, on a roller at 2 that is free along them.
      // px = 20 at mid-length of bar 1: lever rule 10 to each node; the 10 at node 2 is shared,
      // so bar 1 carries 15 before the load and bar 2 carries 5. Bar 1 (Np 10) yields at
      // λ = 2/3; its load stays at the nodes, so bar 2 then carries all 10 at node 2 and yields
      // (Np 100) at λ = 2/3 + (100 − 10/3)/10 = 31/3. Before the fix the load went with bar 1:
      // λc = 2/3 (and for a frame, "collapse" at the first yield).
      const m = model(6, [1, 2], type, [[1, 'pinned'], [2, 'rollerX']], [
        { type: 'pointOnElement', data: { elementId: 1, a: 3, p: 0, px: 20 } },
      ]);
      const r = plasticCollapse2D(m, { mp: () => Infinity, np: (id) => (id === 1 ? 10 : 100) });
      expect(r.hinges.map((h) => [h.elementId, h.kind])).toEqual([[1, 'axial'], [2, 'axial']]);
      expect(r.hinges[0].loadFactor).toBeCloseTo(2 / 3, 6);
      expect(r.collapseFactor).toBeCloseTo(31 / 3, 6);
      expect(r.isMechanism).toBe(true);
    });
  }
});
