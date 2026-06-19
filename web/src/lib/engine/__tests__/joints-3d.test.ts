/**
 * Basic 3D internal joints — relative-DOF release via coincident helper node +
 * eccentricConnection. Mirrors the 2D sliding-joint tests. Asserts the expansion
 * shape (correct eccentricConnection mask, coincident helper, retarget, no fake
 * supports), the kinematics (released relative DOF free, others tied) via a raw
 * solve where the helper is visible, and serialization round-trip.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { initSolver, solve3D } from '../wasm-solver';
import { expandJoints3D, modelHasJoints3D } from '../expand-joints-3d';
import { modelHasUnsolvable3DJoints } from '../solver-service';
import type { SolverInput3D, AnalysisResults3D } from '../types-3d';
import type { Element, Joint3D } from '../../store/model.svelte';

const MAT = new Map([[1, { id: 1, e: 200_000, nu: 0.3, rho: 0 }]]);
const SEC = new Map([[1, { id: 1, a: 0.01, iy: 1e-4, iz: 1e-4, j: 2e-4 }]]);
const mask = (...idx: number[]): Joint3D['dof'] =>
  [0, 1, 2, 3, 4, 5].map(i => idx.includes(i)) as Joint3D['dof'];

function frame(id: number, i: number, j: number, jointI?: Joint3D, jointJ?: Joint3D): Element {
  return {
    id, type: 'frame', nodeI: i, nodeJ: j, materialId: 1, sectionId: 1,
    releaseI: { my: false, mz: false, t: false }, releaseJ: { my: false, mz: false, t: false },
    jointI, jointJ,
  } as Element;
}

/** Three collinear nodes along X, two frames sharing node 2. */
function base(): SolverInput3D {
  return {
    nodes: new Map([
      [1, { id: 1, x: 0, y: 0, z: 0 }],
      [2, { id: 2, x: 2, y: 0, z: 0 }],
      [3, { id: 3, x: 4, y: 0, z: 0 }],
    ]),
    materials: MAT, sections: SEC,
    elements: new Map([
      [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1,
            releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }],
      [2, { id: 2, type: 'frame', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1,
            releaseMyStart: false, releaseMyEnd: false, releaseMzStart: false, releaseMzEnd: false, releaseTStart: false, releaseTEnd: false }],
    ]),
    supports: new Map([
      [1, { nodeId: 1, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }],
      [3, { nodeId: 3, rx: true, ry: true, rz: true, rrx: true, rry: true, rrz: true }],
    ]),
    loads: [],
  };
}
const dsp = (r: AnalysisResults3D, id: number) => r.displacements.find(d => d.nodeId === id)!;

beforeAll(async () => { await initSolver(); });

describe('expansion (expand-joints-3d.ts)', () => {
  it('is a no-op when no element has a released joint', () => {
    const els = new Map([[1, frame(1, 1, 2)]]);
    expect(modelHasJoints3D(els.values())).toBe(false);
    const input = base();
    const n0 = input.nodes.size;
    expect(expandJoints3D(input, els).size).toBe(0);
    expect(input.nodes.size).toBe(n0);
    expect(input.constraints ?? []).toHaveLength(0);
  });

  it('a released joint emits a coincident helper + eccentricConnection with the exact mask, no fake supports', () => {
    const els = new Map([[2, frame(2, 2, 3, { dof: mask(0) })]]); // release dx at node 2
    const input = base();
    const supportsBefore = input.supports.size;
    const helpers = expandJoints3D(input, els);
    expect(helpers.size).toBe(1);
    const hid = [...helpers][0];
    expect(input.nodes.get(hid)).toMatchObject({ x: 2, y: 0, z: 0 }); // coincident with node 2
    expect(input.elements.get(2)!.nodeI).toBe(hid);                    // retargeted
    expect(input.constraints).toHaveLength(1);
    expect(input.constraints![0]).toMatchObject({
      type: 'eccentricConnection', masterNode: 2, slaveNode: hid,
      offsetX: 0, offsetY: 0, offsetZ: 0, releases: [true, false, false, false, false, false],
    });
    expect(input.supports.size).toBe(supportsBefore);
  });
});

