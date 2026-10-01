/**
 * CIRSOC 102-2025 — the coefficients for structures that are not closed buildings
 * (`docs/codes/CIRSOC/markdown/cirsoc-102-2025`, capítulos 2 y 4):
 *
 *   free roofs of open buildings, p = qh G CN (2.4-3), Figuras 2.4-4 to 2.4-7;
 *   solid freestanding walls and solid signs, F = qh G Cf As (4.4-1), Figura 4.4-1, cases A and B;
 *   open signs and lattice frameworks, F = qz G Cf Af (4.5-1), Figura 4.5-2;
 *   trussed towers, the same force, Figura 4.5-3;
 *   chimneys and tanks, the same force, Figura 4.5-1;
 *   and the minimum of §4.8, 0,8 kN/m² times Af.
 *
 * ── γ on a monoslope free roof ────────────────────────────────────
 *
 * Figura 2.4-4 gives γ = 0° and γ = 180° without saying, in the text, which way each blows. The
 * coefficients say it: at γ = 0° the net pressures are suctions (the wind enters under the roof
 * by its low edge and lifts it), at γ = 180° pressures (the wind meets the top surface tilted
 * toward it). So γ = 0° is the wind blowing from the low edge toward the high one.
 *
 * Pure: no store.
 */
import { clause } from '../regulation';

const R = (c: string, l?: string) => clause('cirsoc-102', '2025', c, l);
export const REF_FREE_ROOF = R('2.4.3', 'edificios abiertos con cubiertas aisladas');
export const REF_SIGN = R('4.4.1', 'paredes libres y carteles llenos');
export const REF_OTHER = R('4.5', 'otras estructuras');
export const REF_MIN_OTHER = R('4.8', 'fuerza de viento mínima de diseño');

export type FreeRoofKind = 'monoslope' | 'pitched' | 'troughed';
export type LoadCaseAB = 'A' | 'B';

type Row = [number, number, number, number]; // clear W, clear L, blocked W, blocked L
/** Figura 2.4-4, by θ: [A, B] for γ = 0° and for γ = 180°. */
const MONO: ReadonlyArray<{ theta: number; g0: [Row, Row]; g180: [Row, Row] }> = [
  { theta: 0, g0: [[1.2, 0.3, -0.5, -1.2], [-1.1, -0.1, -1.1, -0.6]], g180: [[1.2, 0.3, -0.5, -1.2], [-1.1, -0.1, -1.1, -0.6]] },
  { theta: 7.5, g0: [[-0.6, -1, -1, -1.5], [-1.4, 0, -1.7, -0.8]], g180: [[0.9, 1.5, -0.2, -1.2], [1.6, 0.3, 0.8, -0.3]] },
  { theta: 15, g0: [[-0.9, -1.3, -1.1, -1.5], [-1.9, 0, -2.1, -0.6]], g180: [[1.3, 1.6, 0.4, -1.1], [1.8, 0.6, 1.2, -0.3]] },
  { theta: 22.5, g0: [[-1.5, -1.6, -1.5, -1.7], [-2.4, -0.3, -2.3, -0.9]], g180: [[1.7, 1.8, 0.5, -1], [2.2, 0.7, 1.3, 0]] },
  { theta: 30, g0: [[-1.8, -1.8, -1.5, -1.8], [-2.5, -0.5, -2.3, -1.1]], g180: [[2.1, 2.1, 0.6, -1], [2.6, 1, 1.6, 0.1]] },
  { theta: 37.5, g0: [[-1.8, -1.8, -1.5, -1.8], [-2.4, -0.6, -2.2, -1.1]], g180: [[2.1, 2.2, 0.7, -0.9], [2.7, 1.1, 1.9, 0.3]] },
  { theta: 45, g0: [[-1.6, -1.8, -1.3, -1.8], [-2.3, -0.7, -1.9, -1.2]], g180: [[2.2, 2.5, 0.8, -0.9], [2.6, 1.4, 2.1, 0.4]] },
];
/** Figuras 2.4-5 (pitched) and 2.4-6 (troughed), by θ: [A, B]. */
const PITCHED: ReadonlyArray<{ theta: number; ab: [Row, Row] }> = [
  { theta: 7.5, ab: [[1.1, -0.3, -1.6, -1], [0.2, -1.2, -0.9, -1.7]] },
  { theta: 15, ab: [[1.1, -0.4, -1.2, -1], [0.1, -1.1, -0.6, -1.6]] },
  { theta: 22.5, ab: [[1.1, 0.1, -1.2, -1.2], [-0.1, -0.8, -0.8, -1.7]] },
  { theta: 30, ab: [[1.3, 0.3, -0.7, -0.7], [-0.1, -0.9, -0.2, -1.1]] },
  { theta: 37.5, ab: [[1.3, 0.6, -0.6, -0.6], [-0.2, -0.6, -0.3, -0.9]] },
  { theta: 45, ab: [[1.1, 0.9, -0.5, -0.5], [-0.3, -0.5, -0.3, -0.7]] },
];
const TROUGHED: ReadonlyArray<{ theta: number; ab: [Row, Row] }> = [
  { theta: 7.5, ab: [[-1.1, 0.3, -1.6, -0.5], [-0.2, 1.2, -0.9, -0.8]] },
  { theta: 15, ab: [[-1.1, 0.4, -1.2, -0.5], [0.1, 1.1, -0.6, -0.8]] },
  { theta: 22.5, ab: [[-1.1, -0.1, -1.2, -0.6], [-0.1, 0.8, -0.8, -0.8]] },
  { theta: 30, ab: [[-1.3, -0.3, -1.4, -0.4], [-0.1, 0.9, -0.2, -0.5]] },
  { theta: 37.5, ab: [[-1.3, -0.6, -1.4, -0.3], [0.2, 0.6, -0.3, -0.4]] },
  { theta: 45, ab: [[-1.1, -0.9, -1.2, -0.3], [0.3, 0.5, -0.3, -0.4]] },
];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function interpRows<T>(rows: ReadonlyArray<{ theta: number } & T>, theta: number, pick: (r: T) => Row): Row {
  const th = Math.min(rows[rows.length - 1]!.theta, Math.max(rows[0]!.theta, theta));
  let i = 0;
  while (i < rows.length - 2 && th > rows[i + 1]!.theta) i++;
  const a = rows[i]!, b = rows[i + 1]!, t = (th - a.theta) / (b.theta - a.theta);
  const ra = pick(a), rb = pick(b);
  return [0, 1, 2, 3].map((k) => lerp(ra[k]!, rb[k]!, t)) as unknown as Row;
}

