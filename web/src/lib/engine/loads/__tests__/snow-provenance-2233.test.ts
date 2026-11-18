import { expect, it } from 'vitest';
import { expandCombinations } from '../combination-cases';
import { legacyOmittedE, flatSpec, snowCases } from './snow-provenance-2233-fixture';

const grouped = snowCases.map(c => c.type === 'S' ? { ...c, alternatives: 'roof' } : c);

for (const provenance of ['basic', 'omission-note', 'zero-E', 'seismic-note'] as const) {
  it(`known wrong result: #2233 omitted-E legacy snow refuses using ${provenance}`, () => {
    for (const factor of [0.2, 0.7]) for (const both of [false, true]) for (const patterns of [false, true]) {
      const spec = legacyOmittedE(factor);
      spec.id = 'renamed saved rule';
      if (provenance === 'basic') spec.notes = spec.notes.slice(0, 1);
      if (provenance !== 'basic') delete spec.basic;
      if (provenance === 'zero-E') {
        spec.notes = spec.notes.slice(0, 1);
        spec.terms.push({ symbol: 'E', factor: 0 });
      }
      if (provenance === 'seismic-note') spec.notes[1] = { key: 'loads.cirsoc101.note.seismicCompanions', params: { l: 1, s: factor } };
      for (const input of [grouped, grouped.filter(c => c.type !== 'L'), grouped.filter(c => c.type !== 'S')]) {
        expect(() => expandCombinations([spec], input, { bothSenses: { E: both }, patternsInCompanions: patterns })).toThrow('snow.refused.legacyCombination');
      }
    }
  });
}

it('known wrong result: #2233 an ungrouped physical and flat-roof pair retains both answers', () => {
  for (const legacy of [false, true]) for (const both of [false, true]) for (const patterns of [false, true]) {
    const flat = flatSpec();
    if (legacy) {
      flat.terms = flat.terms.map(({ snowBasis, ...t }) => t);
      flat.notes = [{ key: 'loads.cirsoc101.note.snowAsFlatRoof' }];
    }
    const out = expandCombinations([flat], snowCases, { bothSenses: { E: both }, patternsInCompanions: patterns });
    expect(out).toHaveLength(1);
    expect(out[0]!.factors).toEqual([{ caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1.6 }, { caseId: 5, factor: 0.5 }]);
    const physical = { ...legacyOmittedE(), notes: [] };
    expect(expandCombinations([physical], snowCases)[0]!.factors).toEqual([
      { caseId: 1, factor: 1.2 }, { caseId: 2, factor: 1 }, { caseId: 4, factor: 0.7 }, { caseId: 3, factor: 1.6 },
    ]);
  }
});

it('#2233 snow pairing refuses missing and ambiguous independent actions', () => {
  for (const additions of [
    [{ id: 6, type: 'S', name: 'second physical' }],
    [{ id: 6, type: 'S', name: 'second pf', snowBasis: 'flatRoof' as const }],
    [{ id: 6, type: 'S', name: 'second physical' }, { id: 7, type: 'S', name: 'second pf', snowBasis: 'flatRoof' as const }],
    [{ id: 6, type: 'S', name: 'another roof', alternatives: 'other' }],
  ]) expect(() => expandCombinations([flatSpec()], [...snowCases, ...additions])).toThrow('snow.refused.flatRoofCase');
  for (const input of [snowCases.filter(c => c.id !== 5), snowCases.filter(c => c.type !== 'S'),
    snowCases.map(c => c.id === 5 ? { ...c, alternatives: 'other' } : c)]) {
    expect(() => expandCombinations([flatSpec()], input)).toThrow('snow.refused.flatRoofCase');
  }
  const independent = [...grouped, { id: 6, type: 'S', name: 'other physical', alternatives: 'other' },
    { id: 7, type: 'S', name: 'other pf', alternatives: 'other', snowBasis: 'flatRoof' as const }];
  expect(expandCombinations([flatSpec()], independent)[0]!.factors.filter(f => f.caseId >= 4)).toEqual([
    { caseId: 5, factor: 0.5 }, { caseId: 7, factor: 0.5 },
  ]);
});

it('#2233 inactive legacy snow and nonseismic flat-roof provenance remain valid', () => {
  for (const factor of [0, undefined]) {
    const spec = legacyOmittedE();
    spec.terms = spec.terms.flatMap(t => t.symbol !== 'S' ? [t] : factor === undefined ? [] : [{ ...t, factor }]);
    expect(expandCombinations([spec], snowCases.filter(c => c.type !== 'S'))).toHaveLength(1);
  }
  const nonseismic = flatSpec();
  nonseismic.terms = nonseismic.terms.map(({ snowBasis, ...t }) => t);
  nonseismic.notes = [{ key: 'loads.cirsoc101.note.snowAsFlatRoof' }];
  expect(expandCombinations([nonseismic], grouped)[0]!.factors.find(f => f.caseId === 5)).toEqual({ caseId: 5, factor: 0.5 });
  const explicit = legacyOmittedE(0.2);
  explicit.terms = explicit.terms.map(t => t.symbol === 'S' ? { ...t, snowBasis: 'flatRoof' } : t);
  expect(expandCombinations([explicit], grouped)[0]!.factors.find(f => f.caseId === 5)).toEqual({ caseId: 5, factor: 0.2 });
});
