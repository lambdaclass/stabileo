/**
 * A level's slab bars in plan to scale, one drawing per face: the panels, beams and columns, one
 * bar of each package with its legs folded onto the plan (`planDrawing`, as the workspace draws
 * them, at true size), its distribution line, mark and label, how far each top bar reaches past
 * the support faces, and the panels dimensioned both ways; then the level's bar schedule.
 *
 * Model millimetres in the level's own coordinates.
 */
import type { DrawingInput } from '../../sheets/compose';
import type { Primitive } from '../../sheets/primitives';
import { meshLabel } from '../bars';
import { planDrawing, type LevelPlan, type PlanLayer, type SlabPackage } from '../slab-plan';
import { scheduleElements } from '../schedule/pieces';
import { scheduleOf, type ScheduleRow } from '../schedule/schedule';
import type { SheetCode } from '../types';
import { HORM, arm, cm, dim, framed, label, pt, rect, seg, type ArmLayer, type PlanCtx } from './draw';
import { scheduleTables } from './schedule-table';

const K = 1000;

export interface SlabPlanOptions extends PlanCtx { code: SheetCode; slabCover: number; group: string }

export const packageLayer = (pk: Pick<SlabPackage, 'layer' | 'dir'>): ArmLayer => `${pk.layer === 'top' ? 'SUP' : 'INF'}${pk.dir.toUpperCase()}` as ArmLayer;

function frame(plan: LevelPlan, c: PlanCtx): Primitive[] {
  const s = c.scale, ps: Primitive[] = [];
  for (const p of plan.panels) {
    ps.push(rect(HORM, p.rect.x0 * K, p.rect.y0 * K, p.rect.x1 * K, p.rect.y1 * K));
    ps.push(label(pt(p.rect.x0 * K + 2 * s, p.rect.y1 * K - 4.5 * s), `${p.name} · h=${cm(c.fmt, p.h)}`, 2.2));
  }
  for (const b of plan.beams) {
    const dx = b.x2 - b.x1, dy = b.y2 - b.y1, L = Math.hypot(dx, dy) || 1, nx = (-dy / L) * b.b / 2, ny = (dx / L) * b.b / 2;
    ps.push({ kind: 'polyline', layer: HORM, closed: true, points: [pt((b.x1 + nx) * K, (b.y1 + ny) * K), pt((b.x2 + nx) * K, (b.y2 + ny) * K), pt((b.x2 - nx) * K, (b.y2 - ny) * K), pt((b.x1 - nx) * K, (b.y1 - ny) * K)] });
  }
  for (const k of plan.columns) ps.push({ ...rect(HORM, (k.x - k.b / 2) * K, (k.y - k.h / 2) * K, (k.x + k.b / 2) * K, (k.y + k.h / 2) * K), fill: true } as Primitive);
  const xs = [...new Set(plan.panels.flatMap((p) => [p.rect.x0, p.rect.x1]).map((v) => Math.round(v * K)))].sort((a, b) => a - b);
  const ys = [...new Set(plan.panels.flatMap((p) => [p.rect.y0, p.rect.y1]).map((v) => Math.round(v * K)))].sort((a, b) => a - b);
  if (xs.length && ys.length) {
    const y0 = ys[0]!, x0 = xs[0]!;
    for (let i = 1; i < xs.length; i++) ps.push(dim(pt(xs[i - 1]!, y0), pt(xs[i]!, y0), -10, c.fmt((xs[i]! - xs[i - 1]!) / K, 2)));
    for (let i = 1; i < ys.length; i++) ps.push(dim(pt(x0, ys[i - 1]!), pt(x0, ys[i]!), 10, c.fmt((ys[i]! - ys[i - 1]!) / K, 2)));
    if (xs.length > 2) ps.push(dim(pt(x0, y0), pt(xs[xs.length - 1]!, y0), -18, c.fmt((xs[xs.length - 1]! - x0) / K, 2)));
    if (ys.length > 2) ps.push(dim(pt(x0, y0), pt(x0, ys[ys.length - 1]!), 18, c.fmt((ys[ys.length - 1]! - y0) / K, 2)));
  }
  return ps;
}

