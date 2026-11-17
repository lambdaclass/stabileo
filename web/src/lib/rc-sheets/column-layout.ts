/**
 * How a column's bars are laid out as practice lays them, whatever code designs them: the same bars
 * on every face of a square section and, in a rectangle, as many more on the longer faces as keep the
 * bars on both about equally far apart, so the layout is symmetric about both axes; no wider apart
 * than practice keeps them (FIUBA §15.8: under 30 cm; 15 cm under chapter 18, so crossties on every
 * other bar keep hx ≤ 350 mm, and on every bar ≤ 200 mm); and the crossties that hold them laid
 * symmetrically on each face.
 */
import type { ColumnAdopted } from './types';

/** The widest centre-to-centre spacing of a column's bars along a face, m: practice, not a clause. */
export const COLUMN_PITCH = { plain: 0.3, seismic: 0.15 } as const;

/** The clear spacing between a column's bars a proposal keeps when it can, m: room for the concrete and a vibrator. */
export const COLUMN_PRACTICAL_CLEAR = 0.05;

/** Within this share of the lightest steel, the layout with fewer bars is proposed. */
export const FEWER_BARS_WITHIN = 1.1;

/** The thickest column bar a proposal takes while a thinner layout works, mm: thicker bars are rare on site and hard to bend. */
export const COLUMN_PRACTICAL_MAX_DIA = 25;

export const isSquare = (d: { b: number; h: number }): boolean => Math.abs(d.b - d.h) < 1e-6;

/** Centre-to-centre spacing of `n` bars between the corners of a face of `span` between corner centres, m. */
export const pitchOf = (span: number, n: number): number => span / (n + 1);

/** The fewest bars between the corners of each face that keep them `maxPitch` apart at most; the same on every face of a square. */
export function startCounts(d: { b: number; h: number }, span: (side: number) => number, maxPitch: number): { nx: number; ny: number } {
  const n = (side: number) => Math.max(0, Math.ceil(span(side) / maxPitch - 1e-9) - 1);
  if (isSquare(d)) { const k = Math.max(n(d.b), n(d.h)); return { nx: k, ny: k }; }
  return { nx: n(d.b), ny: n(d.h) };
}

/** One bar more on each face of the pair whose bars stand farthest apart (both pairs in a square): the layout stays symmetric about both axes. */
export function growSymmetric<A extends Pick<ColumnAdopted, 'nx' | 'ny'>>(d: { b: number; h: number }, a: A, span: (side: number) => number): A {
  if (isSquare(d)) return { ...a, nx: a.nx + 1, ny: a.ny + 1 };
  const px = pitchOf(span(d.b), a.nx), py = pitchOf(span(d.h), a.ny);
  if (Math.abs(px - py) < 1e-6) return d.h > d.b ? { ...a, ny: a.ny + 1 } : { ...a, nx: a.nx + 1 };
  return px > py ? { ...a, nx: a.nx + 1 } : { ...a, ny: a.ny + 1 };
}

/** Of the layouts that work, those of bars up to `COLUMN_PRACTICAL_MAX_DIA` when any; of them the lightest, or one with fewer bars whose steel is within `FEWER_BARS_WITHIN` of it. */
export function pickPractical<T>(all: readonly T[], area: (x: T) => number, bars: (x: T) => number, dia: (x: T) => number): T | undefined {
  const usual = all.filter((x) => dia(x) <= COLUMN_PRACTICAL_MAX_DIA);
  const options = usual.length ? usual : all;
  if (!options.length) return undefined;
  const least = Math.min(...options.map(area));
  return [...options].filter((x) => area(x) <= FEWER_BARS_WITHIN * least + 1e-6)
    .sort((p, q) => bars(p) - bars(q) || area(p) - area(q))[0];
}

/** What the bars a crosstie holds on a face must meet: `limit` clear at most from a held bar to any other, never two in a row unheld (`alternate`), held bars `maxRun` apart at most centre to centre, `minCount` of them at least. */
export interface HeldRule { limit?: number; alternate?: boolean; maxRun?: number; minCount?: number }

/** CIRSOC 201-2025 and ACI 318-19 §25.7.2.3: every corner and alternate bar held (a), none farther than `limit` clear from a held one (b). */
export const tiedRule = (limit: number, minCount = 0): HeldRule => ({ limit, alternate: true, minCount });

/**
 * The bars 1 … n between a face's corners a crosstie holds, symmetric about the face's middle and
 * meeting `rule`; of those the fewest, the most evenly spread. All of them where nothing fewer
 * does. `pitch` is centre to centre, `dia` the face bars', mm.
 */
export function heldBars(n: number, pitch: number, dia: number, rule: HeldRule): number[] {
  if (n <= 0) return [];
  const all = Array.from({ length: n }, (_, i) => i + 1);
  if ((rule.minCount ?? 0) >= n) return all;
  const half = Math.floor(n / 2), mid = n % 2 ? (n + 1) / 2 : 0;
  let best: { held: number[]; gap: number } | null = null;
  for (let mask = 0; mask < 1 << half; mask++) {
    for (const withMid of mid ? [false, true] : [false]) {
      const set = new Set<number>();
      for (let i = 0; i < half; i++) if (mask & (1 << i)) { set.add(i + 1); set.add(n - i); }
      if (withMid) set.add(mid);
      if (set.size < (rule.minCount ?? 0)) continue;
      const at = [0, ...[...set].sort((p, q) => p - q), n + 1];
      const runs = at.slice(1).map((x, i) => x - at[i]!);
      if (rule.alternate && runs.some((r) => r > 2)) continue;
      if (rule.maxRun !== undefined && runs.some((r) => r * pitch > rule.maxRun! + 1e-9)) continue;
      const limit = rule.limit;
      if (limit !== undefined && !all.filter((i) => !set.has(i)).every((i) => Math.min(...at.map((j) => Math.abs(i - j))) * pitch - dia / 1000 <= limit + 1e-9)) continue;
      const gap = Math.max(...runs);
      if (!best || set.size < best.held.length || (set.size === best.held.length && gap < best.gap)) best = { held: at.slice(1, -1), gap };
    }
  }
  return best?.held ?? all;
}

/** Every distinct symmetric set of held bars a face can take under `rule`, fewest first. */
export function heldOptions(n: number, pitch: number, dia: number, rule: HeldRule): number[][] {
  const out: number[][] = [];
  for (let k = 0; k <= n; k++) {
    const h = heldBars(n, pitch, dia, { ...rule, minCount: k });
    if (!out.some((x) => x.length === h.length && x.every((v, i) => v === h[i]))) out.push(h);
  }
  return out.sort((p, q) => p.length - q.length);
}
