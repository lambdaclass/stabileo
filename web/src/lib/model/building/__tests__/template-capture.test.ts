import { describe, it, expect } from 'vitest';
import { captureBand, captureRect, type Seg } from '../template-capture';

const near = (segs: Seg[]) => (x: number, y: number, r: number) => segs.filter(([a, b]) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2)) : 0;
  return Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y) <= r;
});
const poly = (pts: Array<[number, number]>, closed = true): Seg[] => {
  const out: Seg[] = [];
  for (let i = 0; i + 1 < pts.length + (closed ? 1 : 0); i++) out.push([pts[i]!, pts[(i + 1) % pts.length]!]);
  return out;
};
const turn = (p: [number, number], deg: number, c: [number, number] = [0, 0]): [number, number] => {
  const a = deg * Math.PI / 180, x = p[0] - c[0], y = p[1] - c[1];
  return [c[0] + x * Math.cos(a) - y * Math.sin(a), c[1] + x * Math.sin(a) + y * Math.cos(a)];
};

describe('capturing a column outline on the template', () => {
  it('takes the rectangle around the click, its hatch passed over', () => {
    const segs = [...poly([[1, 1], [1.4, 1], [1.4, 1.3], [1, 1.3]]), [[1, 1.1], [1.1, 1]] as Seg, [[1, 1.3], [1.4, 1]] as Seg];
    const f = captureRect(near(segs), { x: 1.33, y: 1.25 })!;
    expect(f.b).toBeCloseTo(0.4, 9);
    expect(f.h).toBeCloseTo(0.3, 9);
    expect(f.center.x).toBeCloseTo(1.2, 9);
    expect(f.center.y).toBeCloseTo(1.15, 9);
  });

  it('takes a turned one at its angle, and the column inside a room rather than the room', () => {
    const col = poly([[0, 0], [0.5, 0], [0.5, 0.25], [0, 0.25]].map((p) => turn(p as [number, number], 30)));
    const room = poly([[-3, -3], [3, -3], [3, 3], [-3, 3]]);
    const f = captureRect(near([...col, ...room]), { x: 0.2, y: 0.2 })!;
    expect(f.b * f.h).toBeCloseTo(0.125, 9);
    expect(Math.abs(f.u.x * Math.cos(Math.PI / 6) + f.u.y * Math.sin(Math.PI / 6)) > 0.999 || Math.abs(f.u.x * -Math.sin(Math.PI / 6) + f.u.y * Math.cos(Math.PI / 6)) > 0.999).toBe(true);
  });

  it('refuses an outline with a side missing, or one too large for a column', () => {
    expect(captureRect(near(poly([[0, 0], [0.4, 0], [0.4, 0.4], [0, 0.4]], false)), { x: 0.2, y: 0.2 })).toBeNull();
    expect(captureRect(near(poly([[0, 0], [5, 0], [5, 4], [0, 4]])), { x: 2, y: 2 })).toBeNull();
  });
});

describe('capturing a wall band on the template', () => {
  it('takes the narrowest pair of lines about the click, its width and its length, its pieces followed', () => {
    const segs: Seg[] = [[[0.15, 0], [2, 0]], [[2, 0], [5.85, 0]], [[0.15, 0.2], [5.85, 0.2]], ...poly([[-0.15, -0.05], [0.15, -0.05], [0.15, 0.25], [-0.15, 0.25]])];
    const b = captureBand(near(segs), { x: 3, y: 0.07 })!;
    expect(b.width).toBeCloseTo(0.2, 9);
    const xs = [b.a.x, b.b.x].sort((p, q) => p - q);
    expect(xs[0]).toBeCloseTo(0.15, 6);
    expect(xs[1]).toBeCloseTo(5.85, 6);
    expect(b.a.y).toBeCloseTo(0.1, 9);
  });

  it('stops where either face stops, and refuses lines too far apart for a wall', () => {
    const b = captureBand(near([[[0, 0], [6, 0]], [[0, 0.25], [4, 0.25]]]), { x: 1, y: 0.1 })!;
    expect(Math.max(b.a.x, b.b.x)).toBeCloseTo(4, 6);
    expect(captureBand(near([[[0, 0], [6, 0]], [[0, 2], [6, 2]]]), { x: 1, y: 1 })).toBeNull();
  });
});
