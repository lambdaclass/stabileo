import { expect, it } from 'vitest';
import { expandCombinations } from '../combination-cases';
import { flatSpec, snowCases } from './snow-provenance-2233-fixture';
import { completeSnowPair, pairedSpecs, partialSnowPair, physicalSpecs } from './snow-pair-coverage-2233-fixture';


for (const spec of physicalSpecs()) {
  it(`known wrong result: #2233 ${spec.id} refuses an orphan flat-roof group beside a complete pair`, () => {
    for (const both of [false, true]) for (const patterns of [false, true]) {
      for (const cases of [partialSnowPair, partialSnowPair.filter(c => c.type !== 'D')]) {
        expect(() => expandCombinations([spec], cases, { bothSenses: { E: both }, patternsInCompanions: patterns }))
          .toThrow('snow.refused.flatRoofCase');
      }
    }
  });
}

it('known wrong result: #2233 mixed companion and physical specifications refuse partial snow pairing', () => {
  expect(() => expandCombinations(pairedSpecs(), partialSnowPair)).toThrow('snow.refused.flatRoofCase');
});

it('known wrong result: #2233 physical selection refuses ambiguous ungrouped and mismatched flat-roof coverage', () => {
  const principal = physicalSpecs()[0]!;
  for (const cases of [
    [...snowCases, { id: 6, type: 'S', name: 'extra pf', snowBasis: 'flatRoof' as const }],
    [...snowCases, { id: 6, type: 'S', name: 'extra physical' }],
    [...snowCases, { id: 6, type: 'S', name: 'extra pf', snowBasis: 'flatRoof' as const }, { id: 7, type: 'S', name: 'extra physical' }],
    snowCases.map(c => c.id === 5 ? { ...c, alternatives: 'other' } : c),
    partialSnowPair.filter(c => c.id !== 4),
  ]) expect(() => expandCombinations([principal], cases)).toThrow('snow.refused.flatRoofCase');
});

it('#2233 complete grouped and single ungrouped pairs retain physical and flat-roof factors', () => {
  for (const both of [false, true]) for (const patterns of [false, true]) {
    const out = expandCombinations(pairedSpecs(), completeSnowPair, { bothSenses: { E: both }, patternsInCompanions: patterns });
    expect(out).toHaveLength(both ? 5 : 4);
    for (const spec of pairedSpecs()) {
      const matching = out.filter(c => c.specId === spec.id);
      expect(matching.length).toBeGreaterThan(0);
      for (const combo of matching) {
        const factor = spec.terms.find(t => t.symbol === 'S')!.factor;
        const ids = spec.id === flatSpec().id ? [5, 6] : [4, 8];
        expect(combo.factors.filter(f => [4, 5, 6, 8].includes(f.caseId)))
          .toEqual(ids.map(caseId => ({ caseId, factor })));
      }
    }
  }
  expect(expandCombinations([physicalSpecs()[0]!], snowCases)[0]!.factors).toEqual([{ caseId: 4, factor: 1 }]);
  const patterned = [...completeSnowPair, { id: 9, type: 'S', name: 'physical A pattern', alternatives: 'A', pattern: true }];
  expect(expandCombinations([physicalSpecs()[0]!], patterned).map(c => c.factors)).toEqual([
    [{ caseId: 4, factor: 1 }, { caseId: 8, factor: 1 }],
    [{ caseId: 9, factor: 1 }, { caseId: 8, factor: 1 }],
  ]);
});

it('#2233 pairing is required only toward an active requested snow basis', () => {
  const principal = physicalSpecs()[0]!;
  expect(expandCombinations([principal], partialSnowPair.filter(c => !c.snowBasis))[0]!.factors).toEqual([{ caseId: 4, factor: 1 }]);
  expect(expandCombinations([flatSpec()], partialSnowPair)[0]!.factors.filter(f => [4, 5, 6].includes(f.caseId)))
    .toEqual([{ caseId: 5, factor: 0.5 }, { caseId: 6, factor: 0.5 }]);
  expect(expandCombinations([{ ...principal, terms: [{ symbol: 'S', factor: 0 }] }], partialSnowPair)).toHaveLength(1);
  expect(expandCombinations([{ ...principal, terms: [{ symbol: 'D', factor: 1 }] }], partialSnowPair)[0]!.factors)
    .toEqual([{ caseId: 1, factor: 1 }]);
});
