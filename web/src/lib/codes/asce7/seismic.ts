import { msg, round, type EngineMessage } from '../message';
import type { RiskCategory } from './inputs';
import { A7 } from './refs';

export const REF_SEIS = {
  params: A7('11.4', 'seismic ground motion values'),
  sds: A7('11.4.4', 'design spectral acceleration parameters'),
  ie: A7('Table 1.5-2', 'importance factors'),
  sdc: A7('11.6', 'seismic design category'),
  system: A7('Table 12.2-1', 'seismic force-resisting systems'),
  rho: A7('12.3.4', 'redundancy'),
  ev: A7('12.4.2.2', 'vertical seismic load effect'),
  orthogonal: A7('12.5', 'direction of loading'),
  w: A7('12.7.2', 'effective seismic weight'),
  cs: A7('12.8.1.1', 'calculation of seismic response coefficient'),
  ta: A7('12.8-7', 'approximate fundamental period'),
  cu: A7('Table 12.8-1', 'upper limit on calculated period'),
  ct: A7('Table 12.8-2', 'period parameters Ct and x'),
  fx: A7('12.8.3', 'vertical distribution of seismic forces'),
  torsion: A7('12.8.4.2', 'accidental torsion'),
};

export const IMPORTANCE_SEISMIC: Readonly<Record<RiskCategory, number>> = { I: 1, II: 1, III: 1.25, IV: 1.5 };

export interface SeismicSystem { r: number; omega0: number; cd: number }

export const SYSTEMS: Readonly<Record<string, SeismicSystem>> = Object.freeze({
  steelSMF: { r: 8, omega0: 3, cd: 5.5 },
  steelIMF: { r: 4.5, omega0: 3, cd: 4 },
  steelOMF: { r: 3.5, omega0: 3, cd: 3 },
  concreteSMF: { r: 8, omega0: 3, cd: 5.5 },
  concreteIMF: { r: 5, omega0: 3, cd: 4.5 },
  concreteOMF: { r: 3, omega0: 3, cd: 2.5 },
  steelEBF: { r: 8, omega0: 2, cd: 4 },
  steelSCBF: { r: 6, omega0: 2, cd: 5 },
  steelOCBF: { r: 3.25, omega0: 2, cd: 3.25 },
  steelBRBF: { r: 8, omega0: 2.5, cd: 5 },
  specialRCWallBearing: { r: 5, omega0: 2.5, cd: 5 },
  ordinaryRCWallBearing: { r: 4, omega0: 2.5, cd: 4 },
  specialRCWallFrame: { r: 6, omega0: 2.5, cd: 5 },
  ordinaryRCWallFrame: { r: 5, omega0: 2.5, cd: 4.5 },
  dualSMFSCBF: { r: 7, omega0: 2.5, cd: 5.5 },
  dualSMFSpecialRCWall: { r: 7, omega0: 2.5, cd: 5.5 },
  steelNotDetailed: { r: 3, omega0: 3, cd: 3 },
});

/** Table 12.8-2 in SI (hn in m). */
export const PERIOD_PARAMETERS: Readonly<Record<string, { ct: number; x: number }>> = Object.freeze({
  steelMRF: { ct: 0.0724, x: 0.8 },
  concreteMRF: { ct: 0.0466, x: 0.9 },
  steelEBFBRBF: { ct: 0.0731, x: 0.75 },
  other: { ct: 0.0488, x: 0.75 },
});

/** Table 12.8-1, read linearly between the printed S_D1. */
export function upperLimitCu(sd1: number): number {
  const pts: Array<[number, number]> = [[0.1, 1.7], [0.15, 1.6], [0.2, 1.5], [0.3, 1.4], [0.4, 1.4]];
  if (sd1 <= pts[0]![0]) return pts[0]![1];
  for (let i = 1; i < pts.length; i++) {
    const [s0, c0] = pts[i - 1]!, [s1, c1] = pts[i]!;
    if (sd1 <= s1) return c0 + ((c1 - c0) * (sd1 - s0)) / (s1 - s0);
  }
  return 1.4;
}

type Sdc = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
const rank = (s: Sdc) => 'ABCDEF'.indexOf(s);

export function designCategory(sds: number, sd1: number, s1: number | undefined, rc: RiskCategory): Sdc {
  const iv = rc === 'IV';
  if (s1 !== undefined && s1 >= 0.75) return iv ? 'F' : 'E';
  const bySds: Sdc = sds < 0.167 ? 'A' : sds < 0.33 ? (iv ? 'C' : 'B') : sds < 0.5 ? (iv ? 'D' : 'C') : 'D';
  const bySd1: Sdc = sd1 < 0.067 ? 'A' : sd1 < 0.133 ? (iv ? 'C' : 'B') : sd1 < 0.2 ? (iv ? 'D' : 'C') : 'D';
  return rank(bySds) >= rank(bySd1) ? bySds : bySd1;
}

export interface CsResult { cs: number; governs: 'sds' | 'period' | 'longPeriod' | 'minimum' | 's1'; steps: EngineMessage }

export function responseCoefficient(i: { sds: number; sd1: number; s1?: number; r: number; ie: number; t: number; tl: number }): CsResult {
  const rie = i.r / i.ie;
  const base = i.sds / rie;
  const cap = i.t <= i.tl ? i.sd1 / (i.t * rie) : (i.sd1 * i.tl) / (i.t * i.t * rie);
  const min = Math.max(0.044 * i.sds * i.ie, 0.01);
  const minS1 = i.s1 !== undefined && i.s1 >= 0.6 ? (0.5 * i.s1) / rie : 0;
  let cs = Math.min(base, cap), governs: CsResult['governs'] = base <= cap ? 'sds' : i.t <= i.tl ? 'period' : 'longPeriod';
  if (min > cs) { cs = min; governs = 'minimum'; }
  if (minS1 > cs) { cs = minS1; governs = 's1'; }
  return {
    cs, governs,
    steps: msg('loads.asce7.seismic.derivation.cs', { base: round(base, 4), cap: round(cap, 4), min: round(min, 4), minS1: round(minS1, 4), cs: round(cs, 4), governs }),
  };
}

export const distributionExponent = (t: number) => (t <= 0.5 ? 1 : t >= 2.5 ? 2 : 1 + (t - 0.5) / 2);

export function verticalDistribution(levels: ReadonlyArray<{ h: number; w: number }>, v: number, k: number): number[] {
  const sum = levels.reduce((s, l) => s + l.w * Math.pow(l.h, k), 0);
  return levels.map((l) => (sum > 0 ? (v * l.w * Math.pow(l.h, k)) / sum : 0));
}
