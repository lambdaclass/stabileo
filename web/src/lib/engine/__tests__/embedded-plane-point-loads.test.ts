/**
 * A plane model solved in space (embedded standing in X–Z, or lying in X–Y) answers what the
 * plane solve answers, for the loads that act at a point of a member and along it.
 *
 * - A couple on a member (`my` of a plane point load) was dropped by the space mapping: a beam
 *   with only a couple on it had no reactions at all.
 * - Standing in X–Z the plane is a reflection of the drawn one, (x, y) → (x, 0, y): a
 *   counter-clockwise couple as drawn is about −Y there, and the embedded reactions read the
 *   plane's My with its sign turned. A nodal couple went in as +Y, the mirror image of the load.
 * - The part of a load along an inclined member (a point load's at its point, a distributed
 *   one's along its span) was lumped at the member's ends, so the member carried a constant N.
 *
 * Closed forms: a fixed-fixed beam of span L with a couple M at a (b = L − a) has end shears
 * 6Mab/L³ and end moments Mb(2a − b)/L², Ma(2b − a)/L²; a propped cantilever (fixed at A) has
 * the prop's reaction 3Ma(2L − a)/(2L³), a from the fixed end.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { historyStore, modelStore, uiStore } from '../../store';
import { validateAndSolve3D, shouldEmbedFlat2DModelIn3D } from '../solver-service';
import { materializeStandingPlaneModel } from '../../store/materialize-space';
import type { AnalysisResults } from '../types';
import type { AnalysisResults3D } from '../types-3d';

beforeEach(() => { historyStore.clear(); uiStore.analysisMode = '2d'; modelStore.clear(); });

const L = 6, a = 1.5, b = L - a, M = 10;
const plane = (): AnalysisResults => {
  const r = modelStore.solve(false);
  expect(r).toBeTypeOf('object');
  return r as AnalysisResults;
};
const space = (): AnalysisResults3D => {
  const r = validateAndSolve3D(modelStore.model as never, false);
  expect(r).toBeTypeOf('object');
  return r as AnalysisResults3D;
};
const at = <T extends { nodeId: number }>(rs: T[], id: number) => rs.find((x) => x.nodeId === id)!;

function beam(supportB: 'fixed' | 'rollerX', moment: 'member' | 'node') {
  const A = modelStore.addNode(0, 0), B = modelStore.addNode(L, 0);
  if (moment === 'member') {
    const e = modelStore.addElement(A, B);
    modelStore.addPointLoadOnElement(e, a, 0, { my: M });
  } else {
    const C = modelStore.addNode(a, 0);
    modelStore.addElement(A, C); modelStore.addElement(C, B);
    modelStore.addNodalLoad(C, 0, 0, M);
  }
  modelStore.addSupport(A, 'fixed');
  modelStore.addSupport(B, supportB);
  return { A, B };
}

describe('a couple on a member of a plane model, solved standing in X–Z', () => {
  for (const moment of ['member', 'node'] as const) {
    it(`fixed-fixed beam, couple ${moment === 'member' ? 'on the member' : 'at a node'}: the closed form, in both solves`, () => {
      const { A, B } = beam('fixed', moment);
      expect(shouldEmbedFlat2DModelIn3D(modelStore.model as never)).toBe(true);
      const r2 = plane(), r3 = space();
      const V = 6 * M * a * b / L ** 3, MA = M * b * (2 * a - b) / L ** 2, MB = M * a * (2 * b - a) / L ** 2;
      // The plane solve: counter-clockwise M, the left support pushes up.
      expect(at(r2.reactions, A).rz).toBeCloseTo(V, 6);
      expect(at(r2.reactions, B).rz).toBeCloseTo(-V, 6);
      expect(at(r2.reactions, A).my).toBeCloseTo(MA, 6);
      expect(at(r2.reactions, B).my).toBeCloseTo(MB, 6);
      // Standing in X–Z: the same forces, the moments about −Y.
      expect(at(r3.reactions, A).fz).toBeCloseTo(V, 6);
      expect(at(r3.reactions, B).fz).toBeCloseTo(-V, 6);
      expect(at(r3.reactions, A).my).toBeCloseTo(-MA, 6);
      expect(at(r3.reactions, B).my).toBeCloseTo(-MB, 6);
    });
  }

  it('propped cantilever: the prop takes 3Ma(2L − a)/(2L³) in both solves', () => {
    const { A, B } = beam('rollerX', 'member');
    const R = 3 * M * a * (2 * L - a) / (2 * L ** 3);
    const r2 = plane(), r3 = space();
    expect(Math.abs(at(r2.reactions, B).rz)).toBeCloseTo(R, 6);
    expect(at(r3.reactions, B).fz).toBeCloseTo(at(r2.reactions, B).rz, 6);
    expect(at(r3.reactions, A).fz).toBeCloseTo(at(r2.reactions, A).rz, 6);
    expect(at(r3.reactions, A).my).toBeCloseTo(-at(r2.reactions, A).my, 6);
  });

  it('lying in X–Y (a space support): the couple is about Z, as drawn', () => {
    const A = modelStore.addNode(0, 0), B = modelStore.addNode(L, 0);
    const e = modelStore.addElement(A, B);
    modelStore.addPointLoadOnElement(e, a, 0, { my: M });
    modelStore.addSupport(A, 'fixed3d' as never);
    modelStore.addSupport(B, 'fixed3d' as never);
    expect(shouldEmbedFlat2DModelIn3D(modelStore.model as never)).toBe(false);
    const r3 = space();
    const V = 6 * M * a * b / L ** 3;
    expect(at(r3.reactions, A).fy).toBeCloseTo(V, 6);
    expect(at(r3.reactions, A).mz).toBeCloseTo(M * b * (2 * a - b) / L ** 2, 6);
    expect(at(r3.reactions, B).mz).toBeCloseTo(M * a * (2 * b - a) / L ** 2, 6);
  });

  it('made a space model, it keeps the couple and its sense', () => {
    const { A, B } = beam('fixed', 'member');
    const before = space();
    let id = 1000;
    expect(materializeStandingPlaneModel(modelStore.model as never, () => id++)).toBe(true);
    const after = space();
    for (const n of [A, B]) {
      expect(at(after.reactions, n).fz).toBeCloseTo(at(before.reactions, n).fz, 6);
      expect(at(after.reactions, n).my).toBeCloseTo(at(before.reactions, n).my, 6);
    }
  });

  it('made a space model, a prescribed support rotation keeps its sense', () => {
    const A = modelStore.addNode(0, 0), B = modelStore.addNode(L, 0);
    modelStore.addElement(A, B);
    modelStore.addSupport(A, 'fixed', undefined, { dry: 0.002 } as never);
    modelStore.addSupport(B, 'fixed');
    const before = space();
    let id = 1000;
    expect(materializeStandingPlaneModel(modelStore.model as never, () => id++)).toBe(true);
    const after = space();
    expect(at(after.displacements, A).ry).toBeCloseTo(at(before.displacements, A).ry, 12);
    expect(Math.abs(at(before.displacements, A).ry)).toBeCloseTo(0.002, 12);
    for (const n of [A, B]) {
      expect(at(after.reactions, n).fz).toBeCloseTo(at(before.reactions, n).fz, 6);
      expect(at(after.reactions, n).my).toBeCloseTo(at(before.reactions, n).my, 6);
    }
  });
});

describe('loads along an inclined member of a plane model, solved standing in X–Z', () => {
  it('three-hinged gable under 10 kN/m vertical: N from −56.667 at the base to −26.667 at the apex', () => {
    const A = modelStore.addNode(0, 0), C = modelStore.addNode(4, 3), B = modelStore.addNode(8, 0);
    const left = modelStore.addElement(A, C), right = modelStore.addElement(C, B);
    modelStore.toggleHinge(left, 'end');
    modelStore.addSupport(A, 'pinned'); modelStore.addSupport(B, 'pinned');
    modelStore.addDistributedLoad(left, -10, -10, 0, true);
    modelStore.addDistributedLoad(right, -10, -10, 0, true);
    const r3 = space();
    const fl = r3.elementForces.find((f) => f.elementId === left)!;
    const fr = r3.elementForces.find((f) => f.elementId === right)!;
    expect(fl.nStart).toBeCloseTo(-170 / 3, 6);
    expect(fl.nEnd).toBeCloseTo(-80 / 3, 6);
    expect(fr.nStart).toBeCloseTo(-80 / 3, 6);
    expect(fr.nEnd).toBeCloseTo(-170 / 3, 6);
  });

  it('a 30 kN vertical point load at L/3 of a 3-4-5 member: N −12 before it, +6 after', () => {
    const A = modelStore.addNode(0, 0), B = modelStore.addNode(4, 3);
    const e = modelStore.addElement(A, B);
    modelStore.addSupport(A, 'pinned'); modelStore.addSupport(B, 'rollerX');
    modelStore.addPointLoadOnElement(e, 5 / 3, -30, { isGlobal: true });
    const r3 = space();
    const f = r3.elementForces.find((x) => x.elementId === e)!;
    expect(f.nStart).toBeCloseTo(-12, 6);
    expect(f.nEnd).toBeCloseTo(6, 6);
    expect(at(r3.reactions, A).fz).toBeCloseTo(20, 6);
  });
});
