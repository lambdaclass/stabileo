import { expect, it } from 'vitest';
import { assessProject } from '../applicability';
import { RESULT_CHANGES } from '../full-registry';
import sourceEntry from '../result-changes/buckling-component-round-off.json';
import { ANALYSIS_KINDS, modelFeatures, type AnalysisKind, type FeatureSnapshot } from '../model-features';
import type { SolveStamp } from '../solve-stamp';

const id = 'buckling-component-round-off';
const entry = RESULT_CHANGES.changes.find((change) => change.id === id)!;
const model = (mode: string, constrained: boolean): FeatureSnapshot => ({
  analysisMode: mode,
  elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1, sectionId: 1 }],
    [2, { id: 2, type: 'frame', nodeI: 3, nodeJ: 1, materialId: 1, sectionId: 2 }]],
  constraints: constrained ? [{ type: 'equalDOF', masterNode: 1, slaveNode: 2, dofs: [0] }] : [],
});
const stamp = (analyses: AnalysisKind[], version = entry.resultsVersion - 1): SolveStamp => ({
  id: 'buckling-component-review', resultsSchemaVersion: 1, appVersion: 'test', engineVersion: 'test',
  commit: 'test', wasmHash: 'test', solvedAt: '2026-11-11T00:00:00Z',
  resultsVersion: version, analyses, recorded: [...ANALYSIS_KINDS],
});
const changes = (snapshot: FeatureSnapshot, solvedWith?: SolveStamp) =>
  assessProject(snapshot, solvedWith).changes.map((change) => change.id);

it.each(['2d', '3d'])('notifies unconstrained member buckling in %s, including shared free warping (#1756)', (mode) => {
  const snapshot = model(mode, false);
  expect(modelFeatures(snapshot).has('constraints')).toBe(false);
  expect(changes(snapshot, stamp(['buckling']))).toContain(id);
  expect(changes(snapshot)).toContain(id);
});

it.each(['2d', '3d'])('notifies constrained buckling in %s and excludes recorded other analyses and current results', (mode) => {
  const snapshot = model(mode, true);
  expect(changes(snapshot, stamp(['buckling']))).toContain(id);
  expect(changes(snapshot, stamp(['buckling'], entry.resultsVersion))).not.toContain(id);
  for (const analysis of ANALYSIS_KINDS.filter((kind) => kind !== 'buckling' && kind !== 'pdelta')) {
    expect(changes(snapshot, stamp([analysis])), analysis).not.toContain(id);
  }
  expect(changes({ ...snapshot, elements: [] }, stamp(['buckling']))).not.toContain(id);
});

it.each(['2d', '3d'])('notifies saved P-Delta and mixed linear/P-Delta results in %s (#1947)', (mode) => {
  for (const constrained of [false, true]) {
    const snapshot = model(mode, constrained);
    for (const analyses of [['pdelta'], ['linear', 'pdelta']] as AnalysisKind[][]) {
      expect(modelFeatures(snapshot, { analysesRun: analyses, analysesRecorded: [...ANALYSIS_KINDS] }).has('analysis:buckling')).toBe(false);
      expect(changes(snapshot, stamp(analyses))).toContain(id);
      expect(changes(snapshot, stamp(analyses, entry.resultsVersion))).not.toContain(id);
      expect(changes({ ...snapshot, elements: [] }, stamp(analyses))).not.toContain(id);
    }
  }
  expect(sourceEntry.quantities).toEqual(expect.arrayContaining(['b2Factor', 'isStable', 'secondOrder']));
});
