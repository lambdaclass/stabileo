import { expect, it } from 'vitest';
import { assessProject } from '../applicability';
import type { FeatureSnapshot } from '../model-features';

it('#2277 the creation recheck notice covers rollers only in space workspaces', () => {
  const rollers = ['rollerX', 'rollerY', 'rollerZ', 'rollerXY', 'rollerXZ', 'rollerYZ'];
  for (const mode of ['2d', 'edu', '3d', 'pro']) {
    for (const type of [...rollers, 'fixed', 'fixed3d', 'pinned3d', 'spring3d', 'custom3d', 'unknown', 'roller-unknown', undefined]) {
      const m: FeatureSnapshot = { analysisMode: mode, supports: [[1, { nodeId: 1, type }]] };
      const changes = assessProject(m, null, mode).changes;
      expect(changes.some(c => c.id === 'roller-creation-3d'), `${mode} ${type}`)
        .toBe((mode === '3d' || mode === 'pro') && rollers.includes(type!));
    }
    expect(assessProject({ analysisMode: mode, supports: [] }, null, mode).changes.some(c => c.id === 'roller-creation-3d')).toBe(false);
  }
});