describe('kinematics (raw 3D solve, helper visible)', () => {
  // Load fx at the joint node 2; element 1 carries it to fixed node 1. The
  // released DOF makes the helper (element-2 start) free in that DOF relative to
  // node 2, so the relative component is nonzero while the tied DOFs match.
  function solveWithJoint(jointDof: Joint3D['dof'], load: { fx?: number; fy?: number; fz?: number; mx?: number }) {
    const input = base();
    input.loads = [{ type: 'nodal', data: { nodeId: 2, fx: load.fx ?? 0, fy: load.fy ?? 0, fz: load.fz ?? 0, mx: load.mx ?? 0, my: 0, mz: 0 } }];
    const els = new Map([[1, frame(1, 1, 2)], [2, frame(2, 2, 3, jointDof ? { dof: jointDof } : undefined)]]);
    const helpers = expandJoints3D(input, els);
    return { r: solve3D(input), helperId: [...helpers][0] };
  }

  it('dx release: relative ux free, all other relative DOFs tied', () => {
    const { r, helperId } = solveWithJoint(mask(0), { fx: 10 });
    const j = dsp(r, 2), h = dsp(r, helperId);
    expect(Math.abs(h.ux - j.ux)).toBeGreaterThan(1e-7); // released
    for (const k of ['uy', 'uz', 'rx', 'ry', 'rz'] as const) {
      expect(Math.abs((h as any)[k] - (j as any)[k])).toBeLessThan(1e-9); // tied
    }
  });

  it('dy and dz releases free their own relative translation', () => {
    const y = solveWithJoint(mask(1), { fy: 10 });
    expect(Math.abs(dsp(y.r, y.helperId).uy - dsp(y.r, 2).uy)).toBeGreaterThan(1e-7);
    const z = solveWithJoint(mask(2), { fz: 10 });
    expect(Math.abs(dsp(z.r, z.helperId).uz - dsp(z.r, 2).uz)).toBeGreaterThan(1e-7);
  });

  it('θx (torsion) release frees relative rotation about X, ties translations', () => {
    const { r, helperId } = solveWithJoint(mask(3), { mx: 10 });
    const j = dsp(r, 2), h = dsp(r, helperId);
    expect(Math.abs(h.rx - j.rx)).toBeGreaterThan(1e-9);  // released
    expect(Math.abs(h.ux - j.ux)).toBeLessThan(1e-9);     // tied
    expect(Math.abs(h.uy - j.uy)).toBeLessThan(1e-9);
  });

  it('multiple DOFs (dx + θx) release together', () => {
    const { r, helperId } = solveWithJoint(mask(0, 3), { fx: 10, mx: 10 });
    const j = dsp(r, 2), h = dsp(r, helperId);
    expect(Math.abs(h.ux - j.ux)).toBeGreaterThan(1e-7);
    expect(Math.abs(h.rx - j.rx)).toBeGreaterThan(1e-9);
    expect(Math.abs(h.uy - j.uy)).toBeLessThan(1e-9);     // still tied
    expect(Math.abs(h.uz - j.uz)).toBeLessThan(1e-9);
  });

  it('a rigid (no-release) joint behaves like a continuous member (helper ≡ master)', () => {
    const { r, helperId } = solveWithJoint(mask(), { fx: 10 }); // empty mask → no expansion
    expect(helperId).toBeUndefined();
    expect(r.displacements.length).toBe(3);
  });
});

describe('flat-embed guard (modelHasUnsolvable3DJoints)', () => {
  // A coplanar (z≈0) model solves through the flat-2D embed (model XY → solver
  // XZ), which permutes the global DOF axes. The joint mask is applied in raw
  // solver-DOF order, so expanding there releases the wrong axis → buildSolverInput3D
  // only expands joints on the genuine-3D path and the UI must refuse the embed case.
  const MODELMAT = new Map([[1, { id: 1, name: 'M', e: 200_000, nu: 0.3, rho: 0 }]]);
  const MODELSEC = new Map([[1, { id: 1, name: 'S', a: 0.01, iz: 1e-4 }]]);
  // 2D support type ('fixed') keeps the model in the flat-2D embed.
  const supports = () => new Map([
    [1, { id: 1, nodeId: 1, type: 'fixed' }],
    [3, { id: 3, nodeId: 3, type: 'fixed' }],
  ]);
  const model = (opts: { jointed: boolean; flat: boolean }) => ({
    nodes: new Map([
      [1, { id: 1, x: 0, y: 0, z: 0 }],
      [2, { id: 2, x: 2, y: 0, z: 0 }],
      [3, { id: 3, x: 4, y: 0, z: opts.flat ? 0 : 1.5 }], // z≠0 → genuine 3D
    ]),
    elements: new Map([
      [1, frame(1, 1, 2)],
      [2, frame(2, 2, 3, opts.jointed ? { dof: mask(5) } : undefined)], // release θz
    ]),
    supports: supports(), loads: [], materials: MODELMAT, sections: MODELSEC,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

  it('flat model with a 3D joint is unsolvable in 3D → must be refused', () => {
    expect(modelHasUnsolvable3DJoints(model({ jointed: true, flat: true }))).toBe(true);
  });
  it('non-coplanar model with a 3D joint expands correctly → not refused', () => {
    expect(modelHasUnsolvable3DJoints(model({ jointed: true, flat: false }))).toBe(false);
  });
  it('flat model without joints is fine', () => {
    expect(modelHasUnsolvable3DJoints(model({ jointed: false, flat: true }))).toBe(false);
  });
});

describe('persistence', () => {
  it('jointI / jointJ survive a JSON round trip', () => {
    const el = frame(2, 2, 3, { dof: mask(0, 4) }, { dof: mask(2) });
    const round = JSON.parse(JSON.stringify(el)) as Element;
    expect(round.jointI!.dof).toEqual([true, false, false, false, true, false]);
    expect(round.jointJ!.dof).toEqual([false, false, true, false, false, false]);
  });
});
