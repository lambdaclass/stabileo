import { describe, it, expect } from 'vitest';
import { shellPatches } from '../figure-shell-map';
import { faceVertexWeights } from '../../three/create-shell-mesh';

const blend = (w: readonly number[], vs: readonly number[]) => w.reduce((a, k, i) => a + k * vs[i]!, 0);

describe('a shell face cut into pieces for the figure', () => {
  it('cuts a quad into the triangles the screen draws, each at the mean of its vertices\' values', () => {
    const pts = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 6 }, { x: 0, y: 6 }];
    const vs = [0, 1, 10, 2];
    const p = shellPatches(pts, vs);
    const ws = faceVertexWeights(4);
    expect(p).toHaveLength(ws.length / 3);
    p.forEach((q, t) => {
      const tri = ws.slice(3 * t, 3 * t + 3);
      expect(q.value).toBeCloseTo(tri.reduce((a, w) => a + blend(w, vs), 0) / 3, 12);
      q.pts.forEach((c, k) => { expect(c.x).toBeCloseTo(blend(tri[k]!, pts.map((v) => v.x)), 12); expect(c.y).toBeCloseTo(blend(tri[k]!, pts.map((v) => v.y)), 12); });
    });
    const first = p[0]!;
    expect(first.pts).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }]);
  });

  it('cuts a triangle the same way, covering it whole, with a linear blend', () => {
    const p = shellPatches([{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 0, y: 6 }], [0, 6, 12]);
    expect(p).toHaveLength(36);
    const area = p.reduce((a, q) => a + Math.abs((q.pts[1]!.x - q.pts[0]!.x) * (q.pts[2]!.y - q.pts[0]!.y) - (q.pts[2]!.x - q.pts[0]!.x) * (q.pts[1]!.y - q.pts[0]!.y)) / 2, 0);
    expect(area).toBeCloseTo(18, 9);
    for (const q of p) {
      const cx = (q.pts[0]!.x + q.pts[1]!.x + q.pts[2]!.x) / 3, cy = (q.pts[0]!.y + q.pts[1]!.y + q.pts[2]!.y) / 3;
      expect(q.value).toBeCloseTo(cx + 2 * cy, 9);
    }
  });
});
