/**
 * A column storey over another: the bars below go on up with their pattern, inner rows dropped
 * before kept; a lap between bars of two sizes reads the larger bar; and a storey whose faces step
 * in takes the bars from below cranked 1:6 below 75 mm and separate dowels from there on, the
 * elevation drawing the crank.
 */
import { describe, it, expect } from 'vitest';
import { columnRow, columnSplice, type ColumnDemand } from '../column-row';
import { mixedLap, stackOver, stackStep, CRANK_LIMIT } from '../column-stack';
import { columnRow as ts500Column } from '../ts500/column';
import { rulesFor } from '../codes';
import { deriveCompressionDevelopment } from '../../codes/cirsoc201/anchorage';
import { columnElevationPrimitives } from '../plans/column-elevation';
import { makeFmt } from '../format';
import type { ColumnAdopted } from '../types';

const f = makeFmt('.');
const ctx = { mat: { fc: 25, fy: 420 }, cover: 0.025, tieDia: 8, diameters: [12, 16, 20, 25] };
const storey = (b: number, pu: number, m: number): ColumnDemand => ({
  key: 'column:1:1', name: 'C1', level: 'N1', b, h: b, length: 3, lu: 2.5, psiTop: 1, psiBot: 1,
  cases: [{ combo: 'U', pu, puMin: pu * 0.95, mxTop: m, mxBot: -m, myTop: m / 4, myBot: -m / 4, vx: 10, vy: 5 }],
  joints: { bottom: 0.5, top: 0.5 },
});
const ec2Column = rulesFor('en1992-1-1').columnRow;
const labels = (r: { verifications: Array<{ label: string }> }) => r.verifications.map((v) => v.label);

describe('the lap of the bars from below', () => {
  it('reads the larger bar where the storey below has larger ones (ACI 318-19 §25.5.5.4)', () => {
    const own: ColumnAdopted = { corner: 16, nx: 1, dx: 16, ny: 1, dy: 16, tieDia: 8, tieSpacing: 0.15 };
    const plain = columnRow(storey(0.4, 900, 10), ctx, own, f, { fromBelow: true });
    const mixed = columnRow(storey(0.4, 900, 10), ctx, own, f, { fromBelow: true, belowDia: 25 });
    expect(plain.lap!.tension).toBe(false);
    const ldc25 = deriveCompressionDevelopment({ diameterMm: 25, fy: 420, fc: 25, edition: '2025' }).ldcM;
    expect(plain.lap!.length).toBeCloseTo(columnSplice(ctx, 16, false).length, 9);
    expect(mixed.lap!.length).toBeCloseTo(Math.max(columnSplice(ctx, 16, false).length, ldc25), 9);
    expect(mixed.lap!.length).toBeGreaterThan(plain.lap!.length);
    const v = mixed.verifications.find((x) => x.label === 'rcSheets.v.colSpliceC')!;
    expect(v.clause).toContain('§25.5.5.4');
    expect(v.capacity).toContain('Ø25/16');
  });

  it('keeps its own lap where the bars below are no larger', () => {
    expect(mixedLap(0.5, 16, 16, () => 9)).toBe(0.5);
    expect(mixedLap(0.5, 16, 12, () => 9)).toBe(0.5);
    expect(mixedLap(0.5, 16, undefined, () => 9)).toBe(0.5);
    expect(mixedLap(0.5, 16, 20, () => 0.7)).toBe(0.7);
  });

  it('reads the larger bar in EN 1992 and TS 500 too', () => {
    const own: ColumnAdopted = { corner: 16, nx: 1, dx: 16, ny: 1, dy: 16, tieDia: 8, tieSpacing: 0.15 };
    for (const row of [ec2Column, ts500Column]) {
      const plain = row(storey(0.4, 900, 10), ctx, own, f, { fromBelow: true });
      const mixed = row(storey(0.4, 900, 10), ctx, own, f, { fromBelow: true, belowDia: 25 });
      expect(mixed.lap!.length).toBeGreaterThan(plain.lap!.length);
    }
  });
});

