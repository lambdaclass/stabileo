import type { Materials } from '../types';
import { ACI_BENDS } from '../bars';
import type { BendRules } from '../shape';

export const GAMMA_MC = 1.5;
export const GAMMA_MS = 1.15;
export const ES = 2e5;
export const EPS_CU = 0.003;
export const toConfirm = (label: string): string => `rcSheets.ts500.u.${label.split('.').slice(2).join('.')}`;

/** ACI 318-19's mandrels and hooks (§25.3), assumed until TS 500's own are read. */
export const TS500_BENDS: BendRules = { ...ACI_BENDS, clause: 'ACI 318-19 §25.3', confirm: 'rcSheets.bbs.confirmTs500' };

export interface Ts500Mat {
  fck: number; fyk: number;
  fcd: number; fctk: number; fctd: number; fyd: number;
  k1: number; eyd: number; ec: number;
}

export const k1Of = (fck: number): number => Math.min(0.85, Math.max(0.7, 0.85 - 0.006 * (fck - 25)));

export function ts500Mat(m: Materials): Ts500Mat {
  const fck = m.fc, fyk = m.fy;
  const fctk = 0.35 * Math.sqrt(fck);
  const fyd = fyk / GAMMA_MS;
  return {
    fck, fyk, fcd: fck / GAMMA_MC, fctk, fctd: fctk / GAMMA_MC, fyd,
    k1: k1Of(fck), eyd: fyd / ES, ec: 3250 * Math.sqrt(fck) + 14000,
  };
}

export const rhoMinBeam = (t: Ts500Mat): number => 0.8 * t.fctd / t.fyd;

/** Axial force in kN, + compression; the bracket of 8.1.3 floored at zero for tension. */
export function axialFactor(nd: number, ac: number): number {
  const sigma = nd / (ac * 1000);
  return Math.max(0, nd >= 0 ? 1 + 0.07 * sigma : 1 + 0.3 * sigma);
}

/** Vcr of 8.1.3, kN: bw and d in m. */
export const vcrOf = (t: Ts500Mat, bw: number, d: number, nd = 0, ac = bw * d): number =>
  0.65 * t.fctd * bw * d * 1000 * axialFactor(nd, ac);

export const vmaxOf = (t: Ts500Mat, bw: number, d: number): number => 0.22 * t.fcd * bw * d * 1000;

/** Minimum shear reinforcement of 8.1.5, cm²/m over all legs. */
export const swMinOf = (t: Ts500Mat, bw: number): number => 0.3 * t.fctd / t.fyd * bw * 1e4;

/** Straight anchorage of a ribbed bar in tension (9.1), m. */
export function lbOf(t: Ts500Mat, dia: number, top = false): number {
  const phi = dia / 1000;
  const base = Math.max(0.12 * (t.fyd / t.fctd) * phi, 20 * phi);
  return top ? 1.4 * base : base;
}

export function alpha1(share: number): number {
  if (share <= 0.25 + 1e-9) return 1.2;
  if (share <= 1 / 3 + 1e-9) return 1.4;
  if (share <= 0.5 + 1e-9) return 1.6;
  return 1.8;
}

export const lapOf = (t: Ts500Mat, dia: number, top: boolean, share = 1): number => alpha1(share) * lbOf(t, dia, top);

export const isTopBar = (h: number, cover: number, stirrupDia: number, dia: number): boolean =>
  h - cover - stirrupDia / 1000 - dia / 2000 > 0.3;

export const minEccentricity = (h: number): number => 0.015 + 0.03 * h;
