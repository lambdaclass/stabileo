/**
 * CIRSOC 102-2025 §1.9 — the gust effect factor, for rigid and for flexible structures.
 *
 * ── Rigid or flexible ──────────────────────────────────────────────
 *
 * Flexible is a fundamental frequency n₁ below 1 Hz (art. 1.2). n₁ comes from an analysis of the
 * structure (§1.9.2: Stabileo's modal analysis is one), or, for steel or concrete buildings within
 * the limits of §1.9.2.1, from the lower bounds of §1.9.3. A low-rise building (art. 1.2) may be
 * taken as rigid without one.
 *
 * ── The factor ─────────────────────────────────────────────────────
 *
 *   rigid     G = 0,85 (§1.9.1), or Eq. (1.9-6) (§1.9.4);
 *   flexible  G_f by Eq. (1.9-10) (§1.9.5), with the resonant response R of (1.9-12) to (1.9-16).
 *
 * The torsional eccentricity of a flexible building's load cases 2 and 4 is Eq. (2.4-5) (§2.4.6).
 *
 * ── What it does not cover ─────────────────────────────────────────
 *
 * Across-wind response, vortex shedding, galloping, flutter and torsional amplification: the code
 * gives no analytic procedure and sends them to recognised literature or a wind tunnel (arts.
 * 2.1.2(2), 2.1.3, 6.1). `dynamicSensitivity` names the commentary's triggers (C 1.1.2) as warnings.
 *
 * Pure: no store, no runes.
 */
import { clause, derived, fromCode, type ClauseRef, type ProvenancedValue } from '../regulation';
import { msg, type EngineMessage } from '../message';
import { EXPOSURE_CONSTANTS, type Exposure } from './wind';

const REF_1_2 = clause('cirsoc-102', '2025', '1.2', 'edificio flexible, rígido y de baja altura');
const REF_1_9_1 = clause('cirsoc-102', '2025', '1.9.1', 'factor de ráfaga de estructuras rígidas');
const REF_1_9_2 = clause('cirsoc-102', '2025', '1.9.2', 'determinación de la frecuencia natural');
const REF_1_9_2_1 = clause('cirsoc-102', '2025', '1.9.2.1', 'límites de la frecuencia aproximada');
const REF_1_9_3 = clause('cirsoc-102', '2025', '1.9.3', 'frecuencia natural aproximada');
const REF_1_9_4 = clause('cirsoc-102', '2025', '1.9.4', 'factor de ráfaga calculado de estructuras rígidas');
const REF_1_9_5 = clause('cirsoc-102', '2025', '1.9.5', 'factor de ráfaga de estructuras flexibles');
const REF_T191 = clause('cirsoc-102', '2025', 'Tabla 1.9-1', 'constantes de exposición del terreno');
const REF_2_4_6 = clause('cirsoc-102', '2025', '2.4.6', 'excentricidad de edificios flexibles');
const REF_2_1_3 = clause('cirsoc-102', '2025', '2.1.3', 'respuestas fuera del alcance del capítulo');

/** g_Q = g_v = 3,4 (§1.9.4, §1.9.5). */
export const G_Q = 3.4;

// ─── The common terms ─────────────────────────────────────────────

/** z̄ = 0,6·h, not less than z_min (§1.9.4, note to Tabla 1.9-1). */
export function equivalentHeight(h: number, exposure: Exposure): number {
  return Math.max(0.6 * h, EXPOSURE_CONSTANTS[exposure].zmin);
}
/** I_z̄ = c·(10/z̄)^(1/6), Eq. (1.9-7). */
export function turbulenceIntensity(zBar: number, exposure: Exposure): number {
  return EXPOSURE_CONSTANTS[exposure].c * (10 / zBar) ** (1 / 6);
}
/** L_z̄ = ℓ·(z̄/10)^ε̄, Eq. (1.9-9), m. */
export function integralLengthScale(zBar: number, exposure: Exposure): number {
  const k = EXPOSURE_CONSTANTS[exposure];
  return k.ell * (zBar / 10) ** k.epsBar;
}
/** Q, the background response, Eq. (1.9-8). */
export function backgroundResponse(B: number, h: number, lz: number): number {
  return Math.sqrt(1 / (1 + 0.63 * ((B + h) / lz) ** 0.63));
}
/** V̄_z̄ = b̄·(z̄/10)^ᾱ·V, Eq. (1.9-16), m/s. */
export function meanHourlySpeed(zBar: number, V: number, exposure: Exposure): number {
  const k = EXPOSURE_CONSTANTS[exposure];
  return k.bBar * (zBar / 10) ** k.alphaBar * V;
}
/** R_ℓ of Eq. (1.9-15a); 1 at η = 0, its limit. */
export function sizeReduction(eta: number): number {
  if (!(eta > 1e-9)) return 1;
  return 1 / eta - (1 - Math.exp(-2 * eta)) / (2 * eta * eta);
}

