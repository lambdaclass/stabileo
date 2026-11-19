import { describe, it, expect } from 'vitest';
import { withEdges } from '../footing-edges';
import { footingCover, onlyOverlaps } from '../footing-overlaps';
import type { FootingDemand, FootingRow } from '../footing-types';

const base = (key: string, x: number, y: number, over: Partial<FootingDemand> = {}): FootingDemand => ({
  key, name: key, nodeId: Number(key.replace(/\D/g, '')), at: { x, y, z: 0 }, column: { b: 0.4, h: 0.4 },
  service: { combo: 'D', N: 500, Mx: 0, My: 0, Vx: 0, Vy: 0 }, lateralLeftOut: 0, combos: [], soil: null, ...over,
});

describe('a core at the property lines', () => {
  it('holds the lines its base nodes stand on, though its centre stands inward', () => {
    const core = base('f1', 1.25, 1.25, { column: { b: 2.7, h: 2.7 }, pier: { key: 'p1', nodes: [1, 2, 3], walls: [], points: [{ x: 0, y: 0 }, { x: 0, y: 2.5 }, { x: 2.5, y: 0 }] } });
    const rows = withEdges([core, base('f2', 6, 0), base('f3', 6, 5), base('f4', 0, 5)], { lines: { minX: true, minY: true }, setup: {}, straps: [] });
    expect(rows[0]!.edge?.anchor).toEqual([-1, -1]);
    expect(rows[1]!.edge?.anchor).toEqual([0, -1]);
    expect(rows[2]!.edge).toBeUndefined();
    expect(rows[3]!.edge?.anchor).toEqual([-1, 0]);
  });
});

describe('footings that do not fit', () => {
  const row = (x: number, y: number, B: number, checks: Array<{ label: string; ok: boolean }>) => ({ demand: { at: { x, y }, column: { b: 0.4, h: 0.4 } }, B, L: B, ex: 0, ey: 0, verifications: checks }) as unknown as FootingRow;

  it('fail for the plan alone when overlapping is all that fails', () => {
    expect(onlyOverlaps(row(0, 0, 2, [{ label: 'rcSheets.v.footOverlap', ok: false }, { label: 'rcSheets.v.footBearing', ok: true }]))).toBe(true);
    expect(onlyOverlaps(row(0, 0, 2, [{ label: 'rcSheets.v.footOverlap', ok: false }, { label: 'rcSheets.v.footBearing', ok: false }]))).toBe(false);
    expect(onlyOverlaps(row(0, 0, 2, []))).toBe(false);
  });

  it('cover a share of the building\'s plan, the rectangle its columns reach', () => {
    const c = footingCover([row(0, 0, 2, []), row(4, 3, 2, [])])!;
    expect(c.footings).toBeCloseTo(8, 9);
    expect(c.plan).toBeCloseTo(4.4 * 3.4, 9);
    expect(c.share).toBeCloseTo(8 / (4.4 * 3.4), 9);
  });
});
