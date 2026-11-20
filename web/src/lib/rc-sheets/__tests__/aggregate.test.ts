import { describe, it, expect, afterEach } from 'vitest';
import { defaultDesignData, migrateDesignData, migrateStoredDesignData } from '../../model/design-data';
import { minClearSpacing, setBeamAggregate } from '../bars';
import { columnLayout, rowClear } from '../column-layout';
import { columnRow, type ColumnDemand } from '../column-row';
import { minClear } from '../ec2/basis';
import { rulesFor } from '../codes';
import { optionRule } from '../design-options';
import { makeFmt } from '../format';
import { DEFAULT_AGGREGATE_MM, type ColumnAdopted } from '../types';

const fmt = makeFmt('.');
const col: ColumnDemand = { key: 'column:1:0', name: 'C1', b: 0.4, h: 0.4, length: 3, lu: 2.6, psiTop: 1, psiBot: 1, cases: [] };
const ok = (r: ReturnType<typeof columnRow>, label: string) => r.verifications.find((v) => v.label === label)?.ok;

afterEach(() => setBeamAggregate(DEFAULT_AGGREGATE_MM));

describe('the largest aggregate of the design data', () => {
  it('defaults to 19 mm, keeps what is stated within 6 to 50 mm, and is not stored when nobody stated it', () => {
    expect(defaultDesignData().maxAggregateMm).toBe(19);
    expect(migrateDesignData({ maxAggregateMm: 25 }).maxAggregateMm).toBe(25);
    expect(migrateDesignData({ maxAggregateMm: 80 }).maxAggregateMm).toBe(19);
    expect(migrateDesignData({ maxAggregateMm: 'x' }).maxAggregateMm).toBe(19);
    expect(migrateStoredDesignData({ covers: {} })).not.toHaveProperty('maxAggregateMm');
    expect(migrateStoredDesignData({ maxAggregateMm: 25 })).toMatchObject({ maxAggregateMm: 25 });
  });

  it('cites its clause under each code, and says it is not applied under TS 500', () => {
    expect(optionRule('aggregate', 'cirsoc201-2025').clause).toContain('§25.2.1, §25.2.3');
    expect(optionRule('aggregate', 'en1992-1-1').clause).toContain('8.2(2)');
    expect(optionRule('aggregate', 'ts500-2000').off).toBe('designData.opt.off.aggregateTs500');
  });

  it('keeps a beam\'s bars 4/3·dagg apart where that passes 25 mm and db (§25.2.1)', () => {
    expect(minClearSpacing(16)).toBeCloseTo(Math.max(0.025, 0.016, (4 / 3) * 0.019), 12);
    setBeamAggregate(30);
    expect(minClearSpacing(16)).toBeCloseTo(0.04, 12);
    setBeamAggregate(10);
    expect(minClearSpacing(16)).toBeCloseTo(0.025, 12);
  });

  it('keeps a column\'s bars and rows 4/3·dagg apart where that passes 40 mm and 1.5·db (§25.2.3), and EN 1992\'s dg + 5 mm (8.2(2))', () => {
    const a: ColumnAdopted = { corner: 16, nx: 4, dx: 16, ny: 4, dy: 16, tieDia: 8, tieSpacing: 0.15 };
    const ctx = { mat: { fc: 30, fy: 420 }, cover: 0.03, tieDia: 8, diameters: [16] };
    expect(ok(columnRow(col, { ...ctx, aggregate: 19 }, a, fmt), 'rcSheets.v.colSpacing')).toBe(true);
    expect(ok(columnRow(col, { ...ctx, aggregate: 38 }, a, fmt), 'rcSheets.v.colSpacing')).toBe(false);
    expect(rowClear(16, 45)).toBeCloseTo(0.06, 12);
    const inner = { ...a, nx: 2, ny: 2, inner: { nx: 2, ny: 0, dia: 16 } };
    const y = (agg: number) => Math.max(...columnLayout(col, inner, 0.03, agg).rows[0]!.xs.map(() => columnLayout(col, inner, 0.03, agg).rows[0]!.yIn));
    expect(y(19) - y(45)).toBeCloseTo(0.06 - 0.04, 9);
    expect(minClear(16, 32)).toBeCloseTo(0.037, 12);
    const ec2 = rulesFor('en1992-1-1').columnRow;
    const dense = { ...a, nx: 6, ny: 6 };
    expect(ok(ec2(col, { ...ctx, aggregate: 16 }, dense, fmt), 'rcSheets.v.colSpacing')).toBe(true);
    expect(ok(ec2(col, { ...ctx, aggregate: 32 }, dense, fmt), 'rcSheets.v.colSpacing')).toBe(false);
  });
});
