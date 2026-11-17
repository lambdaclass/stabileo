import { expect, it } from 'vitest';
import { assessProject } from '../applicability';
import { RESULT_CHANGES } from '../full-registry';
import { modelFeatures, type FeatureSnapshot } from '../model-features';
import { stampSolve } from '../solve-stamp';

const change = RESULT_CHANGES.changes.find(c => c.id === 'gravity-shell-coverage')!;
const legacy = {
  elements: [{ id: 1, type: 'frame', materialId: 1 }],
  loadCases: [{ id: 1, type: 'D' }],
  loads: [{ type: 'distributed3d', data: { elementId: 1, caseId: 1, generatedBy: 'cirsoc-101' } }],
} satisfies FeatureSnapshot;
const derivation = [{ key: 'loadPlan.gravity.partlyUnderShells' }];

function changes(snapshot: FeatureSnapshot) {
  const stamp = { ...stampSolve('linear', null), resultsVersion: change.resultsVersion };
  return assessProject(snapshot, stamp).changes.map(c => c.id);
}

const knownWrong2200 = process.env.RUN_KNOWN_WRONG === '2200' ? it : it.skip;

knownWrong2200('known wrong result: #2200 a partial-shell derivation flags legacy plans with only stored beam loads', () => {
  for (const analysisMode of ['3d', 'pro']) {
    const snapshot = { ...legacy, analysisMode, designData: { loadBasis: { derivation } } };
    expect(modelFeatures(snapshot).has('generatedPanelGravityShells')).toBe(true);
    expect(changes(snapshot)).toContain(change.id);
  }
});

it('limits the shell regeneration notice to older three-dimensional plans with shell evidence', () => {
  const shellPlan = { ...legacy, designData: { loadBasis: { derivation } } };
  expect(changes({ ...shellPlan, analysisMode: '2d' })).not.toContain(change.id);
  const current = { ...legacy, designData: { loadBasis: { derivation, resultsVersion: change.resultsVersion } } };
  expect(changes({ ...current, analysisMode: 'pro' })).not.toContain(change.id);
  const plain = { ...legacy, designData: { loadBasis: { derivation: [{ key: 'loadPlan.gravity.panels' }] } } };
  expect(changes({ ...plain, analysisMode: 'pro' })).not.toContain(change.id);
});
