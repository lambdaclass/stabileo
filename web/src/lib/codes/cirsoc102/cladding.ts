/**
 * CIRSOC 102-2025 Cap. 5, components and cladding (`docs/codes/CIRSOC/markdown/cirsoc-102-2025`,
 * capítulo 5).
 *
 * ── Parte 1, h ≤ 20 m (§5.3) ──────────────────────────────────────
 *
 *   p = qh [(GCp) − (GCpi)]                                           (5.3-1)
 *
 * with both signs of (GCpi), and no less than 0,80 kN/m² either way (§5.2.2). (GCp) depends on
 * the zone and the effective wind area A. The figures are graphs; the commentary gives most of
 * them as equations (Tablas C 5.3-1 to C 5.3-8), a plateau up to a first area, linear in log A to
 * a second, a plateau after:
 *
 *   walls (Fig. 5.3-1): zones 4 and 5, reduced 10 % when the roof slope is 10° or less (note 5);
 *   gable roofs: θ ≤ 7° (Fig. 5.3-2A, zones 1', 1, 2, 3), 7° < θ ≤ 20° (5.3-2B), 20° < θ ≤ 27°
 *   (5.3-2C), 27° < θ ≤ 45° (5.3-2D), zones 1, 2, 3, without overhangs;
 *   hip roofs: 7° < θ ≤ 20° (5.3-2E), 20° < θ ≤ 27° (5.3-2F), and 45° (5.3-2G, which its commentary
 *   gives for that slope only); flatter ones as Fig. 5.3-2A.
 *
 * Monoslope roofs (Figs. 5.3-5A, 3° < θ ≤ 10°, zones 1, 2, 2', 3, 3', and 5.3-5B, 10° < θ ≤ 30°,
 * zones 1, 2, 3) and sawtooth roofs (Fig. 5.3-6, 10° < θ ≤ 45°, zones 1, 2 and 3, the last
 * different on the first span, A, and the others, B to D) have no equations in the commentary:
 * their curves were read from the figures' images, corner by corner, and match the source
 * standard's. Below their first slope, both take Fig. 5.3-2A.
 *
 * The edge distance a (Fig. 5.3-1, and 5.3-2B to G): 10 % of the least horizontal dimension or
 * 0,4 h, the lesser, but no less than 4 % of that dimension nor 1 m; a building of θ ≤ 7° wider
 * than 90 m keeps a ≤ 0,8 h. Figura 5.3-2A states its zones only in its drawing, so on a roof of
 * θ ≤ 7° no a is given.
 *
 * ── Parte 2, h > 20 m (§5.4) ──────────────────────────────────────
 *
 *   p = q (GCp) − qi (GCpi)                                           (5.4-1)
 *
 * with q = qz for positive (GCp) on walls and qh otherwise, qi = qh. (GCp) from Fig. 5.4-1 for
 * walls (zones 4 and 5) and roofs of θ ≤ 7° (zones 1, 2, 3, suction only; with a parapet of 1 m or
 * more on a roof of θ ≤ 10°, zone 3 is taken as zone 2, note 7), read from the figure like the
 * monoslope's; roofs of θ > 7° take the gable and hip figures of Parte 1 and the monoslope ones,
 * with qh. a is 10 % of the least horizontal dimension, no less than 1 m. A building under 30 m
 * no taller than its least horizontal dimension may use Parte 1 instead (§5.4).
 *
 * Not covered: sawtooth roofs above 20 m (§5.4.2 lists no figure for them), stepped, multispan,
 * domed and vaulted roofs, overhangs and parapets as elements.
 *
 * Pure: no store.
 */
import { clause, type ClauseRef } from '../regulation';

export const REF_CC = clause('cirsoc-102', '2025', '5.3.2', 'componentes y revestimientos, h ≤ 20 m');
export const REF_CC_HIGH = clause('cirsoc-102', '2025', '5.4.2', 'componentes y revestimientos, h > 20 m');
export const REF_CC_MIN = clause('cirsoc-102', '2025', '5.2.2', 'presión neta mínima de diseño');

