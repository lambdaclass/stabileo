import { hookedStraight, type BarShape, type BendRules } from './shape';
import { meshSpan, type MeshSpan } from './footing-mesh';
import type { FootingRow } from './footing-types';

export interface FootingLayerBars extends MeshSpan {
  dir: 'x' | 'y'; dia: number;
  /** Height of the bars' axis over the underside, m. */
  z: number;
  /** From and to along the bars, m from the centroid. */
  from: number; to: number;
  hooked: boolean;
  /** Which ends are hooked: the start and the end along the bars. */
  ends: [boolean, boolean];
  shape: BarShape;
}

type Rect = { x0: number; x1: number; y0: number; y1: number };

export interface FootingDetail {
  B: number; L: number; h: number; cover: number;
  column: Rect | null;
  /** A combined footing's second column. */
  second: Rect | null;
  layers: FootingLayerBars[];
  /** A combined footing's top bars, along its columns' line, hooked down at both ends. */
  top: FootingLayerBars | null;
  /** The footing's sides at a property line: along X at x = `at`, or along Y at y = `at`, m. */
  lines: Array<{ axis: 'x' | 'y'; at: number }>;
  /** Each strap beam over the footing: its plan from the column to past the footing's edge toward its partner, m, and the partner's name. */
  straps: Array<{ axis: 'x' | 'y'; rect: Rect; b: number; h: number; toward: 1 | -1; partner: string; name: string }>;
  /** One dowel as bent, how many, and where the section along X cuts them, m from the centroid. */
  dowels: { count: number; dia: number; shape: BarShape; foot: number; rise: number; z: number; xs: number[] } | null;
}

/** A column's longitudinal bars sit about this far inside its faces, m: where the section draws the dowels. */
const DOWEL_INSET = 0.05;

/** The footing's bars as they are placed: the lower layer on the cover, the other on it; the dowels standing on both with a foot along X. */
export function footingDetail(r: Pick<FootingRow, 'adopted' | 'cover' | 'layers' | 'x' | 'y' | 'demand' | 'dowels' | 'edge' | 'combined'>, R: BendRules): FootingDetail {
  const a = r.adopted, c = r.cover;
  const lowerDia = (r.layers.lower === 'x' ? a.x.dia : a.y.dia) / 1000;
  const layer = (dir: 'x' | 'y'): FootingLayerBars | null => {
    const m = dir === 'x' ? a.x : a.y;
    if (!(m.dia > 0) || !(m.spacing > 0)) return null;
    const db = m.dia / 1000, lower = r.layers.lower === dir;
    const z = c + (lower ? db / 2 : lowerDia + db / 2);
    const len = (dir === 'x' ? a.B : a.L) - 2 * c;
    const k = dir === 'x' ? r.x : r.y;
    const hooked = k?.anchorage.hooked ?? false;
    const ends: [boolean, boolean] = [hooked || k?.lineEnd === -1, hooked || k?.lineEnd === 1];
    const mandrel = R.mandrel(m.dia, 'longitudinal');
    const shape = hookedStraight(0, len, 0, m.dia, mandrel, ends, 1, R.extension(m.dia, 90, 'longitudinal'));
    return { dir, dia: m.dia, z, from: -len / 2, to: len / 2, hooked: ends[0] || ends[1], ends, shape, ...meshSpan(dir, a, m, c) };
  };
  const layers = [layer('x'), layer('y')].filter((l): l is FootingLayerBars => !!l);
  const col = r.demand.column;
  const column = col ? { x0: -a.ex - col.b / 2, x1: -a.ex + col.b / 2, y0: -a.ey - col.h / 2, y1: -a.ey + col.h / 2 } : null;
  let dowels: FootingDetail['dowels'] = null;
  const dw = a.dowels;
  if (column && dw && dw.count > 0 && dw.dia > 0) {
    const db = dw.dia / 1000, z = c + (a.x.dia + a.y.dia) / 1000 + db / 2;
    const foot = Math.max(0.15, R.extension(dw.dia, 90, 'longitudinal') + R.mandrel(dw.dia, 'longitudinal') / 2 + db);
    const rise = a.h - z + (r.dowels?.lap ?? 0);
    const shape: BarShape = { pts: [[foot, 0], [0, 0], [0, rise]], mandrel: R.mandrel(dw.dia, 'longitudinal'), dia: dw.dia };
    dowels = { count: dw.count, dia: dw.dia, shape, foot, rise, z, xs: [column.x0 + DOWEL_INSET, column.x1 - DOWEL_INSET] };
  }
  const o = r.demand.carried;
  const second = o?.column ? { x0: o.at.x - r.demand.at.x - a.ex - o.column.b / 2, x1: o.at.x - r.demand.at.x - a.ex + o.column.b / 2, y0: o.at.y - r.demand.at.y - a.ey - o.column.h / 2, y1: o.at.y - r.demand.at.y - a.ey + o.column.h / 2 } : null;
  let top: FootingLayerBars | null = null;
  const t = a.top, axis = r.combined?.axis;
  if (t && axis && t.dia > 0 && t.spacing > 0) {
    const len = (axis === 'x' ? a.B : a.L) - 2 * c, db = t.dia / 1000;
    const shape = hookedStraight(0, len, 0, t.dia, R.mandrel(t.dia, 'longitudinal'), [true, true], -1, R.extension(t.dia, 90, 'longitudinal'));
    top = { dir: axis, dia: t.dia, z: a.h - c - db / 2, from: -len / 2, to: len / 2, hooked: true, ends: [true, true], shape, ...meshSpan(axis, { B: a.B, L: a.L, ex: 0, ey: 0 }, { dia: t.dia, spacing: t.spacing }, c) };
  }
  const anchor = r.demand.edge?.anchor ?? [0, 0];
  const lines: FootingDetail['lines'] = [];
  if (anchor[0]) lines.push({ axis: 'x', at: (anchor[0] * a.B) / 2 });
  if (anchor[1]) lines.push({ axis: 'y', at: (anchor[1] * a.L) / 2 });
  const straps: FootingDetail['straps'] = (r.edge?.straps ?? []).filter(() => !!column).map((s) => {
    const toward = ((s.axis === 'x' ? anchor[0] : anchor[1]) > 0 ? -1 : 1) as 1 | -1;
    const cx = (column!.x0 + column!.x1) / 2, cy = (column!.y0 + column!.y1) / 2;
    const past = toward * ((s.axis === 'x' ? a.B : a.L) / 2 + 0.4);
    const rect = s.axis === 'x'
      ? { x0: Math.min(cx, past), x1: Math.max(cx, past), y0: cy - s.b / 2, y1: cy + s.b / 2 }
      : { x0: cx - s.b / 2, x1: cx + s.b / 2, y0: Math.min(cy, past), y1: Math.max(cy, past) };
    return { axis: s.axis, rect, b: s.b, h: s.h, toward, partner: s.partner, name: s.line?.name ?? '' };
  });
  return { B: a.B, L: a.L, h: a.h, cover: c, column, second, layers, top, lines, straps, dowels };
}
