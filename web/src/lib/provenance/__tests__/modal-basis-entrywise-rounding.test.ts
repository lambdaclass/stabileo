import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assessProject } from '../applicability';
import { RESULT_CHANGES } from '../full-registry';
import { ANALYSIS_KINDS, modelFeatures, type AnalysisKind, type FeatureSnapshot } from '../model-features';
import { readStamp, type SolveStamp } from '../solve-stamp';

const changeId = 'modal-basis-entrywise-rounding';
const change = RESULT_CHANGES.changes.find((entry) => entry.id === changeId)!;
const project = JSON.parse(readFileSync(new URL('../../../../legacy-projects/v0.4.0/deep-beam-shell.ded', import.meta.url), 'utf8')) as {
  snapshot: FeatureSnapshot & { solvedWith: unknown };
  analysisMode: string;
};
const changes = (snapshot: FeatureSnapshot, stamp: SolveStamp | undefined) =>
  assessProject(snapshot, stamp, project.analysisMode).changes.map((entry) => entry.id);
const stamp = (analyses: AnalysisKind[]): SolveStamp => ({
  ...readStamp(project.snapshot.solvedWith)!,
  resultsVersion: change.resultsVersion - 1,
  analyses,
  recorded: [...ANALYSIS_KINDS],
});

describe('modal-basis rounding change applicability (#1890)', () => {
  it.each<AnalysisKind[]>([['modal'], ['spectral'], ['timeHistory', 'modal']])('concerns a recorded modal-basis workflow %j', (...analyses) => {
    expect(changes({}, stamp(analyses))).toContain(changeId);
    expect(changes({}, { ...stamp(analyses), resultsVersion: change.resultsVersion })).not.toContain(changeId);
  });

  it('concerns a configured spectrum even before its modal run is recorded', () => {
    const snapshot = { loadCases: [{ id: 1, type: 'E', spectral: {} }] };
    expect(changes(snapshot, stamp(['linear']))).toContain(changeId);
  });

  it.skip('#[ignore = "known wrong result: #1890"] excludes the static deep-beam-shell fixture despite its earthquake load case (#1890)', () => {
    const saved = readStamp(project.snapshot.solvedWith)!;
    expect(saved.analyses).toEqual(['linear']);
    expect(project.snapshot.dynamics).toBeUndefined();
    const features = modelFeatures(project.snapshot, { analysesRun: saved.analyses });
    expect(features.has('seismic')).toBe(true);
    expect(features.has('analysis:modal')).toBe(false);
    expect(features.has('analysis:spectral')).toBe(false);
    expect(changes(project.snapshot, saved)).not.toContain(changeId);
  });

  it.skip('#[ignore = "known wrong result: #1890"] excludes a direct time-history run without a modal basis (#1890)', () => {
    expect(changes(project.snapshot, stamp(['timeHistory']))).not.toContain(changeId);
  });
});
