/**
 * Basic 2D sliding-joint subsystem — mechanical sanity + wiring tests.
 *
 * Sliding joints are stored as a translational release on a frame element end
 * (Release.slide/slideAxis) and expanded at solve time into a coincident helper
 * node + equalDOF/linearMPC constraints (sliding-joints.ts), routed through the
 * existing WASM solve_2d → solve_constrained_2d path. The slider's master is the
 * member's own joint node; its slave is a fresh coincident helper carrying that
 * member end. These tests assert:
 *   - the expansion emits the expected constraints, a coincident helper, and NO
 *     fake supports / no spurious expansion for ordinary hinged members;
 *   - kinematics (raw solve, helper visible): the released relative translation
 *     is free while the perpendicular translation + rotation stay tied, in
 *     global X, global Z, and local-axis (inclined) flavours;
 *   - the integrated solve (validateAndSolve2D) releases the corresponding
 *     internal force (a slider transfers no force in its released direction),
 *     the classic hinge still releases rotation, and helper nodes never leak;
 *   - the slide release survives serialization (save/load) and the v1→v2 migrate.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { initSolver, solve } from '../wasm-solver';
import { validateAndSolve2D } from '../solver-service';
import { expandSlidingJoints2D, modelHasSlidingJoints } from '../sliding-joints';
import { migrateSnapshotV1ToV2 } from '../../store/file';
import { NO_RELEASE, type Element, type Release } from '../../store/model.svelte';
import type { ModelData } from '../solver-service';
import type { SolverInput, AnalysisResults } from '../types';

const MAT = new Map([[1, { id: 1, name: 'S', e: 200_000, nu: 0.3, rho: 0 }]]);
const SEC = new Map([[1, { id: 1, name: 'S', a: 0.01, iz: 1e-4 }]]);

function rel(over: Partial<Release> = {}): Release { return { ...NO_RELEASE, ...over }; }
function frame(id: number, i: number, j: number, ri: Release = rel(), rj: Release = rel()): Element {
  return { id, type: 'frame', nodeI: i, nodeJ: j, materialId: 1, sectionId: 1, releaseI: ri, releaseJ: rj } as Element;
}

/** Three collinear nodes, two frames sharing the middle node 2 (the joint). The
 *  slider (if any) sits on element 2's I-end at node 2. */
function sharedJointModel(opts: {
  coords: Array<[number, number]>; // node 1, 2, 3 (x, y=vertical)
  ri2?: Release; rj1?: Release;     // element-2 start / element-1 end releases
  sup3?: 'pinned' | 'fixed' | 'rollerX';
  loadNode: number; fx?: number; fz?: number;
}): ModelData {
  const [c1, c2, c3] = opts.coords;
  return {
    nodes: new Map([
      [1, { id: 1, x: c1[0], y: c1[1] }],
      [2, { id: 2, x: c2[0], y: c2[1] }],
      [3, { id: 3, x: c3[0], y: c3[1] }],
    ]),
    materials: MAT, sections: SEC,
    elements: new Map([
      [1, frame(1, 1, 2, rel(), opts.rj1 ?? rel())],
      [2, frame(2, 2, 3, opts.ri2 ?? rel(), rel())],
    ]),
    supports: new Map([
      [1, { id: 1, nodeId: 1, type: 'fixed' }],
      [2, { id: 2, nodeId: 3, type: opts.sup3 ?? 'pinned' }],
    ]),
    loads: [{ type: 'nodal', data: { id: 1, nodeId: opts.loadNode, fx: opts.fx ?? 0, fz: opts.fz ?? 0, my: 0 } }],
  } as unknown as ModelData;
}

function ok(r: AnalysisResults | string | null): AnalysisResults {
  if (r === null || typeof r === 'string') throw new Error(`solve failed: ${r}`);
  return r;
}
const dsp = (r: AnalysisResults, id: number) => r.displacements.find(x => x.nodeId === id)!;
const frc = (r: AnalysisResults, id: number) => r.elementForces.find(x => x.elementId === id)!;

/**
 * Raw-solve harness for kinematics: build a coincident two-bar input + model
 * elements, expand the slider (helper becomes visible since we bypass the prune),
 * and solve. node1 fixed, node3 (id 3) pinned. A horizontal/vertical load at the
 * joint node 2 drives relative motion that the slider does/doesn't permit.
 * Returns { r, jointId: 2, helperId }.
 */
