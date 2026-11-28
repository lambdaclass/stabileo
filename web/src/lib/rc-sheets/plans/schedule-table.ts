/**
 * An element's bar schedule drawn on the sheet: every mark with its bent shape, the legs in cm,
 * its count, unit and total length and mass, then the total. Read off the bending schedule
 * (`scheduleOf`), so the drawing and the schedule the workspace shows cannot disagree.
 */
import type { DrawingInput } from '../../sheets/compose';
import type { Primitive } from '../../sheets/primitives';
import { drawTable, type Cell } from '../../sheets/plans/table';
import { shapeFigure } from '../../sheets/plans/bending-schedule';
import { kindKey } from '../schedule/exports';
import { labelledLegs, sketchOf } from '../schedule/sketch';
import type { ScheduleRow } from '../schedule/schedule';
import { TEXTO, arm, type ArmLayer, type PlanCtx } from './draw';

/** Rows per table: a sketch row is 13 mm, so one table fits an A3 sheet's drawable height. */
export const SCHEDULE_ROWS = 12;

/** The mark as the elevation reads it: equal bars by every letter they carry there. */
export const scheduleMark = (r: Pick<ScheduleRow, 'mark' | 'elevation'>): string => (r.elevation.length > 1 ? r.elevation.join('=') : r.mark);

function figure(r: ScheduleRow, layer: ArmLayer): Primitive[] {
  const d = sketchOf(r.shape);
  return shapeFigure(d.points, labelledLegs(d), d.extent).map((p) => ({ ...p, layer: p.layer === 'RC-BAR' ? arm(layer, r.dia) : TEXTO }));
}

export function scheduleTables(key: string, title: string, rows: readonly ScheduleRow[], layerOf: (r: ScheduleRow) => ArmLayer, c: PlanCtx, group: string): DrawingInput[] {
  if (!rows.length) return [];
  const bbs = (k: string) => c.tr(`rcSheets.bbs.${k}`);
  const columns = [
    { label: bbs('mark'), width: 16, align: 'center' as const }, { label: bbs('kind'), width: 30 }, { label: 'Ø', width: 10, align: 'center' as const },
    { label: bbs('shape'), width: 50, align: 'center' as const }, { label: bbs('total'), width: 14, align: 'right' as const },
    { label: bbs('unitLength'), width: 26, align: 'right' as const }, { label: bbs('totalLength'), width: 26, align: 'right' as const }, { label: 'kg', width: 16, align: 'right' as const },
  ];
  const body: Cell[][] = rows.map((r) => [scheduleMark(r), c.tr(kindKey(r.kind)), String(r.dia), { figure: figure(r, layerOf(r)) }, String(r.total), c.fmt(r.unitLength, 2), c.fmt(r.totalLength, 2), c.fmt(r.kg, 1)]);
  const kg = rows.reduce((s, r) => s + r.kg, 0), len = rows.reduce((s, r) => s + r.totalLength, 0);
  body.push([bbs('sum'), '', '', '', '', '', c.fmt(len, 2), c.fmt(kg, 1)]);
  const pages = Math.ceil(body.length / SCHEDULE_ROWS), out: DrawingInput[] = [];
  for (let i = 0; i < pages; i++) {
    const t = drawTable({ columns, rows: body.slice(i * SCHEDULE_ROWS, (i + 1) * SCHEDULE_ROWS), figureHeight: 13, rowHeight: 6, textHeight: 2.2 });
    out.push({ key: `${key}-bbs${pages > 1 ? `-${i + 1}` : ''}`, title: pages > 1 ? `${title} (${i + 1}/${pages})` : title, primitives: t.primitives, width: t.width, height: t.height, origin: { x: 0, y: 0 }, paper: true, group });
  }
  return out;
}
