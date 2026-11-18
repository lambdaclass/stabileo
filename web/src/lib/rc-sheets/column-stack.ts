/**
 * How a column storey's bars go on from the storey below: where its faces step in, the bars from
 * below are cranked into it at 1:6 or, past the offset the code allows a crank, stop and leave the
 * lap to separate dowels (ACI 318-19 and CIRSOC 201-2025 §10.7.4.1–10.7.4.2: 75 mm; the FIUBA notes
 * round it to 80 mm, §15.7, and the code in force prevails); and how long a lap between bars of two
 * sizes is.
 */
import type { ColumnRow, StackPlace } from './column-row';
import type { Fmt } from './format';
import { check, type CheckLine } from './types';

/** The largest offset of a face the bars from below are cranked through, m. */
export const CRANK_LIMIT = 0.075;
/** The steepest a cranked bar runs, horizontal to vertical. */
export const CRANK_SLOPE = 1 / 6;

export interface StackStep {
  /** How far the faces step in, m. */
  offset: number;
  /** Separate dowels instead of the bars from below cranked. */
  dowels: boolean;
}

/** The step the storey's faces make over the one below, none where they do not step in. */
export const stackStep = (offset: number | undefined): StackStep | null =>
  offset !== undefined && offset > 1e-4 ? { offset, dowels: offset >= CRANK_LIMIT - 1e-6 } : null;

/** The note a storey whose faces step in carries: the crank or the dowels, with the code's clause and the FIUBA criterion. */
export function stepCheck(step: StackStep | null, fmt: Fmt, clause: string): CheckLine | null {
  if (!step) return null;
  const at = `${fmt(step.offset * 100, 1)} cm`;
  return step.dowels
    ? check('rcSheets.v.colOffset', true, { clause, demand: at, capacity: `≥ ${fmt(CRANK_LIMIT * 100, 1)} cm` })
    : check('rcSheets.v.colCrank', true, { clause, demand: at, capacity: `< ${fmt(CRANK_LIMIT * 100, 1)} cm · 1:${fmt(1 / CRANK_SLOPE, 0)}` });
}

/**
 * The lap of the bars from below with this storey's: its own lap where the bars below are no
 * larger, else the larger of the larger bar's development and the smaller bar's lap (ACI 318-19
 * §25.5.2.2 in tension, §25.5.5.4 in compression).
 */
export const mixedLap = (own: number, ownDia: number, belowDia: number | undefined, developLarger: (dia: number) => number): number =>
  belowDia !== undefined && belowDia > ownDia ? Math.max(own, developLarger(belowDia)) : own;

/** Where a storey sits over the one below: that one's pattern of bars, inner rows included, its largest bar, and how far the faces step in, m. */
export function stackOver(below: Pick<ColumnRow, 'adopted' | 'b' | 'h'>, d: { b: number; h: number }): StackPlace {
  const a = below.adopted, largest = Math.max(a.corner, a.dx, a.dy, a.inner && a.inner.nx + a.inner.ny > 0 ? a.inner.dia : 0);
  return {
    pattern: { nx: a.nx, ny: a.ny, maxDia: Math.max(a.corner, a.dx, a.dy), ...(a.inner && a.inner.nx + a.inner.ny > 0 ? { inner: a.inner } : {}) },
    fromBelow: true, offset: Math.max(below.b - d.b, below.h - d.h) / 2, belowDia: largest,
  };
}