/**
 * Figuras 2.4-4 to 2.4-6, wind across the ridge: CNW and CNL on the windward and leeward halves,
 * positive toward the top surface (note 4). `upslope`: on a monoslope, the wind blowing from the
 * low edge (γ = 0°, see the header). Below 7,5° the pitched and troughed roofs take the
 * monoslope's coefficients, which below 7,5° are those of 0° (notes 3).
 */
export function freeRoofCn(kind: FreeRoofKind, thetaDeg: number, c: LoadCaseAB, blocked: boolean, upslope = true): { cnw: number; cnl: number } {
  const k = c === 'A' ? 0 : 1;
  let row: Row;
  if (kind === 'monoslope' || thetaDeg < 7.5) {
    const th = thetaDeg < 7.5 ? 0 : thetaDeg;
    row = interpRows(MONO, th, (r) => (upslope ? r.g0 : r.g180)[k]!);
  } else {
    row = interpRows(kind === 'pitched' ? PITCHED : TROUGHED, thetaDeg, (r) => r.ab[k]!);
  }
  return blocked ? { cnw: row[2], cnl: row[3] } : { cnw: row[0], cnl: row[1] };
}

/** Figura 2.4-7, wind along the ridge (γ = 90°, 270°): CN by the distance x from the windward edge. */
const ALONG: Record<LoadCaseAB, { clear: [number, number, number]; blocked: [number, number, number] }> = {
  A: { clear: [-0.8, -0.6, -0.3], blocked: [-1.2, -0.9, -0.6] },
  B: { clear: [0.8, 0.5, 0.3], blocked: [0.5, 0.5, 0.3] },
};
export function freeRoofCnAlong(xOverH: number, c: LoadCaseAB, blocked: boolean): number {
  return ALONG[c][blocked ? 'blocked' : 'clear'][xOverH <= 1 ? 0 : xOverH <= 2 ? 1 : 2];
}

/** Figura 4.4-1, cases A and B: Cf of a solid sign or freestanding wall by B/s and s/h. */
const SIGN_BS = [0.05, 0.1, 0.2, 0.5, 1, 2, 4, 5, 10, 20, 30, 45] as const;
const SIGN_SH = [1, 0.9, 0.7, 0.5, 0.3, 0.2, 0.16] as const;
const SIGN_CF: readonly (readonly number[])[] = [
  [1.80, 1.70, 1.65, 1.55, 1.45, 1.40, 1.35, 1.35, 1.30, 1.30, 1.30, 1.30],
  [1.85, 1.75, 1.70, 1.60, 1.55, 1.50, 1.45, 1.45, 1.40, 1.40, 1.40, 1.40],
  [1.90, 1.85, 1.75, 1.70, 1.65, 1.60, 1.60, 1.55, 1.55, 1.55, 1.55, 1.55],
  [1.95, 1.85, 1.80, 1.75, 1.75, 1.70, 1.70, 1.70, 1.70, 1.70, 1.70, 1.75],
  [1.95, 1.90, 1.85, 1.80, 1.80, 1.80, 1.80, 1.80, 1.80, 1.85, 1.85, 1.85],
  [1.95, 1.90, 1.85, 1.80, 1.80, 1.80, 1.80, 1.80, 1.85, 1.90, 1.90, 1.95],
  [1.95, 1.90, 1.85, 1.85, 1.80, 1.80, 1.85, 1.85, 1.85, 1.90, 1.90, 1.95],
];

