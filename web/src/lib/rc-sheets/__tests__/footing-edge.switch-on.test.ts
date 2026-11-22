/**
 * Footings at a property line against hand calculations: a strap beam's statics (V, R1, M), the
 * footing twice as long along the line with its column at it, checked centred under R1 and
 * reinforced along the line from the beam's faces; a corner with two straps; a footing that takes
 * its offset alone; a tie at the first floor (FIUBA Cim. §6).
 */
import { describe, it, expect } from 'vitest';
import { rulesFor } from '../codes';
import { strapAt } from '../footing-strap';
import { strapForces } from '../../engine/foundation/strap-footing';
import { makeFmt } from '../format';
import type { FootingContext, FootingDemand, FootingEdge } from '../footing-types';
import { tieLimits } from '../footing-row';
import { DEFAULT_CRITERIA } from '../criteria';
import { tiePulls, withPulls } from '../footing-ties';

const fmt = makeFmt('.');
const footingRow = rulesFor('cirsoc201-2025').footingRow;
const ctx: FootingContext = { fc: 25, fy: 420, cover: 0.05, sizing: 'full', diameters: [10, 12, 16, 20, 25], preferred: { x: 12, y: 12 }, columnBars: { count: 4, dia: 16, tension: false } };
const partner = (axis: 'x' | 'y', L: number) => ({ axis, key: 'footing:n2', nodeId: 2, name: 'C2', L, column: { b: 0.3, h: 0.3 }, permanent: 500 });

function demand(edge: FootingEdge, over: Partial<FootingDemand> = {}): FootingDemand {
  return {
    key: 'footing:n1', name: 'C1', nodeId: 1, at: { x: 0, y: 0, z: 0 }, column: { b: 0.3, h: 0.3, storey: 3 },
    service: { combo: 'D + L', N: 600, Mx: 0, My: 0, Vx: 0, Vy: 0 }, lateralLeftOut: 0,
    combos: [{ combo: 'U', N: 840, Mx: 0, My: 0, Vx: 0, Vy: 0 }],
    soil: { name: '', allowable: 150, presumed: true }, edge, ...over,
  };
}

describe('the statics of a strap beam', () => {
  it('V = (P1·e + |w|)/(L − e), the relief (P1·e − |w|)/(L − e) and M = P1·e + |w|', () => {
    const s = strapForces(600, [0.65], [30], [5]);
    expect(s.force[0]).toBeCloseTo((600 * 0.65 + 30) / 4.35, 9);
    expect(s.relief[0]).toBeCloseTo((600 * 0.65 - 30) / 4.35, 9);
    expect(s.moment[0]).toBeCloseTo(600 * 0.65 + 30, 9);
  });

  it('hogs the beam to P1·e over the footing and back to nothing at the partner', () => {
    expect(strapAt(840, 0, 0.65, 5, 0).m).toBeCloseTo(0, 9);
    expect(strapAt(840, 0, 0.65, 5, 0.65).m).toBeCloseTo(-840 * 0.65, 9);
    expect(strapAt(840, 0, 0.65, 5, 5).m).toBeCloseTo(0, 9);
    expect(strapAt(840, 0, 0.65, 5, 2.825).m).toBeCloseTo(-(840 * 0.65 / 4.35) * (5 - 2.825), 9);
    expect(strapAt(840, 20, 0.65, 5, 3).v).toBeCloseTo((840 * 0.65 + 20) / 4.35, 9);
  });
});

describe('a footing at a property line with a strap beam', () => {
  const r = footingRow(demand({ anchor: [-1, 0], source: 'lines', balance: 'strap', partners: [partner('x', 5)] }), ctx, undefined, fmt);

  it('is twice as long along the line, its column at the line, and the soil holds under R1', () => {
    expect(r.L).toBeGreaterThan(1.8 * r.B);
    expect(r.ex).toBeCloseTo(r.B / 2 - 0.15, 6);
    const e = r.ex, R1 = 600 * 5 / (5 - e);
    const s = r.edge!.straps[0]!;
    expect(s.e).toBeCloseTo(e, 9);
    expect(s.R1).toBeCloseTo(R1, 6);
    expect(s.factor).toBeCloseTo(5 / (5 - e), 6);
    expect(s.M).toBeCloseTo(840 * e, 6);
    expect(s.V).toBeCloseTo(840 * e / (5 - e), 6);
    expect(s.relief).toBeCloseTo(840 * e / (5 - e), 6);
    const weight = 25 * r.h * r.B * r.L;
    expect(r.bearing!.qMean).toBeCloseTo((R1 + weight) / (r.B * r.L), 6);
    expect(r.bearing!.qMax).toBeCloseTo(r.bearing!.qMean, 6);
    expect(r.status).not.toBe('fail');
  });

  it('cantilevers along the line from the beam: the main bars along it, the ones across distribute and hook at the line', () => {
    const qu = (840 + 840 * r.ex / (5 - r.ex)) / (r.B * r.L), c = (r.L - 0.3) / 2;
    expect(r.y!.mu).toBeCloseTo(qu * r.B * c * c / 2, 0);
    expect(r.x!.carried).toBe(true);
    expect(r.x!.mu).toBe(0);
    expect(r.x!.asReq).toBeCloseTo(r.x!.asMin, 9);
    expect(r.y!.mu).toBeGreaterThan(0);
    expect(r.x!.lineEnd).toBe(-1);
    expect(r.y!.lineEnd).toBeUndefined();
    expect(r.verifications.some((v) => v.label === 'rcSheets.v.footCarried' && v.demand === 'X')).toBe(true);
    expect(r.steps.find((g) => g.title === 'rcSheets.g.footEdge')!.steps.map((s) => s.label)).toEqual(expect.arrayContaining(['rcSheets.s.footStrapV', 'rcSheets.s.footStrapR1', 'rcSheets.s.footStrapM']));
  });
});

