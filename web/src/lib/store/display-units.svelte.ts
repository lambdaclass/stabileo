/**
 * How numbers are shown: in the unit system chosen (`uiStore.unitSystem`, `utils/units.ts`) and,
 * per quantity, with a fixed number of decimals when the reader set one. Kept in this browser,
 * like the unit system itself: a reading preference, not project data.
 */
import { uiStore } from './ui.svelte';
import { formatValue, unitLabel, toDisplay, setDisplayDecimals, type Quantity } from '../utils/units';

const KEY = 'stabileo-decimals';

function load(): Partial<Record<Quantity, number>> {
  try { const raw = localStorage.getItem(KEY); const v = raw ? JSON.parse(raw) : {}; return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}

let decimals = $state<Partial<Record<Quantity, number>>>(load());
setDisplayDecimals(decimals);

export const displayUnits = {
  get decimals() { return decimals; },
  setDecimals(q: Quantity, n: number | null) {
    const next = { ...decimals };
    if (n === null || !Number.isFinite(n) || n < 0) delete next[q]; else next[q] = Math.min(8, Math.floor(n));
    decimals = next;
    setDisplayDecimals(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* the preference lasts the session */ }
  },
};

/** A value in the chosen units, with the decimals set for its quantity (or automatic). */
export function fmtQ(v: number, q: Quantity): string {
  if (!Number.isFinite(v)) return '—';
  return formatValue(v, q, uiStore.unitSystem, decimals[q]);
}

/** The unit a quantity is shown in. */
export const unitQ = (q: Quantity) => unitLabel(q, uiStore.unitSystem);

/** A value converted to the chosen units, full precision, for exports. */
export const toQ = (v: number, q: Quantity) => toDisplay(v, q, uiStore.unitSystem);

/** The quantities whose decimals a reader can set. */
export const DECIMAL_QUANTITIES: readonly Quantity[] = ['force', 'moment', 'displacement', 'rotation', 'stress', 'length'];
