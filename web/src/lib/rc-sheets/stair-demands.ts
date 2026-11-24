/**
 * The stairs the sheets design, and only those the project has: each stair of the desk, and each
 * flight the model holds that no stair of the desk is: a run of inclined shells, read with the
 * level shells its foot and head meet as its landings. What a model cannot say (the risers, how
 * its ends bear, its finishes and live load) is presumed and named, for the reader to check.
 */
import type { StairDesignSpec } from '../engine/design/slabs/stairs';
import type { StairEntry } from '../model/stairs-pt';
import type { StairDemand } from './stair-row';

export interface StairShell { id: number; nodes: readonly number[]; thickness: number }
export interface StairModelInput {
  nodes: ReadonlyMap<number, { x: number; y: number; z?: number }>;
  quads: ReadonlyMap<number, StairShell>;
  entries: readonly StairEntry[];
  levelAt?: (z: number) => string;
  /** The live load a stair takes where the project states none, kN/m². */
  live: number;
}

/** A shell this steep or more, and this shallow or less, is a flight, degrees. */
export const FLIGHT_SLOPE = { min: 15, max: 50 } as const;
/** The riser presumed for a flight the model gives no steps for, m. */
export const PRESUMED_RISER = 0.175;
/** A landing read past this length is a floor, m: the landing is taken this long. */
const LANDING_MAX = 3;
const TOL = 0.02;

type P = { x: number; y: number; z: number };
const pt = (m: StairModelInput, id: number): P | null => { const n = m.nodes.get(id); return n ? { x: n.x, y: n.y, z: n.z ?? 0 } : null; };

function normalOf(ps: readonly P[]): { x: number; y: number; z: number } | null {
  if (ps.length < 3) return null;
  const [a, b, c] = [ps[0]!, ps[1]!, ps[ps.length - 1]!];
  const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, v = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
  const n = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
  const l = Math.hypot(n.x, n.y, n.z);
  if (l < 1e-12) return null;
  const s = n.z < 0 ? -1 : 1;
  return { x: (s * n.x) / l, y: (s * n.y) / l, z: (s * n.z) / l };
}

const slopeDeg = (n: { z: number }) => (Math.acos(Math.min(1, Math.abs(n.z))) * 180) / Math.PI;

/** Shells joined by a node and alike by `same`, in groups. */
function groups(ids: readonly number[], m: StairModelInput, same: (a: number, b: number) => boolean): number[][] {
  const byNode = new Map<number, number[]>();
  for (const id of ids) for (const n of m.quads.get(id)!.nodes) byNode.set(n, [...(byNode.get(n) ?? []), id]);
  const seen = new Set<number>(), out: number[][] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const g: number[] = [], stack = [id];
    seen.add(id);
    while (stack.length) {
      const q = stack.pop()!;
      g.push(q);
      for (const n of m.quads.get(q)!.nodes) for (const o of byNode.get(n) ?? []) if (!seen.has(o) && same(q, o)) { seen.add(o); stack.push(o); }
    }
    out.push(g.sort((a, b) => a - b));
  }
  return out;
}

/** The demands of every stair the project has: the desk's, then each flight of the model not linked to one. */
export function stairDemands(m: StairModelInput): StairDemand[] {
  const normals = new Map<number, { x: number; y: number; z: number }>();
  for (const q of m.quads.values()) { const ps = q.nodes.map((n) => pt(m, n)).filter((p): p is P => !!p); const n = ps.length === q.nodes.length ? normalOf(ps) : null; if (n) normals.set(q.id, n); }
  const linked = new Set(m.entries.flatMap((e) => e.analysisQuads ?? []));
  const inclined = [...normals].filter(([id, n]) => { const s = slopeDeg(n); return s >= FLIGHT_SLOPE.min && s <= FLIGHT_SLOPE.max && !linked.has(id); }).map(([id]) => id);
  const level = [...normals].filter(([, n]) => slopeDeg(n) < 2).map(([id]) => id);
  const parallel = (a: number, b: number) => { const p = normals.get(a)!, q = normals.get(b)!; return p.x * q.x + p.y * q.y + p.z * q.z > 0.995; };
  const out: StairDemand[] = [];
  for (const e of m.entries) {
    const place = flightPlace(m, (e.analysisQuads ?? []).filter((id) => m.quads.has(id)), normals);
    out.push({ key: `stair:${e.id}`, name: e.name, ...(place && m.levelAt ? { level: m.levelAt(place.z) } : {}), source: 'desk', spec: specOf(e), place: place ? { x: place.x, y: place.y, z: place.z, dir: place.dir } : null, quads: [...(e.analysisQuads ?? [])], presumed: [] });
  }
  let k = 0;
  for (const g of groups(inclined, m, parallel)) {
    const f = flightPlace(m, g, normals);
    if (!f) continue;
    const landing = (z: number, side: -1 | 1) => landingLength(m, level, f, z, side);
    const lb = landing(f.z, -1), lt = landing(f.z + f.rise, 1);
    const steps = Math.max(2, Math.round(f.rise / PRESUMED_RISER)), riser = f.rise / steps, tread = f.run / (steps - 1);
    const waist = Math.min(...g.map((id) => m.quads.get(id)!.thickness));
    const spec: StairDesignSpec = {
      riser, tread, steps, waist, width: f.width,
      landingBottom: lb.length, landingTop: lt.length, ...(lb.thickness ?? lt.thickness ? { landingThickness: (lb.thickness ?? lt.thickness)! } : {}),
      ends: 'monolithic', finishes: 1, live: m.live,
    };
    k++;
    out.push({
      key: `stair:q${g[0]}`, name: `E${m.entries.length + k}`, ...(m.levelAt ? { level: m.levelAt(f.z) } : {}), source: 'model', spec,
      place: { x: f.x, y: f.y, z: f.z, dir: f.dir }, quads: g,
      presumed: ['rcSheets.stair.presumedRiser', 'rcSheets.stair.presumedEnds', 'rcSheets.stair.presumedLoads'],
    });
  }
  return out;
}