/** Linear interpolation is permitted (note 4); outside the table the edge values hold. */
export function solidSignCf(bOverS: number, sOverH: number): number {
  const at = (xs: readonly number[], x: number) => {
    const asc = xs[0]! < xs[xs.length - 1]!;
    const v = asc ? Math.min(xs[xs.length - 1]!, Math.max(xs[0]!, x)) : Math.min(xs[0]!, Math.max(xs[xs.length - 1]!, x));
    let i = 0;
    while (i < xs.length - 2 && (asc ? v > xs[i + 1]! : v < xs[i + 1]!)) i++;
    return [i, (v - xs[i]!) / (xs[i + 1]! - xs[i]!)] as const;
  };
  const [i, ti] = at(SIGN_SH, sOverH);
  const [j, tj] = at(SIGN_BS, bOverS);
  const row = (r: number) => lerp(SIGN_CF[r]![j]!, SIGN_CF[r]![j + 1]!, tj);
  return lerp(row(i), row(i + 1), ti);
}

export type LatticeMembers = 'flat' | 'roundSmall' | 'roundLarge';

/** Figura 4.5-2: open signs and lattice frameworks, by solidity ε and the members' shape (D√qz ≤ or > 5,3). */
export function openSignCf(epsilon: number, members: LatticeMembers): number {
  const col = members === 'flat' ? 0 : members === 'roundSmall' ? 1 : 2;
  const rows = [[2, 1.2, 0.8], [1.8, 1.3, 0.9], [1.6, 1.5, 1.1]];
  return rows[epsilon < 0.1 ? 0 : epsilon < 0.3 ? 1 : 2]![col]!;
}

/**
 * Figura 4.5-3: trussed towers, Cf = 4,0ε² − 5,9ε + 4,0 (square) or 3,4ε² − 4,7ε + 3,4 (triangular),
 * ε the solidity of one face; round members × (0,51ε² + 0,57) ≤ 1,0 (note 3); a square tower with
 * the wind on its diagonal × (1 + 0,75ε) ≤ 1,2 (note 4).
 */
export function towerCf(epsilon: number, section: 'square' | 'triangle', round: boolean, diagonal = false): number {
  const e = epsilon;
  let cf = section === 'square' ? 4 * e * e - 5.9 * e + 4 : 3.4 * e * e - 4.7 * e + 3.4;
  if (round) cf *= Math.min(1, 0.51 * e * e + 0.57);
  if (diagonal && section === 'square') cf *= Math.min(1.2, 1 + 0.75 * e);
  return cf;
}

export type ChimneySection = 'squareNormal' | 'squareDiagonal' | 'hexOct' | 'roundSmooth' | 'roundRough' | 'roundVeryRough';

/**
 * Figura 4.5-1: chimneys and tanks, Cf by h/D (1, 7, 25; linear between). A round section with
 * D√qz ≤ 5,3 (qz in N/m²) takes the last row whatever its surface.
 */
export function chimneyCf(section: ChimneySection, hOverD: number, dSqrtQz: number): number {
  const rows: Record<ChimneySection | 'roundLow', [number, number, number]> = {
    squareNormal: [1.3, 1.4, 2.0], squareDiagonal: [1.0, 1.1, 1.5], hexOct: [1.0, 1.2, 1.4],
    roundSmooth: [0.5, 0.6, 0.7], roundRough: [0.7, 0.8, 0.9], roundVeryRough: [0.8, 1.0, 1.2], roundLow: [0.7, 0.8, 1.2],
  };
  const r = section.startsWith('round') && dSqrtQz <= 5.3 ? rows.roundLow : rows[section];
  const x = Math.min(25, Math.max(1, hOverD));
  return x <= 7 ? lerp(r[0], r[1], (x - 1) / 6) : lerp(r[1], r[2], (x - 7) / 18);
}

/** §4.8: other structures, no less than 0,8 kN/m² times Af. */
export const MIN_OTHER_KNM2 = 0.8;
