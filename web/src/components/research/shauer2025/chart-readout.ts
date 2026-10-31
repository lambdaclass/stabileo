import type { Series } from './protocol';
/** Without `distance`: pick one iteration, then include only observations at that iteration; never extrapolate.
 *  With `distance` (paths that turn back in x): each series reads its own point nearest the pointer. */
export function chartReadout(series: Series[], hoverX: number | null, distance?: (p: [number, number]) => number) {
  if (hoverX === null) return null;
  if (distance) {
    const rows = series.map(s => ({ s, p: s.points.reduce<[number, number] | null>((best, p) => !best || distance(p) < distance(best) ? p : best, null) }));
    const x = rows.find(r => r.p)?.p?.[0];
    return x === undefined ? null : { x, rows };
  }
  const first = series.find(s => s.points.length);
  const nearest = first?.points.reduce<[number, number] | null>((best, p) => !best || Math.abs(p[0] - hoverX) < Math.abs(best[0] - hoverX) ? p : best, null);
  if (!nearest) return null;
  const x = nearest[0];
  return { x, rows: series.map(s => ({ s, p: s.points.find(p => p[0] === x) ?? null })) };
}
