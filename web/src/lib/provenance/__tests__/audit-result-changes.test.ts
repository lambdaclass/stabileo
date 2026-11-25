import { describe, expect, it } from 'vitest';
import declaredQuantities from 'virtual:result-change-quantities';
import { assessProject } from '../applicability';
import { unknownStamp } from '../solve-stamp';
import { RESULT_CHANGES } from '../full-registry';
import { ANALYSIS_KINDS, modelFeatures, type FeatureSnapshot, type AnalysisKind } from '../model-features';
import { conditionHolds } from '../../../../scripts/results-snapshot/applicability.mjs';

const model: FeatureSnapshot = {
  elements: [[1, { id: 1, materialId: 1, sectionId: 1, nodeI: 1, nodeJ: 2 }]],
};
const applicable = (id: string, mode: string, analyses: string[], snapshot = model) => {
  const entry = RESULT_CHANGES.changes.find(c => c.id === id);
  expect(entry, id).toBeDefined();
  return conditionHolds(entry!.when!, modelFeatures(snapshot, { analysisMode: mode, analysesRun: analyses, analysesRecorded: ANALYSIS_KINDS }));
};

describe('audited output changes are registered narrowly', () => {
  it('registers only the refusal for conflicting model aliases', () => {
    const id = 'canonical-model-aliases';
    expect(declaredQuantities[id]).toEqual(['solve.ok']);
    const registered = (snapshot: FeatureSnapshot, mode: string) =>
      assessProject(snapshot, undefined, mode).changes.find(change => change.id === id);
    const releases = { ...model.elements![0]![1], releaseI: { mz: false }, hingeStart: true };
    const conflicts: FeatureSnapshot[] = [
      { loads: [{ type: 'nodal', data: { my: 0, mz: 5 } }] },
      { loads: [{ type: 'pointOnElement', data: { my: 5, enteredZeroMoment: true } }] },
      { loads: [{ type: 'nodal', data: { fz: 0, fy: 5 } }] },
      { loads: [{ type: 'distributed', data: { q: 1, qJ: 0 } }] },
      { supports: [[1, { nodeId: 1, type: 'fixed', dz: 0, dy: 1 }]] },
      { elements: [[1, releases]] },
    ];
    for (const snapshot of conflicts) {
      expect(registered(snapshot, '2d')).toBeDefined();
    }

    const admitted: FeatureSnapshot[] = [
      { loads: [{ type: 'nodal', data: { fz: 5, my: 5 } }] },
      { loads: [{ type: 'nodal', data: { fz: 5, fy: 5, my: 5, mz: 5 } }] },
      { loads: [{ type: 'pointOnElement', data: { mz: 5 } }] },
      { loads: [{ type: 'distributed', data: { qI: 1, qJ: 0 } }] },
    ];
    for (const snapshot of admitted) {
      expect(registered(snapshot, '2d')).toBeUndefined();
    }
    expect(registered(conflicts[0]!, '3d')).toBeDefined();
    expect(registered({
      loads: [{ type: 'nodal3d', data: { fy: 1, fz: 2, my: 3, mz: 4 } }],
      supports: [[1, { nodeId: 1, type: 'fixed3d', dz: 1, dy: 2, dry: 3, drz: 4 }]],
    }, '3d')).toBeUndefined();
  });

  it('attributes planar nodal solver refusals only to explicit solver input evidence', () => {
    const id = 'planar-nodal-wire-components';
    const entry = RESULT_CHANGES.changes.find(c => c.id === id)!;
    const stamp = { ...unknownStamp(), resultsVersion: entry.resultsVersion - 1, analyses: ['linear' as const] };
    const ids = (evidence?: ReadonlySet<string>) =>
      assessProject(model, stamp, '2d', RESULT_CHANGES, evidence).changes.map(c => c.id);
    expect(declaredQuantities[id]).toEqual(['solve.ok']);
    expect(ids()).not.toContain(id);
    expect(ids(new Set(['outOfPlaneNodalComponents']))).not.toContain(id);
    expect(ids(new Set(['native:planar-nodal-vector']))).toContain(id);
  });

  it('registers SSI in both dimensions without warning a recorded linear run', () => {
    for (const mode of ['2d', '3d', 'pro']) {
      expect(applicable('ssi-support-reactions', mode, ['ssi'])).toBe(true);
      expect(applicable('ssi-support-reactions', mode, ['linear'])).toBe(false);
      expect(applicable('ssi-support-reactions', mode, ['ssi'], {})).toBe(false);
    }
  });

  it('registers 2D nonlinear arc arithmetic without matching 3D or linear', () => {
    expect(applicable('arc-length-reference-norm', '2d', ['nonlinear'])).toBe(true);
    expect(applicable('arc-length-reference-norm', '3d', ['nonlinear'])).toBe(false);
    expect(applicable('arc-length-reference-norm', '2d', ['linear'])).toBe(false);
    expect(applicable('arc-length-reference-norm', '2d', ['nonlinear'], {})).toBe(false);
    expect(applicable('arc-length-reference-norm', '2d', ['nonlinear'], { connectors: [[1, {}]] })).toBe(true);
  });

  it('registers the wall gallery context without matching saved shell projects', () => {
    const entry = RESULT_CHANGES.changes.find(c => c.id === 'gallery-slab-hard-walls');
    expect(entry).toBeDefined();
    expect(conditionHolds(entry!.when!, new Set(['gallery:slab-on-columns:walls', 'analysis:linear']))).toBe(true);
    expect(conditionHolds(entry!.when!, new Set(['gallery:slab-on-columns:columns', 'analysis:linear']))).toBe(false);
    const shell: FeatureSnapshot = { quads: [[1, { id: 1 }]] };
    expect(applicable('gallery-slab-hard-walls', 'pro', ['linear'], shell)).toBe(false);
    expect(assessProject(shell, undefined, 'pro').changes.map(c => c.id)).not.toContain(entry!.id);
  });

  it.each(['2d', '3d', 'pro'])('requires native supplied-result evidence for certificate notices in %s', (mode) => {
    const id = 'supplied-linear-certificates';
    const entry = RESULT_CHANGES.changes.find(c => c.id === id)!;
    const stamp = { ...unknownStamp(), resultsVersion: entry.resultsVersion - 1, recorded: [...ANALYSIS_KINDS] };
    const notices = (saved: typeof stamp | undefined, evidence?: ReadonlySet<string>) =>
      assessProject(model, saved, mode, RESULT_CHANGES, evidence).changes.map(c => c.id);

    expect(notices(undefined)).not.toContain(id);
    expect(notices({ ...stamp, analyses: ['modal'] })).not.toContain(id);
    expect(notices({ ...stamp, analyses: ['linear'] })).not.toContain(id);
    const native = new Set(['native:supplied-linear-certificate', 'analysis:linear']);
    expect(notices(stamp, native)).toContain(id);
    expect(notices({ ...stamp, resultsVersion: entry.resultsVersion }, native)).not.toContain(id);
  });

  it.each([
    ['ssi-support-reactions', 'pro', 'ssi'],
    ['arc-length-reference-norm', '2d', 'nonlinear'],
  ])('shows %s only before its results version and treats unknown history conservatively', (id, mode, analysis) => {
    const entry = RESULT_CHANGES.changes.find(c => c.id === id)!;
    const stamp = { ...unknownStamp(), resultsVersion: entry.resultsVersion - 1, analyses: [analysis as AnalysisKind], recorded: [...ANALYSIS_KINDS] };
    const ids = (version: number) => assessProject(model, { ...stamp, resultsVersion: version }, mode).changes.map(c => c.id);
    expect(ids(entry.resultsVersion - 1)).toContain(id);
    expect(ids(entry.resultsVersion)).not.toContain(id);
    expect(ids(entry.resultsVersion + 1)).not.toContain(id);
    expect(assessProject(model, undefined, mode).changes.map(c => c.id)).toContain(id);
  });
});

