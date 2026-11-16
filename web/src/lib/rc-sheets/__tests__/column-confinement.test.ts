import { describe, it, expect } from 'vitest';
import { columnRow, confinedFaceBars, confinedTies, type ColumnCase, type ColumnDemand } from '../column-row';
import { columnTieLayout, confinedTieCount } from '../column-ties';
import { columnSection } from '../drawing';
import { scheduleElements } from '../schedule/pieces';
import { columnConfinement } from '../../engine/design/seismic/capacity';
import { makeFmt } from '../format';

const f = makeFmt('.');
const failing = (r: { verifications: Array<{ label: string; ok: boolean }> }) => r.verifications.filter((v) => !v.ok).map((v) => v.label);
const ctx = { mat: { fc: 30, fy: 420 }, cover: 0.03, tieDia: 8, diameters: [12, 16, 20, 25], seismic: { overstrength: 1.25 } };
const light = (pu: number): ColumnCase[] => [
  { combo: 'U1', pu, puMin: pu / 2, puD: pu, mxTop: 1.4, mxBot: -5.3, myTop: 0.25, myBot: -4, vx: 11.6, vy: 8.2 },
  { combo: 'U5', pu: 0.88 * pu, puMin: 0.38 * pu, puD: 0.86 * pu, mxTop: 2.65, mxBot: -6.1, myTop: 0.67, myBot: -3.7, vx: 13.4, vy: 7.5 },
];
const upper: ColumnDemand = {
  key: 'column:5:3', name: 'C1', level: 'N3', b: 0.35, h: 0.35, length: 3, lu: 2.2, psiTop: 0.2, psiBot: 0.2,
  cases: light(184), joints: { bottom: 0.8, top: 0.8 },
};

describe('chapter 18 confinement of a column', () => {
  it('holds Ash with crossties where the storey below keeps 3 and 4 bars a face that leave no room for a thicker hoop', () => {
    const r = columnRow(upper, ctx, undefined, f, { pattern: { nx: 3, ny: 4, maxDia: 12 }, fromBelow: true });
    expect(failing(r)).toEqual([]);
    expect(r.adopted.confined).toBeDefined();
    const ct = confinedTies(r, r.adopted, r);
    const conf = columnConfinement({ b: 0.35, h: 0.35, cover: 0.03, lu: 2.2, fc: 30, fyt: 420, longMinDiaMm: 12, tieDiaMm: r.adopted.tieDia, legsB: 2 + ct.x, legsH: 2 + ct.y, hx: ct.hx, provided: { length: 0.45, spacing: r.adopted.tieSpacing } });
    expect(conf.ashOk).toBe(true);
    expect(r.checks.crossties.confined).toEqual({ x: ct.x, y: ct.y });
    expect(r.verifications.find((v) => v.label === 'rcSheets.v.crossties')!.capacity).toContain('lo:');
  });

  it('draws, schedules and holds the joint with the crossties it designed for lo', () => {
    const r = columnRow(upper, ctx, undefined, f, { pattern: { nx: 3, ny: 4, maxDia: 12 } });
    const ct = r.checks.crossties, more = (ct.confined!.x - ct.x) + (ct.confined!.y - ct.y);
    expect(more).toBeGreaterThan(0);
    expect(columnSection(r.b, r.h, r.cover, r.adopted).ties).toHaveLength(ct.confined!.x + ct.confined!.y);
    const layout = columnTieLayout(r, 'cirsoc201-2025');
    const n = layout.ties.length, nc = confinedTieCount(layout);
    expect(nc).toBeGreaterThan(0);
    expect(nc).toBeLessThan(n);
    const el = scheduleElements({ line: [], column: [r], slab: [], wall: [] }, { code: 'cirsoc201-2025', slabCover: 0.02, endZones: false })[0]!;
    const crossties = el.pieces.filter((p) => p.kind === 'crossTie').reduce((s, p) => s + p.count, 0);
    expect(crossties).toBe(n * (ct.x + ct.y) + nc * more);
  });

  it('holds every perimeter bar, hx within 200 mm, and Ash by expression (c) above 0.3·Ag·f\'c', () => {
    const heavy: ColumnDemand = { ...upper, b: 0.45, h: 0.45, cases: light(0.36 * 0.45 * 0.45 * 30 * 1000) };
    const r = columnRow(heavy, ctx, undefined, f);
    expect(failing(r)).toEqual([]);
    const ct = confinedTies(r, r.adopted, r);
    expect(ct.held).toBe(ct.perimeter);
    expect(ct.hx).toBeLessThanOrEqual(0.2 + 1e-9);
    expect(r.steps.find((g) => g.title === 'rcSheets.g.seismic')!.steps.find((s) => s.label === 'rcSheets.s.seisColAsh')!.formula).toContain('kf·kn');
  });

  it('adds held bars in the middle of the longest run between those §25.7.2.3 holds', () => {
    expect(confinedFaceBars(0.35, 3, 12, 12, { cover: 0.03 }, 8, 1)).toEqual([2]);
    expect(confinedFaceBars(0.35, 4, 12, 12, { cover: 0.03 }, 8, 2)).toEqual([2, 3]);
    expect(confinedFaceBars(0.35, 3, 12, 12, { cover: 0.03 }, 8, 9)).toEqual([1, 2, 3]);
  });

  it('reads expression (c) of Table 18.7.5.4 only above 0.3·Ag·f\'c', () => {
    const base = { b: 0.5, h: 0.5, cover: 0.04, lu: 2.6, fc: 30, fyt: 420, longMinDiaMm: 20, tieDiaMm: 10, legsB: 4, legsH: 4, hx: 0.15, provided: { length: 0.5, spacing: 0.1 }, nl: 12 };
    const below = columnConfinement({ ...base, pu: 0.29 * 0.25 * 30 * 1000 });
    const above = columnConfinement({ ...base, pu: 0.5 * 0.25 * 30 * 1000 });
    expect(below.high).toBe(false);
    expect(columnConfinement(base).ashRequired.acrossB).toBeCloseTo(below.ashRequired.acrossB, 9);
    const kn = 12 / 10, c = 0.2 * 1 * kn * (0.5 * 0.25 * 30) / (420 * 0.42 * 0.42) * 0.1 * 0.42 * 1e4;
    expect(above.high).toBe(true);
    expect(above.hxMax).toBe(0.2);
    expect(above.ashRequired.acrossB).toBeCloseTo(c, 6);
  });
});
