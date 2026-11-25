/**
 * Vehicles for moving loads: a train of axles (`moving-loads.ts` `LoadTrain`) with what a code's
 * truck states besides, and the static load cases of a vehicle at given positions.
 *
 *   variable spacing   one gap that ranges between two values (the 4.3–9.0 m of a design truck):
 *                      every spacing in that range is run, a step apart, ends included;
 *   wheel lines        the gauge between the two lines of wheels: with a second path (the other
 *                      girder, the other line of members) each axle puts half on each; on one path
 *                      the whole axle goes to it. The second path is run the way the first one is
 *                      (`alignSecondLine`) and checked against the gauge: parallel and that far apart;
 *   dynamic factor     every axle times it (the impact allowance).
 *
 * A train that is not symmetric runs both ways (`positionPasses`), the sweep's positions and the
 * position cases alike.
 *
 * The catalog holds the AASHTO trucks the standard specification names (HS20-44, HS15-44, H20-44,
 * H15-44) and the HL-93 design truck and tandem, in kN and m. A vehicle is saved and read back as
 * a JSON file, and one that does not hold together is refused (`vehicleProblem`).
 *
 * Pure.
 */
import type { LoadTrain } from './moving-loads';
import type { Load } from '../store/model.svelte';
import type { PathSegment3D } from './moving-loads-3d';
import { axleOffsetScale, checkAxlePath, locateAxle, referenceGrid } from './moving-axle-station';

export interface Vehicle extends LoadTrain {
  /** The gap before axle `axle` (its offset minus the previous one's) ranging over [min, max]. */
  variable?: { axle: number; min: number; max: number };
  /** Distance between the two wheel lines, m. */
  gauge?: number;
  /** Multiplies every axle. */
  dynamicFactor?: number;
}

const KIP = 4.448222; // kN
const FT = 0.3048; // m

/** The AASHTO catalog. */
export const AASHTO_VEHICLES: readonly Vehicle[] = Object.freeze([
  { name: 'AASHTO HS20-44', axles: [{ offset: 0, weight: 8 * KIP }, { offset: 14 * FT, weight: 32 * KIP }, { offset: 28 * FT, weight: 32 * KIP }], variable: { axle: 2, min: 14 * FT, max: 30 * FT }, gauge: 6 * FT },
  { name: 'AASHTO HS15-44', axles: [{ offset: 0, weight: 6 * KIP }, { offset: 14 * FT, weight: 24 * KIP }, { offset: 28 * FT, weight: 24 * KIP }], variable: { axle: 2, min: 14 * FT, max: 30 * FT }, gauge: 6 * FT },
  { name: 'AASHTO H20-44', axles: [{ offset: 0, weight: 8 * KIP }, { offset: 14 * FT, weight: 32 * KIP }], gauge: 6 * FT },
  { name: 'AASHTO H15-44', axles: [{ offset: 0, weight: 6 * KIP }, { offset: 14 * FT, weight: 24 * KIP }], gauge: 6 * FT },
  { name: 'AASHTO HL-93', axles: [{ offset: 0, weight: 35 }, { offset: 4.3, weight: 145 }, { offset: 8.6, weight: 145 }], variable: { axle: 2, min: 4.3, max: 9 }, gauge: 1.8 },
  { name: 'AASHTO HL-93 tandem', axles: [{ offset: 0, weight: 110 }, { offset: 1.2, weight: 110 }], gauge: 1.8 },
]);

/** The shortest step along a path or between spacings, m: a smaller one is read as this. */
export const MIN_STEP = 0.05;
/** The most spacings a variable gap is run at: past it the step widens to fit. */
export const MAX_SPACINGS = 100;
/** The widest range a variable gap may span, m. */
export const MAX_GAP = 100;

/** A step as used: a positive finite one, at least `MIN_STEP`; `fallback` otherwise. */
export function usableStep(step: number, fallback: number): number {
  return Number.isFinite(step) && step > 0 ? Math.max(step, MIN_STEP) : fallback;
}

