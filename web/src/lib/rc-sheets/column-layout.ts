/**
 * How a column's bars are laid out as practice lays them, whatever code designs them: the same bars
 * on every face of a square section and, in a rectangle, as many more on the longer faces as keep the
 * bars on both about equally far apart, so the layout is symmetric about both axes; no wider apart
 * than practice keeps them (the Stabileo criterion of FIUBA §15.8, 30 cm by default; 15 cm under
 * chapter 18, so crossties on every other bar keep hx ≤ 350 mm, and on every bar ≤ 200 mm); and the
 * crossties that hold them laid symmetrically on each face.
 */
import type { ColumnAdopted } from './types';

/** The widest centre-to-centre spacing of a column's bars along a face under chapter 18, m; otherwise the Stabileo criterion's. */
export const COLUMN_PITCH = { seismic: 0.15 } as const;

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

let rowFactor = 4 / 3;

/** The factor of the largest aggregate in the clear spacing between rows, as the sheets' code and the Stabileo criterion set it; the drawings read the same. */
export function setRowClearFactor(f: number): void { rowFactor = f; }

/** The clear spacing between a column's rows of bars, m: §25.2.3's max(1.5·db; 40 mm; 4/3·dagg), which the Stabileo criterion keeps for any code (FIUBA §15.8); `aggregate` in mm. */
export const rowClear = (dia: number, aggregate = 0): number => Math.max((1.5 * dia) / 1000, 0.04, rowFactor * aggregate / 1000);

/** A bar of a column's section, from its centre, m; `dia` in mm. */
export interface PlacedBar { x: number; y: number; dia: number; row: 'corner' | 'b' | 'h' | 'inner' }

/** A row inside the faces, from the section's centre, m: bars along b at `xs` and ±`yIn`, along h at ±`xIn` and `ys`; `aligned` when each stands behind a bar of the face. */
export interface InnerRow { xIn: number; yIn: number; xs: number[]; ys: number[]; aligned: boolean }

const innerRowCount = (a: ColumnAdopted) => (a.inner && (a.inner.nx > 0 || a.inner.ny > 0) ? Math.max(1, a.inner.rows ?? 1) : 0);

/** The positions of `n` bars between a face's corners, m from its middle: `span` between the corners' centres. */
const facePositions = (span: number, n: number) => Array.from({ length: Math.max(0, n) }, (_, i) => -span / 2 + (span * (i + 1)) / (n + 1));

/** `k` of the face positions within ±`limit`, symmetric about the middle and as evenly spread as they go from the outermost in; null where no such choice exists. */
function behindFace(face: readonly number[], k: number, limit: number): number[] | null {
  const pool = face.filter((x) => Math.abs(x) <= limit + 1e-9);
  const m = pool.length;
  if (k > m || (m - k) % 2) return null;
  const pick = new Set<number>();
  for (let i = 0; i < Math.floor(k / 2); i++) { const j = Math.round((i * (m - 1)) / Math.max(1, k - 1)); pick.add(j); pick.add(m - 1 - j); }
  if (k % 2) pick.add((m - 1) / 2);
  return pick.size === k ? [...pick].sort((p, q) => p - q).map((j) => pool[j]!) : null;
}

const spread = (k: number, limit: number) => (k === 1 ? [0] : Array.from({ length: k }, (_, i) => -limit + (2 * limit * i) / (k - 1)));

/**
 * The bars of a column's section as practice lays them: the four corners, `nx` between them on each
 * b face and `ny` on each h face, evenly; and the rows inside the faces, each one held off the row
 * outside it by `rowClear`. A bar of an inner row stands right behind a bar of the face, so the gaps
 * line up through the rows for the concrete and the vibrator to pass, as layers do in a beam
 * (§25.2.2). With rows inside both pairs of faces, those along b keep clear of those along h at the
 * inner corners: only the face positions at least a bar and its clear spacing inside the h rows take
 * one. Where no such choice of positions exists, the row's bars spread evenly within that reach.
 */
export function columnLayout(d: { b: number; h: number }, a: ColumnAdopted, cover: number, aggregate = 0): { bars: PlacedBar[]; rows: InnerRow[] } {
  const toBar = (dia: number) => cover + a.tieDia / 1000 + dia / 2000;
  const xc = d.b / 2 - toBar(a.corner), yc = d.h / 2 - toBar(a.corner);
  const faceX = facePositions(2 * xc, a.nx), faceY = facePositions(2 * yc, a.ny);
  const bars: PlacedBar[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) bars.push({ x: sx * xc, y: sy * yc, dia: a.corner, row: 'corner' });
  for (const x of faceX) for (const sy of [-1, 1]) bars.push({ x, y: sy * (d.h / 2 - toBar(a.dx)), dia: a.dx, row: 'b' });
  for (const y of faceY) for (const sx of [-1, 1]) bars.push({ x: sx * (d.b / 2 - toBar(a.dy)), y, dia: a.dy, row: 'h' });
  const inn = a.inner, count = innerRowCount(a);
  if (!inn || !count) return { bars, rows: [] };
  const step = (outer: number, inner: number) => outer / 2000 + rowClear(Math.max(outer, inner), aggregate) + inner / 2000;
  const pitch = step(inn.dia, inn.dia), cc = inn.dia / 1000 + rowClear(inn.dia, aggregate);
  const outerB = Math.max(a.corner, a.dx), outerH = Math.max(a.corner, a.dy);
  const yIn = (k: number) => d.h / 2 - toBar(outerB) - step(outerB, inn.dia) - k * pitch;
  const xIn = (k: number) => d.b / 2 - toBar(outerH) - step(outerH, inn.dia) - k * pitch;
  const reachX = xIn(count - 1) - cc, reachY = yIn(count - 1) - cc;
  const pickX = inn.nx > 0 ? behindFace(faceX, inn.nx, inn.ny > 0 ? reachX : Infinity) : [];
  const pickY = inn.ny > 0 ? behindFace(faceY, inn.ny, inn.nx > 0 ? reachY : Infinity) : [];
  const xs = pickX ?? spread(inn.nx, reachX), ys = pickY ?? spread(inn.ny, reachY);
  const rows = Array.from({ length: count }, (_, k): InnerRow => ({ xIn: xIn(k), yIn: yIn(k), xs, ys, aligned: !!pickX && !!pickY }));
  for (const r of rows) {
    for (const x of r.xs) for (const sy of [-1, 1]) bars.push({ x, y: sy * r.yIn, dia: inn.dia, row: 'inner' });
    for (const y of r.ys) for (const sx of [-1, 1]) bars.push({ x: sx * r.xIn, y, dia: inn.dia, row: 'inner' });
  }
  return { bars, rows };
}

