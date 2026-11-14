/**
 * The project's bending schedule: one table of every piece the sheets place, marked, with equal
 * elements gathered in one row each, and the totals an order is placed with.
 *
 * Marks: the same shape, diameter and length is the same mark within a scope (each element by
 * default; a level, or the whole project). Within an element a line keeps its elevation's letter for
 * the first of equal bars, and what else it holds takes the next free letters; over a level or the
 * project marks are numbered. Elements of one family holding the same marks in the same numbers are
 * one row group ("C3 = C7").
 */
import { developedLength, shapeKey, shapeWeight, type BarShape } from '../shape';
import { rulesFor } from '../codes';
import type { MarkScope, SheetFamily } from '../types';
import { scheduleElements, type PieceKind, type PieceOptions, type PieceRows, type ScheduleElement } from './pieces';
import { buildSchedule } from './stock';

export const DEFAULT_WASTE = 0.1;
export const STOCK_LENGTH = 12;

export interface ScheduleOptions extends PieceOptions {
  /** Added to the order, a fraction. */
  waste?: number;
  scope?: MarkScope;
}

export interface MarkedPiece { mark: string; key: string; kind: PieceKind; count: number; shape: BarShape; elevation: string[] }

export interface ScheduleRow {
  /** The elements the row stands for, by name. */
  element: string;
  elements: string[];
  family: SheetFamily;
  level?: string;
  mark: string;
  /** The line elevation's marks the mark gathers, when more than its own. */
  elevation: string[];
  kind: PieceKind;
  dia: number;
  perElement: number;
  equal: number;
  total: number;
  shape: BarShape;
  /** One piece's developed length and all of them, m; kg of all of them. */
  unitLength: number;
  totalLength: number;
  kg: number;
  /** Longer than a stock bar: it is spliced. */
  long: boolean;
}

export interface BendingSchedule {
  rows: ScheduleRow[];
  byDiameter: Array<{ dia: number; length: number; kg: number; withWaste: number; stockBars: number }>;
  byFamily: Array<{ family: SheetFamily; kg: number; withWaste: number }>;
  total: { length: number; kg: number; withWaste: number };
  waste: number;
  scope: MarkScope;
  clause: string;
  /** An i18n key, when the code's bending rules are assumed. */
  confirm?: string;
}

export const letterMark = (i: number): string => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? String(Math.floor(i / 26)) : '');

const scopeOf = (e: ScheduleElement, scope: MarkScope) => (scope === 'element' ? `e:${e.key}` : scope === 'level' ? `l:${e.level ?? ''}` : 'p');

/** Each element's pieces with equal ones merged and marked within the scope. */
export function assignMarks(elements: readonly ScheduleElement[], scope: MarkScope): Array<ScheduleElement & { marks: MarkedPiece[] }> {
  const numbered = new Map<string, Map<string, string>>();
  return elements.map((e) => {
    const merged = new Map<string, MarkedPiece>();
    for (const p of e.pieces) {
      const key = shapeKey(p.shape);
      const m = merged.get(key);
      if (m) { m.count += p.count; if (p.elevation) m.elevation.push(p.elevation); }
      else merged.set(key, { mark: '', key, kind: p.kind, count: p.count, shape: p.shape, elevation: p.elevation ? [p.elevation] : [] });
    }
    const list = [...merged.values()];
    if (scope === 'element') {
      const used = new Set(list.flatMap((m) => m.elevation));
      let i = 0;
      for (const m of list) {
        if (m.elevation.length) { m.mark = m.elevation[0]!; continue; }
        while (used.has(letterMark(i))) i++;
        m.mark = letterMark(i);
        used.add(m.mark);
      }
    } else {
      const s = scopeOf(e, scope);
      const marks = numbered.get(s) ?? new Map<string, string>();
      numbered.set(s, marks);
      for (const m of list) {
        if (!marks.has(m.key)) marks.set(m.key, String(marks.size + 1));
        m.mark = marks.get(m.key)!;
      }
    }
    return { ...e, marks: list };
  });
}

