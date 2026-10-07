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

import { pickLoadsWithDistance } from '../load-pick';

describe('a load on a plate is picked on its fill', () => {
  // Screen = world x, y. Load 1: a slab 0..100 × 0..100 with one arrow at its centre.
  // Load 2: a slab temperature, only a face. Load 3: an arrow on the slab's edge.
  const flat = (x: number, y: number) => ({ x, y });
  const footprints = new Map<number, number[]>([[1, [50, 50, 0, 50, 50, 10]], [3, [0, 0, 0, 100, 0, 0]]]);
  const slab = [0, 0, 0, 100, 0, 0, 100, 100, 0, 0, 100, 0];
  const areas = new Map<number, number[][]>([[1, [slab]], [2, [slab.map((v, i) => (i % 3 === 0 ? v + 200 : v))]]]);

  it('inside the face, away from its arrows', () => {
    expect(pickLoadsWithDistance(80, 80, footprints, flat, 10, new Set(), areas).map((h) => h.id)).toEqual([1]);
  });
  it('a face with no arrows at all (a slab temperature)', () => {
    expect(pickLoadsWithDistance(250, 50, footprints, flat, 10, new Set(), areas).map((h) => h.id)).toEqual([2]);
  });
  it('an arrow under the pointer still wins over the fill around it', () => {
    expect(pickLoadsWithDistance(20, 2, footprints, flat, 10, new Set(), areas)[0]!.id).toBe(3);
  });
  it('outside every face and arrow: nothing', () => {
    expect(pickLoadsWithDistance(150, 150, footprints, flat, 10, new Set(), areas)).toEqual([]);
  });
});
