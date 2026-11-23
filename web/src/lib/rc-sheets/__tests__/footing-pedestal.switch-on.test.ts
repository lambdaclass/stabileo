import { describe, it, expect } from 'vitest';
import { rulesFor } from '../codes';
import { makeFmt } from '../format';
import { criteriaOf } from '../criteria';
import type { FootingContext, FootingDemand } from '../footing-types';

const fmt = makeFmt('.');
const footingRow = rulesFor('cirsoc201-2025').footingRow;
const ctx: FootingContext = { fc: 25, fy: 420, cover: 0.05, sizing: 'full', diameters: [10, 12, 16, 20, 25], preferred: { x: 12, y: 12 }, columnBars: { count: 4, dia: 16, tension: false }, second: { columnBars: { count: 4, dia: 16, tension: false } } };
const col = (founding?: number): FootingDemand => ({
  key: 'footing:n1', name: 'C1', nodeId: 1, at: { x: 0, y: 0, z: 0 }, column: { b: 0.3, h: 0.4 },
  service: { combo: 'D', N: 600, Mx: 0, My: 0, Vx: 0, Vy: 0 }, lateralLeftOut: 0,
  combos: [{ combo: 'U', N: 840, Mx: 0, My: 0, Vx: 0, Vy: 0 }], soil: { name: '', allowable: 150, presumed: true },
  ...(founding !== undefined ? { founding } : {}),
});

describe('a footing founded below the column\'s foot', () => {
  it('stands the column on a pedestal wider than it by the criterion, 5 cm each way', () => {
    const r = footingRow(col(-1.8), ctx, undefined, fmt);
    expect(r.pedestal).toBeGreaterThan(1);
    expect(r.pedestalSection).toEqual({ b: 0.35, h: 0.45 });
    const wider = footingRow(col(-1.8), { ...ctx, criteria: criteriaOf({ footingPedestalGrow: 10 }) }, undefined, fmt);
    expect(wider.pedestalSection).toEqual({ b: 0.4, h: 0.5 });
  });

  it('has none where the footing\'s top is the column\'s foot', () => {
    expect(footingRow(col(), ctx, undefined, fmt).pedestalSection ?? null).toBeNull();
  });
});