export interface ResonantSteps {
  vBar: number; n1Reduced: number; rn: number;
  etaH: number; etaB: number; etaL: number;
  rh: number; rb: number; rl: number; r: number; gR: number;
}

/** R and g_R, Eqs. (1.9-11) to (1.9-15). Null when n₁ or β cannot give one. */
export function resonantResponse(o: { n1: number; beta: number; B: number; L: number; h: number; vBar: number; lz: number }): ResonantSteps | null {
  if (!(o.n1 * 3600 > 1) || !(o.beta > 0) || !(o.vBar > 0)) return null;
  const n1Reduced = (o.n1 * o.lz) / o.vBar;
  const rn = (7.47 * n1Reduced) / (1 + 10.3 * n1Reduced) ** (5 / 3);
  const etaH = (4.6 * o.n1 * o.h) / o.vBar, etaB = (4.6 * o.n1 * o.B) / o.vBar, etaL = (15.4 * o.n1 * o.L) / o.vBar;
  const rh = sizeReduction(etaH), rb = sizeReduction(etaB), rl = sizeReduction(etaL);
  const r = Math.sqrt((1 / o.beta) * rn * rh * rb * (0.53 + 0.47 * rl));
  const ln = Math.sqrt(2 * Math.log(3600 * o.n1));
  const gR = ln + 0.577 / ln;
  return { vBar: o.vBar, n1Reduced, rn, etaH, etaB, etaL, rh, rb, rl, r, gR };
}

// ─── The factor ───────────────────────────────────────────────────

export type RigidG = 'default' | 'calculated';

export interface GustInput {
  exposure: Exposure;
  /** Basic speed, m/s. */
  V: number;
  /** Mean roof height (or the structure's height), m. */
  h: number;
  /** Across the wind (B) and along it (L), m. */
  B: number;
  L: number;
  /** Fundamental frequency in this direction, Hz; absent: declared rigid (n₁ ≥ 1 Hz on the user's word). */
  n1?: number;
  /** Damping ratio, a fraction of critical (0,02 = 2 %). */
  beta: number;
  rigidG: RigidG;
  /** A low-rise building, rigid without n₁ (art. 1.2, §1.9.2). */
  lowRise?: boolean;
}

export interface GustSteps { zBar: number; iz: number; lz: number; q: number; gCalculated: number; resonant?: ResonantSteps }

export interface GustResult {
  kind: 'rigidDefault' | 'rigidCalculated' | 'flexible' | 'unsupported';
  value: ProvenancedValue<number>;
  n1?: number;
  steps: GustSteps;
  refs: ClauseRef[];
  notes: EngineMessage[];
}

/** The gust effect factor in one direction: rigid by n₁ ≥ 1 Hz (or low rise, or declared), else G_f. */
export function gustEffectFactor(g: GustInput): GustResult {
  const zBar = equivalentHeight(g.h, g.exposure);
  const iz = turbulenceIntensity(zBar, g.exposure);
  const lz = integralLengthScale(zBar, g.exposure);
  const q = backgroundResponse(g.B, g.h, lz);
  const gCalculated = (0.925 * (1 + 1.7 * G_Q * iz * q)) / (1 + 1.7 * G_Q * iz);
  const steps: GustSteps = { zBar, iz, lz, q, gCalculated };
  const rigid = g.lowRise || g.n1 === undefined || g.n1 >= 1;
  const notes: EngineMessage[] = [];
  if (rigid) {
    const why = g.lowRise ? [REF_1_2, REF_1_9_2] : g.n1 === undefined ? [REF_1_2] : [REF_1_2, REF_1_9_2];
    if (g.rigidG === 'calculated') {
      return { kind: 'rigidCalculated', value: derived(gCalculated, [REF_1_9_4, REF_T191]), n1: g.n1, steps, refs: [...why, REF_1_9_4], notes };
    }
    return { kind: 'rigidDefault', value: fromCode(0.85, [REF_1_9_1]), n1: g.n1, steps, refs: [...why, REF_1_9_1], notes };
  }
  const vBar = meanHourlySpeed(zBar, g.V, g.exposure);
  const res = resonantResponse({ n1: g.n1!, beta: g.beta, B: g.B, L: g.L, h: g.h, vBar, lz });
  if (!res) {
    notes.push(msg('loads.cirsoc102.gust.noResonance', { n1: g.n1!, beta: g.beta }));
    return { kind: 'unsupported', value: fromCode(NaN, [REF_1_9_5]), n1: g.n1, steps, refs: [REF_1_9_5], notes };
  }
  const gf = (0.925 * (1 + 1.7 * iz * Math.sqrt(G_Q ** 2 * q ** 2 + res.gR ** 2 * res.r ** 2))) / (1 + 1.7 * G_Q * iz);
  return { kind: 'flexible', value: derived(gf, [REF_1_9_5, REF_T191]), n1: g.n1, steps: { ...steps, resonant: res }, refs: [REF_1_2, REF_1_9_5], notes };
}

