import { describe, it, expect } from 'vitest';
import { pickLoadAt } from '../load-pick';

// Screen = world x, y for these cases.
const flat = (x: number, y: number) => ({ x, y });
const seg = (ax: number, ay: number, bx: number, by: number) => [ax, ay, 0, bx, by, 0];

describe('pickLoadAt', () => {
  it('takes the load whose drawn segments are nearest, within the tolerance', () => {
    const fp = new Map([[1, seg(0, 0, 0, 50)], [2, seg(30, 0, 30, 50)]]);
    expect(pickLoadAt(4, 20, fp, flat)).toBe(1);
    expect(pickLoadAt(26, 20, fp, flat)).toBe(2);
    expect(pickLoadAt(15, 20, fp, flat)).toBeNull();
  });

  it('measures every segment of a load, not only its first', () => {
    const fp = new Map([[1, [...seg(0, 0, 0, 10), ...seg(100, 0, 100, 10)]]]);
    expect(pickLoadAt(101, 5, fp, flat)).toBe(1);
  });

  it('at a joint, the load acting at the point wins a near tie', () => {
    // A distributed load's first arrow and a nodal load's arrow both end at (0, 0).
    const fp = new Map([[1, seg(0, -40, 0, 0)], [3, seg(-40, 0, 0, 0)]]);
    expect(pickLoadAt(0, 0, fp, flat, 10, new Set([3]))).toBe(3);
    // Clearly on the distributed one, it still wins.
    expect(pickLoadAt(0, -30, fp, flat, 10, new Set([3]))).toBe(1);
  });
});
