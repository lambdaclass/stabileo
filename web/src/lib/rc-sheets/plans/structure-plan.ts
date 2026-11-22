/**
 * A level's beams, columns or walls in plan to scale, as the workspace draws them: the slab
 * outlines, the grid's axes, each element's outline, a tick across a beam where its bars are lapped,
 * and its label placed clear of the others.
 * Model millimetres in the level's own coordinates.
 */
import type { DrawingInput } from '../../sheets/compose';
import type { Primitive } from '../../sheets/primitives';
import { bandOutline, type PlanItem, type Pt, type StructurePlan } from '../structure-plan';
import { placeStructureLabels } from '../structure-plan-labels';
import { EJES, HORM, arm, bubble, cm, framed, label, pt, rect, seg, type PlanCtx } from './draw';

const K = 1000, TEXT_MM = 2.5, BUBBLE_MM = 2.6;

export interface StructurePlanOptions extends PlanCtx { group: string }

const poly = (p: readonly Pt[], fill = false): Primitive => ({ kind: 'polyline', layer: HORM, closed: true, points: p.map(([x, y]) => pt(x * K, y * K)), fill });

export function structurePlanPrimitives(plan: StructurePlan, c: PlanCtx): Primitive[] {
  const s = c.scale, ps: Primitive[] = [];
  for (const r of plan.slabs) ps.push(rect(HORM, r.x0 * K, r.y0 * K, r.x1 * K, r.y1 * K));
  const ends = plan.axes.flatMap((a) => [a.a, a.b].map((p) => ({ name: a.name, at: p })));
  for (const a of plan.axes) ps.push(seg(EJES, pt(a.a[0] * K, a.a[1] * K), pt(a.b[0] * K, a.b[1] * K)));
  for (const e of ends) ps.push(...bubble(pt(e.at[0] * K, e.at[1] * K), e.name, s));
  for (const it of plan.items) {
    if (it.kind === 'beam') {
      for (const sp of it.spans) ps.push(poly(bandOutline(sp.a, sp.b, sp.width)));
      for (const [p, q] of it.splices) ps.push(seg(HORM, pt(p[0] * K, p[1] * K), pt(q[0] * K, q[1] * K)));
    } else ps.push(poly(it.outline, true));
    if (it.kind === 'column') for (const b of it.rebars) ps.push({ kind: 'circle', layer: arm('LONG', b.dia), c: pt(b.at[0] * K, b.at[1] * K), r: b.dia / 2, dia: b.dia });
  }
  const text = (it: PlanItem) => (it.kind === 'wall' ? `${it.name} · e=${cm(c.fmt, it.thickness)} · ${it.bars}` : `${it.name} · ${it.bars}`);
  const h = (TEXT_MM * s) / K, r = (BUBBLE_MM * s) / K;
  const places = placeStructureLabels(plan.items, text, { char: 0.6 * h, height: h, gap: (1.2 * s) / K }, {
    lines: plan.axes.map((a) => [a.a, a.b] as [Pt, Pt]),
    boxes: ends.map((e) => ({ x0: e.at[0] - r, y0: e.at[1] - r, x1: e.at[0] + r, y1: e.at[1] + r })),
  });
  for (const it of plan.items) {
    const p = places.get(it.key);
    if (!p) continue;
    const t = (p.rot * Math.PI) / 180, base: Pt = [p.at[0] + Math.sin(t) * h / 2, p.at[1] - Math.cos(t) * h / 2];
    ps.push(label(pt(base[0] * K, base[1] * K), text(it), TEXT_MM, 'center', p.rot));
  }
  return ps;
}

export function structurePlanDrawing(plan: StructurePlan, o: StructurePlanOptions): DrawingInput {
  const title = o.tr('rcSheets.structPlan.title', { family: o.tr(plan.family === 'vertical' ? 'rcSheets.tab.vertical' : `rcSheets.family.${plan.family}`), level: plan.level || '—' });
  return framed(`structplan:${plan.family}:${plan.level}`, title, structurePlanPrimitives(plan, o), o.scale, o.group);
}
