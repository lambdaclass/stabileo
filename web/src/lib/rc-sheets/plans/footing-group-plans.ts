import type { DrawingInput } from '../../sheets/compose';
import type { Primitive } from '../../sheets/primitives';
import { groupDetail, type GroupDetail } from '../footing-group-detail';
import { meshText } from '../footing-mesh';
import type { FootingRow } from '../footing-types';
import { rulesFor } from '../codes';
import { scheduleOf, type ScheduleRow } from '../schedule/schedule';
import { scheduleElements } from '../schedule/pieces';
import { HORM, arm, cm, dim, framed, label, pt, rect, seg, type ArmLayer } from './draw';
import { scheduleTables } from './schedule-table';
import { cageText, dropText } from '../footing-punching-row';
import type { FootingPlanOptions } from './footing-detail';

const K = 1000;
const layerOf = (dir: 'x' | 'y', face: 'bottom' | 'top'): ArmLayer => (face === 'top' ? (dir === 'x' ? 'SUPX' : 'SUPY') : dir === 'x' ? 'INFX' : 'INFY');

/** A strip's or mat's plan: its outline, every column with its name, the strips' bounds, the bars of every layer and band, the property lines and the dimensions. */
export function groupPlanPrimitives(row: FootingRow, det: GroupDetail, o: FootingPlanOptions): Primitive[] {
  const B = row.B * K, L = row.L * K, g = row.group!;
  const ps: Primitive[] = [rect(HORM, -B / 2, -L / 2, B / 2, L / 2)];
  for (const l of det.layers) {
    const a = arm(layerOf(l.dir, l.face), l.dia);
    for (const p of l.positions) ps.push(l.dir === 'x' ? seg(a, pt(l.from * K, p * K), pt(l.to * K, p * K), l.dia) : seg(a, pt(p * K, l.from * K), pt(p * K, l.to * K), l.dia));
  }
  for (const d of det.drops) ps.push(rect(HORM, d.rect.x0 * K, d.rect.y0 * K, d.rect.x1 * K, d.rect.y1 * K), label(pt(d.rect.x0 * K + 50, d.rect.y0 * K + 50), `${o.tr('rcSheets.footFig.drop')} ${cm(o.fmt, d.hd)}`, 1.8));
  for (const c of det.cages) { const a = arm('EST', c.dia); for (const q of c.legs) ps.push({ kind: 'circle', layer: a, c: pt(q.x * K, q.y * K), r: Math.max(c.dia, 25), fill: true, dia: c.dia }); }
  for (const s of g.strips) for (const b of [s.at - s.width / 2, s.at + s.width / 2]) {
    if (Math.abs(Math.abs(b) - (s.dir === 'x' ? row.L : row.B) / 2) < 1e-6) continue;
    ps.push(s.dir === 'x' ? seg(HORM, pt(-B / 2, b * K), pt(B / 2, b * K)) : seg(HORM, pt(b * K, -L / 2), pt(b * K, L / 2)));
  }
  for (const k of g.columns) {
    ps.push(rect(HORM, (k.x - k.b / 2) * K, (k.y - k.h / 2) * K, (k.x + k.b / 2) * K, (k.y + k.h / 2) * K));
    ps.push(label(pt((k.x + k.b / 2) * K + 50, (k.y + k.h / 2) * K + 50), k.name, 2));
  }
  for (const s of g.straps) {
    const k = g.columns.find((c) => c.key === s.holder);
    if (!k) continue;
    const i = s.axis === 'x' ? 0 : 1, toward = g.anchor[i] > 0 ? -1 : 1, end = toward * ((s.axis === 'x' ? row.B : row.L) / 2 + 0.4);
    const r = s.axis === 'x' ? [Math.min(k.x, end), k.y - s.b / 2, Math.max(k.x, end), k.y + s.b / 2] : [k.x - s.b / 2, Math.min(k.y, end), k.x + s.b / 2, Math.max(k.y, end)];
    ps.push(rect(HORM, r[0]! * K, r[1]! * K, r[2]! * K, r[3]! * K), label(pt((s.axis === 'x' ? end : k.x) * K, (s.axis === 'x' ? k.y : end) * K), `${s.line?.name || o.tr('rcSheets.footFig.strap')} ${Math.round(s.b * 100)}×${Math.round(s.h * 100)} → ${s.partner}`, 1.8));
  }
  const ext = 300;
  if (g.anchor[0]) { const x = (g.anchor[0] * B) / 2; ps.push(seg(HORM, pt(x, -L / 2 - ext), pt(x, L / 2 + ext)), label(pt(x, L / 2 + ext), o.tr('rcSheets.footFig.line'), 2)); }
  if (g.anchor[1]) { const y = (g.anchor[1] * L) / 2; ps.push(seg(HORM, pt(-B / 2 - ext, y), pt(B / 2 + ext, y)), label(pt(B / 2 + ext, y), o.tr('rcSheets.footFig.line'), 2)); }
  ps.push(dim(pt(-B / 2, -L / 2), pt(B / 2, -L / 2), -6, cm(o.fmt, row.B)), dim(pt(-B / 2, -L / 2), pt(-B / 2, L / 2), 6, cm(o.fmt, row.L)));
  return ps;
}

