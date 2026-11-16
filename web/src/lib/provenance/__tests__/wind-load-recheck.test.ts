import { expect, it } from 'vitest';
import { assessProject } from '../applicability';
import { RESULT_CHANGES } from '../full-registry';
import { stampSolve } from '../solve-stamp';
import type { FeatureSnapshot } from '../model-features';
const snapshot = (type = 'W', generatedBy = 'load-plan'): FeatureSnapshot => ({ loadCases: [{ id: 1, type }], loads: [{ type: 'distributed', data: { caseId: 1, elementId: 1, q: -1, generatedBy } }] });
for (const mode of ['2d', '3d', 'pro']) for (const analysis of ['linear', 'pdelta', 'plastic'] as const) for (const type of ['W', 'Wa']) {
  it(`wind regeneration remains required after re-solving ${type} in ${mode} with ${analysis}`, () => {
    const assessment = assessProject(snapshot(type), stampSolve(analysis, null), mode, RESULT_CHANGES, undefined, 0);
    expect(assessment.changes.map(c => c.id).sort()).toEqual(['generated-area-loads-headroom', 'wind-carriers-and-continuous-width', 'wind-member-pressure-transfer', 'wind-physical-pressure-field', 'wind-plan-couple-and-sign-face', 'wind-triangular-and-sign-minimum']);
  });
}
it('current generated loads clear wind notices; manual wind and generated gravity do not get this notice', () => {
  for (const s of [snapshot('W', ''), snapshot('Wa', ''), snapshot('D')]) {
    const ids = assessProject(s, null).changes.map(c => c.id);
    expect(ids).not.toContain('wind-physical-pressure-field');
    expect(ids).not.toContain('wind-plan-couple-and-sign-face');
    expect(ids).not.toContain('wind-member-pressure-transfer');
    expect(ids).not.toContain('wind-triangular-and-sign-minimum');
    expect(ids).not.toContain('wind-carriers-and-continuous-width');
  }
  const assessment = assessProject(snapshot(), stampSolve('linear', null), '3d', RESULT_CHANGES, undefined, RESULT_CHANGES.currentResultsVersion);
  expect(assessment.changes.map(c => c.id)).toEqual([]);
});

it('#2220 manual wind plus generated gravity does not require wind regeneration', () => {
  const s: FeatureSnapshot = { loadCases: [{ id: 1, type: 'W' }, { id: 2, type: 'D' }], loads: [
    { type: 'nodal3d', data: { caseId: 1, nodeId: 1, fx: 1 } },
    { type: 'distributed3d', data: { caseId: 2, elementId: 1, qZI: -1, qZJ: -1, generatedBy: 'load-plan' } },
  ] };
  const ids = assessProject(s, null).changes.map(c => c.id);
  expect(ids).not.toContain('wind-physical-pressure-field');
  expect(ids).not.toContain('wind-plan-couple-and-sign-face');
    expect(ids).not.toContain('wind-member-pressure-transfer');
    expect(ids).not.toContain('wind-triangular-and-sign-minimum');
    expect(ids).not.toContain('wind-carriers-and-continuous-width');
});
