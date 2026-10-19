/**
 * One check, as a person audits it: the clause, what must hold, the values that went in, the
 * demand against the capacity, and the combination and place that govern.
 *
 * Every design surface reads checks in this shape: the design table, the memoria, the summary of
 * the structure. The checkers used to write their steps as free strings, each in its own form.
 */
import type { DesignStatus } from './status';

export interface CheckInput {
  symbol: string;
  /** What the symbol is, as an i18n key or words. */
  description?: string;
  value: number | string;
  unit?: string;
  /** The clause the value comes from, when it has one. */
  clause?: string;
}

export interface CheckRow {
  /** Regulation id, e.g. `cirsoc-201`. */
  code: string;
  edition?: string;
  /** Clause or table, e.g. `22.5.5.1`. */
  clause?: string;
  /** Short name of the check, e.g. `Flexure, span`. */
  title: string;
  /** The same name as an i18n key, for the surfaces that print in the reader's language. */
  titleKey?: string;
  /** The inequality that must hold, as text (e.g. `Mu ≤ φMn`). */
  formula?: string;
  inputs: CheckInput[];
  demand?: number;
  capacity?: number;
  unit?: string;
  /** demand / capacity; null when the check is not a ratio (a detailing rule that holds or not). */
  ratio: number | null;
  status: DesignStatus;
  combination?: string;
  /** Where along the member, e.g. `x = 2.40 m`. */
  location?: string;
  /** The working, line by line, as the check wrote it: the sheet of this check. */
  derivation?: string[];
}

/** A condition worth saying that is not a check: an assumption, a limit of scope, a refusal. */
export interface Notice {
  /** Stable code, e.g. `TORSION_NOT_EVALUATED`. */
  code: string;
  /** i18n key and parameters. */
  key: string;
  params?: Record<string, string | number>;
  severity: 'info' | 'warning' | 'blocking';
}

/** The check that governs: the highest ratio, a failure first. */
export function governingCheck(rows: readonly CheckRow[]): CheckRow | undefined {
  let best: CheckRow | undefined;
  for (const r of rows) {
    if (!best) { best = r; continue; }
    const rank = (x: CheckRow) => (x.status === 'fail' ? 2 : 0) + (x.ratio ?? 0) / 1000;
    if (rank(r) > rank(best) || (rank(r) === rank(best) && (r.ratio ?? 0) > (best.ratio ?? 0))) best = r;
  }
  return best;
}