/**
 * What makes a vehicle unusable, as an i18n key; null when it holds together. The variable gap
 * names an axle by its index (an integer from 1 to the last), and ranges over 0 < min ≤ max, no
 * wider than `MAX_GAP`; the gauge is positive; the dynamic factor positive (below 1 too: it
 * multiplies every axle, and a reduction such as a lane fraction has its uses).
 */
export function vehicleProblem(v: Vehicle): string | null {
  if (typeof v.name !== 'string' || !Array.isArray(v.axles) || v.axles.length === 0) return 'moving.bad.axles';
  if (!v.axles.every((a) => a && Number.isFinite(a.offset) && Number.isFinite(a.weight))) return 'moving.bad.axles';
  if (v.axles.every((a) => a.weight === 0)) return 'moving.noAxles';
  const g = v.variable;
  if (g !== undefined && g !== null) {
    if (!Number.isInteger(g.axle) || g.axle < 1 || g.axle >= v.axles.length) return 'moving.bad.variableAxle';
    if (!Number.isFinite(g.min) || !Number.isFinite(g.max) || !(g.min > 0) || !(g.max >= g.min) || g.max - g.min > MAX_GAP) return 'moving.bad.variableRange';
  }
  if (v.gauge !== undefined && v.gauge !== null && !(Number.isFinite(v.gauge) && v.gauge > 0)) return 'moving.bad.gauge';
  if (v.dynamicFactor !== undefined && v.dynamicFactor !== null && !(Number.isFinite(v.dynamicFactor) && v.dynamicFactor > 0)) return 'moving.bad.dynamicFactor';
  return null;
}

/**
 * The trains a vehicle stands for: each spacing of its variable gap, its axles times the dynamic
 * factor. A gap that does not hold together (`vehicleProblem`) is not run: the vehicle as it is
 * written. The step is at least `MIN_STEP` (a step of 0 never ended), and at most `MAX_SPACINGS`
 * spacings are run (a range of 0 to 100 km made 200 001 trains): past it the step widens.
 */
export function vehicleTrains(v: Vehicle, spacingStep = 0.5): LoadTrain[] {
  const k = v.dynamicFactor && v.dynamicFactor > 0 ? v.dynamicFactor : 1;
  const base = v.axles.map((a) => ({ offset: a.offset, weight: a.weight * k }));
  const gap = v.variable;
  if (!gap || !Number.isInteger(gap.axle) || gap.axle <= 0 || gap.axle >= base.length || !(gap.max > gap.min) || !(gap.min > 0) || gap.max - gap.min > MAX_GAP) {
    return [{ name: v.name, axles: base }];
  }
  const step = usableStep(spacingStep, 0.5);
  const n = Math.min(MAX_SPACINGS - 1, Math.max(1, Math.ceil((gap.max - gap.min) / step - 1e-9)));
  const out: LoadTrain[] = [];
  for (let i = 0; i <= n; i++) {
    const g = gap.min + ((gap.max - gap.min) * i) / n;
    const shift = g - (base[gap.axle]!.offset - base[gap.axle - 1]!.offset);
    out.push({ name: `${v.name} (${g.toFixed(2)} m)`, axles: base.map((a, j) => (j >= gap.axle ? { ...a, offset: a.offset + shift } : a)) });
  }
  return out;
}

/** A vehicle as a file, and back (null when the file is not one). */
export function vehicleToJson(v: Vehicle): string {
  return JSON.stringify({ kind: 'stabileo-vehicle', version: 1, vehicle: v }, null, 2);
}
export function vehicleFromJson(text: string): Vehicle | null {
  try {
    const o = JSON.parse(text) as { kind?: string; vehicle?: Vehicle };
    const v = o.kind === 'stabileo-vehicle' ? o.vehicle : (o as unknown as Vehicle);
    // A file that does not hold together is not a vehicle: a gap before axle 0,5 threw, and one
    // from 0 to 100 km ran 200 001 trains.
    if (!v || typeof v !== 'object' || vehicleProblem(v)) return null;
    return v;
  } catch {
    return null;
  }
}

