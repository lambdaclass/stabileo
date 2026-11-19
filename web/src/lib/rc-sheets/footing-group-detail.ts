import { hookedStraight, type BendRules } from './shape';
import { footingDetail, type FootingDetail, type FootingLayerBars } from './footing-detail';
import { meshSpan } from './footing-mesh';
import { extraPositions } from './footing-group';
import type { FootingMesh, FootingRow, GroupExtra } from './footing-types';
import type { DowelRow } from './footing-dowels';

export interface GroupLayerBars extends FootingLayerBars {
  face: 'bottom' | 'top';
  /** The set it belongs to: the mesh, or the band of bars added over a strip. */
  set: string;
}

export interface GroupDowels { key: string; name: string; rowKey?: string; rect: { x0: number; x1: number; y0: number; y1: number }; dowels: NonNullable<FootingDetail['dowels']> }

export interface GroupDetail { layers: GroupLayerBars[]; dowels: GroupDowels[] }

type Row = Pick<FootingRow, 'adopted' | 'cover' | 'layers' | 'demand' | 'group' | 'h'>;

/**
 * A strip's or mat's bars as placed: the bottom meshes on the cover, the lower the longer way;
 * the top meshes under the top cover, hooked down; the bars added over a strip in the layer of
 * their face and direction; every bar the plan's length less the covers, hooked at both ends.
 * Each column's dowels as an isolated footing places them.
 */
export function groupDetail(r: Row, R: BendRules): GroupDetail {
  const a = r.adopted, c = r.cover;
  const lowerDia = (r.layers.lower === 'x' ? a.x.dia : a.y.dia) / 1000;
  const tx = a.tops?.x, ty = a.tops?.y;
  const topLower = a.B >= a.L ? 'x' : 'y';
  const topLowerDia = ((topLower === 'x' ? tx : ty)?.dia ?? 0) / 1000;
  const zOf = (dir: 'x' | 'y', face: 'bottom' | 'top', dia: number) => {
    const db = dia / 1000;
    if (face === 'bottom') return c + (r.layers.lower === dir ? db / 2 : lowerDia + db / 2);
    return a.h - c - (topLower === dir || !topLowerDia ? db / 2 : topLowerDia + db / 2);
  };
  const shapeOf = (dir: 'x' | 'y', face: 'bottom' | 'top', dia: number) => {
    const len = (dir === 'x' ? a.B : a.L) - 2 * c;
    return { len, shape: hookedStraight(0, len, 0, dia, R.mandrel(dia, 'longitudinal'), [true, true], face === 'bottom' ? 1 : -1, R.extension(dia, 90, 'longitudinal')) };
  };
  const layers: GroupLayerBars[] = [];
  const mesh = (dir: 'x' | 'y', face: 'bottom' | 'top', m: FootingMesh | undefined, set: string) => {
    if (!m || !(m.dia > 0) || !(m.spacing > 0)) return;
    const { len, shape } = shapeOf(dir, face, m.dia);
    layers.push({ dir, dia: m.dia, z: zOf(dir, face, m.dia), from: -len / 2, to: len / 2, hooked: true, ends: [true, true], shape, face, set, ...meshSpan(dir, { B: a.B, L: a.L, ex: 0, ey: 0 }, { dia: m.dia, spacing: m.spacing }, c) });
  };
  mesh('x', 'bottom', a.x, 'footingX');
  mesh('y', 'bottom', a.y, 'footingY');
  mesh('x', 'top', tx, 'footingTopX');
  mesh('y', 'top', ty, 'footingTopY');
  (a.extra ?? []).forEach((e: GroupExtra, i) => {
    if (!(e.mesh.dia > 0)) return;
    const { len, shape } = shapeOf(e.dir, e.face, e.mesh.dia);
    const span = (e.dir === 'x' ? a.L : a.B) / 2 - c - e.mesh.dia / 2000;
    const positions = extraPositions(e).filter((p) => Math.abs(p) <= span + 1e-9);
    layers.push({ dir: e.dir, dia: e.mesh.dia, z: zOf(e.dir, e.face, e.mesh.dia), from: -len / 2, to: len / 2, hooked: true, ends: [true, true], shape, face: e.face, set: `extra${i}`, positions, inBand: 0 });
  });
  const dowels: GroupDowels[] = [];
  for (const m of groupDowelRows(r)) {
    const det = footingDetail({ ...m.row, layers: r.layers, x: null, y: null }, R);
    if (det.dowels && det.column) dowels.push({ key: m.key, name: m.name, ...(m.rowKey ? { rowKey: m.rowKey } : {}), rect: det.column, dowels: det.dowels });
  }
  return { layers, dowels };
}

/** Each column's or core's dowels on a strip or mat as an isolated footing of the group's plan would take them, centred on it: what `dowelPlaces` lays out one by one. */
export function groupDowelRows(r: Pick<FootingRow, 'adopted' | 'cover' | 'demand' | 'group'>): Array<{ key: string; name: string; rowKey?: string; row: DowelRow }> {
  const a = r.adopted, out: Array<{ key: string; name: string; rowKey?: string; row: DowelRow }> = [];
  for (const k of r.group?.columns ?? []) {
    const m = r.demand.group?.members.find((x) => x.key === k.key);
    const dw = a.columns?.[k.key];
    if (!m?.column || !dw || !(dw.count > 0)) continue;
    const row = {
      adopted: { ...a, ex: -k.x, ey: -k.y, dowels: dw, top: undefined }, cover: r.cover,
      demand: { ...m, edge: undefined, carried: undefined },
      dowels: k.dowels ? { count: k.dowels.count, dia: k.dowels.dia, ldc: Math.max(k.dowels.ldc, k.dowels.ldh), available: k.dowels.available, lap: k.dowels.lap, tension: k.dowels.tension, above: k.dowels.above, offset: k.dowels.offset } : null,
    } as DowelRow;
    out.push({ key: k.key, name: k.name, ...(m.column.rowKey ? { rowKey: m.column.rowKey } : {}), row });
  }
  return out;
}
