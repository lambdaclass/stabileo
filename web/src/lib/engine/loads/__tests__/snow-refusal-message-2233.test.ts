import { expect, it } from 'vitest';
import type { LoadCombinationSpec } from '../../../codes/cirsoc101/combinations';
import { expandCombinations } from '../combination-cases';

const physical = { id: 1, type: 'S', name: 'physical', alternatives: 'roof' };
const flat = { id: 2, type: 'S', name: 'flat', alternatives: 'roof', snowBasis: 'flatRoof' as const };
const spec = (terms: LoadCombinationSpec['terms'], legacy = false): LoadCombinationSpec => ({
  id: 'test', label: 'test', refs: [], terms,
  notes: legacy ? [{ key: 'loads.cirsoc101.note.snowAsFlatRoof' }] : [],
});
const inputs = [
  { rule: spec([{ symbol: 'D', factor: 1, snowBasis: 'flatRoof' }]), cases: [physical, flat], key: 'snow.refused.flatRoofCase' },
  { rule: spec([{ symbol: 'E', factor: 1 }, { symbol: 'S', factor: 1 }], true), cases: [physical, flat], key: 'snow.refused.legacyCombination' },
  { rule: spec([{ symbol: 'S', factor: 1, snowBasis: 'flatRoof' }]), cases: [physical, { ...flat, alternatives: 'other' }], key: 'snow.refused.flatRoofCase' },
  { rule: spec([{ symbol: 'S', factor: 1, snowBasis: 'flatRoof' }]), cases: [], key: 'snow.refused.flatRoofCase' },
  { rule: spec([{ symbol: 'S', factor: 1 }]), cases: [flat], key: 'snow.refused.physicalCase' },
];

it('known wrong result: #2233 every snow combination refusal carries a pure message', () => {
  for (const { rule, cases, key } of inputs) {
    let caught: unknown;
    try { expandCombinations([rule], cases); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).toMatchObject({ key, params: undefined });
    expect((caught as Error).message).toBe(key);
  }
  expect(expandCombinations([spec([{ symbol: 'S', factor: 1 }])], [physical, flat])[0]!.factors).toEqual([{ caseId: 1, factor: 1 }]);
  expect(expandCombinations([spec([{ symbol: 'S', factor: 1, snowBasis: 'flatRoof' }])], [physical, flat])[0]!.factors).toEqual([{ caseId: 2, factor: 1 }]);
});
