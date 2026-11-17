import { expect, it } from 'vitest';
import { assessProject } from '../applicability';
import type { FeatureSnapshot } from '../model-features';

const regression = process.env.RUN_KNOWN_WRONG === '2276' ? it : it.skip;
const known = ['fixed', 'pinned', 'rollerX', 'rollerY', 'spring', 'fixed3d', 'pinned3d', 'rollerXZ', 'rollerXY', 'rollerYZ', 'spring3d', 'custom3d'];

regression('known wrong result: #2276 the recheck notice selects exactly spatial rollerZ or unknown names', () => {
  for (const mode of ['2d', '3d', 'pro']) {
    for (const type of [...known, 'rollerZ', 'unknown-bearing', '', 'constructor', '__proto__', undefined]) {
      const m: FeatureSnapshot = { analysisMode: mode, supports: [[1, { nodeId: 1, type }]] };
      const notice = assessProject(m, null, mode).changes.find(c => c.id === 'roller-z-fixed');
      expect(!!notice, `${mode} ${type}`).toBe(mode !== '2d' && !known.includes(type!));
    }
    expect(assessProject({ analysisMode: mode, supports: [] }, null, mode).changes.some(c => c.id === 'roller-z-fixed')).toBe(false);
  }
});