// ─── The frequency without an analysis ────────────────────────────

/** L_ef = Σ h_i·L_i / Σ h_i, Eq. (1.9-1). */
export function effectiveLength(levels: ReadonlyArray<{ h: number; L: number }>): number {
  const sh = levels.reduce((s, l) => s + l.h, 0);
  return sh > 0 ? levels.reduce((s, l) => s + l.h * l.L, 0) / sh : 0;
}

export type ApproximateSystem = 'steelMomentFrame' | 'concreteMomentFrame' | 'otherSteelOrConcrete';

/**
 * n_a of §1.9.3, Eqs. (1.9-2) to (1.9-4), for a steel or concrete building within §1.9.2.1
 * (h < 90 m and h < 4·L_ef); null with the reason otherwise.
 */
export function approximateFrequency(system: ApproximateSystem, h: number, lef: number): { na: number; refs: ClauseRef[] } | { refused: EngineMessage } {
  if (!(h > 0)) return { refused: msg('loads.cirsoc102.gust.noHeight') };
  if (!(h < 90)) return { refused: msg('loads.cirsoc102.gust.approxTooTall', { h }) };
  if (!(h < 4 * lef)) return { refused: msg('loads.cirsoc102.gust.approxTooSlender', { h, lef }) };
  const na = system === 'steelMomentFrame' ? 8.58 / h ** 0.8 : system === 'concreteMomentFrame' ? 14.93 / h ** 0.9 : 22.86 / h;
  return { na, refs: [REF_1_9_2_1, REF_1_9_3] };
}

/** e of Eq. (2.4-5) for a flexible building, from e_Q of Fig. 2.4-8 and e_R. */
export function flexibleEccentricity(o: { eQ: number; eR: number; iz: number; q: number; r: number; gR: number }): ProvenancedValue<number> {
  const num = o.eQ + 1.7 * o.iz * Math.sqrt((G_Q * o.q * o.eQ) ** 2 + (o.gR * o.r * o.eR) ** 2);
  const den = 1 + 1.7 * o.iz * Math.sqrt((G_Q * o.q) ** 2 + (o.gR * o.r) ** 2);
  return derived(num / den, [REF_2_4_6]);
}

/**
 * The commentary's triggers for across-wind and aeroelastic effects (C 1.1.2), as warnings: what the
 * generated load does not cover, and the clauses that send it to literature or a wind tunnel.
 */
export function dynamicSensitivity(o: { h: number; bMin: number; n1?: number; vBar?: number }): EngineMessage[] {
  const out: EngineMessage[] = [];
  if (o.h > 120) out.push(msg('loads.cirsoc102.gust.sensitive.tall', { h: o.h }));
  if (o.bMin > 0 && o.h > 4 * o.bMin) out.push(msg('loads.cirsoc102.gust.sensitive.slender', { h: o.h, b: o.bMin }));
  if (o.n1 !== undefined && o.n1 < 0.25) out.push(msg('loads.cirsoc102.gust.sensitive.lowFrequency', { n1: o.n1 }));
  if (o.n1 !== undefined && o.vBar !== undefined && o.bMin > 0 && o.vBar / (o.n1 * o.bMin) > 5) out.push(msg('loads.cirsoc102.gust.sensitive.reducedSpeed', { v: o.vBar / (o.n1 * o.bMin) }));
  return out;
}

/** The clause the generated load stops at: along-wind only (§2.1.3). */
export const ALONG_WIND_ONLY = { refs: [REF_2_1_3] };
