/**
 * The storey a member is read in, as drawings mark them: «s/P0» holds the columns and walls that
 * stand on P0 and the beams, slabs and punching joints of the floor they carry, P1; what stands at
 * the lowest level, a ground beam or a footing, is in the foundations. `order` is the levels from
 * the lowest up.
 */
import type { SheetFamily } from './types';

/** The foundations' storey: below every level. */
export const FOUNDATIONS = '§foundations';

export type StoreyFamily = SheetFamily | 'line' | 'footing' | 'pier';

const standing = (f: StoreyFamily) => f === 'column' || f === 'wall' || f === 'pier';

/** The storey a member of `family` at `level` is read in: its own level for what stands on it, the one below for a floor's members. */
export function storeyOf(family: StoreyFamily, level: string | undefined, order: readonly string[]): string {
  if (family === 'footing') return FOUNDATIONS;
  if (!level) return '';
  if (standing(family)) return level;
  const i = order.indexOf(level);
  return i > 0 ? order[i - 1]! : i === 0 ? FOUNDATIONS : level;
}

/** The level a family's members of a storey stand at, or carry: the inverse of `storeyOf`. */
export function levelOfStorey(family: StoreyFamily, storey: string, order: readonly string[]): string | undefined {
  if (standing(family)) return storey === FOUNDATIONS ? undefined : storey;
  if (storey === FOUNDATIONS) return order[0];
  const i = order.indexOf(storey);
  return i >= 0 ? order[i + 1] : storey;
}

/** Storeys from the foundations up; those the order does not know after, as they came. */
export function storeysUp(storeys: Iterable<string>, order: readonly string[]): string[] {
  const at = (s: string) => (s === FOUNDATIONS ? -1 : order.includes(s) ? order.indexOf(s) : Infinity);
  return [...new Set(storeys)].sort((a, b) => at(a) - at(b) || a.localeCompare(b, undefined, { numeric: true }));
}

/** A storey as drawings write it: «s/P0», or the foundations' name. */
export const storeyLabel = (s: string, t: (key: string) => string): string => (s === FOUNDATIONS ? t('rcSheets.storey.foundations') : s ? `s/${s}` : '—');
