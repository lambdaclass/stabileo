import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { appHref, decode2D, decode3D, DEFAULT_2D, DEFAULT_3D, encodeState, readAppLink, TOOL_PATH, UNITS, type Mohr2DState, type Mohr3DState } from '../state';
import { principalPlane } from '../plane';
import { invariants3 } from '../space';

function openTool(kind: 'plane', state: Mohr2DState): Mohr2DState;
function openTool(kind: 'space', state: Mohr3DState): Mohr3DState;
function openTool(kind: 'plane' | 'space', state: Mohr2DState | Mohr3DState) {
  const url = new URL(`${TOOL_PATH[kind]}?${encodeState(kind, state)}`, 'https://stabileo.test');
  return kind === 'plane' ? decode2D(url.searchParams) : decode3D(url.searchParams);
}

describe('lossless Mohr share links', () => {
  it.each(UNITS)('preserves nearly hydrostatic stresses and nonzero invariants in %s', unit => {
    const state: Mohr3DState = { ...DEFAULT_3D, unit, s: { xx: 1e9, yy: 1e9 - 0.01, zz: 1e9 - 0.02, xy: 0, yz: 0, xz: 0 } };
    const before = invariants3(state.s);
    expect(before.vonMises).toBeGreaterThan(0);
    expect(before.tauMax).toBeGreaterThan(0);
    const app = readAppLink(new URL(appHref('space', state), 'https://stabileo.test').searchParams);
    expect(app?.kind).toBe('space');
    if (app?.kind !== 'space') throw new Error('Missing spatial application link');
    for (const restored of [openTool('space', state), app.state]) {
      expect(restored).toEqual(state);
      expect(invariants3(restored.s)).toEqual(before);
    }
  });

  it.each(UNITS)('preserves close plane stresses, small shear and angles in %s', unit => {
    const state: Mohr2DState = { sx: 1e9, sy: 1e9 - 0.01, txy: 0.000000000123456789, theta: 37.12345678912345, unit, tauDown: true };
    const before = principalPlane(state);
    expect(before.tauMax).toBeGreaterThan(0);
    const app = readAppLink(new URL(appHref('plane', state), 'https://stabileo.test').searchParams);
    expect(app?.kind).toBe('plane');
    if (app?.kind !== 'plane') throw new Error('Missing planar application link');
    for (const restored of [openTool('plane', state), app.state]) {
      expect(restored).toEqual(state);
      expect(principalPlane(restored)).toEqual(before);
    }
  });

  it('recovers finite stresses and angles exactly across their accepted domains', () => {
    const stress = fc.double({ min: -1e9, max: 1e9, noNaN: true, noDefaultInfinity: true }).filter(v => !Object.is(v, -0));
    const azimuth = fc.double({ min: -180, max: 180, noNaN: true, noDefaultInfinity: true }).filter(v => !Object.is(v, -0));
    const polar = fc.double({ min: 0, max: 180, noNaN: true, noDefaultInfinity: true }).filter(v => !Object.is(v, -0));
    fc.assert(fc.property(fc.tuple(stress, stress, stress, stress, stress, stress), azimuth, polar, (values, phi, theta) => {
      const [xx, yy, zz, xy, yz, xz] = values;
      const plane = { ...DEFAULT_2D, sx: xx, sy: yy, txy: xy, theta: phi };
      const space = { ...DEFAULT_3D, s: { xx, yy, zz, xy, yz, xz }, phi, theta };
      expect(openTool('plane', plane)).toEqual(plane);
      expect(openTool('space', space)).toEqual(space);
      expect(readAppLink(new URL(appHref('plane', plane), 'https://stabileo.test').searchParams)).toEqual({ kind: 'plane', state: plane });
      expect(readAppLink(new URL(appHref('space', space), 'https://stabileo.test').searchParams)).toEqual({ kind: 'space', state: space });
    }), { seed: 2099, numRuns: 100 });
  });
});

describe('Mohr link controls and unchanged limits', () => {
  it.each([-1e9, -1e9 + 0.01, 0, 1e9 - 0.01, 1e9])('keeps accepted stress %s', value => {
    const plane = { ...DEFAULT_2D, sx: value, sy: value, txy: value };
    const space = { ...DEFAULT_3D, s: { xx: value, yy: value, zz: value, xy: value, yz: value, xz: value } };
    expect(openTool('plane', plane)).toEqual(plane);
    expect(openTool('space', space)).toEqual(space);
  });

  it.each([-1e9 - 0.01, 1e9 + 0.01])('retains the planar clamp and spatial refusal outside the limit at %s', value => {
    expect(decode2D(new URLSearchParams({ sx: String(value), v: '2' })).sx).toBe(Math.sign(value) * 1e9);
    expect(decode3D(new URLSearchParams({ s: `${value},0,0,0,0,0`, v: '2' })).s).toEqual(DEFAULT_3D.s);
  });

  it('keeps ordinary and truly hydrostatic answers', () => {
    expect(openTool('plane', DEFAULT_2D)).toEqual(DEFAULT_2D);
    expect(openTool('space', DEFAULT_3D)).toEqual(DEFAULT_3D);
    const hydrostatic = { ...DEFAULT_3D, s: { xx: 1e9, yy: 1e9, zz: 1e9, xy: 0, yz: 0, xz: 0 } };
    const result = invariants3(openTool('space', hydrostatic).s);
    expect(result.vonMises).toBe(0);
    expect(result.tauMax).toBe(0);
  });
});
