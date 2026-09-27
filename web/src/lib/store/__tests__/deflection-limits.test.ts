/**
 * Deflection limits as rules: the most specific one applies, a column is checked only when a rule
 * says so, the direction a rule reads is the one checked, and a cantilever's limit is over 2L.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { resultsStore } from '../results.svelte';
import { uiStore } from '../ui.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { deflectionChecks } from '../serviceability';
import { ruleFor, DEFAULT_BEAM_RULE, type DeflectionLimits } from '../../engine/deflection-limits';
import { modelToCode, codeToModel } from '../../model/code/format';

describe('which rule', () => {
  const ctx = { kindOf: (id: number) => (id < 10 ? 'beam' as const : 'column' as const), groupsOf: (id: number) => (id === 2 ? [7] : []) };
  const limits: DeflectionLimits = { rules: [
    { id: 1, scope: { kind: 'memberKind', value: 'beam' }, n: 240, direction: 'resultant' },
    { id: 2, scope: { kind: 'group', groupId: 7 }, n: 480, direction: 'localZ' },
    { id: 3, scope: { kind: 'members', ids: [2, 3] }, n: 500, direction: 'resultant' },
  ] };
  it('members over a group over a kind; a column only when a rule names it', () => {
    expect(ruleFor(1, limits, ctx)!.n).toBe(240);
    expect(ruleFor(2, limits, ctx)!.n).toBe(500);
    expect(ruleFor(3, limits, ctx)!.n).toBe(500);
    expect(ruleFor(11, limits, ctx)).toBeNull();
    expect(ruleFor(1, undefined, ctx)).toBe(DEFAULT_BEAM_RULE);
    expect(ruleFor(2, { rules: [limits.rules[1]!] }, ctx)!.direction).toBe('localZ');
  });
});

describe('checked against the rule', () => {
  beforeAll(async () => { await initSolver(); });
  beforeEach(() => { uiStore.analysisMode = 'pro'; });
  afterEach(() => { uiStore.analysisMode = '3d'; });

  it('a cantilever beam at L/360 is allowed 2L/360; a column gets the rule written for it', () => {
    modelStore.clear();
    const base = modelStore.addNode(0, 0, 0), top = modelStore.addNode(0, 0, 3), tip = modelStore.addNode(2, 0, 3);
    const col = modelStore.addElement(base, top, 'frame');
    const cant = modelStore.addElement(top, tip, 'frame');
    modelStore.addSupport(base, 'fixed3d');
    for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
    modelStore.addNodalLoad3D(tip, 0, 0, -5, 0, 0, 0);
    modelStore.addNodalLoad3D(top, 3, 0, 0, 0, 0, 0);
    const single = modelStore.solve3D(false, false, true);
    if (!single || typeof single === 'string') throw new Error(String(single));
    resultsStore.setResults3D(single);

    let run = deflectionChecks();
    expect([...run.rows.keys()]).toEqual([cant]);
    const c = run.rows.get(cant)!;
    expect(c.deflection.cantilever).toBe(true);
    expect(c.check.limit).toBeCloseTo((2 * 2) / 360, 12);

    modelStore.setDeflectionLimits({ rules: [{ id: 1, scope: { kind: 'members', ids: [col] }, n: 300, direction: 'localY' }] });
    run = deflectionChecks();
    const k = run.rows.get(col)!;
    expect(k.rule.n).toBe(300);
    expect(k.measured).toBe(k.deflection.maxV);
    // The column's top is held by the cantilever only; it is a cantilever too, measured from its base.
    expect(k.check.limit).toBeCloseTo(((k.deflection.cantilever ? 2 : 1) * 3) / 300, 12);
  });

  it('the rules travel with the project and in the model code', () => {
    modelStore.clear();
    modelStore.setDeflectionLimits({ rules: [{ id: 1, scope: { kind: 'group', groupId: 4 }, n: 250, direction: 'localZ' }] });
    const back = codeToModel(modelToCode(modelStore.snapshot() as never));
    expect(back.errors).toEqual([]);
    expect((back.snapshot as { deflectionLimits?: DeflectionLimits }).deflectionLimits).toEqual(modelStore.deflectionLimits);
  });
});
