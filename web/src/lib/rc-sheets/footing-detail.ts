import { hookedStraight, type BarShape, type BendRules } from './shape';
import { DOWEL_INSET, columnRects, dowelShape } from './footing-dowels';
import { meshSpan, type MeshSpan } from './footing-mesh';
import type { FootingMesh, FootingRow } from './footing-types';

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
  /** The top bars, hooked down at both ends: a combined footing's along its columns' line, a pile cap's along each axis a load off its piles bends it upward on, the outer layer first. */
  tops: FootingLayerBars[];
  /** The footing's sides at a property line: along X at x = `at`, or along Y at y = `at`, m. */
  lines: Array<{ axis: 'x' | 'y'; at: number }>;
  /** Each strap beam over the footing: its plan from the column to past the footing's edge toward its partner, m, and the partner's name. */
  straps: Array<{ axis: 'x' | 'y'; rect: Rect; b: number; h: number; toward: 1 | -1; partner: string; name: string }>;
  /**
   * One dowel as bent, how many, and where the section along X cuts them, m from the centroid: its
   * foot out along the mesh at `z`, up `rise`, cranked in `offset` at 1:6 to end at `crankAt` over
   * `z`, where the lap with the column's bars starts. Its shape's first axis points out of the column;
   * `turned`, its foot turned in, for a side of the section where the foot would leave the concrete.
   */
  dowels: { count: number; dia: number; shape: BarShape; foot: number; rise: number; z: number; offset: number; crankAt: number; xs: number[]; inward: boolean[]; turned: BarShape } | null;
}

/** The footing's bars as they are placed: the lower layer on the cover, the other on it; the dowels standing on both with a foot out of the column, cranked in to lap beside its bars. */
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
  const { column, second } = columnRects(r);
  let dowels: FootingDetail['dowels'] = null;
  const dw = a.dowels;
  if (column && dw && dw.count > 0 && dw.dia > 0) {
    const place = { dia: dw.dia, lap: r.dowels?.lap ?? 0, offset: r.dowels?.offset ?? 0 };
    const out = dowelShape(r, { ...place, inward: false }, R), turned = dowelShape(r, { ...place, inward: true }, R);
    const hx = a.B / 2 - c;
    const xs = [column.x0 + DOWEL_INSET, column.x1 - DOWEL_INSET], inward = xs.map((x, i) => Math.abs(x + (i === 0 ? -1 : 1) * out.foot) > hx + 1e-9);
    dowels = { count: dw.count, dia: dw.dia, shape: out.shape, turned: turned.shape, foot: out.foot, rise: out.rise, z: out.z, offset: place.offset, crankAt: out.crankAt, xs, inward };
  }
  const topLayer = (axis: 'x' | 'y', t: FootingMesh, below: number): FootingLayerBars => {
    const len = (axis === 'x' ? a.B : a.L) - 2 * c, db = t.dia / 1000;
    const shape = hookedStraight(0, len, 0, t.dia, R.mandrel(t.dia, 'longitudinal'), [true, true], -1, R.extension(t.dia, 90, 'longitudinal'));
    return { dir: axis, dia: t.dia, z: a.h - c - below - db / 2, from: -len / 2, to: len / 2, hooked: true, ends: [true, true], shape, ...meshSpan(axis, { B: a.B, L: a.L, ex: 0, ey: 0 }, { dia: t.dia, spacing: t.spacing }, c) };
  };
  const laid = (m: FootingMesh | undefined): m is FootingMesh => !!m && m.dia > 0 && m.spacing > 0;
  const tops: FootingLayerBars[] = [];
  const axis = r.combined?.axis;
  if (axis && laid(a.top)) tops.push(topLayer(axis, a.top, 0));
  else if (a.piles && a.tops) for (const dir of ['x', 'y'] as const) { const m = a.tops[dir]; if (laid(m)) tops.push(topLayer(dir, m, tops.reduce((t, l) => t + l.dia / 1000, 0))); }
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
  return { B: a.B, L: a.L, h: a.h, cover: c, column, second, layers, tops, lines, straps, dowels };
}
