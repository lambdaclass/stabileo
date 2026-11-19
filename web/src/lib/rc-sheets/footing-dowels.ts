/**
 * A footing's dowels one by one, as the schedule cuts them and the model places them: under each
 * of the column's bars (or a pier's: every vertical of its walls and every bar of its column zones,
 * each of its own diameter and lap), the foot along the mesh out of the column and, where that would
 * leave the concrete (at a property line), turned in; up through the footing, cranked in at 1:6 by
 * one bar's diameter to end where the lap starts, and on over the lap.
 */
import { columnLayout } from './column-layout';
import type { ColumnRow } from './column-row';
import { CRANK_SLOPE, inwardOf, lapOffset } from './column-stack';
import type { FootingRow } from './footing-types';
import type { BarShape, BendRules } from './shape';

/** A column's longitudinal bars sit about this far inside its faces, m: where dowels go with no bars to follow. */
export const DOWEL_INSET = 0.05;

type Rect = { x0: number; x1: number; y0: number; y1: number };

/** A dowel in the footing's plan, m from its centroid: the way out of the column, its diameter, lap and crank, m, and whether its foot is turned in. */
export interface DowelPlace { x: number; y: number; out: [number, number]; dia: number; lap: number; offset: number; inward: boolean }

/** How a column's own axes lie in plan: where its b and its h point. Absent, b along X and h along Y, as the footing's plan draws it. */
export interface ColumnAxes { x: [number, number]; y: [number, number] }

export type DowelRow = Pick<FootingRow, 'adopted' | 'cover' | 'demand' | 'dowels'>;

export function columnRects(r: Pick<FootingRow, 'adopted' | 'demand'>): { column: Rect | null; second: Rect | null } {
  const a = r.adopted, col = r.demand.column, o = r.demand.carried;
  const column = col ? { x0: -a.ex - col.b / 2, x1: -a.ex + col.b / 2, y0: -a.ey - col.h / 2, y1: -a.ey + col.h / 2 } : null;
  const second = o?.column ? { x0: o.at.x - r.demand.at.x - a.ex - o.column.b / 2, x1: o.at.x - r.demand.at.x - a.ex + o.column.b / 2, y0: o.at.y - r.demand.at.y - a.ey - o.column.h / 2, y1: o.at.y - r.demand.at.y - a.ey + o.column.h / 2 } : null;
  return { column, second };
}

/** The foot of a dowel, m: the hook's extension past its bend, no shorter than 15 cm. */
export const dowelFoot = (dia: number, R: BendRules): number => Math.max(0.15, R.extension(dia, 90, 'longitudinal') + R.mandrel(dia, 'longitudinal') / 2 + dia / 1000);

/** Where a dowel of `dia` stands on the mesh, m over the underside. */
export const dowelBase = (r: Pick<FootingRow, 'adopted' | 'cover'>, dia: number): number => r.cover + (r.adopted.x.dia + r.adopted.y.dia) / 1000 + dia / 2000;

/** One dowel as bent: the first axis points out of the column (its foot there, or turned in), the second up from where it stands on the mesh. */
export function dowelShape(r: DowelRow, p: Pick<DowelPlace, 'dia' | 'lap' | 'offset' | 'inward'>, R: BendRules): { shape: BarShape; z: number; foot: number; crankAt: number; rise: number } {
  const db = p.dia / 1000, z = dowelBase(r, p.dia), foot = dowelFoot(p.dia, R);
  const crankAt = r.adopted.h - z + (r.dowels?.above ?? 0), rise = crankAt + p.lap, f = p.inward ? -foot : foot;
  const bend = Math.max(db, crankAt - p.offset / CRANK_SLOPE);
  const pts: Array<[number, number]> = p.offset > 1e-6 ? [[f, 0], [0, 0], [0, bend], [-p.offset, crankAt], [-p.offset, rise]] : [[f, 0], [0, 0], [0, rise]];
  return { shape: { pts, mandrel: R.mandrel(p.dia, 'longitudinal'), dia: p.dia }, z, foot, crankAt, rise };
}

function around(rect: Rect, count: number): Array<{ x: number; y: number; out: [number, number] }> {
  const cx = (rect.x0 + rect.x1) / 2, cy = (rect.y0 + rect.y1) / 2;
  const hx = (rect.x1 - rect.x0) / 2 - DOWEL_INSET, hy = (rect.y1 - rect.y0) / 2 - DOWEL_INSET, per = 4 * (hx + hy);
  return Array.from({ length: count }, (_, i) => {
    let s = (i / count) * per;
    const side = [2 * hx, 2 * hy, 2 * hx, 2 * hy];
    const corners: Array<[number, number, number, number]> = [[-hx, -hy, 1, 0], [hx, -hy, 0, 1], [hx, hy, -1, 0], [-hx, hy, 0, -1]];
    let p: [number, number] = [0, 0];
    for (let k = 0; k < 4; k++) {
      if (s <= side[k]! + 1e-12) { const [x, y, dx, dy] = corners[k]!; p = [x + dx * s, y + dy * s]; break; }
      s -= side[k]!;
    }
    const out: [number, number] = Math.abs(p[0]) >= Math.abs(p[1]) ? [Math.sign(p[0]) || 1, 0] : [0, Math.sign(p[1]) || 1];
    return { x: cx + p[0], y: cy + p[1], out };
  });
}

