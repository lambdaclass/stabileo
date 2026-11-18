/**
 * A wall's drawings to scale from its detail (`wallDetail`, as the workspace draws it): the
 * elevation of one face with its verticals, horizontals, edge U-bars, boundary ties and cross
 * ties; the horizontal section with every bar, the U-bars or hooks closing the edges and the
 * boundary hoops; length, height and thickness dimensioned; the notes; and the bar schedule.
 *
 * Model millimetres: x along the wall from its left end, y up (elevation) or across (section).
 */
import type { DrawingInput } from '../../sheets/compose';
import type { Primitive } from '../../sheets/primitives';
import { wallDetail, wallLevels } from '../wall-detail';
import { wallLabel, type WallRow } from '../wall-row';
import { scheduleElements } from '../schedule/pieces';
import { scheduleOf, type ScheduleRow } from '../schedule/schedule';
import type { SheetCode } from '../types';
import { HORM, arm, cm, dim, framed, label, pt, rect, seg, type ArmLayer, type PlanCtx } from './draw';
import { scheduleTables } from './schedule-table';

const K = 1000;

export interface WallPlanOptions extends PlanCtx { code: SheetCode; group: string }

export function wallElevationPrimitives(row: WallRow, o: WallPlanOptions): Primitive[] {
  const d = wallDetail(row, o.code), s = o.scale, L = d.length * K, H = row.height * K, cov = d.cover * K;
  const ps: Primitive[] = [rect(HORM, 0, 0, L, H)];
  const y0 = Math.min(...d.verticals.map((v) => v.y));
  const face = d.verticals.filter((q) => Math.abs(q.y - y0) < 1e-6);
  const lapOf = (dia: number) => (row.stack?.above ? row.vLaps?.find((x) => x.dia === dia)?.lap ?? 0 : 0) * K;
  for (const v of face) ps.push(seg(arm(v.boundary ? 'BORDE' : 'VERT', v.dia), pt(v.x * K, 0), pt(v.x * K, H + lapOf(v.dia)), v.dia));
  const first = face.reduce<(typeof face)[number] | undefined>((w, v) => (!w || v.x < w.x ? v : w), undefined);
  if (first && lapOf(first.dia) > 0) ps.push(dim(pt(first.x * K, H), pt(first.x * K, H + lapOf(first.dia)), -3, o.tr('rcSheets.elev.lapLength', { l: cm(o.fmt, lapOf(first.dia) / K) })));
  const hd = d.horizontals.dia, levels = wallLevels(row.height, d.horizontals.spacing);
  for (const y of levels) ps.push(seg(arm('HOR', hd), pt(cov, y * K), pt(L - cov, y * K), hd));
  if (d.ends.kind === 'ubar') {
    const u = Math.min(d.ends.lap, d.length / 2) * K, lift = 0.6 * s;
    for (const y of levels) ps.push(seg(arm('HOR', hd), pt(cov, y * K + lift), pt(cov + u, y * K + lift), hd), seg(arm('HOR', hd), pt(L - cov, y * K + lift), pt(L - cov - u, y * K + lift), hd));
  }
  const t = d.boundary?.ties;
  if (t && d.boundary) for (const y of wallLevels(row.height, t.spacing)) {
    const bl = d.boundary.length * K;
    ps.push(seg(arm('EST', t.dia), pt(cov, y * K), pt(bl, y * K), t.dia), seg(arm('EST', t.dia), pt(L - bl, y * K), pt(L - cov, y * K), t.dia));
  }
  if (d.crossTies) for (const y of wallLevels(row.height, d.crossTies.up)) for (const x of wallLevels(d.length, d.crossTies.along)) {
    ps.push({ kind: 'circle', layer: arm('EST', d.crossTies.dia), c: pt(x * K, y * K), r: 0.8 * s, dia: d.crossTies.dia });
  }
  ps.push(dim(pt(0, 0), pt(L, 0), -6, o.fmt(d.length, 2)), dim(pt(0, 0), pt(0, H), 6, o.fmt(row.height, 2)));
  return ps;
}

