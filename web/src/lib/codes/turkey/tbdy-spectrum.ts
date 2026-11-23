import type { SoilClass } from './inputs';

type Row = readonly [number, number, number, number, number, number];

const SS_POINTS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5] as const;
const S1_POINTS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6] as const;

const FS: Readonly<Record<Exclude<SoilClass, 'ZF'>, Row>> = {
  ZA: [0.8, 0.8, 0.8, 0.8, 0.8, 0.8],
  ZB: [0.9, 0.9, 0.9, 0.9, 0.9, 0.9],
  ZC: [1.3, 1.3, 1.2, 1.2, 1.2, 1.2],
  ZD: [1.6, 1.4, 1.2, 1.1, 1.0, 1.0],
  ZE: [2.4, 1.7, 1.3, 1.1, 0.9, 0.8],
};

const F1: Readonly<Record<Exclude<SoilClass, 'ZF'>, Row>> = {
  ZA: [0.8, 0.8, 0.8, 0.8, 0.8, 0.8],
  ZB: [0.8, 0.8, 0.8, 0.8, 0.8, 0.8],
  ZC: [1.5, 1.5, 1.5, 1.5, 1.5, 1.4],
  ZD: [2.4, 2.2, 2.0, 1.9, 1.8, 1.7],
  ZE: [4.2, 3.3, 2.8, 2.4, 2.2, 2.0],
};

function interpolate(points: readonly number[], row: Row, x: number): number {
  if (x <= points[0]!) return row[0];
  if (x >= points[points.length - 1]!) return row[row.length - 1]!;
  let i = 0;
  while (points[i + 1]! < x) i++;
  const t = (x - points[i]!) / (points[i + 1]! - points[i]!);
  return row[i]! + (row[i + 1]! - row[i]!) * t;
}

export function siteCoefficients(soil: Exclude<SoilClass, 'ZF'>, ss: number, s1: number): { fs: number; f1: number } {
  return { fs: interpolate(SS_POINTS, FS[soil], ss), f1: interpolate(S1_POINTS, F1[soil], s1) };
}

export const TL = 6;

export interface Spectrum { ss: number; s1: number; fs: number; f1: number; sds: number; sd1: number; ta: number; tb: number; tl: number }

export function designSpectrum(soil: Exclude<SoilClass, 'ZF'>, ss: number, s1: number): Spectrum {
  const { fs, f1 } = siteCoefficients(soil, ss, s1);
  const sds = ss * fs, sd1 = s1 * f1;
  return { ss, s1, fs, f1, sds, sd1, ta: 0.2 * sd1 / sds, tb: sd1 / sds, tl: TL };
}

export function sae(t: number, s: Spectrum): number {
  if (t <= s.ta) return (0.4 + 0.6 * t / s.ta) * s.sds;
  if (t <= s.tb) return s.sds;
  if (t <= s.tl) return s.sd1 / t;
  return s.sd1 * s.tl / (t * t);
}

export function ra(t: number, r: number, d: number, i: number, tb: number): number {
  return t > tb ? r / i : d + (r / i - d) * t / tb;
}

export function saR(t: number, s: Spectrum, r: number, d: number, i: number): number {
  return sae(t, s) / ra(t, r, d, i, s.tb);
}

export const IMPORTANCE: Readonly<Record<1 | 2 | 3, number>> = { 1: 1.5, 2: 1.2, 3: 1.0 };

export type Dts = '1' | '1a' | '2' | '2a' | '3' | '3a' | '4' | '4a';

export function designClass(sds: number, bks: 1 | 2 | 3): Dts {
  const n = sds < 0.33 ? '4' : sds < 0.5 ? '3' : sds < 0.75 ? '2' : '1';
  return (bks === 1 ? `${n}a` : n) as Dts;
}

export const dtsGroup = (dts: Dts): 1 | 3 | 4 => (dts.startsWith('1') || dts.startsWith('2') ? 1 : dts.startsWith('3') ? 3 : 4);

const BYS_LIMITS: Readonly<Record<1 | 3 | 4, readonly number[]>> = {
  1: [70, 56, 42, 28, 17.5, 10.5, 7],
  3: [91, 70, 56, 42, 28, 17.5, 10.5],
  4: [105, 91, 56, 42, 28, 17.5, 10.5],
};

export function heightClass(hn: number, dts: Dts): number {
  const lim = BYS_LIMITS[dtsGroup(dts)];
  for (let k = 0; k < lim.length; k++) if (hn > lim[k]! + 1e-9) return k + 1;
  return 8;
}

