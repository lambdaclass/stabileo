/**
 * CIRSOC 104-2005 — snow load on roofs.
 *
 * The expressions, as the regulation prints them (`docs/codes/CIRSOC/markdown/cirsoc-104-2005`):
 *
 *   Cap. 3  (1)  p_f = 0,7 C_e C_t I p_g,  with, on low-slope roofs (§3.4), p_f ≥ I·p_g for
 *                p_g ≤ 1 kN/m² and p_f ≥ I·1 kN/m² above that;
 *   Cap. 4  (2)  p_s = C_s p_f,  on the horizontal projection of the roof;
 *   Cap. 6       unbalanced load on gable roofs, §6.1 with β from (3);
 *   Cap. 7  (4)  γ = 0,426 p_g + 2,2 ≤ 4,70 kN/m³;
 *   Cap. 10      rain on snow, 0,25 kN/m² on roofs under 2,4° where 0 < p_g ≤ 1 kN/m².
 *
 * Tabla 2 (C_e), Tabla 3 (C_t) and Tabla 4 (I, with the categories of Apéndice B) are below.
 *
 * ── Figura 2, C_s ────────────────────────────────────────────────
 *
 * Figura 2 is a drawing. Its labels give where each curve leaves C_s = 1 (5° and 30° for warm
 * roofs, 10° and 37,5° for C_t = 1,1, 15° and 45° for C_t = 1,2: the first for smooth
 * unobstructed surfaces, the second for all others), and its vectors give where they reach
 * zero: every curve, solid or dashed, is a straight line to C_s = 0 at 70°. That end point was
 * read from the page's path coordinates against the axis labels, not assumed; §4.3 says the
 * same of curved roofs beyond 70°.
 *
 * Pure: no store.
 */
import { clause, type ClauseRef } from '../regulation';

const R = (c: string, l?: string) => clause('cirsoc-104', '2005', c, l);
export const REF_PF = R('3', 'cubiertas planas');
export const REF_MIN = R('3.4', 'valores mínimos de pf');
export const REF_PS = R('4', 'cubiertas con pendiente');
export const REF_CS = R('Figura 2', 'factor de pendiente');
export const REF_UNBALANCED = R('6.1', 'cargas no balanceadas');
export const REF_RAIN = R('10', 'carga de lluvia sobre nieve');

// ─── Tablas 2, 3 y 4 ─────────────────────────────────────────────

/** Terrain category of Apéndice A, or above the tree line in wind-swept mountain areas. */
export type SnowTerrain = 'A' | 'B' | 'C' | 'D' | 'aboveTreeline';
export type RoofExposure = 'full' | 'partial' | 'sheltered';

/** Tabla 2, C_e. Null where the table prints N/A. */
export const EXPOSURE_FACTOR: Readonly<Record<SnowTerrain, Record<RoofExposure, number | null>>> = Object.freeze({
  A: { full: null, partial: 1.1, sheltered: 1.3 },
  B: { full: 0.9, partial: 1.0, sheltered: 1.2 },
  C: { full: 0.9, partial: 1.0, sheltered: 1.1 },
  D: { full: 0.8, partial: 0.9, sheltered: 1.0 },
  aboveTreeline: { full: 0.7, partial: 0.8, sheltered: null },
});

export type ThermalCondition = 'normal' | 'coldVentilated' | 'unheated' | 'greenhouse';

/** Tabla 3, C_t. */
export const THERMAL_FACTOR: Readonly<Record<ThermalCondition, number>> = Object.freeze({
  normal: 1.0, coldVentilated: 1.1, unheated: 1.2, greenhouse: 0.85,
});

export type SnowCategory = 'I' | 'II' | 'III' | 'IV';

/** Tabla 4, I. */
export const IMPORTANCE_FACTOR: Readonly<Record<SnowCategory, number>> = Object.freeze({
  I: 0.8, II: 1.0, III: 1.1, IV: 1.2,
});

// ─── Roof ────────────────────────────────────────────────────────

export type RoofKind = 'mono' | 'gable';

export interface SnowRoof {
  kind: RoofKind;
  slopeDeg: number;
  /** Horizontal distance from the ridge to the eave, m (§1.3: W). */
  W: number;
  /** A smooth surface with no obstructions and room under the eaves for what slides off (Cap. 4). */
  slippery: boolean;
}

