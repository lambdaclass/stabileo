/**
 * Generated service combinations reach the service envelope, and stay out of design's list.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { modelStore } from '../model.svelte';
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
