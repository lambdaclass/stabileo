/**
 * Rigid footings, by hand. H-25, ADN 420, 0,60 m thick, cover 0,05 m: d = 0,534 m.
 *
 * Isolated 2,4 × 2,4 m under a 0,40 m column, Nu = 1000 kN centred: qu = 1000/5,76 = 173,6 kPa.
 *   Face moment per the cantilever of 1,0 m: 173,6·2,4·1,0²/2 = 208,3 kN·m.
 *   Shear at d from the face (0,466 m cantilever): 173,6·2,4·0,466 = 194,2 kN against
 *   0,75·0,17·5·2,4·0,534·1000 = 817,0 kN.
 *
 * Combined 6 × 2 m under two 0,40 m columns at x = ±2 m, 800 kN each: qu = 1600/12 = 133,3 kPa,
 *   266,7 kN/m along x. Between the columns: M(0) = 266,7·3²/2 − 800·2 = −400 kN·m (the top).
 */
import { describe, it, expect } from 'vitest';
import { checkRigidFooting, type Post } from '../rigid-footing';

const post = (id: string, x: number, N: number, extra: Partial<Post> = {}): Post => ({
  id, x, y: 0, cx: 0.4, cy: 0.4, service: { N: N / 1.4, Mx: 0, My: 0 }, factored: { N, Mx: 0, My: 0 }, ...extra,
});

describe('rigid footings', () => {
  it('an isolated footing: face moment and shear at d', () => {
    const r = checkRigidFooting({ B: 2.4, L: 2.4, thickness: 0.6, cover: 0.05, fc: 25, fy: 420, allowable: 300, posts: [post('c', 0, 1000)] });
    expect(r.x.mPos).toBeCloseTo(208.3, 0);
    expect(r.x.shear.vu).toBeCloseTo(194.2, 0);
    expect(r.x.shear.phiVc).toBeCloseTo(817.0, 0);
    expect(r.bearing.contact).toBe(1);
  });

  it('a combined footing hogs between its columns', () => {
    const r = checkRigidFooting({ B: 6, L: 2, thickness: 0.6, cover: 0.05, fc: 25, fy: 420, allowable: 300, posts: [post('a', -2, 800), post('b', 2, 800)] });
    expect(r.x.mNeg).toBeCloseTo(-400, 0);
    expect(r.x.asTop).toBeGreaterThan(0);
    expect(r.punching).toHaveLength(2);
  });

  it('an eccentric footing that lifts is checked on its contact', () => {
    const r = checkRigidFooting({ B: 2, L: 2, thickness: 0.5, cover: 0.05, fc: 25, fy: 420, allowable: 300, posts: [post('c', 0, 560, { service: { N: 400, Mx: 0, My: 200 }, factored: { N: 560, Mx: 0, My: 280 } })] });
    expect(r.bearing.qMax).toBeCloseTo(266.7, 0);
    expect(r.bearing.contact).toBeCloseTo(0.75, 1);
    expect(r.bearing.ok).toBe(true);
  });
});
