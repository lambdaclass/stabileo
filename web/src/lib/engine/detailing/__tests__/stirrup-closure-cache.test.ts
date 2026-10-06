import { describe, expect, it, vi } from 'vitest';
import {
  buildStirrupSet, buildColumnTieSet, StirrupClosureCache, type StirrupSetInput,
} from '../../../codes/cirsoc201/transverse-cage';

function input(): StirrupSetInput {
  return {
    elementId: 1, zoneId: 'z1', station: 0, b: 0.4, h: 0.5, cover: 0.025,
    stirrupDiaMm: 8, legs: 2, maxAggregateSizeMm: 19, hookOrientation: 'a',
    origin: { x: 0, y: 0, z: 0 }, axis: { x: 1, y: 0, z: 0 },
    across: { x: 0, y: -1, z: 0 }, up: { x: 0, y: 0, z: 1 },
    longitudinalBars: [
      { id: 'a', across: -0.15, up: -0.2, diameterMm: 20 },
      { id: 'b', across: 0.15, up: -0.2, diameterMm: 20 },
      { id: 'c', across: -0.15, up: 0.2, diameterMm: 20 },
      { id: 'd', across: 0.15, up: 0.2, diameterMm: 20 },
    ],
  };
}

describe('section-level stirrup closure cache', () => {
  it('reuses a decision across stations and identities, including candidate zero', () => {
    const cache = new StirrupClosureCache();
    const calculate = vi.fn(() => 0);
    const a = input();
    expect(cache.select(a, calculate)).toBe(0);
    const b = { ...a, station: 10, elementId: 7, zoneId: 'other', origin: { x: 1, y: 2, z: 3 },
      longitudinalBars: a.longitudinalBars.map(bar => ({ ...bar, id: `other:${bar.id}` })) };
    expect(cache.select(b, calculate)).toBe(0);
    expect(calculate).toHaveBeenCalledTimes(1);
    expect(new StirrupClosureCache().select(a, () => 3)).toBe(3);
  });

  it('invalidates for every closure input, without rounding coordinates', () => {
    const cache = new StirrupClosureCache();
    const calculate = vi.fn(() => 1);
    const a = input();
    cache.select(a, calculate);
    const variants: StirrupSetInput[] = [
      { ...a, b: a.b + 0.01 }, { ...a, h: a.h + 0.01 },
      { ...a, cover: a.cover + 0.001 }, { ...a, stirrupDiaMm: 10 },
      { ...a, hookOrientation: 'b' }, { ...a, longitudinalBars: a.longitudinalBars.slice(1) },
      ...['across', 'up', 'diameterMm'].map(key => ({ ...a,
        longitudinalBars: a.longitudinalBars.map((b, i) => i === 0
          ? { ...b, [key]: b[key as 'across' | 'up' | 'diameterMm'] + 1e-12 } : b),
      })),
    ];
    for (const v of variants) cache.select(v, calculate);
    expect(calculate).toHaveBeenCalledTimes(1 + variants.length);
    a.longitudinalBars[0].up += 0.1;
    cache.select(a, calculate);
    expect(calculate).toHaveBeenCalledTimes(2 + variants.length);
  });

  it('preserves signed zero and bypasses caching for non-finite inputs', () => {
    const cache = new StirrupClosureCache();
    const calculate = vi.fn(() => 2);
    const a = input();
    for (const value of [0, -0, NaN, NaN, Infinity, Infinity]) {
      cache.select({ ...a, longitudinalBars: [{ ...a.longitudinalBars[0], across: value }] }, calculate);
    }
    expect(calculate).toHaveBeenCalledTimes(6);
  });

  for (const build of [buildStirrupSet, buildColumnTieSet]) {
    it(`${build.name}: preserves geometry, containment, staggering and bar identities`, () => {
      const closureCache = new StirrupClosureCache();
      for (let shape = 0; shape < 12; shape++) for (const hookOrientation of ['a', 'b'] as const) {
        const base = input();
        // Congested/asymmetric cages exercise closure alternatives and changed bar sets.
        const longitudinalBars = [...base.longitudinalBars, ...Array.from({ length: shape }, (_, i) => ({
          id: `inner:${i}`, across: -0.14 + (i % 4) * 0.09,
          up: -0.18 + Math.floor(i / 4) * 0.17, diameterMm: 16 + (i % 3) * 4,
        }))];
        for (const station of [0, 0.15, 3]) {
          const args = { ...base, longitudinalBars, station, hookOrientation,
            zoneId: `shape:${shape}`, elementId: shape + 1, origin: { x: -2, y: 3, z: 7 } };
          expect(build({ ...args, closureCache })).toEqual(build(args));
        }
      }
      const a = build({ ...input(), closureCache });
      a.pieces[0].path.segments[0].start.x = 100;
      expect(build({ ...input(), closureCache })).toEqual(build(input()));
    });
  }
});
