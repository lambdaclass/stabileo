/**
 * Reproductions from the review of #274, against main before the fix. Closed form throughout.
 *
 * - A load in global axes on an inclined plane member: its part along the member reached the
 *   solver as end loads, so N came out constant (the mean of the true end values, here 0).
 * - A plane model solved in space: a couple on a member was dropped (all reactions 0), and a
 *   nodal couple went in about +Y, the mirror image of the drawn load (standing in X–Z is a
 *   reflection), so the vertical reactions came out with the other sign.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { historyStore, modelStore, uiStore } from '../../store';
import { validateAndSolve3D, shouldEmbedFlat2DModelIn3D } from '../solver-service';
import type { AnalysisResults } from '../types';
import type { AnalysisResults3D } from '../types-3d';

beforeEach(() => { historyStore.clear(); uiStore.analysisMode = '2d'; modelStore.clear(); });

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

describe('inclined member loads and couples (review of #274)', () => {
  it('3-4-5 member, pinned / rollerX, 10 kN/m global vertical: N runs from −15 to +15', () => {
    // W = 50 kN, vertical reactions 25 each; along e = (0.8, 0.6): N(0) = −25·0.6, N(L) = +25·0.6.
    const A = modelStore.addNode(0, 0), B = modelStore.addNode(4, 3);
    const e = modelStore.addElement(A, B);
    modelStore.addSupport(A, 'pinned');
    modelStore.addSupport(B, 'rollerX');
    modelStore.addDistributedLoad(e, -10, -10, 0, true);
    const f = plane().elementForces.find((x) => x.elementId === e)!;
    expect(f.nStart).toBeCloseTo(-15, 6);
    expect(f.nEnd).toBeCloseTo(15, 6);
  });

  const L = 6, a = 1.5, b = L - a, M = 10;
  const V = 6 * M * a * b / L ** 3; // 1.875: fixed-fixed beam, couple M at a

  it('a couple on a member, solved in space: the fixed-fixed reaction 6Mab/L³ = 1.875', () => {
    const A = modelStore.addNode(0, 0), B = modelStore.addNode(L, 0);
    const e = modelStore.addElement(A, B);
    modelStore.addPointLoadOnElement(e, a, 0, { my: M });
    modelStore.addSupport(A, 'fixed');
    modelStore.addSupport(B, 'fixed');
    expect(shouldEmbedFlat2DModelIn3D(modelStore.model as never)).toBe(true);
    expect(plane().reactions.find((x) => x.nodeId === A)!.rz).toBeCloseTo(V, 6);
    expect(space().reactions.find((x) => x.nodeId === A)!.fz).toBeCloseTo(V, 6);
  });

  it('a couple at a node, solved in space: the vertical reaction is not mirrored', () => {
    const A = modelStore.addNode(0, 0), C = modelStore.addNode(a, 0), B = modelStore.addNode(L, 0);
    modelStore.addElement(A, C); modelStore.addElement(C, B);
    modelStore.addNodalLoad(C, 0, 0, M);
    modelStore.addSupport(A, 'fixed');
    modelStore.addSupport(B, 'fixed');
    const r2 = plane().reactions.find((x) => x.nodeId === A)!;
    const r3 = space().reactions.find((x) => x.nodeId === A)!;
    expect(r2.rz).toBeCloseTo(V, 6);
    expect(r3.fz).toBeCloseTo(r2.rz, 6);
  });
});
