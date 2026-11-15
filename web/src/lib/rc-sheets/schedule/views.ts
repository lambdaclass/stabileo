/**
 * The bending schedule seen several ways: every equal bar of the project in one row, by family, by
 * level, by diameter, or element by element with equal elements gathered. Bars are equal when their
 * `shapeKey` is (diameter, mandrel, legs and bends), so in every view but the last a bar placed in
 * many elements is one row that lists them. Every view adds up to the schedule's total.
 */
import { developedLength, shapeWeight, type BarShape } from '../shape';
import { SHEET_FAMILIES, type SheetFamily } from '../types';
import type { PieceKind } from './pieces';
import { STOCK_LENGTH, type BendingSchedule, type MarkedElement } from './schedule';

export const SCHEDULE_VIEWS = ['unified', 'family', 'level', 'element', 'diameter'] as const;
export type ScheduleView = (typeof SCHEDULE_VIEWS)[number];
export const DEFAULT_SCHEDULE_VIEW: ScheduleView = 'unified';
export const isScheduleView = (v: unknown): v is ScheduleView => SCHEDULE_VIEWS.includes(v as ScheduleView);

export interface ElementRef { key: string; name: string; level?: string; family: SheetFamily }

/** An element a bar is placed in: the mark it carries there, the elevation's marks it gathers, and how many. */
export interface BarUse extends ElementRef { mark: string; elevation: string[]; count: number }

export interface ViewRow {
  key: string;
  marks: string[];
  kinds: PieceKind[];
  dia: number;
  shape: BarShape;
  count: number;
  unitLength: number;
  totalLength: number;
  kg: number;
  long: boolean;
  uses: BarUse[];
  /** The element view's: pieces per element and how many equal elements. */
  perElement?: number;
  equal?: number;
}

export interface ViewTotal { count: number; length: number; kg: number; withWaste: number }

export interface ViewGroup extends ViewTotal {
  id: string;
  /** A level's or an element group's name, or Ø and the diameter; a family is named by `family`. */
  title: string;
  family?: SheetFamily;
  dia?: number;
  /** The element view's equal elements. */
  elements?: ElementRef[];
  /** The diameter view's 12 m bars. */
  stockBars?: number;
  rows: ViewRow[];
}

export interface ScheduleViewData { view: ScheduleView; groups: ViewGroup[]; total: ViewTotal }

const refOf = (e: MarkedElement): ElementRef => ({ key: e.key, name: e.name, level: e.level, family: e.family });

function totals(rows: readonly { count: number; totalLength: number; kg: number }[], waste: number): ViewTotal {
  let count = 0, length = 0, kg = 0;
  for (const r of rows) { count += r.count; length += r.totalLength; kg += r.kg; }
  return { count, length, kg, withWaste: kg * (1 + waste) };
}

function finish(row: ViewRow): ViewRow {
  row.unitLength = developedLength(row.shape);
  row.totalLength = row.unitLength * row.count;
  row.kg = shapeWeight(row.shape, row.count);
  row.long = row.unitLength > STOCK_LENGTH + 1e-9;
  return row;
}

const byDiameterThenLength = (a: ViewRow, b: ViewRow) => a.dia - b.dia || b.unitLength - a.unitLength || a.key.localeCompare(b.key);

/** The pieces of the elements merged by shape, one row per equal bar in each group. */
function merged(s: BendingSchedule, groupOf: (e: MarkedElement, dia: number) => string): Map<string, ViewRow[]> {
  const groups = new Map<string, Map<string, ViewRow>>();
  for (const e of s.marked) {
    for (const m of e.marks) {
      const g = groupOf(e, m.shape.dia);
      const rows = groups.get(g) ?? new Map<string, ViewRow>();
      groups.set(g, rows);
      let row = rows.get(m.key);
      if (!row) {
        row = { key: m.key, marks: [], kinds: [], dia: m.shape.dia, shape: m.shape, count: 0, unitLength: 0, totalLength: 0, kg: 0, long: false, uses: [] };
        rows.set(m.key, row);
      }
      row.count += m.count;
      if (!row.marks.includes(m.mark)) row.marks.push(m.mark);
      if (!row.kinds.includes(m.kind)) row.kinds.push(m.kind);
      row.uses.push({ ...refOf(e), mark: m.mark, elevation: [...new Set(m.elevation)], count: m.count });
    }
  }
  return new Map([...groups].map(([g, rows]) => [g, [...rows.values()].map(finish).sort(byDiameterThenLength)]));
}

function elementView(s: BendingSchedule): ViewGroup[] {
  const byKey = new Map(s.marked.map((e) => [e.key, e]));
  const groups = new Map<string, ViewGroup>();
  for (const r of s.rows) {
    const id = r.elements.join('|');
    const els = r.elements.map((k) => byKey.get(k)!).filter(Boolean);
    const g = groups.get(id) ?? { id, title: r.element, family: r.family, elements: els.map(refOf), rows: [], count: 0, length: 0, kg: 0, withWaste: 0 };
    groups.set(id, g);
    const uses = els.map((e) => {
      const m = e.marks.find((x) => x.key === r.key && x.mark === r.mark);
      return { ...refOf(e), mark: r.mark, elevation: m ? [...new Set(m.elevation)] : [], count: r.perElement };
    });
    g.rows.push({
      key: r.key, marks: [r.mark], kinds: [r.kind], dia: r.dia, shape: r.shape, count: r.total, unitLength: r.unitLength,
      totalLength: r.totalLength, kg: r.kg, long: r.long, uses, perElement: r.perElement, equal: r.equal,
    });
  }
  return [...groups.values()];
}

const levelOrder = (a: string, b: string) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, undefined, { numeric: true }));

/** The schedule as the view lays it out, each group with its totals and the grand total. */
export function scheduleView(s: BendingSchedule, view: ScheduleView): ScheduleViewData {
  let groups: ViewGroup[];
  const group = (id: string, rows: ViewRow[], o: Partial<ViewGroup> = {}): ViewGroup => ({ id, title: id, rows, ...totals(rows, s.waste), ...o });
  if (view === 'element') {
    groups = elementView(s).map((g) => ({ ...g, ...totals(g.rows, s.waste) }));
  } else if (view === 'family') {
    const m = merged(s, (e) => e.family);
    groups = SHEET_FAMILIES.filter((f) => m.has(f)).map((f) => group(f, m.get(f)!, { family: f as SheetFamily }));
  } else if (view === 'level') {
    const m = merged(s, (e) => e.level ?? '');
    groups = [...m.keys()].sort(levelOrder).map((l) => group(`level:${l}`, m.get(l)!, { title: l }));
  } else if (view === 'diameter') {
    const m = merged(s, (_, dia) => String(dia));
    groups = [...m.keys()].map(Number).sort((a, b) => a - b).map((dia) => group(`dia:${dia}`, m.get(String(dia))!, {
      title: `Ø${dia}`, dia, stockBars: s.byDiameter.find((d) => d.dia === dia)?.stockBars ?? 0,
    }));
  } else {
    groups = [group('all', merged(s, () => 'all').get('all') ?? [])];
  }
  return { view, groups, total: totals(groups.flatMap((g) => g.rows), s.waste) };
}

/** The elements a row is placed in as a schedule writes them: by name, with the level when they span several. */
export function usesText(uses: readonly ElementRef[]): string {
  const oneLevel = new Set(uses.map((u) => u.level ?? '')).size <= 1;
  return uses.map((u) => (oneLevel || !u.level ? u.name : `${u.name} (${u.level})`)).join(', ');
}
