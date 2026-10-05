/**
 * The straight skeleton's cells: they tile the panel (their areas add to the panel's), and on a
 * convex panel each side's share is the 45° one.
 */
import { describe, it, expect } from 'vitest';
import { skeletonCells, type P2 } from '../floor-skeleton';

const area = (p: readonly P2[]) => { let s = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]!; s += p[i]![0] * q[1] - q[0] * p[i]![1]; } return s / 2; };
const shares = (cells: P2[][][]) => cells.map((cs) => cs.reduce((t, c) => t + Math.abs(area(c)), 0));
const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);

describe('the skeleton', () => {
  it('a rectangle 4 × 2: triangles of 1 on the short sides, trapezoids of 3 on the long ones', () => {
    const c = skeletonCells([[[0, 0], [4, 0], [4, 2], [0, 2]]])!;
    expect(shares(c).map((v) => +v.toFixed(9))).toEqual([3, 1, 3, 1]);
  });

  it('a square: four equal triangles', () => {
    const c = skeletonCells([[[0, 0], [3, 0], [3, 3], [0, 3]]])!;
    shares(c).forEach((v) => expect(v).toBeCloseTo(9 / 4, 9));
  });

  it('an irregular convex quad tiles exactly', () => {
    const P: P2[] = [[0, 0], [5, 0], [4, 3], [0.5, 2]];
    expect(sum(shares(skeletonCells([P])!))).toBeCloseTo(area(P), 9);
  });

  it('an L tiles exactly, with each side its share', () => {
    const L: P2[] = [[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]];
    const s = shares(skeletonCells([L])!);
    expect(sum(s)).toBeCloseTo(12, 9);
    // Symmetric about y = x: the two long sides alike, the two short ends alike.
    expect(s[0]).toBeCloseTo(s[5]!, 9);
    expect(s[1]).toBeCloseTo(s[4]!, 9);
    expect(s[2]).toBeCloseTo(s[3]!, 9);
    expect(s[1]).toBeCloseTo(1, 9); // the 2 m end of a 2 m wide arm: a triangle
  });

  it('a U and a T tile exactly', () => {
    const U: P2[] = [[0, 0], [6, 0], [6, 4], [4, 4], [4, 2], [2, 2], [2, 4], [0, 4]];
    expect(sum(shares(skeletonCells([U])!))).toBeCloseTo(area(U), 9);
    const T: P2[] = [[2, 0], [4, 0], [4, 3], [6, 3], [6, 5], [0, 5], [0, 3], [2, 3]];
    expect(sum(shares(skeletonCells([T])!))).toBeCloseTo(area(T), 9);
  });

  it('a panel with an opening: the ring tiles, the opening’s sides take their share', () => {
    const outer: P2[] = [[0, 0], [8, 0], [8, 6], [0, 6]];
    const hole: P2[] = [[3, 2], [3, 4], [5, 4], [5, 2]]; // clockwise
    const s = shares(skeletonCells([outer, hole])!);
    expect(sum(s)).toBeCloseTo(48 - 4, 9);
    expect(s.slice(4).every((v) => v > 0)).toBe(true);
    // Symmetric: opposite sides alike.
    expect(s[0]).toBeCloseTo(s[2]!, 9);
    expect(s[1]).toBeCloseTo(s[3]!, 9);
  });

  it('an off-centre opening and a non-convex outline tile exactly', () => {
    const outer: P2[] = [[0, 0], [10, 0], [10, 3], [7, 3], [7, 8], [0, 8]];
    const hole: P2[] = [[1, 1], [1, 2.5], [3.5, 2.5], [3.5, 1]];
    expect(sum(shares(skeletonCells([outer, hole])!))).toBeCloseTo(area(outer) - 3.75, 8);
  });
});

describe('harder outlines', () => {
  const tiles = (loops: P2[][]) => {
    const c = skeletonCells(loops);
    expect(c).not.toBeNull();
    const want = loops.reduce((t, l) => t + area(l), 0);
    expect(sum(shares(c!))).toBeCloseTo(want, 7);
    // No cell lies outside: every cell vertex within the outline's box.
    const xs = loops[0]!.map((p) => p[0]), ys = loops[0]!.map((p) => p[1]);
    for (const cs of c!) for (const cell of cs) for (const p of cell) {
      expect(p[0]).toBeGreaterThanOrEqual(Math.min(...xs) - 1e-6); expect(p[0]).toBeLessThanOrEqual(Math.max(...xs) + 1e-6);
      expect(p[1]).toBeGreaterThanOrEqual(Math.min(...ys) - 1e-6); expect(p[1]).toBeLessThanOrEqual(Math.max(...ys) + 1e-6);
    }
  };
  it('a cross', () => tiles([[[2, 0], [4, 0], [4, 2], [6, 2], [6, 4], [4, 4], [4, 6], [2, 6], [2, 4], [0, 4], [0, 2], [2, 2]]]));
  it('a staircase', () => tiles([[[0, 0], [6, 0], [6, 2], [4, 2], [4, 4], [2, 4], [2, 6], [0, 6]]]));
  it('two openings', () => tiles([[[0, 0], [12, 0], [12, 6], [0, 6]], [[2, 2], [2, 4], [4, 4], [4, 2]], [[7, 1], [7, 5], [9, 5], [9, 1]]]));
  it('an irregular outline with a slanted opening', () => tiles([[[0, 0], [9, 0.5], [10, 6], [5, 5], [1, 7]], [[3, 2], [4, 4], [6, 3.5], [5.5, 2]]]));
  it('an L with an opening in the corner', () => tiles([[[0, 0], [8, 0], [8, 3], [3, 3], [3, 8], [0, 8]], [[1, 1], [1, 2], [2, 2], [2, 1]]]));
  it('a narrow corridor and a wide room', () => tiles([[[0, 0], [10, 0], [10, 6], [6, 6], [6, 1], [1, 1], [1, 6], [0, 6]]]));
});
