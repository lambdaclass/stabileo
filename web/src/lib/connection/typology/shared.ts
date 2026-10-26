/** What every typology uses: vectors, bolt and weld strengths from the clause modules, parts, the state. */
import { boltAreaCm2, nominalShearMPa, nominalTensionMPa, type BoltGrade } from '../bolted-joint';
import { designFilletWeld } from '../fillet-weld';
import type { Part, TypologyCheck, TypologyState, V3 } from './types';

export const v = (x: number, y: number, z: number): V3 => ({ x, y, z });
export const add = (a: V3, b: V3): V3 => v(a.x + b.x, a.y + b.y, a.z + b.z);
export const scale = (a: V3, k: number): V3 => v(a.x * k, a.y * k, a.z * k);
export const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: V3, b: V3): V3 => v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const norm = (a: V3): V3 => { const l = Math.hypot(a.x, a.y, a.z) || 1; return scale(a, 1 / l); };
/** A horizontal unit vector across `d` (the lateral of a member), or global Y for a vertical one. */
export const lateral = (d: V3): V3 => { const h = cross(v(0, 0, 1), d); return Math.hypot(h.x, h.y, h.z) < 1e-6 ? v(0, 1, 0) : norm(h); };
export const Z = v(0, 0, 1);

/** Standard hole, Tabla J.3.3: d + 2 mm up to Ø24, d + 3 mm above. */
export const holeOf = (d: number) => d + (d <= 24 ? 2 : 3);

/** One bolt's design shear and tension, kN (Tabla J.3.2, threads included, φ = 0,75). */
export function boltStrength(d: number, grade: BoltGrade, planes = 1) {
  const Ab = boltAreaCm2(d);
  return { shear: 0.75 * (nominalShearMPa(grade, 'included') ?? 0) * Ab * planes / 10, tension: 0.75 * nominalTensionMPa(grade) * Ab / 10, Fnt: nominalTensionMPa(grade), Fnv: nominalShearMPa(grade, 'included') ?? 0, Ab };
}

/** Bearing of one bolt on a part, J.3.10 with deformation at service a concern: φ = 0,75, 2,4·d·t·Fu. */
export const bearing = (d: number, t: number, Fu: number) => 0.75 * 2.4 * d * t * Fu / 1000;

/**
 * A fillet weld's strength and size checks, as rows (designFilletWeld, §J.2). The maximum size of
 * J.2.2(b) is a rule for fillets along the EDGE of a part (a lap joint); the joints here are T-joints,
 * where it does not apply, so it is asked for only when `alongEdge`.
 */
export function weldRows(i: { leg: number; length: number; runs: number; thicker: number; thinner: number; demand: number; label: string; alongEdge?: boolean }): TypologyCheck[] {
  const w = designFilletWeld({ legMm: i.leg, lengthMm: i.length, runs: i.runs, fexxMPa: 480, thickerPartMm: i.thicker, thinnerPartMm: i.thinner, demandKN: i.demand });
  const out: TypologyCheck[] = [];
  for (const c of w.checks) {
    if (c.value === null || c.limit === null) continue;
    if (c.id === 'strength') out.push(row(`J.2.4`, `${i.label}`, c.value, c.limit, 'kN'));
    if (c.id === 'minimumSize') out.push(row('Tabla J.2.4', 'joint.typ.check.weldMin', c.limit, c.value, 'mm'));
    if (c.id === 'maximumSize' && i.alongEdge) out.push(row('J.2.2(b)', 'joint.typ.check.weldMax', c.value, c.limit, 'mm'));
  }
  return out;
}

export const row = (key: string, labelKey: string, demand: number, capacity: number, unit: string): TypologyCheck =>
  ({ key, labelKey, demand, capacity, unit, ratio: capacity > 0 ? demand / capacity : demand > 0 ? Infinity : 0 });

export const stateOf = (checks: readonly TypologyCheck[]): TypologyState => (checks.every((c) => c.ratio <= 1 + 1e-9) ? 'designed' : 'exceeded');

export const box = (kind: Part['kind'], center: V3, u: V3, w: V3, size: [number, number, number]): Part => ({ kind, center, u, v: w, size });

/** Bolts as small boxes along the plate normal: a shank of the plate stack and the head. */
export function boltParts(centres: V3[], normal: V3, d: number, grip: number): Part[] {
  const u = lateral(normal), w = norm(cross(normal, u));
  return centres.map((c) => box('bolt', c, u, w, [d / 1000, d / 1000, grip / 1000 + 2 * 0.7 * d / 1000]));
}
