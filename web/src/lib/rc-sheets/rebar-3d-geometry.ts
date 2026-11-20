import type { ColumnRow } from './column-row';
import type { LineLayout } from './beam-line';
import type { SlabRow } from './slab-row';
import type { WallRow } from './wall-row';
import type { PunchingRow } from './punching-row';
import type { PieceKind, PieceRows } from './schedule/pieces';
import type { BarShape } from './shape';
import type { SheetFamily } from './types';

export type V3 = [number, number, number];

export interface Frame { o: V3; x: V3; y: V3; z: V3 }

export type RebarTone = 'continuous' | 'support' | 'span' | 'bent' | 'stirrup' | 'column' | 'tie' | 'dowel'
  | 'bottomX' | 'bottomY' | 'topX' | 'topY' | 'vertical' | 'horizontal' | 'ubar' | 'wallTie' | 'punching';

export interface Rebar3d {
  element: string;
  rows: string[];
  family: SheetFamily;
  level?: string;
  /** The storey it is read in (`storeys.ts`), where the view knows the levels. */
  storey?: string;
  kind: PieceKind;
  tone: RebarTone;
  mark?: string;
  set?: string;
  dia: number;
  mandrel: number;
  segments: V3[][];
}

export interface Rebar3dFrames {
  line(l: LineLayout): Frame | null;
  column(r: ColumnRow): Frame | null;
  wall(r: WallRow): Frame | null;
  slabSoffit(r: SlabRow): number | null;
  /** A punching joint: at its node on the slab's mid-plane, axes the plan's. */
  punching?(r: PunchingRow): Frame | null;
}

export const at = (f: Frame, x: number, y: number, z: number): V3 => [
  f.o[0] + f.x[0] * x + f.y[0] * y + f.z[0] * z,
  f.o[1] + f.x[1] * x + f.y[1] * y + f.z[1] * z,
  f.o[2] + f.x[2] * x + f.y[2] * y + f.z[2] * z,
];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len3 = (a: V3) => Math.hypot(a[0], a[1], a[2]);

export const laid = (s: BarShape, f: Frame, place: (u: number, v: number) => [number, number, number]): V3[] => s.pts.map(([u, v]) => at(f, ...place(u, v)));

export function developedLength3d(pts: readonly V3[], mandrel: number, dia: number): number {
  const r = (mandrel + dia / 1000) / 2;
  let legs = 0, saved = 0;
  for (let i = 1; i < pts.length; i++) legs += len3(sub(pts[i]!, pts[i - 1]!));
  for (let i = 1; i + 1 < pts.length; i++) {
    const a = sub(pts[i]!, pts[i - 1]!), b = sub(pts[i + 1]!, pts[i]!), la = len3(a), lb = len3(b);
    if (la < 1e-12 || lb < 1e-12) continue;
    const t = Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb))));
    if (t > 1e-9) saved += 2 * r * Math.tan(t / 2) - r * t;
  }
  return legs - saved;
}

export const bar3dLength = (b: Pick<Rebar3d, 'segments' | 'mandrel' | 'dia'>): number => b.segments.reduce((s, seg) => s + developedLength3d(seg, b.mandrel, b.dia), 0);

function cumulative(pts: readonly V3[]): number[] {
  const out = [0];
  for (let i = 1; i < pts.length; i++) out.push(out[i - 1]! + len3(sub(pts[i]!, pts[i - 1]!)));
  return out;
}

function slice(pts: readonly V3[], cum: readonly number[], a: number, b: number): V3[] {
  const pointAt = (u: number): V3 => {
    let i = 0;
    while (i + 2 < cum.length && cum[i + 1]! < u) i++;
    const t = (u - cum[i]!) / Math.max(1e-12, cum[i + 1]! - cum[i]!), p = pts[i]!, q = pts[i + 1]!;
    return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
  };
  const inner = pts.filter((_, i) => cum[i]! > a + 1e-9 && cum[i]! < b - 1e-9);
  return [pointAt(a), ...inner, pointAt(b)];
}

export function lapSegments(pts: readonly V3[], lap: number, centres: readonly number[]): V3[][] {
  if (!centres.length || !(lap > 0)) return [[...pts]];
  const cum = cumulative(pts), total = cum[cum.length - 1]!;
  const cs = [...centres].sort((p, q) => p - q);
  const starts = [0, ...cs.map((u) => Math.max(0, u - lap / 2))], ends = [...cs.map((u) => Math.min(total, u + lap / 2)), total];
  return starts.map((u, i) => slice(pts, cum, u, ends[i]!));
}

export function evenLapCentres(pts: readonly V3[], laps: { count: number; length: number }): number[] {
  const cum = cumulative(pts), total = cum[cum.length - 1]!, n = laps.count + 1;
  const p = (total + laps.count * laps.length) / n;
  return Array.from({ length: laps.count }, (_, k) => k * (p - laps.length) + p - laps.length / 2);
}

export function barOf(shape: BarShape, pts: V3[], base: Omit<Rebar3d, 'segments' | 'dia' | 'mandrel'>, centres?: readonly number[]): Rebar3d {
  const segments = shape.laps ? lapSegments(pts, shape.laps.length, centres?.length ? centres : evenLapCentres(pts, shape.laps)) : [pts];
  return { ...base, dia: shape.dia, mandrel: shape.mandrel, segments };
}

export type Rebar3dRows = PieceRows;
