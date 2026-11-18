import { expect, it } from 'vitest';
import { assessProject } from '../applicability';
import type { FeatureSnapshot } from '../model-features';

const mask = { tx: true, ty: true, tz: false, rx: false, ry: false, rz: true };
const known = ['fixed', 'pinned', 'rollerX', 'rollerY', 'spring', 'fixed3d', 'pinned3d', 'rollerXZ', 'rollerXY', 'rollerYZ', 'spring3d', 'custom3d'];

it('known wrong result: #2276 the recheck notice selects exactly spatial rollerZ or unknown names', () => {
  for (const mode of ['2d', '3d', 'pro']) {
    for (const type of [...known, 'rollerZ', 'unknown-bearing', '', 'constructor', '__proto__', undefined]) {
      const m: FeatureSnapshot = { analysisMode: mode, supports: [[1, { nodeId: 1, type, dofRestraints: type === 'custom3d' ? mask : undefined }]] };
      const notice = assessProject(m, null, mode).changes.find(c => c.id === 'roller-z-fixed');
      expect(!!notice, `${mode} ${type}`).toBe(mode !== '2d' && !known.includes(type!));
    }
    expect(assessProject({ analysisMode: mode, supports: [] }, null, mode).changes.some(c => c.id === 'roller-z-fixed')).toBe(false);
  }
});

it('#2276 explicit 3D rollerZ masks exclude the notice, unknown types still qualify', () => {
  for (const mode of ['2d', '3d', 'pro']) {
    for (const [type, dofRestraints, unresolved] of [
      ['rollerZ', mask, false], ['rollerZ', undefined, true], ['unknown-bearing', mask, true],
    ] as const) {
      const m: FeatureSnapshot = { analysisMode: mode, supports: [[1, { nodeId: 1, type, dofRestraints }]] };
      const changes = assessProject(m, null, mode).changes.map(c => c.id);
      const expected = mode !== '2d' && unresolved;
      expect(changes.includes('roller-z-fixed'), `analysis ${mode} ${type}`).toBe(expected);
      expect(changes.includes('roller-z-fixed-design'), `design ${mode} ${type}`).toBe(expected);
      expect(changes.includes('plane-roller-transforms'), `plane edit ${mode} ${type}`)
        .toBe(mode === '2d' && type === 'rollerZ');
    }
  }
});

it('#2276 only unmasked spatial custom supports need rechecking', () => {
  for (const mode of ['2d', '3d', 'pro']) {
    for (const dofRestraints of [undefined, mask]) {
      const model: FeatureSnapshot = { analysisMode: mode, supports: [[1, { nodeId: 1, type: 'custom3d', dofRestraints }]] };
      const changes = assessProject(model, null, mode).changes.map(c => c.id);
      const expected = mode !== '2d' && dofRestraints === undefined;
      expect(changes.includes('roller-z-fixed'), `analysis ${mode}`).toBe(expected);
      expect(changes.includes('roller-z-fixed-design'), `design ${mode}`).toBe(expected);
    }
  }
});

it('#2277 the settlement recheck selects plane models with settlement on the masked support', () => {
  const notice = 'plane-masked-support-settlements';
  for (const mode of ['2d', '3d', 'pro']) {
    for (const fields of [{ dy: 0.001 }, { drz: 0.002 }, { dx: -0.001 }]) {
      const model: FeatureSnapshot = {
        analysisMode: mode,
        supports: [[1, { nodeId: 1, type: 'rollerX', dofRestraints: mask, ...fields }]],
      };
      expect(assessProject(model, null, mode).changes.some(c => c.id === notice)).toBe(mode === '2d');
    }
  }
  const separate: FeatureSnapshot = {
    analysisMode: '2d',
    supports: [
      [1, { nodeId: 1, type: 'rollerX', dofRestraints: mask }],
      [2, { nodeId: 2, type: 'fixed', dx: 0.001 }],
    ],
  };
  expect(assessProject(separate, null, '2d').changes.some(c => c.id === notice)).toBe(false);
});