/** §3.4: the roofs the minimum values apply to. */
export function isLowSlope(r: SnowRoof): boolean {
  return r.kind === 'mono' ? r.slopeDeg < 15 : r.slopeDeg <= 21 / Math.max(r.W, 1e-9) + 0.5;
}

/** Figura 2. */
export function slopeFactor(slopeDeg: number, ct: number, slippery: boolean): number {
  const start = ct <= 1 ? (slippery ? 5 : 30) : ct <= 1.1 ? (slippery ? 10 : 37.5) : (slippery ? 15 : 45);
  if (slopeDeg <= start) return 1;
  if (slopeDeg >= 70) return 0;
  return (70 - slopeDeg) / (70 - start);
}

/** (4), kN/m³. */
export const snowDensity = (pg: number) => Math.min(0.426 * pg + 2.2, 4.7);

/** (3). */
export function driftIndex(pg: number): number {
  if (pg <= 1) return 1;
  if (pg >= 2) return 0.5;
  return 1.5 - 0.5 * pg;
}

export interface SnowInputs {
  pg: number;
  terrain: SnowTerrain;
  exposure: RoofExposure;
  thermal: ThermalCondition;
  category: SnowCategory;
  roof: SnowRoof;
}

export interface SnowResult {
  ce: number; ct: number; importance: number;
  /** (1) as computed, and the §3.4 minimum when it applies. */
  pfComputed: number;
  pfMinimum: number | null;
  pf: number;
  cs: number;
  /** Balanced load on the horizontal projection, rain on snow included. */
  ps: number;
  rainOnSnow: number;
  /** §6.1 on a gable roof when required: the leeward side and the windward side. */
  unbalanced: { leeward: number; windward: number } | null;
  gamma: number;
  refs: ClauseRef[];
  /** i18n key when Tabla 2 prints N/A for the terrain and exposure chosen. */
  refused?: string;
}

export function roofSnow(i: SnowInputs): SnowResult {
  const ce = EXPOSURE_FACTOR[i.terrain][i.exposure];
  const ct = THERMAL_FACTOR[i.thermal];
  const importance = IMPORTANCE_FACTOR[i.category];
  const gamma = snowDensity(i.pg);
  const refs = [REF_PF, REF_PS, REF_CS];
  if (ce === null) {
    return {
      ce: 0, ct, importance, pfComputed: 0, pfMinimum: null, pf: 0, cs: 0, ps: 0, rainOnSnow: 0,
      unbalanced: null, gamma, refs, refused: 'snow.refused.exposureNA',
    };
  }
  const pfComputed = 0.7 * ce * ct * importance * i.pg;
  const pfMinimum = isLowSlope(i.roof) && i.pg > 0 ? importance * Math.min(i.pg, 1) : null;
  if (pfMinimum !== null) refs.push(REF_MIN);
  const pf = Math.max(pfComputed, pfMinimum ?? 0);
  const cs = slopeFactor(i.roof.slopeDeg, ct, i.roof.slippery);

  // Cap. 10: reduced by what the minimum already added over (1), by 0,25 at most.
  let rainOnSnow = 0;
  if (i.pg > 0 && i.pg <= 1 && i.roof.slopeDeg < 2.4) {
    const excess = pfMinimum !== null ? Math.max(pfMinimum - pfComputed, 0) : 0;
    rainOnSnow = Math.max(0.25 - Math.min(excess, 0.25), 0);
    refs.push(REF_RAIN);
  }
  const ps = cs * pf + rainOnSnow;

  // §6.1: not needed past 70°, nor below 21/W + 0,5.
  let unbalanced: SnowResult['unbalanced'] = null;
  if (i.roof.kind === 'gable' && i.roof.slopeDeg <= 70 && i.roof.slopeDeg >= 21 / Math.max(i.roof.W, 1e-9) + 0.5) {
    const psBal = cs * pf;
    unbalanced = i.roof.W <= 6
      ? { leeward: (1.5 * psBal) / ce, windward: 0 }
      : { leeward: (1.2 * (1 + driftIndex(i.pg) / 2) * psBal) / ce, windward: 0.3 * psBal };
    refs.push(REF_UNBALANCED);
  }
  return { ce, ct, importance, pfComputed, pfMinimum, pf, cs, ps, rainOnSnow, unbalanced, gamma, refs };
}
