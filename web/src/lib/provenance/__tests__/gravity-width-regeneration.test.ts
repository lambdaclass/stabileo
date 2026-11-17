import { expect, it } from 'vitest';
import { assessProject } from '../applicability';
import { RESULT_CHANGES } from '../full-registry';
import { modelFeatures, type FeatureSnapshot } from '../model-features';
import { stampSolve } from '../solve-stamp';

const knownWrong2269 = process.env.RUN_KNOWN_WRONG === '2269' ? it : it.skip;
const change = RESULT_CHANGES.changes.find(c => c.id === 'gravity-width-mass')!;
const seismicBasis = { derivation: [{ key: 'loadPlan.derivation.seismic' }] };
const legacy = {
  loadCases: [{ id: 1, type: 'E' }],
  loads: [{ type: 'nodal3d', data: { caseId: 1, generatedBy: 'cirsoc-101', fx: 3.5625 } }],
} satisfies FeatureSnapshot;

function changes(snapshot: FeatureSnapshot, resultsVersion = change.resultsVersion) {
  return assessProject(snapshot, { ...stampSolve('linear', null), resultsVersion }).changes.map(c => c.id);
}

function savedMode(gravityMode: 'panels' | 'width') {
  return { roles: { loads: { adapterId: 'cirsoc-101', settings: { dialog: { gravityMode } } } } };
}

knownWrong2269('known wrong result: #2269 requires regeneration for legacy zero-width seismic loads without member gravity', () => {
  const unmarked = legacy.loads.map(l => ({ ...l, data: { caseId: l.data.caseId, fx: l.data.fx } }));
  for (const analysisMode of ['2d', '3d', 'pro']) {
    for (const snapshot of [
      { ...legacy, analysisMode },
      { ...legacy, analysisMode, loads: unmarked, designData: { loadBasis: seismicBasis } },
    ]) {
      expect(modelFeatures(snapshot).has('generatedWidthGravity')).toBe(true);
      expect(changes(snapshot)).toContain(change.id);
    }
  }
});

knownWrong2269('known wrong result: #2269 trusts the saved plan mode before inferring it from loads', () => {
  const generatedMember = {
    loadCases: [{ id: 1, type: 'D' }],
    loads: [{ type: 'distributed3d', data: { caseId: 1, generatedBy: 'cirsoc-101' } }],
  };
  expect(changes({ ...generatedMember, regulations: savedMode('panels') })).not.toContain(change.id);
  expect(changes({ ...legacy, regulations: savedMode('width') })).toContain(change.id);
  expect(changes({ ...legacy, regulations: savedMode('panels') })).not.toContain(change.id);
});

it('keeps the width mass notice specific to older applicable generated actions', () => {
  const manual = { ...legacy, loads: [{ type: 'nodal3d', data: { caseId: 1, fx: 3.5625 } }] };
  expect(changes(manual, change.resultsVersion - 1)).not.toContain(change.id);
  const panel = { ...legacy, designData: { loadBasis: { derivation: [{ key: 'loadPlan.gravity.width' }] } } };
  expect(changes(panel)).not.toContain(change.id);
  const current = { ...legacy, designData: { loadBasis: { ...seismicBasis, resultsVersion: change.resultsVersion } } };
  expect(changes(current)).not.toContain(change.id);
});
