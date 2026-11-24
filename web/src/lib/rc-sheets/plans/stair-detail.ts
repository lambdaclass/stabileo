/**
 * A stair's drawing: its section along the run to scale, the landings, steps and waist, each
 * position of bars bent as it is placed with its mark, the distribution bars as dots, and its bar
 * schedule.
 */
import type { DrawingInput } from '../../sheets/compose';
import type { Primitive } from '../../sheets/primitives';
import { scheduleElements } from '../schedule/pieces';
import { scheduleOf, type ScheduleRow } from '../schedule/schedule';
import type { StairRow } from '../stair-row';
import type { SheetCode } from '../types';
import { HORM, arm, framed, label, pt, type ArmLayer, type PlanCtx } from './draw';
import { scheduleTables } from './schedule-table';

const K = 1000;

export interface StairPlanOptions extends PlanCtx { code: SheetCode; group: string }

const layerOf = (role: StairRow['bars'][number]['role']): ArmLayer => (role === 'main' || role === 'landing' ? 'INF' : role === 'dist' || role === 'distTop' ? 'HOR' : 'SUP');

/** The section's primitives, model millimetres along the run and up. */
export function stairSectionPrimitives(row: StairRow): Primitive[] {
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
  if (d.length) ps.push(label(pt(0, -row.section.tl * K - 300), d.join('   '), 2));
  return ps;
}

export function stairScheduleRows(row: StairRow, code: SheetCode): ScheduleRow[] {
  return scheduleOf(scheduleElements({ line: [], column: [], slab: [], wall: [], stair: [row] }, { code, slabCover: 0.02 }), { code, scope: 'element' }).rows;
}

const scheduleLayer = (r: ScheduleRow): ArmLayer => (r.kind === 'stairTop' ? 'SUP' : r.kind === 'stairDist' ? 'HOR' : 'INF');

export function stairPlans(row: StairRow, o: StairPlanOptions): DrawingInput[] {
  if (row.unsupported) return [];
  return [
    framed(`${row.key}:sec`, `${row.name} · ${o.tr('rcSheets.stair.section')}`, stairSectionPrimitives(row), o.scale, o.group),
    ...scheduleTables(row.key, o.tr('rcSheets.plans.schedule', { name: row.name }), stairScheduleRows(row, o.code), scheduleLayer, o, o.group),
  ];
}