/** The section along X through the footing's centroid: its thickness at the founding level, the columns cut by it with their pedestals, the bars along X with their hooks and the bars along Y cut. */
export function groupSectionPrimitives(row: FootingRow, det: GroupDetail, o: FootingPlanOptions): Primitive[] {
  const s = o.scale, B = row.B * K, H = row.h * K, ped = row.pedestal * K, g = row.group!;
  const ps: Primitive[] = [rect(HORM, -B / 2, 0, B / 2, H)];
  for (const k of g.columns) ps.push(rect(HORM, (k.x - k.b / 2) * K, H, (k.x + k.b / 2) * K, H + ped + 400));
  for (const d of det.drops) ps.push(rect(HORM, d.rect.x0 * K, -d.hd * K, d.rect.x1 * K, 0));
  for (const c of det.cages) {
    const a = arm('EST', c.dia);
    for (const x of new Set(c.legs.map((q) => Math.round(q.x * 1000)))) ps.push(seg(a, pt(x, c.z0 * K), pt(x, (row.h - c.z0) * K), c.dia));
  }
  for (const l of [...det.layers, ...det.drops.flatMap((d) => d.layers)]) {
    const a = arm(layerOf(l.dir, l.face), l.dia), z = l.z * K;
    if (l.dir === 'x') {
      const leg = Math.abs(l.shape.pts.find((q) => Math.abs(q[1]) > 1e-9)?.[1] ?? 0) * K * (l.face === 'top' ? -1 : 1);
      ps.push({ kind: 'polyline', layer: a, points: [pt(l.from * K, z + leg), pt(l.from * K, z), pt(l.to * K, z), pt(l.to * K, z + leg)], dia: l.dia });
    } else for (const p of l.positions) ps.push({ kind: 'circle', layer: a, c: pt(p * K, z), r: l.dia / 2, fill: true, dia: l.dia });
  }
  ps.push(dim(pt(-B / 2, 0), pt(B / 2, 0), -6, cm(o.fmt, row.B)), dim(pt(B / 2, 0), pt(B / 2, H), -6, cm(o.fmt, row.h)));
  if (ped > 1) ps.push(dim(pt(B / 2, H), pt(B / 2, H + ped), -6, `${o.tr('rcSheets.foot.pedestal')} ${cm(o.fmt, row.pedestal)}`));
  const a = row.adopted;
  const notes = [
    `${o.tr('rcSheets.foot.mesh.x')}: ${meshText(a.x)}${a.tops?.x ? ` / ${meshText(a.tops.x)}` : ''} · ${o.tr('rcSheets.foot.mesh.y')}: ${meshText(a.y)}${a.tops?.y ? ` / ${meshText(a.tops.y)}` : ''}`,
    `${o.tr('rcSheets.foot.founding')}: z = ${o.fmt(row.founding, 2)} m · ${o.tr('rcSheets.footFig.cover')}: ${o.fmt(row.cover * 100, 1)} cm`,
    ...g.columns.filter((k) => k.punching?.fix).map((k) => `${k.name}: ${k.punching!.fix!.cage ? `${o.tr('rcSheets.footFig.cage')} ${cageText(k, o.fmt)}` : `${o.tr('rcSheets.footFig.drop')} ${dropText(k, o.fmt)}`}`),
  ];
  notes.forEach((n, i) => ps.push(label(pt(-B / 2, -(14 + i * 4) * s), n, 2.2)));
  return ps;
}

const scheduleLayer = (r: ScheduleRow): ArmLayer => (r.kind === 'footingX' ? 'INFX' : r.kind === 'footingY' ? 'INFY' : r.kind === 'footingTop' ? 'SUPX' : r.kind === 'footingPunch' ? 'EST' : 'LONG');

export function groupPlans(row: FootingRow, o: FootingPlanOptions): DrawingInput[] {
  if (!(row.B > 0) || row.uncovered) return [];
  const det = groupDetail(row, rulesFor(o.code).bends);
  const el = scheduleElements({ line: [], column: [], slab: [], wall: [], footing: [row] }, { code: o.code, slabCover: 0.02 });
  return [
    framed(`${row.key}:plan`, `${o.tr('rcSheets.footFig.title', { name: row.name })} · ${o.tr('rcSheets.footFig.plan')}`, groupPlanPrimitives(row, det, o), o.scale, o.group),
    framed(`${row.key}:sec`, `${row.name} · ${o.tr('rcSheets.footFig.section')}`, groupSectionPrimitives(row, det, o), o.scale, o.group),
    ...scheduleTables(row.key, o.tr('rcSheets.plans.schedule', { name: row.name }), scheduleOf(el, { code: o.code, scope: 'element' }).rows, scheduleLayer, o, o.group),
  ];
}