function rawSlideSolve(coords: Array<[number, number]>, ri2: Release, fx: number, fz: number) {
  const input: SolverInput = {
    nodes: new Map([
      [1, { id: 1, x: coords[0][0], z: coords[0][1] }],
      [2, { id: 2, x: coords[1][0], z: coords[1][1] }],
      [3, { id: 3, x: coords[2][0], z: coords[2][1] }],
    ]),
    materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
    elements: new Map([
      [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      [2, { id: 2, type: 'frame', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
    ]),
    supports: new Map([
      [1, { id: 1, nodeId: 1, type: 'fixed' }],
      [2, { id: 2, nodeId: 3, type: 'pinned' }],
    ]),
    loads: [{ type: 'nodal', data: { nodeId: 2, fx, fz, my: 0 } }],
  };
  const modelElements = new Map([
    [1, frame(1, 1, 2)],
    [2, frame(2, 2, 3, ri2, rel())],
  ]);
  const helpers = expandSlidingJoints2D(input, modelElements);
  const r = solve(input);
  return { r, jointId: 2, helperId: [...helpers][0] };
}

beforeAll(async () => { await initSolver(); });

describe('expansion (sliding-joints.ts)', () => {
  const base = (): SolverInput => ({
    nodes: new Map([[1, { id: 1, x: 0, z: 0 }], [2, { id: 2, x: 2, z: 0 }], [3, { id: 3, x: 4, z: 0 }]]),
    materials: new Map(), sections: new Map(),
    elements: new Map([
      [1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
      [2, { id: 2, type: 'frame', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1, hingeStart: false, hingeEnd: false }],
    ]),
    supports: new Map([[1, { id: 1, nodeId: 1, type: 'fixed' }]]),
    loads: [],
  });

  it('is a no-op for an ordinary hinged frame (does NOT become a slider)', () => {
    const els = new Map([[1, frame(1, 1, 2, rel(), rel({ mz: true }))]]);
    expect(modelHasSlidingJoints(els.values())).toBe(false);
    const input = base();
    const before = input.nodes.size;
    const helpers = expandSlidingJoints2D(input, els);
    expect(helpers.size).toBe(0);
    expect(input.nodes.size).toBe(before);
    expect(input.constraints ?? []).toHaveLength(0);
  });

  it('global slideX emits equalDOF[uz,ry], a coincident helper, and no fake supports', () => {
    const els = new Map([[2, frame(2, 2, 3, rel({ slide: 'x', slideAxis: 'global' }), rel())]]);
    const input = base();
    const supportsBefore = input.supports.size;
    const helpers = expandSlidingJoints2D(input, els);
    expect(helpers.size).toBe(1);
    const hid = [...helpers][0];
    expect(input.nodes.get(hid)).toMatchObject({ x: 2, z: 0 }); // coincident with joint node 2
    expect(input.elements.get(2)!.nodeI).toBe(hid);             // member end retargeted
    expect(input.constraints).toHaveLength(1);
    expect(input.constraints![0]).toMatchObject({ type: 'equalDOF', masterNode: 2, slaveNode: hid, dofs: [1, 2] });
    expect(input.supports.size).toBe(supportsBefore);           // no fake supports
  });

  it('global slideZ emits equalDOF[ux,ry]', () => {
    const els = new Map([[2, frame(2, 2, 3, rel({ slide: 'z', slideAxis: 'global' }), rel())]]);
    const input = base();
    expandSlidingJoints2D(input, els);
    expect(input.constraints![0]).toMatchObject({ type: 'equalDOF', dofs: [0, 2] });
  });

  it('local slide emits a linearMPC (4-term translation tie) + equalDOF[ry]', () => {
    const els = new Map([[2, frame(2, 2, 3, rel({ slide: 'x', slideAxis: 'local' }), rel())]]);
    const input = base();
    expandSlidingJoints2D(input, els);
    expect(input.constraints).toHaveLength(2);
    expect(input.constraints![0].type).toBe('linearMPC');
    expect((input.constraints![0] as any).terms).toHaveLength(4);
    expect(input.constraints![1]).toMatchObject({ type: 'equalDOF', dofs: [2] });
  });
});

describe('kinematics (raw solve, helper visible)', () => {
  it('sliding X (global): relative X free, Z & rotation tied', () => {
    const { r, jointId, helperId } = rawSlideSolve([[0, 0], [2, 0], [4, 0]], rel({ slide: 'x', slideAxis: 'global' }), 10, 0);
    const j = dsp(r, jointId), h = dsp(r, helperId);
    expect(Math.abs(h.uz - j.uz)).toBeLessThan(1e-9);    // Z tied
    expect(Math.abs(h.ry - j.ry)).toBeLessThan(1e-9);    // rotation tied
    expect(Math.abs(h.ux - j.ux)).toBeGreaterThan(1e-6); // X released → slides
  });

  it('sliding Z (global): relative Z free, X & rotation tied', () => {
    // Vertical two-bar column so a Z slider is stable; vertical load drives the slide.
    const { r, jointId, helperId } = rawSlideSolve([[0, 0], [0, 2], [0, 4]], rel({ slide: 'z', slideAxis: 'global' }), 0, 10);
    const j = dsp(r, jointId), h = dsp(r, helperId);
    expect(Math.abs(h.ux - j.ux)).toBeLessThan(1e-9);    // X tied
    expect(Math.abs(h.ry - j.ry)).toBeLessThan(1e-9);    // rotation tied
    expect(Math.abs(h.uz - j.uz)).toBeGreaterThan(1e-6); // Z released → slides
  });

  it('local-axis sliding on a 45° member releases the local direction, not just global', () => {
    const c = Math.SQRT1_2, s = Math.SQRT1_2;
    const { r, jointId, helperId } = rawSlideSolve(
      [[0, 0], [2, 2], [4, 4]], rel({ slide: 'x', slideAxis: 'local' }), 10 * c, 10 * s,
    );
    const j = dsp(r, jointId), h = dsp(r, helperId);
    const relX = h.ux - j.ux, relZ = h.uz - j.uz;
    const relPerp = -s * relX + c * relZ;   // perpendicular to member → tied
    const relAlong = c * relX + s * relZ;   // along member → released
    expect(Math.abs(relPerp)).toBeLessThan(1e-9);
    expect(Math.abs(h.ry - j.ry)).toBeLessThan(1e-9);
    expect(Math.abs(relAlong)).toBeGreaterThan(1e-6);
  });
});

describe('integrated solve (validateAndSolve2D)', () => {
  it('classic hinge still releases rotation (moment ≈ 0 at the released end)', () => {
    const model = sharedJointModel({ coords: [[0, 0], [2, 0], [4, 0]], rj1: rel({ mz: true }), loadNode: 2, fz: -5 });
    const r = ok(validateAndSolve2D(model));
    expect(Math.abs(frc(r, 1).mEnd)).toBeLessThan(1e-6);          // hinge at element-1 end
    expect(r.displacements.map(x => x.nodeId).sort()).toEqual([1, 2, 3]); // no helper leak
  });

  it('sliding X (global) releases the axial path; rigid joint does not — and no helper leak', () => {
    const coords: Array<[number, number]> = [[0, 0], [2, 0], [4, 0]];
    // Rigid baseline: axial load at the joint splits into both members.
    const rigid = ok(validateAndSolve2D(sharedJointModel({ coords, loadNode: 2, fx: 10 })));
    expect(Math.abs(frc(rigid, 2).nStart)).toBeGreaterThan(1);    // element 2 carries axial
    // With a sliding-X joint, element 2 transfers no axial across the slider.
    const slid = ok(validateAndSolve2D(sharedJointModel({ coords, ri2: rel({ slide: 'x', slideAxis: 'global' }), loadNode: 2, fx: 10 })));
    expect(Math.abs(frc(slid, 2).nStart)).toBeLessThan(1e-6);
    // helper node pruned: results carry only model nodes 1..3
    expect(slid.displacements.map(x => x.nodeId).sort()).toEqual([1, 2, 3]);
    expect(slid.reactions.every(x => x.nodeId <= 3)).toBe(true);
  });

  it('local-axis slider on a 45° member releases the member axial that a rigid joint transfers', () => {
    const coords: Array<[number, number]> = [[0, 0], [2, 2], [4, 4]];
    const load = { loadNode: 2, fx: 10 * Math.SQRT1_2, fz: 10 * Math.SQRT1_2 }; // along the 45° axis
    const rigid = ok(validateAndSolve2D(sharedJointModel({ coords, ...load })));
    expect(Math.abs(frc(rigid, 2).nStart)).toBeGreaterThan(1);    // rigid joint transfers axial
    const local = ok(validateAndSolve2D(sharedJointModel({ coords, ri2: rel({ slide: 'x', slideAxis: 'local' }), ...load })));
    expect(Math.abs(frc(local, 2).nStart)).toBeLessThan(1e-6);    // local-axis slider releases it on the incline
  });
});

describe('persistence', () => {
  it('slide release survives a JSON save/load round trip', () => {
    const el = frame(2, 2, 3, rel({ slide: 'x', slideAxis: 'local' }), rel({ slide: 'z', slideAxis: 'global' }));
    const round = JSON.parse(JSON.stringify(el)) as Element;
    expect(round.releaseI).toMatchObject({ slide: 'x', slideAxis: 'local' });
    expect(round.releaseJ).toMatchObject({ slide: 'z', slideAxis: 'global' });
  });

  it('v1→v2 migration preserves an existing slide release', () => {
    const snap: Record<string, unknown> = {
      elements: [
        [2, { id: 2, type: 'frame', nodeI: 2, nodeJ: 3, materialId: 1, sectionId: 1,
              releaseI: { my: false, mz: false, t: false, slide: 'x', slideAxis: 'local' } }],
      ],
    };
    migrateSnapshotV1ToV2(snap);
    const elem = (snap.elements as any)[0][1];
    expect(elem.releaseI).toMatchObject({ slide: 'x', slideAxis: 'local' });
  });
});
