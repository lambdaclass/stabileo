import { describe, it, expect } from 'vitest';
import { rulesFor } from '../codes';
import { makeFmt } from '../format';
import { barArea } from '../bars';
import { meshSpan, meshText } from '../footing-mesh';
import { footingDetail } from '../footing-detail';
import { bandLines, bandWidth, capCover, CAP_SECONDARY } from '../pile-cap';
import type { FootingContext, FootingDemand, PileSpec } from '../footing-types';

const fmt = makeFmt('.');
const rules = rulesFor('cirsoc201-2025');
const ctx: FootingContext = { fc: 30, fy: 420, cover: 0.055, sizing: 'full', diameters: [12, 16, 20, 25], columnBars: { count: 8, dia: 16, tension: false } };
const spec: PileSpec = { diameter: 0.5, length: 12, capacity: 600, source: 'presumed', efficiency: 0.7 };

function demand(N: number, capacity = 600): FootingDemand {
  return {
    key: 'footing:n1', name: 'C1', nodeId: 1, at: { x: 0, y: 0, z: 0 }, column: { b: 0.5, h: 0.5 },
    service: { combo: 'D + L', N, Mx: 0, My: 0, Vx: 0, Vy: 0 }, lateralLeftOut: 0,
    combos: [{ combo: '1.2D+1.6L', N: 1.4 * N, Mx: 0, My: 0, Vx: 0, Vy: 0 }],
    soil: { name: 'S', allowable: 150 }, piles: { ...spec, capacity },
  };
}

describe('a deep cap\'s ties in bands over its piles', () => {
  it('lays the two-pile cap\'s tie over its line of piles, a band the pile wide and twice the bars\' height over the heads', () => {
    const r = rules.footingRow(demand(700), ctx, undefined, fmt), t = r.cap!.stm!, x = r.adopted.x;
    expect(r.cap!.piles).toHaveLength(2);
    expect(x.bands).toBeDefined();
    expect(x.bands!.at).toEqual([0]);
    expect(x.bands!.width).toBeCloseTo(0.5 + 2 * (capCover(0.055) + x.dia / 2000 - 0.1), 9);
    expect(x.bands!.count).toBe(Math.max(2, Math.ceil(t.asx / barArea(x.dia) - 1e-9)));
    expect(t.tie.x).toBeCloseTo(x.bands!.count * barArea(x.dia), 9);
    expect(t.tie.x).toBeGreaterThanOrEqual(t.asx - 1e-9);
    expect(t.mesh.x).toBeGreaterThanOrEqual(CAP_SECONDARY * t.asx - 1e-9);
    expect(r.adopted.y.bands).toBeUndefined();
    expect(r.verifications.find((v) => v.label === 'rcSheets.v.capSecondaryX')?.ok).toBe(true);
    expect(r.status, r.verifications.filter((v) => !v.ok).map((v) => v.label).join(', ')).toBe('ok');
  });

  it('spaces a band\'s bars 10 cm apart or 7,5 cm, taking a thicker bar before crowding them', () => {
    const b = rules.footingRow(demand(3000, 1300), ctx, undefined, fmt).adopted.x;
    expect((b.bands!.width - b.dia / 1000) / (b.bands!.count - 1)).toBeGreaterThanOrEqual(0.075 - 1e-9);
  });

  it('keeps the mesh\'s bars a pitch clear of the band\'s, and draws and schedules them all', () => {
    const r = rules.footingRow(demand(700), ctx, undefined, fmt), x = r.adopted.x, b = x.bands!;
    const span = meshSpan('x', { B: r.B, L: r.L, ex: 0, ey: 0 }, x, r.cover);
    const inside = span.positions.filter((p) => Math.abs(p) <= b.width / 2);
    expect(inside).toHaveLength(b.count);
    const sorted = [...span.positions].sort((p, q) => p - q);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i]! - sorted[i - 1]!).toBeGreaterThanOrEqual(Math.min(x.dia / 1000 + 0.025, (b.width - x.dia / 1000) / (b.count - 1)) - 1e-9);
    const det = footingDetail(r, rules.bends);
    expect(det.layers.find((l) => l.dir === 'x')!.positions).toHaveLength(span.positions.length);
    expect(meshText(x)).toContain(`+ 1×${b.count}Ø${x.dia}`);
  });

  it('gives a four-pile cap a band over each of its two lines in each direction', () => {
    const r = rules.footingRow(demand(3000, 1300), ctx, undefined, fmt);
    expect(r.cap!.piles).toHaveLength(4);
    expect(r.cap!.stm).not.toBeNull();
    const at = r.adopted.piles!.at;
    expect(r.adopted.x.bands?.at).toEqual(bandLines(at, 'x'));
    expect(r.adopted.y.bands?.at).toEqual(bandLines(at, 'y'));
    expect(bandLines(at, 'x')).toHaveLength(2);
    expect(r.cap!.stm!.tie.x).toBeGreaterThanOrEqual(r.cap!.stm!.asx - 1e-9);
    expect(r.cap!.stm!.tie.y).toBeGreaterThanOrEqual(r.cap!.stm!.asy - 1e-9);
  });

  it('counts a band only where two piles or more stand in a line', () => {
    expect(bandLines([[-0.75, -0.43], [0.75, -0.43], [0, 0.87]], 'x')).toEqual([-0.43]);
    expect(bandLines([[-0.75, -0.43], [0.75, -0.43], [0, 0.87]], 'y')).toEqual([]);
    expect(bandWidth(0.6, 0.05, 16)).toBeCloseTo(0.6 + 2 * (0.125 + 0.008 - 0.1), 9);
  });
});