const labelOf = (group: readonly ScheduleElement[]) => {
  const oneLevel = new Set(group.map((e) => e.level ?? '')).size === 1;
  const names = group.map((e) => (oneLevel || !e.level ? e.name : `${e.name} (${e.level})`));
  return names.length > 3 ? `${names.slice(0, 3).join(' = ')} … (${names.length})` : names.join(' = ');
};

export const bendingSchedule = (rows: PieceRows, o: ScheduleOptions): BendingSchedule => scheduleOf(scheduleElements(rows, o), o);

/** The schedule of elements already broken into pieces. */
export function scheduleOf(elements: readonly ScheduleElement[], o: Pick<ScheduleOptions, 'code' | 'waste' | 'scope'>): BendingSchedule {
  const waste = o.waste ?? DEFAULT_WASTE, scope = o.scope ?? 'element';
  const marked = assignMarks(elements, scope);
  const groups = new Map<string, typeof marked>();
  for (const e of marked) {
    if (!e.marks.length) continue;
    const sig = `${e.family}|${scope === 'level' ? e.level ?? '' : ''}|${e.marks.map((m) => `${m.mark}:${m.key}:${m.count}`).join(';')}`;
    groups.set(sig, [...(groups.get(sig) ?? []), e]);
  }
  const out: ScheduleRow[] = [];
  for (const g of groups.values()) {
    const first = g[0]!, levels = [...new Set(g.map((e) => e.level ?? ''))];
    for (const m of first.marks) {
      const total = m.count * g.length, unitLength = developedLength(m.shape);
      out.push({
        element: labelOf(g), elements: g.map((e) => e.key), family: first.family, level: levels.join(', ') || undefined,
        mark: m.mark, elevation: m.elevation.length > 1 ? [...new Set(m.elevation)] : [], kind: m.kind, dia: m.shape.dia,
        perElement: m.count, equal: g.length, total, shape: m.shape,
        unitLength, totalLength: unitLength * total, kg: shapeWeight(m.shape, total), long: unitLength > STOCK_LENGTH + 1e-9,
      });
    }
  }

  const stockMarks = new Map<string, { mark: string; diameterMm: number; cuttingLength: number; quantity: number; shape: string; massKg: number }>();
  out.forEach((r, i) => {
    const k = scope === 'element' ? `${i}` : `${scope === 'level' ? r.level ?? '' : ''}|${r.mark}`;
    const s = stockMarks.get(k) ?? { mark: r.mark, diameterMm: r.dia, cuttingLength: r.unitLength, quantity: 0, shape: shapeKey(r.shape), massKg: 0 };
    s.quantity += r.total; s.massKg += r.kg;
    stockMarks.set(k, s);
  });
  const stock = buildSchedule([...stockMarks.values()], STOCK_LENGTH);
  const byDia = new Map<number, { length: number; kg: number }>();
  for (const r of out) {
    const d = byDia.get(r.dia) ?? { length: 0, kg: 0 };
    d.length += r.totalLength; d.kg += r.kg;
    byDia.set(r.dia, d);
  }
  const byDiameter = [...byDia].sort((a, b) => a[0] - b[0]).map(([dia, d]) => ({
    dia, length: d.length, kg: d.kg, withWaste: d.kg * (1 + waste), stockBars: stock.byDiameter.find((x) => x.diameterMm === dia)?.stockBars ?? 0,
  }));
  const fams: SheetFamily[] = ['beam', 'column', 'slab', 'wall'];
  const byFamily = fams.map((family) => {
    const kg = out.filter((r) => r.family === family).reduce((s, r) => s + r.kg, 0);
    return { family, kg, withWaste: kg * (1 + waste) };
  }).filter((f) => f.kg > 0);
  const kg = out.reduce((s, r) => s + r.kg, 0);
  const bends = rulesFor(o.code).bends;
  return {
    rows: out, byDiameter, byFamily,
    total: { length: out.reduce((s, r) => s + r.totalLength, 0), kg, withWaste: kg * (1 + waste) },
    waste, scope, clause: bends.clause, ...(bends.confirm ? { confirm: bends.confirm } : {}),
  };
}
