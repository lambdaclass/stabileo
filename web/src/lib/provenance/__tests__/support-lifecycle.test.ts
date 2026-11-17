import { expect, it } from 'vitest';
import { assessProject } from '../applicability';
import type { FeatureSnapshot } from '../model-features';

it('#2277 the lifecycle notice reaches space rollers and masked presets', () => {
  for (const mode of ['2d', '3d', 'pro'] as const) {
    const space = mode !== '2d';
    const hasNotice = (supports: FeatureSnapshot['supports']) =>
      assessProject({ analysisMode: mode, supports }, null, mode).changes.some(change => change.id === 'support-lifecycle');
    expect(hasNotice([[1, { nodeId: 1, type: 'rollerZ' }]])).toBe(space);
    expect(hasNotice([[1, { nodeId: 1, type: 'fixed3d', dofRestraints: { tx: true, ty: false, tz: true, rx: true, ry: true, rz: false } }]])).toBe(space);
    expect(hasNotice([[1, { nodeId: 1, type: 'fixed3d' }]])).toBe(false);
    expect(hasNotice([])).toBe(false);
  }
});
