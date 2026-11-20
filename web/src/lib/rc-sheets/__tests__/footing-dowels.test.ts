/**
 * The dowels a footing gives what stands on it, one by one: under a column's bars, or under every
 * vertical of the walls and every bar of the column zones of a pier, each of its own diameter and
 * lap; the foot out of the column, turned in where it would leave the concrete at a property line;
 * the walls' laps designed and their verticals cranked into the storey above as the columns' are.
 */
import { describe, it, expect } from 'vitest';
import { columnRow, type ColumnDemand } from '../column-row';
import { CRANK_SLOPE } from '../column-stack';
import { dowelFoot, dowelGroups, dowelPlaces, dowelShape, dowelsText, type DowelRow } from '../footing-dowels';
import { firstLevel, wallDetail, wallInward, wallLevels } from '../wall-detail';
import { verticalLap, verticalLaps, wallInTension, wallRow, type WallDemand } from '../wall-row';
import { tensionLap } from '../column-row';
import { compressionLapMm } from '../../codes/cirsoc201/anchorage';
import { scheduleElements, wallVerticalPieces } from '../schedule/pieces';
import { rulesFor } from '../codes';
import { makeFmt } from '../format';
import { developedLength } from '../shape';

const f = makeFmt('.');
const R = rulesFor('cirsoc201-2025').bends;
const mat = { fc: 25, fy: 420 };

const footing = (over: { B?: number; ex?: number; count?: number; dia?: number; bars?: NonNullable<NonNullable<DowelRow['demand']['column']>['bars']> } = {}): DowelRow => ({
  adopted: { B: over.B ?? 2, L: 2, h: 0.5, ex: over.ex ?? 0, ey: 0, x: { dia: 12, spacing: 0.2 }, y: { dia: 12, spacing: 0.2 }, dowels: { count: over.count ?? 8, dia: over.dia ?? 16 } },
  cover: 0.05,
  demand: { at: { x: 0, y: 0, z: 0 }, column: { b: 0.4, h: 0.4, ...(over.bars ? { bars: over.bars } : {}) } },
  dowels: { count: over.count ?? 8, dia: over.dia ?? 16, ldc: 0.3, available: 0.4, lap: 0.48, tension: false, above: 0, offset: 0.016 },
}) as never;

const colDemand: ColumnDemand = {
  key: 'column:1:0', name: 'C1', level: 'N0', b: 0.4, h: 0.4, length: 3, lu: 2.6, psiTop: 1, psiBot: 1,
  cases: [{ combo: 'U', pu: 1200, puMin: 1100, mxTop: 10, mxBot: -10, myTop: 5, myBot: -5, vx: 5, vy: 5 }],
};

describe('a column footing\'s dowels', () => {
  const col = columnRow(colDemand, { mat, cover: 0.025, tieDia: 8, diameters: [16] }, { corner: 16, nx: 1, dx: 16, ny: 1, dy: 16, tieDia: 8, tieSpacing: 0.15 }, f, { fromBelow: true, onFooting: true });

  it('stand under the column\'s bars with their feet out of it, cranked in one diameter at 1:6 and the lap over the top', () => {
    const r = footing(), places = dowelPlaces(r, R, { first: col });
    expect(places).toHaveLength(8);
    for (const p of places) {
      expect(p.inward).toBe(false);
      expect(Math.hypot(p.x, p.y)).toBeGreaterThan(0.1);
      expect(p.out[0] * p.x + p.out[1] * p.y).toBeGreaterThan(0);
    }
    const [g] = dowelGroups(r, places, R);
    expect(g!.count).toBe(8);
    const s = dowelShape(r, places[0]!, R);
    const [, , bend, crank, top] = s.shape.pts;
    expect(-crank![0]).toBeCloseTo(0.016, 9);
    expect((crank![1] - bend![1]) * CRANK_SLOPE).toBeCloseTo(0.016, 9);
    expect(top![1] - crank![1]).toBeCloseTo(0.48, 9);
    expect(s.z + crank![1]).toBeCloseTo(0.5, 9);
  });

  it('turn their feet in at a property line, where out of the column would leave the concrete, and keep them inside', () => {
    const r = footing({ B: 1.2, ex: -0.4 }), places = dowelPlaces(r, R, { first: col });
    const hx = 1.2 / 2 - 0.05;
    expect(places.filter((p) => p.inward).length).toBeGreaterThan(0);
    expect(places.filter((p) => !p.inward).length).toBeGreaterThan(0);
    for (const p of places) {
      const sgn = p.inward ? -1 : 1, foot = dowelFoot(p.dia, R);
      expect(Math.abs(p.x + sgn * p.out[0] * foot)).toBeLessThanOrEqual(hx + 1e-9);
      if (p.inward) expect(dowelShape(r, p, R).shape.pts[0]![0]).toBeCloseTo(-foot, 9);
    }
    const groups = dowelGroups(r, places, R);
    expect(groups.reduce((s, g) => s + g.count, 0)).toBe(8);
    expect(new Set(groups.map((g) => Math.round(developedLength(g.shape) * 1e6))).size).toBe(1);
  });
});

