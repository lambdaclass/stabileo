import { barArea } from '../bars';
import type { BeamContext } from '../beam-row';
import type { Stirrups, TorsionMode } from '../types';
import { swMinOf, vcrOf, vmaxOf, type Ts500Mat } from './basis';

export interface ShearState {
  d: number; vd: number; nd: number;
  vcr: number; vc: number; vmax: number;
  /** cm²/m over all legs. */
  swReq: number; swMin: number;
  sMax: number; dense: boolean;
}

export function shearState(t: Ts500Mat, b: number, h: number, d: number, vd: number, nd: number): ShearState {
  const vcr = vcrOf(t, b, d, nd, b * h);
  const vc = 0.8 * vcr;
  const swReq = vd > vcr ? (vd - vc) / (t.fyd * 1000 * d) * 1e4 : 0;
  const dense = vd > 3 * vcr;
  return { d, vd, nd, vcr, vc, vmax: vmaxOf(t, b, d), swReq, swMin: swMinOf(t, b), sMax: dense ? Math.min(d / 4, 0.3) : Math.min(d / 2, 0.6), dense };
}

export const vrOf = (t: Ts500Mat, s: ShearState, st: Stirrups): number =>
  s.vc + (st.spacing > 0 ? st.legs * barArea(st.dia) * 1e-4 / st.spacing : 0) * t.fyd * 1000 * s.d;

export interface TorsionState {
  se: number; tcr: number; td: number; tdDesign: number;
  interaction: number; design: boolean;
  ak: number; uk: number;
  /** cm²/m for one leg and cm² of longitudinal steel. */
  aoS: number; asl: number;
  vt: number; vtMax: number; sectionOk: boolean;
  sMax: number;
}

export function torsionState(t: Ts500Mat, c: BeamContext, b: number, h: number, sh: ShearState, td: number, mode: TorsionMode, sd = c.stirrupDia): TorsionState {
  const x = Math.min(b, h), y = Math.max(b, h);
  const se = x * x * y / 3;
  const tcr = 1.35 * t.fctd * se * 1000;
  const tdDesign = mode === 'compatibility' ? Math.min(td, tcr) : td;
  const interaction = (sh.vcr > 0 ? (sh.vd / sh.vcr) ** 2 : 0) + (tcr > 0 ? (tdDesign / tcr) ** 2 : 0);
  const design = tdDesign > 1e-6 && interaction > 1 + 1e-9;
  const bk = b - 2 * c.cover - sd / 1000, hk = h - 2 * c.cover - sd / 1000;
  const ak = Math.max(1e-6, bk * hk), uk = 2 * (bk + hk);
  const aoS = design ? tdDesign / (2 * ak * t.fyd * 1000) * 1e4 : 0;
  const asl = design ? tdDesign * uk / (2 * ak * t.fyd * 1000) * 1e4 : 0;
  const vt = sh.vd + 1.6 * tdDesign / b;
  return { se, tcr, td, tdDesign, interaction, design, ak, uk, aoS, asl, vt, vtMax: sh.vmax, sectionOk: !design || vt <= sh.vmax + 1e-6, sMax: design ? Math.min(uk / 8, 0.3) : Infinity };
}
