import type { RoofLiveInputs, RoofLiveResult } from '../cirsoc101/roof-live';
import { msg, round } from '../message';
import { A7, FT, PSF } from './refs';

const REF = A7('4.8.2', 'ordinary flat, pitched, and curved roofs');

/** ASCE/SEI 7-22 §4.8.2: Lr = 20 R1 R2 psf, 12 ≤ Lr ≤ 20 psf, with no light-roof class. */
export function asce7RoofLive(i: RoofLiveInputs): RoofLiveResult {
  const atFt2 = Math.max(0, i.atM2) / (FT * FT);
  const r1 = atFt2 <= 200 ? 1 : atFt2 < 600 ? 1.2 - 0.001 * atFt2 : 0.6;
  const f = 0.12 * Math.max(0, i.slopePercent);
  const r2 = f <= 4 ? 1 : f < 12 ? 1.2 - 0.05 * f : 0.6;
  const lr = Math.min(20, Math.max(12, 20 * r1 * r2)) * PSF;
  return { lr, r1, r2, refs: [REF], reason: msg('loads.asce7.roofLive', { at: round(i.atM2, 1), r1: round(r1, 3), f: round(f, 2), r2: round(r2, 3), lr: round(lr, 3) }) };
}
