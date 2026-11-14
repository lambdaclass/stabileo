import { describe, it, expect } from 'vitest';
import { closedHoop, crankedBar, developedLength, hookedStraight, shapeWeight, type BarShape } from '../../shape';
import { columnRow, type ColumnDemand } from '../../column-row';
import { columnTieLayout } from '../../column-ties';
import { slabRow } from '../../slab-row';
import { wallRow, type WallDemand } from '../../wall-row';
import { beamRow, type BeamDemand, type SectionEnv } from '../../beam-row';
import { beamLine } from '../../beam-line';
import { makeFmt } from '../../format';
import { rulesFor } from '../../codes';
import { assignMarks, scheduleOf, bendingSchedule, letterMark } from '../schedule';
import { MAX_CRANK, scheduleElements, spread, stirrupsOver, type ScheduleElement } from '../pieces';
import { scheduleCsv, scheduleSheet, shapeText } from '../exports';
import { rcSheetsWorkbook } from '../../workbook';

const f = makeFmt('.');
const bar = (len: number, dia = 16): BarShape => hookedStraight(0, len, 0, dia, 0.096, [false, false], 1, 0);
const hooked = (len: number, start: boolean): BarShape => hookedStraight(0, len, 0, 16, 0.096, [start, !start], 1, 0.192);
const el = (key: string, pieces: ScheduleElement['pieces'], o: Partial<ScheduleElement> = {}): ScheduleElement => ({ key, name: key, family: 'column', pieces, ...o });

describe('schedule marks', () => {
  it('the same shape, diameter and length is one mark in an element, whichever end comes first; another length is another', () => {
    const [e] = assignMarks([el('C1', [{ kind: 'column', count: 2, shape: hooked(3, true) }, { kind: 'column', count: 3, shape: hooked(3, false) }, { kind: 'column', count: 4, shape: hooked(3.2, true) }])], 'element');
    expect(e!.marks.map((m) => [m.mark, m.count])).toEqual([['A', 5], ['B', 4]]);
  });

  it('a line keeps its elevation letters, equal bars under the first, and its stirrups take the next free letters', () => {
    const [e] = assignMarks([el('V1', [
      { kind: 'continuous', count: 2, shape: bar(9), elevation: 'A' },
      { kind: 'support', count: 2, shape: bar(2.4), elevation: 'B' },
      { kind: 'support', count: 2, shape: bar(2.4), elevation: 'C' },
      { kind: 'stirrup', count: 30, shape: closedHoop(0.24, 0.54, 8, 0.032, 0.075) },
    ], { family: 'beam' })], 'element');
    expect(e!.marks.map((m) => [m.mark, m.count, m.elevation.join()])).toEqual([['A', 2, 'A'], ['B', 4, 'B,C'], ['D', 30, '']]);
  });

  it('over a level or the project marks are numbered, one number for one piece wherever it is', () => {
    const els = [el('C1', [{ kind: 'column', count: 4, shape: bar(3) }], { level: 'N1' }), el('C2', [{ kind: 'column', count: 4, shape: bar(3.5) }, { kind: 'column', count: 4, shape: bar(3) }], { level: 'N2' })];
    expect(assignMarks(els, 'project').map((e) => e.marks.map((m) => m.mark))).toEqual([['1'], ['2', '1']]);
    expect(assignMarks(els, 'level').map((e) => e.marks.map((m) => m.mark))).toEqual([['1'], ['1', '2']]);
  });

  it('letters run on past Z as the elevations write them', () => {
    expect([letterMark(0), letterMark(25), letterMark(26), letterMark(27)]).toEqual(['A', 'Z', 'A1', 'B1']);
  });
});