const specOf = (e: StairEntry): StairDesignSpec => ({
  riser: e.riser, tread: e.tread, steps: e.steps, waist: e.waist, width: e.width, landingBottom: e.landingBottom, landingTop: e.landingTop,
  ...(e.landingThickness !== undefined ? { landingThickness: e.landingThickness } : {}), ends: e.ends, finishes: e.finishes, live: e.live,
});

interface FlightPlace { x: number; y: number; z: number; dir: { x: number; y: number }; run: number; rise: number; width: number; s0: number; s1: number; w0: number; w1: number }

/** A flight's foot in plan and height, the way up its run, and its run, rise and width, m. */
function flightPlace(m: StairModelInput, ids: readonly number[], normals: ReadonlyMap<number, { x: number; y: number; z: number }>): FlightPlace | null {
  if (!ids.length) return null;
  const n = ids.map((id) => normals.get(id)).find(Boolean);
  if (!n) return null;
  const l = Math.hypot(n.x, n.y);
  if (l < 1e-9) return null;
  const dir = { x: -n.x / l, y: -n.y / l }, across = { x: -dir.y, y: dir.x };
  const ps = [...new Set(ids.flatMap((id) => m.quads.get(id)!.nodes))].map((id) => pt(m, id)).filter((p): p is P => !!p);
  const s = ps.map((p) => p.x * dir.x + p.y * dir.y), w = ps.map((p) => p.x * across.x + p.y * across.y), z = ps.map((p) => p.z);
  const s0 = Math.min(...s), s1 = Math.max(...s), w0 = Math.min(...w), w1 = Math.max(...w), wm = (w0 + w1) / 2;
  return { x: s0 * dir.x + wm * across.x, y: s0 * dir.y + wm * across.y, z: Math.min(...z), dir, run: s1 - s0, rise: Math.max(...z) - Math.min(...z), width: w1 - w0, s0, s1, w0, w1 };
}

/** The level shells at height `z` that the flight's foot (side −1) or head (+1) meets, read within its width: how far they reach from it, m, and their thickness. */
function landingLength(m: StairModelInput, level: readonly number[], f: FlightPlace, z: number, side: -1 | 1): { length: number; thickness?: number } {
  const across = { x: -f.dir.y, y: f.dir.x };
  const sOf = (p: P) => p.x * f.dir.x + p.y * f.dir.y, wOf = (p: P) => p.x * across.x + p.y * across.y;
  const edge = side < 0 ? f.s0 : f.s1;
  let reach = 0, thickness: number | undefined;
  for (const id of level) {
    const q = m.quads.get(id)!, ps = q.nodes.map((n) => pt(m, n)).filter((p): p is P => !!p);
    if (!ps.length || Math.abs(ps[0]!.z - z) > TOL) continue;
    const inside = ps.every((p) => wOf(p) >= f.w0 - TOL && wOf(p) <= f.w1 + TOL && side * (sOf(p) - edge) >= -TOL);
    if (!inside) continue;
    const far = Math.max(...ps.map((p) => side * (sOf(p) - edge)));
    if (far > reach) { reach = far; thickness = q.thickness; }
  }
  return { length: Math.round(Math.min(reach, LANDING_MAX) * 1000) / 1000, ...(thickness !== undefined ? { thickness } : {}) };
}
