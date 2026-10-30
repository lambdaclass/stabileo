/**
 * Using an influence line: the effect of a concentrated load is P·η under it, the effect of a
 * uniform load is q times the area of the line under the loaded length. The largest value puts
 * the dead load g everywhere, the live load q where the line is positive and P at its highest
 * ordinate; the smallest, q where it is negative and P at its lowest.
 *
 * The live load goes either on the stretches where the line has the sign sought ('zones'), or on
 * whole members whose net area has it ('spans'), which is the pattern loading of a code.
 */
import type { SolverInput, SolverLoad } from '../types';
import { memberGeom, type Dir, type IlPoint } from './unit-sweep';

/** How far beside a section (m) P stands to act on one side of it. */
const BESIDE = 1e-9;

export interface IlLoads { g: number; q: number; P: number }
export type LivePlacement = 'zones' | 'spans';
/** A stretch of a member, t0 < t1 in [0, 1]. */
export interface Zone { elementId: number; t0: number; t1: number }

export interface IlAreas {
  pos: number;
  neg: number;
  perMember: Map<number, { pos: number; neg: number }>;
  posZones: Zone[];
  negZones: Zone[];
}

export interface IlExtreme {
  value: number;
  dead: number;
  live: number;
  point: number;
  /** Where q goes. */
  zones: Zone[];
  /** The members q loads, whole or in part. */
  members: number[];
  /** Where P goes, when it adds to this extreme. */
  pointAt: { elementId: number; t: number; eta: number; side?: 'left' | 'right' } | null;
}

function byMember(points: IlPoint[]): Map<number, IlPoint[]> {
  const out = new Map<number, IlPoint[]>();
  for (const p of points) {
    const list = out.get(p.elementId) ?? [];
    list.push(p);
    out.set(p.elementId, list);
  }
  return out;
}

function pushZone(zones: Zone[], elementId: number, t0: number, t1: number): void {
  if (t1 - t0 < 1e-12) return;
  const last = zones[zones.length - 1];
  if (last && last.elementId === elementId && Math.abs(last.t1 - t0) < 1e-12) last.t1 = t1;
  else zones.push({ elementId, t0, t1 });
}

/**
 * Positive and negative areas of the line over the loaded members: trapezoids, split where the line
 * crosses zero; or, with `zoneArea`, each zone's area as given (the effect of a unit uniform load on
 * it, which is the integral exactly).
 */
export function ilAreas(points: IlPoint[], lengthOf: (id: number) => number, loaded: (id: number) => boolean, zoneArea?: (z: Zone) => number): IlAreas {
  const perMember = new Map<number, { pos: number; neg: number }>();
  const posZones: Zone[] = [];
  const negZones: Zone[] = [];
  let pos = 0, neg = 0;
  for (const [id, pts] of byMember(points)) {
    if (!loaded(id)) continue;
    const L = lengthOf(id);
    let mp = 0, mn = 0;
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k], b = pts[k + 1];
      const dt = b.t - a.t;
      if (dt < 1e-12) continue;
      const add = (t0: number, v0: number, t1: number, v1: number) => {
        const area = 0.5 * (v0 + v1) * (t1 - t0) * L;
        if (v0 + v1 > 0) { mp += area; pushZone(posZones, id, t0, t1); }
        else if (v0 + v1 < 0) { mn += area; pushZone(negZones, id, t0, t1); }
      };
      if (a.value * b.value < 0) {
        const tz = a.t + dt * (a.value / (a.value - b.value));
        add(a.t, a.value, tz, 0);
        add(tz, 0, b.t, b.value);
      } else add(a.t, a.value, b.t, b.value);
    }
    perMember.set(id, { pos: mp, neg: mn });
    pos += mp;
    neg += mn;
  }
  if (!zoneArea) return { pos, neg, perMember, posZones, negZones };
  const exact = new Map<number, { pos: number; neg: number }>();
  for (const id of perMember.keys()) exact.set(id, { pos: 0, neg: 0 });
  for (const z of posZones) exact.get(z.elementId)!.pos += zoneArea(z);
  for (const z of negZones) exact.get(z.elementId)!.neg += zoneArea(z);
  const sum = (k: 'pos' | 'neg') => [...exact.values()].reduce((a, v) => a + v[k], 0);
  return { pos: sum('pos'), neg: sum('neg'), perMember: exact, posZones, negZones };
}

/** The highest and lowest ordinates on the loaded members. */
export function ordinateExtremes(points: IlPoint[], loaded: (id: number) => boolean): { max: IlPoint | null; min: IlPoint | null } {
  let max: IlPoint | null = null, min: IlPoint | null = null;
  for (const p of points) {
    if (!loaded(p.elementId)) continue;
    if (!max || p.value > max.value) max = p;
    if (!min || p.value < min.value) min = p;
  }
  return { max, min };
}

