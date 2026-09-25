/**
 * The active combination list and named envelopes: what design reads, and what is shown.
 *
 * A cantilever with two load cases and three combinations whose tip demands are known apart:
 * the envelope over an active subset must be that subset's, the governing search must name a
 * combination in it, design readers must see only it, and every combination must still solve.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { resultsStore } from '../results.svelte';
import { historyStore } from '../history.svelte';
import { uiStore } from '../ui.svelte';
import '../index';
import { initSolver } from '../../engine/wasm-solver';
import { activePerCombo3D, activeCombinations, publishCombinations3D } from '../active-results';
import { envelopeOver, pruneScopes, activeComboIds } from '../../engine/result-scopes';
import { modelToCode, codeToModel } from '../../model/code/format';

let combos: { light: number; heavy: number; lateral: number };

function build() {
  modelStore.clear();
  historyStore.clear();
  const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 3);
  modelStore.addElement(a, b, 'frame');
  modelStore.addSupport(a, 'fixed3d');
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  const dead = modelStore.addLoadCase('Test dead', 'D');
  const wind = modelStore.addLoadCase('Test wind', 'W');
  modelStore.addNodalLoad3D(b, 0, 0, -10, 0, 0, 0, dead);
  modelStore.addNodalLoad3D(b, 5, 0, 0, 0, 0, 0, wind);
  combos = {
    light: modelStore.addCombination('1.0D', [{ caseId: dead, factor: 1 }]),
    heavy: modelStore.addCombination('1.4D', [{ caseId: dead, factor: 1.4 }]),
    lateral: modelStore.addCombination('1.2D+1.6W', [{ caseId: dead, factor: 1.2 }, { caseId: wind, factor: 1.6 }]),
  };
}

function solve() {
  const r = modelStore.solveCombinations3D(false, false, true);
  if (!r || typeof r === 'string') throw new Error(String(r));
  publishCombinations3D(r);
  return r;
}

const tip = (r: { displacements: Array<{ nodeId: number; ux: number; uz: number }> }) => r.displacements.find((d) => d.nodeId === 2)!;

beforeAll(async () => { await initSolver(); });
beforeEach(() => { uiStore.analysisMode = 'pro'; build(); });
afterEach(() => { uiStore.analysisMode = '3d'; });

describe('the active list', () => {
  it('unstated, every combination is active and the envelope is over all of them', () => {
    const r = solve();
    expect(activeCombinations().map((c) => c.id)).toEqual([combos.light, combos.heavy, combos.lateral]);
    expect(tip(r.envelope.maxAbsResults3D).ux).toBeCloseTo(Math.abs(tip(r.perCombo.get(combos.lateral)!).ux), 12);
    expect(activePerCombo3D().size).toBe(3);
  });

  it('stated, the envelope, the governing search and design readers see only it — and every combination still solves', () => {
    modelStore.setResultScopes({ active: [combos.light, combos.heavy] });
    const r = solve();
    expect(r.perCombo.size).toBe(3);
    // No lateral combination in the list: the envelope carries no horizontal tip movement.
    expect(Math.abs(tip(r.envelope.maxAbsResults3D).ux)).toBeLessThan(1e-12);
    expect(Math.abs(tip(r.envelope.maxAbsResults3D).uz)).toBeCloseTo(Math.abs(tip(r.perCombo.get(combos.heavy)!).uz), 12);
    expect([...activePerCombo3D().keys()]).toEqual([combos.light, combos.heavy]);
    const gov = resultsStore.governing3D.get(1)!;
    expect(gov.axial!.comboId).toBe(combos.heavy);
    for (const ref of Object.values(gov)) if (ref) expect([combos.light, combos.heavy]).toContain(ref.comboId);
  });

  it('is PRO-only: Basic keeps enveloping every combination', () => {
    modelStore.setResultScopes({ active: [combos.light] });
    uiStore.analysisMode = '3d';
    const r = modelStore.solveCombinations3D(false, false, false);
    if (!r || typeof r === 'string') throw new Error(String(r));
    expect(Math.abs(tip(r.envelope.maxAbsResults3D).ux)).toBeGreaterThan(0);
    expect(activePerCombo3D().size).toBe(0); // nothing published — and nothing narrowed
  });

  it('naming no solved combination is refused, not answered with an empty envelope', () => {
    modelStore.setResultScopes({ active: [] });
    const r = modelStore.solveCombinations3D(false, false, true);
    expect(typeof r).toBe('string');
  });

  it('is an undoable edit that retires the results on hand', () => {
    solve();
    expect(resultsStore.perCombo3D.size).toBe(3);
    const before = historyStore.undoCount;
    modelStore.setResultScopes({ active: [combos.light] });
    expect(resultsStore.perCombo3D.size).toBe(0);
    expect(historyStore.undoCount).toBe(before + 1);
    historyStore.undo();
    expect(modelStore.resultScopes).toBeUndefined();
  });

  it('forgets a removed combination instead of letting its number be reused', () => {
    modelStore.setResultScopes({ active: [combos.light, combos.lateral], envelopes: [{ id: 1, name: 'S', purpose: 'service', comboIds: [combos.lateral] }] });
    modelStore.removeCombination(combos.lateral);
    expect(modelStore.resultScopes).toEqual({ active: [combos.light], envelopes: [{ id: 1, name: 'S', purpose: 'service', comboIds: [] }] });
  });
});

describe('named envelopes', () => {
  it('are shown in place of the design envelope, which design keeps reading', () => {
    solve();
    const designEnv = resultsStore.envelope3D;
    const named = envelopeOver(resultsStore.perCombo3D, [combos.lateral])!;
    resultsStore.viewEnvelope3D(named, 'Wind only');
    resultsStore.activeView = 'envelope';
    expect(resultsStore.viewedEnvelopeName).toBe('Wind only');
    expect(resultsStore.fullEnvelope3D).not.toBe(designEnv);
    expect(resultsStore.envelope3D).toBe(designEnv);
    expect(tip(resultsStore.results3D!).ux).toBeCloseTo(Math.abs(tip(resultsStore.perCombo3D.get(combos.lateral)!).ux), 12);
    resultsStore.viewEnvelope3D(null);
    expect(resultsStore.viewedEnvelopeName).toBeNull();
  });

  it('lapse on the next solve rather than describe a superseded one', () => {
    solve();
    resultsStore.viewEnvelope3D(envelopeOver(resultsStore.perCombo3D, [combos.lateral])!, 'W');
    solve();
    expect(resultsStore.viewedEnvelopeName).toBeNull();
    expect(resultsStore.fullEnvelope3D).toBe(resultsStore.envelope3D);
  });
});

describe('as a project definition', () => {
  it('travels in the model code and in the snapshot', () => {
    const scopes = { active: [combos.heavy], envelopes: [{ id: 3, name: 'Servicio', purpose: 'service' as const, comboIds: [combos.light, combos.lateral] }] };
    modelStore.setResultScopes(scopes);
    const code = modelToCode(modelStore.snapshot());
    expect(code).toContain('resultScopes');
    expect(codeToModel(code).snapshot!.resultScopes).toEqual(scopes);
    const snap = modelStore.snapshot();
    modelStore.clear();
    expect(modelStore.resultScopes).toBeUndefined();
    modelStore.restore(snap);
    expect(modelStore.resultScopes).toEqual(scopes);
  });

  it('pure helpers: an unknown id is ignored, pruning keeps the shape', () => {
    expect(activeComboIds({ active: [9, 2] }, [{ id: 1 }, { id: 2 }])).toEqual([2]);
    expect(activeComboIds(undefined, [{ id: 1 }, { id: 2 }])).toEqual([1, 2]);
    expect(pruneScopes({ envelopes: [] }, new Set([1]))).toEqual({ envelopes: [] });
  });
});
