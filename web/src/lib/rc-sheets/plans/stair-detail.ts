/**
 * A stair's drawing: its section along the run to scale, the landings, steps and waist, each
 * position of bars bent as it is placed with its mark, the distribution bars as dots, and its bar
 * schedule. Dimensioned as a stair is set out: along the bottom the landings and the treads (tread ×
 * count), up the side the risers (riser × count) and the landing's thickness, the waist's thickness
 * across the slope, and each landing's finished level.
 */
import type { DrawingInput } from '../../sheets/compose';
import type { Primitive } from '../../sheets/primitives';
import { scheduleElements } from '../schedule/pieces';
import { scheduleOf, type ScheduleRow } from '../schedule/schedule';
import type { StairRow } from '../stair-row';
import type { SheetCode } from '../types';
import { HORM, TEXTO, arm, cm, dim, framed, label, pt, type ArmLayer, type PlanCtx } from './draw';
import { scheduleTables } from './schedule-table';

const K = 1000;

export interface StairPlanOptions extends PlanCtx { code: SheetCode; group: string }

const layerOf = (role: StairRow['bars'][number]['role']): ArmLayer => (role === 'main' || role === 'landing' ? 'INF' : role === 'dist' || role === 'distTop' ? 'HOR' : 'SUP');

/** The section's primitives, model millimetres along the run and up; dimensioned when drawn at a scale. */
export function stairSectionPrimitives(row: StairRow, c?: PlanCtx): Primitive[] {
  const P = (p: readonly [number, number]) => pt(p[0] * K, p[1] * K);
  const ps: Primitive[] = [{ kind: 'polyline', layer: HORM, points: [...row.section.outline, row.section.outline[0]!].map(P) }];
  for (const b of row.bars) {
    const a = arm(layerOf(b.role), b.dia);
    if (b.rows) { for (const p of b.rows) ps.push({ kind: 'circle', layer: a, c: P(p), r: b.dia / 2, fill: true, dia: b.dia }); continue; }
    ps.push({ kind: 'polyline', layer: a, points: b.shape.pts.map(P), dia: b.dia });
    const m = b.shape.pts[Math.floor((b.shape.pts.length - 1) / 2)]!;
    ps.push(label(pt(m[0] * K + 40, m[1] * K + 40), `${b.mark} · ${b.count} Ø${b.dia} c/${Math.round(b.spacing * 1000) / 10}`, 2));
  }
  const d = row.bars.filter((b) => b.rows).map((b) => `${b.mark} · Ø${b.dia} c/${Math.round(b.spacing * 1000) / 10}`);
  const low = Math.min(...row.section.outline.map((q) => q[1])) * K;
  if (d.length) ps.push(label(pt(0, c ? low - 20 * c.scale : -row.section.tl * K - 300), d.join('   '), 2));
  if (c) ps.push(...stairDimensions(row, c));
  return ps;
}

function stairDimensions(row: StairRow, c: PlanCtx): Primitive[] {
  const sec = row.section, sp = row.demand.spec, s = c.scale, f = c.fmt;
  const { landingBottom: Lb, landingTop: Lt, run, rise, tl } = sec, end = Lb + run + Lt, n = Math.round(sp.steps);
  const low = Math.min(...sec.outline.map((q) => q[1])) * K;
  const at = (x: number) => pt(x * K, low);
  const out: Primitive[] = [];
  if (Lb > 1e-6) out.push(dim(at(0), at(Lb), -6, cm(f, Lb)));
  out.push(dim(at(Lb), at(Lb + run), -6, `${cm(f, sp.tread)} × ${n - 1} = ${cm(f, run)}`));
  if (Lt > 1e-6) out.push(dim(at(Lb + run), at(end), -6, cm(f, Lt)));
  out.push(dim(at(0), at(end), -13, cm(f, end)));
  out.push(dim(pt(end * K, 0), pt(end * K, rise * K), -8, `${f(sp.riser * 100, 1)} × ${n} = ${cm(f, rise)}`));
  out.push(dim(pt(end * K, (rise - tl) * K), pt(end * K, rise * K), -3, cm(f, tl)));
  const ang = sec.angle, mid = Lb + run / 2, soffit = (mid - Lb) * Math.tan(ang) - sec.tv;
  out.push(label(pt(mid * K + Math.sin(ang) * 6 * s, soffit * K - Math.cos(ang) * 6 * s), `e = ${cm(f, sp.waist)}`, 2.2, 'center', (ang * 180) / Math.PI));
  const z0 = row.demand.place?.z;
  if (z0 !== undefined) {
    const level = (x: number, y: number, z: number) => {
      const h = 2.2 * s;
      out.push({ kind: 'polyline', layer: TEXTO, closed: true, points: [pt(x, y), pt(x - h / 2, y + h), pt(x + h / 2, y + h)] });
      out.push(label(pt(x + h, y + h * 1.2), `NPT ${z >= 0 ? '+' : '−'}${f(Math.abs(z), 2)}`, 2.2));
    };
    level(Math.max(0.3, Lb / 2) * K, 0, z0);
    level((Lb + run + Math.max(0.3, Lt / 2)) * K, rise * K, z0 + rise);
  }
  return out;
}

export function stairScheduleRows(row: StairRow, code: SheetCode): ScheduleRow[] {
  return scheduleOf(scheduleElements({ line: [], column: [], slab: [], wall: [], stair: [row] }, { code, slabCover: 0.02 }), { code, scope: 'element' }).rows;
}

const scheduleLayer = (r: ScheduleRow): ArmLayer => (r.kind === 'stairTop' ? 'SUP' : r.kind === 'stairDist' ? 'HOR' : 'INF');

export function stairPlans(row: StairRow, o: StairPlanOptions): DrawingInput[] {
  if (row.unsupported) return [];
  return [
    framed(`${row.key}:sec`, `${row.name} · ${o.tr('rcSheets.stair.section')}`, stairSectionPrimitives(row, o), o.scale, o.group),
    ...scheduleTables(row.key, o.tr('rcSheets.plans.schedule', { name: row.name }), stairScheduleRows(row, o.code), scheduleLayer, o, o.group),
  ];
}
