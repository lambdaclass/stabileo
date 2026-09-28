/**
 * Generated service combinations reach the service envelope, and stay out of design's list.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
import { historyStore } from '../history.svelte';
import '../index';
import { addGeneratedCombinations, SERVICE_ENVELOPE_NAME } from '../generated-combinations';
import { expandCombinations, presentSymbols } from '../../engine/loads/combination-cases';
import { generateCombinations } from '../../codes/cirsoc101/combinations';
import { generateServiceCombinations } from '../../codes/cirsoc101/service-combinations';
import { activeComboIds } from '../../engine/result-scopes';

function model() {
  modelStore.clear();
  for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
  for (const c of [...modelStore.model.loadCases]) modelStore.removeLoadCase(c.id);
  modelStore.addLoadCase('Dead', 'D');
  modelStore.addLoadCase('Live', 'L');
  return modelStore.model.loadCases.filter((c) => c.type === 'D' || c.type === 'L');
}

describe('adding generated combinations', () => {
  beforeEach(() => { modelStore.setResultScopes(null); });

  it('files the service ones in the SLS envelope and keeps them out of the active list', () => {
    const cases = model();
    const present = presentSymbols(cases);
    const strength = expandCombinations(generateCombinations({ present }), cases);
    const service = expandCombinations(generateServiceCombinations({ present }), cases);
    modelStore.batch(() => { addGeneratedCombinations([...strength, ...service]); });
    const scopes = modelStore.resultScopes!;
    const sls = scopes.envelopes!.find((e) => e.name === SERVICE_ENVELOPE_NAME)!;
    expect(sls.purpose).toBe('service');
    const byName = new Map(modelStore.combinations.map((c) => [c.id, c.name]));
    expect(sls.comboIds.map((id) => byName.get(id))).toEqual(service.map((c) => c.name));
    const active = new Set(activeComboIds(scopes, modelStore.combinations));
    for (const id of sls.comboIds) expect(active.has(id)).toBe(false);
    expect(active.size).toBe(strength.length);
  });

  it('adds strength combinations alone without stating any list', () => {
    const cases = model();
    const strength = expandCombinations(generateCombinations({ present: presentSymbols(cases) }), cases);
    modelStore.batch(() => { addGeneratedCombinations(strength); });
    expect(modelStore.resultScopes).toBeUndefined();
  });
});

describe('generating again once a list is stated', () => {
  beforeEach(() => { modelStore.setResultScopes(null); });

  it('puts later strength combinations in the design’s list', () => {
    const cases = model();
    const present = presentSymbols(cases);
    const strength = expandCombinations(generateCombinations({ present }), cases);
    const service = expandCombinations(generateServiceCombinations({ present }), cases);
    modelStore.batch(() => { addGeneratedCombinations([...strength, ...service]); });
    // Replace existing, then strength only: the list must not be left empty.
    modelStore.batch(() => {
      for (const c of [...modelStore.combinations]) modelStore.removeCombination(c.id);
      addGeneratedCombinations(strength);
    });
    const active = activeComboIds(modelStore.resultScopes, modelStore.combinations);
    expect(active.length).toBe(strength.length);
  });

  it('undo gives the SLS envelope back its earlier combinations', () => {
    const cases = model();
    const present = presentSymbols(cases);
    const service = expandCombinations(generateServiceCombinations({ present }), cases);
    modelStore.batch(() => { addGeneratedCombinations(service); });
    const before = JSON.stringify(modelStore.resultScopes);
    addGeneratedCombinations(service); // outside a batch, as the Auto-loads dialog calls it
    historyStore.undo();
    expect(JSON.stringify(modelStore.resultScopes)).toBe(before);
  });
});

describe('snow patterns from an earlier generation', () => {
  it('are grouped as alternatives when the loads are generated again', () => {
    modelStore.clear();
    for (const c of [...modelStore.model.loadCases]) modelStore.removeLoadCase(c.id);
    // An older project: the three patterns exist, with no group.
    const ids = ['Balanced', 'Unbalanced +X', 'Unbalanced −X'].map((n) => modelStore.addLoadCase(n, 'S'));
    const again = ['Balanced', 'Unbalanced +X', 'Unbalanced −X'].map((n) => modelStore.ensureLoadCase(n, 'S', { alternatives: 'snow-roof' }));
    expect(again).toEqual(ids);
    const cases = modelStore.model.loadCases;
    modelStore.addLoadCase('Dead', 'D');
    const out = expandCombinations(
      [{ id: 's', label: '1.2 D + 1.6 S', terms: [{ symbol: 'D', factor: 1.2 }, { symbol: 'S', factor: 1.6 }] }] as never,
      modelStore.model.loadCases,
    );
    expect(cases.filter((c) => c.type === 'S').every((c) => c.alternatives === 'snow-roof')).toBe(true);
    expect(out).toHaveLength(3);
  });
});

describe('which wind cases can be reversed by sign', () => {
  it('horizontal forces only: yes; loads on the members (roof suction): no', async () => {
    const { windCaseReversible } = await import('../wind-reversal');
    modelStore.clear();
    const a = modelStore.addNode(0, 0, 0), b = modelStore.addNode(0, 0, 4), c = modelStore.addNode(6, 0, 5);
    const col = modelStore.addElement(a, b, 'frame'), raf = modelStore.addElement(b, c, 'frame');
    void col;
    const lateral = modelStore.addLoadCase('Lateral', 'W');
    modelStore.addNodalLoad3D(b, 5, 0, 0, 0, 0, 0, lateral);
    const roof = modelStore.addLoadCase('Roof +X', 'W');
    modelStore.addDistributedLoad3D(raf, 0, 0, 0.8, 0.8, undefined, undefined, roof);
    const up = modelStore.addLoadCase('Uplift', 'W');
    modelStore.addNodalLoad3D(c, 0, 0, 3, 0, 0, 0, up);
    const model = modelStore.model;
    expect(windCaseReversible(model, lateral)).toBe(true);
    expect(windCaseReversible(model, roof)).toBe(false);
    expect(windCaseReversible(model, up)).toBe(false);
  });
});
