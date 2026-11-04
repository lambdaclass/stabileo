// Serviceability Checks — CIRSOC 201 §9.5 (Deflection) and §10.6 (Crack Width)
// Separate module — does NOT modify the solver

import type { SolverDiagnostic } from '../../types';
import { ES_MPA } from './cirsoc201-basis';
import { checkServiceability } from '../../wasm-solver';
import { isEngineUnavailable, engineFailureText } from '../../engine-unavailable';

// ─── Crack Width (CIRSOC 201 §10.6, based on Gergely-Lutz / simplified) ───

export interface CrackResult {
  wk: number;        // estimated crack width (mm)
  wLimit: number;    // allowable crack width (mm)
  fs: number;        // service stress in steel (MPa)
  dc: number;        // distance from tension face to center of nearest bar (m)
  ratio: number;     // wk / wLimit
  status: 'ok' | 'warn' | 'fail';
  steps: string[];
  diagnostics?: SolverDiagnostic[];
}

/**
 * Estimate crack width per CIRSOC 201 §10.6 (simplified Gergely-Lutz approach)
 * @param b section width (m)
 * @param h section total depth (m)
 * @param d effective depth (m)
 * @param AsProv provided steel area (cm²)
 * @param Ms service moment (kN·m) — unfactored
 * @param cover concrete cover (m)
 * @param barDia bar diameter (mm)
 * @param barCount number of bars
 * @param fc concrete strength f'c (MPa), for the cracked elastic section
 * @param exposure 'interior' | 'exterior' — affects limit
 */
export function checkCrackWidth(
  b: number, h: number, d: number,
  AsProv: number, Ms: number,
  cover: number, barDia: number, barCount: number,
  fc: number,
  exposure: 'interior' | 'exterior' = 'interior',
): CrackResult {
  const steps: string[] = [];
  const MsAbs = Math.abs(Ms);

  /*
   * The cracked elastic section, which both fs and β come from: n = Es/Ec with
   * Ec = 4700·√f'c (CIRSOC 201 §19.2.2.1), k = √(2ρn + (ρn)²) − ρn, c = k·d, j = 1 − k/3.
   * fs used a fixed jd = 0,875·d and β = h/(h − dc), which drops the neutral axis.
   */
  const As_m2 = AsProv * 1e-4;
  const n = ES_MPA / (4700 * Math.sqrt(fc));
  const rhoN = (As_m2 / (b * d)) * n;
  const k = Math.sqrt(2 * rhoN + rhoN * rhoN) - rhoN;
  const c = k * d;
  const jd = (1 - k / 3) * d;
  const fs = MsAbs / (As_m2 * jd) / 1000; // MPa
  steps.push(`n = ${n.toFixed(2)}, k = ${k.toFixed(3)}, c = ${(c * 100).toFixed(1)} cm`);
  steps.push(`fs = Ms/(As·jd) = ${fs.toFixed(0)} MPa`);

  // dc = cover + stirrup + bar/2 (distance to bar center from tension face)
  const dc = cover + 0.008 + barDia / 2000; // m
  steps.push(`dc = ${(dc * 1000).toFixed(1)} mm`);

  // Effective tension area per bar: A_eff = 2·dc·b / n
  const Aeff = 2 * dc * b / barCount; // m²
  steps.push(`A_eff/barra = ${(Aeff * 1e6).toFixed(0)} mm²`);

  /*
   * Gergely–Lutz in SI: w = 11·10⁻⁶·β·fs·∛(dc·A), w in mm with fs in MPa, dc in mm, A in mm².
   * β = (h − c)/(d − c), the ratio of the distances from the neutral axis to the tension face
   * and to the steel.
   *
   * This used 0,076·10⁻³, the coefficient of the inch-pound form (fs in ksi, w in inches),
   * with SI inputs: 0,076/6,895 = 0,011, so every width came out 6,9 times too large.
   */
  const beta = (h - c) / (d - c);
  const wk = 0.011 * beta * fs * Math.cbrt(dc * 1000 * Aeff * 1e6) * 1e-3; // mm
  steps.push(`wk = 0.011·β·fs·∛(dc·A)·10⁻³ = ${wk.toFixed(3)} mm (β = ${beta.toFixed(3)})`);

  // Limits: interior 0.33 mm, exterior 0.25 mm
  const wLimit = exposure === 'exterior' ? 0.25 : 0.33;
  steps.push(`w_lim = ${wLimit} mm (${exposure === 'exterior' ? 'exterior' : 'interior'})`);

  const ratio = wk / wLimit;
  let status: CrackResult['status'] = 'ok';
  if (ratio > 1.0) status = 'fail';
  else if (ratio > 0.8) status = 'warn';

  const diags: SolverDiagnostic[] = [];
  if (status === 'fail') {
    diags.push({ severity: 'error', code: 'CRACK_WIDTH_EXCEEDED', message: 'diag.crackWidthExceeded', source: 'serviceability', details: { computed: wk, limit: wLimit, ratio } });
  } else if (status === 'warn') {
    diags.push({ severity: 'warning', code: 'CRACK_WIDTH_HIGH', message: 'diag.crackWidthHigh', source: 'serviceability', details: { computed: wk, limit: wLimit, ratio } });
  }

  return { wk, wLimit, fs, dc, ratio, status, steps, diagnostics: diags.length > 0 ? diags : undefined };
}

