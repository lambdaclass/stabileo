/**
 * Where a column storey's bars run, as the schedule cuts them, the model places them and the
 * elevation draws them: from where the storey's own lap starts (the face of the joint below, the
 * middle half under chapter 18, §18.7.4.3) up through the joint above, cranked in there at 1:6 by
 * the step of the faces and one bar's diameter so they lap in contact beside the bars of the storey
 * above (§10.7.4.1, §25.5.1.3; FIUBA Fig. 7.8.1), on for that storey's lap; or hooked into the slab
 * at the top and where the faces step in 75 mm or more, the lap then left to separate dowels
 * (§10.7.4.2). A bar longer than a stock bar is cut and lapped where it is cut.
 */
import { columnLayout, layoutDias, type PlacedBar } from './column-layout';
import type { ColumnRow } from './column-row';
import { columnTieLayout } from './column-ties';
import { CRANK_LIMIT, CRANK_SLOPE, inwardOf, lapOffset } from './column-stack';
import { crankedBar, developedLength, hookedStraight, type BarShape, type BendRules } from './shape';
import type { SheetCode } from './types';

/** The length of a stock bar, m. */
export const STOCK = 12;

const stackOf = (key: string) => {
  const [, g, k] = key.split(':');
  return { group: g ?? key, index: Number(k ?? 0) };
};

const stacks = new WeakMap<readonly { key: string }[], Map<string, { key: string }>>();

function stackIndex<T extends { key: string }>(rows: readonly T[]): Map<string, T> {
  let m = stacks.get(rows);
  if (!m) {
    m = new Map();
    for (const r of rows) { const s = stackOf(r.key), k = `${s.group}:${s.index}`; if (!m.has(k)) m.set(k, r); }
    stacks.set(rows, m);
  }
  return m as Map<string, T>;
}

const stepOf = <T extends { key: string }>(rows: readonly T[], row: T, by: number): T | undefined => {
  const me = stackOf(row.key);
  return stackIndex(rows).get(`${me.group}:${me.index + by}`);
};

export const above = <T extends { key: string }>(rows: readonly T[], row: T): T | undefined => stepOf(rows, row, 1);

export const below = <T extends { key: string }>(rows: readonly T[], row: T): T | undefined => stepOf(rows, row, -1);

const offsetTo = (r: ColumnRow, up: ColumnRow) => Math.max(0, (r.b - up.b) / 2, (r.h - up.h) / 2);

export interface ColumnStorey {
  up?: ColumnRow;
  /** How far the faces of the storey above step in, m. */
  e: number;
  /** Its bars go on into the storey above, cranked in to lap beside that storey's. */
  cranked: boolean;
  /** Its bars stop hooked into the slab above. */
  hooked: boolean;
  /** Separate dowels lap with its bars, the faces below stepping in 75 mm or more. */
  dowels: boolean;
}

export function columnStorey(rows: readonly ColumnRow[], r: ColumnRow): ColumnStorey {
  const up = above(rows, r), down = below(rows, r);
  const e = up ? offsetTo(r, up) : 0;
  const hooked = !up || e >= CRANK_LIMIT - 1e-6;
  return { up, e, cranked: !hooked, hooked, dowels: !!down && offsetTo(down, r) >= CRANK_LIMIT - 1e-6 };
}

/** Where a storey's lap with the bars from below starts, m up from its bottom node: the face of the joint below, or the start of the middle half under chapter 18; its node where nothing laps. */
export function lapStart(r: ColumnRow, code: SheetCode): number {
  if (!r.lap) return 0;
  return (r.demand.joints?.bottom ?? 0) / 2 + (columnTieLayout(r, code).lap?.from ?? 0);
}

export interface StoreyRun {
  /** Where the bars start and end, m up from the storey's bottom node. */
  from: number; top: number;
  /** Where the crank into the storey above ends, m up from the bottom node: the face of the joint above where the faces step in, else where that storey's lap starts; null where the bars are hooked. */
  crankAt: number | null;
  /** The lap of the pieces cut from one bar, m. */
  own: number;
}

export function storeyRun(r: ColumnRow, s: ColumnStorey, code: SheetCode): StoreyRun {
  const from = lapStart(r, code), lapUp = s.up?.lap?.length ?? 0;
  const own = r.lap?.length ?? lapUp;
  if (s.hooked || !s.up) return { from, top: r.length + (r.demand.joints?.top ?? 0) / 2 - r.cover, crankAt: null, own };
  const up = s.up, startUp = lapStart(up, code);
  const crankAt = r.length + (s.e > 1e-3 ? (up.demand.joints?.bottom ?? 0) / 2 : startUp);
  return { from, top: r.length + startUp + lapUp, crankAt, own };
}

