/**
 * The step-by-step wizard's solver against the solver the canvas uses.
 *
 * `solveDetailed` is a second, pedagogical implementation of the stiffness
 * method: it keeps every matrix so the wizard can show them. Two
 * implementations of one method drift, and nothing on screen says when —
 * the wizard shows a K, an F and a u that are internally consistent and
 * simply describe a different structure from the one analysed.
 *
 * So every model here is solved twice and the answers compared: nodal
 * displacements and support reactions, which between them pin the load
 * vector, the boundary conditions and the stiffness. The models are chosen
 * to touch each input the wizard reads — each load type and its optional
 * fields, each support type, prescribed displacements, hinges, springs, and
 * trusses sharing nodes with frames.
 */
import { describe, it, expect } from 'vitest';
import { solveDetailed } from '../solver-detailed';
import { solve } from '../wasm-solver';
import type { SolverInput, SolverLoad } from '../types';

type Sup = [number, string, Record<string, number>?];
type El = [number, number, number, 'frame' | 'truss', boolean?, boolean?];

function model(opts: {
  nodes: Array<[number, number, number]>;
  elements: El[];
  supports: Sup[];
  loads: SolverLoad[];
  iz?: number;
}): SolverInput {
  return {
    nodes: new Map(opts.nodes.map(([id, x, z]) => [id, { id, x, z }])),
    materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iz: opts.iz ?? 1e-4 }]]),
    elements: new Map(opts.elements.map(([id, nodeI, nodeJ, type, hs, he]) => [id, {
      id, type, nodeI, nodeJ, materialId: 1, sectionId: 1, hingeStart: !!hs, hingeEnd: !!he,
    }])),
    supports: new Map(opts.supports.map(([nodeId, type, extra], k) => [k + 1, {
      id: k + 1, nodeId, type: type as never, ...extra,
    }])),
    loads: opts.loads,
  } as unknown as SolverInput;
}

const nodal = (nodeId: number, fx: number, fz: number, my: number): SolverLoad =>
  ({ type: 'nodal', data: { nodeId, fx, fz, my } });

