/**
 * The statics table across cases and combinations: a combination's applied side is its cases'
 * with the factors, its reactions are its own, and it balances when they do.
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { issue2297Factors } from '../../engine/__tests__/combination-factor-fixture';
import { displayedLoads2D } from '../displayed-loads-2d';
import { displayedLoads3D } from '../displayed-loads-3d';
import { resultsStore } from '../results.svelte';
import { modelStore } from '../model.svelte';
import { uiStore } from '../ui.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { publishCombinations3D } from '../active-results';
import { staticsRows, staticsCsv, BALANCED } from '../statics-rows';

beforeAll(async () => { await initSolver(); });
afterEach(() => { uiStore.analysisMode = '3d'; });

describe('statics across combinations', () => {
  it('balances each combination, with the factored applied loads', () => {
    uiStore.analysisMode = 'pro';
    modelStore.clear();
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3), c = modelStore.addNode(4, 0, 3), d = modelStore.addNode(4, 0, 0);
    const e1 = modelStore.addElement(a, b, 'frame'), e2 = modelStore.addElement(b, c, 'frame'); modelStore.addElement(d, c, 'frame');
    modelStore.addSupport(a, 'fixed3d'); modelStore.addSupport(d, 'fixed3d');
    for (const x of [...modelStore.combinations]) modelStore.removeCombination(x.id);
    const dead = modelStore.addLoadCase('D', 'D'), wind = modelStore.addLoadCase('W', 'W');
    modelStore.addDistributedLoad3D(e2, 0, 0, -10, -10, undefined, undefined, dead);
    modelStore.addNodalLoad3D(b, 5, 0, 0, 0, 0, 0, wind);
    void e1;
    const k = modelStore.addCombination('1.2D+1.6W', [{ caseId: dead, factor: 1.2 }, { caseId: wind, factor: 1.6 }]);
    // Solved as the app solves it: with the self-weight the statics side counts.
    const r = modelStore.solveCombinations3D(uiStore.includeSelfWeight, false, true);
    if (!r || typeof r === 'string') throw new Error(String(r));
    publishCombinations3D(r);

    const rows = staticsRows()!;
    const D = rows.cases.find((x) => x.caseId === dead)!, W = rows.cases.find((x) => x.caseId === wind)!;
    const combo = rows.combos.find((x) => x.comboId === k)!;
    expect(combo.applied.fx).toBeCloseTo(1.2 * D.applied.fx + 1.6 * W.applied.fx, 9);
    expect(combo.applied.fz).toBeCloseTo(1.2 * D.applied.fz + 1.6 * W.applied.fz, 9);
    expect(combo.applied.fx).toBeCloseTo(1.6 * 5, 6);
    expect(combo.worstRelative).toBeLessThan(BALANCED);
    const csv = staticsCsv(rows, { kind: 'k', name: 'n', caseLabel: 'case', comboLabel: 'combo', applied: 'A', reactions: 'R', residual: 'D', relative: 'rel' });
    expect(csv.split('\n')).toHaveLength(1 + rows.cases.length + rows.combos.length);
    expect(csv.split('\n')[0]!.split(',')).toHaveLength(2 + 18 + 1);
  });
});

it('#2297 published planar free-body loads preserve a repeated case', () => {
  modelStore.clear();
  uiStore.analysisMode = '2d';
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(2, 0, 0);
  modelStore.addElement(a, b, 'frame');
  modelStore.addSupport(a, 'fixed');
  const dead = modelStore.addLoadCase('Test dead', 'D');
  modelStore.addNodalLoad(b, 0, -2, 0, dead);
  const rotated = [issue2297Factors.at(-1)!, ...issue2297Factors.slice(0, -1)];
  const unit = modelStore.addCombination('Unit', [{ caseId: dead, factor: 1 }]);
  const repeated = modelStore.addCombination('Repeated', rotated.map(factor => ({ caseId: dead, factor })));
  const r = modelStore.solveCombinations(false);
  if (!r || typeof r === 'string') throw new Error(String(r));
  resultsStore.setCombinationResults(r.perCase, r.perCombo, r.envelope);
  const control = displayedLoads2D(resultsStore.perCombo.get(unit));
  expect(control).toHaveLength(1);
  expect(displayedLoads2D(resultsStore.perCombo.get(repeated))).toStrictEqual(control);
});

it('#2297 published spatial free-body and statics loads preserve repeated case factors', () => {
  modelStore.clear();
  uiStore.analysisMode = 'pro';
  uiStore.includeSelfWeight = false;
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(2, 0, 0);
  modelStore.addElement(a, b, 'frame');
  modelStore.addSupport(a, 'fixed3d');
  const dead = modelStore.addLoadCase('Test dead', 'D'), live = modelStore.addLoadCase('Test live', 'L');
  modelStore.addNodalLoad3D(b, 0, 0, -2, 0, 0, 0, dead);
  modelStore.addNodalLoad3D(b, 0, 0, -4, 0, 0, 0, live);
  const rotated = [issue2297Factors.at(-1)!, ...issue2297Factors.slice(0, -1)];
  const add = (name: string, weights: number[]) => modelStore.addCombination(name,
    [{ caseId: live, factor: 1 }, ...weights.map(factor => ({ caseId: dead, factor }))]);
  const control = add('Unit', [1]);
  const residual = add('Residual', issue2297Factors);
  const permuted = add('Permuted residual', rotated);
  const zero = add('Zero', issue2297Factors.slice(0, -1));
  const absent = add('Absent', [0]);
  const r = modelStore.solveCombinations3D(false, false, true);
  if (!r || typeof r === 'string') throw new Error(String(r));
  publishCombinations3D(r);
  const loads = (id: number) => displayedLoads3D(resultsStore.perCombo3D.get(id));
  expect(loads(control)).toHaveLength(2);
  expect.soft(loads(permuted)).toStrictEqual(loads(control));
  expect.soft(loads(zero)).toStrictEqual(loads(absent));
  const rows = new Map(staticsRows()!.combos.map(row => [row.comboId, row]));
  expect(rows.get(control)?.applied.fz).toBe(-6);
  expect.soft(rows.get(residual)?.applied).toStrictEqual(rows.get(control)?.applied);
  expect.soft(rows.get(permuted)?.applied).toStrictEqual(rows.get(control)?.applied);
  expect.soft(rows.get(zero)?.applied).toStrictEqual(rows.get(absent)?.applied);
});
