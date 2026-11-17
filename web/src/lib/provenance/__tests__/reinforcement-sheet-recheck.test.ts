import { describe, expect, it } from 'vitest';
import { defaultDesignData } from '../../model/design-data';
import { assessProject } from '../applicability';
import type { FeatureSnapshot } from '../model-features';
import { stampSolve } from '../solve-stamp';

const frame: FeatureSnapshot = {
  materials: [[1, { id: 1, name: 'H30', e: 25000, fy: 30 }]],
  elements: [[1, { id: 1, type: 'frame', nodeI: 1, nodeJ: 2, materialId: 1 }]],
};

describe.each(['2d', '3d', 'pro'])('opening an older concrete frame in %s', mode => {
  describe.each(['linear', 'pdelta'] as const)('saved after %s analysis', analysis => {
    it.each([false, true])('known wrong result: #2279 sheet output adds no design notice (saved sheets: %s)', savedSheets => {
      const snapshot = savedSheets
        ? { ...frame, designData: { ...defaultDesignData(), rcSheets: { version: 1, adopted: {} } } }
        : frame;
      const stamp = { ...stampSolve(analysis, null), resultsVersion: 30 };
      const { changes } = assessProject(snapshot, stamp, mode);
      expect(changes.map(change => change.id)).toContain('provided-torsion-stirrups');
      expect(changes.filter(change => change.prs.includes(2279)).map(change => change.id)).toEqual([]);
    });
  });
});
