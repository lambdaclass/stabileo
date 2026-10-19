/**
 * Pre-sizing a footing from its service reactions and the soil's allowable pressure: a size to
 * start the design from, rounded up to 5 cm, with what it assumes said.
 *
 * The net pressure the soil can take is the allowable less the footing's own weight. An isolated
 * footing under its column is square, or keeps an even overhang round a rectangular column. One
 * held at a property line or a corner leaves its column off centre, and its size assumes a strap
 * beam takes the eccentricity, as a centred footing's bearing would not hold otherwise. A combined
 * footing is centred on the resultant of its columns; a strip runs the wall's length; a pile cap
 * takes as many piles as its load needs, its own weight included.
 */
import type { FootingKind } from '../../engine/detailing/foundation-check';
import type { PileLayout } from '../footing';
import { capPlan } from './piles';

export interface PresizeLoad { x: number; y: number; axial: number }

export interface PresizeInput {
  kind: FootingKind;
  /** The service axial at each supported node, the footing's own node first. */
  loads: PresizeLoad[];
  allowableKPa: number;
  thickness: number;
  /** The column's plan footprint along X and Y, m. */
  column?: { x: number; y: number };
  anchor?: [number, number];
  /** For a pile cap: one pile's allowable capacity, kN, its diameter and length. */
  pile?: { capacity: number; diameter: number; length: number };
  concreteUnitWeight?: number;
}

export type PresizeNote = 'strap' | 'strapBoth' | 'resultant' | 'capWeight';

export interface Presized {
  B: number; L: number; rotationDeg: number;
  eccentricityB: number; eccentricityL: number;
  piles?: PileLayout;
  /** Mean service pressure under it, kPa, its own weight included. */
  pressure: number;
  notes: PresizeNote[];
}

export type PresizeRefusal = 'noLoad' | 'thickness' | 'noPile';

const STEP = 0.05, MIN = 0.6, OVERHANG = 0.5;
const up = (v: number) => Math.max(MIN, Math.ceil(v / STEP - 1e-9) * STEP);

export function presizeFooting(i: PresizeInput): Presized | { refused: PresizeRefusal } {
  const N = i.loads.reduce((s, l) => s + l.axial, 0);
  if (!(N > 0) || i.loads.length === 0) return { refused: 'noLoad' };
  const gc = i.concreteUnitWeight ?? 25;
  const qNet = i.allowableKPa - gc * i.thickness;
  const notes: PresizeNote[] = [];

  if (i.kind === 'pileCap') {
    if (!i.pile || !(i.pile.capacity > 0)) return { refused: 'noPile' };
    const spacing = Math.max(3 * i.pile.diameter, 0.75);
    let count = Math.max(1, Math.ceil(N / i.pile.capacity));
    // The cap's weight goes onto the piles too: add piles until it fits.
    for (let k = 0; k < 20; k++) {
      const plan = capPlan({ count, diameter: i.pile.diameter, length: i.pile.length, spacing });
      const W = gc * plan.B * plan.L * i.thickness;
      if (count * i.pile.capacity >= N + W) break;
      count++;
    }
    const piles = { count, diameter: i.pile.diameter, length: i.pile.length, spacing };
    const plan = capPlan(piles);
    notes.push('capWeight');
    return { B: up(plan.B), L: up(plan.L), rotationDeg: 0, eccentricityB: 0, eccentricityL: 0, piles, pressure: 0, notes };
  }

  if (!(qNet > 0)) return { refused: 'thickness' };
  const A = N / qNet;
  const pressure = (B: number, L: number) => N / (B * L) + gc * i.thickness;

  if (i.kind === 'combined' || i.kind === 'strip') {
    // Along the line from the first support to the farthest one.
    const o = i.loads[0]!;
    const far = i.loads.reduce((f, l) => (Math.hypot(l.x - o.x, l.y - o.y) > Math.hypot(f.x - o.x, f.y - o.y) ? l : f), o);
    const len = Math.hypot(far.x - o.x, far.y - o.y);
    const th = len > 1e-9 ? Math.atan2(far.y - o.y, far.x - o.x) : 0;
    const u = [Math.cos(th), Math.sin(th)], v = [-Math.sin(th), Math.cos(th)];
    const s = i.loads.map((l) => (l.x - o.x) * u[0]! + (l.y - o.y) * u[1]!);
    const centre = i.kind === 'combined'
      ? i.loads.reduce((acc, l, k) => acc + l.axial * s[k]!, 0) / N
      : (Math.min(...s) + Math.max(...s)) / 2;
    const half = Math.max(...s.map((x) => Math.abs(x - centre))) + OVERHANG;
    const B = up(2 * half), L = up(A / B);
    const across = i.loads.reduce((acc, l) => acc + l.axial * ((l.x - o.x) * v[0]! + (l.y - o.y) * v[1]!), 0) / N;
    if (i.kind === 'combined') notes.push('resultant');
    return { B, L, rotationDeg: (th * 180) / Math.PI, eccentricityB: centre, eccentricityL: i.kind === 'combined' ? across : 0, pressure: pressure(B, L), notes };
  }

  const [ax, ay] = i.anchor ?? [0, 0];
  const cx = i.column?.x ?? 0, cy = i.column?.y ?? 0;
  let B: number, L: number;
  if (ax === 0 && ay === 0) {
    // An even overhang v round the column: (cx + 2v)(cy + 2v) = A.
    const b = 2 * (cx + cy), c = cx * cy - A;
    const v = Math.max(0, (-b + Math.sqrt(b * b - 16 * c)) / 8);
    B = up(cx + 2 * v); L = up(cy + 2 * v);
  } else if (ax !== 0 && ay !== 0) {
    B = L = up(Math.sqrt(A));
    notes.push('strapBoth');
  } else {
    // Twice as long along the line as across it.
    const across = Math.sqrt(A / 2);
    if (ax !== 0) { B = up(across); L = up(2 * across); } else { L = up(across); B = up(2 * across); }
    notes.push('strap');
  }
  return {
    B, L, rotationDeg: 0,
    // The column at the anchored side: the footing's centre is off it the other way.
    eccentricityB: ax ? -ax * (B / 2 - cx / 2) : 0,
    eccentricityL: ay ? -ay * (L / 2 - cy / 2) : 0,
    pressure: pressure(B, L), notes,
  };
}
