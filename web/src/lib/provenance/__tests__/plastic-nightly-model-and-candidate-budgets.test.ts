import { describe, expect, it } from 'vitest';
import { assessProject } from '../applicability';
import { RESULT_CHANGES } from '../full-registry';
import { ANALYSIS_KINDS, type FeatureSnapshot } from '../model-features';
import { stampSolve, type SolveStamp } from '../solve-stamp';

const id = 'plastic-nightly-model-and-candidate-budgets';
const change = RESULT_CHANGES.changes.find((entry) => entry.id === id)!;
const stamp = (analyses: SolveStamp['analyses']): SolveStamp => ({
  ...stampSolve('linear', null),
  resultsVersion: change.resultsVersion - 1,
  analyses,
});
const notices = (snapshot: FeatureSnapshot, solvedWith: SolveStamp | null) =>
  assessProject(snapshot, solvedWith).changes.filter((entry) => entry.id === id).map((entry) => entry.id);

for (const analysisMode of ['2d', 'pro']) {
  describe(`#1957: plastic nightly notice in ${analysisMode}`, () => {
    const frame: FeatureSnapshot = {
      analysisMode,
      elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1 }]],
    };

    it.each(ANALYSIS_KINDS.filter((kind) => kind !== 'plastic'))('excludes a recorded %s solve without plastic results', (kind) => {
      expect(notices(frame, stamp([kind]))).toEqual([]);
    });

    it('excludes the older linear-only stamp that already recorded plastic runs', () => {
      const { recorded: _recorded, ...legacy } = stamp(['linear']);
      expect(notices(frame, legacy)).toEqual([]);
    });

    it.each(['truss', 'cable', 'shell-only'] as const)('excludes plastic stamps for %s models without frame members', (type) => {
      const snapshot: FeatureSnapshot = type === 'shell-only'
        ? { analysisMode, quads: [[1, {}]] }
        : { analysisMode, elements: [[1, { ...frame.elements![0][1], type }]] };
      expect(notices(snapshot, stamp(['plastic']))).toEqual([]);
    });

    it('includes plastic frames only before the correction version', () => {
      const older = stamp(['linear', 'plastic']);
      expect(notices(frame, older)).toEqual([id]);
      expect(notices(frame, { ...older, resultsVersion: change.resultsVersion })).toEqual([]);
      expect(notices(frame, { ...older, resultsVersion: change.resultsVersion + 1 })).toEqual([]);
    });

    it('keeps the notice for frames whose analysis history is unknown', () => {
      expect(notices(frame, null)).toEqual([id]);
      expect(notices(frame, { ...stamp([]), resultsVersion: 0 })).toEqual([id]);
    });
  });
}
