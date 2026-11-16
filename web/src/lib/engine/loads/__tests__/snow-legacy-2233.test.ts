import { expect, it } from 'vitest';
import type { LoadCombinationSpec } from '../../../codes/cirsoc101/combinations';
import { expandCombinations } from '../combination-cases';

const cases = [
  { id: 1, name: 'D', type: 'D' },
  { id: 2, name: 'L', type: 'L' },
  { id: 3, name: 'E', type: 'E' },
  { id: 4, name: 'physical S', type: 'S', alternatives: 'roof' },
  { id: 5, name: 'pf', type: 'S', alternatives: 'roof', snowBasis: 'flatRoof' as const },
];
const legacy = (factor: number): LoadCombinationSpec => ({
  id: '5', basic: 5, refs: [], label: `1.2 D + E + L + ${factor} S`,
  terms: [{ symbol: 'D', factor: 1.2 }, { symbol: 'E', factor: 1 }, { symbol: 'L', factor: 1 }, { symbol: 'S', factor }],
  notes: [{ key: 'loads.cirsoc101.note.snowAsFlatRoof' }],
});

it('#2211 legacy seismic f2=0.7 refuses ambiguous snow even after snow regeneration', () => {
  for (const factor of [0.7, 0.2]) for (const bothSenses of [false, true]) for (const patternsInCompanions of [false, true]) {
    const spec = legacy(factor);
    for (const input of [cases, cases.filter(c => c.type !== 'L'), cases.filter(c => c.type !== 'S')]) {
      expect.soft(() => expandCombinations([spec], input, { bothSenses: { E: bothSenses }, patternsInCompanions })).toThrow();
    }
  }
});

it('#2211 required flat-roof snow refuses before absent-symbol omission', () => {
  for (const typed of [false, true]) for (const physicalOnly of [false, true]) for (const missingLive of [false, true]) {
    const spec: LoadCombinationSpec = {
      id: '2-S', refs: [], label: '1.2 D + 1.6 L + 0.5 S',
      terms: [{ symbol: 'D', factor: 1.2 }, { symbol: 'L', factor: 1.6 }, { symbol: 'S', factor: 0.5, ...(typed ? { snowBasis: 'flatRoof' as const } : {}) }],
      notes: typed ? [] : [{ key: 'loads.cirsoc101.note.snowAsFlatRoof' }],
    };
    const input = cases.filter(c => c.id !== 5 && (physicalOnly || c.type !== 'S') && (!missingLive || c.type !== 'L'));
    expect.soft(() => expandCombinations([spec], input)).toThrow();
  }
});

it('#2211 explicit seismic and flat-roof specifications retain distinct case factors', () => {
  const physical = { ...legacy(0.7), id: '5-seismic', notes: [] };
  const flat: LoadCombinationSpec = { ...legacy(0.2), terms: legacy(0.2).terms.map(t => t.symbol === 'S' ? { ...t, snowBasis: 'flatRoof' } : t) };
  const out = expandCombinations([physical, flat], cases);
  expect(out).toHaveLength(2);
  expect(out[0]!.factors).toEqual([{ caseId: 1, factor: 1.2 }, { caseId: 3, factor: 1 }, { caseId: 2, factor: 1 }, { caseId: 4, factor: 0.7 }]);
  expect(out[1]!.factors).toEqual([{ caseId: 1, factor: 1.2 }, { caseId: 3, factor: 1 }, { caseId: 2, factor: 1 }, { caseId: 5, factor: 0.2 }]);
  expect(expandCombinations([flat], cases.filter(c => c.type !== 'L'))).toEqual([]);
  const zero: LoadCombinationSpec = { ...flat, terms: flat.terms.map(t => t.symbol === 'S' ? { ...t, factor: 0 } : t) };
  expect(expandCombinations([zero], cases.filter(c => c.type !== 'S'))).toHaveLength(1);
  const nonseismic = { ...legacy(0.5), terms: legacy(0.5).terms.filter(t => t.symbol !== 'E') };
  expect(expandCombinations([nonseismic], cases)[0]!.factors.find(f => f.caseId === 5)!.factor).toBe(0.5);
});
