/**
 * Vehicles for moving loads: a train of axles (`moving-loads.ts` `LoadTrain`) with what a code's
 * truck states besides, and the static load cases of a vehicle at given positions.
 *
 *   variable spacing   one gap that ranges between two values (the 4.3–9.0 m of a design truck):
 *                      every spacing in that range is run, a step apart, ends included;
 *   wheel lines        the gauge between the two lines of wheels: with a second path (the other
 *                      girder, the other line of members) each axle puts half on each; on one path
 *                      the whole axle goes to it;
 *   dynamic factor     every axle times it (the impact allowance).
 *
 * The catalog holds the AASHTO trucks the standard specification names (HS20-44, HS15-44, H20-44,
 * H15-44) and the HL-93 design truck and tandem, in kN and m. A vehicle is saved and read back as
 * a JSON file.
 *
 * Pure.
 */
import type { LoadTrain } from './moving-loads';
import type { Load } from '../store/model.svelte';
import type { PathSegment3D } from './moving-loads-3d';

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

/** The trains a vehicle stands for: each spacing of its variable gap, its axles times the dynamic factor. */
export function vehicleTrains(v: Vehicle, spacingStep = 0.5): LoadTrain[] {
  const k = v.dynamicFactor && v.dynamicFactor > 0 ? v.dynamicFactor : 1;
  const base = v.axles.map((a) => ({ offset: a.offset, weight: a.weight * k }));
  const gap = v.variable;
  if (!gap || gap.axle <= 0 || gap.axle >= base.length || !(gap.max > gap.min)) return [{ name: v.name, axles: base }];
  const n = Math.max(1, Math.ceil((gap.max - gap.min) / spacingStep - 1e-9));
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
    if (!v || typeof v.name !== 'string' || !Array.isArray(v.axles) || !v.axles.every((a) => Number.isFinite(a.offset) && Number.isFinite(a.weight))) return null;
    return v;
  } catch {
    return null;
  }
}

/** Where an arc length along a path falls: the member and the distance from its node I. */
export function pathPoint(path: readonly PathSegment3D[], s: number): { elementId: number; a: number } | null {
  const seg = path.find((p) => s >= p.cumStart - 1e-12 && s <= p.cumStart + p.length + 1e-12);
  if (!seg) return null;
  const along = Math.min(Math.max(s - seg.cumStart, 0), seg.length);
  return { elementId: seg.elementId, a: seg.reversed ? seg.length - along : along };
}

/**
 * The model loads of a train with its reference axle at `ref` along the path (vertical, global),
 * half on each path when there are two wheel lines.
 */
export function trainModelLoads(train: LoadTrain, ref: number, path: readonly PathSegment3D[], path2: readonly PathSegment3D[] | null, caseId: number): Load[] {
  const out: Load[] = [];
  const share = path2 ? 0.5 : 1;
  for (const axle of train.axles) {
    for (const p of path2 ? [path, path2] : [path]) {
      const at = pathPoint(p, ref + axle.offset);
      if (!at) continue;
      out.push({ type: 'pointOnElement3d', data: { id: 0, elementId: at.elementId, a: at.a, px: 0, py: 0, pz: -axle.weight * share, frame: 'global', caseId } });
    }
  }
  return out;
}

/** The reference positions a vehicle takes along a path of `total` length, a step apart, from entering to leaving. */
export function positionsAlong(train: LoadTrain, total: number, step: number): number[] {
  const maxOff = Math.max(0, ...train.axles.map((a) => a.offset));
  const out: number[] = [];
  for (let r = -maxOff; r <= total + 1e-9; r += step) out.push(+r.toFixed(9));
  return out;
}