export function slabLayerPrimitives(plan: LevelPlan, layer: PlanLayer, c: PlanCtx): Primitive[] {
  const s = c.scale, ps = frame(plan, c);
  const byId = new Map(plan.packages.map((p) => [p.id, p]));
  for (const b of planDrawing(plan, { bottom: layer === 'bottom', top: layer === 'top', base: false }, c.fmt, 1)) {
    const pk = byId.get(b.id)!, L = arm(packageLayer(pk), pk.bars.dia), dia = pk.bars.dia;
    ps.push({ kind: 'polyline', layer: L, points: b.pts.map(([x, y]) => pt(x * K, y * K)), dia });
    const [a, e] = b.band.map(([x, y]) => pt(x * K, y * K)) as [ReturnType<typeof pt>, ReturnType<typeof pt>];
    ps.push(seg(L, a, e, dia));
    const tick = 1.5 * s, along = pk.dir === 'x';
    for (const q of [a, e]) ps.push(seg(L, pt(q.x - (along ? tick : 0), q.y - (along ? 0 : tick)), pt(q.x + (along ? tick : 0), q.y + (along ? 0 : tick)), dia));
    const main = b.legs.reduce((m, l, j) => (l.length > b.legs[m]!.length ? j : m), 0);
    b.legs.forEach((l, j) => { if (j !== main) ps.push(label(pt(l.at[0] * K, l.at[1] * K + 1 * s), cm(c.fmt, l.length), 2, 'center')); });
    const at = pt(b.at[0] * K, b.at[1] * K);
    ps.push(along ? label(pt(at.x, at.y + 1.2 * s), `${b.mark} · ${b.label}`, 2.5, 'center') : label(pt(at.x - 1.2 * s, at.y), `${b.mark} · ${b.label}`, 2.5, 'center', 90));
    if (pk.layer !== 'top') continue;
    const across = along ? b.pts[1]![1] * K : b.pts[1]![0] * K;
    for (const r of pk.reach) {
      const end = [pk.from, pk.to].reduce((p, q) => (Math.abs(Math.abs(q - r.at) - r.length) < Math.abs(Math.abs(p - r.at) - r.length) ? q : p));
      const [u, v] = [Math.min(r.at, end) * K, Math.max(r.at, end) * K];
      if (v - u < 1) continue;
      ps.push(along ? dim(pt(u, across), pt(v, across), -3, cm(c.fmt, (v - u) / K)) : dim(pt(across, u), pt(across, v), 3, cm(c.fmt, (v - u) / K)));
    }
  }
  if (layer === 'bottom' && plan.baseMesh) {
    const x0 = Math.min(...plan.panels.map((p) => p.rect.x0)) * K, y0 = Math.min(...plan.panels.map((p) => p.rect.y0)) * K;
    ps.push(label(pt(x0, y0 - 30 * s), c.tr('rcSheets.planFig.baseNote', { mesh: meshLabel(plan.baseMesh) }), 2.5));
  }
  return ps;
}

export function slabScheduleRows(plan: LevelPlan, code: SheetCode, slabCover: number): ScheduleRow[] {
  return scheduleOf(scheduleElements({ line: [], column: [], slab: [], wall: [], slabPlan: [plan] }, { code, slabCover }), { code, scope: 'element' }).rows;
}

export function slabLevelPlans(plan: LevelPlan, o: SlabPlanOptions): DrawingInput[] {
  const out: DrawingInput[] = [];
  for (const layer of ['bottom', 'top'] as const) {
    if (!plan.packages.some((p) => p.layer === layer && (!p.base || layer === 'bottom'))) continue;
    const title = o.tr('rcSheets.plans.slabLayer', { level: plan.level || '—', layer: o.tr(layer === 'top' ? 'rcSheets.planFig.top' : 'rcSheets.planFig.bottom') });
    out.push(framed(`slabplan:${plan.level}:${layer}`, title, slabLayerPrimitives(plan, layer, o), o.scale, o.group));
  }
  const byMark = new Map(plan.packages.map((p) => [p.mark, p]));
  out.push(...scheduleTables(`slabplan:${plan.level}`, o.tr('rcSheets.plans.schedule', { name: plan.level || '—' }), slabScheduleRows(plan, o.code, o.slabCover), (r) => (byMark.get(r.mark) ? packageLayer(byMark.get(r.mark)!) : 'INFX'), o, o.group));
  return out;
}
