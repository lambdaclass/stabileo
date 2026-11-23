import { describe, it, expect } from 'vitest';
import { rulesFor } from '../codes';
import { makeFmt } from '../format';
import { pilePatterns } from '../pile-cap';
import type { FootingContext, FootingDemand, PileSpec } from '../footing-types';

const fmt = makeFmt('.');
const footingRow = rulesFor('cirsoc201-2025').footingRow;
const ctx: FootingContext = { fc: 30, fy: 420, cover: 0.055, sizing: 'full', diameters: [12, 16, 20, 25], columnBars: { count: 8, dia: 16, tension: false } };
const spec: PileSpec = { diameter: 0.5, length: 12, capacity: 600, source: 'presumed', efficiency: 0.7 };
const gap = (ps: Array<[number, number]>) => Math.min(...ps.flatMap((p, i) => ps.slice(i + 1).map((q) => Math.hypot(p[0] - q[0], p[1] - q[1]))));

function demand(N: number, over: Partial<FootingDemand> = {}): FootingDemand {
  return {
    key: 'footing:n1', name: 'C1', nodeId: 1, at: { x: 0, y: 0, z: 0 }, column: { b: 0.5, h: 0.5 },
    service: { combo: 'D + L', N, Mx: 0, My: 0, Vx: 0, Vy: 0 }, lateralLeftOut: 0,
    combos: [{ combo: '1.2D+1.6L', N: 1.4 * N, Mx: 0, My: 0, Vx: 0, Vy: 0 }],
    soil: { name: 'S', allowable: 150 }, piles: spec, ...over,
  };
}

describe('the patterns a count of piles is tried in', () => {
  it('lays five in a quincunx, every pile a spacing from the centre one and none nearer', () => {
    const q = pilePatterns(5, 1.5, 'x').find((p) => p.some(([x, y]) => x === 0 && y === 0))!;
    expect(q).toHaveLength(5);
    expect(gap(q)).toBeCloseTo(1.5, 9);
  });

  it('keeps a grid\'s rows near the footprint\'s proportion and adds a single line under a long one', () => {
    const square = pilePatterns(8, 1.5, 'x', 1), long = pilePatterns(8, 1.5, 'x', 6);
    expect(square.every((p) => p.length === 8)).toBe(true);
    expect(long.some((p) => new Set(p.map(([, y]) => y)).size === 1)).toBe(true);
    expect(square.some((p) => new Set(p.map(([, y]) => y)).size === 1)).toBe(false);
    expect(pilePatterns(7, 1.5, 'x', 1)).toEqual([]);
  });
});

describe('a cap under a wall', () => {
  const wall = demand(2400, { column: { b: 4, h: 0.25, area: 1, bars: { count: 20, dia: 12, tension: false }, dowelMin: 20 }, pier: { key: 'p1', nodes: [1, 2], walls: ['w:1'] } });
  const wallCtx = { ...ctx, columnBars: { count: 20, dia: 12, tension: false } };
  const r = footingRow(wall, wallCtx, undefined, fmt);

  it('lays its piles along the wall and covers the whole of it', () => {
    const ps = r.cap!.piles, xs = ps.map((p) => p.x), ys = ps.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(Math.max(...ys) - Math.min(...ys));
    expect(r.B).toBeGreaterThanOrEqual(4);
    expect(r.B).toBeGreaterThan(r.L);
    expect(r.status, r.verifications.filter((v) => !v.ok).map((v) => v.label).join(', ')).toBe('ok');
  });

  it('takes, of the patterns that hold, the one with the least concrete in cap and piles', () => {
    const vol = (x: typeof r) => x.B * x.L * x.h + x.cap!.piles.length * Math.PI * 0.25 ** 2 * 12;
    const n = r.cap!.piles.length;
    const asSquare = footingRow({ ...wall, pier: undefined, column: { b: 0.5, h: 0.5 } }, ctx, undefined, fmt);
    expect(asSquare.cap!.piles.length).toBe(n);
    expect(vol(r)).toBeLessThanOrEqual(vol({ ...asSquare, B: Math.max(asSquare.B, 4.2), L: Math.max(asSquare.L, 0.45) }) + 1e-6);
  });
});

describe('a cap founded deeper', () => {
  const strata = [
    { name: 'fill', thickness: 2, shaftFrictionKPa: 0, tipResistanceKPa: 0 },
    { name: 'clay', thickness: 10, shaftFrictionKPa: 40, tipResistanceKPa: 1000 },
    { name: 'sand', thickness: 20, shaftFrictionKPa: 60, tipResistanceKPa: 3000 },
  ];
  const deep: PileSpec = { ...spec, length: 10, capacity: 0, source: 'layers', strata };

  it('reads its piles from its own underside down: the fill off the shaft and the tip in the sand', () => {
    const at = (founding: number) => footingRow(demand(1500, { piles: deep, founding }), ctx, undefined, fmt).cap!;
    const shallow = at(-1), lower = at(-3);
    const P = Math.PI * 0.5, A = Math.PI * 0.25 ** 2;
    expect(shallow.head).toBeCloseTo(1, 9);
    expect(shallow.capacity).toBeCloseTo(P * 40 * 9 + A * 1000, 6);
    expect(lower.head).toBeCloseTo(3, 9);
    expect(lower.capacity).toBeCloseTo(P * 40 * 9 + P * 60 * 1 + A * 3000, 6);
  });

  it('fails, with no tip counted, where its piles\' toes go past the deepest layer stated', () => {
    const short: PileSpec = { ...deep, strata: strata.slice(0, 2) };
    const r = footingRow(demand(1500, { piles: short, founding: -3 }), ctx, undefined, fmt);
    expect(r.cap!.beyond).toBeCloseTo(12, 9);
    const v = r.verifications.find((x) => x.label === 'rcSheets.v.pileLayers')!;
    expect(v.ok).toBe(false);
    expect(v.capacity).toContain('12');
    expect(r.status).toBe('fail');
  });
});

describe('a cap at a property line', () => {
  const partner = { axis: 'x' as const, key: 'footing:n2', nodeId: 2, name: 'C2', L: 5, column: { b: 0.5, h: 0.5 } };
  const edge = (permanent: number) => demand(1500, { edge: { anchor: [1, 0], source: 'lines', balance: 'strap', partners: [{ ...partner, permanent }] } });

  it('keeps its piles off the line and hands the offset to a strap, the piles loaded alike', () => {
    const r = footingRow(edge(2000), ctx, undefined, fmt), ps = r.cap!.piles;
    expect(Math.max(...ps.map((p) => p.x + r.ex))).toBeLessThanOrEqual(0.25 - 0.5 + 1e-9);
    expect(r.ex + r.B / 2).toBeCloseTo(0.25, 9);
    expect(Math.max(...ps.map((p) => p.service)) - Math.min(...ps.map((p) => p.service))).toBeCloseTo(0, 6);
    const s = r.edge!.straps[0]!;
    expect(s.partner).toBe('C2');
    expect(s.pull).toBeCloseTo((1500 * s.e) / (5 - s.e), 6);
    expect(r.verifications.find((v) => v.label === 'rcSheets.v.footStrapPull')!.ok).toBe(true);
  });

  it('fails where the inner column\'s permanent load cannot hold 1,5 times the strap\'s pull down (GA §8.5)', () => {
    const r = footingRow(edge(100), ctx, undefined, fmt);
    expect(r.verifications.find((v) => v.label === 'rcSheets.v.footStrapPull')!.ok).toBe(false);
  });
});
