import { describe, it, expect } from 'vitest';
import { rectGrid } from '../rect-grid';
import { meshQuality } from '../../physical/plate';
import type { Vec3 } from '../affine';

const frame = { o: [0, 0, 0] as Vec3, u: [1, 0, 0] as Vec3, v: [0, 1, 0] as Vec3, n: [0, 0, 1] as Vec3 };
const rect = (x0: number, y0: number, x1: number, y1: number): Vec3[] => [[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]];
const area = (pts: Vec3[], cells: number[][]) => cells.reduce((s, c) => {
  let a = 0;
  for (let i = 0; i < c.length; i++) { const p = pts[c[i]!]!, q = pts[c[(i + 1) % c.length]!]!; a += p[0] * q[1] - q[0] * p[1]; }
  return s + a / 2;
}, 0);

describe('a grid of rectangles', () => {
  it('meshes a wall with a window off the grid in rectangles only, with lines on the window\'s edges', () => {
    const g = rectGrid({ frame, outer: rect(0, 0, 6, 3), holes: [rect(2, 1, 3.5, 2.2)], a: 0.5, b: 0.5, element: 'quad', maxCells: 20000 })!;
    expect(g.structured).toBe(true);
    expect(meshQuality(g).minAngle).toBeCloseTo(90, 6);
    expect(area(g.points, g.cells)).toBeCloseTo(18 - 1.5 * 1.2, 9);
    for (const y of [1, 2.2]) expect(g.points.some((p) => Math.abs(p[0] - 2) < 1e-9 && Math.abs(p[1] - y) < 1e-9)).toBe(true);
    expect(g.cells.every((c) => c.length === 4)).toBe(true);
    for (const c of g.cells) for (const i of c) { const p = g.points[i]!; expect(Math.abs(p[0] - 2.75) < 0.75 - 1e-9 && Math.abs(p[1] - 1.6) < 0.6 - 1e-9).toBe(false); }
  });

  it('takes an L and a notch, every cell no larger than the sides asked for', () => {
    const L: Vec3[] = [[0, 0, 0], [6, 0, 0], [6, 2, 0], [2, 2, 0], [2, 5, 0], [0, 5, 0]];
    const g = rectGrid({ frame, outer: L, holes: [], a: 0.5, b: 1, element: 'quad', maxCells: 20000 })!;
    expect(area(g.points, g.cells)).toBeCloseTo(12 + 6, 9);
    for (const c of g.cells) {
      const xs = c.map((i) => g.points[i]![0]), ys = c.map((i) => g.points[i]![1]);
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(0.5 + 1e-9);
      expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('puts lines through the fixed points and along the members on the plate, and splits each cell in two for triangles', () => {
    const q = rectGrid({ frame, outer: rect(0, 0, 4, 4), holes: [], a: 1, b: 1, element: 'quad', fixedPoints: [[1.3, 2.7, 0]], fixedSegments: [[[0, 3.4, 0], [4, 3.4, 0]]], maxCells: 20000 })!;
    expect(q.points.some((p) => Math.abs(p[0] - 1.3) < 1e-9 && Math.abs(p[1] - 2.7) < 1e-9)).toBe(true);
    expect(q.points.filter((p) => Math.abs(p[1] - 3.4) < 1e-9).length).toBeGreaterThan(4);
    const t = rectGrid({ frame, outer: rect(0, 0, 4, 4), holes: [], a: 1, b: 1, element: 'tri', maxCells: 20000 })!;
    expect(t.cells).toHaveLength(32);
    expect(t.cells.every((c) => c.length === 3)).toBe(true);
  });

  it('declines a sloping side, a member across at a slant, and too many cells', () => {
    expect(rectGrid({ frame, outer: [[0, 0, 0], [4, 0, 0], [3, 3, 0], [0, 3, 0]], holes: [], a: 1, b: 1, element: 'quad', maxCells: 20000 })).toBeNull();
    expect(rectGrid({ frame, outer: rect(0, 0, 4, 4), holes: [], a: 1, b: 1, element: 'quad', fixedSegments: [[[0, 0, 0], [4, 4, 0]]], maxCells: 20000 })).toBeNull();
    expect(rectGrid({ frame, outer: rect(0, 0, 40, 40), holes: [], a: 0.1, b: 0.1, element: 'quad', maxCells: 20000 })).toBeNull();
  });
});