const CASES: Record<string, SolverInput> = {
  'cantilever, vertical tip load': model({
    nodes: [[1, 0, 0], [2, 4, 0]], elements: [[1, 1, 2, 'frame']],
    supports: [[1, 'fixed']], loads: [nodal(2, 0, -10, 0)],
  }),
  'cantilever, tip moment and horizontal load': model({
    nodes: [[1, 0, 0], [2, 4, 0]], elements: [[1, 1, 2, 'frame']],
    supports: [[1, 'fixed']], loads: [nodal(2, 5, 0, 12)],
  }),
  'simple beam, uniform load': model({
    nodes: [[1, 0, 0], [2, 6, 0]], elements: [[1, 1, 2, 'frame']],
    supports: [[1, 'pinned'], [2, 'rollerX']],
    loads: [{ type: 'distributed', data: { elementId: 1, qI: -10, qJ: -10 } }],
  }),
  'two distributed loads on one element': model({
    nodes: [[1, 0, 0], [2, 6, 0]], elements: [[1, 1, 2, 'frame']],
    supports: [[1, 'fixed'], [2, 'rollerX']],
    loads: [
      { type: 'distributed', data: { elementId: 1, qI: -10, qJ: -10 } },
      { type: 'distributed', data: { elementId: 1, qI: 0, qJ: -6 } },
    ],
  }),
  'partial distributed load': model({
    nodes: [[1, 0, 0], [2, 6, 0]], elements: [[1, 1, 2, 'frame']],
    supports: [[1, 'fixed'], [2, 'fixed']],
    loads: [{ type: 'distributed', data: { elementId: 1, qI: -8, qJ: -8, a: 1, b: 4 } }],
  }),
  'point load with an axial component, on an inclined member': model({
    nodes: [[1, 0, 0], [2, 5, 3]], elements: [[1, 1, 2, 'frame']],
    supports: [[1, 'fixed'], [2, 'pinned']],
    loads: [{ type: 'pointOnElement', data: { elementId: 1, a: 2, p: -12, px: 4 } }],
  }),
  'portal frame, lateral load': model({
    nodes: [[1, 0, 0], [2, 0, 3], [3, 5, 3], [4, 5, 0]],
    elements: [[1, 1, 2, 'frame'], [2, 2, 3, 'frame'], [3, 3, 4, 'frame']],
    supports: [[1, 'fixed'], [4, 'fixed']],
    loads: [nodal(2, 10, 0, 0), { type: 'distributed', data: { elementId: 2, qI: -15, qJ: -15 } }],
  }),
  'three-hinged frame': model({
    nodes: [[1, 0, 0], [2, 0, 4], [3, 3, 5], [4, 6, 4], [5, 6, 0]],
    elements: [[1, 1, 2, 'frame'], [2, 2, 3, 'frame', false, true], [3, 3, 4, 'frame'], [4, 4, 5, 'frame']],
    supports: [[1, 'pinned'], [5, 'pinned']],
    loads: [{ type: 'distributed', data: { elementId: 2, qI: -10, qJ: -10 } }, nodal(3, 0, -20, 0)],
  }),
  'settlement at a support': model({
    nodes: [[1, 0, 0], [2, 5, 0], [3, 10, 0]],
    elements: [[1, 1, 2, 'frame'], [2, 2, 3, 'frame']],
    supports: [[1, 'fixed'], [2, 'rollerX', { dz: -0.01 }], [3, 'pinned']],
    loads: [],
  }),
  'imposed rotation at a fixed end': model({
    nodes: [[1, 0, 0], [2, 5, 0]], elements: [[1, 1, 2, 'frame']],
    supports: [[1, 'fixed', { dry: 0.002 }], [2, 'pinned']], loads: [],
  }),
  'vertical roller (rollerZ)': model({
    nodes: [[1, 0, 0], [2, 0, 4], [3, 4, 4]],
    elements: [[1, 1, 2, 'frame'], [2, 2, 3, 'frame']],
    supports: [[1, 'fixed'], [3, 'rollerZ']], loads: [nodal(2, 8, -5, 0)],
  }),
  'inclined roller': model({
    nodes: [[1, 0, 0], [2, 6, 0]], elements: [[1, 1, 2, 'frame']],
    supports: [[1, 'pinned'], [2, 'inclinedRoller', { angle: Math.PI / 6 }]],
    loads: [{ type: 'distributed', data: { elementId: 1, qI: -10, qJ: -10 } }],
  }),
  'spring support': model({
    nodes: [[1, 0, 0], [2, 6, 0]], elements: [[1, 1, 2, 'frame']],
    supports: [[1, 'fixed'], [2, 'spring', { ky: 2000 }]], loads: [nodal(2, 0, -10, 0)],
  }),
  'truss, pure': model({
    nodes: [[1, 0, 0], [2, 4, 0], [3, 2, 2]],
    elements: [[1, 1, 2, 'truss'], [2, 2, 3, 'truss'], [3, 1, 3, 'truss']],
    supports: [[1, 'pinned'], [2, 'rollerX']], loads: [nodal(3, 5, -20, 0)],
  }),
  'truss bars hanging off a frame': model({
    nodes: [[1, 0, 0], [2, 4, 0], [3, 2, 2]],
    elements: [[1, 1, 2, 'frame'], [2, 2, 3, 'truss'], [3, 1, 3, 'truss']],
    supports: [[1, 'pinned'], [2, 'rollerX']], loads: [nodal(3, 0, -20, 0)],
  }),
  'thermal load': model({
    nodes: [[1, 0, 0], [2, 5, 0]], elements: [[1, 1, 2, 'frame']],
    supports: [[1, 'fixed'], [2, 'fixed']],
    loads: [{ type: 'thermal', data: { elementId: 1, dtUniform: 20, dtGradient: 10 } }],
  }),
};