describe('a corner footing', () => {
  it('with two straps: square, centred under P + Vx + Vy, both ways reinforced', () => {
    const r = footingRow(demand({ anchor: [-1, -1], source: 'lines', balance: 'strap', partners: [partner('x', 5), { ...partner('y', 4), key: 'footing:n3', name: 'C3' }] }), ctx, undefined, fmt);
    expect(r.B).toBeCloseTo(r.L, 6);
    expect(r.ex).toBeCloseTo(r.B / 2 - 0.15, 6);
    expect(r.ey).toBeCloseTo(r.L / 2 - 0.15, 6);
    const [sx, sy] = r.edge!.straps;
    expect(sx!.V).toBeCloseTo(840 * r.ex / (5 - r.ex), 6);
    expect(sy!.V).toBeCloseTo(840 * r.ey / (4 - r.ey), 6);
    const R1 = 600 + 600 * r.ex / (5 - r.ex) + 600 * r.ey / (4 - r.ey);
    expect(r.bearing!.qMean).toBeCloseTo((R1 + 25 * r.h * r.B * r.L) / (r.B * r.L), 6);
    expect(r.bearing!.qMax).toBeCloseTo(r.bearing!.qMean, 6);
    expect(r.x!.carried).toBeUndefined();
    expect(r.x!.mu).toBeGreaterThan(0);
    expect(r.y!.mu).toBeGreaterThan(0);
    expect([r.x!.lineEnd, r.y!.lineEnd]).toEqual([-1, -1]);
  });
});

describe('an eccentric footing with no strap', () => {
  it('stays narrow across, takes an uneven pressure in contact, and leaves the column the offset\'s moment', () => {
    const small = { service: { combo: 'D + L', N: 120, Mx: 0, My: 0, Vx: 0, Vy: 0 }, combos: [{ combo: 'U', N: 170, Mx: 0, My: 0, Vx: 0, Vy: 0 }] };
    const r = footingRow(demand({ anchor: [-1, 0], source: 'row', balance: 'eccentric', partners: [] }, small), ctx, undefined, fmt);
    expect(r.B).toBeLessThanOrEqual(0.7 + 1e-9);
    expect(r.L).toBeGreaterThan(r.B);
    expect(r.bearing!.qMax).toBeGreaterThan(r.bearing!.qMean * 1.2);
    expect(r.bearing!.contact).toBeGreaterThanOrEqual(0.5);
    expect(r.bearing!.qMax).toBeLessThanOrEqual(150 + 1e-6);
    expect(r.edge!.columnMoment).toBeCloseTo(170 * r.ex, 6);
    expect(r.verifications.find((v) => v.label === 'rcSheets.v.footColumnMoment')?.ok).toBe(true);
    expect(r.status).toBe('ok');
  });

  it('cannot stay in contact under a large load, and fails rather than grow past reason', () => {
    const r = footingRow(demand({ anchor: [-1, 0], source: 'row', balance: 'eccentric', partners: [] }), ctx, undefined, fmt);
    expect(r.status).toBe('fail');
    expect(r.sizing.reached).toBe(false);
  });
});

describe('a footing balanced by a tie at the first floor', () => {
  it('is centred under its own load; the tie takes (Pu·e + |w|)/H with Ast = Tu/(0,90·fy)', () => {
    const r = footingRow(demand({ anchor: [-1, 0], source: 'row', balance: 'tie', partners: [] }), ctx, undefined, fmt);
    const t = r.edge!.ties[0]!;
    expect(t.H).toBeCloseTo(r.h + 3, 9);
    expect(t.Tu).toBeCloseTo(840 * r.ex / t.H, 6);
    expect(t.asReq).toBeCloseTo(10 * t.Tu / (0.9 * 420), 9);
    expect(t.asProvided).toBeGreaterThanOrEqual(t.asReq);
    expect(r.bearing!.qMean).toBeCloseTo((600 + 25 * r.h * r.B * r.L) / (r.B * r.L), 6);
    expect(r.edge!.columnMoment).toBeCloseTo(840 * r.ex, 6);
    expect(r.x!.mu).toBeGreaterThan(0);
  });
});