/** Where an arc length along a path falls: the member and the distance from its node I. */
export function pathPoint(path: readonly PathSegment3D[], reference: number, offset = 0, scale = Math.abs(offset)):
  { nodeId: number } | { elementId: number; a: number } | null {
  const at = locateAxle(path, reference, offset, scale, (seg) => seg.reversed);
  if (!at) return null;
  const { segment: seg, a } = at;
  if (a === 0) return { nodeId: seg.reversed ? seg.to : seg.from };
  if (a === seg.length) return { nodeId: seg.reversed ? seg.from : seg.to };
  return { elementId: seg.elementId, a };
}

/**
 * The model loads of a train with its reference axle at `ref` along the path (vertical, global),
 * half on each path when there are two wheel lines. An axle of no weight writes nothing.
 */
export function trainModelLoads(train: LoadTrain, ref: number, path: readonly PathSegment3D[], path2: readonly PathSegment3D[] | null, caseId: number, scale?: number): Load[] {
  const paths = path2 ? [path, path2] : [path];
  if (scale === undefined) {
    scale = axleOffsetScale(train);
    for (const line of paths) checkAxlePath(line, scale);
  }
  const out: Load[] = [];
  const share = path2 ? 0.5 : 1;
  for (const axle of train.axles) {
    if (axle.weight === 0) continue;
    for (const p of paths) {
      const at = pathPoint(p, ref, axle.offset, scale);
      if (!at) continue;
      const fz = -axle.weight * share;
      if ('nodeId' in at) {
        out.push({ type: 'nodal3d', data: { id: 0, nodeId: at.nodeId, fx: 0, fy: 0, fz, mx: 0, my: 0, mz: 0, caseId } });
      } else {
        out.push({ type: 'pointOnElement3d', data: { id: 0, elementId: at.elementId, a: at.a, px: 0, py: 0, pz: fz, frame: 'global', caseId } });
      }
    }
  }
  return out;
}

/** The reference positions a vehicle takes along a path of `total` length, a step apart, from entering to leaving. */
export function positionsAlong(train: LoadTrain, total: number, step: number): number[] {
  return vehiclePositionGrid(train, total, step).positions();
}

/** How many positions `positionsAlong` gives, without building them. */
export function positionCount(train: LoadTrain, total: number, step: number): number {
  return vehiclePositionGrid(train, total, step).count;
}

function vehiclePositionGrid(train: LoadTrain, total: number, step: number) {
  const maxOffset = Math.max(0, ...train.axles.map((a) => a.offset));
  return referenceGrid(-maxOffset, total, usableStep(step, 1));
}

/** Symmetric: the same axles read from the other end. */
export function isSymmetric(train: LoadTrain): boolean {
  const max = Math.max(...train.axles.map((a) => a.offset));
  return train.axles.every((a) => train.axles.some((b) => Math.abs(b.offset - (max - a.offset)) < 1e-6 && Math.abs(b.weight - a.weight) < 1e-6));
}

/** The train driven the other way: its last axle leads. */
export function reversedTrain(train: LoadTrain): LoadTrain {
  const max = Math.max(...train.axles.map((a) => a.offset));
  return { name: train.name, axles: train.axles.map((a) => ({ offset: max - a.offset, weight: a.weight })) };
}

/**
 * The passes a train makes along a path: forward and, when it is not symmetric, back on the
 * mirrored positions, as the sweep runs it (`moving-loads-3d.ts`). The position cases took the
 * forward pass alone: an HL-93 over spans of 8 and 16 m read 661,8 kN·m for the sweep's 681,3.
 */
export function positionPasses(train: LoadTrain, total: number, step: number) {
  const grid = vehiclePositionGrid(train, total, step);
  const scale = axleOffsetScale(train);
  const forward = { train, refs: grid.positions(), reversed: false, scale };
  if (isSymmetric(train)) return [forward];
  const reverse = reversedTrain(train);
  return [forward, { train: reverse, refs: grid.positions(true), reversed: true, scale: Math.max(scale, total, axleOffsetScale(reverse)) }];
}

