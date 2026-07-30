/**
 * The joint-packing primitives.
 *
 * `packJoints` is NOT wired into the pipeline — measured on the flagship it made the
 * result worse, and that measurement is recorded in `run-detailing.ts` rather than hidden.
 * These tests cover the primitives that are correct, so that when the objective function
 * is fixed the geometry underneath it is already known-good.
 */
import { describe, it, expect } from 'vitest';
import { freeChannels, placeInChannels } from '../joint-packing';

describe('freeChannels', () => {
  it('returns the whole width when nothing obstructs it', () => {
    expect(freeChannels(0.15, [])).toEqual([{ centre: 0, width: 0.30 }]);
  });

  it('splits the width around a central obstacle', () => {
    const ch = freeChannels(0.15, [{ at: 0, halfKeepOut: 0.03 }]);
    expect(ch).toHaveLength(2);
    expect(ch[0].width).toBeCloseTo(0.12, 9);
    expect(ch[1].width).toBeCloseTo(0.12, 9);
    expect(ch[0].centre).toBeCloseTo(-0.09, 9);
    expect(ch[1].centre).toBeCloseTo(0.09, 9);
  });

  it('merges overlapping keep-outs into one obstacle', () => {
    // Two column bars close together block one band, not two with a sliver between.
    const ch = freeChannels(0.20, [
      { at: -0.01, halfKeepOut: 0.03 },
      { at: 0.01, halfKeepOut: 0.03 },
    ]);
    expect(ch).toHaveLength(2);
    expect(ch[0].width + ch[1].width).toBeCloseTo(0.40 - 0.08, 9);
  });

  it('returns nothing when the obstacles cover the width', () => {
    expect(freeChannels(0.05, [{ at: 0, halfKeepOut: 0.10 }])).toEqual([]);
  });

  it('is independent of the order the obstacles arrive in', () => {
    const a = freeChannels(0.20, [
      { at: -0.12, halfKeepOut: 0.02 }, { at: 0.05, halfKeepOut: 0.02 },
    ]);
    const b = freeChannels(0.20, [
      { at: 0.05, halfKeepOut: 0.02 }, { at: -0.12, halfKeepOut: 0.02 },
    ]);
    expect(a).toEqual(b);
  });
});

describe('placeInChannels', () => {
  const CH = [{ centre: -0.09, width: 0.12 }, { centre: 0.09, width: 0.12 }];

  it('places nothing for a count of zero', () => {
    expect(placeInChannels(CH, 0, 20, 0.025)).toEqual([]);
  });

  it('spreads bars at the code pitch inside a channel', () => {
    const p = placeInChannels([{ centre: 0, width: 0.30 }], 3, 20, 0.025)!;
    expect(p).toHaveLength(3);
    for (let i = 1; i < p.length; i++) {
      // Clear distance between surfaces is at least the requirement.
      expect(p[i] - p[i - 1] - 0.020).toBeGreaterThanOrEqual(0.025 - 1e-9);
    }
  });

  it('keeps every bar inside the channel it was given', () => {
    const p = placeInChannels(CH, 4, 20, 0.025)!;
    for (const x of p) {
      const inA = Math.abs(x - CH[0].centre) <= CH[0].width / 2 + 1e-9;
      const inB = Math.abs(x - CH[1].centre) <= CH[1].width / 2 + 1e-9;
      expect(inA || inB, `${x} escaped both channels`).toBe(true);
    }
  });

  it('refuses rather than overfilling when the channels cannot hold them', () => {
    // Ten Ø32 bars will not pass two 120 mm channels at 40 mm clear.
    expect(placeInChannels(CH, 10, 32, 0.040)).toBeNull();
  });

  it('is deterministic under channel reordering', () => {
    const a = placeInChannels(CH, 4, 20, 0.025);
    const b = placeInChannels([...CH].reverse(), 4, 20, 0.025);
    expect(a).toEqual(b);
  });

  it('returns positions in ascending order, so bar i is always the i-th from one side', () => {
    const p = placeInChannels(CH, 4, 16, 0.025)!;
    expect([...p].sort((x, y) => x - y)).toEqual(p);
  });
});
