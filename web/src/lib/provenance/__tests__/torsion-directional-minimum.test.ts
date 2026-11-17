import { expect, it } from 'vitest';
import { RESULT_CHANGES } from '../full-registry';
import { assessProject } from '../applicability';
import type { FeatureSnapshot } from '../model-features';
import type { SolveStamp } from '../solve-stamp';

const id = 'torsion-directional-minimum';
const frame = (concrete: boolean): FeatureSnapshot => ({
  analysisMode: 'pro', materials: [[1, concrete
    ? { id: 1, name: 'H25', fc: 25, fy: 25, e: 25000, nu: 0.2, rho: 25 }
    : { id: 1, name: 'steel', fy: 235, e: 200000, nu: 0.3, rho: 78.5 }]] as never,
  elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }]] as never,
  supports: [], loads: [], loadCases: [{ id: 1, type: 'D' }],
});

for (const mode of ['2d', 'pro']) for (const analysis of ['linear', 'pdelta', 'nonlinear'] as const) it(`torsion minimum notice uses its version boundary ${mode} ${analysis}`, () => {
  const entry = RESULT_CHANGES.changes.find(c => c.id === id)!;
  expect(entry).toBeDefined();
  const seen = (concrete: boolean, resultsVersion: number) => assessProject(frame(concrete),
    { resultsVersion, analyses: [analysis] } as SolveStamp, mode).changes.filter(c => c.id === id).map(c => c.id);
  expect(seen(true, entry.resultsVersion - 1)).toEqual([id]);
  expect(seen(true, entry.resultsVersion)).toEqual([]);
  expect(seen(true, entry.resultsVersion + 1)).toEqual([]);
  expect(seen(false, entry.resultsVersion - 1)).toEqual([]);
});

it('provides the saved-project notice in all six locales and links the numerical write-up', () => {
  const entry = RESULT_CHANGES.changes.find(c => c.id === id)!;
  expect(entry.changelog.file).toBe('docs/results-changes/2198-round20-torsion-minimum.md');
  for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr'] as const) {
    expect(entry.title[locale].trim()).not.toBe('');
    expect(entry.explanation[locale].trim()).not.toBe('');
  }
});