/** The largest and the smallest value of the quantity under g, q and P placed by the line. */
export function ilExtremes(
  points: IlPoint[], lengthOf: (id: number) => number, loaded: (id: number) => boolean, loads: IlLoads, placement: LivePlacement,
  zoneArea?: (z: Zone) => number,
): { max: IlExtreme; min: IlExtreme; areas: IlAreas } {
  const areas = ilAreas(points, lengthOf, loaded, zoneArea);
  const eta = ordinateExtremes(points, loaded);
  const dead = loads.g * (areas.pos + areas.neg);
  const build = (sign: 1 | -1): IlExtreme => {
    let live = 0;
    let zones: Zone[];
    if (placement === 'zones') {
      live = loads.q * (sign > 0 ? areas.pos : areas.neg);
      zones = sign > 0 ? areas.posZones : areas.negZones;
    } else {
      zones = [];
      for (const [id, a] of areas.perMember) {
        const net = a.pos + a.neg;
        if (sign * net > 1e-15) { live += loads.q * net; zones.push({ elementId: id, t0: 0, t1: 1 }); }
      }
    }
    const peak = sign > 0 ? eta.max : eta.min;
    const partner = peak?.side ? points.find((p) => p !== peak && p.side && p.elementId === peak.elementId && p.t === peak.t) : undefined;
    const jumps = !!partner && Math.abs(partner.value - peak!.value) > 1e-12;
    const adds = peak && sign * peak.value > 1e-15 && loads.P !== 0;
    const point = adds ? loads.P * peak!.value : 0;
    const members = [...new Set(zones.map((z) => z.elementId))];
    return {
      value: dead + live + point, dead, live, point, zones, members,
      pointAt: adds ? { elementId: peak!.elementId, t: peak!.t, eta: peak!.value, ...(jumps ? { side: peak!.side } : {}) } : null,
    };
  };
  return { max: build(1), min: build(-1), areas };
}

/** The loads of `w` per unit length along `dir` on [a, b] of a member, as the static solve takes them. */
export function uniformAlong(solver: SolverInput, elementId: number, a: number, b: number, w: number, dir: Dir): SolverLoad[] {
  const { e, L, c, s } = memberGeom(solver, elementId);
  const Fx = w * dir.x, Fz = w * dir.z;
  if (e.type === 'truss') {
    const W = (b - a);
    const toJ = (W * (a + b)) / (2 * L);
    const fJ = toJ, fI = W - toJ;
    return [
      { type: 'nodal', data: { nodeId: e.nodeI, fx: Fx * fI, fz: Fz * fI, my: 0 } },
      { type: 'nodal', data: { nodeId: e.nodeJ, fx: Fx * fJ, fz: Fz * fJ, my: 0 } },
    ];
  }
  const out: SolverLoad[] = [];
  const perp = -s * Fx + c * Fz;
  const axial = c * Fx + s * Fz;
  if (Math.abs(perp) > 1e-12) out.push({ type: 'distributed', data: { elementId, qI: perp, qJ: perp, a, b } });
  if (Math.abs(axial) > 1e-12) out.push({ type: 'axialDistributed', data: { elementId, qI: axial, qJ: axial, a, b } });
  return out;
}

/** The loads one extreme places: g on every loaded member, q on its zones, P at its ordinate. */
export function extremeLoads(
  solver: SolverInput, loadedIds: number[], loads: IlLoads, ex: IlExtreme, dir: Dir, pointLoad: (id: number, a: number, w: number) => SolverLoad[],
): SolverLoad[] {
  const out: SolverLoad[] = [];
  if (loads.g !== 0) for (const id of loadedIds) out.push(...uniformAlong(solver, id, 0, memberGeom(solver, id).L, loads.g, dir));
  if (loads.q !== 0) for (const z of ex.zones) {
    const L = memberGeom(solver, z.elementId).L;
    out.push(...uniformAlong(solver, z.elementId, z.t0 * L, z.t1 * L, loads.q, dir));
  }
  if (ex.pointAt) {
    const { e, L } = memberGeom(solver, ex.pointAt.elementId);
    const a = ex.pointAt.t * L + (ex.pointAt.side === 'left' ? -BESIDE : ex.pointAt.side === 'right' ? BESIDE : 0);
    if (a < 0 || a > L) {
      const nodeId = a < 0 ? e.nodeI : e.nodeJ;
      out.push({ type: 'nodal', data: { nodeId, fx: loads.P * dir.x, fz: loads.P * dir.z, my: 0 } });
    } else out.push(...pointLoad(ex.pointAt.elementId, a, loads.P));
  }
  return out;
}

/** The members a load along `dir` acts across: every member not parallel to it. */
export function defaultLoadedMembers(solver: SolverInput, dir: Dir): number[] {
  return [...solver.elements.keys()].filter((id) => {
    const { c, s } = memberGeom(solver, id);
    return Math.abs(-s * dir.x + c * dir.z) > 1e-6;
  });
}
