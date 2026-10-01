/**
 * CIRSOC 104-2005 — snow drifted by the wind onto a lower roof (Cap. 7) and snow sliding off a
 * higher sloped roof (Cap. 9), as the regulation prints them
 * (`docs/codes/CIRSOC/markdown/cirsoc-104-2005`).
 *
 * ── Cap. 7.1, drifts at a step ────────────────────────────────────
 *
 *   h_b = p_f (or p_s) / γ, the balanced snow's height, with γ from (4);
 *   h_c = the clear height from the balanced snow up to the higher roof;
 *   no drift when h_c / h_b < 0,2;
 *   leeward drift: h_d from Figura 9 with l_u the upper roof's length;
 *   windward drift: 3/4 of h_d from Figura 9 with l_u the lower roof's length;
 *   the larger of the two. If h_d ≤ h_c, w = 4 h_d and the height is h_d; otherwise
 *   w = 4 h_d² / h_c and the height is h_c. w ≤ 8 h_c; past the lower roof's edge the drift is
 *   cut, not tapered. p_d = height · γ, a triangle over w superposed on the balanced snow.
 *
 * §7.2 reduces a drift from a separate structure within 6 m by (6 − s)/6.
 *
 * ── Figura 9 ──────────────────────────────────────────────────────
 *
 * The regulation gives h_d as curves only, no expression: the table below was read from the
 * PDF's vector paths (axes 0 to 5 kN/m² and 0 to 3 m, curves for l_u = 7,5, 15, 30, 60, 120 and
 * 180 m), the way `snow.ts` read Figura 2. Between points the reading is linear in p_g and in the
 * logarithm of l_u, and l_u below 7,5 m is taken as 7,5 m, as the figure's note says. The
 * expression of the regulation's source standard runs about 0,05 m above these curves and is not
 * used.
 *
 * ── Cap. 9, sliding snow ──────────────────────────────────────────
 *
 * Off a smooth roof steeper than 2 %, or any roof steeper than 16 %, onto a lower roof: a total
 * of 0,4 p_f W per metre of eave, W the eave-to-ridge distance of the higher roof, spread
 * uniformly over 4,5 m of the lower roof from the eave (cut where the lower roof is narrower),
 * added to the balanced snow.
 *
 * Pure: no store.
 */
import { clause } from '../regulation';
import { snowDensity } from './snow';

const R = (c: string, l?: string) => clause('cirsoc-104', '2005', c, l);
export const REF_DRIFT = R('7.1', 'cubierta más baja de una estructura');
export const REF_DRIFT_ADJACENT = R('7.2', 'estructuras adyacentes');
export const REF_FIG9 = R('Figura 9', 'altura de la nieve acumulada');
export const REF_SLIDING = R('9', 'nieve caída por deslizamiento');

const LU = [7.5, 15, 30, 60, 120, 180] as const;
const PG = [0.25, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 4.75] as const;
/** h_d, m, by p_g (rows) and l_u (columns), read from Figura 9. */
const HD: readonly (readonly number[])[] = [
  [0.269, 0.485, 0.723, 1.019, 1.416, 1.678],
  [0.302, 0.539, 0.783, 1.090, 1.505, 1.774],
  [0.381, 0.657, 0.924, 1.255, 1.712, 2.019],
  [0.460, 0.757, 1.042, 1.411, 1.905, 2.233],
  [0.530, 0.832, 1.133, 1.540, 2.072, 2.425],
  [0.590, 0.894, 1.216, 1.652, 2.200, 2.566],
  [0.637, 0.941, 1.282, 1.732, 2.307, 2.685],
  [0.674, 0.978, 1.334, 1.799, 2.392, 2.785],
  [0.702, 1.005, 1.379, 1.855, 2.462, 2.871],
  [0.723, 1.029, 1.419, 1.907, 2.518, 2.952],
  [0.733, 1.042, 1.441, 1.929, 2.546, 2.985],
];

const bracket = (xs: readonly number[], x: number): [number, number, number] => {
  const v = Math.min(xs[xs.length - 1]!, Math.max(xs[0]!, x));
  let i = 0;
  while (i < xs.length - 2 && v > xs[i + 1]!) i++;
  const t = (v - xs[i]!) / (xs[i + 1]! - xs[i]!);
  return [i, i + 1, t];
};

/**
 * Figura 9: the drift height for a ground snow `pg` (kN/m²) and an upwind roof length `lu` (m).
 * Outside the figure (p_g above 4,75 kN/m², l_u above 180 m) the edge of the figure is read and
 * `outside` says so.
 */
export function figure9Hd(pg: number, lu: number): { hd: number; outside: boolean } {
  const outside = pg > 4.75 || lu > 180;
  const [i0, i1, tp] = bracket(PG, pg);
  const [j0, j1, tl] = bracket(LU.map(Math.log), Math.log(Math.max(7.5, lu)));
  const at = (i: number) => HD[i]![j0]! + (HD[i]![j1]! - HD[i]![j0]!) * tl;
  return { hd: at(i0) + (at(i1) - at(i0)) * tp, outside };
}

export interface StepDriftInputs {
  pg: number;
  /** Balanced snow on the lower roof, kN/m². */
  balanced: number;
  /** Height of the step, from the lower roof to the higher one, m. */
  stepHeight: number;
  /** Length of the higher roof upwind of the step, m. */
  luUpper: number;
  /** Length of the lower roof, m. */
  luLower: number;
  /** Separation to a separate higher structure, m (§7.2); 0 for a step of the same structure. */
  separation?: number;
}

export interface StepDrift {
  /** False when h_c/h_b < 0,2 or the separation is 6 m or more: no drift. */
  applies: boolean;
  gamma: number; hb: number; hc: number;
  hdLeeward: number; hdWindward: number;
  /** Height of the drift's triangle, m, its width, m, and its peak surcharge, kN/m². */
  height: number; w: number; pd: number;
  governs: 'leeward' | 'windward';
  outside: boolean;
}

export function stepDrift(i: StepDriftInputs): StepDrift {
  const gamma = snowDensity(i.pg);
  const hb = i.balanced / gamma;
  const hc = Math.max(0, i.stepHeight - hb);
  const lee = figure9Hd(i.pg, i.luUpper), wind = figure9Hd(i.pg, i.luLower);
  const hdLeeward = lee.hd, hdWindward = 0.75 * wind.hd;
  const hd = Math.max(hdLeeward, hdWindward);
  const base = { gamma, hb, hc, hdLeeward, hdWindward, governs: (hdLeeward >= hdWindward ? 'leeward' : 'windward') as StepDrift['governs'], outside: lee.outside || wind.outside };
  const s = i.separation ?? 0;
  if (hb <= 0 || hc / hb < 0.2 || s >= 6) return { ...base, applies: false, height: 0, w: 0, pd: 0 };
  const reduce = (6 - s) / 6;
  const height = (hd <= hc ? hd : hc) * reduce;
  const w = Math.min(hd <= hc ? 4 * hd : (4 * hd * hd) / hc, 8 * hc);
  return { ...base, applies: true, height, w, pd: height * gamma };
}

/** Cap. 9: whether snow slides off a higher roof of this slope (%), and the load it brings. */
export function slidingSnow(i: { pf: number; slopePercent: number; slippery: boolean; W: number }): { applies: boolean; perMetre: number; intensity: number } {
  const applies = i.slopePercent > (i.slippery ? 2 : 16);
  const perMetre = applies ? 0.4 * i.pf * i.W : 0;
  return { applies, perMetre, intensity: perMetre / 4.5 };
}
