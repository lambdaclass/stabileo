import { describe, it, expect } from 'vitest';
import { shellPatches } from '../figure-shell-map';
import { faceVertexWeights } from '../../three/create-shell-mesh';
import { bandEdges, bandValue } from '../../engine/contour-scale';

type XY = { x: number; y: number };
const blend = (w: readonly number[], vs: readonly number[]) => w.reduce((a, k, i) => a + k * vs[i]!, 0);
const area = (p: readonly XY[]) => Math.abs(p.reduce((a, q, i) => { const r = p[(i + 1) % p.length]!; return a + q.x * r.y - r.x * q.y; }, 0)) / 2;

function screenValue(pts: readonly XY[], vs: readonly number[], at: XY): number | null {
  const ws = faceVertexWeights(pts.length);
  for (let t = 0; t + 2 < ws.length; t += 3) {
    const c = ws.slice(t, t + 3).map((w) => ({ x: blend(w, pts.map((p) => p.x)), y: blend(w, pts.map((p) => p.y)), v: blend(w, vs) }));
    const d = (c[1]!.y - c[2]!.y) * (c[0]!.x - c[2]!.x) + (c[2]!.x - c[1]!.x) * (c[0]!.y - c[2]!.y);
    const a = ((c[1]!.y - c[2]!.y) * (at.x - c[2]!.x) + (c[2]!.x - c[1]!.x) * (at.y - c[2]!.y)) / d;
    const b = ((c[2]!.y - c[0]!.y) * (at.x - c[2]!.x) + (c[0]!.x - c[2]!.x) * (at.y - c[2]!.y)) / d;
    if (a >= -1e-12 && b >= -1e-12 && a + b <= 1 + 1e-12) return a * c[0]!.v + b * c[1]!.v + (1 - a - b) * c[2]!.v;
  }
  return null;
}

describe('a shell face cut into pieces for the figure', () => {
  it('covers the face whole, each piece inside one step of the scale of the field the screen blends', () => {
    const pts = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 6 }, { x: 0, y: 6 }];
    const vs = [0, 1, 10, 2];
    const levels = bandEdges(0, 10, 5);
    const p = shellPatches(pts, vs, levels);
    expect(p.reduce((a, q) => a + area(q.pts), 0)).toBeCloseTo(36, 9);
    for (const q of p) {
      const k = levels.findIndex((l, i) => i + 1 < levels.length && q.value >= l && q.value <= levels[i + 1]!);
      expect(k).toBeGreaterThanOrEqual(0);
      for (const c of q.pts) {
        const v = screenValue(pts, vs, c)!;
        expect(v).toBeGreaterThanOrEqual(levels[k]! - 1e-9);
        expect(v).toBeLessThanOrEqual(levels[k + 1]! + 1e-9);
      }
    }
  });

  it('paints a sharp corner peak in its own band, over the area the screen gives that band', () => {
    const pts = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 6 }, { x: 0, y: 6 }];
    const vs = [0, 0, 100, 0];
    const p = shellPatches(pts, vs, bandEdges(0, 100, 4));
    const top = p.filter((q) => bandValue(q.value, 0, 100, 4) === 87.5);
    expect(top.length).toBeGreaterThan(0);
    const n = 240, h = 6 / n;
    let screenTop = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (screenValue(pts, vs, { x: (i + 0.5) * h, y: (j + 0.5) * h })! >= 75) screenTop += h * h;
    expect(screenTop).toBeGreaterThan(0);
    expect(top.reduce((a, q) => a + area(q.pts), 0)).toBeCloseTo(screenTop, 1);
  });

  it('draws a band edge where the screen\'s field crosses it, not along the screen\'s triangles', () => {
    const p = shellPatches([{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 0, y: 6 }], [0, 6, 12], [0, 3, 12]);
    const low = p.filter((q) => q.value < 3);
    expect(low.reduce((a, q) => a + area(q.pts), 0)).toBeCloseTo(9 / 4, 9);
    for (const q of low) for (const c of q.pts) expect(c.x + 2 * c.y).toBeLessThanOrEqual(3 + 1e-9);
  });
});
