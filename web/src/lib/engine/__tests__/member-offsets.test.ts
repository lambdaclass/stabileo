import { describe, it, expect } from 'vitest';
import { solve3D } from '../wasm-solver';
import {
  expandMemberOffsets,
  pruneHelperNodeResults,
  hasMemberOffset,
  modelHasMemberOffsets,
  offsetVecToSolver,
} from '../member-offsets';
import type { SolverInput3D, SolverNode3D, AnalysisResults3D } from '../types-3d';

const MAT = { id: 1, e: 210e9, nu: 0.3 };
const SEC = { id: 1, a: 0.01, iz: 8.33e-6, iy: 8.33e-6, j: 1e-5 };

function frameElem(id: number, ni: number, nj: number): any {
  return {
    id, type: 'frame', nodeI: ni, nodeJ: nj, materialId: 1, sectionId: 1,
    releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false,
    releaseMzEnd: false, releaseTStart: false, releaseTEnd: false,
  };
}

/** Beam along +X from (0,0,0) to (2,0,0), fixed at node 1, axial Fx at node 2. */
function makeInput(): SolverInput3D {
  return {
    nodes: new Map<number, SolverNode3D>([
      [1, { id: 1, x: 0, y: 0, z: 0 }],
      [2, { id: 2, x: 2, y: 0, z: 0 }],
    ]),
    materials: new Map([[1, MAT]]),
    sections: new Map([[1, SEC]]),
    elements: new Map([[1, frameElem(1, 1, 2)]]),
    supports: new Map([[0, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }]]),
    loads: [{ type: 'nodal', data: { nodeId: 2, fx: 100, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 } } as any],
  } as SolverInput3D;
}

const offsetEl = (i: any, j: any, frame: 'global' | 'local' = 'global') =>
  new Map<number, any>([[1, { id: 1, offset: { frame, i, j } }]]);

describe('member-offsets: detection + vector conversion', () => {
  it('hasMemberOffset only when a non-zero offset exists', () => {
    expect(hasMemberOffset({})).toBe(false);
    expect(hasMemberOffset({ offset: { frame: 'global', i: { x: 0, y: 0, z: 0 } } })).toBe(false);
    expect(hasMemberOffset({ offset: { frame: 'global', j: { x: 0, y: 0, z: 0.3 } } })).toBe(true);
    expect(modelHasMemberOffsets([{ offset: { frame: 'global', i: { x: 1, y: 0, z: 0 } } } as any])).toBe(true);
  });

  it('offsetVecToSolver: global passes through; local projects onto axes', () => {
    const axes = { ex: [1, 0, 0] as [number, number, number], ey: [0, 1, 0] as [number, number, number], ez: [0, 0, 1] as [number, number, number] };
    expect(offsetVecToSolver({ x: 1, y: 2, z: 3 }, 'global', axes)).toEqual({ x: 1, y: 2, z: 3 });
    // local z=0.3 on a +X member with ez=+Z → global (0,0,0.3)
    expect(offsetVecToSolver({ x: 0, y: 0, z: 0.3 }, 'local', axes)).toEqual({ x: 0, y: 0, z: 0.3 });
  });
});

