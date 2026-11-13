import { expect, it } from 'vitest';
import { stepRoof } from '../../engine/loads/__tests__/snow-step-fixture';
import { auditRoof } from '../../engine/loads/__tests__/snow-slope-audit-fixture';
import { assessProject } from '../applicability';
import { RESULT_CHANGES } from '../full-registry';
import { modelFeatures, type FeatureSnapshot } from '../model-features';
import { stampSolve } from '../solve-stamp';

const entry = RESULT_CHANGES.changes.find(c => c.id === 'snow-lower-roof-step')!;
function snapshot(lo = 20, hi = 0, angle = 0, carrier = 11): FeatureSnapshot {
  const model = stepRoof(lo, hi, 0.45, angle);
  return { analysisMode: 'pro', nodes: [...model.nodes], elements: [...model.elements], loadCases: [{ id: 4, type: 'S' }],
    loads: [{ type: 'distributed3d', data: { caseId: 4, elementId: carrier, generatedBy: 'generator' } }] };
}
const concerns = (s: FeatureSnapshot) => assessProject(s, null).changes.some(c => c.id === 'snow-lower-roof-step');

it.each([[20, 0, 0], [0, 20, 0], [20, 20, 0.37], [0, 0, 0.37]])('notifies lower-roof snow at a modeled step: %s/%s/%s', (lo, hi, angle) => {
  const s = snapshot(lo, hi, angle);
  expect(modelFeatures(s).has('generatedSnowRoofSteps')).toBe(true);
  expect(concerns(s)).toBe(true);
});
it('includes width-carried snow on the pitched lower roof', () => expect(concerns(snapshot(20, 0, 0, 500))).toBe(true));
it('excludes manual snow, non-snow, the higher roof and an unrelated generated load', () => {
  for (const s of [snapshot(20, 0, 0, 100), { ...snapshot(), loadCases: [{ id: 4, type: 'D' }] }, {
    ...snapshot(), loads: [{ type: 'distributed3d', data: { caseId: 4, elementId: 11 } }],
  }, { ...snapshot(), loads: [{ type: 'distributed3d', data: { caseId: 9, elementId: 11, generatedBy: 'generator' } }] }]) expect(concerns(s)).toBe(false);
});
it.each([0, 20])('excludes no-step roofs at %s degrees', slope => {
  const model = auditRoof('gable', slope);
  expect(concerns({ ...snapshot(), nodes: [...model.nodes], elements: [...model.elements] })).toBe(false);
});
it('keeps the notice after solving until the generated snow is updated', () => {
  const s = snapshot();
  s.designData = { loadBasis: { resultsVersion: entry.resultsVersion - 1 } };
  const stamp = { ...stampSolve('linear', null), resultsVersion: RESULT_CHANGES.currentResultsVersion };
  expect(assessProject(s, stamp).changes.map(c => c.id)).toContain(entry.id);
  s.designData.loadBasis!.resultsVersion = entry.resultsVersion;
  expect(assessProject(s, stamp).changes.map(c => c.id)).not.toContain(entry.id);
});
