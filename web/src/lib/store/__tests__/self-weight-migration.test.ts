/**
 * An older PRO project is given its self-weight rule once, from what it computed before: the
 * weight in its first dead-load case (the older rule counted it in every one), a case made for it
 * when there is none, nothing when self-weight was off. It is not the user's edit, so it takes no
 * undo step; and Basic, which has its own toggle, does not read the rule.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { uiStore } from '../ui.svelte';
import { historyStore } from '../history.svelte';
import '../index';
import { migrateSelfWeightIfNeeded, planSelfWeight } from '../self-weight-migration';
import { initSolver } from '../../engine/wasm-solver';
import { t } from '../../i18n';

beforeAll(async () => { await initSolver(); });
beforeEach(() => { uiStore.analysisMode = 'pro'; uiStore.includeSelfWeight = true; modelStore.clear(); historyStore.clear(); });

/** A column with a load, and the cases asked for (the default model's cases removed). */
function project(types: string[]) {
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3);
  modelStore.addElement(a, b, 'frame');
  modelStore.addSupport(a, 'fixed3d');
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  for (const c of [...modelStore.model.loadCases]) modelStore.removeLoadCase(c.id);
  const ids = types.map((ty, i) => modelStore.addLoadCase(`${ty}${i}`, ty as never));
  modelStore.addNodalLoad3D(b, 0, 0, -10, 0, 0, 0, ids[0] ?? 1);
  // The rule the store may have been given while building: an older file has none.
  modelStore.withoutUndo(() => modelStore.setAnalysis({ selfWeight: undefined }));
  historyStore.clear();
  return { ids, head: b };
}
const lastToast = () => uiStore.toasts[uiStore.toasts.length - 1]?.message ?? '';

describe('the plan', () => {
  it('the first dead-load case; none when off; the count of dead-load cases for the notice', () => {
    const cases = [{ id: 3, type: 'L' }, { id: 5, type: 'D' }, { id: 7, type: 'D' }];
    expect(planSelfWeight(cases, true)).toMatchObject({ caseId: 5, deadCases: 2, selfWeight: [{ caseId: 5, direction: 'Z', factor: -1 }] });
    expect(planSelfWeight(cases, false).selfWeight).toEqual([]);
    expect(planSelfWeight([{ id: 1, type: 'L' }], true)).toMatchObject({ caseId: null, selfWeight: [] });
  });
});

describe('the migration', () => {
  it('one dead-load case: the rule goes there, with the plain notice, and no undo step', () => {
    const { ids } = project(['D', 'L']);
    expect(migrateSelfWeightIfNeeded()).toBe(true);
    expect(modelStore.analysis!.selfWeight).toEqual([{ caseId: ids[0], direction: 'Z', factor: -1 }]);
    expect(lastToast()).toContain(t('selfWeight.migrated').split('{')[0]!.trim().slice(0, 12));
    expect(historyStore.canUndo).toBe(false);
  });

  it('two dead-load cases: the first one, and the notice says the weight used to be in both', () => {
    project(['D', 'D']);
    migrateSelfWeightIfNeeded();
    expect(modelStore.analysis!.selfWeight).toHaveLength(1);
    expect(lastToast()).toContain('2');
  });

  it('no dead-load case: one is made for it, still without an undo step', () => {
    project(['L']);
    const before = modelStore.model.loadCases.length;
    migrateSelfWeightIfNeeded();
    expect(modelStore.model.loadCases.length).toBe(before + 1);
    const made = modelStore.model.loadCases[modelStore.model.loadCases.length - 1]!;
    expect(made.type).toBe('D');
    expect(modelStore.analysis!.selfWeight![0]!.caseId).toBe(made.id);
    expect(historyStore.canUndo).toBe(false);
  });

  it('self-weight off: a stated empty rule, and it runs once', () => {
    uiStore.includeSelfWeight = false;
    project(['D']);
    expect(migrateSelfWeightIfNeeded()).toBe(true);
    expect(modelStore.analysis!.selfWeight).toEqual([]);
    expect(migrateSelfWeightIfNeeded()).toBe(false);
  });
});

describe('Basic reads its own toggle', () => {
  it('a model that visited PRO with self-weight off still takes it in Basic when the toggle is on', () => {
    uiStore.includeSelfWeight = false;
    project(['D']);
    migrateSelfWeightIfNeeded();
    uiStore.analysisMode = '3d';
    const r = modelStore.solve3D(true, false, false);
    if (!r || typeof r === 'string') throw new Error(String(r));
    // 10 kN of load and the column's own weight.
    expect(r.reactions.reduce((s, x) => s + x.fz, 0)).toBeGreaterThan(10 + 1e-6);
  });
});

describe('Basic puts self-weight in the case chosen for it', () => {
  const sumFz = (r: { reactions: Array<{ fz?: number; rz?: number }> }) => r.reactions.reduce((s, x) => s + (x.fz ?? x.rz ?? 0), 0);

  it('3D: in the chosen case only, and the first dead-load case when none is chosen', () => {
    uiStore.analysisMode = '3d';
    const { ids } = project(['D', 'L']);
    modelStore.addCombination('C', [{ caseId: ids[0]!, factor: 1 }, { caseId: ids[1]!, factor: 1 }]);
    uiStore.selfWeightCaseId = ids[1]!;
    let r = modelStore.solveCombinations3D(true, false, false);
    if (!r || typeof r === 'string') throw new Error(String(r));
    // The load is in D; the weight now in L.
    expect(sumFz(r.perCase.get(ids[0]!)!)).toBeCloseTo(10, 6);
    expect(sumFz(r.perCase.get(ids[1]!)!)).toBeGreaterThan(1e-6);
    uiStore.selfWeightCaseId = null;
    r = modelStore.solveCombinations3D(true, false, false);
    if (!r || typeof r === 'string') throw new Error(String(r));
    expect(sumFz(r.perCase.get(ids[0]!)!)).toBeGreaterThan(10 + 1e-6);
    expect(Math.abs(sumFz(r.perCase.get(ids[1]!)!))).toBeLessThan(1e-6);
  });

  it('2D: the same rule per case', () => {
    uiStore.analysisMode = '2d';
    modelStore.clear();
    const a = modelStore.addNode(0, 0), b = modelStore.addNode(4, 0);
    modelStore.addElement(a, b, 'frame');
    modelStore.addSupport(a, 'fixed');
    for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
    for (const c of [...modelStore.model.loadCases]) modelStore.removeLoadCase(c.id);
    const d = modelStore.addLoadCase('D0', 'D'), l = modelStore.addLoadCase('L1', 'L');
    modelStore.addNodalLoad(b, 0, -10, 0, d);
    modelStore.addNodalLoad(b, 0, -5, 0, l);
    modelStore.addCombination('C', [{ caseId: d, factor: 1 }, { caseId: l, factor: 1 }]);
    const vertical = (res: { reactions: Array<{ rz?: number; ry?: number }> }) => res.reactions.reduce((s, x) => s + (x.rz ?? x.ry ?? 0), 0);
    uiStore.selfWeightCaseId = l;
    const r = modelStore.solveCombinations(true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    expect(vertical(r.perCase.get(d)!)).toBeCloseTo(10, 6);
    expect(vertical(r.perCase.get(l)!)).toBeGreaterThan(5 + 1e-6);
    uiStore.selfWeightCaseId = null;
  });
});
