import { expect, it } from 'vitest';
import totals from '../result-changes/compensated-applied-force-totals.json';
import generated from '../result-changes/generated-member-cuts.json';
import remapping from '../result-changes/planar-remapped-load-integrals.json';
import { conditionHolds } from '../applicability';
import { fieldCovered } from '../../../../scripts/results-snapshot/applicability.mjs';
import { ANALYSIS_KINDS, modelFeatures, type FeatureSnapshot } from '../model-features';

const snapshot: FeatureSnapshot = {
  analysisMode: '2d',
  elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }]],
  loads: [{ type: 'distributed', data: { elementId: 1, qI: 1, qJ: 1, a: 1.5 - 2 ** -52, b: 1.5 } }],
};
const features = (s = snapshot, run = 'plastic') => modelFeatures(s, { analysesRun: [run], analysesRecorded: ANALYSIS_KINDS });

it('#2223 remapped load provenance requires planar plastic partial loads', () => {
  expect(conditionHolds(remapping.when, features())).toBe(true);
  for (const s of [{ ...snapshot, analysisMode: 'pro' }, { ...snapshot, elements: [] }, { ...snapshot, loads: [] },
    { ...snapshot, loads: [{ type: 'pointOnElement', data: { elementId: 1, a: 1.5, p: 1 } }] }]) {
    expect(conditionHolds(remapping.when, features(s))).toBe(false);
  }
  for (const run of ['linear', 'pdelta', 'nonlinear', 'modal', 'buckling']) expect(conditionHolds(remapping.when, features(snapshot, run))).toBe(false);
  for (const field of ['base.displacements[0].uz', 'base.elementForces[0].mStart', 'nonlinear.displacements[0].uz']) expect(fieldCovered(remapping, field, [...features()])).toBe(false);
  expect(remapping.quantities).not.toContain('*');
});

it('#2223 compensated nodal force provenance covers summaries without numerical responses', () => {
  const nodal = features({ ...snapshot, loads: [{ type: 'nodal', data: { nodeId: 1, fz: 1 } }] }, 'linear');
  expect(fieldCovered(totals, 'base.equilibrium.appliedForceSum[1]', [...nodal])).toBe(true);
  for (const field of ['base.displacements[0].uz', 'base.elementForces[0].mStart', 'base.reactions[0].rz']) expect(fieldCovered(totals, field, [...nodal])).toBe(false);
  expect(totals.quantities).not.toContain('*');
});

it('#2223 compensated force summaries require a model with structural stiffness', () => {
  for (const structure of ['members', 'shells', 'curvedShells', 'connectors', 'springs']) {
    for (const analysis of ANALYSIS_KINDS) expect(conditionHolds(totals.when, new Set([structure, `analysis:${analysis}`]))).toBe(true);
  }
  for (const analysis of ANALYSIS_KINDS) expect(conditionHolds(totals.when, new Set([`analysis:${analysis}`]))).toBe(false);
});

it('#2223 generated cuts cover loaded members and nodal moments without explaining empty models', () => {
  for (const feature of ['memberLoads', 'nodalMoments']) {
    for (const analysis of ANALYSIS_KINDS) expect(conditionHolds(generated.when, new Set(['members', feature, `analysis:${analysis}`]))).toBe(true);
    expect(conditionHolds(generated.when, new Set([feature]))).toBe(false);
  }
  expect(conditionHolds(generated.when, new Set(['members']))).toBe(false);
  expect(conditionHolds(generated.when, new Set())).toBe(false);
  expect(generated.quantities).not.toContain('*');
});