export interface SystemRow { key: string; r: number; d: number; minBys: number | null; ct: number | null; ductility: 'high' | 'mixed' | 'limited'; singleStorey?: boolean }

const row = (key: string, r: number, d: number, minBys: number | null, ct: number | null, ductility: SystemRow['ductility'], singleStorey = false): SystemRow =>
  ({ key, r, d, minBys, ct, ductility, ...(singleStorey ? { singleStorey } : {}) });

export const SYSTEMS: readonly SystemRow[] = Object.freeze([
  row('A11', 8, 3, 3, 0.1, 'high'),
  row('A12', 7, 2.5, 2, null, 'high'),
  row('A13', 6, 2.5, 2, null, 'high'),
  row('A14', 8, 2.5, 2, 0.07, 'high'),
  row('A15', 7, 2.5, 2, 0.07, 'high'),
  row('A16', 3, 2, null, 0.07, 'high', true),
  row('A21', 6, 2.5, 4, 0.07, 'mixed'),
  row('A22', 5, 2.5, 4, 0.07, 'mixed'),
  row('A23', 6, 2.5, 6, 0.07, 'mixed'),
  row('A24', 5, 2.5, 6, 0.07, 'mixed'),
  row('A31', 4, 2.5, 7, 0.1, 'limited'),
  row('A32', 4, 2, 6, null, 'limited'),
  row('A33', 4, 2, 6, 0.07, 'limited'),
  row('C11', 8, 3, 3, 0.08, 'high'),
  row('C12', 8, 2.5, 2, 0.08, 'high'),
  row('C13', 5, 2, 4, 0.08, 'high'),
  row('C14', 8, 3, 2, 0.07, 'high'),
  row('C15', 6, 2.5, 2, 0.07, 'high'),
  row('C16', 4, 2, null, 0.07, 'high', true),
  row('C21', 6, 2.5, 4, 0.07, 'mixed'),
  row('C22', 5, 2, 4, 0.07, 'mixed'),
  row('C31', 4, 2.5, 7, 0.08, 'limited'),
  row('C32', 3, 2, 8, 0.08, 'limited'),
  row('C33', 4, 2, 7, 0.08, 'limited'),
]);

export const findSystem = (key: string | undefined) => SYSTEMS.find((s) => s.key === key);

export function systemRefusal(s: SystemRow, dts: Dts, bys: number, storeys: number, hn: number): string | null {
  if (s.singleStorey) return storeys > 1 || hn > 12 ? 'singleStorey' : null;
  if (s.minBys !== null && bys < s.minBys) return 'height';
  if (s.ductility === 'limited' && dts.endsWith('a')) return 'limitedInA';
  if ((s.key === 'A31' || s.key === 'C31') && dtsGroup(dts) === 1) return 'limitedFrame';
  if (s.ductility === 'mixed' && bys >= 6 && (dts === '1a' || dts === '2a')) return 'mixedInA';
  return null;
}

export function equivalentMethodAllowed(dts: Dts, bys: number, regular: boolean): boolean {
  const g = dtsGroup(dts);
  const min = regular ? (g === 1 ? 4 : 5) : (g === 1 ? 5 : 6);
  return bys >= min;
}

export const empiricalPeriodAllowed = (dts: Dts, bys: number) => dtsGroup(dts) !== 1 || bys >= 6;

export const empiricalPeriod = (ct: number, hn: number) => ct * hn ** 0.75;

export const MASS_PARTICIPATION: Readonly<Record<'storage' | 'assembly' | 'residential', number>> = { storage: 0.8, assembly: 0.6, residential: 0.3 };

export const SNOW_IN_MASS = 0.3;

export function storeyForces(levels: ReadonlyArray<{ h: number; w: number }>, vt: number): { forces: number[]; deltaFN: number } {
  const n = levels.length;
  const deltaFN = 0.0075 * n * vt;
  const sum = levels.reduce((s, l) => s + l.w * l.h, 0);
  const forces = levels.map((l) => (sum > 0 ? (vt - deltaFN) * l.w * l.h / sum : 0));
  if (n > 0) forces[n - 1]! += deltaFN;
  return { forces, deltaFN };
}

export function baseShear(w: number, sar: number, i: number, sds: number): { vt: number; minimumGoverns: boolean } {
  const v = w * sar, min = 0.04 * w * i * sds;
  return { vt: Math.max(v, min), minimumGoverns: min > v };
}
