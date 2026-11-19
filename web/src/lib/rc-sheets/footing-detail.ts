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
  shape: BarShape;
}

export interface FootingDetail {
  B: number; L: number; h: number; cover: number;
  column: { x0: number; x1: number; y0: number; y1: number } | null;
  layers: FootingLayerBars[];
  /** One dowel as bent, how many, and where the section along X cuts them, m from the centroid. */
  dowels: { count: number; dia: number; shape: BarShape; foot: number; rise: number; z: number; xs: number[] } | null;
}

/** A column's longitudinal bars sit about this far inside its faces, m: where the section draws the dowels. */
const DOWEL_INSET = 0.05;

/** The footing's bars as they are placed: the lower layer on the cover, the other on it; the dowels standing on both with a foot along X. */
export function footingDetail(r: Pick<FootingRow, 'adopted' | 'cover' | 'layers' | 'x' | 'y' | 'demand' | 'dowels'>, R: BendRules): FootingDetail {
  const a = r.adopted, c = r.cover;
  const lowerDia = (r.layers.lower === 'x' ? a.x.dia : a.y.dia) / 1000;
  const layer = (dir: 'x' | 'y'): FootingLayerBars | null => {
    const m = dir === 'x' ? a.x : a.y;
    if (!(m.dia > 0) || !(m.spacing > 0)) return null;
    const db = m.dia / 1000, lower = r.layers.lower === dir;
    const z = c + (lower ? db / 2 : lowerDia + db / 2);
    const len = (dir === 'x' ? a.B : a.L) - 2 * c;
    const hooked = (dir === 'x' ? r.x : r.y)?.anchorage.hooked ?? false;
    const mandrel = R.mandrel(m.dia, 'longitudinal');
    const shape = hookedStraight(0, len, 0, m.dia, mandrel, [hooked, hooked], 1, R.extension(m.dia, 90, 'longitudinal'));
    return { dir, dia: m.dia, z, from: -len / 2, to: len / 2, hooked, shape, ...meshSpan(dir, a, m, c) };
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
  return { B: a.B, L: a.L, h: a.h, cover: c, column, layers, dowels };
}