/** How many positions `positionPasses` gives, without building them. */
export function passCount(train: LoadTrain, total: number, step: number): number {
  return positionCount(train, total, step) * (isSymmetric(train) ? 1 : 2);
}

/** The run of a path: its first node and its last. */
function pathEnds(nodes: ReadonlyMap<number, { x: number; y: number; z: number }>, path: readonly PathSegment3D[]) {
  const a = nodes.get(path[0]!.from)!, b = nodes.get(path[path.length - 1]!.to)!;
  return { a, b };
}

/** A path run from its other end. */
export function reversePath(path: readonly PathSegment3D[]): PathSegment3D[] {
  const out: PathSegment3D[] = [];
  let cum = 0;
  for (let i = path.length - 1; i >= 0; i--) {
    const p = path[i]!;
    out.push({ elementId: p.elementId, from: p.to, to: p.from, length: p.length, cumStart: cum, reversed: !p.reversed });
    cum += p.length;
  }
  return out;
}

/**
 * The second wheel line run the way the first is, with what does not match it. Its members are
 * chained from the end the first one picked touches, so a line picked right to left ran the
 * other way and put an axle's halves at 2 m and at 14 m of a 16 m deck. It is turned when its
 * start lies nearer the first line's end than its start. Then, as notes (i18n key and values):
 * not parallel (over 5° apart in plan and elevation), not the length of the first (5 %), or, with a
 * gauge, not about that far apart (the larger of 0,25 m and 10 % of it). The loads follow the
 * members picked either way: the gauge is a check, not a position.
 */
export function alignSecondLine(
  nodes: ReadonlyMap<number, { x: number; y: number; z: number }>, path: readonly PathSegment3D[], path2: readonly PathSegment3D[], gauge?: number | null,
): { path2: PathSegment3D[]; notes: Array<{ key: string; params: Record<string, number> }> } {
  const one = pathEnds(nodes, path);
  let two = pathEnds(nodes, path2);
  const d = (p: { x: number; y: number; z: number }, q: { x: number; y: number; z: number }) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
  let out = [...path2];
  if (d(two.a, one.b) < d(two.a, one.a)) { out = reversePath(path2); two = pathEnds(nodes, out); }
  const notes: Array<{ key: string; params: Record<string, number> }> = [];
  const u = [one.b.x - one.a.x, one.b.y - one.a.y, one.b.z - one.a.z], v = [two.b.x - two.a.x, two.b.y - two.a.y, two.b.z - two.a.z];
  const lu = Math.hypot(...u), lv = Math.hypot(...v);
  if (lu > 1e-9 && lv > 1e-9) {
    const cos = (u[0]! * v[0]! + u[1]! * v[1]! + u[2]! * v[2]!) / (lu * lv);
    const deg = (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
    if (deg > 5) notes.push({ key: 'moving.line2NotParallel', params: { deg: +deg.toFixed(1) } });
    // Apart: the second line's midpoint from the first line's chord.
    const m = { x: (two.a.x + two.b.x) / 2, y: (two.a.y + two.b.y) / 2, z: (two.a.z + two.b.z) / 2 };
    const w = [m.x - one.a.x, m.y - one.a.y, m.z - one.a.z];
    const along = (w[0]! * u[0]! + w[1]! * u[1]! + w[2]! * u[2]!) / lu;
    const apart = Math.sqrt(Math.max(0, w[0]! ** 2 + w[1]! ** 2 + w[2]! ** 2 - along ** 2));
    if (gauge && gauge > 0 && Math.abs(apart - gauge) > Math.max(0.25, 0.1 * gauge)) {
      notes.push({ key: 'moving.line2Gauge', params: { apart: +apart.toFixed(2), gauge: +gauge.toFixed(2) } });
    }
  }
  const len = (p: readonly PathSegment3D[]) => p.reduce((s, x) => s + x.length, 0);
  const l1 = len(path), l2 = len(out);
  if (Math.abs(l1 - l2) > 0.05 * Math.max(l1, l2)) notes.push({ key: 'moving.line2Length', params: { l1: +l1.toFixed(2), l2: +l2.toFixed(2) } });
  return { path2: out, notes };
}
