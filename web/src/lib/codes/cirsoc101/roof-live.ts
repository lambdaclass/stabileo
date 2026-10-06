/**
 * CIRSOC 101-2025 §4.8.1 — the live load of a roof inaccessible except for maintenance, Lr,
 * per square metre of horizontal projection (`docs/codes/CIRSOC/markdown/cirsoc-101-2025`,
 * capítulo 4):
 *
 *   heavy roofs, total weight > 0,5 kN/m²   Lr = 0,96 R1 R2,  0,58 ≤ Lr ≤ 0,96   (4.8.a)
 *     R1 = 1 (At < 20 m²) · 1,2 − 0,01076 At (20 ≤ At ≤ 60) · 0,60 (At > 60)
 *     R2 = 1 (F ≤ 4) · 1,2 − 0,05 F (4 < F < 12) · 0,60 (F ≥ 12),  F = 0,12 × slope in %
 *
 *   light roofs, total weight ≤ 0,5 kN/m²   Lr = 0,45 R1 R2,  0,203 ≤ Lr ≤ 0,765  (4.8.b)
 *     R1 = 1 (At < 20 m²) · 1,125 − 0,00625 At (20 ≤ At ≤ 60) · 0,75 (At > 60)
 *     R2 = 1,70 (0 ≤ p < 3) · 1,04 − 0,008 p (3 ≤ p ≤ 55) · 0,60 (p > 55),  p = slope in %
 *
 * The total weight is the supporting structure's plus the cladding's (§4.8.1). Heavy
 * prefabricated commercial or industrial roofs spanning 12 m or more, maintained only by
 * painting or membranes of at most 0,10 kN/m² and with a section that does not hold hail, may
 * take the light values; the reader says so by choosing a light roof.
 *
 * Roofs used for gardens, assembly or another occupancy carry the live load of that occupancy,
 * reduced by §4.7 (§4.8.2): they are not this function's.
 *
 * Pure: no store.
 */
import { clause, type ClauseRef } from '../regulation';
import { msg, round, type EngineMessage } from '../message';

export const REF_LR = clause('cirsoc-101', '2025', '4.8.1', 'cubiertas inaccesibles salvo con fines de mantenimiento');
const REF_HEAVY = clause('cirsoc-101', '2025', '4.8.1.(a)', 'cubiertas pesadas');
const REF_LIGHT = clause('cirsoc-101', '2025', '4.8.1.(b)', 'cubiertas livianas');

export type RoofWeight = 'heavy' | 'light';

/** §4.8.1: heavy above 0,5 kN/m² of supporting structure and cladding. */
export const roofWeightClass = (totalKNm2: number): RoofWeight => (totalKNm2 > 0.5 ? 'heavy' : 'light');

export interface RoofLiveInputs {
  weight: RoofWeight;
  /** Tributary area of the member, m². */
  atM2: number;
  /** Slope of the roof surface, %. */
  slopePercent: number;
}

export interface RoofLiveResult {
  lr: number;
  r1: number;
  r2: number;
  refs: ClauseRef[];
  reason: EngineMessage;
}

export function roofLiveLoad(i: RoofLiveInputs): RoofLiveResult {
  const at = Math.max(0, i.atM2);
  const p = Math.max(0, i.slopePercent);
  if (i.weight === 'heavy') {
    const r1 = at < 20 ? 1 : at <= 60 ? 1.2 - 0.01076 * at : 0.6;
    const f = 0.12 * p;
    const r2 = f <= 4 ? 1 : f < 12 ? 1.2 - 0.05 * f : 0.6;
    const lr = Math.min(0.96, Math.max(0.58, 0.96 * r1 * r2));
    return { lr, r1, r2, refs: [REF_LR, REF_HEAVY], reason: msg('loads.cirsoc101.roofLive.heavy', { at: round(at, 1), r1: round(r1, 3), f: round(f, 2), r2: round(r2, 3), lr: round(lr, 3) }) };
  }
  const r1 = at < 20 ? 1 : at <= 60 ? 1.125 - 0.00625 * at : 0.75;
  const r2 = p < 3 ? 1.7 : p <= 55 ? 1.04 - 0.008 * p : 0.6;
  const lr = Math.min(0.765, Math.max(0.203, 0.45 * r1 * r2));
  return { lr, r1, r2, refs: [REF_LR, REF_LIGHT], reason: msg('loads.cirsoc101.roofLive.light', { at: round(at, 1), r1: round(r1, 3), p: round(p, 1), r2: round(r2, 3), lr: round(lr, 3) }) };
}
