/** The bending schedule written out: a workbook sheet, CSV, and BVBS records for bending machines. */
import { csvCell } from '../../engine/result-query';
import { safeText, type WorkbookSheet } from '../../export/workbook-cells';
import { legLengths, type BarShape } from '../shape';
import { bvbsFile, legsOf, type BvbsBar } from './bvbs';
import type { BendingSchedule, ScheduleRow } from './schedule';
import type { PieceKind } from './pieces';
import { SCHEDULE_VIEWS, scheduleView, usesText, type ScheduleView, type ViewGroup } from './views';

type Tr = (key: string) => string;

const r2 = (v: number) => Math.round(v * 100) / 100;
const r1 = (v: number) => Math.round(v * 10) / 10;

const LINE_KINDS: readonly PieceKind[] = ['continuous', 'support', 'span', 'bent'];

/** The i18n key naming a piece: a line's bars by the elevation's own words. */
export const kindKey = (k: PieceKind): string => (LINE_KINDS.includes(k) ? `rcSheets.line.kind.${k}` : `rcSheets.bbs.kind.${k}`);

/** The legs as a schedule writes them in text: a, b, c… in cm between the intersections of their centrelines. */
export const shapeText = (s: BarShape): string =>
  legLengths(s).map((l, i) => `${String.fromCharCode(97 + (i % 26))}=${Math.round(l * 100)}`).join(' ');

/** The sums under a table, in its Ø, count and total length columns (kg and kg with waste right of the length). */
function summary(s: BendingSchedule, tr: Tr, col: { dia: number; count: number; length: number }): Array<Array<string | number>> {
  const bbs = (k: string) => tr(`rcSheets.bbs.${k}`);
  const pct = Math.round(s.waste * 1000) / 10;
  const row = (label: string, cells: Partial<Record<'dia' | 'count' | 'length', string | number>>, kg: string | number, withWaste: string | number) => {
    const out: Array<string | number> = Array(col.length + 3).fill('');
    out[0] = label;
    for (const [k, v] of Object.entries(cells)) out[col[k as keyof typeof col]] = v;
    out[col.length + 1] = kg; out[col.length + 2] = withWaste;
    return out;
  };
  return [
    [],
    row(bbs('byDiameter'), { dia: 'Ø (mm)', count: bbs('stockBars'), length: bbs('totalLength') }, 'kg', `kg + ${pct} %`),
    ...s.byDiameter.map((d) => row('', { dia: d.dia, count: d.stockBars, length: r2(d.length) }, r1(d.kg), r1(d.withWaste))),
    [],
    row(bbs('byFamily'), {}, 'kg', `kg + ${pct} %`),
    ...s.byFamily.map((f) => row(tr(`rcSheets.family.${f.family}`), {}, r1(f.kg), r1(f.withWaste))),
    row(bbs('sum'), { length: r2(s.total.length) }, r1(s.total.kg), r1(s.total.withWaste)),
  ];
}

function elementTable(s: BendingSchedule, tr: Tr): Array<Array<string | number>> {
  const bbs = (k: string) => tr(`rcSheets.bbs.${k}`);
  const head = [bbs('element'), tr('rcSheets.col.level'), bbs('mark'), 'Ø (mm)', bbs('kind'), bbs('perElement'), bbs('equal'), bbs('total'), bbs('shape'), bbs('unitLength'), bbs('totalLength'), 'kg'];
  const body = s.rows.map((r: ScheduleRow) => [
    safeText(r.element), safeText(r.level ?? ''), r.mark, r.dia, tr(kindKey(r.kind)), r.perElement, r.equal, r.total,
    shapeText(r.shape), r2(r.unitLength), r2(r.totalLength), r1(r.kg),
  ]);
  return [head, ...body, ...summary(s, tr, { dia: 3, count: 7, length: 10 })];
}

const groupTitle = (g: ViewGroup, tr: Tr) => (g.family ? tr(`rcSheets.family.${g.family}`) : g.title || '—');

function mergedTable(s: BendingSchedule, view: Exclude<ScheduleView, 'element'>, tr: Tr): Array<Array<string | number>> {
  const bbs = (k: string) => tr(`rcSheets.bbs.${k}`);
  const v = scheduleView(s, view);
  const grouped = view !== 'unified';
  const pct = Math.round(s.waste * 1000) / 10;
  const head = [...(grouped ? [bbs(`groupBy.${view}`)] : []), bbs('elements'), bbs('mark'), 'Ø (mm)', bbs('kind'), bbs('total'), bbs('shape'), bbs('unitLength'), bbs('totalLength'), 'kg', `kg + ${pct} %`];
  const out: Array<Array<string | number>> = [head];
  for (const g of v.groups) {
    const title = groupTitle(g, tr);
    for (const r of g.rows) {
      out.push([
        ...(grouped ? [safeText(title)] : []), safeText(usesText(r.uses)), r.marks.join(', '), r.dia, r.kinds.map((k) => tr(kindKey(k))).join(', '), r.count,
        shapeText(r.shape), r2(r.unitLength), r2(r.totalLength), r1(r.kg),
      ]);
    }
    if (grouped) out.push([safeText(title), bbs('subtotal'), '', '', '', g.count, '', '', r2(g.length), r1(g.kg), r1(g.withWaste)]);
  }
  return [...out, ...summary(s, tr, grouped ? { dia: 3, count: 5, length: 8 } : { dia: 2, count: 4, length: 7 })];
}

/** The schedule as a view lays it out: the element view is the table each element group is listed in. */
export function viewTable(s: BendingSchedule, view: ScheduleView, tr: Tr): Array<Array<string | number>> {
  return view === 'element' ? elementTable(s, tr) : mergedTable(s, view, tr);
}

export function scheduleSheet(s: BendingSchedule, tr: Tr, code: string, view: ScheduleView = 'element'): WorkbookSheet {
  return { name: tr(view === 'element' ? 'rcSheets.bbs.title' : `rcSheets.bbs.sheet.${view}`), rows: [[`${tr('rcSheets.code')}: ${code}`], ...viewTable(s, view, tr)] };
}

/** One sheet per view, the element view first. */
export function scheduleSheets(s: BendingSchedule, tr: Tr, code: string): WorkbookSheet[] {
  return ['element' as const, ...SCHEDULE_VIEWS.filter((v) => v !== 'element')].map((v) => scheduleSheet(s, tr, code, v));
}

export function scheduleCsv(s: BendingSchedule, tr: Tr, view: ScheduleView = 'element'): string {
  return viewTable(s, view, tr).map((r) => r.map(csvCell).join(',')).join('\n');
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
