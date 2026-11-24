import { describe, expect, it } from 'vitest';
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
  it.skip('known wrong result: #2459 — registers only the refusal for conflicting model aliases', () => {
    const id = 'canonical-model-aliases';
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
      expect(registered(snapshot, '2d')?.quantities).toEqual(['solve.ok']);
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
    expect(registered(conflicts[0]!, '3d')?.quantities).toEqual(['solve.ok']);
    expect(registered({
      loads: [{ type: 'nodal3d', data: { fy: 1, fz: 2, my: 3, mz: 4 } }],
      supports: [[1, { nodeId: 1, type: 'fixed3d', dz: 1, dy: 2, dry: 3, drz: 4 }]],
    }, '3d')).toBeUndefined();
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
