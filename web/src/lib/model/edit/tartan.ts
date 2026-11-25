/**
 * One set of grid lines for every plate meshed together, along each global axis: the coordinates
 * every plate forces (its corners, the nodes and members on it, the faces of the columns in it),
 * and as many evenly between each pair as keep the gap at or under the mesh size. A plate whose side
 * runs along an axis takes that axis's lines within it, so two plates meet on the same nodes by
 * construction. Each plate dividing its own sides instead gave its neighbours lines a few
 * centimetres from theirs, which they passed on across the whole building.
 */
import type { Vec3 } from './affine';

const MERGE = 1e-4;

export type AxisLines = readonly [readonly number[], readonly number[], readonly number[]];

/** The lines along one axis: the forced coordinates, and between each pair as many more as keep the gap at or under `size`. */
export function axisStations(forced: readonly number[], size: number): number[] {
  if (!(size > 0)) throw new RangeError(`mesh size ${size}`);
  const s = [...forced].sort((x, y) => x - y).filter((x, i, all) => i === 0 || x - all[i - 1]! > MERGE);
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    out.push(s[i]!);
    if (i + 1 === s.length) break;
    const gap = s[i + 1]! - s[i]!, n = Math.max(1, Math.ceil(gap / size - 1e-9));
    for (let k = 1; k < n; k++) out.push(s[i]! + (gap * k) / n);
  }
  return out;
}

/** The global axis a direction runs along, and which way; null for one at a slant. */
export function axisOf(d: Vec3): { k: 0 | 1 | 2; sign: 1 | -1 } | null {
  for (const k of [0, 1, 2] as const) if (Math.abs(Math.abs(d[k]) - 1) < 1e-9) return { k, sign: d[k] > 0 ? 1 : -1 };
  return null;
}

/** The lines of `lines` along a frame direction through `o`, in the frame's coordinate; null where the direction is at a slant. */
export function linesAlong(lines: AxisLines, o: Vec3, d: Vec3): number[] | null {
  const a = axisOf(d);
  return a ? lines[a.k].map((c) => (c - o[a.k]) * a.sign + 0) : null;
}
