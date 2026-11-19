/**
 * Pile caps against hand calculations: the loads a rigid cap gives its piles (GA §8.3), the share
 * of a pile's reaction past a section (§13.4.2.5), the fewest piles for the service load at the
 * group's efficiency, a cap kept off a property line, and a deep cap read by struts and ties.
 */
import { describe, it, expect } from 'vitest';
import { rulesFor } from '../codes';
import { makeFmt } from '../format';
import { beyondShare, capPlan, pileLoads, pilePattern, capColumns } from '../pile-cap';
import type { FootingContext, FootingDemand, PileSpec } from '../footing-types';

const fmt = makeFmt('.');
const footingRow = rulesFor('cirsoc201-2025').footingRow;
const ctx: FootingContext = { fc: 30, fy: 420, cover: 0.055, sizing: 'full', diameters: [12, 16, 20, 25], columnBars: { count: 8, dia: 16, tension: false } };
const spec: PileSpec = { diameter: 0.5, length: 12, capacity: 600, source: 'presumed', efficiency: 0.7 };

function demand(N: number, over: Partial<FootingDemand> = {}): FootingDemand {
  return {
    key: 'footing:n1', name: 'C1', nodeId: 1, at: { x: 0, y: 0, z: 0 }, column: { b: 0.5, h: 0.5 },
    service: { combo: 'D + L', N, Mx: 0, My: 0, Vx: 0, Vy: 0 }, lateralLeftOut: 0,
    combos: [{ combo: '1.2D+1.6L', N: 1.4 * N, Mx: 0, My: 0, Vx: 0, Vy: 0 }],
    soil: { name: 'S', allowable: 150 }, piles: spec, ...over,
  };
}

describe('a rigid cap on its piles', () => {
  it('gives each pile ΣN/n plus the moment over Σx²', () => {
    const piles = pilePattern(4, 1.5, 'x');
    const col = capColumns(demand(2000));
    const { R } = pileLoads(col, [{ combo: 's', N: 2000, Mx: 0, My: 300, Vx: 0, Vy: 0 }], piles, 0, [], 0);
    for (let i = 0; i < 4; i++) expect(R[i]).toBeCloseTo(500 + (300 * piles[i]![0]) / (4 * 0.75 ** 2), 6);
    expect(Math.max(...R)).toBeCloseTo(600, 6);
  });

  it('counts a pile past a section in full a half diameter past it, not at all a half diameter short, linearly between', () => {
    expect(beyondShare(0.25, 0.5)).toBe(1);
    expect(beyondShare(-0.25, 0.5)).toBe(0);
    expect(beyondShare(0, 0.5)).toBeCloseTo(0.5, 9);
  });

  it('keeps every pile 50 cm off a property line, the cap flush with the column there', () => {
    const d = demand(1500, { edge: { anchor: [1, 0], source: 'lines', balance: 'eccentric', partners: [] } });
    const p = capPlan(capColumns(d), pilePattern(2, 1.5, 'x'), spec, 0.5);
    const line = 0.25, maxX = Math.max(...p.piles.map((q) => q[0] + p.ex));
    expect(maxX).toBeLessThanOrEqual(line - 0.5 + 1e-9);
    expect(p.ex + p.B / 2).toBeCloseTo(line, 9);
  });
});

describe('a pile cap proposed', () => {
  it('takes the fewest piles that carry the service load within each pile\'s and the group\'s capacity: 2000 kN on 600 kN piles at 70 % is six', () => {
    const r = footingRow(demand(2000), ctx, undefined, fmt);
    expect(r.cap).toBeDefined();
    const n = r.cap!.piles.length;
    expect(n).toBe(6);
    expect(r.cap!.group.capacity).toBeCloseTo(0.7 * 6 * 600, 6);
    expect(r.cap!.group.service).toBeCloseTo(2000 + 25 * r.B * r.L * r.h, 3);
    for (const p of r.cap!.piles) expect(p.service).toBeCloseTo(r.cap!.group.service / 6, 3);
    expect(r.status, r.verifications.filter((v) => !v.ok).map((v) => v.label).join(', ')).toBe('ok');
    expect(Math.min(r.layers.dx, r.layers.dy)).toBeGreaterThanOrEqual(0.3);
  });

  it('reads a deep cap of two piles by struts and ties: T = R·a/z on each side, the steel T/(φ·fy)', () => {
    const d = demand(700);
    const r = footingRow(d, ctx, undefined, fmt);
    expect(r.cap!.piles).toHaveLength(2);
    expect(r.cap!.deep).toBe(true);
    const t = r.cap!.stm!, R = Math.max(...r.cap!.piles.map((p) => p.factored)), a = Math.max(...r.cap!.piles.map((p) => Math.abs(p.x + r.ex)));
    expect(t.tx).toBeCloseTo((R * a) / t.z, 3);
    expect(t.asx).toBeCloseTo((t.tx * 10) / (0.75 * 420), 6);
    expect(t.theta).toBeGreaterThanOrEqual(25);
    expect(r.x!.asProvided).toBeGreaterThanOrEqual(t.asx - 1e-6);
    expect(r.verifications.some((v) => v.label === 'rcSheets.v.capStmTieX')).toBe(true);
  });
});
