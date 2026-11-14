import { EC2_RECOMMENDED, EC2_UK, ec2Material, type Ec2Material, type Ec2Params } from '../../engine/design/eurocode/ec2-params';
import { ec2Shear } from '../../engine/design/eurocode/ec2-beam';
import type { BendRules } from '../shape';

export interface Ec2Set {
  p: Ec2Params;
  uk: boolean;
  punchingMaxCoeff: number;
  colBarMin: number;
}

export const EC2_SET: Ec2Set = { p: EC2_RECOMMENDED, uk: false, punchingMaxCoeff: 0.4, colBarMin: 8 };
export const UK_SET: Ec2Set = { p: EC2_UK, uk: true, punchingMaxCoeff: 0.5, colBarMin: 12 };

export interface Mat extends Ec2Material { fck: number; fyk: number; ec2: number; es: number; fctd: number }

export function matOf(fck: number, fyk: number, p: Ec2Params): Mat {
  const m = ec2Material(fck, fyk, p);
  const ec2 = fck <= 50 ? 0.002 : (2 + 0.085 * (fck - 50) ** 0.53) / 1000;
  const fctk = 0.7 * ec2Material(Math.min(fck, 60), fyk, p).fctm;
  return { ...m, fck, fyk, ec2, es: p.es, fctd: (p.alphaCT * fctk) / p.gammaC };
}

/** `y` is measured from the compressed face, which is the bottom for hogging. */
export interface Layer { y: number; area: number }
export interface Shape { b: number; h: number; bf?: number; hf?: number }

const KPA = 1000;

function block(x: number, s: Shape, m: Mat): { f: number; yc: number; depth: number } {
  const a = Math.min(m.lambda * x, s.h), sig = m.eta * m.fcd * KPA;
  if (s.bf && s.hf && s.bf > s.b) {
    const af = Math.min(a, s.hf), aw = Math.max(0, a - s.hf);
    const area = s.bf * af + s.b * aw;
    return { f: sig * area, yc: area > 0 ? (s.bf * af * af / 2 + s.b * aw * (s.hf + aw / 2)) / area : 0, depth: a };
  }
  return { f: sig * s.b * a, yc: a / 2, depth: a };
}

export function strainAt(y: number, x: number, h: number, m: Mat): number {
  if (x <= h) return (m.ecu3 * (x - y)) / x;
  return (m.ec2 * (x - y)) / (x - (1 - m.ec2 / m.ecu3) * h);
}

export function resultant(x: number, s: Shape, layers: readonly Layer[], m: Mat): { n: number; m: number } {
  const c = block(x, s, m);
  let n = c.f, mo = c.f * (s.h / 2 - c.yc);
  for (const l of layers) {
    const e = strainAt(l.y, x, s.h, m);
    let sig = Math.max(-m.fyd, Math.min(m.fyd, m.es * e)) * KPA;
    if (e > 0 && l.y < c.depth) sig -= m.eta * m.fcd * KPA;
    n += l.area * sig;
    mo += l.area * sig * (s.h / 2 - l.y);
  }
  return { n, m: mo };
}

export interface Capacity { mrd: number; x: number }

/** N is compression positive, the opposite of the solver's element forces. */
export function momentCapacity(N: number, s: Shape, layers: readonly Layer[], m: Mat): Capacity | null {
  let lo = 1e-7 * s.h, hi = 1e3 * s.h;
  if (resultant(hi, s, layers, m).n < N - 1e-9 || resultant(lo, s, layers, m).n > N + 1e-9) return null;
  for (let k = 0; k < 90; k++) { const mid = (lo + hi) / 2; if (resultant(mid, s, layers, m).n < N) lo = mid; else hi = mid; }
  const x = (lo + hi) / 2;
  return { mrd: resultant(x, s, layers, m).m, x };
}

export const xuLimit = (fck: number, p: Ec2Params) => (fck <= 50 ? p.xuLimitLow : p.xuLimitHigh);

export interface FlexReq { as: number; as2: number; x: number; z: number; ms: number; mlim: number }

export function flexuralSteel(M: number, N: number, s: Shape, d: number, d2: number, m: Mat, p: Ec2Params): FlexReq {
  const ms = M + N * (d - s.h / 2);
  if (!(M > 1e-9)) return { as: 0, as2: 0, x: 0, z: 0, ms, mlim: 0 };
  const xl = xuLimit(m.fck, p) * d;
  const mOf = (x: number) => { const c = block(x, s, m); return { mc: c.f * (d - c.yc), f: c.f, z: d - c.yc }; };
  const lim = mOf(xl);
  if (ms <= lim.mc) {
    let lo = 0, hi = xl;
    for (let k = 0; k < 80; k++) { const mid = (lo + hi) / 2; if (mOf(mid).mc < ms) lo = mid; else hi = mid; }
    const r = mOf(hi);
    return { as: Math.max(0, (r.f - N) / (m.fyd * KPA)), as2: 0, x: hi, z: r.z, ms, mlim: lim.mc };
  }
  const e2 = (m.ecu3 * (xl - d2)) / xl;
  const sig2 = (Math.min(m.fyd, m.es * e2) - (d2 < m.lambda * xl ? m.eta * m.fcd : 0)) * KPA;
  const as2 = (ms - lim.mc) / (sig2 * (d - d2));
  return { as: Math.max(0, (lim.f + as2 * sig2 - N) / (m.fyd * KPA)), as2, x: xl, z: lim.z, ms, mlim: lim.mc };
}

