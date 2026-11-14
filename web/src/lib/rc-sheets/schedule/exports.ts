/** The bending schedule written out: a workbook sheet, CSV, and BVBS records for bending machines. */
import { csvCell } from '../../engine/result-query';
import { safeText, type WorkbookSheet } from '../../export/workbook-cells';
import { legLengths, type BarShape } from '../shape';
import { bvbsFile, legsOf, type BvbsBar } from './bvbs';
import type { BendingSchedule, ScheduleRow } from './schedule';
import type { PieceKind } from './pieces';

type Tr = (key: string) => string;

const r2 = (v: number) => Math.round(v * 100) / 100;
const r1 = (v: number) => Math.round(v * 10) / 10;

const LINE_KINDS: readonly PieceKind[] = ['continuous', 'support', 'span', 'bent'];

/** The i18n key naming a piece: a line's bars by the elevation's own words. */
export const kindKey = (k: PieceKind): string => (LINE_KINDS.includes(k) ? `rcSheets.line.kind.${k}` : `rcSheets.bbs.kind.${k}`);

/** The legs as a schedule writes them in text: a, b, c… in cm between the intersections of their centrelines. */
export const shapeText = (s: BarShape): string =>
  legLengths(s).map((l, i) => `${String.fromCharCode(97 + (i % 26))}=${Math.round(l * 100)}`).join(' ');

function table(s: BendingSchedule, tr: Tr): Array<Array<string | number>> {
  const bbs = (k: string) => tr(`rcSheets.bbs.${k}`);
  const head = [bbs('element'), tr('rcSheets.col.level'), bbs('mark'), 'Ø (mm)', bbs('kind'), bbs('perElement'), bbs('equal'), bbs('total'), bbs('shape'), bbs('unitLength'), bbs('totalLength'), 'kg'];
  const body = s.rows.map((r: ScheduleRow) => [
    safeText(r.element), safeText(r.level ?? ''), r.mark, r.dia, tr(kindKey(r.kind)), r.perElement, r.equal, r.total,
    shapeText(r.shape), r2(r.unitLength), r2(r.totalLength), r1(r.kg),
  ]);
  const pct = Math.round(s.waste * 1000) / 10;
  return [
    head, ...body, [],
    [bbs('byDiameter'), '', '', 'Ø (mm)', '', '', '', bbs('stockBars'), '', '', bbs('totalLength'), 'kg', `kg + ${pct} %`],
    ...s.byDiameter.map((d) => ['', '', '', d.dia, '', '', '', d.stockBars, '', '', r2(d.length), r1(d.kg), r1(d.withWaste)]),
    [],
    [bbs('byFamily'), '', '', '', '', '', '', '', '', '', '', 'kg', `kg + ${pct} %`],
    ...s.byFamily.map((f) => [tr(`rcSheets.family.${f.family}`), '', '', '', '', '', '', '', '', '', '', r1(f.kg), r1(f.withWaste)]),
    [bbs('sum'), '', '', '', '', '', '', '', '', '', r2(s.total.length), r1(s.total.kg), r1(s.total.withWaste)],
  ];
}

export function scheduleSheet(s: BendingSchedule, tr: Tr, code: string): WorkbookSheet {
  return { name: tr('rcSheets.bbs.title'), rows: [[`${tr('rcSheets.code')}: ${code}`], ...table(s, tr)] };
}

export function scheduleCsv(s: BendingSchedule, tr: Tr): string {
  return table(s, tr).map((r) => r.map(csvCell).join(',')).join('\n');
}

/** A shape's BVBS legs and turns, from its polyline. */
export function bvbsLegs(s: BarShape): BvbsBar['legs'] {
  const segments = s.pts.slice(1).map((p, i) => ({ start: { x: s.pts[i]![0], y: s.pts[i]![1], z: 0 }, end: { x: p[0], y: p[1], z: 0 } }));
  return legsOf({ segments });
}

/** One record per row: its element is the record's plan, so the marks of each element stay apart. */
export function scheduleBvbs(s: BendingSchedule, head: { project: string; index: string; grade: string }): string {
  return s.rows.map((r) => bvbsFile([{
    mark: r.mark, count: r.total, diameterMm: r.dia, lengthMm: r.unitLength * 1000, weightKg: r.kg / Math.max(1, r.total),
    legs: bvbsLegs(r.shape), mandrelMm: r.shape.mandrel * 1000,
  }], { ...head, plan: r.element })).join('');
}
