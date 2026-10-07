/**
 * Cases made of other cases, notional loads, reductions, and combinations by SRSS and ABS, on a
 * portal frame: a composite case gives the linear combination it stands for, and with P-Delta per
 * combination its own second-order result; a reference case is solved for what takes it in and not
 * listed; SRSS and ABS by hand, at the ends and along a member.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../../store/model.svelte';
import { historyStore } from '../../store/history.svelte';
import '../../store';
import { initSolver } from '../wasm-solver';
import { solveCombinations3D, type ModelData } from '../solver-service';
import { evaluateDiagramAt } from '../diagrams-3d';
import { withCaseEffects, caseOrder } from '../case-effects';
import { withNotionalVariants } from '../loads/notional-combinations';
import type { AnalysisResults3D } from '../types-3d';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { modelStore.clear(); historyStore.clear(); });

const md = () => ({
  nodes: modelStore.nodes, elements: modelStore.elements, supports: modelStore.supports,
  loads: modelStore.loads, materials: modelStore.materials, sections: modelStore.sections,
  analysis: modelStore.analysis, groups: modelStore.model.groups,
});

/** A 6 m × 4 m portal in XZ, fixed feet; a gravity case and a lateral case. */
function portal() {
  const n1 = modelStore.addNode(0, 0, 0), n2 = modelStore.addNode(6, 0, 0);
  const n3 = modelStore.addNode(0, 0, 4), n4 = modelStore.addNode(6, 0, 4);
  const c1 = modelStore.addElement(n1, n3), beam = modelStore.addElement(n3, n4), c2 = modelStore.addElement(n2, n4);
  for (const n of [n1, n2]) modelStore.addSupport(n, 'fixed' as never);
  const D = modelStore.addLoadCase('D', 'D'), W = modelStore.addLoadCase('W', 'W');
  modelStore.addDistributedLoad3D(beam, 0, 0, -20, -20, undefined, undefined, D);
  modelStore.addNodalLoad3D(n3, 15, 0, 0, 0, 0, 0, W);
  return { n3, n4, c1, beam, c2, D, W };
}
const solve = () => {
  const r = solveCombinations3D(md() as never, modelStore.model.loadCases, modelStore.model.combinations, false, false);
  if (!r || typeof r === 'string') throw new Error(String(r));
  return r;
};
const disp = (r: AnalysisResults3D, n: number) => r.displacements.find((d) => d.nodeId === n)!;
const ef = (r: AnalysisResults3D, e: number) => r.elementForces.find((x) => x.elementId === e)!;

describe('a composite case', () => {
  it('is the linear combination of what it takes in, plus its own loads', () => {
    const { n3, n4, D, W } = portal();
    const C = modelStore.addLoadCase('1.2D + 1.6W + own', '');
    modelStore.updateLoadCaseFields(C, { includes: [{ caseId: D, factor: 1.2 }, { caseId: W, factor: 1.6 }] });
    modelStore.addNodalLoad3D(n4, 0, 0, -5, 0, 0, 0, C);
    const own = modelStore.addLoadCase('own', '');
    modelStore.addNodalLoad3D(n4, 0, 0, -5, 0, 0, 0, own);
    const combo = modelStore.addCombination('same', [{ caseId: D, factor: 1.2 }, { caseId: W, factor: 1.6 }, { caseId: own, factor: 1 }]);
    const r = solve();
    expect(disp(r.perCase.get(C)!, n3).ux).toBeCloseTo(disp(r.perCombo.get(combo)!, n3).ux, 12);
    expect(disp(r.perCase.get(C)!, n4).uz).toBeCloseTo(disp(r.perCombo.get(combo)!, n4).uz, 12);
  });

  it('with P-Delta per combination, taken in whole: its own second-order result', () => {
    const { n3, D, W } = portal();
    const C = modelStore.addLoadCase('C', '');
    modelStore.updateLoadCaseFields(C, { includes: [{ caseId: D, factor: 1 }, { caseId: W, factor: 1 }] });
    const a = modelStore.addCombination('as a case', [{ caseId: C, factor: 1 }]);
    const b = modelStore.addCombination('as its parts', [{ caseId: D, factor: 1 }, { caseId: W, factor: 1 }]);
    modelStore.setAnalysis({ perCombination: 'pdelta' });
    const r = solve();
    expect(disp(r.perCombo.get(a)!, n3).ux).toBeCloseTo(disp(r.perCombo.get(b)!, n3).ux, 10);
    // And larger than the linear sway: the gravity is there with the push.
    expect(Math.abs(disp(r.perCombo.get(a)!, n3).ux)).toBeGreaterThan(Math.abs(disp(r.perCase.get(C)!, n3).ux));
  });

  it('a reference case is solved for what takes it in, and not listed', () => {
    const { n3, D, W } = portal();
    modelStore.updateLoadCaseFields(W, { reference: true });
    const C = modelStore.addLoadCase('C', '');
    modelStore.updateLoadCaseFields(C, { includes: [{ caseId: W, factor: 2 }] });
    modelStore.updateLoadCaseFields(D, { solve: false });
    const r = solve();
    expect(r.perCase.has(W)).toBe(false);
    expect(r.perCase.has(D)).toBe(false);
    expect(Math.abs(disp(r.perCase.get(C)!, n3).ux)).toBeGreaterThan(0);
  });

  it('a loop takes nothing in', () => {
    portal();
    const A = modelStore.addLoadCase('A', ''), B = modelStore.addLoadCase('B', '');
    modelStore.updateLoadCaseFields(A, { includes: [{ caseId: B, factor: 1 }] });
    // The store refuses the loop; a file can still hold one.
    expect(modelStore.updateLoadCaseFields(B, { includes: [{ caseId: A, factor: 1 }] })).toBe(false);
    modelStore.model.loadCases.find((c) => c.id === B)!.includes = [{ caseId: A, factor: 1 }];
    expect([...caseOrder(modelStore.model.loadCases).looped].sort()).toEqual([A, B].sort());
  });
});

