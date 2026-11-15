/**
 * A column storey's drawings to scale: the elevation with the joints below and above, the bars
 * (and those lapped from below), every tie where `columnTieLayout` places it, the clear height,
 * the lap and each tie zone dimensioned; the section; and the storey's bar schedule. The same
 * layout the workspace's elevation draws, at true width.
 *
 * Model millimetres: x across the width b, y up from the face of the joint below.
 */
import type { DrawingInput } from '../../sheets/compose';
import type { Primitive } from '../../sheets/primitives';
import { columnLabel, tieLabel, type ColumnRow } from '../column-row';
import { columnTieLayout, tieSegments, tiesIn } from '../column-ties';
import { columnSection } from '../drawing';
import { scheduleElements } from '../schedule/pieces';
import { scheduleOf, type ScheduleRow } from '../schedule/schedule';
import type { SheetCode } from '../types';
import { HORM, arm, cm, dim, framed, label, pt, rect, seg, type PlanCtx } from './draw';
import { sectionPrimitives } from './section';
import { scheduleTables } from './schedule-table';

const K = 1000;
const STUB = 300;

export interface ColumnPlanOptions extends PlanCtx { code: SheetCode; endZones: boolean; group: string }

export function columnElevationPrimitives(row: ColumnRow, o: ColumnPlanOptions): Primitive[] {
  const s = o.scale, a = row.adopted, layout = columnTieLayout(row, o.code, { endZones: o.endZones });
  const b = row.b * K, clear = layout.clear * K, jb = layout.jointBottom * K, jt = layout.jointTop * K, top = clear + jt;
  const ps: Primitive[] = [rect(HORM, 0, 0, b, clear)];
  if (jt > 0) ps.push(rect(HORM, -STUB, clear, b + STUB, top));
  if (jb > 0) ps.push(rect(HORM, -STUB, -jb, b + STUB, 0));
  const inset = row.cover * K + a.tieDia + a.corner / 2, long = arm('LONG', a.corner);
  const bars = [inset, b - inset];
  if (layout.lap) {
    const lf = layout.lap.from * K, lt = layout.lap.to * K;
    bars.forEach((x, i) => {
      const inward = (i ? -1 : 1) * a.corner;
      ps.push(seg(long, pt(x, -jb), pt(x, lt), a.corner), seg(long, pt(x + inward, lf), pt(x + inward, top), a.corner));
    });
    ps.push(dim(pt(inset, lf), pt(inset, lt), 3, o.tr('rcSheets.elev.lapLength', { l: cm(o.fmt, layout.lap.to - layout.lap.from) })));
  } else for (const x of bars) ps.push(seg(long, pt(x, -jb), pt(x, top), a.corner));
  for (let i = 0; i < a.nx; i++) {
    const x = inset + ((i + 1) * (b - 2 * inset)) / (a.nx + 1);
    ps.push(seg(arm('LONG', a.dx), pt(x, -jb), pt(x, top), a.dx));
  }
  const est = arm('EST', layout.dia), ti = row.cover * K + layout.dia / 2;
  for (const y of layout.ties) ps.push(seg(est, pt(ti, y * K), pt(b - ti, y * K), layout.dia));
  ps.push(dim(pt(0, 0), pt(0, clear), STUB / s + 6, `lu = ${cm(o.fmt, layout.clear)}`));
  ps.push(dim(pt(0, -jb), pt(b, -jb), -5, cm(o.fmt, row.b)));
  const off = STUB / s + 6;
  for (const z of tieSegments(layout)) {
    ps.push(dim(pt(b, z.to * K), pt(b, z.from * K), off, cm(o.fmt, z.to - z.from)));
    const c = Math.round(z.spacing * 1000) / 10;
    ps.push(label(pt(b + STUB + (off - STUB / s + 8) * s, ((z.from + z.to) / 2) * K), `${o.tr(`rcSheets.elev.${z.kind}`)} Ø${layout.dia} c/${o.fmt(c, Number.isInteger(c) ? 0 : 1)} (${tiesIn(layout, z)})`, 2.2));
  }
  return ps;
}

export function columnScheduleRows(row: ColumnRow, all: readonly ColumnRow[], o: Pick<ColumnPlanOptions, 'code' | 'endZones'>): ScheduleRow[] {
  const el = scheduleElements({ line: [], column: [...all], slab: [], wall: [] }, { code: o.code, slabCover: 0.02, endZones: o.endZones }).filter((e) => e.key === row.key);
  return scheduleOf(el, { code: o.code, scope: 'element' }).rows;
}

export function columnPlans(row: ColumnRow, all: readonly ColumnRow[], o: ColumnPlanOptions): DrawingInput[] {
  const sec = sectionPrimitives(columnSection(row.b, row.h, row.cover, row.adopted), o, undefined, [columnLabel(row.adopted), tieLabel(row.adopted)], () => 'LONG');
  return [
    framed(`${row.key}:elev`, o.tr('rcSheets.elev.title', { name: row.name }), columnElevationPrimitives(row, o), o.scale, o.group),
    framed(`${row.key}:sec`, `${row.name} · ${cm(o.fmt, row.b)}×${cm(o.fmt, row.h)}`, sec, o.scale, o.group),
    ...scheduleTables(row.key, o.tr('rcSheets.plans.schedule', { name: row.name }), columnScheduleRows(row, all, o), (r) => (r.kind === 'hoop' || r.kind === 'crossTie' ? 'EST' : 'LONG'), o, o.group),
  ];
}
