/**
 * How close two points must be to be one node: the tolerance every weld reads (merging coincident
 * nodes, placing a fragment onto the model, the mesher finding nodes on a boundary). 0,1 mm by
 * default; a reader modelling from a survey or a DXF with drift can widen it. Kept in this browser.
 */
export const DEFAULT_WELD_TOL = 1e-4;
const KEY = 'stabileo-weld-tolerance';

let tol = (() => {
  try { const v = Number(localStorage.getItem(KEY)); return v > 0 && v < 1 ? v : DEFAULT_WELD_TOL; } catch { return DEFAULT_WELD_TOL; }
})();

export function weldTolerance(): number { return tol; }

/** Set it, m; out of (0, 1) m resets it. */
export function setWeldTolerance(v: number): number {
  tol = v > 0 && v < 1 ? v : DEFAULT_WELD_TOL;
  try { localStorage.setItem(KEY, String(tol)); } catch { /* lasts the session */ }
  return tol;
}