/**
 * The tightest pair of bars against the clear spacing the code asks between them (`minClear` of the
 * larger, m), and whether every bar sits inside the tie: `slack` is the smallest clear spacing less
 * what it asks, m, negative where two bars come too close.
 */
export function barClearance(d: { b: number; h: number }, bars: readonly PlacedBar[], cover: number, tieDia: number, minClear: (dia: number) => number): { ok: boolean; slack: number; inside: boolean } {
  let slack = Infinity;
  for (let i = 0; i < bars.length; i++) for (let j = i + 1; j < bars.length; j++) {
    const p = bars[i]!, q = bars[j]!;
    slack = Math.min(slack, Math.hypot(p.x - q.x, p.y - q.y) - (p.dia + q.dia) / 2000 - minClear(Math.max(p.dia, q.dia)));
  }
  const inX = d.b / 2 - cover - tieDia / 1000, inY = d.h / 2 - cover - tieDia / 1000;
  const inside = bars.every((p) => Math.abs(p.x) + p.dia / 2000 <= inX + 1e-6 && Math.abs(p.y) + p.dia / 2000 <= inY + 1e-6);
  return { ok: slack >= -1e-4 && inside, slack, inside };
}

/** The diameters a column's layout holds, the inner rows' included. */
export function layoutDias(a: ColumnAdopted): number[] {
  return [a.corner, ...(a.nx > 0 ? [a.dx] : []), ...(a.ny > 0 ? [a.dy] : []), ...(innerRowCount(a) ? [a.inner!.dia] : [])];
}

/**
 * The crossties that hold the inner rows: no hoop runs along them, so each pair of facing bars of a
 * row takes one, its hooks round both. `x` of them across h for the bars along b, `y` across b for
 * those along h, each with the length between the corners of its hooks, m. Inner bars are not
 * perimeter bars: chapter 18's hx (§18.7.5.2) is read on the perimeter alone.
 */
export function innerTies(d: { b: number; h: number }, a: ColumnAdopted, cover: number, aggregate = 0): { x: number; y: number; ties: Array<{ across: 'h' | 'b'; at: number; length: number }> } {
  const wrap = ((a.inner?.dia ?? 0) + a.tieDia) / 1000;
  const ties = columnLayout(d, a, cover, aggregate).rows.flatMap((r) => [
    ...r.xs.map((at) => ({ across: 'h' as const, at, length: 2 * r.yIn + wrap })),
    ...r.ys.map((at) => ({ across: 'b' as const, at, length: 2 * r.xIn + wrap })),
  ]);
  return { x: ties.filter((t) => t.across === 'h').length, y: ties.filter((t) => t.across === 'b').length, ties };
}

/** The bars of a layout's inner rows. */
const innerBars = (a: ColumnAdopted) => 2 * innerRowCount(a) * ((a.inner?.nx ?? 0) + (a.inner?.ny ?? 0));

/**
 * One step of a proposal: a bar more on each face of a pair in the outer row while it `fits`; then,
 * when `inside`, the inner rows with the fewest bars more than the layout has that fit: rows behind
 * the face bars first, then the most even between the two pairs of faces, a second row inside the
 * first only where one row does not take them. Null when nothing fits.
 */
export function growColumn(d: { b: number; h: number }, a: ColumnAdopted, cover: number, innerDia: number, fits: (a: ColumnAdopted) => boolean, inside: boolean, aggregate = 0): ColumnAdopted | null {
  const outer = growSymmetric(d, a, (side) => side - 2 * (cover + a.tieDia / 1000 + a.corner / 2000));
  if (fits(outer)) return outer;
  if (!inside) return null;
  const dia = a.inner?.dia ?? innerDia, have = innerBars(a), top = Math.max(a.nx, a.ny) + 2;
  const options: Array<{ x: ColumnAdopted; n: number; aligned: boolean; skew: number; rows: number }> = [];
  for (let rows = 1; rows <= 2; rows++) for (let nx = 0; nx <= top; nx++) for (let ny = 0; ny <= top; ny++) {
    if (!nx && !ny) continue;
    const x: ColumnAdopted = { ...a, inner: rows > 1 ? { nx, ny, dia, rows } : { nx, ny, dia } };
    const n = innerBars(x);
    if (n <= have) continue;
    options.push({ x, n, aligned: columnLayout(d, x, cover, aggregate).rows.every((r) => r.aligned), skew: Math.abs(nx - ny), rows });
  }
  options.sort((p, q) => p.n - q.n || Number(q.aligned) - Number(p.aligned) || p.rows - q.rows || p.skew - q.skew);
  return options.find((o) => fits(o.x))?.x ?? null;
}
