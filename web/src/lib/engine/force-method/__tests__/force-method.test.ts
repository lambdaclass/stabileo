/**
 * The force method, against closed forms and against the stiffness method.
 *
 * Three independent checks on every model:
 *
 *   · each δᵢⱼ and δᵢ₀ by Mohr's integrals equals the same coefficient read
 *     as a displacement of the primary structure — two different pieces of
 *     arithmetic for one number;
 *   · [δ] is symmetric (Maxwell–Betti);
 *   · the superposed answer equals the stiffness method's on the original
 *     structure, reactions and end forces.
 *
 * And on the classics, the textbook's own numbers.
 */
import { describe, it, expect } from 'vitest';
import { solveForceMethod, ForceMethodError } from '../solve';
import type { SolverInput, SolverLoad } from '../../types';

type Sup = [number, string, Record<string, number>?];
type El = [number, number, number, 'frame' | 'truss', boolean?, boolean?];

function model(opts: { nodes: Array<[number, number, number]>; elements: El[]; supports: Sup[]; loads: SolverLoad[] }): SolverInput {
  return {
    nodes: new Map(opts.nodes.map(([id, x, z]) => [id, { id, x, z }])),
    materials: new Map([[1, { id: 1, e: 200_000, nu: 0.3 }]]),
    sections: new Map([[1, { id: 1, a: 0.01, iz: 1e-4 }]]),
    elements: new Map(opts.elements.map(([id, nodeI, nodeJ, type, hs, he]) => [id, {
      id, type, nodeI, nodeJ, materialId: 1, sectionId: 1, hingeStart: !!hs, hingeEnd: !!he,
    }])),
    supports: new Map(opts.supports.map(([nodeId, type, extra], k) => [k + 1, { id: k + 1, nodeId, type: type as never, ...extra }])),
    loads: opts.loads,
  } as unknown as SolverInput;
}
const nodal = (nodeId: number, fx: number, fz: number, my = 0): SolverLoad => ({ type: 'nodal', data: { nodeId, fx, fz, my } });
const q = (elementId: number, qI: number, qJ = qI, extra: Record<string, number> = {}): SolverLoad =>
  ({ type: 'distributed', data: { elementId, qI, qJ, ...extra } });

