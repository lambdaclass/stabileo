import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { assessProject, conditionHolds } from '../applicability';
import { RESULT_CHANGES } from '../full-registry';
import { modelFeatures } from '../model-features';

const entry = RESULT_CHANGES.changes.find((change) => change.id === 'linear-stability-refusals')!;
const legacy = (file: string) => JSON.parse(readFileSync(new URL(`../../../../legacy-projects/${file}`, import.meta.url), 'utf8'));

it('#1753: ordinary truss forces are not changed by linear stability', () => {
  const file = legacy('v0.2.0/truss.ded');
  const changes = assessProject(file.snapshot, null, file.analysisMode).changes;
  expect(changes.map((change) => change.id)).not.toContain(entry.id);
});

it('#1753: ordinary shell displacements are not changed by linear stability', () => {
  const file = legacy('v0.4.0/deep-beam-shell.ded');
  const changes = assessProject(file.snapshot, null, file.analysisMode).changes;
  expect(changes.map((change) => change.id)).not.toContain(entry.id);
});

it('keeps #1753 applicable to linear releases, springs, constraints and connectors', () => {
  for (const feature of ['hinges', 'springs', 'constraints', 'connectors', 'inclinedSupports', 'eccentricities', 'curvedShells']) {
    expect(conditionHolds(entry.when!, new Set(['analysis:linear', feature])), feature).toBe(true);
    expect(conditionHolds(entry.when!, new Set([feature])), feature).toBe(false);
  }
  const features = modelFeatures({ analysisMode: '2d', elements: [[1, {
    id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, releaseJ: { my: true },
  }]] }, { analysesRun: ['linear'] });
  expect(conditionHolds(entry.when!, features)).toBe(true);
});

const repoText = (file: string) => readFileSync(new URL(`../../../../../${file}`, import.meta.url), 'utf8');

it.skip('known wrong result: #1753: plain frame and truss mechanisms receive the linear re-check notice', () => {
  for (const [name, mode, type] of [
    ['spinning beam', '3d', 'frame'],
    ['pin-jointed arch chain', '2d', 'truss'],
    ['pin-jointed cable chain', '2d', 'cable'],
  ]) {
    const snapshot = {
      analysisMode: mode,
      elements: [[1, { id: 1, type, nodeI: 1, nodeJ: 2, materialId: 1 }],
        [2, { id: 2, type, nodeI: 2, nodeJ: 3, materialId: 1 }]],
      supports: [[1, { nodeId: 1, type: 'pinned' }], [3, { nodeId: 3, type: 'pinned' }]],
    } as Parameters<typeof modelFeatures>[0];
    expect(assessProject(snapshot, null, mode).changes.map((change) => change.id), name).toContain(entry.id);
  }
});

it('the #1496 tables distinguish independent and coupled directions', () => {
  for (const file of ['docs/results-changes/2026-11-linear-stability-refusals.md', 'docs/solver/stability.md']) {
    const rows = repoText(file).split('\n').filter((line) => line.startsWith('|') && line.includes('#1496'));
    expect(rows.some((row) => /Axis-aligned cantilever/.test(row) && /\| Stable, solved \|/.test(row) && row.includes('PL²/2EI')), file).toBe(true);
    expect(rows.some((row) => /Coupled oblique cantilever/.test(row) && /\| Mechanism \|/.test(row)), file).toBe(true);
  }
});

it('the changelog discloses corrected stable PCG responses and refinement', () => {
  const text = repoText('changelog.d/linear-solvers-refuse-unstable-stiffness.md');
  expect(text).not.toContain('Models that solved before and are stable give the same displacements');
  expect(text).toMatch(/PCG[\s\S]*corrected components/);
  expect(text).toContain('residual refinement');
});