describe('a storey whose faces step in', () => {
  it('cranks the bars from below at 1:6 below 75 mm a face and takes separate dowels from there on', () => {
    expect(stackStep(0)).toBeNull();
    expect(stackStep(0.025)).toEqual({ offset: 0.025, dowels: false });
    expect(stackStep(CRANK_LIMIT)).toEqual({ offset: CRANK_LIMIT, dowels: true });
    const below = columnRow(storey(0.4, 900, 20), ctx, undefined, f);
    for (const row of [columnRow, ec2Column, ts500Column]) {
      const cranked = row(storey(0.35, 700, 15), ctx, undefined, f, stackOver(below, { b: 0.35, h: 0.35 }));
      expect(cranked.step).toEqual({ offset: expect.closeTo(0.025, 9), dowels: false });
      expect(labels(cranked)).toContain('rcSheets.v.colCrank');
      expect(labels(cranked)).not.toContain('rcSheets.v.colOffset');
      const doweled = row(storey(0.25, 400, 5), ctx, undefined, f, stackOver(below, { b: 0.25, h: 0.25 }));
      expect(doweled.step).toEqual({ offset: expect.closeTo(0.075, 9), dowels: true });
      expect(labels(doweled)).toContain('rcSheets.v.colOffset');
      const same = row(storey(0.4, 700, 15), ctx, undefined, f, stackOver(below, { b: 0.4, h: 0.4 }));
      expect(same.step).toBeUndefined();
    }
  });

  it('draws the bars from below cranked into the storey, the slope 1:6, by the step and one bar\'s diameter in, and the footing\'s dowels under the bottom storey', () => {
    const below = columnRow(storey(0.4, 900, 20), ctx, undefined, f);
    const row = columnRow(storey(0.35, 700, 15), ctx, undefined, f, stackOver(below, { b: 0.35, h: 0.35 }));
    const opts = { scale: 25, fmt: f, tr: (k: string) => k, code: 'cirsoc201-2025', endZones: false, group: 'g' } as never;
    const inclinedOf = (r: typeof row) => columnElevationPrimitives(r, opts).filter((p) => p.kind === 'line' && p.layer.startsWith('ST-ARM-LONG') && Math.abs((p as { a: { x: number } }).a.x - (p as { b: { x: number } }).b.x) > 1) as Array<{ a: { x: number; y: number }; b: { x: number; y: number } }>;
    const by = 25 + row.adopted.corner / Math.SQRT2;
    expect(inclinedOf(row).length).toBe(2);
    for (const p of inclinedOf(row)) {
      expect(Math.abs(p.b.x - p.a.x)).toBeCloseTo(by, 6);
      expect(Math.abs(p.b.y - p.a.y)).toBeCloseTo(6 * by, 6);
    }
    const bottom = columnRow({ ...storey(0.4, 900, 20), joints: { bottom: 0, top: 0.5 } }, ctx, undefined, f, { fromBelow: true, onFooting: true });
    expect(bottom.onFooting).toBe(true);
    const labels = columnElevationPrimitives(bottom, opts).filter((p) => p.kind === 'text').map((p) => (p as { text: string }).text);
    expect(labels).toContain('rcSheets.elev.footDowels');
    for (const p of inclinedOf(bottom)) expect(Math.abs(p.b.y - p.a.y)).toBeCloseTo(6 * Math.abs(p.b.x - p.a.x), 6);
    expect(inclinedOf(bottom).length).toBe(2);
  });
});

describe('the pattern a storey keeps from the one below', () => {
  it('passes the rows inside the faces up with the pattern and the largest bar below, inner bars included', () => {
    const a: ColumnAdopted = { corner: 20, nx: 2, dx: 20, ny: 2, dy: 20, tieDia: 8, tieSpacing: 0.15, inner: { nx: 1, ny: 1, dia: 25 } };
    expect(stackOver({ adopted: a, b: 0.6, h: 0.6 }, { b: 0.6, h: 0.6 })).toEqual({
      pattern: { nx: 2, ny: 2, maxDia: 25, inner: { nx: 1, ny: 1 } }, fromBelow: true, offset: 0, belowDia: 25,
    });
  });

  it('drops the rows inside the faces before it keeps them, and keeps them where the outer bars alone fall short', () => {
    const pattern = { nx: 1, ny: 1, maxDia: 25, inner: { nx: 1, ny: 1, dia: 25 } };
    const light = columnRow(storey(0.5, 1200, 20), ctx, undefined, f, { pattern, fromBelow: true });
    expect([light.adopted.nx, light.adopted.ny]).toEqual([1, 1]);
    expect(light.adopted.inner).toBeUndefined();
    const heavy = columnRow(storey(0.5, 3000, 260), ctx, undefined, f, { pattern, fromBelow: true });
    expect(heavy.status).not.toBe('fail');
    expect(heavy.adopted).toMatchObject({ corner: 25, nx: 1, ny: 1, inner: { nx: 1, ny: 1, dia: 25 } });
  });
});