describe('a pier\'s or a wall\'s footing dowels', () => {
  const at = [
    ...Array.from({ length: 4 }, (_, i) => ({ x: -0.3 + 0.2 * i, y: 0.05, n: [0, -1] as [number, number], dia: 16, lap: 0.8 })),
    ...Array.from({ length: 6 }, (_, i) => ({ x: -0.5 + 0.2 * i, y: -0.05, n: [0, 1] as [number, number], dia: 12, lap: 0.6 })),
  ];
  const r = footing({ count: 10, dia: 16, bars: { count: 10, dia: 16, tension: true, area: 0, at } });

  it('stand one under each of its bars, of that bar\'s diameter and lapped over its lap', () => {
    const places = dowelPlaces(r, R);
    expect(places.map((p) => [p.dia, p.lap])).toEqual(at.map((b) => [b.dia, b.lap]));
    for (const [i, p] of places.entries()) expect(p.out).toEqual([-at[i]!.n[0], -at[i]!.n[1]]);
    expect(places.every((p) => Math.abs(p.offset - p.dia / 1000) < 1e-12)).toBe(true);
    const groups = dowelGroups(r, places, R);
    expect(groups.map((g) => [g.shape.dia, g.count])).toEqual([[16, 4], [12, 6]]);
    expect(dowelsText(r)).toBe('4 Ø16 + 6 Ø12');
    const el = scheduleElements({ line: [], column: [], slab: [], wall: [], footing: [{ ...r, B: 2, x: null, y: null, layers: { lower: 'x', dx: 0.4, dy: 0.39, d: 0.4 } } as never] }, { code: 'cirsoc201-2025', slabCover: 0.02 });
    expect(el[0]!.pieces.filter((p) => p.kind === 'dowel').map((p) => [p.shape.dia, p.count])).toEqual([[16, 4], [12, 6]]);
  });

  it('take one diameter for all where another is adopted', () => {
    const own = footing({ count: 10, dia: 20, bars: { count: 10, dia: 16, tension: true, area: 0, at } });
    expect(new Set(dowelPlaces(own, R).map((p) => p.dia))).toEqual(new Set([20]));
    expect(dowelsText(own)).toBe('10 Ø20');
  });
});

describe('a wall\'s verticals', () => {
  const d: WallDemand = { key: 'wall:1:0', name: 'M1', level: 'N0', length: 3, height: 3, thickness: 0.2, combos: [{ combo: 'U', pu: 900, mu: 100, vu: 50, muV: 0, muH: 0 }] };
  const ctx = { mat, cover: 0.025, barDia: 10, diameters: [10, 12, 16] };

  it('lap in compression by §25.5.5.1 where both ends stay compressed, in tension (never shorter) where one is pulled', () => {
    expect(wallInTension(d)).toBe(false);
    expect(wallInTension({ ...d, combos: [{ ...d.combos[0]!, pu: 100, mu: 600 }] })).toBe(true);
    expect(verticalLap(mat, 12, false)).toBeCloseTo(compressionLapMm(420, 12, 25) / 1000, 9);
    expect(verticalLap(mat, 12, true)).toBeCloseTo(Math.max(tensionLap(mat, 12), compressionLapMm(420, 12, 25) / 1000), 9);
    const row = wallRow(d, ctx, undefined, f);
    expect(row.vLaps!.every((x) => !x.tension && Math.abs(x.lap - verticalLap(mat, x.dia, false)) < 1e-12)).toBe(true);
    const pulled = wallRow({ ...d, combos: [{ ...d.combos[0]!, pu: 100, mu: 600 }] }, ctx, undefined, f);
    expect(pulled.vLaps!.every((x) => x.tension)).toBe(true);
    expect(verticalLaps({ mat }, row.adopted, true)[0]!.lap).toBeGreaterThanOrEqual(verticalLaps({ mat }, row.adopted, false)[0]!.lap);
  });

  it('go on into the storey above cranked in one diameter at 1:6 over the lap, toward the middle plane, and hook into the slab at the top', () => {
    const low = wallRow(d, ctx, undefined, f), up = wallRow({ ...d, key: 'wall:1:1', level: 'N1' }, ctx, undefined, f);
    const dia = low.adopted.vertical.diameter;
    const { lap, crank, pieces } = wallVerticalPieces(low, up, dia, false, low.adopted.horizontal.diameter, R);
    expect(crank).toBeCloseTo(dia / 1000, 9);
    const top = pieces.at(-1)!.shape.pts;
    expect(top.at(-1)![0] - top.at(-2)![0]).toBeCloseTo(lap, 9);
    expect(top.at(-2)![0]).toBeCloseTo(3, 9);
    expect((top.at(-2)![0] - top.at(-3)![0]) * CRANK_SLOPE).toBeCloseTo(crank, 9);
    expect(wallVerticalPieces(up, undefined, dia, false, 10, R).crank).toBe(0);
    expect(wallInward({ x: 0.5, y: 0.05 }, low)).toEqual([0, 1]);
    expect(wallInward({ x: 0.5, y: 0.1 }, low)).toEqual([1, 0]);
  });

  it('on a footing start their horizontals and hoops min(5 cm; s/2) over its top, and say so with their dowels', () => {
    const row = { ...wallRow(d, ctx, undefined, f), onFooting: true as const };
    expect(firstLevel(row, 0.2)).toBe(0.05);
    expect(firstLevel({}, 0.2)).toBeCloseTo(0.1, 12);
    expect(wallLevels(3, 0.2, Infinity, 0.05)[0]).toBe(0.05);
    expect(wallLevels(3, 0.2)).toEqual(wallLevels(3, 0.2, Infinity, 0.1));
    expect(wallDetail(row, 'cirsoc201-2025').notes.map((n) => n.key)).toContain('rcSheets.wallFig.n.dowels');
  });
});