function underColumn(rect: Rect, count: number, row: ColumnRow | undefined, axes: ColumnAxes | undefined): Array<{ x: number; y: number; out: [number, number] }> {
  const bars = row ? columnLayout(row, row.adopted, row.cover, row.aggregate).bars : [];
  if (!row || bars.length !== count) return around(rect, count);
  const ax = axes ?? { x: [1, 0], y: [0, 1] }, cx = (rect.x0 + rect.x1) / 2, cy = (rect.y0 + rect.y1) / 2;
  return bars.map((p) => {
    const n = inwardOf(p, row), ox = -(ax.x[0] * n[0] + ax.y[0] * n[1]), oy = -(ax.x[1] * n[0] + ax.y[1] * n[1]), l = Math.hypot(ox, oy) || 1;
    return { x: cx + ax.x[0] * p.x + ax.y[0] * p.y, y: cy + ax.x[1] * p.x + ax.y[1] * p.y, out: [ox / l, oy / l] };
  });
}

/**
 * Every dowel of the footing in its plan, m from its centroid: under its column's bars (the second
 * column's too), or under a pier's bars, as many as adopted; a dowel whose foot would leave the
 * concrete has it turned in.
 */
export function dowelPlaces(r: DowelRow, R: BendRules, columns: { first?: ColumnRow; second?: ColumnRow; axes?: (row: ColumnRow) => ColumnAxes | undefined } = {}): DowelPlace[] {
  const a = r.adopted, dw = a.dowels, rects = columnRects(r);
  if (!rects.column || !dw || !(dw.count > 0) || !(dw.dia > 0)) return [];
  const lap = r.dowels?.lap ?? 0, offset = r.dowels?.offset ?? 0;
  const raw: Array<{ x: number; y: number; out: [number, number]; dia: number; lap: number; offset: number }> = [];
  const bars = r.demand.column?.bars, at = bars?.at ?? [];
  if (at.length) {
    const own = dw.dia === bars!.dia, ox = r.demand.at.x + a.ex, oy = r.demand.at.y + a.ey;
    for (const b of at.slice(0, dw.count)) {
      const dia = own ? b.dia : dw.dia;
      raw.push({ x: b.x - ox, y: b.y - oy, out: [-b.n[0], -b.n[1]], dia, lap: own ? b.lap : lap, offset: lapOffset(dia, b.dia) });
    }
    for (const p of around(rects.column, dw.count - raw.length)) raw.push({ ...p, dia: dw.dia, lap, offset });
  } else {
    for (const p of underColumn(rects.column, dw.count, columns.first, columns.first && columns.axes?.(columns.first))) raw.push({ ...p, dia: dw.dia, lap, offset });
    const d2 = a.dowels2;
    if (rects.second && d2 && d2.count > 0) for (const p of underColumn(rects.second, d2.count, columns.second, columns.second && columns.axes?.(columns.second))) raw.push({ ...p, dia: d2.dia, lap, offset });
  }
  const hx = a.B / 2 - r.cover, hy = a.L / 2 - r.cover;
  return raw.map((p) => {
    const f = dowelFoot(p.dia, R), tx = p.x + p.out[0] * f, ty = p.y + p.out[1] * f;
    return { ...p, inward: Math.abs(tx) > hx + 1e-9 || Math.abs(ty) > hy + 1e-9 };
  });
}

const groupKey = (p: Pick<DowelPlace, 'dia' | 'lap' | 'offset' | 'inward'>) => `${p.dia}|${Math.round(p.lap * 1000)}|${Math.round(p.offset * 1000)}|${p.inward}`;

/** The dowels as the bender cuts them: one shape per diameter, lap, crank and foot, with how many. */
export function dowelGroups(r: DowelRow, places: readonly DowelPlace[], R: BendRules): Array<{ key: string; count: number; shape: BarShape; z: number }> {
  const out = new Map<string, { key: string; count: number; shape: BarShape; z: number }>();
  for (const p of places) {
    const k = groupKey(p), g = out.get(k);
    if (g) { g.count++; continue; }
    const s = dowelShape(r, p, R);
    out.set(k, { key: k, count: 1, shape: s.shape, z: s.z });
  }
  return [...out.values()];
}

export const dowelGroupOf = (p: DowelPlace): string => groupKey(p);

/** The dowels as the sheets name them: so many of each diameter, thickest first. */
export function dowelsText(r: Pick<DowelRow, 'adopted' | 'demand'>): string {
  const dw = r.adopted.dowels;
  if (!dw) return '—';
  const at = r.demand.column?.bars?.at;
  if (!at?.length || dw.dia !== r.demand.column?.bars?.dia) return `${dw.count} Ø${dw.dia}`;
  const n = new Map<number, number>();
  for (const b of at.slice(0, dw.count)) n.set(b.dia, (n.get(b.dia) ?? 0) + 1);
  const extra = dw.count - Math.min(dw.count, at.length);
  if (extra > 0) n.set(dw.dia, (n.get(dw.dia) ?? 0) + extra);
  return [...n].sort((p, q) => q[0] - p[0]).map(([dia, k]) => `${k} Ø${dia}`).join(' + ');
}
