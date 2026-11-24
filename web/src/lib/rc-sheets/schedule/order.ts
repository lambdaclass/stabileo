/**
 * What is ordered for each pour: by level, the concrete of its elements, m³, and its bars by
 * diameter, kg with the schedule's waste and the stock bars they come in; with the steel per
 * cubic metre of concrete by level and by family, the figure a take-off is checked against.
 *
 * The concrete is the elements' own: a beam's spans b·h·length, a column's b·h·storey, a slab's
 * lx·ly·h, a wall's length·height·thickness, a footing's body, drops, piles and pedestal, a
 * stair's section by its width. The bars are the schedule's, each piece in its element's level.
 *
 * Pure.
 */
import { footingConcrete } from '../footing-layouts';
import { shapeWeight } from '../shape';
import type { BeamRow } from '../beam-row';
import type { LineLayout } from '../beam-line';
import type { ColumnRow } from '../column-row';
import type { SlabRow } from '../slab-row';
import type { WallRow } from '../wall-row';
import type { FootingRow } from '../footing-types';
import type { StairRow } from '../stair-row';
import type { SheetFamily } from '../types';
import { STOCK_LENGTH, type BendingSchedule } from './schedule';

export interface OrderRows { line: readonly LineLayout[]; beam?: readonly BeamRow[]; column: readonly ColumnRow[]; slab: readonly SlabRow[]; wall: readonly WallRow[]; footing?: readonly FootingRow[]; stair?: readonly StairRow[] }

export interface OrderBars { dia: number; kg: number; withWaste: number; stockBars: number }

export interface OrderLevel {
  level: string;
  /** m³ of concrete, all of it and by family. */
  concrete: number;
  byFamily: Partial<Record<SheetFamily, { concrete: number; kg: number }>>;
  /** kg of bars, without and with the schedule's waste. */
  kg: number; withWaste: number;
  bars: OrderBars[];
  /** kg of bars per m³ of concrete; null with no concrete. */
  ratio: number | null;
}

export interface PurchaseOrder { levels: OrderLevel[]; total: OrderLevel; waste: number; stockLength: number }

const STEEL = 7850;
/** kg of one stock bar of `dia` mm. */
export const stockBarKg = (dia: number, length = STOCK_LENGTH): number => (Math.PI * (dia / 1000) ** 2) / 4 * length * STEEL;

const stairArea = (r: StairRow): number => {
  const o = r.section.outline;
  let a = 0;
  for (let i = 0; i < o.length; i++) { const p = o[i]!, q = o[(i + 1) % o.length]!; a += p[0] * q[1] - q[0] * p[1]; }
  return Math.abs(a) / 2;
};

/** Each element's concrete, m³, with its family and level. */
export function concreteOf(rows: OrderRows): Array<{ family: SheetFamily; level: string; m3: number }> {
  return [
    ...rows.line.map((l) => ({ family: 'beam' as const, level: l.level ?? '', m3: l.spans.reduce((t, s) => t + s.b * s.h * Math.max(0, s.x1 - s.x0), 0) })),
    ...rows.column.map((r) => ({ family: 'column' as const, level: r.level ?? '', m3: r.b * r.h * r.length })),
    ...rows.slab.map((r) => ({ family: 'slab' as const, level: r.level ?? '', m3: r.lx * r.ly * r.h })),
    ...rows.wall.map((r) => ({ family: 'wall' as const, level: r.level ?? '', m3: r.length * r.height * r.thickness })),
    ...(rows.footing ?? []).map((r) => ({ family: 'footing' as const, level: r.level ?? '', m3: footingConcrete(r) })),
    ...(rows.stair ?? []).filter((r) => !r.unsupported).map((r) => ({ family: 'stair' as const, level: r.level ?? '', m3: stairArea(r) * r.demand.spec.width })),
  ];
}

/** The order by level, the levels in `order` first, and its total. */
export function purchaseOrder(rows: OrderRows, s: BendingSchedule, order: readonly string[] = []): PurchaseOrder {
  const at = new Map<string, { concrete: number; byFamily: OrderLevel['byFamily']; byDia: Map<number, number> }>();
  const of = (level: string) => { let v = at.get(level); if (!v) { v = { concrete: 0, byFamily: {}, byDia: new Map() }; at.set(level, v); } return v; };
  const fam = (v: ReturnType<typeof of>, f: SheetFamily) => (v.byFamily[f] ??= { concrete: 0, kg: 0 });
  for (const c of concreteOf(rows)) { const v = of(c.level); v.concrete += c.m3; fam(v, c.family).concrete += c.m3; }
  for (const e of s.marked) {
    const v = of(e.level ?? '');
    for (const m of e.marks) {
      const kg = shapeWeight(m.shape, m.count);
      v.byDia.set(m.shape.dia, (v.byDia.get(m.shape.dia) ?? 0) + kg);
      fam(v, e.family).kg += kg;
    }
  }
  const levelOf = (level: string, v: { concrete: number; byFamily: OrderLevel['byFamily']; byDia: Map<number, number> }): OrderLevel => {
    const bars = [...v.byDia].sort((a, b) => a[0] - b[0]).map(([dia, kg]) => { const withWaste = kg * (1 + s.waste); return { dia, kg, withWaste, stockBars: Math.ceil(withWaste / stockBarKg(dia) - 1e-9) }; });
    const kg = bars.reduce((t, b) => t + b.kg, 0);
    return { level, concrete: v.concrete, byFamily: v.byFamily, kg, withWaste: kg * (1 + s.waste), bars, ratio: v.concrete > 1e-9 ? kg / v.concrete : null };
  };
  const rank = (l: string) => { const i = order.indexOf(l); return i < 0 ? order.length : i; };
  const levels = [...at].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0], undefined, { numeric: true })).map(([l, v]) => levelOf(l, v));
  const all = { concrete: 0, byFamily: {} as OrderLevel['byFamily'], byDia: new Map<number, number>() };
  for (const [, v] of at) {
    all.concrete += v.concrete;
    for (const [d, kg] of v.byDia) all.byDia.set(d, (all.byDia.get(d) ?? 0) + kg);
    for (const [f, x] of Object.entries(v.byFamily) as Array<[SheetFamily, { concrete: number; kg: number }]>) { const t = (all.byFamily[f] ??= { concrete: 0, kg: 0 }); t.concrete += x.concrete; t.kg += x.kg; }
  }
  return { levels, total: levelOf('', all), waste: s.waste, stockLength: STOCK_LENGTH };
}

/** The order as text to paste in a message: each level's concrete and its stock bars by diameter. */
export function orderText(o: PurchaseOrder, tr: (k: string, p?: Record<string, string | number>) => string, fmt: (v: number, d: number) => string): string {
  const level = (l: OrderLevel) => [
    `${l.level || '—'}: ${tr('rcSheets.order.concreteLine', { m3: fmt(l.concrete, 2) })}`,
    ...l.bars.map((b) => `  ${tr('rcSheets.order.barsLine', { n: b.stockBars, dia: b.dia, length: o.stockLength, kg: fmt(b.withWaste, 0) })}`),
  ].join('\n');
  return [...o.levels.map(level), '', `${tr('rcSheets.order.total')}: ${tr('rcSheets.order.concreteLine', { m3: fmt(o.total.concrete, 2) })}`, ...o.total.bars.map((b) => `  ${tr('rcSheets.order.barsLine', { n: b.stockBars, dia: b.dia, length: o.stockLength, kg: fmt(b.withWaste, 0) })}`), tr('rcSheets.order.wasteNote', { waste: fmt(o.waste * 100, 0) })].join('\n');
}