describe('member-offsets: ephemeral expansion', () => {
  it('6a: no-offset model leaves the solver input unchanged', () => {
    const input = makeInput();
    const before = { nodes: input.nodes.size, constraints: (input.constraints ?? []).length, nI: input.elements.get(1)!.nodeI, nJ: input.elements.get(1)!.nodeJ };
    const helpers = expandMemberOffsets(input, new Map());
    expect(helpers.size).toBe(0);
    expect(input.nodes.size).toBe(before.nodes);
    expect((input.constraints ?? []).length).toBe(before.constraints);
    expect(input.elements.get(1)!.nodeI).toBe(before.nI);
    expect(input.elements.get(1)!.nodeJ).toBe(before.nJ);
  });

  it('6b: one offset beam → 2 helper nodes + 2 eccentric constraints + element retargeted', () => {
    const input = makeInput();
    const helpers = expandMemberOffsets(input, offsetEl({ x: 0, y: 0, z: 0.3 }, { x: 0, y: 0, z: 0.3 }));
    expect(helpers.size).toBe(2);
    expect(input.nodes.size).toBe(4); // 2 real + 2 helpers
    const ecc = (input.constraints ?? []).filter((c: any) => c.type === 'eccentricConnection');
    expect(ecc.length).toBe(2);
    // Element no longer references the real joints directly.
    const el = input.elements.get(1)!;
    expect(helpers.has(el.nodeI)).toBe(true);
    expect(helpers.has(el.nodeJ)).toBe(true);
    // Masters are the real joints; helpers placed at joint + offset.
    const masters = ecc.map((c: any) => c.masterNode).sort();
    expect(masters).toEqual([1, 2]);
    for (const c of ecc as any[]) {
      const helper = input.nodes.get(c.slaveNode)!;
      const joint = input.nodes.get(c.masterNode)!;
      expect(helper.z - joint.z).toBeCloseTo(0.3, 9);
    }
  });

  it('6b2: helper ids are deterministic (max real id + sequential)', () => {
    const a = makeInput(); expandMemberOffsets(a, offsetEl({ x: 0, y: 0, z: 0.3 }, { x: 0, y: 0, z: 0.3 }));
    const b = makeInput(); expandMemberOffsets(b, offsetEl({ x: 0, y: 0, z: 0.3 }, { x: 0, y: 0, z: 0.3 }));
    expect([...a.nodes.keys()].sort()).toEqual([...b.nodes.keys()].sort());
    expect([...a.nodes.keys()]).toContain(3);
    expect([...a.nodes.keys()]).toContain(4);
  });

  it('6d: an element without offset metadata produces no helpers (ephemeral — nothing persisted)', () => {
    const input = makeInput();
    const helpers = expandMemberOffsets(input, new Map([[1, { id: 1 }]]));
    expect(helpers.size).toBe(0);
    expect(input.nodes.size).toBe(2);
  });
});

describe('member-offsets: real eccentricity through the solver', () => {
  it('6e: an offset beam under axial load develops My ≈ F·e while a centered beam does not', () => {
    const F = 100, e = 0.3;
    // Centered reference
    const ref = makeInput();
    const refRes = solve3D(ref) as AnalysisResults3D;
    expect(typeof refRes).not.toBe('string');
    const refEf = refRes.elementForces.find(f => f.elementId === 1)!;
    expect(Math.abs(refEf.myEnd)).toBeLessThan(1e-3); // straight axial member: no bending
    // Sanity: centered model (no constraints) reports the axial reaction normally.
    expect(refRes.reactions.reduce((s, r) => s + r.fx, 0)).toBeCloseTo(-F, 1);

    // Offset beam (both ends shifted +Z by e)
    const off = makeInput();
    expandMemberOffsets(off, offsetEl({ x: 0, y: 0, z: e }, { x: 0, y: 0, z: e }));
    const offRes = solve3D(off) as AnalysisResults3D;
    expect(typeof offRes).not.toBe('string');
    const offEf = offRes.elementForces.find(f => f.elementId === 1)!;
    // Eccentric axial → real internal bending moment about Y ≈ F·e.
    expect(Math.abs(offEf.myEnd)).toBeCloseTo(F * e, 1);

    // 6f: element forces still keyed by the ORIGINAL user element id.
    expect(offRes.elementForces.some(f => f.elementId === 1)).toBe(true);

    // Not a mechanism: the loaded joint has a finite, real displacement.
    const d2 = offRes.displacements.find(d => d.nodeId === 2)!;
    expect(Number.isFinite(d2.ux)).toBe(true);
    expect(Math.abs(d2.ux)).toBeGreaterThan(0);
  });

  it('audit: Y-offset → Mz, Z-offset → My, signs flip with direction, no My/Mz mixup', () => {
    const F = 100, e = 0.2;
    const run = (v: { x: number; y: number; z: number }) => {
      const m = makeInput();
      expandMemberOffsets(m, offsetEl(v, v, 'global'));
      const r = solve3D(m) as AnalysisResults3D;
      return r.elementForces.find(f => f.elementId === 1)!;
    };
    const plusY = run({ x: 0, y: e, z: 0 });
    const minusY = run({ x: 0, y: -e, z: 0 });
    const plusZ = run({ x: 0, y: 0, z: e });
    const minusZ = run({ x: 0, y: 0, z: -e });

    // Axial force × Y-eccentricity → moment about Z; My stays ~0 (no axis mixup).
    expect(Math.abs(plusY.mzEnd)).toBeCloseTo(F * e, 1);
    expect(Math.abs(plusY.myEnd)).toBeLessThan(1e-2);
    // Axial force × Z-eccentricity → moment about Y; Mz stays ~0.
    expect(Math.abs(plusZ.myEnd)).toBeCloseTo(F * e, 1);
    expect(Math.abs(plusZ.mzEnd)).toBeLessThan(1e-2);
    // Flipping the offset direction flips the induced-moment sign.
    expect(Math.sign(plusY.mzEnd)).toBe(-Math.sign(minusY.mzEnd));
    expect(Math.sign(plusZ.myEnd)).toBe(-Math.sign(minusZ.myEnd));
    expect(Math.abs(minusY.mzEnd)).toBeCloseTo(F * e, 1);
    expect(Math.abs(minusZ.myEnd)).toBeCloseTo(F * e, 1);
  });
});

