/**
 * The active-set loop: tension-only diagonals drawn as frame members, which act as axial bars,
 * go slack with exact zeros, and leave the reactions in the results; statics in six components;
 * superposed combinations against combinations solved on their own; a settlement counted once.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { historyStore } from '../../store/history.svelte';
import '../../store';
import { initSolver } from '../wasm-solver';
import { validateAndSolve3D, solveCombinations3D } from '../solver-service';
import { staticsCheck } from '../statics-check';
import { SETTLEMENT_CASE_ID } from '../settlement-case';
import type { AnalysisResults3D } from '../types-3d';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { modelStore.clear(); historyStore.clear(); });

const md = () => ({
  nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports,
  loads: modelStore.loads, materials: modelStore.materials, sections: modelStore.sections,
  analysis: modelStore.analysis, groups: modelStore.model.groups,
});
function solve(): AnalysisResults3D {
  const r = validateAndSolve3D(md() as never, false, false);
  if (!r || typeof r === 'string') throw new Error(String(r));
  return r;
}
const f = (r: AnalysisResults3D, id: number) => r.elementForces.find((x) => x.elementId === id)!;
const allZero = (row: Record<string, unknown>) => Object.entries(row).every(([k, v]) => k === 'elementId' || k === 'length' || typeof v !== 'number' || v === 0);

/** A braced bay in XZ, both diagonals drawn as FRAME members marked tension-only. */
function bay() {
  const n1 = modelStore.addNode(0, 0, 0), n2 = modelStore.addNode(4, 0, 0);
  const n3 = modelStore.addNode(0, 0, 3), n4 = modelStore.addNode(4, 0, 3);
  for (const [a, b] of [[n1, n3], [n2, n4], [n3, n4]]) modelStore.addElement(a!, b!, 'frame');
  const up = modelStore.addElement(n1, n4, 'frame');   // lengthens under a push toward +X
  const down = modelStore.addElement(n2, n3, 'frame'); // shortens under it
  for (const id of [up, down]) modelStore.updateElement(id, { behaviour: 'tensionOnly' } as never);
  for (const n of [n1, n2]) modelStore.addSupport(n, 'custom3d' as never, undefined, { dofRestraints: { tx: true, ty: true, tz: true, rx: true, ry: false, rz: true } });
  for (const n of [n3, n4]) modelStore.addSupport(n, 'custom3d' as never, undefined, { dofRestraints: { tx: false, ty: true, tz: false, rx: true, ry: false, rz: true } });
  return { n1, n2, n3, n4, up, down };
}

describe('one-way members in the active-set loop', () => {
  it('a tension-only frame diagonal acts as a bar: the compressed one carries exact zeros', () => {
    const { n3, up, down } = bay();
    modelStore.addNodalLoad3D(n3, 10, 0, 0, 0, 0, 0);
    const r = solve();
    expect(r.nonlinear).toMatchObject({ converged: true, slack: [down] });
    expect(allZero(f(r, down) as never)).toBe(true);
    expect(f(r, up).nStart).toBeGreaterThan(0);
    // A bar: no bending in the diagonal that works.
    expect(Math.abs(f(r, up).myStart) + Math.abs(f(r, up).mzStart)).toBeLessThan(1e-9);
    // The reactions are there, and they balance the push.
    expect(r.reactions.length).toBeGreaterThan(0);
    expect(r.reactions.reduce((s, x) => s + x.fx, 0)).toBeCloseTo(-10, 9);
    const rows = staticsCheck({ model: md() as never, reactionsByCase: new Map([[null, r.reactions]]), includeSelfWeight: false });
    expect(rows[0]!.worstRelative).toBeLessThan(1e-9);
  });

  it('turning the push around swaps which diagonal works', () => {
    const { n3, up, down } = bay();
    modelStore.addNodalLoad3D(n3, -10, 0, 0, 0, 0, 0);
    const r = solve();
    expect(r.nonlinear!.slack).toEqual([up]);
    expect(f(r, down).nStart).toBeGreaterThan(0);
  });
});

describe('combinations with one-way members', () => {
  function twoWays() {
    const b = bay();
    const right = modelStore.addLoadCase('W+', 'W');
    const left = modelStore.addLoadCase('W-', 'W');
    modelStore.addNodalLoad3D(b.n3, 10, 0, 0, 0, 0, 0, right);
    modelStore.addNodalLoad3D(b.n3, -10, 0, 0, 0, 0, 0, left);
    const combo = modelStore.addCombination('W+ − 2 W−', [{ caseId: right, factor: 1 }, { caseId: left, factor: -2 }]);
    return { ...b, combo };
  }
  const bundle = () => {
    const r = solveCombinations3D(md() as never, modelStore.model.loadCases, modelStore.model.combinations, false, false);
    if (!r || typeof r === 'string') throw new Error(String(r));
    return r;
  };

  it('solved on its own: the combination finds its own active set, nothing violated', () => {
    const { up, down, combo } = twoWays();
    const c = bundle().perCombo.get(combo)!;
    expect(c.nonlinear).toMatchObject({ converged: true, slack: [down] });
    expect(c.nonlinear!.signViolations).toBeUndefined();
    expect(f(c, up).nStart).toBeGreaterThan(0);
  });

  it('superposed: the sum of the cases, with the members it leaves compressed listed', () => {
    const { down, combo } = twoWays();
    modelStore.setAnalysis({ combinationMethod: 'superpose' });
    const c = bundle().perCombo.get(combo)!;
    // Case W− put the load on the other diagonal; −2 times it is compression in a tension-only bar.
    expect(c.nonlinear!.signViolations!.members).toEqual([down]);
    expect(f(c, down).nStart).toBeLessThan(0);
  });
});

describe('a settlement', () => {
  it('goes into each combination once, and into no case', () => {
    const { n2, n3, combo } = (() => {
      const b = bay();
      modelStore.addNodalLoad3D(b.n3, 5, 0, 0, 0, 0, 0, 1);
      const c = modelStore.addCombination('1.2D', [{ caseId: 1, factor: 1.2 }]);
      return { ...b, combo: c };
    })();
    const sup = [...modelStore.supports.values()].find((s) => s.nodeId === n2)!;
    modelStore.updateSupport(sup.id, { dz: -0.01 } as never);
    const b = solveCombinations3D(md() as never, modelStore.model.loadCases, modelStore.model.combinations, false, false);
    if (!b || typeof b === 'string') throw new Error(String(b));
    const uz = (r: AnalysisResults3D) => r.displacements.find((d) => d.nodeId === n2)!.uz;
    expect(uz(b.perCombo.get(combo)!)).toBeCloseTo(-0.01, 12);
    expect(uz(b.perCase.get(1)!)).toBeCloseTo(0, 12);
    expect(b.perCase.has(SETTLEMENT_CASE_ID)).toBe(true);
    void n3;
  });
});
