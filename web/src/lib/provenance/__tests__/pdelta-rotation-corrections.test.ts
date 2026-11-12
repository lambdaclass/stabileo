import { describe, expect, it } from 'vitest';
import { assessProject } from '../applicability';
import { RESULT_CHANGES } from '../full-registry';
import type { FeatureSnapshot } from '../model-features';
import type { SolveStamp } from '../solve-stamp';

const id = 'pdelta-rotation-corrections';
const version = RESULT_CHANGES.changes.find(change => change.id === id)!.resultsVersion;
const changes = (model: FeatureSnapshot, analyses: string[], resultsVersion = version - 1) =>
  assessProject(model, { resultsVersion, analyses } as unknown as SolveStamp, model.analysisMode).changes.map(change => change.id);

describe('P-Delta residual corrections #1940', () => {
  it('marks P-Delta results for frames and shells', () => {
    const models: FeatureSnapshot[] = [
      { analysisMode: '2d', elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1 }]] },
      { analysisMode: 'pro', elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1 }]] },
      { analysisMode: 'pro', elements: [], plates: [[1, { id: 1 }]] },
      { analysisMode: 'pro', elements: [], quads: [[1, { id: 1 }]] },
    ];
    for (const model of models) {
      expect(changes(model, ['linear', 'pdelta'])).toContain(id);
      expect(changes(model, ['linear'])).not.toContain(id);
      expect(changes(model, ['buckling'])).not.toContain(id);
      expect(changes(model, ['corotational'])).not.toContain(id);
      expect(changes(model, ['pdelta'], version)).not.toContain(id);
    }
  });
});
