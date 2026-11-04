/**
 * A plate meshed as a grid of rectangles of the sides asked for (`grid-mesh.ts`): the cells that
 * fit whole are exact rectangles, the strip along the boundary meets them node to node, and
 * the mesh covers the plate exactly.
 */
import { describe, it, expect } from 'vitest';
import { gridMesh, frameAlong, type GridFrame } from '../grid-mesh';
import type { Vec3 } from '../affine';

const XY: GridFrame = { o: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] };
const P = (x: number, y: number): Vec3 => [x, y, 0];

function area2(pts: Vec3[], cell: number[]): number {
  let s = 0;
  for (let k = 0; k < cell.length; k++) { const a = pts[cell[k]!]!, b = pts[cell[(k + 1) % cell.length]!]!; s += a[0] * b[1] - b[0] * a[1]; }
  return s / 2;
}
function polyArea(l: Vec3[]): number { let s = 0; for (let k = 0; k < l.length; k++) { const a = l[k]!, b = l[(k + 1) % l.length]!; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s / 2); }

/** Conforming: no point lies inside another cell's edge, and every edge is in at most two cells. */
function expectConforming(pts: Vec3[], cells: number[][]): void {
  const use = new Map<string, number>();
  for (const c of cells) for (let k = 0; k < c.length; k++) {
    const a = c[k]!, b = c[(k + 1) % c.length]!;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    use.set(key, (use.get(key) ?? 0) + 1);
  }
  for (const [, n] of use) expect(n).toBeLessThanOrEqual(2);
  for (const [key] of use) {
    const [a, b] = key.split('-').map(Number) as [number, number];
    const A = pts[a]!, B = pts[b]!;
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    pts.forEach((p, i) => {
      if (i === a || i === b) return;
      const t = ((p[0] - A[0]) * (B[0] - A[0]) + (p[1] - A[1]) * (B[1] - A[1])) / (L * L);
      if (t <= 1e-6 || t >= 1 - 1e-6) return;
      const d = Math.hypot(p[0] - A[0] - t * (B[0] - A[0]), p[1] - A[1] - t * (B[1] - A[1]));
      expect(d, `point ${i} on edge ${key}`).toBeGreaterThan(1e-6);
    });
  }
}

const isRect = (pts: Vec3[], c: number[], a: number, b: number) => {
  if (c.length !== 4) return false;
  const xs = c.map((n) => pts[n]![0]), ys = c.map((n) => pts[n]![1]);
  return Math.abs(Math.max(...xs) - Math.min(...xs) - a) < 1e-9 && Math.abs(Math.max(...ys) - Math.min(...ys) - b) < 1e-9 && Math.abs(area2(pts, c) - a * b) < 1e-9;
};

describe('a plate meshed as a grid of rectangles', () => {
  it('a rectangle along the axes is one grid of cells fitted to it', () => {
    const m = gridMesh({ outer: [P(0, 0), P(6, 0), P(6, 4), P(0, 4)], holes: [], frame: XY, a: 1, b: 0.5, element: 'quad' })!;
    expect(m.cells).toHaveLength(48);
    expect(m.gridCells).toBe(48);
    expect(m.cells.every((c) => isRect(m.points, c, 1, 0.5))).toBe(true);
    // 5.5 m over 1 m cells: six columns of 0.9167 m, as close to 1 as fills it.
    const fitted = gridMesh({ outer: [P(0, 0), P(5.5, 0), P(5.5, 4), P(0, 4)], holes: [], frame: XY, a: 1, b: 1, element: 'quad' })!;
    expect(fitted.cells).toHaveLength(24);
    expect(fitted.cellA).toBeCloseTo(5.5 / 6, 9);
  });

  it('a pentagon keeps square cells inside and a conforming strip along its outline', () => {
    const outer = [P(0, 0), P(6, 0), P(7.8, 2), P(6, 4), P(0, 4)];
    const m = gridMesh({ outer, holes: [], frame: XY, a: 0.5, b: 0.5, element: 'quad' })!;
    expect(m.gridCells).toBeGreaterThan(40);
    expect(m.bandCells).toBeGreaterThan(0);
    // The grid's cells are exact squares; together with the strip they cover the plate.
    expect(m.cells.slice(0, m.gridCells).every((c) => isRect(m.points, c, 0.5, 0.5))).toBe(true);
    const total = m.cells.reduce((s, c) => s + area2(m.points, c), 0);
    expect(total).toBeCloseTo(polyArea(outer), 6);
    // Every cell wound the same way (one normal for the plate), and the mesh conforming.
    expect(m.cells.every((c) => area2(m.points, c) > 0)).toBe(true);
    expectConforming(m.points, m.cells);
  });

  it('meets a hole and a column inside the plate node to node', () => {
    const outer = [P(0, 0), P(8, 0), P(8, 6), P(0, 6)];
    const hole = [P(2.2, 2.2), P(3.6, 2.2), P(3.6, 3.4), P(2.2, 3.4)];
    const column: Vec3 = [6.15, 4.3, 0];
    const m = gridMesh({ outer, holes: [hole], frame: XY, a: 0.5, b: 0.5, element: 'quad', fixedPoints: [column] })!;
    const total = m.cells.reduce((s, c) => s + area2(m.points, c), 0);
    expect(total).toBeCloseTo(polyArea(outer) - polyArea(hole), 6);
    expect(m.points.some((p) => Math.hypot(p[0] - column[0], p[1] - column[1]) < 1e-6), 'the column is a mesh node').toBe(true);
    expectConforming(m.points, m.cells);
    expect(m.cells.slice(0, m.gridCells).every((c) => isRect(m.points, c, 0.5, 0.5))).toBe(true);
  });

  it('lays the grid along another direction in the plate', () => {
    const outer = [P(0, 0), P(6, 0), P(7.8, 2), P(6, 4), P(0, 4)];
    const f = frameAlong(XY, [1, 1, 0]);
    expect(f.u[0]).toBeCloseTo(Math.SQRT1_2, 9);
    const m = gridMesh({ outer, holes: [], frame: f, a: 0.6, b: 0.6, element: 'tri' })!;
    const total = m.cells.reduce((s, c) => s + area2(m.points, c), 0);
    expect(total).toBeCloseTo(polyArea(outer), 6);
    expectConforming(m.points, m.cells);
  });
});
