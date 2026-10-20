/**
 * The demand shifted by d (§9.7.3.3): at each point the largest of what the curve asks within d
 * of it, so a bar's run past the point where it stops being needed reads off the diagram.
 */
import { describe, it, expect } from 'vitest';
import { shiftedDemand, type DemandPoint } from '../beam-line-demand';

/** A triangle of sagging moment peaking at 2 m (100 kN·m), zero at 0 and 4 m, sampled every metre; d = 0,45 m. */
const tri: DemandPoint[] = [0, 1, 2, 3, 4].map((x) => ({ x, mPos: 100 - 50 * Math.abs(x - 2), mNeg: 0, asBottom: 10 - 5 * Math.abs(x - 2), asTop: 0, d: 0.45 }));
const atX = (pts: DemandPoint[], x: number) => pts.find((p) => Math.abs(p.x - x) < 1e-9)!;

describe('the moment demand shifted by d', () => {
  it('carries each value d outward, interpolated between stations', () => {
    const s = shiftedDemand(tri);
    // At 1 m the shifted curve reads the plain one at 1,45 m: 100 − 50·0,55 = 72,5.
    expect(atX(s, 1).mPos).toBeCloseTo(72.5, 6);
    // The peak holds over 2 ± 0,45 m.
    expect(atX(s, 1.55).mPos).toBeCloseTo(100, 6);
    expect(atX(s, 2.45).mPos).toBeCloseTo(100, 6);
    // Where the plain curve is zero (at the support) the shifted one already asks 22,5.
    expect(atX(s, 0).mPos).toBeCloseTo(22.5, 6);
    expect(atX(s, 0).asBottom).toBeCloseTo(2.25, 6);
  });

  it('never asks less than the plain curve', () => {
    const s = shiftedDemand(tri);
    for (const p of tri) expect(atX(s, p.x).mPos).toBeGreaterThanOrEqual(p.mPos - 1e-9);
  });
});

describe('the stirrups a line gives', () => {
  it('reads Av/s of all legs from the zone that covers the point', async () => {
    const { transverseAt } = await import('../beam-line-demand');
    // eØ8, two legs, every 0,15 m: 2 · 0,503 / 0,15 = 6,70 cm²/m.
    const zones = [{ id: 'z1', from: 0, to: 1, diameter: 8, legs: 2, spacing: 0.15 }, { id: 'z2', from: 1, to: 4, diameter: 8, legs: 2, spacing: 0.2 }];
    expect(transverseAt(zones as never, 0.5)).toBeCloseTo((2 * Math.PI * 0.16) / 0.15, 6);
    expect(transverseAt(zones as never, 2)).toBeCloseTo((2 * Math.PI * 0.16) / 0.2, 6);
    expect(transverseAt(zones as never, 5)).toBe(0);
  });
});