export interface BarRun {
  bar: PlacedBar;
  /** How far it is cranked, m, and which way in the section's axes. */
  e: number;
  toward: [number, number];
}

/**
 * Each bar of the storey with its crank into the storey above: the step of the faces (a corner
 * bar along both, a face bar across its face and along it in proportion) and one bar's diameter
 * inward, to the millimetre; none where the bars are hooked.
 */
export function storeyBars(r: ColumnRow, s: ColumnStorey): BarRun[] {
  const bars = columnLayout(r, r.adopted, r.cover, r.aggregate).bars;
  if (!s.cranked || !s.up) return bars.map((bar) => ({ bar, e: 0, toward: inwardOf(bar, r) }));
  const up = s.up, ua = up.adopted;
  const upBars = columnLayout(up, ua, up.cover, up.aggregate).bars, upMax = Math.max(...layoutDias(ua));
  const ex = Math.max(0, (r.b - up.b) / 2), ey = Math.max(0, (r.h - up.h) / 2), a = r.adopted;
  const xc = r.b / 2 - r.cover - a.tieDia / 1000 - a.corner / 2000, yc = r.h / 2 - r.cover - a.tieDia / 1000 - a.corner / 2000;
  return bars.map((bar, i) => {
    const n = inwardOf(bar, r), c = lapOffset(bar.dia, upBars.length === bars.length ? upBars[i]!.dia : upMax);
    const dx = -(bar.x / Math.max(xc, 1e-9)) * ex + c * n[0], dy = -(bar.y / Math.max(yc, 1e-9)) * ey + c * n[1], l = Math.hypot(dx, dy);
    return { bar, e: Math.round(l * 1000) / 1000, toward: l > 1e-12 ? [dx / l, dy / l] : n };
  });
}

const topHooked = (length: number, dia: number, R: BendRules): BarShape =>
  hookedStraight(0, length, 0, dia, R.mandrel(dia, 'longitudinal'), [false, true], 1, R.extension(dia, 90, 'longitudinal'));

export const straightBar = (length: number, dia: number, R: BendRules): BarShape =>
  hookedStraight(0, length, 0, dia, R.mandrel(dia, 'longitudinal'), [false, false], 1, 0);

/**
 * A vertical bar over `length` as the pieces a bender cuts, the top one shaped by `topOf` (hooked,
 * cranked or straight): one when it fits a stock bar, else as few equal pieces as fit, each lapped
 * `lap` onto the next, bottom first.
 */
export function runPieces(length: number, lap: number, dia: number, R: BendRules, topOf: (length: number) => BarShape): Array<{ shape: BarShape; count: number }> {
  const whole = topOf(length);
  if (developedLength(whole) <= STOCK + 1e-9 || lap >= STOCK / 2) return [{ shape: whole, count: 1 }];
  const extra = developedLength(whole) - length;
  let n = 2;
  while ((length + (n - 1) * lap) / n + extra > STOCK + 1e-9 && n < 20) n++;
  const piece = (length + (n - 1) * lap) / n;
  const lower = straightBar(piece, dia, R), top = topOf(piece);
  return JSON.stringify(top) === JSON.stringify(lower) ? [{ shape: lower, count: n }] : [{ shape: lower, count: n - 1 }, { shape: top, count: 1 }];
}

/** A vertical bar hooked into the slab at its top when `hooked`, else straight, as `runPieces` cuts it. */
export const stockPieces = (length: number, lap: number, dia: number, R: BendRules, hooked: boolean): Array<{ shape: BarShape; count: number }> =>
  runPieces(length, lap, dia, R, (l) => (hooked ? topHooked(l, dia, R) : straightBar(l, dia, R)));

/** One bar of a storey as its pieces, bottom first: straight ones and the top one hooked or cranked by `e`. */
export function columnBarPieces(run: StoreyRun, dia: number, e: number, R: BendRules): Array<{ kind: 'column' | 'cranked'; shape: BarShape; count: number }> {
  const length = run.top - run.from;
  if (run.crankAt === null) return stockPieces(length, run.own, dia, R, true).map((pc) => ({ kind: 'column' as const, ...pc }));
  const past = run.top - run.crankAt, mandrel = R.mandrel(dia, 'longitudinal');
  const pieces = runPieces(length, run.own, dia, R, (l) => crankedBar(l - past, e, past, dia, mandrel, 1 / CRANK_SLOPE));
  return pieces.map((pc, i) => ({ kind: i === pieces.length - 1 ? 'cranked' as const : 'column' as const, ...pc }));
}

/** A separate dowel where the faces below step in 75 mm or more: twice the storey's lap, half each side of where its lap starts. */
export const columnDowel = (r: ColumnRow, dia: number, R: BendRules): BarShape => straightBar(2 * (r.lap?.length ?? 0), dia, R);
