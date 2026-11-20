import { barActsAt, type LineLayout } from './beam-line';
import { groupsArea } from './bars';
import { shortStretches } from './line-steel';

export type ChartKind = 'moment' | 'steel';

export const ENV_M = 96, ENV_V = 88, ENV_GAP = 18, ENV_S = 64, LEGEND = 20;
export const chartHeight = (kind: ChartKind): number => (kind === 'moment' ? ENV_M + ENV_GAP + ENV_V + 30 : LEGEND + 2 * ENV_S + 30);

export const finite = (v: number): number => (Number.isFinite(v) ? v : 0);

/**
 * How far a demand chart reaches: past the demand, and up to the capacity drawn against it while
 * that stays near; far enough for the lowest capacity along the member too, where it is within six
 * times the demand, so a capacity that steps (stirrup zones, bars cut off) is seen stepping.
 */
export function chartReach(demand: number, capTop: number, capLow: number): number {
  const low = Number.isFinite(capLow) && 1.1 * capLow <= 6 * demand ? 1.1 * capLow : 3 * demand;
  return Math.max(1.25 * demand, Math.min(1.05 * capTop, Math.max(3 * demand, low)));
}

/** The least positive value, Infinity where there is none. */
export const leastPositive = (vs: readonly number[]): number => Math.min(...vs.filter((v) => Number.isFinite(v) && v > 0), Infinity);

export const path = (pts: ReadonlyArray<[number, number]>): string => pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');

export function capacityPath(pts: ReadonlyArray<{ x: number; v: number }>, top: number, X: (x: number) => number, toY: (v: number) => number): { inside: string; outside: string } {
  const inside: string[] = [], outside: string[] = [];
  let a: Array<[number, number]> = [], b: Array<[number, number]> = [];
  const flush = () => { if (a.length > 1) inside.push(path(a)); if (b.length > 1) outside.push(path(b)); a = []; b = []; };
  let was: boolean | null = null;
  for (const p of pts) {
    const over = Math.abs(p.v) > top;
    if (was !== null && over !== was) { const keep = (over ? a : b).at(-1); flush(); if (keep) (over ? b : a).push(keep); }
    (over ? b : a).push([X(p.x), toY(Math.sign(p.v) * Math.min(Math.abs(p.v), top))]);
    was = over;
  }
  flush();
  return { inside: inside.join(' '), outside: outside.join(' ') };
}

export function providedAlong(line: Pick<LineLayout, 'bars' | 'length'>, face: 'top' | 'bottom'): Array<{ x: number; v: number }> {
  const xs = [...new Set([0, line.length, ...line.bars.flatMap((b) => b.runs.filter((r) => r.face === face).flatMap((r) => [r.from, r.to]))])]
    .filter((x) => x >= -1e-9 && x <= line.length + 1e-9).sort((p, q) => p - q);
  const out: Array<{ x: number; v: number }> = [];
  for (let i = 1; i < xs.length; i++) {
    const a = xs[i - 1]!, b = xs[i]!;
    if (b - a < 1e-6) continue;
    const v = groupsArea(line.bars.filter((x) => barActsAt(x, face, (a + b) / 2)).map((x) => x.bars));
    out.push({ x: a, v }, { x: b, v });
  }
  return out;
}

export const filled = (xs: ReadonlyArray<number>, ys: ReadonlyArray<number>, axis: number): string =>
  xs.length ? `${path([[xs[0]!, axis], ...xs.map((x, i) => [x, ys[i]!] as [number, number]), [xs[xs.length - 1]!, axis]])} Z` : '';

export interface SteelChart {
  scale: number;
  provided: { top: string; bottom: string };
  withMin: { top: string; bottom: string };
  strength: { top: string; bottom: string };
  short: Array<{ x0: number; x1: number; face: 'top' | 'bottom' }>;
}

export function steelChart(line: Pick<LineLayout, 'bars' | 'length' | 'steel'>, X: (x: number) => number, axis: number, half: number): SteelChart {
  const steel = line.steel ?? [];
  const along = { top: providedAlong(line, 'top'), bottom: providedAlong(line, 'bottom') };
  const scale = Math.max(1e-6, ...along.top.map((p) => p.v), ...along.bottom.map((p) => p.v), ...steel.flatMap((s) => [finite(s.top.withMin), finite(s.bottom.withMin)]));
  const y = (face: 'top' | 'bottom', v: number) => axis + (face === 'top' ? -1 : 1) * (Math.min(Number.isFinite(v) ? v : scale, scale) / scale) * (half - 4);
  const draw = (face: 'top' | 'bottom', pts: ReadonlyArray<{ x: number; v: number }>) => path(pts.map((p) => [X(p.x), y(face, p.v)] as [number, number]));
  const pair = (key: 'withMin' | 'strength') => ({ top: draw('top', steel.map((s) => ({ x: s.x, v: s.top[key] }))), bottom: draw('bottom', steel.map((s) => ({ x: s.x, v: s.bottom[key] }))) });
  const short = (['top', 'bottom'] as const).flatMap((face) => shortStretches(steel, face).map(([a, b]) => ({ x0: X(a), x1: X(b), face })));
  return { scale, provided: { top: draw('top', along.top), bottom: draw('bottom', along.bottom) }, withMin: pair('withMin'), strength: pair('strength'), short };
}

export const hasSteel = (line: Pick<LineLayout, 'steel'>): boolean => (line.steel?.length ?? 0) > 1;
