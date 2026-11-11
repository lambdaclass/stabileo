import type { Enclosure, Exposure } from '../cirsoc102/wind';
import { CP_SIDE_WALL, CP_WINDWARD_WALL, cpLeewardWall, internalPressureCoefficient } from '../cirsoc102/wind';
import { A7, FT, PSF } from './refs';

/** Table 26.11-1, zg in ft as printed. */
export const EXPOSURE_7_22: Readonly<Record<Exposure, { alpha: number; zgFt: number }>> = Object.freeze({
  B: { alpha: 7.5, zgFt: 3280 },
  C: { alpha: 9.8, zgFt: 2460 },
  D: { alpha: 11.5, zgFt: 1935 },
});
export const Z_MIN_M = 15 * FT;
export const KD_BUILDING = 0.85;
export const G_RIGID = 0.85;
export const MIN_WALL_KNM2 = 16 * PSF;

export const REF = {
  kz: A7('26.10.1', 'velocity pressure exposure coefficient'),
  exposure: A7('Table 26.11-1', 'terrain exposure constants'),
  qz: A7('26.10-1', 'velocity pressure'),
  kd: A7('Table 26.6-1', 'wind directionality factor'),
  ke: A7('Table 26.9-1', 'ground elevation factor'),
  kzt: A7('26.8', 'topographic effects'),
  g: A7('26.11.1', 'gust-effect factor, rigid'),
  gcpi: A7('Table 26.13-1', 'internal pressure coefficient'),
  cp: A7('Figure 27.3-1', 'external pressure coefficients'),
  p: A7('27.3-1', 'design wind pressure, MWFRS'),
  cases: A7('Figure 27.3-8', 'design wind load cases'),
  min: A7('27.1.5', 'minimum design wind loads'),
};

export function kz(zM: number, exposure: Exposure): number {
  const { alpha, zgFt } = EXPOSURE_7_22[exposure];
  const zg = zgFt * FT;
  if (zM >= zg) return 2.41;
  return 2.41 * Math.pow(Math.max(zM, Z_MIN_M) / zg, 2 / alpha);
}

export const groundElevationKe = (zeM: number) => Math.exp(-0.000119 * zeM);

/** Eq. 26.10-1 in SI, N/m² with V in m/s: Kd is not in it (Eq. 27.3-1 takes it). */
export function velocityPressure(zM: number, w: { V: number; exposure: Exposure; kzt: number; ke: number }): number {
  return 0.613 * kz(zM, w.exposure) * w.kzt * w.ke * w.V * w.V;
}

export const gcpi = (enclosure: Enclosure) => internalPressureCoefficient(enclosure);

export interface WallCoefficients { windward: number; leeward: number; side: number }

export function wallCp(lOverB: number): WallCoefficients {
  return { windward: CP_WINDWARD_WALL, leeward: cpLeewardWall(lOverB), side: CP_SIDE_WALL };
}

export function designPressure(q: number, qi: number, cp: number, gcpiValue: number, G = G_RIGID, kd = KD_BUILDING): number {
  return q * kd * G * cp - qi * kd * gcpiValue;
}