/**
 * A zone's (GCp) as the corners of its curve: [A, value] pairs, the value constant before the
 * first and after the last, linear in log A between. Two corners are the usual plateau, slope,
 * plateau; the sawtooth's first span has three.
 */
type Curve = ReadonlyArray<readonly [number, number]>;
const C = (a0: number, v0: number, a1: number, v1: number): Curve => [[a0, v0], [a1, v1]];
const NONE: Curve = [[1, 0]];

/** (GCp) of a curve at an area; `[a0, v0, a1, v1]` is the two-corner curve. */
export function gcpOf(c: Curve | readonly [number, number, number, number], areaM2: number): number {
  const pts: Curve = typeof c[0] === 'number' ? C(...(c as [number, number, number, number])) : (c as Curve);
  if (areaM2 <= pts[0]![0]) return pts[0]![1];
  for (let k = 1; k < pts.length; k++) {
    const [a0, v0] = pts[k - 1]!, [a1, v1] = pts[k]!;
    if (areaM2 <= a1) return v0 + ((v1 - v0) * Math.log10(areaM2 / a0)) / Math.log10(a1 / a0);
  }
  return pts[pts.length - 1]![1];
}

export type CladdingZone = '4' | '5' | "1'" | '1' | '2' | "2'" | '3' | "3'" | '3A' | '3BCD';
interface ZoneSet { zones: CladdingZone[]; pos: Partial<Record<CladdingZone, Curve>>; neg: Partial<Record<CladdingZone, Curve>> }
const all = (zones: CladdingZone[], c: Curve) => Object.fromEntries(zones.map((z) => [z, c])) as Partial<Record<CladdingZone, Curve>>;