describe('member-offsets: persistence', () => {
  it('6c: offset metadata round-trips through the URL share codec', async () => {
    const { compressSnapshot, decompressSnapshot } = await import('../../utils/url-sharing');
    const snapshot: any = {
      name: 'offset-test', analysisMode: '3d',
      nodes: [[1, { id: 1, x: 0, y: 0, z: 0 }], [2, { id: 2, x: 2, y: 0, z: 0 }]],
      elements: [[1, {
        id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1,
        releaseI: { my: false, mz: false, t: false }, releaseJ: { my: false, mz: false, t: false },
        offset: { frame: 'local', i: { x: 0, y: 0, z: 0.3 }, j: { x: 0, y: 0, z: 0.3 } },
      }]],
      materials: [[1, { id: 1, name: 'Steel', e: 210000, nu: 0.3, rho: 7850 }]],
      sections: [[1, { id: 1, name: 'S', a: 0.01, iz: 8.33e-6 }]],
      supports: [[1, { id: 1, nodeId: 1, type: 'fixed' }]],
      loads: [], loadCases: [], combinations: [], plates: [], quads: [], constraints: [], connectors: [],
      nextId: { node: 3, element: 2, material: 2, section: 2, support: 2, load: 1 },
    };
    const restored = decompressSnapshot(compressSnapshot(snapshot))!;
    expect(restored).not.toBeNull();
    const el: any = restored.elements[0][1];
    expect(el.offset).toBeDefined();
    expect(el.offset.frame).toBe('local');
    expect(el.offset.i).toEqual({ x: 0, y: 0, z: 0.3 });
    expect(el.offset.j).toEqual({ x: 0, y: 0, z: 0.3 });
  });

  it('save/load: a snapshot spread preserves offset (rides along via ...v)', () => {
    const elem: any = { id: 1, offset: { frame: 'global', i: { x: 0.5, y: 0, z: 0 } } };
    const copy = { ...elem };
    expect(copy.offset).toEqual(elem.offset);
  });
});

describe('member-offsets: result pruning', () => {
  it('removes helper-node displacements/reactions, keeps real ones, no-op without helpers', () => {
    const results = {
      displacements: [{ nodeId: 1, ux: 0, uy: 0, uz: 0, rx: 0, ry: 0, rz: 0 }, { nodeId: 99, ux: 1, uy: 0, uz: 0, rx: 0, ry: 0, rz: 0 }],
      reactions: [{ nodeId: 1, fx: -100, fy: 0, fz: 0, mx: 0, my: 0, mz: 0 }],
      elementForces: [{ elementId: 1, myEnd: 30 }],
    } as any as AnalysisResults3D;
    const model = new Set([1, 2]);
    const pruned = pruneHelperNodeResults(results, model);
    expect(pruned.displacements.map(d => d.nodeId)).toEqual([1]);
    expect(pruned.elementForces.length).toBe(1); // element forces untouched
    // no-op when nothing leaks
    const clean = { ...results, displacements: [results.displacements[0]] } as AnalysisResults3D;
    expect(pruneHelperNodeResults(clean, model)).toBe(clean);
  });
});