describe('schedule rows and totals', () => {
  const els = [
    el('C1', [{ kind: 'column', count: 4, shape: bar(5) }, { kind: 'hoop', count: 20, shape: closedHoop(0.24, 0.24, 8, 0.032, 0.075) }], { level: 'N1' }),
    el('C2', [{ kind: 'column', count: 4, shape: bar(5) }, { kind: 'hoop', count: 20, shape: closedHoop(0.24, 0.24, 8, 0.032, 0.075) }], { level: 'N1' }),
    el('L1', [{ kind: 'slabBottom', count: 10, shape: bar(13, 10) }], { family: 'slab', level: 'N1' }),
  ];

  it('equal elements are one row group: per element, how many, and the total', () => {
    const s = scheduleOf(els, { code: 'cirsoc201-2025' });
    const col = s.rows.filter((r) => r.family === 'column');
    expect(col.map((r) => [r.element, r.mark, r.perElement, r.equal, r.total])).toEqual([['C1 = C2', 'A', 4, 2, 8], ['C1 = C2', 'B', 20, 2, 40]]);
    expect(col[0]!.unitLength).toBeCloseTo(5, 9);
    expect(col[0]!.totalLength).toBeCloseTo(40, 9);
    expect(col[0]!.kg).toBeCloseTo(shapeWeight(bar(5), 8), 9);
  });

  it('sums by diameter with the waste added, by family, and counts the stock bars each mark is cut from', () => {
    const s = scheduleOf(els, { code: 'cirsoc201-2025', waste: 0.15 });
    const kg16 = shapeWeight(bar(5), 8), kg8 = shapeWeight(closedHoop(0.24, 0.24, 8, 0.032, 0.075), 40), kg10 = shapeWeight(bar(13, 10), 10);
    expect(s.byDiameter.map((d) => d.dia)).toEqual([8, 10, 16]);
    const d16 = s.byDiameter.find((d) => d.dia === 16)!;
    expect(d16.kg).toBeCloseTo(kg16, 9);
    expect(d16.withWaste).toBeCloseTo(kg16 * 1.15, 9);
    // Eight 5 m bars: two from each 12 m bar.
    expect(d16.stockBars).toBe(4);
    // A 13 m bar takes a stock bar each, and is said to be spliced.
    expect(s.byDiameter.find((d) => d.dia === 10)!.stockBars).toBe(10);
    expect(s.rows.find((r) => r.dia === 10)!.long).toBe(true);
    expect(s.byFamily.map((x) => x.family)).toEqual(['column', 'slab']);
    expect(s.byFamily[0]!.kg).toBeCloseTo(kg16 + kg8, 9);
    expect(s.total.kg).toBeCloseTo(kg16 + kg8 + kg10, 9);
    expect(s.total.withWaste).toBeCloseTo((kg16 + kg8 + kg10) * 1.15, 9);
    expect(scheduleOf(els, { code: 'cirsoc201-2025' }).waste).toBe(0.1);
  });

  it('TS 500 bends to the ACI rule and says so; the other codes cite their own clauses', () => {
    expect(scheduleOf(els, { code: 'ts500-2000' }).confirm).toBe('rcSheets.bbs.confirmTs500');
    expect(scheduleOf(els, { code: 'aci318-19' }).confirm).toBeUndefined();
    expect(scheduleOf(els, { code: 'en1992-1-1' }).clause).toBe('8.3, 8.4.1, 8.5');
  });

  it('writes a CSV and a workbook sheet with the table, the diameters with waste and the families', () => {
    const s = scheduleOf(els, { code: 'cirsoc201-2025' });
    const csv = scheduleCsv(s, (k) => k).split('\n');
    expect(csv[0]).toContain('rcSheets.bbs.mark');
    expect(csv.filter((l) => l.startsWith('C1 = C2'))).toHaveLength(2);
    expect(csv.some((l) => l.includes('kg + 10 %'))).toBe(true);
    const sheet = scheduleSheet(s, (k) => k, 'CIRSOC 201-2025');
    expect(sheet.name).toBe('rcSheets.bbs.title');
    expect(sheet.rows[2]).toContain('a=500');
    expect(shapeText(closedHoop(0.24, 0.24, 8, 0.032, 0.075)).split(' ')).toHaveLength(6);
  });
});