it('#2297 direct analysis notices require a combination using an explicit notional case', () => {
  const loadCases = [
    { id: 1, type: 'D' },
    { id: 2, type: 'N' },
    { id: 3, includes: [{ caseId: 2, factor: 1 }] },
    { id: 4, notional: { sourceCaseId: 1, ratio: 0.002, dir: '+X' } },
    { id: 5, type: 'N', includes: [{ caseId: 1, factor: 1 }] },
  ];
  const notice = (caseId: number, factor: number) => applicable('direct-analysis-notional-factors', 'pro', [], {
    loadCases, combinations: [{ factors: [{ caseId, factor }] }],
  });
  expect(notice(2, 1e-13)).toBe(true);
  expect(notice(3, -1e-13)).toBe(true);
  expect(notice(4, 1e-13)).toBe(true);
  expect.soft(notice(1, 1)).toBe(false);
  expect.soft(notice(2, 0)).toBe(false);
  expect.soft(notice(5, 1)).toBe(false);

  const change = RESULT_CHANGES.changes.find(c => c.id === 'direct-analysis-notional-factors')!;
  expect(assessProject({ loadCases, combinations: [{ factors: [{ caseId: 2, factor: 1e-13 }] }] }, undefined).changes).toContain(change);
  expect(declaredQuantities[change.id]).toBeUndefined();
});

