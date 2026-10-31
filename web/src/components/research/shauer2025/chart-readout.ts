import type { Series } from './protocol';
/** Pick one iteration, then include only observations at that iteration. Never extrapolate. */
export function chartReadout(series: Series[], hoverX: number | null) {
  if (hoverX === null) return null;
  const first = series.find(s => s.points.length);
  const nearest = first?.points.reduce<[number, number] | null>((best, p) => !best || Math.abs(p[0] - hoverX) < Math.abs(best[0] - hoverX) ? p : best, null);
  if (!nearest) return null;
  const x = nearest[0];
  return { x, rows: series.map(s => ({ s, p: s.points.find(p => p[0] === x) ?? null })) };
}