describe('notional loads and reductions', () => {
  it('a notional case: the fraction of its source’s gravity at each node, horizontal', () => {
    const { D } = portal();
    const N = modelStore.addLoadCase('N', 'N');
    modelStore.updateLoadCaseFields(N, { notional: { sourceCaseId: D, ratio: 0.002, dir: '+X' } });
    const m = withCaseEffects(md() as unknown as ModelData, modelStore.model.loadCases, { includeSelfWeight: false, leftHand: false });
    const fx = m.loads.filter((l) => l.data.caseId === N && l.type === 'nodal3d').reduce((s, l) => s + (l.data as { fx: number }).fx, 0);
    expect(fx).toBeCloseTo(0.002 * 20 * 6, 9);
    // In a gravity combination, with the source's factor.
    const W = modelStore.model.loadCases.find((c) => c.type === 'W')!.id;
    const out = withNotionalVariants([{ name: '1.4D', factors: [{ caseId: D, factor: 1.4 }], purpose: 'strength', specId: '1' }, { name: 'D+W', factors: [{ caseId: D, factor: 1.2 }, { caseId: W, factor: 1 }], purpose: 'strength', specId: '4' }], modelStore.model.loadCases);
    expect(out.map((c) => c.name)).toEqual(['1.4D', '1.4D + N +X', 'D+W']);
    expect(out[1]!.factors).toContainEqual({ caseId: N, factor: 1.4 });
  });

  it('a reduced case solves with its loads times the ratio', () => {
    const { n4, D } = portal();
    const L = modelStore.addLoadCase('L', 'L');
    modelStore.addNodalLoad3D(n4, 0, 0, -10, 0, 0, 0, L);
    const plain = solve();
    modelStore.updateLoadCaseFields(L, { reduction: { ratio: 0.6, tributaryAreaM2: 80, elementKind: 'interiorBeam', floorsSupported: 1 } });
    const reduced = solve();
    expect(disp(reduced.perCase.get(L)!, n4).uz).toBeCloseTo(0.6 * disp(plain.perCase.get(L)!, n4).uz, 12);
    void D;
  });
});

describe('SRSS and ABS', () => {
  it('quantity by quantity, at the ends and along a member', () => {
    const { n3, beam, D, W } = portal();
    const lin = modelStore.addCombination('lin', [{ caseId: D, factor: 1 }, { caseId: W, factor: 1 }]);
    const s = modelStore.addCombination('srss', [{ caseId: D, factor: 1 }, { caseId: W, factor: 2 }]);
    const a = modelStore.addCombination('abs', [{ caseId: D, factor: 1 }, { caseId: W, factor: -2 }]);
    modelStore.updateCombination(s, { method: 'srss' });
    modelStore.updateCombination(a, { method: 'abs' });
    const r = solve();
    const d = disp(r.perCase.get(D)!, n3), w = disp(r.perCase.get(W)!, n3);
    expect(disp(r.perCombo.get(s)!, n3).ux).toBeCloseTo(Math.hypot(d.ux, 2 * w.ux), 12);
    expect(disp(r.perCombo.get(a)!, n3).ux).toBeCloseTo(Math.abs(d.ux) + Math.abs(2 * w.ux), 12);
    // Along the beam: the cases' moments combined point by point.
    for (const t of [0.25, 0.5, 0.8]) {
      const md0 = evaluateDiagramAt(ef(r.perCase.get(D)!, beam), 'momentY', t), mw = evaluateDiagramAt(ef(r.perCase.get(W)!, beam), 'momentY', t);
      expect(evaluateDiagramAt(ef(r.perCombo.get(s)!, beam), 'momentY', t)).toBeCloseTo(Math.hypot(md0, 2 * mw), 9);
    }
    // The linear combination is untouched.
    expect(disp(r.perCombo.get(lin)!, n3).ux).toBeCloseTo(d.ux + w.ux, 12);
  });
});
