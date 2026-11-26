import { describe, it, expect } from 'vitest';
import { rulesFor } from '../codes';
import { makeFmt } from '../format';
import { footingCorners } from '../footing-overlaps';
import type { FootingContext, FootingDemand } from '../footing-types';

const fmt = makeFmt('.');
const footingRow = rulesFor('cirsoc201-2025').footingRow;
const ctx: FootingContext = { fc: 25, fy: 420, cover: 0.05, sizing: 'full', diameters: [10, 12, 16, 20, 25], preferred: { x: 12, y: 12 }, columnBars: { count: 4, dia: 16, tension: false }, second: { columnBars: { count: 4, dia: 16, tension: false } } };
const outline = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 0.2 }, { x: 0.2, y: 0.2 }, { x: 0.2, y: 3 }, { x: 0, y: 3 }];
const centroid = { x: 1.2, y: 0.8 };
const core = (anchor: [number, number]): FootingDemand => ({
  key: 'footing:n1', name: 'P1', nodeId: 1, at: { ...centroid, z: 0 }, column: { b: 4, h: 3 },
  pier: { key: 'p1', nodes: [1], walls: [], outline }, service: { combo: 'D', N: 3000, Mx: 0, My: 0, Vx: 0, Vy: 0 }, lateralLeftOut: 0,
  combos: [{ combo: 'U', N: 4200, Mx: 0, My: 0, Vx: 0, Vy: 0 }], soil: { name: '', allowable: 150, presumed: true },
  ...(anchor[0] || anchor[1] ? { edge: { anchor, position: 'edge', source: 'lines', straps: [], balance: 'eccentric' } as never } : {}),
});
const covers = (d: FootingDemand) => {
  const r = footingRow(d, ctx, undefined, fmt);
  const c = footingCorners(r), xs = c.map((p) => p.x), ys = c.map((p) => p.y);
  return { r, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};

describe('a footing under an L-shaped core whose centroid is not its box\'s centre', () => {
  it('covers the whole core', () => {
    const f = covers(core([0, 0]));
    expect(f.x0).toBeLessThanOrEqual(0 + 1e-6);
    expect(f.x1).toBeGreaterThanOrEqual(4 - 1e-6);
    expect(f.y0).toBeLessThanOrEqual(0 + 1e-6);
    expect(f.y1).toBeGreaterThanOrEqual(3 - 1e-6);
  });

  it('held at a property line on its −X side, stops at the core\'s face there and covers the rest', () => {
    const f = covers(core([-1, 0]));
    expect(f.x0).toBeCloseTo(0, 6);
    expect(f.x1).toBeGreaterThanOrEqual(4 - 1e-6);
    expect(f.y0).toBeLessThanOrEqual(1e-6);
    expect(f.y1).toBeGreaterThanOrEqual(3 - 1e-6);
  });
});
