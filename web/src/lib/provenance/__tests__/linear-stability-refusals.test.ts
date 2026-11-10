import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { assessProject, conditionHolds } from '../applicability';
import { RESULT_CHANGES } from '../full-registry';
import { modelFeatures } from '../model-features';

const entry = RESULT_CHANGES.changes.find((change) => change.id === 'linear-stability-refusals')!;
const legacy = (file: string) => JSON.parse(readFileSync(new URL(`../../../../legacy-projects/${file}`, import.meta.url), 'utf8'));

it.skip('known wrong result: #1753: ordinary truss forces are not changed by linear stability', () => {
  const file = legacy('v0.2.0/truss.ded');
  const changes = assessProject(file.snapshot, null, file.analysisMode).changes;
  expect(changes.map((change) => change.id)).not.toContain(entry.id);
});

it.skip('known wrong result: #1753: ordinary shell displacements are not changed by linear stability', () => {
  const file = legacy('v0.4.0/deep-beam-shell.ded');
  const changes = assessProject(file.snapshot, null, file.analysisMode).changes;
  expect(changes.map((change) => change.id)).not.toContain(entry.id);
});

it('keeps #1753 applicable to linear frames, releases, springs, constraints and connectors', () => {
  for (const feature of ['frameMembers', 'hinges', 'springs', 'constraints', 'connectors', 'inclinedSupports', 'eccentricities', 'curvedShells']) {
    expect(conditionHolds(entry.when!, new Set(['analysis:linear', feature])), feature).toBe(true);
    expect(conditionHolds(entry.when!, new Set([feature])), feature).toBe(false);
  }
  const features = modelFeatures({ analysisMode: '2d', elements: [[1, {
    id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, releaseJ: { my: true },
  }]] }, { analysesRun: ['linear'] });
  expect(conditionHolds(entry.when!, features)).toBe(true);
});