const CASES: Record<string, SolverInput> = {
  'propped cantilever, uniform load': model({
    nodes: [[1, 0, 0], [2, 6, 0]], elements: [[1, 1, 2, 'frame']],
    supports: [[1, 'fixed'], [2, 'rollerX']], loads: [q(1, -10)],
  }),
  'fixed-fixed beam, uniform load': model({
    nodes: [[1, 0, 0], [2, 6, 0]], elements: [[1, 1, 2, 'frame']],
    supports: [[1, 'fixed'], [2, 'fixed']], loads: [q(1, -10)],
  }),
  'two-span continuous beam': model({
    nodes: [[1, 0, 0], [2, 5, 0], [3, 10, 0]], elements: [[1, 1, 2, 'frame'], [2, 2, 3, 'frame']],
    supports: [[1, 'pinned'], [2, 'rollerX'], [3, 'rollerX']], loads: [q(1, -12), q(2, -12)],
  }),
  'portal frame, fixed feet': model({
    nodes: [[1, 0, 0], [2, 0, 4], [3, 6, 4], [4, 6, 0]],
    elements: [[1, 1, 2, 'frame'], [2, 2, 3, 'frame'], [3, 3, 4, 'frame']],
    supports: [[1, 'fixed'], [4, 'fixed']], loads: [nodal(2, 15, 0), q(2, -20)],
  }),
  'closed frame on two supports (a loop to cut)': model({
    nodes: [[1, 0, 0], [2, 4, 0], [3, 4, 3], [4, 0, 3]],
    elements: [[1, 1, 2, 'frame'], [2, 2, 3, 'frame'], [3, 3, 4, 'frame'], [4, 4, 1, 'frame']],
    supports: [[1, 'pinned'], [2, 'rollerX']], loads: [q(3, -10), nodal(4, 5, 0)],
  }),
  'closed frame with a hinge (a two-force cut)': model({
    nodes: [[1, 0, 0], [2, 4, 0], [3, 4, 3], [4, 0, 3]],
    elements: [[1, 1, 2, 'frame'], [2, 2, 3, 'frame'], [3, 3, 4, 'frame', false, true], [4, 4, 1, 'frame']],
    supports: [[1, 'pinned'], [2, 'rollerX']], loads: [q(3, -10), nodal(3, 5, 0)],
  }),
  'truss with a redundant diagonal': model({
    nodes: [[1, 0, 0], [2, 4, 0], [3, 4, 3], [4, 0, 3]],
    elements: [[1, 1, 2, 'truss'], [2, 2, 3, 'truss'], [3, 3, 4, 'truss'], [4, 4, 1, 'truss'], [5, 1, 3, 'truss'], [6, 2, 4, 'truss']],
    supports: [[1, 'pinned'], [2, 'rollerX']], loads: [nodal(3, 10, -20)],
  }),
  'truss on three supports': model({
    nodes: [[1, 0, 0], [2, 3, 0], [3, 6, 0], [4, 1.5, 2], [5, 4.5, 2]],
    elements: [[1, 1, 2, 'truss'], [2, 2, 3, 'truss'], [3, 4, 5, 'truss'], [4, 1, 4, 'truss'], [5, 4, 2, 'truss'], [6, 2, 5, 'truss'], [7, 5, 3, 'truss']],
    supports: [[1, 'pinned'], [2, 'rollerX'], [3, 'rollerX']], loads: [nodal(4, 0, -15), nodal(5, 0, -15)],
  }),
  'settlement of an interior support': model({
    nodes: [[1, 0, 0], [2, 5, 0], [3, 10, 0]], elements: [[1, 1, 2, 'frame'], [2, 2, 3, 'frame']],
    supports: [[1, 'fixed'], [2, 'rollerX', { dz: -0.01 }], [3, 'pinned']], loads: [q(1, -8)],
  }),
  'settlement of a support that stays in the primary': model({
    nodes: [[1, 0, 0], [2, 5, 0], [3, 10, 0]], elements: [[1, 1, 2, 'frame'], [2, 2, 3, 'frame']],
    supports: [[1, 'pinned', { dz: -0.004 }], [2, 'rollerX'], [3, 'rollerX']], loads: [],
  }),
  'temperature on a fixed-fixed beam': model({
    nodes: [[1, 0, 0], [2, 5, 0]], elements: [[1, 1, 2, 'frame']],
    supports: [[1, 'fixed'], [2, 'fixed']],
    loads: [{ type: 'thermal', data: { elementId: 1, dtUniform: 20, dtGradient: 15 } }],
  }),
  'spring support': model({
    nodes: [[1, 0, 0], [2, 6, 0]], elements: [[1, 1, 2, 'frame']],
    supports: [[1, 'fixed'], [2, 'spring', { ky: 3000 }]], loads: [q(1, -10)],
  }),
  'inclined roller': model({
    nodes: [[1, 0, 0], [2, 6, 0]], elements: [[1, 1, 2, 'frame']],
    supports: [[1, 'fixed'], [2, 'inclinedRoller', { angle: Math.PI / 6 }]], loads: [q(1, -10)],
  }),
  'partial load, and a point load with an axial component': model({
    nodes: [[1, 0, 0], [2, 6, 0], [3, 10, 0]], elements: [[1, 1, 2, 'frame'], [2, 2, 3, 'frame']],
    supports: [[1, 'fixed'], [2, 'rollerX'], [3, 'fixed']],
    loads: [q(1, -6, -6, { a: 1, b: 4 }), { type: 'pointOnElement', data: { elementId: 2, a: 1.5, p: -20, px: 3 } }],
  }),
};

const rel = (a: number, b: number, scale: number) => Math.abs(a - b) / Math.max(scale, 1e-12);