describe('solveDetailed agrees with the analysis solver', () => {
  for (const [name, input] of Object.entries(CASES)) {
    it(name, () => {
      const ref = solve(input);
      const det = solveDetailed(input);
      const dof = (nodeId: number, ld: number) =>
        det.dofNumbering.dofs.find((d) => d.nodeId === nodeId && d.localDof === ld);
      const scaleU = Math.max(1e-9, ...ref.displacements.flatMap((d) => [Math.abs(d.ux), Math.abs(d.uz)]));
      const scaleR = Math.max(1e-6, ...ref.reactions.flatMap((r) => [Math.abs(r.rx), Math.abs(r.rz), Math.abs(r.my)]));
      /* A node in its own axes is turned back to global before comparing. */
      const frame = (nodeId: number) => det.nodeFrames.find((f) => f.nodeId === nodeId);
      const toGlobal = (nodeId: number, a: number, b: number): [number, number] => {
        const f = frame(nodeId);
        if (!f) return [a, b];
        const c = Math.cos(f.angle), sn = Math.sin(f.angle);
        return [c * a - sn * b, sn * a + c * b];
      };
      for (const d of ref.displacements) {
        const [ux, uz] = toGlobal(d.nodeId,
          det.uAll[dof(d.nodeId, 0)!.globalIndex], det.uAll[dof(d.nodeId, 1)!.globalIndex]);
        expect(Math.abs(ux - d.ux) / scaleU, `ux at ${d.nodeId}: ${ux} vs ${d.ux}`).toBeLessThan(1e-6);
        expect(Math.abs(uz - d.uz) / scaleU, `uz at ${d.nodeId}: ${uz} vs ${d.uz}`).toBeLessThan(1e-6);
      }
      /* Reactions by node and direction, from the restrained part of the vector. */
      const reactionAt = (nodeId: number, ld: number) => {
        const info = dof(nodeId, ld);
        return info && !info.isFree ? det.reactionsRaw[info.globalIndex - det.dofNumbering.nFree] : 0;
      };
      for (const r of ref.reactions) {
        const [gx, gz] = toGlobal(r.nodeId, reactionAt(r.nodeId, 0), reactionAt(r.nodeId, 1));
        for (const [ld, want] of [[0, r.rx], [1, r.rz], [2, r.my]] as Array<[number, number]>) {
          const info = dof(r.nodeId, ld);
          if (!info || (info.isFree && !frame(r.nodeId))) continue;
          const got = ld === 0 ? gx : ld === 1 ? gz : reactionAt(r.nodeId, 2);
          expect(Math.abs(got - want) / scaleR, `R${ld} at ${r.nodeId}: ${got} vs ${want}`).toBeLessThan(1e-6);
        }
      }
      /*
       * Step 9's end forces, mapped to the analysis solver's convention:
       * N positive in tension, and the J end read from the other side.
       */
      const scaleF = Math.max(1e-6, ...ref.elementForces.flatMap((e) =>
        [e.nStart, e.nEnd, e.vStart, e.vEnd, e.mStart, e.mEnd].map(Math.abs)));
      for (const e of ref.elementForces) {
        const f = det.elementForces.find((x) => x.elementId === e.elementId)!.fLocalFinal;
        const pairs: Array<[string, number, number]> = f.length === 6
          ? [['N0', -f[0], e.nStart], ['V0', f[1], e.vStart], ['M0', f[2], e.mStart],
             ['N1', f[3], e.nEnd], ['V1', -f[4], e.vEnd], ['M1', -f[5], e.mEnd]]
          : [['N0', -f[0], e.nStart], ['N1', f[2], e.nEnd]];
        for (const [k, got, want] of pairs) {
          expect(Math.abs(got - want) / scaleF, `elem ${e.elementId} ${k}: ${got} vs ${want}`).toBeLessThan(1e-6);
        }
      }
    });
  }
});

/*
 * ── A couple on a member: checked against closed forms, not the solver ──
 *
 * A point couple `my` on a member is the one load where the two solvers do
 * NOT agree, and the closed forms say which is right. The wizard's equivalent
 * loads are the consistent ones, M·N′(a); the analysis solver's
 * `fef_point_load_2d` (engine/src/element/fef.rs) carries the two MOMENT
 * terms with the opposite sign — its shear terms are right. On a cantilever
 * with a 6 kN·m couple it reports a fixed-end moment of −11,28, where
 * equilibrium alone requires −6.
 *
 * The solver is not touched from here. The `it.fails` below documents the
 * defect and will start failing — asking to be turned into a plain `it` —
 * the day it is fixed.
 */
describe('a point couple on a member', () => {
  const EI = 200e6 * 1e-4;
  const cantilever = model({
    nodes: [[1, 0, 0], [2, 5, 0]], elements: [[1, 1, 2, 'frame']],
    supports: [[1, 'fixed']],
    loads: [{ type: 'pointOnElement', data: { elementId: 1, a: 2, p: 0, my: 6 } }],
  });
  const simple = model({
    nodes: [[1, 0, 0], [2, 5, 0]], elements: [[1, 1, 2, 'frame']],
    supports: [[1, 'pinned'], [2, 'rollerX']],
    loads: [{ type: 'pointOnElement', data: { elementId: 1, a: 2, p: 0, my: 6 } }],
  });

  it('the wizard: a cantilever rotates M·a/EI at the tip, rises M·a·(L − a/2)/EI, and the wall takes −M', () => {
    const d = solveDetailed(cantilever);
    const tip = (ld: number) => d.uAll[d.dofNumbering.dofs.find((x) => x.nodeId === 2 && x.localDof === ld)!.globalIndex];
    expect(tip(2)).toBeCloseTo((6 * 2) / EI, 12);
    expect(tip(1)).toBeCloseTo((6 * 2 * (5 - 1)) / EI, 12);
    const wall = d.dofNumbering.dofs.find((x) => x.nodeId === 1 && x.localDof === 2)!;
    expect(d.reactionsRaw[wall.globalIndex - d.dofNumbering.nFree]).toBeCloseTo(-6, 9);
  });

  it('the wizard: a simple beam reacts ±M/L', () => {
    const d = solveDetailed(simple);
    const rz = d.dofNumbering.dofs.filter((x) => !x.isFree && x.localDof === 1)
      .map((x) => d.reactionsRaw[x.globalIndex - d.dofNumbering.nFree]).sort((p, q) => p - q);
    expect(rz[0]).toBeCloseTo(-1.2, 9);
    expect(rz[1]).toBeCloseTo(1.2, 9);
  });

  it.fails('the analysis solver: the same cantilever’s wall takes −M (engine defect, reported)', () => {
    const r = solve(cantilever);
    expect(r.reactions[0].my).toBeCloseTo(-6, 6);
  });
});
