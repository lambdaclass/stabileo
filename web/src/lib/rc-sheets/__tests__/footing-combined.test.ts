/**
 * A combined footing against a hand calculation: centred on the resultant, the line between the
 * columns read as a beam on a uniform pressure (hogging between them, top bars), the cantilevers
 * past them (bottom bars), the bands across under each column, and its ends at a property line.
 */
import { describe, it, expect } from 'vitest';
import { rulesFor } from '../codes';
import { makeFmt } from '../format';
import { analyseCombined } from '../footing-combined';
import { CIRSOC_ONE_WAY } from '../footing-design';
import { CIRSOC_FOOTING_ANCHORAGE } from '../codes';
import type { FootingContext, FootingDemand } from '../footing-types';

const fmt = makeFmt('.');
const footingRow = rulesFor('cirsoc201-2025').footingRow;
const ctx: FootingContext = { fc: 25, fy: 420, cover: 0.05, sizing: 'full', diameters: [10, 12, 16, 20, 25], preferred: { x: 12, y: 12 }, columnBars: { count: 4, dia: 16, tension: false }, second: { columnBars: { count: 4, dia: 16, tension: false } } };
const col = (key: string, name: string, x: number, N: number): FootingDemand => ({
  key, name, nodeId: Number(key.slice(9)), at: { x, y: 0, z: 0 }, column: { b: 0.3, h: 0.3 },
  service: { combo: 'D + L', N, Mx: 0, My: 0, Vx: 0, Vy: 0 }, lateralLeftOut: 0,
  combos: [{ combo: 'U', N: 1.4 * N, Mx: 0, My: 0, Vx: 0, Vy: 0 }], soil: { name: '', allowable: 150, presumed: true },
});
const pair = (over: Partial<FootingDemand> = {}, second: Partial<FootingDemand> = {}): FootingDemand => ({ ...col('footing:n1', 'C1', 0, 400), ...over, carried: { ...col('footing:n2', 'C2', 3, 600), ...second } });

describe('a combined footing for two columns 3 m apart', () => {
  const r = footingRow(pair(), ctx, undefined, fmt);

  it('is centred on the resultant, 50 cm past the far column, as wide as the soil needs', () => {
    expect(r.ex).toBeCloseTo(1.8, 6);
    expect(r.ey).toBeCloseTo(0, 6);
    expect(r.B).toBeCloseTo(4.6, 6);
    expect(r.L).toBeGreaterThanOrEqual(1.55 - 1e-9);
    expect(r.bearing!.qMax).toBeCloseTo(r.bearing!.qMean, 6);
    expect(r.bearing!.qMean).toBeLessThanOrEqual(150 + 1e-6);
    expect(r.name).toBe('C1 + C2');
    expect(r.combined!.axis).toBe('x');
  });

  it('hogs between the columns as a beam on the soil and sags past them', () => {
    const w = 1400 / 4.6, sStar = 560 / w - 0.5;
    expect(r.combined!.mTop).toBeCloseTo(-(w * (sStar + 0.5) ** 2 / 2 - 560 * sStar), 0);
    expect(r.combined!.mBottom).toBeGreaterThan(w * 0.95 ** 2 / 2);
    expect(r.combined!.mBottom).toBeLessThan(w * 1.1 ** 2 / 2);
    expect(r.adopted.top!.dia).toBeGreaterThan(0);
    expect(r.combined!.asTopProvided).toBeGreaterThanOrEqual(r.combined!.asTop - 1e-6);
  });

  it('carries each column across in a band c + d wide', () => {
    const [b1, b2] = r.combined!.bands;
    const cant = (r.L - 0.3) / 2;
    expect(b1!.mu).toBeCloseTo((560 / r.L) * cant * cant / 2, 6);
    expect(b2!.mu).toBeCloseTo((840 / r.L) * cant * cant / 2, 6);
    expect(b2!.width).toBeCloseTo(0.3 + r.layers.dy, 6);
    expect(r.status).toBe('ok');
  });

  it('closes its moment at the far end: the loads and the soil are in equilibrium', () => {
    const a = analyseCombined(pair(), ctx, r.adopted, { ...CIRSOC_ONE_WAY, anchorage: CIRSOC_FOOTING_ANCHORAGE });
    expect(a.closure).toBeLessThan(1);
  });
});

describe('a combined footing at a property line', () => {
  it('ends at the outer face of the column at the line and takes the rest as an uneven pressure', () => {
    const edge = { anchor: [-1, 0] as [number, number], source: 'lines' as const, balance: 'strap' as const, partners: [] };
    const r = footingRow(pair({ edge }), ctx, undefined, fmt);
    expect(r.ex - r.B / 2).toBeCloseTo(-0.15, 6);
    expect(r.status).not.toBe('fail');
  });
});
