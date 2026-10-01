/**
 * CIRSOC 102-2025 Cap. 5, components and cladding of buildings with h ≤ 20 m (Parte 1,
 * `docs/codes/CIRSOC/markdown/cirsoc-102-2025`, capítulo 5):
 *
 *   p = qh [(GCp) − (GCpi)]                                           (5.3-1)
 *
 * with both signs of (GCpi), and no less than 0,80 kN/m² either way (§5.2.2). (GCp) depends on
 * the zone and the effective wind area A. The figures are graphs; the commentary gives them as
 * equations (Tablas C 5.3-1 to C 5.3-5), a plateau up to a first area, linear in log A to a
 * second, a plateau after. Each segment meets the next, so a zone is written as its two corners.
 *
 *   walls (Fig. 5.3-1): zones 4 and 5, reduced 10 % when the roof slope is 10° or less (note 5);
 *   gable roofs: θ ≤ 7° (Fig. 5.3-2A, zones 1', 1, 2, 3), 7° < θ ≤ 20° (5.3-2B), 20° < θ ≤ 27°
 *   (5.3-2C), 27° < θ ≤ 45° (5.3-2D), zones 1, 2, 3, without overhangs.
 *
 * The edge distance a (Fig. 5.3-1, and 5.3-2B to G): 10 % of the least horizontal dimension or
 * 0,4 h, the lesser, but no less than 4 % of that dimension nor 1 m; a building of θ ≤ 7° wider
 * than 90 m keeps a ≤ 0,8 h. Figura 5.3-2A states its zones only in its drawing, so on a roof of
 * θ ≤ 7° no a is given.
 *
 * Not covered: h > 20 m (Figura 5.4-1 is a graph with no equations), hip, monoslope, stepped,
 * multispan, sawtooth roofs, domes, overhangs and parapets.
 *
 * Pure: no store.
 */
import { clause, type ClauseRef } from '../regulation';

export const REF_CC = clause('cirsoc-102', '2025', '5.3.2', 'componentes y revestimientos, h ≤ 20 m');
export const REF_CC_MIN = clause('cirsoc-102', '2025', '5.2.2', 'presión neta mínima de diseño');

/** A zone's (GCp): value v0 up to area a0, v1 from area a1, linear in log A between. */
type Curve = [a0: number, v0: number, a1: number, v1: number];
const C = (a0: number, v0: number, a1: number, v1: number): Curve => [a0, v0, a1, v1];

export function gcpOf(c: Curve, areaM2: number): number {
  const [a0, v0, a1, v1] = c;
  if (areaM2 <= a0) return v0;
  if (areaM2 >= a1) return v1;
  return v0 + ((v1 - v0) * Math.log10(areaM2 / a0)) / Math.log10(a1 / a0);
}

export type CladdingZone = '4' | '5' | "1'" | '1' | '2' | '3';
interface ZoneSet { zones: CladdingZone[]; pos: Partial<Record<CladdingZone, Curve>>; neg: Partial<Record<CladdingZone, Curve>> }