// ─── Deflection Check (CIRSOC 201 §9.5) ───

export interface DeflectionResult {
  deltaImm: number;    // immediate deflection (m)
  deltaLT: number;     // long-term deflection (m)
  deltaTotal: number;  // total deflection (m)
  limit: number;       // allowable deflection (m)
  ratio: number;       // deltaTotal / limit — NOT δ/L
  /** The span, and the divisor of its limit (L/360 → 360): what `L/δ` is printed against. */
  span: number;
  limitDivisor: number;
  /** The length the limit is taken over: the span, or 2L for a cantilever. */
  limitLength: number;
  status: 'ok' | 'warn' | 'fail';
  steps: string[];
  diagnostics?: SolverDiagnostic[];
}

/**
 * Check deflection against CIRSOC 201 §9.5 limits
 * @param L span length (m)
 * @param delta computed elastic deflection from solver (m) — service level
 * @param limitType 'L/240' | 'L/360' | 'L/480' — table 9.5(b)
 * @param lambdaDelta long-term multiplier (default 2.0 for ξ=2.0, ρ'=0)
 */
export function checkDeflection(
  L: number, delta: number,
  limitType: 'L/240' | 'L/360' | 'L/480' | number = 'L/360',
  lambdaDelta: number = 2.0,
  /** The length the limit is taken over when it is not the span: 2L for a cantilever. */
  limitLength: number = L,
): DeflectionResult {
  const steps: string[] = [];
  const deltaAbs = Math.abs(delta);

  steps.push(`δ_inmediata = ${(deltaAbs * 1000).toFixed(2)} mm`);

  // Long-term: δ_LT = λ_Δ · δ_imm (simplified, CIRSOC 201 §9.5.2.5)
  // λ_Δ = ξ / (1 + 50·ρ') — for ρ'=0: λ_Δ = ξ
  // ξ at 5+ years = 2.0
  const deltaLT = lambdaDelta * deltaAbs;
  steps.push(`δ_largo_plazo = λ·δ = ${lambdaDelta.toFixed(1)}·${(deltaAbs * 1000).toFixed(2)} = ${(deltaLT * 1000).toFixed(2)} mm`);

  const deltaTotal = deltaAbs + deltaLT;
  steps.push(`δ_total = ${(deltaTotal * 1000).toFixed(2)} mm`);

  const divisor = typeof limitType === 'number' ? limitType : limitType === 'L/240' ? 240 : limitType === 'L/480' ? 480 : 360;
  const over = limitLength === L ? 'L' : `${+(limitLength / L).toFixed(3)}L`;

  /*
   * The verdict is the engine's (`serviceability.rs`, `check_serviceability`): the allowable
   * deflection, the ratio and pass/fail. This module keeps only the long-term multiplier above,
   * which the engine does not model. No engine, no verdict: the check fails, never passes.
   */
  let engine: Array<{ deflectionRatio: number; allowableDeflection: number; deflectionOk: boolean }> | null = null;
  let engineError: string | null = null;
  try {
    engine = checkServiceability({
      members: [{ elementId: 0, span: limitLength, maxDeflection: deltaTotal, criterion: { spanRatio: divisor } }],
    });
  } catch (err) {
    engineError = isEngineUnavailable(err) ? 'el motor no está disponible' : `el motor falló: ${engineFailureText(err)}`;
  }
  const r = engine?.[0];
  const limit = r ? r.allowableDeflection : limitLength / divisor;
  steps.push(`δ_admisible = ${over}/${divisor} = ${(limit * 1000).toFixed(2)} mm`);
  const ratio = r ? r.deflectionRatio : Number.NaN;
  steps.push(r ? `Ratio = ${ratio.toFixed(3)}` : `Ratio: ${engineError ?? 'el motor no devolvió resultado'} — no verificado`);

  let status: DeflectionResult['status'] = 'ok';
  if (!r || !r.deflectionOk || !(ratio <= 1.0)) status = 'fail';
  else if (ratio > 0.8) status = 'warn';

  const diags: SolverDiagnostic[] = [];
  if (status === 'fail') {
    diags.push({ severity: 'error', code: 'DEFLECTION_EXCEEDED', message: 'diag.deflectionExceeded', source: 'serviceability', details: { computed: deltaTotal, limit, ratio } });
  } else if (status === 'warn') {
    diags.push({ severity: 'warning', code: 'DEFLECTION_HIGH', message: 'diag.deflectionHigh', source: 'serviceability', details: { computed: deltaTotal, limit, ratio } });
  }

  return { deltaImm: deltaAbs, deltaLT, deltaTotal, limit, ratio, span: L, limitDivisor: divisor, limitLength, status, steps, diagnostics: diags.length > 0 ? diags : undefined };
}
