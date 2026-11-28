/**
 * A level's beams, columns or walls in plan to scale, as the workspace draws them: the slab
 * outlines, the grid's axes dimensioned axis to axis and overall along their ends, each element's
 * outline, a tick across a beam where its bars are lapped, and its label placed clear of the others,
 * its name without the level the plan is of (a wall's bars are in its detail, its label its thickness).
 * Model millimetres in the level's own coordinates.
 */
import { fixedSymbol, type SettingOut } from '../fixed-points';
import type { DrawingInput } from '../../sheets/compose';
import type { Primitive } from '../../sheets/primitives';
import { bandOutline, type PlanItem, type Pt, type StructurePlan } from '../structure-plan';
import { placeStructureLabels } from '../structure-plan-labels';
import { EJES, HORM, arm, bubble, cm, dim, framed, label, pt, rect, seg, type PlanCtx } from './draw';

const K = 1000, TEXT_MM = 2.5, BUBBLE_MM = 2.6;

export interface StructurePlanOptions extends PlanCtx { group: string }

const poly = (p: readonly Pt[], fill = false): Primitive => ({ kind: 'polyline', layer: HORM, closed: true, points: p.map(([x, y]) => pt(x * K, y * K)), fill });

/** The fixed point's symbol's radius in plan, m. */
export const FIXED_SYMBOL_M = 0.06;

export function structurePlanPrimitives(plan: StructurePlan, c: PlanCtx): Primitive[] {
  const s = c.scale, ps: Primitive[] = [];
  for (const r of plan.slabs) ps.push(rect(HORM, r.x0 * K, r.y0 * K, r.x1 * K, r.y1 * K));
  const ends = plan.axes.flatMap((a) => [a.a, a.b].map((p) => ({ name: a.name, at: p })));
  for (const a of plan.axes) ps.push(seg(EJES, pt(a.a[0] * K, a.a[1] * K), pt(a.b[0] * K, a.b[1] * K)));
  for (const e of ends) ps.push(...bubble(pt(e.at[0] * K, e.at[1] * K), e.name, s));
  ps.push(...axisChains(plan, c));
  for (const it of plan.items) {
    if (it.kind === 'beam') {
      for (const sp of it.spans) ps.push(poly(bandOutline(sp.a, sp.b, sp.width)));
      for (const [p, q] of it.splices) ps.push(seg(HORM, pt(p[0] * K, p[1] * K), pt(q[0] * K, q[1] * K)));
    } else ps.push(poly(it.outline, true));
    if (it.kind === 'column') for (const b of it.rebars) ps.push({ kind: 'circle', layer: arm('LONG', b.dia), c: pt(b.at[0] * K, b.at[1] * K), r: b.dia / 2, dia: b.dia });
    if (it.kind === 'column' && it.fixed) {
      const sym = fixedSymbol(it.fixed, FIXED_SYMBOL_M);
      ps.push(sym.kind === 'circle' ? { kind: 'circle', layer: EJES, c: pt(sym.c[0] * K, sym.c[1] * K), r: sym.r * K } : { kind: 'arc', layer: EJES, c: pt(sym.c[0] * K, sym.c[1] * K), r: sym.r * K, start: sym.start, end: sym.end });
    }
  }
  const name = (n: string) => (plan.level ? n.replace(` · ${plan.level}`, '') : n);
  const text = (it: PlanItem) => (it.kind === 'wall' ? `${name(it.name)} · e=${cm(c.fmt, it.thickness)}` : `${name(it.name)} · ${it.bars}`);
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

/** The axes running each way dimensioned one to the next and end to end, beyond their bubbles at the low ends. */
function axisChains(plan: StructurePlan, c: PlanCtx): Primitive[] {
  const out: Primitive[] = [];
  const along = (vertical: boolean) => {
    const ax = plan.axes.filter((a) => (vertical ? Math.abs(a.a[0] - a.b[0]) < 1e-9 : Math.abs(a.a[1] - a.b[1]) < 1e-9))
      .map((a) => ({ at: vertical ? a.a[0] : a.a[1], end: vertical ? Math.min(a.a[1], a.b[1]) : Math.min(a.a[0], a.b[0]) }))
      .sort((p, q) => p.at - q.at).filter((a, i, all) => i === 0 || a.at - all[i - 1]!.at > 1e-6);
    if (ax.length < 2) return;
    const base = Math.min(...ax.map((a) => a.end)) * K;
    const P = (v: number) => (vertical ? pt(v * K, base) : pt(base, v * K));
    const near = vertical ? -(BUBBLE_MM + 5) : BUBBLE_MM + 5, far = vertical ? near - 7 : near + 7;
    for (let i = 1; i < ax.length; i++) out.push(dim(P(ax[i - 1]!.at), P(ax[i]!.at), near, cm(c.fmt, ax[i]!.at - ax[i - 1]!.at)));
    if (ax.length > 2) out.push(dim(P(ax[0]!.at), P(ax[ax.length - 1]!.at), far, cm(c.fmt, ax[ax.length - 1]!.at - ax[0]!.at)));
  };
  along(true);
  along(false);
  return out;
}

export function structurePlanDrawing(plan: StructurePlan, o: StructurePlanOptions): DrawingInput {
  const title = o.tr('rcSheets.structPlan.title', { family: o.tr(plan.family === 'vertical' ? 'rcSheets.tab.vertical' : `rcSheets.family.${plan.family}`), level: plan.level || '—' });
  return framed(`structplan:${plan.family}:${plan.level}`, title, structurePlanPrimitives(plan, o), o.scale, o.group);
}

/** The setting out: the lowest level's columns over the axes, each fixed point with its symbol and its coordinates from the origin. */
export function settingOutDrawing(plan: StructurePlan, so: readonly SettingOut[], o: StructurePlanOptions): DrawingInput {
  const ps = structurePlanPrimitives({ ...plan, items: plan.items.filter((it) => it.kind === 'column'), slabs: [] }, o).filter((p) => p.kind !== 'text' || !plan.items.some((it) => p.text.startsWith(`${it.name} ·`)));
  for (const r of so) ps.push(label(pt(r.x * K + 80, r.y * K + 80), `${r.name} (${o.fmt(r.x, 3)}; ${o.fmt(r.y, 3)})`, TEXT_MM));
  return framed(`setting:${plan.level}`, `${o.tr('rcSheets.setting.title')} · ${plan.level || '—'}`, ps, o.scale, o.group);
}
