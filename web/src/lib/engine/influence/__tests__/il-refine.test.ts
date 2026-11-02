import { describe, it, expect } from 'vitest';
import { refinedPoints } from '../analysis';
import { ilAreas } from '../areas';
import type { IlPoint } from '../unit-sweep';

const right = (t: number) => 1 - t;
const pt = (t: number, value: number, side?: 'left' | 'right'): IlPoint => ({ x: t, y: 0, elementId: 1, t, value, ...(side ? { side } : {}) });
const line = (left: (t: number) => number) => {
  const pts = [pt(0.3, left(0.3)), pt(0.4, left(0.4)), pt(0.5, left(0.5), 'left'), pt(0.5, right(0.5), 'right'), pt(0.6, right(0.6))];
  return refinedPoints(pts, (_, t) => (t < 0.5 ? left(t) : right(t)), () => true);
};

describe('refining a line up to a jump at its target', () => {
  it('finds the zero of the branch between the last sample and the jump', () => {
    const out = line((t) => 0.45 - t);
    const zeros = out.filter((p) => p.value === 0 && p.t > 0.4 && p.t < 0.5).map((p) => p.t);
    expect(zeros).toHaveLength(1);
    expect(zeros[0]).toBeCloseTo(0.45, 6);
    expect(out.filter((p) => p.side).map((p) => [p.side, p.value])).toEqual([['left', 0.45 - 0.5], ['right', 0.5]]);
  });

  it('finds the peak of the branch next to the target', () => {
    const left = (t: number) => -((t - 0.43) ** 2);
    const peak = line(left).find((p) => p.t > 0.4 && p.t < 0.5 && !p.side);
    expect(peak?.t).toBeCloseTo(0.43, 5);
    expect(peak!.value).toBeCloseTo(0, 9);
  });

  it('finds a peak between the last sample and the jump, with the branch still rising at the sample', () => {
    const left = (t: number) => -((t - 0.48) ** 2);
    const peak = line(left).find((p) => p.t > 0.4 && p.t < 0.5 && !p.side);
    expect(peak?.t).toBeCloseTo(0.48, 5);
    expect(peak!.value).toBeCloseTo(0, 9);
  });
});

describe('a narrow pocket of the other sign that only peak refinement finds', () => {
  const f = (t: number) => (t - 0.431) * (t - 0.439);
  const exactArea = (t0: number, t1: number) => {
    const F = (t: number) => t ** 3 / 3 - (0.431 + 0.439) * t ** 2 / 2 + 0.431 * 0.439 * t;
    return F(t1) - F(t0);
  };
  const out = refinedPoints([0.4, 0.44, 0.48].map((t) => pt(t, f(t))), (_, t) => f(t), () => true);

  it('gets both of its roots once the peak is in', () => {
    const zeros = out.filter((p) => p.value === 0).map((p) => p.t);
    expect(zeros).toHaveLength(2);
    expect(zeros[0]).toBeCloseTo(0.431, 8);
    expect(zeros[1]).toBeCloseTo(0.439, 8);
  });

  it('gives the negative zone and its area of the optimal loading, the pocket alone', () => {
    const a = ilAreas(out, () => 1, () => true, (z) => exactArea(z.t0, z.t1));
    expect(a.negZones).toHaveLength(1);
    expect(a.negZones[0].t0).toBeCloseTo(0.431, 8);
    expect(a.negZones[0].t1).toBeCloseTo(0.439, 8);
    expect(a.neg / -(0.008 ** 3 / 6)).toBeCloseTo(1, 6);
  });
});

describe('two stationary points of a cubic branch inside one sampling interval', () => {
  const f = (t: number) => 1000 * (t - 0.431) * (t - 0.435) * (t - 0.439);
  const pts = [0, 0.4, 0.44, 0.48, 1].map((t) => pt(t, f(t)));

  it('the samples rise throughout, yet all three zeros and both peaks are found', () => {
    for (let k = 1; k < pts.length; k++) expect(pts[k].value).toBeGreaterThan(pts[k - 1].value);
    const out = refinedPoints(pts, (_, t) => f(t), () => true);
    const zeros = out.filter((p) => p.value === 0).map((p) => p.t).sort();
    expect(zeros).toHaveLength(3);
    [0.431, 0.435, 0.439].forEach((z, i) => expect(zeros[i]).toBeCloseTo(z, 8));
    const d = Math.sqrt(((0.004) ** 2) / 3);
    const top = out.find((p) => Math.abs(p.t - (0.435 - d)) < 1e-9), bottom = out.find((p) => Math.abs(p.t - (0.435 + d)) < 1e-9);
    expect(top!.value).toBeCloseTo(f(0.435 - d), 15);
    expect(bottom!.value).toBeCloseTo(f(0.435 + d), 15);
    expect(top!.value).toBeGreaterThan(0);
    expect(bottom!.value).toBeLessThan(0);
  });
});
