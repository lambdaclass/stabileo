import { describe, it, expect } from 'vitest';
import {
  HINGE_3D_RELEASED_AXIS,
  mapGenericHingeToReleases3D,
} from '../hinge-3d-bridge';

describe('hinge-3d-bridge', () => {
  it('exports the canonical released-axis constant', () => {
    expect(HINGE_3D_RELEASED_AXIS).toBe('Mz');
  });

  it('maps "no hinges" to all-false per-axis flags', () => {
    expect(mapGenericHingeToReleases3D(false, false)).toEqual({
      releaseMyStart: false, releaseMyEnd: false,
      releaseMzStart: false, releaseMzEnd: false,
      releaseTStart: false, releaseTEnd: false,
    });
  });

  it('maps hingeStart=true, hingeEnd=false to Mz-start only', () => {
    expect(mapGenericHingeToReleases3D(true, false)).toEqual({
      releaseMyStart: false, releaseMyEnd: false,
      releaseMzStart: true,  releaseMzEnd: false,
      releaseTStart: false, releaseTEnd: false,
    });
  });

  it('maps hingeStart=false, hingeEnd=true to Mz-end only', () => {
    expect(mapGenericHingeToReleases3D(false, true)).toEqual({
      releaseMyStart: false, releaseMyEnd: false,
      releaseMzStart: false, releaseMzEnd: true,
      releaseTStart: false, releaseTEnd: false,
    });
  });

  it('maps both hinges to Mz-both — never releases My or torsion (Bug B contract)', () => {
    const r = mapGenericHingeToReleases3D(true, true);
    expect(r.releaseMyStart).toBe(false);
    expect(r.releaseMyEnd).toBe(false);
    expect(r.releaseTStart).toBe(false);
    expect(r.releaseTEnd).toBe(false);
    expect(r.releaseMzStart).toBe(true);
    expect(r.releaseMzEnd).toBe(true);
  });
});