/** Tabla C 5.3-1. */
const WALLS: ZoneSet = {
  zones: ['4', '5'],
  pos: { '4': C(1, 1.0, 50, 0.7), '5': C(1, 1.0, 50, 0.7) },
  neg: { '4': C(1, -1.1, 50, -0.8), '5': C(1, -1.4, 50, -0.8) },
};
/** Fig. 5.3-2A, Tabla C 5.3-2. */
const FLAT: ZoneSet = {
  zones: ["1'", '1', '2', '3'],
  pos: all(["1'", '1', '2', '3'], C(1, 0.3, 10, 0.2)),
  neg: { "1'": C(10, -0.9, 100, -0.4), '1': C(1, -1.7, 50, -1.0), '2': C(1, -2.3, 50, -1.4), '3': C(1, -3.2, 50, -1.4) },
};
const Z123: CladdingZone[] = ['1', '2', '3'];
/** Tablas C 5.3-3 to C 5.3-5, by slope. */
const GABLE: ReadonlyArray<{ upTo: number; set: ZoneSet }> = [
  { upTo: 7, set: FLAT },
  { upTo: 20, set: { zones: Z123, pos: all(Z123, C(1, 0.6, 20, 0.3)),
    neg: { '1': C(2, -2.0, 30, -0.5), '2': C(1, -2.7, 20, -1.0), '3': C(1, -3.6, 10, -1.8) } } },
  { upTo: 27, set: { zones: Z123, pos: all(Z123, C(1, 0.6, 20, 0.3)),
    neg: { '1': C(1, -1.5, 20, -0.8), '2': C(1, -2.5, 10, -1.2), '3': C(1, -3.0, 10, -1.4) } } },
  { upTo: 45, set: { zones: Z123, pos: all(Z123, C(1, 0.9, 20, 0.5)),
    neg: { '1': C(1, -1.8, 10, -0.8), '2': C(1, -2.0, 20, -1.0), '3': C(1, -2.5, 20, -1.0) } } },
];
/** Tablas C 5.3-6 to C 5.3-8; 5.3-2G is for 45° only. */
const HIP_POS = C(1, 0.7, 10, 0.3);
const HIP: ReadonlyArray<{ from: number; upTo: number; set: ZoneSet }> = [
  { from: -1, upTo: 7, set: FLAT },
  { from: 7, upTo: 20, set: { zones: Z123, pos: all(Z123, HIP_POS),
    neg: { '1': C(2, -1.8, 20, -0.8), '2': C(1, -2.4, 20, -1.3), '3': C(1, -2.6, 20, -1.4) } } },
  { from: 20, upTo: 27, set: { zones: Z123, pos: all(Z123, HIP_POS),
    neg: { '1': C(1, -1.4, 20, -0.8), '2': C(1, -2.0, 20, -1.0), '3': C(1, -2.0, 20, -1.0) } } },
  { from: 44.5, upTo: 45.5, set: { zones: Z123, pos: all(Z123, HIP_POS),
    neg: { '1': C(1, -1.5, 20, -0.7), '2': C(1, -1.8, 20, -0.8), '3': C(1, -2.4, 20, -1.0) } } },
];
/** Figs. 5.3-5A and 5.3-5B, read from the figures. */
const MONO: ReadonlyArray<{ upTo: number; set: ZoneSet }> = [
  { upTo: 3, set: FLAT },
  { upTo: 10, set: { zones: ['1', '2', "2'", '3', "3'"], pos: all(['1', '2', "2'", '3', "3'"], C(1, 0.3, 10, 0.2)),
    neg: { '1': C(1, -1.1, 10, -1.1), '2': C(1, -1.3, 10, -1.2), "2'": C(1, -1.6, 10, -1.5), '3': C(1, -1.8, 10, -1.2), "3'": C(1, -2.6, 10, -1.6) } } },
  { upTo: 30, set: { zones: Z123, pos: all(Z123, C(1, 0.4, 10, 0.3)),
    neg: { '1': C(1, -1.3, 10, -1.1), '2': C(1, -1.6, 10, -1.2), '3': C(1, -2.9, 10, -2.0) } } },
];
/** Fig. 5.3-6, read from the figure. */
const SAWTOOTH: ReadonlyArray<{ upTo: number; set: ZoneSet }> = [
  { upTo: 10, set: FLAT },
  { upTo: 45, set: { zones: ['1', '2', '3A', '3BCD'],
    pos: { '1': C(1, 0.7, 50, 0.4), '2': C(1, 1.1, 10, 0.8), '3A': C(1, 0.8, 10, 0.7), '3BCD': C(1, 0.8, 10, 0.7) },
    neg: { '1': C(1, -2.2, 50, -1.1), '2': C(1, -3.2, 50, -1.6), '3A': [[1, -4.1], [10, -3.7], [50, -2.1]], '3BCD': C(10, -2.6, 50, -1.9) } } },
];
/** Fig. 5.4-1, read from the figure. */
const WALLS_HIGH: ZoneSet = {
  zones: ['4', '5'],
  pos: { '4': C(2, 0.9, 50, 0.6), '5': C(2, 0.9, 50, 0.6) },
  neg: { '4': C(2, -0.9, 50, -0.7), '5': C(2, -1.8, 50, -1.0) },
};
const ROOF_HIGH: ZoneSet = {
  zones: Z123, pos: all(Z123, NONE),
  neg: { '1': C(1, -1.4, 50, -0.9), '2': C(1, -2.3, 50, -1.6), '3': C(1, -3.2, 50, -2.3) },
};

export type CladdingRoof = 'gable' | 'hip' | 'monoslope' | 'sawtooth';

export interface CladdingInputs {
  /** Velocity pressure at mean roof height, N/m² (with Kd of components, 0,85). */
  qhNm2: number;
  /** Velocity pressure at the element's height, N/m², for the positive wall pressures above 20 m. */
  qzNm2?: number;
  meanRoofHeight: number;
  /** Least horizontal dimension of the building, m. */
  leastDimension: number;
  roofSlopeDeg: number;
  /** Absent: a gable roof. */
  roof?: CladdingRoof;
  /** A parapet of 1 m or more around the roof (Fig. 5.4-1, note 7). */
  parapet?: boolean;
  /** Above 20 m, take Parte 1 where §5.4 allows it (h < 30 m and h no more than the least dimension). */
  lowRise?: boolean;
  /** |(GCpi)| of the enclosure (Tabla 1.11-1). */
  gcpi: number;
  /** Effective wind area of the element, m². */
  areaM2: number;
}

