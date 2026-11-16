import { expect, it } from 'vitest';
import { assessProject } from '../applicability';
import { RESULT_CHANGES } from '../full-registry';
import { stampSolve } from '../solve-stamp';
import { ANALYSIS_KINDS, type FeatureSnapshot } from '../model-features';

const gravity = 'gravity-physical-regions', floor = 'floor-load-region-moments';
const entry = RESULT_CHANGES.changes.find(c => c.id === gravity)!;
for (const mode of ['2d', '3d', 'pro']) for (const analysis of ANALYSIS_KINDS) {
  it(`old generated gravity needs regeneration after ${analysis} in ${mode}`, () => {
    const snapshot: FeatureSnapshot = { analysisMode: mode, loadCases: [{ id: 1, type: 'D' }], loads: [{ type: 'distributed3d', data: { generatedBy: 'load-plan', caseId: 1 } }], designData: { loadBasis: { resultsVersion: entry.resultsVersion - 1 } } };
    const assessment = assessProject(snapshot, stampSolve(analysis, null), mode);
    expect(assessment.changes.map(c => c.id)).toContain(gravity);
    snapshot.designData!.loadBasis!.resultsVersion = RESULT_CHANGES.currentResultsVersion;
    expect(assessProject(snapshot, stampSolve(analysis, null), mode).changes.map(c => c.id)).not.toContain(gravity);
  });
}
it('floor definitions need the moment correction; ordinary manual point loads do not', () => {
  const snapshot: FeatureSnapshot = { groups: [[1, { kind: 'floorLoad' }]] };
  expect(assessProject(snapshot, null).changes.map(c => c.id)).toContain(floor);
  expect(assessProject(snapshot, stampSolve('linear', null)).changes.map(c => c.id)).not.toContain(floor);
  expect(assessProject({ loads: [{ type: 'nodal3d', data: { fz: -1 } }] }, null).changes.map(c => c.id)).not.toContain(floor);
});

it('a live-only floor share whose definition was lost still receives the floor notice', () => {
  const snapshot: FeatureSnapshot = { loadCases: [{ id: 1, type: 'L' }], loads: [{ type: 'nodal3d', data: { caseId: 1, fromDef: 7, fz: -1 } }] };
  expect(assessProject(snapshot, null).changes.map(c => c.id)).toContain(floor);
});
