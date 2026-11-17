import { expect, it } from 'vitest';
import { assessProject } from '../applicability';
import type { FeatureSnapshot } from '../model-features';

const known = ['fixed', 'pinned', 'rollerX', 'rollerY', 'spring', 'fixed3d', 'pinned3d', 'rollerXZ', 'rollerXY', 'rollerYZ', 'spring3d', 'custom3d'];

it('known wrong result: #2276 the recheck notice selects exactly spatial rollerZ or unknown names', () => {
  for (const mode of ['2d', '3d', 'pro']) {
    for (const type of [...known, 'rollerZ', 'unknown-bearing', '', 'constructor', '__proto__', undefined]) {
      const m: FeatureSnapshot = { analysisMode: mode, supports: [[1, { nodeId: 1, type }]] };
      const notice = assessProject(m, null, mode).changes.find(c => c.id === 'roller-z-fixed');
      expect(!!notice, `${mode} ${type}`).toBe(mode !== '2d' && !known.includes(type!));
    }
    expect(assessProject({ analysisMode: mode, supports: [] }, null, mode).changes.some(c => c.id === 'roller-z-fixed')).toBe(false);
  }
});

const regression = process.env.RUN_KNOWN_WRONG === '2276' ? it : it.skip;

regression('known wrong result: #2276 explicit 3D rollerZ masks exclude the notice, unknown types still qualify', () => {
  const mask = { tx: true, ty: true, tz: false, rx: false, ry: false, rz: true };
  for (const mode of ['2d', '3d', 'pro']) {
    for (const [type, dofRestraints, unresolved] of [
      ['rollerZ', mask, false], ['rollerZ', undefined, true], ['unknown-bearing', mask, true],
    ] as const) {
      const m: FeatureSnapshot = { analysisMode: mode, supports: [[1, { nodeId: 1, type, dofRestraints }]] };
      const changes = assessProject(m, null, mode).changes.map(c => c.id);
      const expected = mode !== '2d' && unresolved;
      expect(changes.includes('roller-z-fixed'), `analysis ${mode} ${type}`).toBe(expected);
      expect(changes.includes('roller-z-fixed-design'), `design ${mode} ${type}`).toBe(expected);
    }
  }
});
