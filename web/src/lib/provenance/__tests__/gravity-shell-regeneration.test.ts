import { expect, it } from 'vitest';
import { assessProject } from '../applicability';
import { RESULT_CHANGES } from '../full-registry';
import { modelFeatures, type FeatureSnapshot } from '../model-features';
import { stampSolve } from '../solve-stamp';

const change = RESULT_CHANGES.changes.find(c => c.id === 'gravity-shell-coverage')!;
const legacy = {
  elements: [[1, { id: 1, type: 'frame', materialId: 1, nodeI: 1, nodeJ: 2 }]],
  loadCases: [{ id: 1, type: 'D' }],
  loads: [{ type: 'distributed3d', data: { elementId: 1, caseId: 1, generatedBy: 'cirsoc-101' } }],
} satisfies FeatureSnapshot;
const derivation = [{ key: 'loadPlan.gravity.partlyUnderShells' }];

function changes(snapshot: FeatureSnapshot) {
  const stamp = { ...stampSolve('linear', null), resultsVersion: change.resultsVersion };
  return assessProject(snapshot, stamp).changes.map(c => c.id);
}

it('#2200 a partial-shell derivation flags legacy plans with only stored beam loads', () => {
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

const legacyPanel: FeatureSnapshot = {
  ...legacy,
  quads: [[1, { id: 1 }]],
  regulations: { roles: { loads: { adapterId: 'cirsoc-101', settings: { dialog: { gravityMode: 'panels' } } } } },
};

it('#2282 saved panel-mode shell geometry and generated member loads require regeneration', () => {
  for (const analysisMode of ['3d', 'pro']) {
    for (const analysis of ['linear', 'pdelta'] as const) {
      for (const designData of [undefined, { loadBasis: {} }]) {
        const snapshot = { ...legacyPanel, analysisMode, designData };
        expect(assessProject(snapshot, stampSolve(analysis, null)).changes.map(c => c.id)).toContain(change.id);
      }
    }
  }
});

it('requires saved panel mode, shell geometry, generated member gravity and an older generation stamp for the fallback', () => {
  const manual = [{ type: 'distributed3d', data: { elementId: 1, caseId: 1 } }];
  const width = { roles: { loads: { adapterId: 'cirsoc-101', settings: { dialog: { gravityMode: 'width' } } } } };
  for (const overrides of [
    { analysisMode: '2d' }, { loads: manual }, { regulations: width }, { regulations: undefined }, { quads: [] },
    { designData: { loadBasis: { resultsVersion: change.resultsVersion } } },
  ]) {
    expect(changes({ ...legacyPanel, analysisMode: 'pro', ...overrides })).not.toContain(change.id);
  }
});

it('#2512 explicit width gravity does not qualify for panel gravity regeneration', () => {
  const snapshot: FeatureSnapshot = {
    ...legacyPanel, analysisMode: 'pro',
    regulations: { roles: { loads: { adapterId: 'cirsoc-101', settings: { dialog: { gravityMode: 'width' } } } } },
    designData: { loadBasis: { derivation: [{ key: 'loadPlan.gravity.width' }] } },
  };
  const features = modelFeatures(snapshot);
  expect(features.has('generatedWidthGravity')).toBe(true);
  expect(features.has('generatedPanelGravity')).toBe(false);
});
