import { describe, it, expect } from 'vitest';
import { shellPatches } from '../figure-shell-map';

describe('a shell face cut into pieces for the figure', () => {
  it('blends a quad\'s corner values bilinearly', () => {
    const p = shellPatches([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }], [0, 4, 8, 4], 2);
    expect(p).toHaveLength(4);
    expect(p.map((q) => q.value)).toEqual([2, 4, 4, 6]);
    expect(p[0]!.pts).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]);
  });

  it('blends a triangle\'s linearly, and covers it whole', () => {
    const p = shellPatches([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 3 }], [0, 3, 6], 3);
    expect(p).toHaveLength(9);
    const area = p.reduce((a, q) => a + Math.abs((q.pts[1]!.x - q.pts[0]!.x) * (q.pts[2]!.y - q.pts[0]!.y) - (q.pts[2]!.x - q.pts[0]!.x) * (q.pts[1]!.y - q.pts[0]!.y)) / 2, 0);
    expect(area).toBeCloseTo(4.5, 9);
    expect(Math.min(...p.map((q) => q.value))).toBeGreaterThan(0);
    expect(Math.max(...p.map((q) => q.value))).toBeLessThan(6);
  });
});
