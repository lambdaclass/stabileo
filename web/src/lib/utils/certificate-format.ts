/**
 * Certified bounds as they are read, rounded the safe way: an upper bound up, a lower bound
 * down, so the printed number is still a bound (`store/certificate.svelte.ts`).
 */

/** `x` to `sig` significant figures, rounded toward `dir`. */
export function roundDirected(x: number, dir: 'up' | 'down', sig: number): number {
  if (!Number.isFinite(x) || x === 0) return x;
  const f = 10 ** (Math.floor(Math.log10(Math.abs(x))) - (sig - 1));
  const r = (dir === 'up' ? Math.ceil : Math.floor)(x / f) * f;
  // x / f is inexact: step back one unit when that still bounds x, so 3 does not print as 2.999.
  const back = dir === 'up' ? r - f : r + f;
  return Number((dir === 'up' ? back >= x : back <= x) ? back.toPrecision(sig) : r.toPrecision(sig));
}

/** An upper bound on an error: three significant figures rounded up, `∞` when unbounded (null). */
export function formatBound(x: number | null): string {
  if (x === null || !Number.isFinite(x)) return '∞';
  return x === 0 ? '0' : roundDirected(x, 'up', 3).toExponential(2);
}

/** A load factor bound: four significant figures, rounded toward `dir`; `∞` when there is none. */
export function formatLambda(x: number | null, dir: 'up' | 'down'): string {
  if (x === null || !Number.isFinite(x)) return '∞';
  return String(roundDirected(x, dir, 4));
}

/**
 * `above` rounded down and `below` rounded up, to the fewest significant figures (at least 6)
 * that still print `above` as the larger, so a refusal for exceeding a bound never reads as equal.
 */
export function formatSeparated(above: number, below: number): [string, string] {
  for (let sig = 6; sig <= 17; sig++) {
    const a = roundDirected(above, 'down', sig);
    const b = roundDirected(below, 'up', sig);
    if (a > b) return [String(a), String(b)];
  }
  return [String(above), String(below)];
}

/** An enclosure endpoint to `sig` significant figures, rounded toward `dir`; `∞` when there is none. */
export function formatDirected(x: number | null, dir: 'up' | 'down', sig = 6): string {
  if (x === null || !Number.isFinite(x)) return dir === 'up' ? '∞' : '−∞';
  return String(roundDirected(x, dir, sig));
}

/** `[lo, hi]`, each end rounded outward. */
export function formatEnclosure(lo: number | null, hi: number | null, sig = 6): string {
  return `[${formatDirected(lo, 'down', sig)}, ${formatDirected(hi, 'up', sig)}]`;
}
