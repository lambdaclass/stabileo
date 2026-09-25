import { describe, it, expect } from 'vitest';
import { isHinged, releaseAfterEdit } from '../end-release';

describe('the element editor keeps an end release it was not asked to change', () => {
  const myOnly = { my: true, mz: false, t: false };
  const mzOnly = { my: false, mz: true, t: false };

  it('a 3D end releasing only My reads as hinged', () => {
    expect(isHinged(myOnly, true)).toBe(true);
    expect(isHinged(myOnly, false)).toBe(false);
  });

  it('saving with the toggle untouched keeps the per-axis flags', () => {
    expect(releaseAfterEdit(myOnly, isHinged(myOnly, true), true)).toEqual(myOnly);
    expect(releaseAfterEdit(mzOnly, isHinged(mzOnly, true), true)).toEqual(mzOnly);
  });

  it('toggling the hinge sets or clears both bending moments in 3D, Mz only in 2D', () => {
    expect(releaseAfterEdit(myOnly, false, true)).toEqual({ my: false, mz: false, t: false });
    expect(releaseAfterEdit(undefined, true, true)).toMatchObject({ my: true, mz: true });
    expect(releaseAfterEdit(undefined, true, false)).toMatchObject({ my: false, mz: true });
  });
});
