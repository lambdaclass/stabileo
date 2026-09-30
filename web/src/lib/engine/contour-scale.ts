/**
 * The arithmetic behind a shell contour, shared by the painted shells, their legend and the
 * results read along a line: element values averaged at the nodes, the range a scale spans, and
 * the band a value falls in.
 *
 * Pure.
 */

/** Where a contour's values sit: averaged at the nodes, or each element's at its centre. */
export type ContourAt = 'nodes' | 'centre';

/** Each node's value: the mean of the elements that touch it. */
export function nodalAverage(entries: Iterable<{ nodes: readonly number[]; value: number }>): Map<number, number> {
  const sum = new Map<number, number>(), count = new Map<number, number>();
  for (const e of entries) {
    for (const n of e.nodes) {
      sum.set(n, (sum.get(n) ?? 0) + e.value);
      count.set(n, (count.get(n) ?? 0) + 1);
    }
  }
  const out = new Map<number, number>();
  for (const [n, s] of sum) out.set(n, s / count.get(n)!);
  return out;
}

/** The range a scale spans: the one the results occupy, or the one typed in when it is valid. */
export function contourRange(computed: { min: number; max: number }, opts: { auto: boolean; min: number; max: number }): { min: number; max: number } {
  if (opts.auto || !(Number.isFinite(opts.min) && Number.isFinite(opts.max)) || opts.max <= opts.min) return computed;
  return { min: opts.min, max: opts.max };
}

/**
 * The value a band paints: the centre of the band `v` falls in, `bands` of them between min and
 * max. Values outside the range fall in the end bands. 0 bands: `v` itself.
 */
export function bandValue(v: number, min: number, max: number, bands: number): number {
  if (bands <= 0 || !(max > min)) return v;
  const t = Math.max(0, Math.min(1, (v - min) / (max - min)));
  const k = Math.min(bands - 1, Math.floor(t * bands));
  return min + ((k + 0.5) / bands) * (max - min);
}

/** The band edges of a banded scale, from min to max. */
export function bandEdges(min: number, max: number, bands: number): number[] {
  if (bands <= 0) return [];
  return Array.from({ length: bands + 1 }, (_, k) => min + (k / bands) * (max - min));
}
