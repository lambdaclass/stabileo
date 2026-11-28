/**
 * What the sheets' components compute from the rows before they draw: numbers in the locale's
 * decimal mark, a slab layer's bars across its panel, a punching joint's control perimeter, and
 * what the editors accept.
 *
 * Pure.
 */
import { BEAM_BAR_RANGE, COLUMN_BAR_RANGE, SLAB_BAR_RANGE, SLAB_MESH_DIAMETERS, DEFAULT_TIE_DIAMETERS, listIn } from './types';

/** The decimals of a formula or a value in a comma locale: section numbers (§9.7.3) and thousands are left as they are. */
export const localizeDecimals = (s: string | undefined, comma: boolean): string =>
  (s && comma ? s.replace(/(?<![\d.§])(\d+)\.(\d+)(?![\d.])/g, '$1,$2') : s ?? '');

/**
 * A layer's bars across `span`, m, at `s`: the outer ones `edge` in from each side (the cover and
 * half the bar), the rest at the spacing, centred; every `every`-th drawn past `maxLines`.
 */
export function layerPositions(span: number, s: number, edge: number, maxLines = Infinity, minGap = 0): { at: number[]; n: number; every: number } {
  const room = Math.max(0, span - 2 * edge);
  const n = s > 0 ? Math.max(1, Math.floor(room / s + 1e-9) + 1) : 1;
  const every = Math.max(1, Number.isFinite(maxLines) ? Math.ceil(n / maxLines) : 1, s > 0 ? Math.ceil(minGap / s - 1e-9) : 1);
  const used = (n - 1) * s, start = (span - used) / 2;
  return { at: Array.from({ length: Math.ceil(n / every) }, (_, i) => start + i * every * s), n, every };
}

export type PlanSide = 'px' | 'py' | 'nx' | 'ny';

/**
 * A control perimeter `off` from the faces of a `2bx × 2by` column, cut where the slab stops
 * (`free`), as an SVG path through `X`, `Y` (screen y down, so the plan's y is reversed); rounded
 * corners are quarter circles about the column's corners, swept the way that keeps them `off` out.
 */
export function ringPath(o: { bx: number; by: number; off: number; rounded: boolean; free: ReadonlySet<PlanSide>; X: (x: number) => number; Y: (y: number) => number; k: number }): string {
  const { bx, by, off, free, X, Y, k } = o, r = o.rounded;
  const ex = bx + off, ey = by + off;
  const xa = free.has('nx') ? -bx : -ex, xb = free.has('px') ? bx : ex;
  const ya = free.has('ny') ? -by : -ey, yb = free.has('py') ? by : ey;
  const parts: string[] = [];
  const seg = (x1: number, y1: number, x2: number, y2: number) => parts.push(`M ${X(x1)} ${Y(y1)} L ${X(x2)} ${Y(y2)}`);
  const arc = (cx: number, cy: number, a0: number, a1: number) => {
    const p0 = [cx + off * Math.cos(a0), cy + off * Math.sin(a0)], p1 = [cx + off * Math.cos(a1), cy + off * Math.sin(a1)];
    parts.push(`M ${X(p0[0]!)} ${Y(p0[1]!)} A ${off * k} ${off * k} 0 0 0 ${X(p1[0]!)} ${Y(p1[1]!)}`);
  };
  if (!free.has('ny')) seg(r && !free.has('nx') ? -bx : xa, -ey, r && !free.has('px') ? bx : xb, -ey);
  if (!free.has('px')) seg(ex, r && !free.has('ny') ? -by : ya, ex, r && !free.has('py') ? by : yb);
  if (!free.has('py')) seg(r && !free.has('px') ? bx : xb, ey, r && !free.has('nx') ? -bx : xa, ey);
  if (!free.has('nx')) seg(-ex, r && !free.has('py') ? by : yb, -ex, r && !free.has('ny') ? -by : ya);
  if (r) {
    if (!free.has('ny') && !free.has('px')) arc(bx, -by, -Math.PI / 2, 0);
    if (!free.has('px') && !free.has('py')) arc(bx, by, 0, Math.PI / 2);
    if (!free.has('py') && !free.has('nx')) arc(-bx, by, Math.PI / 2, Math.PI);
    if (!free.has('nx') && !free.has('ny')) arc(-bx, -by, Math.PI, (3 * Math.PI) / 2);
  }
  return parts.join(' ');
}

/**
 * A number typed in an editor box, within its limits; empty or not a number, the lower one. A whole
 * `step` (a count, 1; a stirrup's legs, 2) puts it on that step from the lower limit, as the box
 * offers it: HTML's step alone lets 2.5 bars or 3 legs through.
 */
export function numberInput(raw: string, min: number, max: number, step?: number): number {
  const v = Number(raw), lo = Number.isFinite(min) ? min : 0;
  const c = raw.trim() !== '' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : lo;
  if (step === undefined || !Number.isInteger(step) || step <= 0) return c;
  const snapped = lo + Math.round((c - lo) / step) * step;
  return snapped > max ? snapped - step : snapped;
}

export const countInput = (raw: string, min: number, max: number): number => numberInput(raw, min, max, 1);

/** A stirrup's legs: an even number, two at least, within `max`. */
export const legsInput = (raw: string, max = 8): number => numberInput(raw, 2, max, 2);

/** A spacing typed in cm, in m: within its limits; empty or not a number, the lower one. */
export function spacingInput(raw: string, minCm: number, maxCm: number): number {
  const v = Number(raw);
  return (raw.trim() === '' || !Number.isFinite(v) ? minCm : Math.min(maxCm, Math.max(minCm, v))) / 100;
}

export interface DiameterLists { longDiametersMm?: readonly number[]; stirrupDiametersMm?: readonly number[]; slabDiametersMm?: readonly number[] }

/**
 * The diameters an editor offers, from the design data's lists: a beam's and a column's bars from
 * the longitudinal list in their family's range, ties from the transverse list, slab and wall
 * meshes from the slab list and the longitudinal one; `current` kept so a bar set before the list
 * changed still reads.
 */
export function editorDiameters(dd: DiameterLists, use: 'beam' | 'column' | 'tie' | 'slab' | 'wall', current: readonly number[] = []): number[] {
  const long = dd.longDiametersMm ?? [];
  const base = use === 'beam' ? listIn(long, BEAM_BAR_RANGE)
    : use === 'column' ? listIn(long, COLUMN_BAR_RANGE)
      : use === 'tie' ? [...(dd.stirrupDiametersMm?.length ? dd.stirrupDiametersMm : DEFAULT_TIE_DIAMETERS)]
        : use === 'slab' ? listIn(dd.slabDiametersMm?.length ? dd.slabDiametersMm : SLAB_MESH_DIAMETERS, SLAB_BAR_RANGE)
          : listIn([...long, ...(dd.slabDiametersMm ?? [])], SLAB_BAR_RANGE);
  return [...new Set([...base, ...current.filter((x) => x > 0)])].sort((p, q) => p - q);
}
