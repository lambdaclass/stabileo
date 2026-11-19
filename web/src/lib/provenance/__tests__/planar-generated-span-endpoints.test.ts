import { expect, it } from 'vitest';
import change from '../result-changes/planar-generated-span-endpoints.json';
import { conditionHolds } from '../applicability';
import { fieldCovered } from '../../../../scripts/results-snapshot/applicability.mjs';
import { ANALYSIS_KINDS, modelFeatures, type FeatureSnapshot } from '../model-features';

it('#2223 scopes generated span changes to planar plastic responses', () => {
  const snapshot: FeatureSnapshot = { analysisMode: '2d', elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }]] };
  const features = (s = snapshot, analysesRun = ['plastic']) => modelFeatures(s, { analysesRun, analysesRecorded: ANALYSIS_KINDS });
  expect(conditionHolds(change.when, features())).toBe(true);
  expect(conditionHolds(change.when, features({ ...snapshot, analysisMode: 'pro' }))).toBe(false);
  expect(conditionHolds(change.when, features({ ...snapshot, elements: [] }))).toBe(false);
  for (const run of ['linear', 'pdelta', 'nonlinear', 'modal', 'buckling']) {
    expect(conditionHolds(change.when, features(snapshot, [run]))).toBe(false);
  }
  for (const field of ['base.displacements[0].uz', 'base.elementForces[0].mStart', 'nonlinear.displacements[0].uz']) {
    expect(fieldCovered(change, field, [...features()])).toBe(false);
  }
  expect(change.quantities).not.toContain('*');
});
