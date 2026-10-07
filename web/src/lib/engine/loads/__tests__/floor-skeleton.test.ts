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

/**
 * Decimal dimensions. Events at one moment (two sides collapsing together, an opening's corner
 * reaching the outer side as that side's end does) were taken a batch at a time, and a corner was
 * left linked to corners the batch had ended: the front never closed, the simulation ran into its
 * iteration cap and the panel's whole load was dropped. Integer and half-metre coordinates all
 * passed; with one decimal 444 bays in 1440 with an opening failed, and 71 L, U and T outlines in
 * 900. Each outline here must close, tile exactly (every point of the panel in one cell, no point
 * outside it in any) and add up to its area.
 */
describe('decimal dimensions, thin rings, near-flat corners', () => {
  let seed = 20261007;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const dec = (a: number, b: number, digits = 1) => Math.round((a + rnd() * (b - a)) * 10 ** digits) / 10 ** digits;
  const rect = (x0: number, y0: number, x1: number, y1: number): P2[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const cw = (l: P2[]) => [...l].reverse();
  const inPoly = (pt: P2, poly: readonly P2[]) => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i]!, [xj, yj] = poly[j]!;
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  };
  /** Why the cells of an outline are wrong, or null. */
  const fault = (loops: P2[][]): string | null => {
    const c = skeletonCells(loops);
    if (!c) return 'did not close';
    const want = loops.reduce((t, l) => t + area(l), 0);
    const got = sum(shares(c));
    if (Math.abs(got - want) > 1e-7 * Math.max(1, want)) return `cells ${got} m², outline ${want} m²`;
    const xs = loops[0]!.map((p) => p[0]), ys = loops[0]!.map((p) => p[1]);
    const cs = c.flat().filter((cell) => Math.abs(area(cell)) > 1e-14);
    for (let k = 0; k < 40; k++) {
      const pt: P2 = [Math.min(...xs) + rnd() * (Math.max(...xs) - Math.min(...xs)), Math.min(...ys) + rnd() * (Math.max(...ys) - Math.min(...ys))];
      const inside = inPoly(pt, loops[0]!) && !loops.slice(1).some((h) => inPoly(pt, h));
      const n = cs.filter((cell) => inPoly(pt, cell)).length;
      if (n !== (inside ? 1 : 0)) return `(${pt}) in ${n} cells`;
    }
    return null;
  };
  const expectAll = (cases: P2[][][]) => {
    const bad = cases.map((loops) => [loops, fault(loops)] as const).filter(([, f]) => f);
    expect(bad.slice(0, 3).map(([l, f]) => `${JSON.stringify(l)}: ${f}`)).toEqual([]);
  };

  it('the reported ones', () => {
    expectAll([
      [[[0, 0], [7.9, 0], [7.9, 1.6], [5.8, 1.6], [5.8, 7.6], [0, 7.6]]],
      [rect(0, 0, 6, 5), cw(rect(1.1, 1.7, 2, 2.8))],
      [rect(0, 0, 10, 6), cw(rect(0.1, 1, 3, 5))],
      [rect(0, 0, 8.9, 5.7), cw(rect(5, 4.7, 7.7, 5.4))],
      [[[0, 0], [9.7, 0], [9.7, 2.9], [0.8, 2.9], [0.8, 4.2], [0, 4.2]]],
      [[[0, 0], [8.8, 0], [8.8, 5.7], [7.8, 5.7], [7.8, 3.4], [7.4, 3.4], [7.4, 5.7], [0, 5.7]]],
      [rect(0, 0, 11.7, 7.7), cw(rect(0.3, 0.3, 1.4, 0.6)), cw(rect(9, 4.5, 10.1, 4.8))],
    ]);
  });

  it('bays with an opening, one or two decimals, and float ones', () => {
    const cases: P2[][][] = [];
    for (let i = 0; i < 150; i++) {
      const W = dec(3, 12), H = dec(3, 12), x0 = dec(0.05, W - 1, 2), y0 = dec(0.05, H - 1, 2);
      const x1 = Math.min(W - 0.02, dec(x0 + 0.2, W, 2)), y1 = Math.min(H - 0.02, dec(y0 + 0.2, H, 2));
      if (x1 - x0 > 0.05 && y1 - y0 > 0.05) cases.push([rect(0, 0, W, H), cw(rect(x0, y0, x1, y1))]);
    }
    for (let i = 0; i < 30; i++) {
      const W = 3 + rnd() * 9, H = 3 + rnd() * 9, x0 = 0.01 + rnd() * (W - 1), y0 = 0.01 + rnd() * (H - 1);
      cases.push([rect(0, 0, W, H), cw(rect(x0, y0, x0 + 0.1 + rnd() * (W - x0 - 0.2), y0 + 0.1 + rnd() * (H - y0 - 0.2)))]);
    }
    expectAll(cases);
  });

  it('L, U and T outlines with one decimal', () => {
    const cases: P2[][][] = [];
    for (let i = 0; i < 100; i++) {
      const W = dec(2, 10), H = dec(2, 10), a = dec(0.3, W - 0.2), b = dec(0.3, H - 0.2), c = dec(0.2, W - 0.2), d = dec(c + 0.1, W - 0.05);
      if (a < W && b < H) cases.push([[[0, 0], [W, 0], [W, b], [a, b], [a, H], [0, H]]]);
      if (b < H && d < W && c < d) {
        cases.push([[[0, 0], [W, 0], [W, H], [d, H], [d, b], [c, b], [c, H], [0, H]]]);
        cases.push([[[c, 0], [d, 0], [d, b], [W, b], [W, H], [0, H], [0, b], [c, b]]]);
      }
    }
    expectAll(cases);
  });

  it('thin rings: an opening a little short of the bay', () => {
    const cases: P2[][][] = [];
    for (const w of [0.5, 0.3, 0.13, 0.1, 0.07, 0.05, 0.02, 0.01, 0.001]) for (const S of [10, 7.3]) {
      cases.push([rect(0, 0, S, S), cw(rect(w, w, S - w, S - w))], [rect(0, 0, S, S * 0.6), cw(rect(w, w, S - w, S * 0.6 - w))], [rect(0, 0, S, S), cw(rect(w, 2 * w, S - 3 * w, S - w))]);
    }
    expectAll(cases);
  });

  it('corners all but flat, reflex or not, on the outline and on an opening', () => {
    const cases: P2[][][] = [];
    for (const off of [1e-2, 1e-3, 3e-4, 1e-4, 1e-5, 1e-6]) for (const W of [10, 7.7]) {
      cases.push([[[0, 0], [W / 2, off], [W, 0], [W, 5], [0, 5]]], [[[0, 0], [W, 0], [W, 5], [W / 2, 5 - off], [0, 5]]], [rect(0, 0, W, 5), cw([[2, 2], [W / 2, 2 + off], [W - 2, 2], [W - 2, 3], [2, 3]])]);
    }
    expectAll(cases);
  });

  it('turned off the axes and far from the origin, and a comb of 160 corners, quickly', () => {
    const cases: P2[][][] = [];
    for (let i = 0; i < 40; i++) {
      const W = dec(3, 12), H = dec(3, 12), a = dec(0.3, W - 0.2), b = dec(0.3, H - 0.2), t = rnd() * 6.28, o: P2 = [dec(-500, 1500), dec(-500, 1500)];
      const turn = (l: P2[]) => l.map(([x, y]): P2 => [o[0] + x * Math.cos(t) - y * Math.sin(t), o[1] + x * Math.sin(t) + y * Math.cos(t)]);
      if (a < W && b < H) cases.push([turn([[0, 0], [W, 0], [W, b], [a, b], [a, H], [0, H]])], [turn(rect(0, 0, W, H)), turn(cw(rect(a / 3, b / 3, a, b)))]);
    }
    expectAll(cases);
    const top: P2[] = [];
    let x = 0;
    for (let j = 0; j < 39; j++) { const w = dec(0.2, 1.2), h = dec(1, 4); top.push([x, 2], [x, 2 + h], [x + w, 2 + h], [x + w, 2]); x += w + dec(0.2, 1.2); }
    const comb: P2[] = [[0, 0], [x, 0], [x, 2], ...top.reverse()];
    const t0 = performance.now();
    expect(fault([comb])).toBeNull();
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
