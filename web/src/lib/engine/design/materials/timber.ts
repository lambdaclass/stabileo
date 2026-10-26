/**
 * Timber members by the adjustment-factor method of CIRSOC 601 (the NDS formulation it adopts),
 * in its load-and-resistance format: a reference value F becomes F' = F · KF · φ · λ · CM · Ct ·
 * CF · (CP | CL), so the project's factored combinations are read as they are.
 *
 * Reference values are the material's own (`TimberReference`): this app ships no Argentine
 * grade table, and a value typed in is a value the engineer answers for. Rectangular and round
 * sections (a round one as the square of equal area). Checks per governing demand: tension,
 * compression with column stability (CP), bending about each axis with beam stability (CL) on the
 * strong one, shear, and combined bending with axial force. Stresses in MPa, forces in kN, m.
 */
import { statusOfRatio, type CheckInput, type CheckRow } from '../../../design-contract';

export interface TimberReference {
  /** Reference design values, MPa: bending, tension and compression parallel, compression perpendicular, shear. */
  fb: number; ft: number; fc: number; fcPerp?: number; fv: number;
  /** Modulus of elasticity and its stability value, MPa. Emin absent: from E (0.365·E, NDS D.2). */
  e: number; emin?: number;
  kind: 'sawn' | 'glulam';
  /** Size factors on bending, tension and compression; 1 where the grade has none. */
  cf?: { b?: number; t?: number; c?: number };
}

export interface TimberSettings {
  /** Wet service (moisture content above 19 %): the CM factors apply. */
  wet: boolean;
  /** Temperature factor (Ct), 1 up to 38 °C sustained. */
  ct?: number;
}

/** Format conversion factor KF and resistance factor φ by property (NDS Table N1, N2). */
export const KF = { b: 2.54, t: 2.70, v: 2.88, c: 2.40, cPerp: 1.67, emin: 1.76 } as const;
export const PHI = { b: 0.85, t: 0.80, v: 0.75, c: 0.90, cPerp: 0.90, emin: 0.85 } as const;
/** Wet service factors for sawn lumber and for glulam (NDS 4A, 5A). */
const CM = {
  sawn: { b: 0.85, t: 1.0, v: 0.97, c: 0.8, cPerp: 0.67, e: 0.9 },
  glulam: { b: 0.8, t: 0.8, v: 0.875, c: 0.73, cPerp: 0.53, e: 0.833 },
} as const;

/**
 * The time effect factor λ of a combination, from the kinds of load it holds (NDS N.3.3):
 * 0.6 permanent load alone; 0.8 with occupancy live load; 1.0 with wind or earthquake; 1.25 impact.
 */
export function timeEffectFactor(caseTypes: readonly string[]): number {
  const t = new Set(caseTypes.map((x) => x.toUpperCase()));
  if (t.has('IMPACT')) return 1.25;
  if (t.has('W') || t.has('E') || t.has('EX') || t.has('EY')) return 1.0;
  if ([...t].some((x) => x !== 'D' && x !== 'G' && x !== 'SW')) return 0.8;
  return 0.6;
}

export interface TimberSection { b: number; d: number; round?: boolean }

export function timberSection(s: { b?: number; h?: number; shape?: string; a: number }): TimberSection | null {
  const sh = (s.shape ?? '').toLowerCase();
  if ((sh === 'circle' || sh === 'round') && s.h) { const side = (s.h * Math.sqrt(Math.PI)) / 2; return { b: side, d: side, round: true }; }
  if (s.b && s.h) return { b: s.b, d: s.h };
  return null;
}

export interface TimberDemand { n: number; vStrong: number; vWeak: number; mStrong: number; mWeak: number; comboName: string; x: number; caseTypes: readonly string[] }

/** Column stability factor CP (NDS 3.7.1), and the Euler stress FcE. */
export function columnStability(fcStar: number, eminP: number, leOverD: number, kind: 'sawn' | 'glulam') {
  const c = kind === 'glulam' ? 0.9 : 0.8;
  const fcE = (0.822 * eminP) / leOverD ** 2;
  const a = fcE / fcStar, k = (1 + a) / (2 * c);
  return { cp: k - Math.sqrt(k * k - a / c), fcE };
}

