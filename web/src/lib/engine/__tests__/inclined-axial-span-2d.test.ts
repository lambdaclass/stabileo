/**
 * The part of a load that runs along an inclined member is a member load, not a load at its
 * ends. A load in global axes, or at an angle, on an inclined plane member has a component
 * along the member axis; it used to reach the solver as equivalent nodal loads at the two end
 * nodes. Reactions and displacements were right (the equivalent loads are the consistent ones),
 * but the member saw no axial span load, so N came out constant — the average of the two true
 * end values. A three-hinged gable with 3-4-5 rafters under 10 kN/m vertical read N = −41.667
 * at both ends of a rafter; it is −56.667 at the base and −26.667 at the apex.
 *
 * Every number here is closed form, from the free body of the member.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { historyStore, modelStore, uiStore } from '../../store';
import { computeDiagramValueAt } from '../diagrams';
import { computeDespieceVectors } from '../../canvas/draw-despiece';
import { solveDetailed } from '../solver-detailed';
import type { AnalysisResults, ElementForces } from '../types';

beforeEach(() => { historyStore.clear(); uiStore.analysisMode = '2d'; modelStore.clear(); });

const solved = (r: unknown): AnalysisResults => {
  expect(r).toBeTypeOf('object');
  return r as AnalysisResults;
};
const forcesOf = (r: AnalysisResults, id: number): ElementForces => r.elementForces.find((f) => f.elementId === id)!;
const reaction = (r: AnalysisResults, nodeId: number) => r.reactions.find((x) => x.nodeId === nodeId)!;
/** N at a distance x from end I, as the diagrams, the inspector and the section panel read it. */
const nAt = (ef: ElementForces, x: number) => computeDiagramValueAt('axial', x / ef.length, ef);

/** A 3:4:5 member from (0,0) to (4,3): unit axis e = (0.8, 0.6), L = 5. */
function inclinedSimplySupported() {
  const a = modelStore.addNode(0, 0), b = modelStore.addNode(4, 3);
  const e = modelStore.addElement(a, b);
  modelStore.addSupport(a, 'pinned');
  modelStore.addSupport(b, 'rollerX');
  return { a, b, e };
}