export function wallSectionPrimitives(row: WallRow, o: WallPlanOptions): Primitive[] {
  const d = wallDetail(row, o.code), s = o.scale, L = d.length * K, T = d.thickness * K, cov = d.cover * K, hd = d.horizontals.dia;
  const ps: Primitive[] = [rect(HORM, 0, 0, L, T)];
  const hor = arm('HOR', hd);
  for (const y of d.horizontals.y) ps.push(seg(hor, pt(cov, y * K), pt(L - cov, y * K), hd));
  if (d.ends.kind === 'ubar' && d.horizontals.y.length === 2) {
    const u = Math.min(d.ends.lap, d.length / 2) * K, [ya, yb] = d.horizontals.y.map((y) => y * K) as [number, number], xe = cov + hd / 2;
    ps.push({ kind: 'polyline', layer: hor, points: [pt(u, ya), pt(xe, ya), pt(xe, yb), pt(u, yb)], dia: hd });
    ps.push({ kind: 'polyline', layer: hor, points: [pt(L - u, ya), pt(L - xe, ya), pt(L - xe, yb), pt(L - u, yb)], dia: hd });
  } else if (d.ends.kind === 'hook') {
    const y = d.horizontals.y[0]! * K, leg = 10 * hd;
    ps.push({ kind: 'polyline', layer: hor, points: [pt(150, y), pt(cov, y), pt(cov, y - leg)], dia: hd }, { kind: 'polyline', layer: hor, points: [pt(L - 150, y), pt(L - cov, y), pt(L - cov, y - leg)], dia: hd });
  }
  const t = d.boundary?.ties;
  if (t && d.boundary) {
    const bl = d.boundary.length * K, est = arm('EST', t.dia), legs = t.legs ?? 2;
    ps.push(rect(est, cov, cov, bl, T - cov, t.dia), rect(est, L - bl, cov, L - cov, T - cov, t.dia));
    for (let k = 0; k < legs - 2; k++) {
      const x = cov + ((k + 1) * (bl - 2 * cov)) / (legs - 1);
      ps.push(seg(est, pt(x, cov), pt(x, T - cov), t.dia), seg(est, pt(L - x, cov), pt(L - x, T - cov), t.dia));
    }
  }
  if (d.crossTies && d.horizontals.y.length === 2) for (const x of wallLevels(d.length, d.crossTies.along)) {
    ps.push(seg(arm('EST', d.crossTies.dia), pt(x * K, d.horizontals.y[0]! * K), pt(x * K, d.horizontals.y[1]! * K), d.crossTies.dia));
  }
  for (const v of d.verticals) ps.push({ kind: 'circle', layer: arm(v.boundary ? 'BORDE' : 'VERT', v.dia), c: pt(v.x * K, v.y * K), r: v.dia / 2, fill: true, dia: v.dia });
  ps.push(dim(pt(0, 0), pt(L, 0), -6, o.fmt(d.length, 2)), dim(pt(L, 0), pt(L, T), -6, cm(o.fmt, d.thickness)));
  const local = (p: Record<string, string | number>) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, typeof v === 'number' && !Number.isInteger(v) ? o.fmt(v, 1) : typeof v === 'string' && /^\d+\.\d+$/.test(v) ? o.fmt(Number(v), v.split('.')[1]!.length) : v]));
  const notes = [wallLabel(row.adopted), ...d.notes.map((n) => `${n.params ? o.tr(n.key, local(n.params)) : o.tr(n.key)}${n.clause ? ` — ${n.clause}` : ''}`)];
  notes.forEach((n, i) => ps.push(label(pt(0, -(14 + i * 4) * s), n, 2.2)));
  return ps;
}

export function wallScheduleRows(row: WallRow, all: readonly WallRow[], code: SheetCode): ScheduleRow[] {
  const el = scheduleElements({ line: [], column: [], slab: [], wall: [...all] }, { code, slabCover: 0.02 }).filter((e) => e.key === row.key);
  return scheduleOf(el, { code, scope: 'element' }).rows;
}

const wallLayer = (r: ScheduleRow): ArmLayer => (r.kind === 'horizontal' || r.kind === 'ubar' ? 'HOR' : r.kind === 'boundary' ? 'BORDE' : r.kind === 'vertical' ? 'VERT' : 'EST');

export function wallPlans(row: WallRow, all: readonly WallRow[], o: WallPlanOptions): DrawingInput[] {
  return [
    framed(`${row.key}:elev`, `${o.tr('rcSheets.wallFig.title', { name: row.name })} · ${o.tr('rcSheets.wallFig.elevation')}`, wallElevationPrimitives(row, o), o.scale, o.group),
    framed(`${row.key}:sec`, `${row.name} · ${o.tr('rcSheets.wallFig.plan')}`, wallSectionPrimitives(row, o), o.scale, o.group),
    ...scheduleTables(row.key, o.tr('rcSheets.plans.schedule', { name: row.name }), wallScheduleRows(row, all, o.code), wallLayer, o, o.group),
  ];
}
