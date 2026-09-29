/**
 * An inclined support and back: the normal frees the translations it carries, and removing it
 * gives them back, so the node is held again rather than left free.
 */
import { describe, it, expect } from 'vitest';
import { inclinePatch } from '../support-incline';

describe('inclined support editing', () => {
  it.each(['pinned3d', 'fixed3d'] as const)('removing the incline of a %s support restores its translations', (type) => {
    const on = inclinePatch({ type }, [0, 0, 1]);
    expect(on).toMatchObject({ type: 'custom3d', isInclined: true, dofRestraints: { tx: false, ty: false, tz: false } });
    const off = inclinePatch({ type: 'custom3d', dofRestraints: on.dofRestraints, isInclined: true }, null);
    expect(off.dofRestraints).toEqual({ ...on.dofRestraints, tx: true, ty: true, tz: true });
    expect(off).toMatchObject({ isInclined: undefined, normalX: undefined, normalY: undefined, normalZ: undefined });
  });

  it('a zero normal is a removal, and a support that was never inclined is left as it is', () => {
    expect(inclinePatch({ type: 'pinned3d' }, [0, 0, 0])).toEqual({});
  });
});