/** Beam stability factor CL (NDS 3.3.3), with the effective length for a uniform load. */
export function beamStability(fbStar: number, eminP: number, lu: number, b: number, d: number) {
  if (d <= b || lu <= 0) return { cl: 1, le: 0, rb: 0 };
  const r = lu / d;
  const le = r < 7 ? 2.06 * lu : r <= 14.3 ? 1.63 * lu + 3 * d : 1.84 * lu;
  const rb = Math.sqrt((le * d) / (b * b));
  const fbE = (1.2 * eminP) / (rb * rb);
  const a = fbE / fbStar;
  return { cl: (1 + a) / 1.9 - Math.sqrt(((1 + a) / 1.9) ** 2 - a / 0.95), le, rb, fbE };
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const inp = (symbol: string, value: number, unit?: string): CheckInput => ({ symbol, value: r3(value), ...(unit ? { unit } : {}) });

/** All the rows of one timber member over its governing demands; each check at its worst demand. */
export function timberCheckRows(
  ref: TimberReference, sec: TimberSection, set: TimberSettings,
  geo: { L: number; Lb: number; kStrong?: number; kWeak?: number }, demands: readonly TimberDemand[],
): CheckRow[] {
  const cm = set.wet ? CM[ref.kind] : { b: 1, t: 1, v: 1, c: 1, cPerp: 1, e: 1 };
  const ct = set.ct ?? 1;
  const { b, d } = sec, A = b * d, Sx = (b * d * d) / 6, Sy = (d * b * b) / 6;
  const emin = ref.emin ?? 0.365 * ref.e;
  const eminP = emin * cm.e * ct * KF.emin * PHI.emin;
  const leS = (geo.kStrong ?? 1) * geo.L, leW = (geo.kWeak ?? 1) * geo.L;
  const slS = leS / d, slW = leW / b, sl = Math.max(slS, slW);
  const worst = new Map<string, CheckRow>();
  const keep = (r: CheckRow) => { const w = worst.get(r.title); if (!w || (r.ratio ?? 0) > (w.ratio ?? 0)) worst.set(r.title, r); };
  const row = (key: string, title: string, clause: string, formula: string, demand: number, capacity: number, unit: string, inputs: CheckInput[], dm: TimberDemand, steps: string[]): CheckRow => {
    const ratio = capacity > 0 ? demand / capacity : Number.POSITIVE_INFINITY;
    return { code: 'cirsoc-601', edition: '2016', clause, title, titleKey: `check.timber.${key}`, formula, inputs, demand: r3(demand), capacity: r3(capacity), unit, ratio: r3(ratio), status: statusOfRatio(ratio), combination: dm.comboName, location: `x = ${dm.x.toFixed(2)} m`, derivation: steps };
  };
  for (const dm of demands) {
    const lam = timeEffectFactor(dm.caseTypes);
    const kf = (p: keyof typeof KF) => KF[p] * PHI[p] * lam;
    const fc = Math.max(0, -dm.n) / A / 1000, ft = Math.max(0, dm.n) / A / 1000;
    const fbS = Math.abs(dm.mStrong) / Sx / 1000, fbW = Math.abs(dm.mWeak) / Sy / 1000;
    // Adjusted values.
    const ftP = ref.ft * cm.t * ct * (ref.cf?.t ?? 1) * kf('t');
    const fcStar = ref.fc * cm.c * ct * (ref.cf?.c ?? 1) * kf('c');
    const { cp, fcE } = columnStability(fcStar, eminP, sl, ref.kind);
    const fcP = fcStar * cp;
    const fbStar = ref.fb * cm.b * ct * (ref.cf?.b ?? 1) * kf('b');
    const bs = beamStability(fbStar, eminP, geo.Lb, b, d);
    const fbPS = fbStar * bs.cl, fbPW = fbStar;
    const fvP = ref.fv * cm.v * ct * kf('v');
    const common = [`λ = ${lam}`, `CM: ${set.wet ? 'wet service' : 'dry service'}`, `Ct = ${ct}`];
    if (ft > 0) keep(row('tension', 'Tension', '3.8', 'Tu ≤ Tn\' = Ft\'·A', ft * A * 1000, ftP * A * 1000, 'kN', [inp('Ft', ref.ft, 'MPa'), inp("Ft'", ftP, 'MPa'), inp('A', A * 1e4, 'cm²')], dm, [...common, `Ft' = Ft·CM·Ct·CF·KF·φt·λ = ${ftP.toFixed(2)} MPa`]));
    if (fc > 0) {
      keep(row('compression', 'Compression', '3.6', 'Pu ≤ Pn\' = Fc\'·A', fc * A * 1000, fcP * A * 1000, 'kN', [inp('Fc', ref.fc, 'MPa'), inp('Fc*', fcStar, 'MPa'), inp('FcE', fcE, 'MPa'), inp('CP', cp), inp('ℓe/d', sl), inp("Fc'", fcP, 'MPa')], dm,
        [...common, `ℓe/d = ${sl.toFixed(1)}`, `FcE = 0,822·Emin'/(ℓe/d)² = ${fcE.toFixed(2)} MPa`, `CP = ${cp.toFixed(3)} (3.7.1)`]));
      keep(row('slenderness', 'Slenderness', '3.7.1.4', 'ℓe/d ≤ 50', sl, 50, '', [inp('ℓe/d', sl)], dm, []));
    }
    if (fbS > 0) keep(row('bendingStrong', 'Bending, strong axis', '3.3', 'Mu ≤ Mn\' = Fb\'·S', fbS * Sx * 1000, fbPS * Sx * 1000, 'kN·m', [inp('Fb', ref.fb, 'MPa'), inp('CL', bs.cl), inp("Fb'", fbPS, 'MPa'), inp('S', Sx * 1e6, 'cm³')], dm,
      [...common, bs.cl < 1 ? `ℓe = ${bs.le.toFixed(2)} m, RB = ${bs.rb.toFixed(1)}, CL = ${bs.cl.toFixed(3)} (3.3.3)` : 'CL = 1']));
    if (fbW > 0) keep(row('bendingWeak', 'Bending, weak axis', '3.3', 'Mu ≤ Mn\' = Fb\'·S', fbW * Sy * 1000, fbPW * Sy * 1000, 'kN·m', [inp("Fb'", fbPW, 'MPa'), inp('S', Sy * 1e6, 'cm³')], dm, common));
    const v = Math.max(Math.abs(dm.vStrong), Math.abs(dm.vWeak));
    if (v > 0) keep(row('shear', 'Shear', '3.4', 'Vu ≤ Vn\' = (2/3)·Fv\'·A', v, ((2 / 3) * fvP * A) * 1000, 'kN', [inp("Fv'", fvP, 'MPa'), inp('A', A * 1e4, 'cm²')], dm, common));
    // Combined.
    if (fc > 0 && (fbS > 0 || fbW > 0)) {
      const fcE1 = (0.822 * eminP) / slS ** 2, fcE2 = (0.822 * eminP) / slW ** 2, fbE = bs.fbE ?? Infinity;
      const t1 = fbS / (fbPS * (1 - fc / fcE1)), t2 = fbW / (fbPW * (1 - fc / fcE2 - (fbS / fbE) ** 2));
      const u = (fc / fcP) ** 2 + (fbS > 0 ? t1 : 0) + (fbW > 0 ? t2 : 0);
      keep(row('compressionBending', 'Compression and bending', '3.9.2', "(fc/Fc')² + fb1/[Fb1'(1−fc/FcE1)] + fb2/[Fb2'(1−fc/FcE2−(fb1/FbE)²)] ≤ 1", u, 1, '', [inp('fc', fc, 'MPa'), inp('fb1', fbS, 'MPa'), inp('fb2', fbW, 'MPa'), inp('FcE1', fcE1, 'MPa'), inp('FcE2', fcE2, 'MPa')], dm, common));
    }
    if (ft > 0 && (fbS > 0 || fbW > 0)) {
      const u = ft / ftP + fbS / fbStar + fbW / fbStar;
      keep(row('tensionBending', 'Tension and bending', '3.9.1', "ft/Ft' + fb/Fb* ≤ 1", u, 1, '', [inp('ft', ft, 'MPa'), inp('fb', fbS + fbW, 'MPa'), inp('Fb*', fbStar, 'MPa')], dm, common));
    }
  }
  return [...worst.values()];
}