describe('a footing with a tie, by the FIUBA foundations course (§6)', () => {
  const tied = (over: Partial<FootingDemand> = {}) => footingRow(demand({ anchor: [-1, 0], source: 'row', balance: 'tie', partners: [partner('x', 5)] }, over), ctx, undefined, fmt);
  const ok = (r: ReturnType<typeof tied>, label: string) => r.verifications.find((v) => v.label === label)!.ok;

  it('checks the load, the arm, the offset, the sliding and the stretch, with bars enough for H/1000', () => {
    const r = tied();
    const t = r.edge!.ties[0]!;
    expect(t.partner).toEqual({ key: 'footing:n2', name: 'C2', L: 5 });
    expect(t.e).toBeCloseTo(r.ex, 9);
    expect(t.Ts).toBeCloseTo(600 * r.ex / t.H, 6);
    expect(t.stretch!).toBeCloseTo(t.Ts * 5 / (2e8 * t.asProvided * 1e-4), 12);
    expect(t.stretch!).toBeLessThanOrEqual(t.H / 1000 + 1e-12);
    expect(t.asReq).toBeGreaterThanOrEqual(t.Ts * 5 / (2e8 * t.H / 1000) * 1e4 - 1e-9);
    expect(t.mu).toBeCloseTo(Math.tan(20 * Math.PI / 180), 12);
    expect(t.h).toBeCloseTo(0.5, 9);
    for (const k of ['rcSheets.v.footTieLoad', 'rcSheets.v.footTieArm', 'rcSheets.v.footTieOffset', 'rcSheets.v.footTieSlide', 'rcSheets.v.footTieStretch']) expect(ok(r, k), k).toBe(true);
  });

  it('fails past 120 t, under a 1,5 m arm or where friction cannot hold 1,5 times the pull', () => {
    const heavy = tied({ service: { combo: 'D + L', N: 1300, Mx: 0, My: 0, Vx: 0, Vy: 0 }, combos: [{ combo: 'U', N: 1800, Mx: 0, My: 0, Vx: 0, Vy: 0 }] });
    expect(ok(heavy, 'rcSheets.v.footTieLoad')).toBe(false);
    const low = tied({ column: { b: 0.3, h: 0.3, storey: 0.8 } });
    expect(low.edge!.ties[0]!.H).toBeLessThan(tieLimits(DEFAULT_CRITERIA).minH);
    expect(ok(low, 'rcSheets.v.footTieArm')).toBe(false);
    expect(ok(low, 'rcSheets.v.footTieOffset')).toBe(false);
    const t = low.edge!.ties[0]!;
    expect(ok(low, 'rcSheets.v.footTieSlide')).toBe(t.mu * t.Ns >= 1.5 * t.Ts);
  });

  it('pulls the footing it runs to toward the line, at the first floor, in every combination', () => {
    const r = tied();
    const inner: FootingDemand = { ...demand({ anchor: [0, 0], source: 'lines', balance: 'strap', partners: [] }), key: 'footing:n2', name: 'C2', nodeId: 2, at: { x: 5, y: 0, z: 0 }, edge: undefined };
    const pulls = tiePulls([r], (q) => q.column!.storey!, [inner]).get('footing:n2')!;
    expect(pulls).toHaveLength(1);
    expect(pulls[0]!.toward).toBe(-1);
    const t = r.edge!.ties[0]!;
    const d = withPulls(inner, pulls);
    expect(d.combos[0]!.Vx).toBeCloseTo(-t.byCombo.U!, 9);
    expect(d.combos[0]!.My).toBeCloseTo(-t.byCombo.U! * 3, 9);
    expect(d.service!.Vx).toBeCloseTo(-t.Ts, 9);
    const row = footingRow(d, ctx, undefined, fmt);
    expect(row.verifications.some((v) => v.label === 'rcSheets.v.footTiePull')).toBe(true);
    const plain = footingRow(inner, ctx, undefined, fmt);
    expect(row.B * row.L).toBeGreaterThan(plain.B * plain.L);
  });
});

describe('the footing a strap runs to (GA §12)', () => {
  const pull = (permanent?: number) => {
    const { permanent: _, ...unknown } = partner('x', 4);
    const r = footingRow(demand({ anchor: [-1, 0], source: 'lines', balance: 'strap', partners: [{ ...unknown, ...(permanent !== undefined ? { permanent } : {}) }] }), ctx, undefined, fmt);
    return { r, v: r.verifications.find((x) => x.label === 'rcSheets.v.footStrapPull')! };
  };

  it('holds the strap\'s service pull 1,5 times with its permanent load', () => {
    const { r, v } = pull(1000);
    const s = r.edge!.straps[0]!;
    expect(s.pull).toBeCloseTo(s.R1 - s.P1, 6);
    expect(v.ok).toBe(true);
    expect(v.demand).toContain('C2');
  });

  it('fails where 1,5 times the pull outweighs it', () => {
    const { r, v } = pull(10);
    expect(1.5 * r.edge!.straps[0]!.pull!).toBeGreaterThan(10);
    expect(v.ok).toBe(false);
  });

  it('does not pass with the permanent load unknown', () => {
    const { v } = pull();
    expect(v.ok).toBe(false);
    expect(v.capacity).toBe('—');
  });
});
