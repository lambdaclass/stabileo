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
import { plasticCollapse2D, loadsOffRemoved } from '../plastic-collapse';
import { buildKinematics, workRow } from '../plastic/kinematics';
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
      // px = 20 at mid-length of bar 1: bar 1 carries 15λ before the load and −5λ after it, bar 2
      // carries 5λ. Bar 1 (Np 10) first yields before the load at λ = 2/3. The load acts on bar 1
      // alone, so with N = 10 before it, N = 10 − 20λ after it, and |N| ≤ 10 on both sides,
      // λc = 1 (both halves of bar 1 yield; bar 2 is not needed). The history, which takes bar 1
      // out and leaves its load on the nodes, goes on to 31/3: it is reported as such, not as λc.
      const m = model(6, [1, 2], type, [[1, 'pinned'], [2, 'rollerX']], [
        { type: 'pointOnElement', data: { elementId: 1, a: 3, p: 0, px: 20 } },
      ]);
      const r = plasticCollapse2D(m, { mp: () => Infinity, np: (id) => (id === 1 ? 10 : 100) });
      expect(r.hinges.map((h) => [h.elementId, h.kind])).toEqual([[1, 'axial'], [2, 'axial']]);
      expect(r.hinges[0].loadFactor).toBeCloseTo(2 / 3, 6);
      expect(r.collapseFactor).toBeCloseTo(1, 9);
      expect(r.limit?.historyLambda).toBeCloseTo(31 / 3, 6);
      expect(r.unresolved).toBe(true);
    });
  }
});

describe('the unloading check counts the loads a yielded bar left on its nodes', () => {
  it('a cantilever propped by an inclined bar that carries a transverse load: the bar yields, the base hinges, λc by statics', () => {
    const P = 10, NP = 5, MP = 20;
    const m = {
      nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 0, z: 4 }], [3, { id: 3, x: 4, z: 0 }]]),
      materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3 }]]),
      sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
      elements: new Map([
        [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
        [2, { id: 2, type: 'truss', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      ]),
      supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }], [2, { id: 2, nodeId: 3, type: 'pinned' }]]),
      loads: [{ type: 'pointOnElement', data: { elementId: 2, a: 2 * Math.SQRT2, p: P } }],
    } as unknown as SolverInput;
    const r = plasticCollapse2D(m, { mp: () => MP, np: (id: number) => (id === 2 ? NP : Infinity) });
    expect(r.unresolved).toBeFalsy();
    expect(r.hinges.map((h) => h.kind).sort()).toEqual(['axial', 'bending']);
    const fx = (lambda: number) => lambda * (P / 2) * Math.SQRT1_2;
    expect(fx(r.collapseFactor)).toBeCloseTo(NP * Math.SQRT1_2 + MP / 4, 6);
  });
});

describe('a frame member that yields axially while it carries a transverse span load', () => {
  it('stops the analysis there as a collapse, with that load still on the structure', () => {
    const m = model(4, [1], 'frame', [[1, 'fixed'], [2, 'rollerX']], [
      { type: 'nodal', data: { nodeId: 2, fx: 10, fz: 0, my: 0 } },
      { type: 'distributed', data: { elementId: 1, qI: -1, qJ: -1 } },
    ] as SolverLoad[]);
    const r = plasticCollapse2D(m, { mp: () => 1e6, np: () => 30 });
    expect(r.isMechanism).toBe(true);
    expect(r.collapseFactor).toBeCloseTo(3, 10);
    expect(r.steps).toHaveLength(1);
    expect(r.hinges.map((h) => h.kind)).toEqual(['axial']);
    expect(r.unresolved).toBeUndefined();
  });
});

describe('the drawn mechanism after a bar yields under its own transverse load', () => {
  it('counts that load at the bar ends, so the mechanism turns the way the load does work', async () => {
    const { collapseMechanism } = await import('../plastic/mechanism');
    const { dot } = await import('../plastic/kinematics');
    const P = 10;
    const m = {
      nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 0, z: 4 }], [3, { id: 3, x: 4, z: 0 }]]),
      materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3 }]]),
      sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
      elements: new Map([
        [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
        [2, { id: 2, type: 'truss', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      ]),
      supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }], [2, { id: 2, nodeId: 3, type: 'pinned' }]]),
      loads: [{ type: 'pointOnElement', data: { elementId: 2, a: 2 * Math.SQRT2, p: P } }],
    } as unknown as SolverInput;
    const r = plasticCollapse2D(m, { mp: () => 20, np: (id: number) => (id === 2 ? 5 : Infinity) });
    const view = collapseMechanism(m, r);
    expect(view).not.toBeNull();
    const work = dot(view!.km.work, view!.d);
    expect(work).toBeGreaterThan(0);
    const fx = (P / 2) * Math.SQRT1_2;
    expect(work / Math.abs(view!.hinges[0].theta)).toBeCloseTo(fx * 4, 6);
  });
});

describe('a couple on a bar that yielded', () => {
  it('moves to its end nodes as the force pair the mechanism work counts, not dropped', () => {
    const input = {
      nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 3, z: 4 }]]),
      materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3 }]]),
      sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
      elements: new Map([[1, { id: 1, type: 'truss', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }]]),
      supports: new Map([[1, { id: 1, nodeId: 1, type: 'pinned' }]]),
      loads: [{ type: 'pointOnElement', data: { elementId: 1, a: 2, p: 0, my: 10 } }],
    } as unknown as SolverInput;
    const moved = loadsOffRemoved(input, new Set([1]));
    expect(moved).toEqual([
      { type: 'nodal', data: { nodeId: 1, fx: 10 * 0.8 / 5, fz: -10 * 0.6 / 5, my: 0 } },
      { type: 'nodal', data: { nodeId: 2, fx: -10 * 0.8 / 5, fz: 10 * 0.6 / 5, my: 0 } },
    ].map((l) => ({ ...l, data: { ...l.data, fx: expect.closeTo(l.data.fx, 12), fz: expect.closeTo(l.data.fz, 12) } })));
    const km = buildKinematics(input, [], new Set(), 'rigid');
    const before = workRow(input, km, input.loads), after = workRow(input, km, moved);
    after.forEach((w, i) => expect(w).toBeCloseTo(before[i], 12));
    expect(before.some((w) => Math.abs(w) > 1)).toBe(true);
  });
});