it('#2297 shell notices require a zero or possibly cancelling factor', () => {
  const dead = { caseId: 1, factor: 1 };
  const notice = (factors: Array<{ caseId: number; factor: number }>, shells = true) =>
    applicable('zero-weight-shell-cases', 'pro', ['linear'], {
      ...(shells ? { quads: [[1, { id: 1 }]] } : {}),
      combinations: [{ factors }],
    });
  expect(notice([dead, { caseId: 2, factor: -0 }])).toBe(true);
  expect(notice([dead, { caseId: 2, factor: 1 }, { caseId: 2, factor: -1 }])).toBe(true);
  expect(notice([dead, { caseId: 2, factor: 0 }], false)).toBe(false);
  expect.soft(notice([dead])).toBe(false);
  expect(notice([dead, { caseId: 1, factor: 2 }])).toBe(false);
  expect.soft(notice([dead, { caseId: 2, factor: Number.MIN_VALUE }])).toBe(false);
});

it.skipIf(process.env.RUN_KNOWN_WRONG !== '2586')('#2586 compares generated member loads within each effective case', () => {
  const model: FeatureSnapshot = {
    analysisMode: 'pro',
    loadCases: [{ id: 1, type: 'E', alternatives: 'E' }, { id: 2, type: 'E', alternatives: 'E' }],
    loads: [
      { type: 'distributed3d', data: { elementId: 1, caseId: 1, frame: 'global', qZI: 3, qZJ: 3, generatedBy: 'inpres103-2018' } },
      { type: 'distributed3d', data: { elementId: 1, caseId: 2, frame: 'global', qZI: -3, qZJ: -3, generatedBy: 'inpres103-2018' } },
    ],
  };
  const opposed = (loadCases: FeatureSnapshot['loadCases'], loads = model.loads) =>
    modelFeatures({ ...model, loadCases, loads }).has('opposedGeneratedLineLoads');
  const include = (factor: number) => ({
    id: 3, includes: [{ caseId: 1, factor: 1 }, { caseId: 2, factor }],
  });
  expect.soft(opposed(model.loadCases)).toBe(false);
  expect.soft(opposed(model.loadCases, model.loads!.map(load => ({ ...load, data: { ...load.data, caseId: 1 } })))).toBe(true);
  expect.soft(opposed([...model.loadCases!, include(1)])).toBe(true);
  expect.soft(opposed([...model.loadCases!, include(0)])).toBe(false);
  expect.soft(opposed([...model.loadCases!, include(-1)])).toBe(false);
  expect.soft(opposed([...model.loadCases!, include(-1), { id: 4, includes: [{ caseId: 3, factor: 1 }, { caseId: 2, factor: 1 }] }])).toBe(true);
  expect.soft(opposed([...model.loadCases!, { id: 3, includes: [...include(1).includes, { caseId: 2, factor: -1 }] }])).toBe(false);
  expect.soft(opposed([...model.loadCases!, { id: 3, includes: [...include(1).includes, { caseId: 3, factor: 1 }] }])).toBe(false);
});