export interface CladdingRow { surface: 'wall' | 'roof'; zone: CladdingZone; gcpPos: number | null; gcpNeg: number; pPos: number; pNeg: number }

export interface CladdingResult {
  refused?: 'slope' | 'kind';
  /** Which part of Cap. 5 the table comes from. */
  part: 1 | 2;
  /** Above 20 m, whether §5.4 lets the building take Parte 1. */
  lowRiseAllowed: boolean;
  /** Edge distance a of the walls' zone 5, m (Fig. 5.3-1). */
  aWalls: number | null;
  /** The roof's, m; null on θ ≤ 7°, where Figura 5.3-2A only draws it. */
  aRoof: number | null;
  rows: CladdingRow[];
  refs: ClauseRef[];
}

function roofSet(kind: CladdingRoof, slope: number): ZoneSet | null {
  if (kind === 'hip') return HIP.find((r) => slope > r.from && slope <= r.upTo)?.set ?? null;
  const table = kind === 'monoslope' ? MONO : kind === 'sawtooth' ? SAWTOOTH : GABLE;
  return table.find((r) => slope <= r.upTo)?.set ?? null;
}

export function claddingPressures(i: CladdingInputs): CladdingResult {
  const h = i.meanRoofHeight, d = i.leastDimension, kind = i.roof ?? 'gable';
  const lowRiseAllowed = h > 20 && h < 30 && h <= d;
  const part: 1 | 2 = h <= 20 || (i.lowRise && lowRiseAllowed) ? 1 : 2;
  const refs = [part === 1 ? REF_CC : REF_CC_HIGH, REF_CC_MIN];
  const base = { part, lowRiseAllowed, aWalls: null, aRoof: null, rows: [], refs };
  const qh = i.qhNm2 / 1000, qz = (i.qzNm2 ?? i.qhNm2) / 1000;

  let walls: ZoneSet, roof: ZoneSet | null, a: number, wallFactor = 1;
  if (part === 1) {
    roof = roofSet(kind, i.roofSlopeDeg);
    a = Math.max(Math.min(0.1 * d, 0.4 * h), 0.04 * d, 1);
    if (i.roofSlopeDeg <= 7 && d > 90) a = Math.min(a, 0.8 * h);
    walls = WALLS;
    wallFactor = i.roofSlopeDeg <= 10 ? 0.9 : 1;
  } else {
    if (kind === 'sawtooth' && i.roofSlopeDeg > 10) return { ...base, refused: 'kind' };
    roof = i.roofSlopeDeg <= 7 ? ROOF_HIGH : kind === 'sawtooth' ? null : roofSet(kind, i.roofSlopeDeg);
    if (roof === ROOF_HIGH && i.parapet && i.roofSlopeDeg <= 10) {
      roof = { ...roof, neg: { ...roof.neg, '3': roof.neg['2'] } };
    }
    a = Math.max(0.1 * d, 1);
    walls = WALLS_HIGH;
  }
  if (!roof) return { ...base, refused: 'slope' };
  const row = (surface: 'wall' | 'roof', set: ZoneSet, z: CladdingZone, k: number): CladdingRow => {
    const posCurve = set.pos[z] ?? NONE;
    const gp = posCurve === NONE ? null : gcpOf(posCurve, i.areaM2) * k;
    const gn = gcpOf(set.neg[z]!, i.areaM2) * k;
    // Above 20 m a positive wall pressure takes qz; everything else qh, and the inside qh.
    const qPos = part === 2 && surface === 'wall' ? qz : qh;
    return {
      surface, zone: z, gcpPos: gp, gcpNeg: gn,
      pPos: Math.max(qPos * (gp ?? 0) + qh * i.gcpi, 0.8), pNeg: Math.min(qh * gn - qh * i.gcpi, -0.8),
    };
  };
  const rows = [
    ...walls.zones.map((z) => row('wall', walls, z, wallFactor)),
    ...roof.zones.map((z) => row('roof', roof!, z, 1)),
  ];
  // Figura 5.3-2A draws its zones without stating a.
  return { ...base, aWalls: a, aRoof: part === 1 && roof === FLAT ? null : a, rows };
}
