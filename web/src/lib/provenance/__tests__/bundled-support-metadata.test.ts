import { expect, it } from 'vitest';
import { assessProject } from '../applicability';
import type { FeatureSnapshot } from '../model-features';

it('#2277 bundled support recheck applies to space rollers and excludes plane or fixed models', () => {
  for (const mode of ['2d', 'edu', '3d', 'pro']) {
    for (const type of ['rollerX', 'rollerY', 'rollerZ', 'rollerXY', 'rollerXZ', 'rollerYZ', 'fixed', 'custom3d', 'unknown']) {
      const snapshot: FeatureSnapshot = { analysisMode: mode, supports: [[1, { nodeId: 1, type }]] };
      expect(assessProject(snapshot, null, mode).changes.some(c => c.id === 'bundled-support-metadata'), `${mode} ${type}`)
        .toBe((mode === '3d' || mode === 'pro') && type.startsWith('roller'));
    }
  }
});