describe('every model: Mohr = displacements, Maxwell holds, and stiffness agrees', () => {
  for (const [name, input] of Object.entries(CASES)) {
    it(name, () => {
      const r = solveForceMethod(input);
      expect(r.redundants.length).toBe(r.count.gh);
      const n = r.redundants.length;
      const scale = Math.max(...r.delta.flat().map(Math.abs));
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          expect(rel(r.delta[i][j], r.deltaCheck[i][j], scale), `δ${i + 1}${j + 1}: ${r.delta[i][j]} vs ${r.deltaCheck[i][j]}`).toBeLessThan(1e-11);
          expect(rel(r.delta[i][j], r.delta[j][i], scale), 'symmetric').toBeLessThan(1e-11);
        }
        const s0 = Math.max(...r.delta0.map(Math.abs), 1e-12);
        expect(rel(r.delta0[i], r.delta0Check[i], s0), `δ${i + 1}0: ${r.delta0[i]} vs ${r.delta0Check[i]}`).toBeLessThan(1e-11);
      }
      /* Measured worst across these models: 1e-13 on every check. */
      expect(r.verification.maxForceDiff / r.verification.scale, 'end forces').toBeLessThan(1e-11);
      expect(r.verification.maxReactionDiff / r.verification.scale, 'reactions').toBeLessThan(1e-11);
      expect(r.verification.ok).toBe(true);
    });
  }
});

describe('the textbook numbers', () => {
  it('propped cantilever: the prop takes 3qL/8, as its only redundant', () => {
    const r = solveForceMethod(CASES['propped cantilever, uniform load']);
    expect(r.count.gh).toBe(1);
    /* The moment at the fixed end is released first: the primary is a simple beam. */
    expect(r.redundants[0]).toMatchObject({ kind: 'reaction', nodeId: 1, component: 2 });
    /* Fixed-end moment of a propped cantilever: qL²/8 = 45. */
    expect(Math.abs(r.X[0])).toBeCloseTo(45, 6);
    const prop = r.final.reactions.find((x) => x.nodeId === 2 && x.component === 1)!;
    expect(prop.value).toBeCloseTo((3 * 10 * 6) / 8, 6);
  });

  it('fixed-fixed beam: qL²/12 at both ends', () => {
    const r = solveForceMethod(CASES['fixed-fixed beam, uniform load']);
    expect(r.count.gh).toBe(3);
    const ends = r.final.bars[0].ends;
    expect(Math.abs(ends.mStart)).toBeCloseTo((10 * 36) / 12, 6);
    expect(Math.abs(ends.mEnd)).toBeCloseTo((10 * 36) / 12, 6);
  });

  it('two equal spans: the middle support takes 5qL/4, released as the redundant', () => {
    const r = solveForceMethod(CASES['two-span continuous beam']);
    expect(r.count.gh).toBe(1);
    /* The interior support is the continuous-beam choice. */
    expect(r.redundants[0]).toMatchObject({ kind: 'reaction', nodeId: 2, component: 1 });
    expect(r.X[0]).toBeCloseTo((5 * 12 * 5) / 4, 6);
    /* Mohr on a simple beam: δ₁₁ = L³/48EI with L = 10. */
    expect(r.delta[0][0]).toBeCloseTo(1000 / (48 * 200e6 * 1e-4), 12);
  });

  it('a closed loop is opened by a cut: three redundants at one end of a member', () => {
    const r = solveForceMethod(CASES['closed frame on two supports (a loop to cut)']);
    expect(r.count.gh).toBe(3);
    expect(r.redundants.map((x) => x.kind).sort()).toEqual(['cutM', 'cutN', 'cutV']);
  });

  it('a hinge in the loop leaves two: the cut releases N and V only', () => {
    const r = solveForceMethod(CASES['closed frame with a hinge (a two-force cut)']);
    expect(r.count.gh).toBe(2);
  });

  it('a truss with both diagonals has one redundant bar', () => {
    const r = solveForceMethod(CASES['truss with a redundant diagonal']);
    expect(r.count.gh).toBe(1);
    expect(r.redundants[0].kind).toBe('barForce');
  });
});

describe('what the method refuses', () => {
  it('an isostatic structure has no redundants, and says so', () => {
    const r = solveForceMethod(model({
      nodes: [[1, 0, 0], [2, 6, 0]], elements: [[1, 1, 2, 'frame']],
      supports: [[1, 'pinned'], [2, 'rollerX']], loads: [q(1, -10)],
    }));
    expect(r.isostatic).toBe(true);
    expect(r.count.gh).toBe(0);
  });

  it('a mechanism is not solved', () => {
    expect(() => solveForceMethod(model({
      nodes: [[1, 0, 0], [2, 6, 0]], elements: [[1, 1, 2, 'frame']],
      supports: [[1, 'rollerX'], [2, 'rollerX']], loads: [q(1, -10)],
    }))).toThrow(ForceMethodError);
  });
});
