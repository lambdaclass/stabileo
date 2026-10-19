/**
 * The works by phase on the sheets: the schedule as a table with a bar per phase along the
 * project's time, and each phase as a plan of the level it builds, what it adds drawn full and
 * what stands from before in dashed lines.
 */
import type { DrawingInput } from '../compose';
import type { P, Primitive } from '../primitives';
import { boxOf, drawAxes, type PlanAxis } from './plan-common';
import { drawTable, type Cell } from './table';
import type { Tr } from './details';

const k = 1000;
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

export interface PhaseRow { name: string; start: string; end: string; days: number; members: number }

/** The schedule: one row per phase with its dates and a bar on the project's time line. */
export function phaseSchedule(rows: readonly PhaseRow[], tr: Tr): DrawingInput | null {
  if (!rows.length) return null;
  const t0 = Math.min(...rows.map((r) => day(r.start))), t1 = Math.max(...rows.map((r) => day(r.end)));
  const span = Math.max(1, t1 - t0), W = 70;
  const bar = (r: PhaseRow): Cell => {
    const x0 = ((day(r.start) - t0) / span) * W, x1 = ((day(r.end) - t0) / span) * W;
    return { figure: [{ kind: 'polyline', layer: 'PT-TENDON', closed: true, fill: true, points: [{ x: x0, y: 0 }, { x: Math.max(x1, x0 + 0.6), y: 0 }, { x: Math.max(x1, x0 + 0.6), y: 3 }, { x: x0, y: 3 }] }, { kind: 'line', layer: 'TB-LINE', a: { x: 0, y: -0.5 }, b: { x: W, y: -0.5 } }] };
  };
  const t = drawTable({
    columns: [{ label: '#', width: 8, align: 'center' }, { label: tr('site.col.phase'), width: 60 }, { label: tr('site.col.start'), width: 22, align: 'center' }, { label: tr('site.col.end'), width: 22, align: 'center' }, { label: tr('site.col.days'), width: 12, align: 'right' }, { label: tr('site.col.members'), width: 16, align: 'right' }, { label: tr('site.col.bar'), width: 76, align: 'center' }],
    rows: rows.map((r, i) => [String(i + 1), r.name, r.start, r.end, String(r.days), String(r.members), bar(r)]),
    figureHeight: 7, figureScale: 1,
  });
  return { key: 'phases-schedule', title: tr('site.sheet.schedule'), primitives: t.primitives, width: t.width, height: t.height, origin: { x: 0, y: 0 }, paper: true, group: 'phases' };
}

export interface PhaseGeometry { lines: Array<[P, P]>; points: P[]; outlines: P[][] }

/** One phase on the plan of its level: new full, standing before dashed. */
export function phasePlan(key: string, title: string, now: PhaseGeometry, before: PhaseGeometry, axes: readonly PlanAxis[], scale: number): DrawingInput | null {
  const out: Primitive[] = [], s = scale, pts: P[] = [];
  const mm = (p: P) => ({ x: p.x * k, y: p.y * k });
  const draw = (g: PhaseGeometry, layer: string, dash: boolean) => {
    for (const [a, b] of g.lines) { const A = mm(a), B = mm(b); pts.push(A, B); out.push({ kind: 'line', layer, a: A, b: B, ...(dash ? { dash: true } : {}) }); }
    for (const p of g.points) { const c = mm(p); pts.push(c); const h = 2 * s; out.push({ kind: 'polyline', layer, closed: true, fill: !dash, points: [{ x: c.x - h, y: c.y - h }, { x: c.x + h, y: c.y - h }, { x: c.x + h, y: c.y + h }, { x: c.x - h, y: c.y + h }] }); }
    for (const o of g.outlines) { const q = o.map(mm); pts.push(...q); out.push({ kind: 'polyline', layer, closed: true, points: q }); }
  };
  draw(before, 'FW-HIDDEN', true);
  draw(now, 'FW-OUTLINE', false);
  if (!pts.length) return null;
  const box = boxOf(pts);
  out.push(...drawAxes(axes, box, s));
  const all = boxOf([...pts, { x: box.x0 - 20 * s, y: box.y0 - 20 * s }, { x: box.x1 + 20 * s, y: box.y1 + 20 * s }]);
  return { key, title, primitives: out, width: all.x1 - all.x0, height: all.y1 - all.y0, origin: { x: all.x0, y: all.y0 }, scale: s, group: 'phases' };
}
