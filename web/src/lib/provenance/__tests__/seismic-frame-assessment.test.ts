import { expect, it } from 'vitest';
import { modelFeatures, type FeatureSnapshot } from '../model-features';

it('limits the frame assessment notice to evidence of a concrete frame reinforcement or seismic assessment', () => {
  const element = { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 };
  const model: FeatureSnapshot = {
    analysisMode: 'pro', elements: [[1, element]],
    materials: [[1, { id: 1, name: 'H30', e: 25000, rho: 25, fy: 30 }]],
    loadCases: [{ id: 1, type: 'D' }, { id: 2, type: 'E' }],
  };
  const applies = (s: FeatureSnapshot) => modelFeatures(s).has('seismicFrameAssessment');
  expect(applies(model)).toBe(false);
  expect(applies({ ...model, combinations: [{ factors: [{ caseId: 2, factor: 0 }] }] })).toBe(false);
  expect(applies({ ...model, combinations: [{ factors: [{ caseId: 2, factor: -1 }] }] })).toBe(true);
  expect(applies({ ...model, elements: [[1, { ...element, reinforcement: { column: {} } }]] })).toBe(true);
  expect(applies({ ...model, designData: { seismic: {} } })).toBe(true);
  expect(applies({ ...model, analysisMode: '2d', designData: { seismic: {} } })).toBe(false);
});
