import { describe, expect, it } from 'vitest';
import { assessProject } from '../applicability';
import { RESULT_CHANGES } from '../full-registry';
import type { FeatureSnapshot } from '../model-features';
import type { SolveStamp } from '../solve-stamp';

const id = 'pdelta-axial-strain';
const version = RESULT_CHANGES.changes.find(change => change.id === id)!.resultsVersion;
const frame = (analysisMode: '2d' | 'pro'): FeatureSnapshot => ({
  analysisMode,
  elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1 }]],
});
const changes = (model: FeatureSnapshot, analyses: string[], resultsVersion = version - 1) =>
  assessProject(model, { resultsVersion, analyses } as unknown as SolveStamp, model.analysisMode).changes.map(change => change.id);

describe('P-Delta axial strain recheck #1940', () => {
  it('marks member P-Delta results in both dimensions', () => {
    for (const mode of ['2d', 'pro'] as const) {
      expect(changes(frame(mode), ['linear', 'pdelta'])).toContain(id);
    }
  });

  it('preserves complete linear histories and corrected histories', () => {
    for (const mode of ['2d', 'pro'] as const) {
      expect(changes(frame(mode), ['linear'])).not.toContain(id);
      expect(changes(frame(mode), ['linear', 'buckling'])).not.toContain(id);
      expect(changes(frame(mode), ['linear', 'pdelta', 'buckling'], version)).not.toContain(id);
    }
  });

  it('requires members as well as the affected analysis', () => {
    const empty: FeatureSnapshot = { analysisMode: 'pro', elements: [] };
    expect(changes(empty, ['pdelta', 'buckling'])).not.toContain(id);
  });
});
