/**
 * View-model helpers for the design table: row shape, filtering, sorting.
 *
 * Extracted as a pure module so filtering/sorting is unit-testable without a DOM.
 */

import type { DisplayStatus } from '../../../lib/store/verification.svelte';
import type { DesignOutcomeKind } from '../../../lib/engine/design/outcome';
import type { ProvidedRebarResult } from '../../../lib/engine/station-design-forces';

export type RowFilter =
  | 'all' | 'selected' | 'undesigned' | 'fail' | 'warn' | 'ok'
  | 'edited' | 'stale' | 'provisional';

export type SortKey = 'element' | 'utilization' | 'status' | 'elevation' | 'section';

export interface DesignRow {
  elementId: number;
  elementType: 'beam' | 'column' | 'wall';
  sectionName: string;
  sectionId: number;
  /** Lower-end elevation (m) — used for the derived elevation column and sorting. */
  elevation: number;
  elevationLabel: string;
  /** demand/capacity, or null when nothing was verified. */
  utilization: number | null;
  status: DisplayStatus;
  governingCheck: string;
  comboName: string;
  outcome?: DesignOutcomeKind;
  hasReinforcement: boolean;
  edited: boolean;
  auto: boolean;
  provisional: boolean;
  certified: boolean;
  sloped: boolean;
  provided: ProvidedRebarResult | null;
  /** The span this element is a piece of (`design-spans.ts`): its name, and which piece of how many. */
  span?: { label: string; k: number; n: number };
}

/**
 * Sort order: how much the row needs looking at, worst first.
 *
 * A proposal sits between a failure and a near-miss. It is not a failure — the primary axis
 * passed every check that ran — and it is not a warning about a margin, because there is no
 * margin to report on the axis nobody checked. Above `warn` because "unverified" outranks
 * "verified and tight".
 */
const STATUS_ORDER: Record<DisplayStatus, number> = {
  fail: 0, provisional: 1, warn: 2, stale: 3, unavailable: 4, ok: 5,
};

export function matchesFilter(row: DesignRow, filter: RowFilter, selected: ReadonlySet<number>): boolean {
  switch (filter) {
    case 'all': return true;
    // The old 'selected' filter returned every row regardless of selection.
    case 'selected': return selected.has(row.elementId);
    case 'undesigned': return !row.hasReinforcement;
    case 'fail': return row.status === 'fail';
    case 'warn': return row.status === 'warn';
    case 'ok': return row.status === 'ok';
    case 'edited': return row.edited;
    case 'stale': return row.status === 'stale';
    /**
     * Either signal: the design run called it a proposal, or the display status did.
     *
     * They are the same members today. They can differ — the flag comes from the run's
     * outcome, the status from the steel currently written — and a filter named
     * "provisional" that missed a row showing a provisional badge would be the kind of gap a
     * user discovers by counting.
     */
    case 'provisional': return row.provisional || row.status === 'provisional';
    default: return true;
  }
}

export function matchesSearch(row: DesignRow, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (q === '') return true;
  return String(row.elementId) === q
    || String(row.elementId).includes(q)
    || row.sectionName.toLowerCase().includes(q)
    || row.elementType.includes(q)
    || row.elevationLabel.toLowerCase().includes(q);
}

export function sortRows(rows: DesignRow[], key: SortKey, asc: boolean): DesignRow[] {
  const dir = asc ? 1 : -1;
  const out = [...rows];
  out.sort((a, b) => {
    let c = 0;
    switch (key) {
      case 'element': c = a.elementId - b.elementId; break;
      case 'utilization': {
        const au = a.utilization ?? -1;
        const bu = b.utilization ?? -1;
        c = au - bu;
        break;
      }
      case 'status': c = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]; break;
      case 'elevation': c = a.elevation - b.elevation; break;
      case 'section': c = a.sectionName.localeCompare(b.sectionName); break;
    }
    // Deterministic tie-break so the order never depends on Map iteration.
    return c !== 0 ? c * dir : a.elementId - b.elementId;
  });
  return out;
}

export function filterCounts(rows: DesignRow[], selected: ReadonlySet<number>): Record<RowFilter, number> {
  const keys: RowFilter[] = ['all', 'selected', 'undesigned', 'fail', 'warn', 'ok', 'edited', 'stale', 'provisional'];
  const out = {} as Record<RowFilter, number>;
  for (const k of keys) out[k] = 0;
  for (const r of rows) for (const k of keys) if (matchesFilter(r, k, selected)) out[k]++;
  return out;
}

/** Index of the next failing row after `fromId` (wraps). Null when none exist. */
export function nextFailingId(rows: DesignRow[], fromId: number | null, step: 1 | -1 = 1): number | null {
  const failing = rows.filter(r => r.status === 'fail' || r.status === 'warn');
  if (failing.length === 0) return null;
  if (fromId === null) return (step === 1 ? failing[0] : failing[failing.length - 1]).elementId;
  const idx = rows.findIndex(r => r.elementId === fromId);
  for (let i = 1; i <= rows.length; i++) {
    const r = rows[(idx + step * i + rows.length * 2) % rows.length];
    if (r.status === 'fail' || r.status === 'warn') return r.elementId;
  }
  return failing[0].elementId;
}