describe('pieces of each family', () => {
  const ctx = { mat: { fc: 30, fy: 420 }, cover: 0.03, tieDia: 8, diameters: [12, 16, 20, 25] };
  const demand = (k: number, b: number): ColumnDemand => ({ key: `column:1:${k}`, name: 'C1', level: `N${k}`, b, h: b, length: 3, lu: 2.7, psiTop: 1.5, psiBot: 1.5, cases: [{ combo: 'U', pu: 900, mxTop: 40, mxBot: -20, myTop: 10, myBot: -5, vx: 20, vy: 8 }] });
  const stack = (upper: number) => {
    const low = columnRow(demand(0, 0.4), ctx, undefined, f);
    const high = columnRow(demand(1, upper), ctx, undefined, f, { fromBelow: true, offset: (0.4 - upper) / 2 });
    return { low, high, els: scheduleElements({ line: [], column: [low, high], slab: [], wall: [] }, { code: 'cirsoc201-2025', slabCover: 0.02 }) };
  };
  const R = rulesFor('cirsoc201-2025').bends;

  it('a column storey laps its bars into the storey above, and the top storey hooks them into the slab', () => {
    const { low, high, els } = stack(0.4);
    const longLow = els[0]!.pieces.filter((p) => p.kind === 'column');
    expect(longLow.reduce((s, p) => s + p.count, 0)).toBe(4 + 2 * low.adopted.nx + 2 * low.adopted.ny);
    expect(developedLength(longLow[0]!.shape)).toBeCloseTo(3 + high.lap!.length, 9);
    const top = els[1]!.pieces.find((p) => p.kind === 'column')!;
    expect(top.shape.pts).toHaveLength(3);
    expect(top.shape.pts[2]![1] - top.shape.pts[1]![1]).toBeCloseTo((top.shape.mandrel + top.shape.dia / 1000) / 2 + R.extension(top.shape.dia, 90, 'longitudinal'), 9);
  });

  it('its hoops are as many as the elevation places, each with its 135° hooks, and its cross ties beside them', () => {
    const { low, els } = stack(0.4);
    const hoop = els[0]!.pieces.find((p) => p.kind === 'hoop')!;
    expect(hoop.count).toBe(columnTieLayout(low, 'cirsoc201-2025').ties.length);
    const w = 0.4 - 2 * 0.03 - low.adopted.tieDia / 1000;
    expect(developedLength(hoop.shape)).toBeCloseTo(developedLength(closedHoop(w, w, low.adopted.tieDia, R.mandrel(low.adopted.tieDia, 'transverse'), R.extension(low.adopted.tieDia, 135, 'transverse'))), 9);
    const ties = els[0]!.pieces.filter((p) => p.kind === 'crossTie').reduce((s, p) => s + p.count, 0);
    expect(ties).toBe(hoop.count * (low.checks.crossties.x + low.checks.crossties.y));
  });

  it('bars crank in where the faces above step in by 75 mm at most; past that they hook and dowels are lapped in', () => {
    const cranked = stack(0.3);
    const c = cranked.els[0]!.pieces.find((p) => p.kind === 'cranked')!;
    const want = crankedBar(3, 0.05, cranked.high.lap!.length, c.shape.dia, c.shape.mandrel);
    c.shape.pts.forEach((p, i) => { expect(p[0]).toBeCloseTo(want.pts[i]![0], 9); expect(p[1]).toBeCloseTo(want.pts[i]![1], 9); });
    expect(cranked.els[1]!.pieces.some((p) => p.kind === 'dowel')).toBe(false);
    const stepped = stack(0.2);
    expect((0.4 - 0.2) / 2).toBeGreaterThan(MAX_CRANK);
    expect(stepped.els[0]!.pieces.some((p) => p.kind === 'cranked')).toBe(false);
    const dowel = stepped.els[1]!.pieces.find((p) => p.kind === 'dowel')!;
    expect(developedLength(dowel.shape)).toBeCloseTo(2 * stepped.high.lap!.length, 9);
  });

  it('a slab: each layer\'s bars across its panel, the top ones with legs down to the bottom cover', () => {
    const m = (bx: number, by: number, tx: number, ty: number) => ({ bottomX: { value: bx }, bottomY: { value: by }, topX: { value: tx }, topY: { value: ty } });
    const r = slabRow({ key: 'slab:1', name: 'L1', lx: 5, ly: 4, h: 0.15, m: m(8, 8, 10, 10) }, { mat: { fc: 30, fy: 420 }, cover: 0.02, diameters: [8, 10, 12] }, undefined, f);
    const [e] = scheduleElements({ line: [], column: [], slab: [r], wall: [] }, { code: 'cirsoc201-2025', slabCover: 0.02 });
    const bx = e!.pieces.find((p) => p.kind === 'slabBottom')!;
    expect(bx.count).toBe(spread(4 - 0.04, r.adopted.bottomX.spacing));
    expect(developedLength(bx.shape)).toBeCloseTo(5 - 0.04, 9);
    const tx = e!.pieces.find((p) => p.kind === 'slabTop')!;
    expect(tx.shape.pts[0]).toEqual([0, expect.closeTo(-(0.15 - 0.04), 9)]);
  });

  it('a level with a slab plan schedules its packages, which cross panels, instead of the panels\' layers', () => {
    const m = (v: number) => ({ bottomX: { value: v }, bottomY: { value: v }, topX: { value: v }, topY: { value: v } });
    const r = slabRow({ key: 'slab:1', name: 'L1', level: 'N1', lx: 5, ly: 4, h: 0.15, m: m(8) }, { mat: { fc: 30, fy: 420 }, cover: 0.02, diameters: [8, 10, 12] }, undefined, f);
    const other = slabRow({ key: 'slab:2', name: 'L2', level: 'N2', lx: 5, ly: 4, h: 0.15, m: m(8) }, { mat: { fc: 30, fy: 420 }, cover: 0.02, diameters: [8, 10, 12] }, undefined, f);
    const crossing = hookedStraight(0, 9.4, 0.12, 10, 0.06, [true, true], -1, 0.11);
    const plan = { level: 'N1', packages: [{ mark: '7', layer: 'top', count: 23, shape: crossing }] } as never;
    const els = scheduleElements({ line: [], column: [], slab: [r, other], wall: [], slabPlan: [plan] }, { code: 'cirsoc201-2025', slabCover: 0.02 });
    expect(els.map((e) => e.key)).toEqual(['slabplan:N1', 'slab:2']);
    expect(els[0]!.pieces).toEqual([{ kind: 'slabTop', count: 23, shape: crossing, elevation: '7' }]);
  });

  it('a wall: verticals and boundary bars, horizontals, edge U-bars of the lap, by the storey', () => {
    const wall: WallDemand = { key: 'wall:1:0', name: 'M1', length: 4, height: 3, thickness: 0.2, combos: [{ combo: 'U', pu: 1200, mu: 5000, vu: 450, muV: 4, muH: 2 }] };
    const r = wallRow(wall, { mat: { fc: 30, fy: 420 }, cover: 0.025, barDia: 12, diameters: [10, 12, 16, 20, 25] }, undefined, f);
    const [e] = scheduleElements({ line: [], column: [], slab: [], wall: [r] }, { code: 'cirsoc201-2025', slabCover: 0.02 });
    const kinds = new Set(e!.pieces.map((p) => p.kind));
    expect(kinds.has('vertical')).toBe(true);
    if (r.adopted.curtains === 2) {
      const u = e!.pieces.find((p) => p.kind === 'ubar')!;
      expect(u.count).toBe(2 * spread(3, r.adopted.horizontal.spacing));
      expect(u.shape.pts[0]![0]).toBeCloseTo(r.hLap, 9);
    }
    expect(r.vLaps!.map((x) => x.dia)).toContain(r.adopted.vertical.diameter);
  });

  it('a beam line: its bars as laid out, and each zone\'s stirrups as the elevation places them', () => {
    const env = (x: number, pos: number, neg: number): SectionEnv => ({ x, pos: { value: pos, source: { combo: 'U', x } }, neg: { value: neg, source: { combo: 'U', x } }, nPos: 0, nNeg: 0 });
    const d: BeamDemand = { key: 'beam:1:0', name: 'V1', length: 6, b: 0.3, h: 0.6, start: env(0, 0, 0), span: env(3, 200, 0), end: env(6, 0, 0), negAny: { value: 0 }, nNegAny: 0, vu: { value: 150 }, nAtV: 0, tu: { value: 0 }, combos: [], line: { group: 1, index: 0, spans: 1, startNode: 1, endNode: 2, lineName: 'V' } };
    const bctx = { mat: { fc: 30, fy: 420 }, cover: 0.025, stirrupDia: 8, diameters: [10, 12, 16, 20, 25], torsion: 'equilibrium' as const };
    const line = beamLine([beamRow(d, bctx, undefined, f)], bctx, undefined, f);
    const [e] = scheduleElements({ line: [line], column: [], slab: [], wall: [] }, { code: 'cirsoc201-2025', slabCover: 0.02 });
    expect(e!.pieces.filter((p) => p.elevation).map((p) => p.elevation)).toEqual(line.bars.map((b) => b.mark));
    const stirrups = e!.pieces.filter((p) => p.kind === 'stirrup').reduce((s, p) => s + p.count, 0);
    expect(stirrups).toBe(line.zones.reduce((s, z) => s + stirrupsOver(z.from, z.to, z.stirrups.spacing), 0));
    expect(stirrupsOver(0, 1, 0.2)).toBe(5);
    const s = bendingSchedule({ line: [line], column: [], slab: [], wall: [] }, { code: 'cirsoc201-2025', slabCover: 0.02 });
    expect(s.rows.every((r) => r.element === line.name)).toBe(true);
    const sheets = rcSheetsWorkbook({ beam: [], line: [line], column: [], slab: [], wall: [], code: 'CIRSOC 201-2025' }, (k) => k, s);
    expect(sheets.map((x) => x.name)).toContain('rcSheets.bbs.title');
  });
});
