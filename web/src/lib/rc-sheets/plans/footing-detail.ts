/**
 * A footing's drawings to scale from its detail (`footingDetail`, as the workspace draws it): the
 * plan with every bar of both bottom layers, the central band and the column; the section along X
 * with the lower layer and its hooks, the other layer's bars cut, and the dowels with their feet
 * and laps; the dimensions; and the footing's bar schedule.
 *
 * Model millimetres, origin at the footing's centroid: x along B, y along L (plan) or up (section).
 */
import type { DrawingInput } from '../../sheets/compose';
import type { Primitive } from '../../sheets/primitives';
import { footingDetail, type FootingDetail } from '../footing-detail';
import { footingLabel } from '../footing-row';
import type { FootingRow } from '../footing-types';
import { rulesFor } from '../codes';
import { scheduleElements } from '../schedule/pieces';
import { scheduleOf, type ScheduleRow } from '../schedule/schedule';
import type { SheetCode } from '../types';
import { HORM, arm, cm, dim, framed, label, pt, rect, seg, type ArmLayer, type PlanCtx } from './draw';
import { scheduleTables } from './schedule-table';

const K = 1000;

export interface FootingPlanOptions extends PlanCtx { code: SheetCode; group: string }

const layerOf = (dir: 'x' | 'y'): ArmLayer => (dir === 'x' ? 'INFX' : 'INFY');

export function footingPlanPrimitives(det: FootingDetail, o: FootingPlanOptions): Primitive[] {
  const B = det.B * K, L = det.L * K;
  const ps: Primitive[] = [rect(HORM, -B / 2, -L / 2, B / 2, L / 2)];
  for (const l of det.layers) {
    const a = arm(layerOf(l.dir), l.dia);
    for (const p of l.positions) ps.push(l.dir === 'x' ? seg(a, pt(l.from * K, p * K), pt(l.to * K, p * K), l.dia) : seg(a, pt(p * K, l.from * K), pt(p * K, l.to * K), l.dia));
    if (l.band) for (const b of [l.band.lo, l.band.hi]) ps.push(l.dir === 'x' ? seg(HORM, pt(-B / 2, b * K), pt(B / 2, b * K)) : seg(HORM, pt(b * K, -L / 2), pt(b * K, L / 2)));
  }
  if (det.column) ps.push(rect(HORM, det.column.x0 * K, det.column.y0 * K, det.column.x1 * K, det.column.y1 * K));
  ps.push(dim(pt(-B / 2, -L / 2), pt(B / 2, -L / 2), -6, cm(o.fmt, det.B)), dim(pt(-B / 2, -L / 2), pt(-B / 2, L / 2), 6, cm(o.fmt, det.L)));
  return ps;
}

export function footingSectionPrimitives(det: FootingDetail, row: FootingRow, o: FootingPlanOptions): Primitive[] {
  const s = o.scale, B = det.B * K, H = det.h * K, lap = (row.dowels?.lap ?? 0) * K;
  const ps: Primitive[] = [rect(HORM, -B / 2, 0, B / 2, H)];
  if (det.column) ps.push(rect(HORM, det.column.x0 * K, H, det.column.x1 * K, H + lap + 100));
  for (const l of det.layers) {
    const a = arm(layerOf(l.dir), l.dia), z = l.z * K;
    if (l.dir === 'x') {
      const up = l.hooked ? l.shape.pts[0]![1] * K : 0;
      ps.push({ kind: 'polyline', layer: a, points: [pt(l.from * K, z + up), pt(l.from * K, z), pt(l.to * K, z), pt(l.to * K, z + up)], dia: l.dia });
    } else for (const p of l.positions) ps.push({ kind: 'circle', layer: a, c: pt(p * K, z), r: l.dia / 2, fill: true, dia: l.dia });
  }
  const dw = det.dowels;
  if (dw) dw.xs.forEach((x, i) => {
    const side = i === 0 ? -1 : 1;
    ps.push({ kind: 'polyline', layer: arm('LONG', dw.dia), points: [pt((x + side * dw.foot) * K, dw.z * K), pt(x * K, dw.z * K), pt(x * K, (dw.z + dw.rise) * K)], dia: dw.dia });
  });
  ps.push(dim(pt(-B / 2, 0), pt(B / 2, 0), -6, cm(o.fmt, det.B)), dim(pt(B / 2, 0), pt(B / 2, H), -6, cm(o.fmt, det.h)));
  if (dw && lap > 0) ps.push(dim(pt(dw.xs[1]! * K, H), pt(dw.xs[1]! * K, H + lap), -4, o.tr('rcSheets.elev.lapLength', { l: cm(o.fmt, row.dowels!.lap) })));
  const notes = [
    footingLabel(row.adopted),
    ...(row.adopted.dowels ? [`${o.tr('rcSheets.foot.dowels')}: ${row.adopted.dowels.count} Ø${row.adopted.dowels.dia}`] : []),
    `${o.tr('rcSheets.footFig.cover')}: ${o.fmt(det.cover * 100, 1)} cm`,
  ];
  notes.forEach((n, i) => ps.push(label(pt(-B / 2, -(14 + i * 4) * s), n, 2.2)));
  return ps;
}

export function footingScheduleRows(row: FootingRow, code: SheetCode): ScheduleRow[] {
  const el = scheduleElements({ line: [], column: [], slab: [], wall: [], footing: [row] }, { code, slabCover: 0.02 });
  return scheduleOf(el, { code, scope: 'element' }).rows;
}

const scheduleLayer = (r: ScheduleRow): ArmLayer => (r.kind === 'footingX' ? 'INFX' : r.kind === 'footingY' ? 'INFY' : 'LONG');

export function footingPlans(row: FootingRow, o: FootingPlanOptions): DrawingInput[] {
  if (row.uncovered || !(row.B > 0)) return [];
  const det = footingDetail(row, rulesFor(o.code).bends);
  return [
    framed(`${row.key}:plan`, `${o.tr('rcSheets.footFig.title', { name: row.name })} · ${o.tr('rcSheets.footFig.plan')}`, footingPlanPrimitives(det, o), o.scale, o.group),
    framed(`${row.key}:sec`, `${row.name} · ${o.tr('rcSheets.footFig.section')}`, footingSectionPrimitives(det, row, o), o.scale, o.group),
    ...scheduleTables(row.key, o.tr('rcSheets.plans.schedule', { name: row.name }), footingScheduleRows(row, o.code), scheduleLayer, o, o.group),
  ];
}
