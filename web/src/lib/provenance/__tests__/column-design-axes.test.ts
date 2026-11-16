import { expect, it } from 'vitest';
import { assessProject } from '../applicability';
import { RESULT_CHANGES } from '../full-registry';
import type { FeatureSnapshot } from '../model-features';
import type { SolveStamp } from '../solve-stamp';

const ID = 'cirsoc201-column-design-axes';
const frame = (material: Record<string, unknown>): FeatureSnapshot => ({
  analysisMode: 'pro',
  materials: [[1, { id: 1, e: 30000, nu: 0.2, rho: 25, ...material }]] as never,
  elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1, releaseI: {}, releaseJ: {} }]] as never,
  supports: [[1, { nodeId: 1, type: 'fixed3d' }]] as never,
  loads: [],
  loadCases: [{ id: 1, type: 'D' }],
});
const changes = (model: FeatureSnapshot, version: number) =>
  assessProject(model, { resultsVersion: version, analyses: ['linear'] } as SolveStamp, 'pro').changes.map((c) => c.id);

it('tells CIRSOC 201 concrete projects solved before the fix, and no others', () => {
  const concrete = frame({ name: 'H-25', fy: 25 });
  expect(changes(concrete, 5)).toContain(ID);
  expect(changes(concrete, 6)).toContain(ID);
  expect(changes(concrete, 7)).not.toContain(ID);
  expect(changes(frame({ name: 'F-24', e: 200000, nu: 0.3, rho: 78.5, fy: 235 }), 5)).not.toContain(ID);
});

it('words the re-check notice in every locale the app ships', () => {
  const entry = RESULT_CHANGES.changes.find((c) => c.id === ID) as unknown as { title: Record<string, string>; explanation: Record<string, string> };
  for (const locale of ['en', 'es', 'pt', 'de', 'fr', 'tr', 'hu']) {
    expect(entry.title[locale]?.trim(), `title.${locale}`).toBeTruthy();
    expect(entry.explanation[locale]?.trim(), `explanation.${locale}`).toBeTruthy();
  }
});
