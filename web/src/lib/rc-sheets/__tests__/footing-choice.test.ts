/**
 * The selection rule on columns of a few kinds, without a model: far apart each stands on its own
 * footing; three close in a line share a strip; a dense grid is a mat; asked for footings only, it
 * is still left with no overlap. A strip along a property line is held at it and its offset taken
 * by a tie at each column. The new design data survive a save and reopen.
 */
import { describe, it, expect } from 'vitest';
import { rulesFor } from '../codes';
import { chooseFoundations, groupDemand, lineOf } from '../footing-choice';
import { footingOverlaps } from '../footing-overlaps';
import { analyseGroup, tiedAcross } from '../footing-group';
import { CIRSOC_ONE_WAY } from '../footing-design';
import { CIRSOC_FOOTING_ANCHORAGE } from '../codes';
import { footingSetupOf, type FootingContext, type FootingDemand, type FootingGroup, type FootingRow, type FoundationSystem } from '../footing-types';
import { migrateDesignData } from '../../model/design-data';

const fmt = (v: number, d = 2) => v.toFixed(d);
const ctx: FootingContext = { fc: 25, fy: 420, cover: 0.05, sizing: 'minimum', diameters: [10, 12, 16, 20, 25] };
const rules = rulesFor('cirsoc201-2025');

const column = (n: number, x: number, y: number, N: number, over: Partial<FootingDemand> = {}): FootingDemand => ({
  key: `footing:n${n}`, name: `C${n}`, nodeId: n, at: { x, y, z: 0 }, column: { b: 0.4, h: 0.4, storey: 3 },
  service: { combo: 'D + L', N, Mx: 0, My: 0, Vx: 0, Vy: 0 }, lateralLeftOut: 0,
  combos: [{ combo: 'U', N: 1.4 * N, Mx: 0, My: 0, Vx: 0, Vy: 0 }], soil: { name: 'S', allowable: 150 }, ...over,
});

function choose(ds: FootingDemand[], system: FoundationSystem = 'auto'): FootingRow[] {
  const design = (d: FootingDemand) => rules.footingRow(d, ctx, undefined, fmt);
  return chooseFoundations(ds.map(design), {
    capped: (d, cap) => rules.footingRow(d, ctx, undefined, fmt, cap),
    combine: (a, b) => design({ ...a, carried: b }),
    group: (g) => design(groupDemand(g)),
  }, { system, solutions: {}, matShare: 0.5 });
}

const kinds = (rows: FootingRow[]) => rows.map((r) => r.group?.kind ?? (r.combined ? 'combined' : 'isolated')).sort();

describe('the selection rule', () => {
  it('leaves columns far apart on their own footings', () => {
    const rows = choose([column(1, 0, 0, 500), column(2, 8, 0, 500), column(3, 0, 8, 500)]);
    expect(kinds(rows)).toEqual(['isolated', 'isolated', 'isolated']);
  });

  it('puts three heavy columns close in a line on one strip, nothing overlapping', () => {
    const ds = [column(1, 0, 0, 1200), column(2, 1.5, 0, 1200), column(3, 3, 0, 1200), column(4, 20, 12, 300)];
    expect(lineOf(ds.slice(0, 3))).toBe('x');
    const rows = choose(ds);
    expect(kinds(rows)).toEqual(['isolated', 'strip']);
    const strip = rows.find((r) => r.group)!;
    expect(strip.group!.columns.map((c) => c.name)).toEqual(['C1', 'C2', 'C3']);
    expect(strip.status, JSON.stringify(strip.verifications.filter((v) => !v.ok))).toBe('ok');
    expect(footingOverlaps(rows).pairs).toEqual([]);
  });

  it('stands a dense grid on one mat, and asked for footings only still leaves no overlap', () => {
    const ds = [0, 1, 2].flatMap((i) => [0, 1, 2].map((j) => column(1 + 3 * i + j, 3 * i, 3 * j, 900)));
    const rows = choose(ds);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.group).toMatchObject({ kind: 'mat', reason: 'cover' });
    expect(rows[0]!.status, JSON.stringify(rows[0]!.verifications.filter((v) => !v.ok))).toBe('ok');
    const only = choose(ds, 'footings');
    expect(footingOverlaps(only).pairs).toEqual([]);
    expect(only.flatMap((r) => r.demand.group?.members ?? (r.demand.carried ? [r.demand, r.demand.carried] : [r.demand])).map((d) => d.key).sort()).toEqual(ds.map((d) => d.key).sort());
  });
});

describe('a strip along a property line', () => {
  const edge = { anchor: [0, -1] as [number, number], source: 'lines' as const, balance: 'tie' as const, partners: [] };
  const members = [column(1, 0, 0, 600, { edge }), column(2, 4, 0, 600, { edge }), column(3, 8, 0, 600, { edge })];
  const g: FootingGroup = { kind: 'strip', members, axis: 'x', reason: 'overlap' };

  it('is held at the line and takes its offset across by a tie at each column: Tu = Nu·e/H', () => {
    expect(tiedAcross(g)).toBe(true);
    const row = rules.footingRow(groupDemand(g), ctx, undefined, fmt);
    expect(row.ey - row.L / 2).toBeCloseTo(-0.2, 9);
    const r = analyseGroup(g, ctx, row.adopted, { ...CIRSOC_ONE_WAY, anchorage: CIRSOC_FOOTING_ANCHORAGE });
    expect(r.bearing!.qMax).toBeCloseTo(r.bearing!.qMean, 6);
    expect(r.ties).toHaveLength(3);
    for (const t of r.ties) {
      const e = row.L / 2 - 0.2;
      expect(t.e).toBeCloseTo(e, 9);
      expect(t.Tu).toBeCloseTo((840 * e) / (3 + row.h), 6);
    }
    expect(row.verifications.some((v) => v.label === 'rcSheets.v.footTieSlide')).toBe(true);
  });
});

describe('the foundation in the design data', () => {
  it('keeps the founding level, the project\'s system and each row\'s solution through a save and reopen', () => {
    const raw = JSON.parse(JSON.stringify({ foundingElevation: -1.8, rcSheets: { version: 1, adopted: {}, foundationSystem: 'mat', footingSetup: { 'footing:n3': { solution: 'combined' }, 'footing:n4': { solution: 'nope' } } } }));
    const d = migrateDesignData(raw);
    expect(d.foundingElevation).toBe(-1.8);
    expect(d.rcSheets?.foundationSystem).toBe('mat');
    expect(d.rcSheets?.footingSetup).toEqual({ 'footing:n3': { solution: 'combined' } });
    expect(migrateDesignData({ foundingElevation: 99 }).foundingElevation).toBeUndefined();
    expect(migrateDesignData({ rcSheets: { adopted: {}, foundationSystem: 'caissons' } }).rcSheets?.foundationSystem).toBeUndefined();
    expect(migrateDesignData({ rcSheets: { adopted: {}, foundationSystem: 'piles' } }).rcSheets?.foundationSystem).toBe('piles');
    expect(footingSetupOf({ a: { solution: 'isolated', position: 'edge' } })).toEqual({ footingSetup: { a: { position: 'edge', solution: 'isolated' } } });
  });
});
