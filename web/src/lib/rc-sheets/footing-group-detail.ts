import { crossTie, hookedStraight, type BarShape, type BendRules } from './shape';
import { cageLegs, dropRect } from './footing-punching';
import type { FootingPlan } from './footing-mechanics';
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

/** A column's stirrups for punching as placed: one leg as bent, its foot `z0` over the underside, and every leg in plan with the way its hooks turn, toward the column. */
export interface GroupCage { key: string; name: string; dia: number; shape: BarShape; z0: number; legs: Array<{ x: number; y: number; toward: [number, number] }> }

/** A drop under a column as placed: its plan, m from the footing's centroid, its depth under the underside and its own mesh, each layer's `z` under the underside negative. */
export interface GroupDrop { key: string; name: string; rect: { x0: number; x1: number; y0: number; y1: number }; hd: number; layers: GroupLayerBars[] }

export interface GroupDetail { layers: GroupLayerBars[]; dowels: GroupDowels[]; cages: GroupCage[]; drops: GroupDrop[] }

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
  const cages: GroupCage[] = [], drops: GroupDrop[] = [];
  for (const k of r.group?.columns ?? []) {
    const fix = a.punching?.[k.key];
    if (!fix) continue;
    const plan: FootingPlan = { B: a.B, L: a.L, xc: k.x, yc: k.y, b: k.b, h: k.h };
    if (fix.cage) {
      const dia = fix.cage.dia, db = dia / 1000, len = a.h - 2 * c - db;
      const shape = crossTie(len, dia, R.mandrel(dia, 'transverse'), [135, 135], [R.extension(dia, 135, 'transverse'), R.extension(dia, 135, 'transverse')]);
      cages.push({ key: k.key, name: k.name, dia, shape, z0: c + db / 2, legs: cageLegs(plan, r.layers.d, c, fix.cage).flat() });
    }
    if (fix.drop) {
      const rect = dropRect(plan, fix.drop), hd = fix.drop.hd;
      const own: GroupLayerBars[] = [];
      for (const [dir, m] of [['x', a.x], ['y', a.y]] as const) {
        if (!(m.dia > 0) || !(m.spacing > 0)) continue;
        const db = m.dia / 1000, len = (dir === 'x' ? rect.x1 - rect.x0 : rect.y1 - rect.y0) - 2 * c;
        if (!(len > 0)) continue;
        const shape = hookedStraight(0, len, 0, m.dia, R.mandrel(m.dia, 'longitudinal'), [true, true], 1, R.extension(m.dia, 90, 'longitudinal'));
        const across = { B: rect.x1 - rect.x0, L: rect.y1 - rect.y0, ex: 0, ey: 0 }, mid = dir === 'x' ? (rect.y0 + rect.y1) / 2 : (rect.x0 + rect.x1) / 2;
        const span = meshSpan(dir, across, { dia: m.dia, spacing: m.spacing }, c);
        const from = (dir === 'x' ? rect.x0 : rect.y0) + c;
        own.push({ dir, dia: m.dia, z: -hd + c + (r.layers.lower === dir ? db / 2 : lowerDia + db / 2), from, to: from + len, hooked: true, ends: [true, true], shape, face: 'bottom', set: `drop:${k.key}:${dir}`, positions: span.positions.map((p) => p + mid), inBand: 0 });
      }
      drops.push({ key: k.key, name: k.name, rect, hd, layers: own });
    }
  }
  return { layers, dowels, cages, drops };
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