export const minSteel = (m: Mat, p: Ec2Params, bt: number, d: number) => Math.max((p.beamMinFctm * m.fctm) / m.fyk, p.beamMinAbs) * bt * d;

export interface ShearCap { vrdc: number; vrds: number; vrdMax: number; cot: number; vrd: number; z: number; nu1: number; k: number; rhoL: number; rhoWMin: number }

export function shearCapacity(bw: number, d: number, asl: number, aswS: number, m: Mat, p: Ec2Params, sigmaCp = 0, cotMax = p.cotThetaMax): ShearCap {
  const base = ec2Shear({ bw, d, fck: m.fck, fyk: m.fyk, asl, VEd: 0, sigmaCp }, p);
  const z = 0.9 * d, fywd = m.fyd * KPA;
  const vMax = (cot: number) => (bw * z * base.nu1 * m.fcdShear * KPA) / (cot + 1 / cot);
  const vs = (cot: number) => aswS * z * fywd * cot;
  const top = Math.max(p.cotThetaMin, Math.min(cotMax, p.cotThetaMax));
  let cot = top;
  if (vs(top) > vMax(top)) {
    if (vs(p.cotThetaMin) >= vMax(p.cotThetaMin)) cot = p.cotThetaMin;
    else {
      let lo = p.cotThetaMin, hi = top;
      for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (vs(mid) < vMax(mid)) lo = mid; else hi = mid; }
      cot = lo;
    }
  }
  const vrds = vs(cot), vrdMax = vMax(cot);
  return { vrdc: base.vrdc, vrds, vrdMax, cot, vrd: Math.max(base.vrdc, Math.min(vrds, vrdMax)), z, nu1: base.nu1, k: base.k, rhoL: base.rhoL, rhoWMin: base.rhoWMin };
}

export const bondStress = (m: Mat, dia: number, good: boolean) => 2.25 * (good ? 1 : 0.7) * (dia <= 32 ? 1 : (132 - dia) / 100) * m.fctd;

export const basicAnchorage = (m: Mat, dia: number, good: boolean) => (dia / 4000) * (m.fyd / bondStress(m, dia, good));

export const designAnchorage = (m: Mat, dia: number, good: boolean, alpha = 1) => {
  const rqd = basicAnchorage(m, dia, good);
  return Math.max(alpha * rqd, 0.3 * rqd, (10 * dia) / 1000, 0.1);
};

export const ALPHA6 = 1.5;
export const lapLength = (m: Mat, dia: number, good: boolean) => {
  const rqd = basicAnchorage(m, dia, good);
  return Math.max(ALPHA6 * rqd, 0.3 * ALPHA6 * rqd, (15 * dia) / 1000, 0.2);
};

export const hookAlpha = (cd: number, dia: number) => (cd > (3 * dia) / 1000 ? 0.7 : 1);

export const mandrel = (dia: number) => (dia <= 16 ? 4 : 7) * dia;

/** 8.3(2) Table 8.1N for every bar; past a bend 5φ (Figure 8.1); links 5φ ≥ 50 mm past a 135° hook, 10φ ≥ 70 mm past a 90° bend (Figure 8.5). */
export const EC2_BENDS: BendRules = {
  mandrel: (dia) => mandrel(dia) / 1000,
  extension: (dia, angle, use) => (use === 'transverse' ? (angle === 135 ? Math.max(5 * dia, 50) : Math.max(10 * dia, 70)) : 5 * dia) / 1000,
  crossTieHooks: [135, 135],
  clause: '8.3, 8.4.1, 8.5',
};

const T72: ReadonlyArray<[number, number]> = [[160, 32], [200, 25], [240, 16], [280, 12], [320, 10], [360, 8], [400, 6], [450, 5]];
const T73: ReadonlyArray<[number, number]> = [[160, 300], [200, 250], [240, 200], [280, 150], [320, 100], [360, 50]];

function interp(t: ReadonlyArray<[number, number]>, s: number): number {
  if (s <= t[0]![0]) return t[0]![1];
  for (let i = 1; i < t.length; i++) {
    const [s1, v1] = t[i]!, [s0, v0] = t[i - 1]!;
    if (s <= s1) return v0 + ((v1 - v0) * (s - s0)) / (s1 - s0);
  }
  return 0;
}

export const maxBarDia = (sigma: number) => interp(T72, sigma);
export const maxBarSpacing = (sigma: number) => interp(T73, sigma);

export const modifiedMaxDia = (sigma: number, m: Mat, h: number, d: number) => maxBarDia(sigma) * (m.fctm / 2.9) * (0.4 * (h / 2)) / (2 * Math.max(h - d, 1e-3));

export const GAMMA_G = 1.35;

export const minClear = (dia: number) => Math.max(dia, 25, 20) / 1000;
