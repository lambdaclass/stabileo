import { expect, it } from 'vitest';
import entry from '../result-changes/global-axes-inputs.json';
import { modelFeatures } from '../model-features';
import { conditionHolds } from '../applicability';

it('the axes notice is limited to the axes feature marker and explains no canonical solver changes', () => {
  for (const snapshot of [{}, { analysisMode: 'pro' }, { loadCases: [{ id: 1, type: 'W' }] }]) {
    expect(conditionHolds(entry.when, modelFeatures(snapshot))).toBe(false);
  }
  expect(conditionHolds(entry.when, modelFeatures({ loadCases: [{ id: 1, axisNamed: true }] }))).toBe(true);
  expect('quantities' in entry).toBe(false);
});