/** Tabla C 5.3-1. */
const WALLS: ZoneSet = {
  zones: ['4', '5'],
  pos: { '4': C(1, 1.0, 50, 0.7), '5': C(1, 1.0, 50, 0.7) },
  neg: { '4': C(1, -1.1, 50, -0.8), '5': C(1, -1.4, 50, -0.8) },
};
/** Tablas C 5.3-2 to C 5.3-5, by slope. */
const ROOFS: ReadonlyArray<{ upTo: number; set: ZoneSet }> = [
  { upTo: 7, set: {
    zones: ["1'", '1', '2', '3'],
    pos: { "1'": C(1, 0.3, 10, 0.2), '1': C(1, 0.3, 10, 0.2), '2': C(1, 0.3, 10, 0.2), '3': C(1, 0.3, 10, 0.2) },
    neg: { "1'": C(10, -0.9, 100, -0.4), '1': C(1, -1.7, 50, -1.0), '2': C(1, -2.3, 50, -1.4), '3': C(1, -3.2, 50, -1.4) },
  } },
  { upTo: 20, set: {
    zones: ['1', '2', '3'],
    pos: { '1': C(1, 0.6, 20, 0.3), '2': C(1, 0.6, 20, 0.3), '3': C(1, 0.6, 20, 0.3) },
    neg: { '1': C(2, -2.0, 30, -0.5), '2': C(1, -2.7, 20, -1.0), '3': C(1, -3.6, 10, -1.8) },
  } },
  { upTo: 27, set: {
    zones: ['1', '2', '3'],
    pos: { '1': C(1, 0.6, 20, 0.3), '2': C(1, 0.6, 20, 0.3), '3': C(1, 0.6, 20, 0.3) },
    neg: { '1': C(1, -1.5, 20, -0.8), '2': C(1, -2.5, 10, -1.2), '3': C(1, -3.0, 10, -1.4) },
  } },
  { upTo: 45, set: {
    zones: ['1', '2', '3'],
    pos: { '1': C(1, 0.9, 20, 0.5), '2': C(1, 0.9, 20, 0.5), '3': C(1, 0.9, 20, 0.5) },
    neg: { '1': C(1, -1.8, 10, -0.8), '2': C(1, -2.0, 20, -1.0), '3': C(1, -2.5, 20, -1.0) },
  } },
];

export interface CladdingInputs {
  /** Velocity pressure at mean roof height, N/m² (with Kd of components, 0,85). */
  qhNm2: number;
  meanRoofHeight: number;
  /** Least horizontal dimension of the building, m. */
  leastDimension: number;
  roofSlopeDeg: number;
  /** |(GCpi)| of the enclosure (Tabla 1.11-1). */
  gcpi: number;
  /** Effective wind area of the element, m². */
  areaM2: number;
}

export interface CladdingRow { surface: 'wall' | 'roof'; zone: CladdingZone; gcpPos: number; gcpNeg: number; pPos: number; pNeg: number }

export interface CladdingResult {
  refused?: 'height' | 'slope';
  /** Edge distance a of the walls' zone 5, m (Fig. 5.3-1). */
  aWalls: number | null;
  /** The roof's, m; null on θ ≤ 7°, where Figura 5.3-2A only draws it. */
  aRoof: number | null;
  rows: CladdingRow[];
  refs: ClauseRef[];
}

export function claddingPressures(i: CladdingInputs): CladdingResult {
  const refs = [REF_CC, REF_CC_MIN];
  if (i.meanRoofHeight > 20) return { refused: 'height', aWalls: null, aRoof: null, rows: [], refs };
  const roof = ROOFS.find((r) => i.roofSlopeDeg <= r.upTo);
  if (!roof) return { refused: 'slope', aWalls: null, aRoof: null, rows: [], refs };
  const h = i.meanRoofHeight, d = i.leastDimension;
  let a = Math.max(Math.min(0.1 * d, 0.4 * h), 0.04 * d, 1);
  if (i.roofSlopeDeg <= 7 && d > 90) a = Math.min(a, 0.8 * h);
  const qh = i.qhNm2 / 1000;
  const wallFactor = i.roofSlopeDeg <= 10 ? 0.9 : 1;
  const row = (surface: 'wall' | 'roof', set: ZoneSet, z: CladdingZone, k: number): CladdingRow => {
    const gp = gcpOf(set.pos[z]!, i.areaM2) * k, gn = gcpOf(set.neg[z]!, i.areaM2) * k;
    return {
      surface, zone: z, gcpPos: gp, gcpNeg: gn,
      pPos: Math.max(qh * (gp + i.gcpi), 0.8), pNeg: Math.min(qh * (gn - i.gcpi), -0.8),
    };
  };
  const rows = [
    ...WALLS.zones.map((z) => row('wall', WALLS, z, wallFactor)),
    ...roof.set.zones.map((z) => row('roof', roof.set, z, 1)),
  ];
  // Figura 5.3-2A draws its zones without stating a.
  return { aWalls: a, aRoof: i.roofSlopeDeg <= 7 ? null : a, rows, refs };
}