describe('axial span loads on inclined plane members', () => {
  it('three-hinged gable, 3-4-5 rafters, 10 kN/m vertical along the rafters', () => {
    const a = modelStore.addNode(0, 0), c = modelStore.addNode(4, 3), b = modelStore.addNode(8, 0);
    const left = modelStore.addElement(a, c), right = modelStore.addElement(c, b);
    modelStore.toggleHinge(left, 'end');
    modelStore.addSupport(a, 'pinned');
    modelStore.addSupport(b, 'pinned');
    modelStore.addDistributedLoad(left, -10, -10, 0, true);
    modelStore.addDistributedLoad(right, -10, -10, 0, true);
    const r = solved(modelStore.solve(false));

    // Reactions: V = 50 each, thrust H = (50·4 − 50·2)/3 = 33.333.
    expect(reaction(r, a).rz).toBeCloseTo(50, 6);
    expect(reaction(r, a).rx).toBeCloseTo(100 / 3, 6);
    expect(reaction(r, b).rx).toBeCloseTo(-100 / 3, 6);

    // Left rafter: N(x) = −(33.333·0.8 + 50·0.6) + 6x = −56.667 + 6x.
    const fl = forcesOf(r, left);
    expect(fl.nStart).toBeCloseTo(-170 / 3, 6);
    expect(fl.nEnd).toBeCloseTo(-80 / 3, 6);
    for (const x of [0, 1.25, 2.5, 4, 5]) expect(nAt(fl, x)).toBeCloseTo(-170 / 3 + 6 * x, 6);
    // Right rafter, I at the apex: the same, mirrored.
    const fr = forcesOf(r, right);
    expect(fr.nStart).toBeCloseTo(-80 / 3, 6);
    expect(fr.nEnd).toBeCloseTo(-170 / 3, 6);
    expect(nAt(fr, 2.5)).toBeCloseTo(-125 / 3, 6);

    // Transverse: 8 kN/m on a pinned–pinned 5 m span — V = ±20 at the ends, M = 25 at midspan.
    expect(Math.abs(fl.vStart)).toBeCloseTo(20, 6);
    expect(Math.abs(fl.vEnd)).toBeCloseTo(20, 6);
    expect(fl.mStart).toBeCloseTo(0, 6);
    expect(fl.mEnd).toBeCloseTo(0, 6);
    expect(Math.abs(computeDiagramValueAt('moment', 0.5, fl))).toBeCloseTo(25, 6);
  });

  it('the despiece: each rafter, cut free, balances the load drawn on it', () => {
    const a = modelStore.addNode(0, 0), c = modelStore.addNode(4, 3), b = modelStore.addNode(8, 0);
    const left = modelStore.addElement(a, c), right = modelStore.addElement(c, b);
    modelStore.toggleHinge(left, 'end');
    modelStore.addSupport(a, 'pinned');
    modelStore.addSupport(b, 'pinned');
    modelStore.addDistributedLoad(left, -10, -10, 0, true);
    modelStore.addDistributedLoad(right, -10, -10, 0, true);
    const r = solved(modelStore.solve(false));
    const nodes = modelStore.model.nodes;
    const vectors = computeDespieceVectors({
      elements: [...modelStore.model.elements.values()].map((e) => ({ id: e.id, nodeI: e.nodeI, nodeJ: e.nodeJ })),
      getNode: (id) => nodes.get(id),
      getElementForces: (id) => forcesOf(r, id),
      reactions: new Map(), sep: 1, vectorMode: 'members', basis: 'global', showReactions: false, resultant: false,
      fmt: () => '',
    });
    for (const id of [left, right]) {
      const sum = (label: string) => vectors.filter((v) => v.elementId === id && v.component === label).reduce((s, v) => s + v.value, 0);
      // The end actions on the member plus its 50 kN of load, straight down.
      expect(sum('Fx')).toBeCloseTo(0, 6);
      expect(sum('Fz') - 50).toBeCloseTo(0, 6);
    }
  });

  it('inclined simply supported member, 10 kN/m vertical (global): N from −15 to +15', () => {
    const { a, b, e } = inclinedSimplySupported();
    modelStore.addDistributedLoad(e, -10, -10, 0, true);
    const r = solved(modelStore.solve(false));
    expect(reaction(r, a).rx).toBeCloseTo(0, 6);
    expect(reaction(r, a).rz).toBeCloseTo(25, 6);
    expect(reaction(r, b).rz).toBeCloseTo(25, 6);
    const f = forcesOf(r, e);
    expect(f.nStart).toBeCloseTo(-15, 6);
    expect(f.nEnd).toBeCloseTo(15, 6);
    for (const x of [0, 1, 2.5, 4, 5]) expect(nAt(f, x)).toBeCloseTo(-15 + 6 * x, 6);
    expect(Math.abs(f.vStart)).toBeCloseTo(20, 6);
    expect(Math.abs(computeDiagramValueAt('moment', 0.5, f))).toBeCloseTo(25, 6);
  });

  it('a 30 kN vertical (global) point load at L/3 of an inclined member: N steps by 18 there', () => {
    const { a, b, e } = inclinedSimplySupported();
    modelStore.addPointLoadOnElement(e, 5 / 3, -30, { isGlobal: true });
    const r = solved(modelStore.solve(false));
    expect(reaction(r, a).rx).toBeCloseTo(0, 6);
    expect(reaction(r, a).rz).toBeCloseTo(20, 6);
    expect(reaction(r, b).rz).toBeCloseTo(10, 6);
    const f = forcesOf(r, e);
    // Left of the load −R_A·e = −12; right of it R_B·e = +6.
    expect(f.nStart).toBeCloseTo(-12, 6);
    expect(f.nEnd).toBeCloseTo(6, 6);
    expect(nAt(f, 1)).toBeCloseTo(-12, 6);
    expect(nAt(f, 5 / 3 - 1e-4)).toBeCloseTo(-12, 6);
    expect(nAt(f, 5 / 3 + 1e-4)).toBeCloseTo(6, 6);
    expect(nAt(f, 4)).toBeCloseTo(6, 6);
    // Transverse 24 kN at L/3: V = 16 then −8, M = 16·5/3 under the load.
    expect(Math.abs(f.vStart)).toBeCloseTo(16, 6);
    expect(Math.abs(computeDiagramValueAt('moment', 1 / 3, f))).toBeCloseTo(80 / 3, 6);
  });

  it('a local point load at 90° on a horizontal member is axial at its point, not at the ends', () => {
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(6, 0);
    const e = modelStore.addElement(a, b);
    modelStore.addSupport(a, 'pinned');
    modelStore.addSupport(b, 'rollerX');
    modelStore.addPointLoadOnElement(e, 2, 10, { angle: 90 });
    const r = solved(modelStore.solve(false));
    expect(reaction(r, a).rx).toBeCloseTo(-10, 6);
    const f = forcesOf(r, e);
    expect(f.nStart).toBeCloseTo(10, 6);
    expect(f.nEnd).toBeCloseTo(0, 6);
    expect(nAt(f, 1)).toBeCloseTo(10, 6);
    expect(nAt(f, 3)).toBeCloseTo(0, 6);
  });

  it('a partial trapezoidal vertical (global) load over [1, 4]: N quadratic under it', () => {
    const { a, b, e } = inclinedSimplySupported();
    modelStore.addDistributedLoad(e, -10, -20, 0, true, undefined, 1, 4);
    const r = solved(modelStore.solve(false));
    // W = 45 at 2.6667 from A: R_A = 21, R_B = 24.
    expect(reaction(r, a).rz).toBeCloseTo(21, 6);
    expect(reaction(r, b).rz).toBeCloseTo(24, 6);
    const f = forcesOf(r, e);
    const w = (x: number) => { // ∫ |q| from 1 to x, |q| = 10 + (10/3)(ξ − 1)
      const s = Math.min(Math.max(x - 1, 0), 3);
      return 10 * s + (10 / 3) * s * s / 2;
    };
    expect(f.nStart).toBeCloseTo(-12.6, 6);
    expect(f.nEnd).toBeCloseTo(14.4, 6);
    for (const x of [0, 0.5, 1, 2.5, 3.2, 4, 4.5, 5]) expect(nAt(f, x)).toBeCloseTo(-12.6 + 0.6 * w(x), 6);
  });

  it('self-weight on an inclined member: N runs from −0.3·W to +0.3·W', () => {
    const { a, b, e } = inclinedSimplySupported();
    const r = solved(modelStore.solve(true));
    const W = reaction(r, a).rz + reaction(r, b).rz;
    expect(W).toBeGreaterThan(0);
    expect(reaction(r, a).rx).toBeCloseTo(0, 6);
    const f = forcesOf(r, e);
    expect(f.nStart).toBeCloseTo(-0.3 * W, 6);
    expect(f.nEnd).toBeCloseTo(0.3 * W, 6);
    expect(nAt(f, 2.5)).toBeCloseTo(0, 6);
  });

  it('combinations superpose the corrected N, case by case', () => {
    const { e } = inclinedSimplySupported();
    const dead = modelStore.addLoadCase('D-axial', 'D');
    const live = modelStore.addLoadCase('L-axial', 'L');
    modelStore.addDistributedLoad(e, -10, -10, 0, true, dead);
    modelStore.addPointLoadOnElement(e, 5 / 3, -30, { isGlobal: true, caseId: live });
    const combo = modelStore.addCombination('1.2D+1.6L', [{ caseId: dead, factor: 1.2 }, { caseId: live, factor: 1.6 }]);
    const res = modelStore.solveCombinations(false);
    expect(res).toBeTypeOf('object');
    const { perCase, perCombo } = res as Exclude<typeof res, string | null>;
    const fd = forcesOf(perCase.get(dead)!, e), fl = forcesOf(perCase.get(live)!, e), fc = forcesOf(perCombo.get(combo)!, e);
    expect(fd.nStart).toBeCloseTo(-15, 6);
    expect(fl.nStart).toBeCloseTo(-12, 6);
    expect(fc.nStart).toBeCloseTo(1.2 * -15 + 1.6 * -12, 6);
    expect(fc.nEnd).toBeCloseTo(1.2 * 15 + 1.6 * 6, 6);
    for (const x of [0.5, 1.5, 2, 3.5, 4.5]) {
      expect(nAt(fc, x)).toBeCloseTo(1.2 * nAt(fd, x) + 1.6 * nAt(fl, x), 6);
    }
    expect(nAt(fc, 1)).toBeCloseTo(1.2 * (-15 + 6) + 1.6 * -12, 6);
  });

  it('the step-by-step stiffness method takes the same load along the member', () => {
    const { e } = inclinedSimplySupported();
    modelStore.addDistributedLoad(e, -10, -10, 0, true);
    const steps = solveDetailed(modelStore.buildSolverInput(false)!);
    const f = steps.elementForces.find((x) => x.elementId === e)!;
    // Local end forces [Ni, Vi, Mi, Nj, Vj, Mj]: nStart = −Ni, nEnd = Nj.
    expect(-f.fLocalFinal[0]).toBeCloseTo(-15, 6);
    expect(f.fLocalFinal[3]).toBeCloseTo(15, 6);
  });
});
