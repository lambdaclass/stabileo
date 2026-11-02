import { describe, it, expect } from 'vitest';
import { refinedPoints } from '../analysis';
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
