/**
 * A rectangular reinforced-concrete beam designed to EN 1992-1-1:2004: the steel for its sagging
 * and hogging moments, and the links for its shear. m, kN, MPa; areas in m².
 *
 * Flexure (6.1, 3.1.7(3)): the rectangular block η·fcd over λ·x. The neutral axis is kept within
 * the ductility limit without redistribution of 5.5(4) with δ = 1, xu/d ≤ 0,45 for fck ≤ 50 and
 * 0,35 above (the common limits of the code's recommended k1 to k4), which is K' = M'/(b·d²·fck).
 * A moment above it takes compression steel at d2 for the rest. The lever arm is capped at
 * 0,95·d, the usual practice for very small moments. Minimum and maximum tension steel of
 * 9.2.1.1(1) and (3).
 *
 * Shear (6.2): VRd,c by 6.2.2(1), with σcp where the member carries axial force (columns), on the
 * steel in tension where each shear acts: the face the moment at that same station puts in
 * tension. Above it, vertical links by the variable strut of 6.2.3, the flattest strut in
 * [cotθmin; cotθmax] whose VRd,max still carries VEd (the least links), z = 0,9·d, αcw = 1, never
 * below ρw,min of 9.2.2(5); largest spacing 0,75·d (9.2.2(6)). Every shear case is designed and
 * the row reads the worst; VRd,c and the links are inputs of that row, not rows of their own,
 * since neither is a check that can fail.
 *
 * Every Nationally Determined Parameter comes from the set passed (`ec2-params.ts`).
 */
import { statusOfRatio, type CheckInput, type CheckRow } from '../../../design-contract';
import { ec2Material, type Ec2Params } from './ec2-params';

export interface Ec2BeamInput {
  /** Width and depth, cover to the links, m; link and main bar diameters, mm. */
  b: number; h: number; cover: number; linkDia: number; barDia: number;
  fck: number; fyk: number;
  /** Design sagging and hogging moments (magnitudes), kN·m; design shear, kN. */
  MEdPos: number; MEdNeg: number; VEd: number;
  params: Ec2Params;
  /** The shear at each governing station, with the face its own moment puts in tension. Absent: VEd alone. */
  shears?: Ec2ShearCase[];
  /** Where each moment governs, for the rows. */
  at?: { pos?: { combination?: string; location?: string }; neg?: { combination?: string; location?: string } };
}

export interface Ec2BeamDesign {
  /** Steel at the bottom and at the top, m² (with the minimum, and the compression steel either face needs). */
  asBottom: number; asTop: number;
  /** Links, m² per metre of beam, and the strut used. */
  aswS: number; cotTheta: number;
  d: number;
  /** VRd,c of the shear case that needs the most links, kN; every case designed. */
  vrdc: number; shear: Ec2Shear[];
  rows: CheckRow[];
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const inp = (symbol: string, value: number, unit?: string): CheckInput => ({ symbol, value: r3(value), ...(unit ? { unit } : {}) });

/** Steel for a moment: tension steel and the compression steel it needs, m². */
export function ec2FlexuralSteel(M: number, b: number, d: number, d2: number, fck: number, fyk: number, p: Ec2Params) {
  const m = ec2Material(fck, fyk, p);
  const fcd = m.fcd * 1000, fyd = m.fyd * 1000; // kPa
  const xLim = (fck <= 50 ? p.xuLimitLow : p.xuLimitHigh) * d;
  const blockForce = (x: number) => m.eta * fcd * b * m.lambda * x;
  const mLim = blockForce(xLim) * (d - (m.lambda * xLim) / 2);
  const K = M / (b * d * d * fck * 1000), Kp = mLim / (b * d * d * fck * 1000);
  if (M <= mLim) {
    // η·fcd·b·λx·(d − λx/2) = M, the smaller root.
    const a = m.eta * fcd * b * m.lambda;
    const disc = d * d - (2 * M) / a;
    const x = (d - Math.sqrt(Math.max(disc, 0))) / m.lambda;
    const z = Math.min(d - (m.lambda * x) / 2, 0.95 * d);
    return { as: M / (fyd * z), as2: 0, K, Kp, x, z };
  }
  // Compression steel for the rest, at its strain with x at the limit.
  const es2 = (m.ecu3 * (xLim - d2)) / xLim;
  const fsc = Math.min(fyd, p.es * 1000 * es2);
  const as2 = (M - mLim) / (fsc * (d - d2));
  const zLim = d - (m.lambda * xLim) / 2;
  return { as: mLim / (fyd * zLim) + (as2 * fsc) / fyd, as2, K, Kp, x: xLim, z: zLim };
}

/** One cross-section in shear (6.2.2(1), 6.2.3): bw, d in m; asl the tension steel, m²; σcp, MPa, compression positive. */
export interface Ec2ShearInput { bw: number; d: number; fck: number; fyk: number; asl: number; VEd: number; sigmaCp?: number }

export interface Ec2Shear {
  k: number; rhoL: number; sigmaCp: number;
  /** kN. */
  vrdc: number; vrdMax: number;
  cotTheta: number;
  /** Links, m² per metre, with the minimum; ρw,min; lever arm z, m; ν1. */
  aswS: number; aswMin: number; rhoWMin: number; z: number; nu1: number;
}

export function ec2Shear(i: Ec2ShearInput, p: Ec2Params): Ec2Shear {
  const m = ec2Material(i.fck, i.fyk, p);
  const dmm = i.d * 1000, k = Math.min(1 + Math.sqrt(200 / dmm), 2);
  const rhoL = Math.min(i.asl / (i.bw * i.d), 0.02);
  // σcp = NEd/Ac < 0,2·fcd; tension negative (6.2.2(1)).
  const sigmaCp = Math.min(i.sigmaCp ?? 0, 0.2 * m.fcd);
  const vrdc = Math.max(0, Math.max(p.crdc * k * (100 * rhoL * i.fck) ** (1 / 3), p.vminCoeff * k ** 1.5 * Math.sqrt(i.fck)) + p.k1 * sigmaCp) * i.bw * i.d * 1000;
  const z = 0.9 * i.d, fywd = (i.fyk / p.gammaS) * 1000, nu1 = 0.6 * (1 - i.fck / 250) * p.nu1Factor;
  const vrdMax = (cot: number) => (i.bw * z * nu1 * m.fcdShear * 1000) / (cot + 1 / cot);
  const rhoWMin = (p.linkMinCoeff * Math.sqrt(i.fck)) / i.fyk, aswMin = rhoWMin * i.bw;
  let cotTheta = p.cotThetaMax, aswS = aswMin;
  if (i.VEd > vrdc) {
    // The flattest strut whose VRd,max carries VEd: VRd,max falls as cotθ grows past 1.
    if (vrdMax(p.cotThetaMin) < i.VEd) {
      cotTheta = p.cotThetaMin;
    } else {
      let lo = p.cotThetaMin, hi = p.cotThetaMax;
      if (vrdMax(hi) >= i.VEd) lo = hi;
      else for (let n = 0; n < 60; n++) { const mid = (lo + hi) / 2; if (vrdMax(mid) >= i.VEd) lo = mid; else hi = mid; }
      cotTheta = lo;
    }
    aswS = Math.max(i.VEd / (z * fywd * cotTheta), aswMin);
  }
  return { k, rhoL, sigmaCp, vrdc, vrdMax: vrdMax(cotTheta), cotTheta, aswS, aswMin, rhoWMin, z, nu1 };
}

/** One shear to design: the force, the face the moment acting with it puts in tension, and where. */
export interface Ec2ShearCase { VEd: number; face: 'pos' | 'neg'; combination?: string; location?: string }

/** The shear row over several cases: the worst VEd/VRd,max, the most links, VRd,c of the case that governs. */
export function ec2ShearRow(
  cases: ReadonlyArray<{ s: Ec2Shear; VEd: number; combination?: string; location?: string; label?: string }>,
  base: { code: string; edition: string }, linkMaxSpacing: number, title = 'Shear', spacingClause = '9.2.2(6)',
): CheckRow {
  const gov = cases.reduce((a, c) => (c.VEd / c.s.vrdMax > a.VEd / a.s.vrdMax ? c : a));
  const links = cases.reduce((a, c) => (c.s.aswS > a.s.aswS ? c : a));
  const ratio = gov.VEd / gov.s.vrdMax;
  return {
    ...base, clause: '6.2.2(1); 6.2.3(3)', title, titleKey: 'check.ec2.shearMax',
    formula: 'VEd ≤ VRd,max = αcw·bw·z·ν1·fcd/(cotθ + tanθ); Asw/s = VEd/(z·fywd·cotθ) ≥ ρw,min·bw where VEd > VRd,c',
    inputs: [inp('VEd', gov.VEd, 'kN'), inp('k', gov.s.k), inp('ρl', gov.s.rhoL), ...(gov.s.sigmaCp ? [inp('σcp', gov.s.sigmaCp, 'MPa')] : []), inp('VRd,c', gov.s.vrdc, 'kN'),
      inp('cotθ', gov.s.cotTheta), inp('ν1', gov.s.nu1), inp('z', gov.s.z * 1000, 'mm'), inp('Asw/s', links.s.aswS * 1e4, 'cm²/m'), inp('ρw,min', gov.s.rhoWMin), inp('s,max', linkMaxSpacing * 1000, 'mm')],
    demand: r3(gov.VEd), capacity: r3(gov.s.vrdMax), unit: 'kN', ratio: r3(ratio), status: statusOfRatio(ratio),
    ...(gov.combination ? { combination: gov.combination } : {}), ...(gov.location ? { location: gov.location } : {}),
    derivation: [
      gov.VEd <= gov.s.vrdc ? `VEd ≤ VRd,c = ${gov.s.vrdc.toFixed(1)} kN: minimum links (9.2.2(5))` : `VEd > VRd,c = ${gov.s.vrdc.toFixed(1)} kN: links by 6.2.3`,
      `Asw/s = ${(links.s.aswS * 1e4).toFixed(2)} cm²/m${links.combination ? ` (${links.combination}${links.location ? `, ${links.location}` : ''}${links.label ? `, ${links.label}` : ''})` : ''}`,
      `largest link spacing ${(linkMaxSpacing * 1000).toFixed(0)} mm (${spacingClause})`,
    ],
  };
}

export function ec2BeamDesign(i: Ec2BeamInput): Ec2BeamDesign {
  const p = i.params, m = ec2Material(i.fck, i.fyk, p);
  const d = i.h - i.cover - (i.linkDia + i.barDia / 2) / 1000, d2 = i.cover + (i.linkDia + i.barDia / 2) / 1000;
  const base = { code: p.code, edition: '2004' };
  const asMin = Math.max((p.beamMinFctm * m.fctm) / i.fyk, p.beamMinAbs) * i.b * d;
  const asMax = p.beamMaxRatio * i.b * i.h;
  const pos = ec2FlexuralSteel(i.MEdPos, i.b, d, d2, i.fck, i.fyk, p);
  const neg = ec2FlexuralSteel(i.MEdNeg, i.b, d, d2, i.fck, i.fyk, p);
  // Each face: its own tension steel, or the compression steel the other moment needs, or the minimum.
  const asBottom = Math.max(i.MEdPos > 0 ? pos.as : 0, neg.as2, asMin);
  const asTop = Math.max(i.MEdNeg > 0 ? neg.as : 0, pos.as2, i.MEdNeg > 0 ? asMin : 0);
  const rows: CheckRow[] = [];
  const flexRow = (key: 'flexurePos' | 'flexureNeg', title: string, M: number, f: typeof pos, as: number, at?: { combination?: string; location?: string }): CheckRow => ({
    ...base, clause: '6.1', title, titleKey: `check.ec2.${key}`, formula: 'As ≤ As,max (9.2.1.1(3)); block of 3.1.7(3)',
    inputs: [inp('MEd', M, 'kN·m'), inp('d', d * 1000, 'mm'), inp('K', f.K), inp("K'", f.Kp), inp('z', f.z * 1000, 'mm'), inp('As,min', asMin * 1e4, 'cm²')],
    demand: r3(as * 1e4), capacity: r3(asMax * 1e4), unit: 'cm²', ratio: r3(as / asMax), status: statusOfRatio(as / asMax),
    ...(at?.combination ? { combination: at.combination } : {}), ...(at?.location ? { location: at.location } : {}),
    derivation: [`As = ${(as * 1e4).toFixed(2)} cm²${f.as2 > 0 ? `, compression steel As2 = ${(f.as2 * 1e4).toFixed(2)} cm² (K > K')` : ''}`, `As,min = max(${p.beamMinFctm}·fctm/fyk; ${p.beamMinAbs})·b·d (9.2.1.1(1))`],
  });
  rows.push(flexRow('flexurePos', 'Flexure, sagging', i.MEdPos, pos, asBottom, i.at?.pos));
  if (i.MEdNeg > 0) rows.push(flexRow('flexureNeg', 'Flexure, hogging', i.MEdNeg, neg, asTop, i.at?.neg));

  // Shear: each case on the steel its own moment puts in tension; without cases, VEd on the
  // smaller of the two (the support's steel unknown: the safe side).
  const cases = i.shears?.length
    ? i.shears.map((c) => ({ ...c, s: ec2Shear({ bw: i.b, d, fck: i.fck, fyk: i.fyk, asl: c.face === 'neg' ? asTop : asBottom, VEd: c.VEd }, p) }))
    : [{ VEd: i.VEd, s: ec2Shear({ bw: i.b, d, fck: i.fck, fyk: i.fyk, asl: i.MEdNeg > 0 ? Math.min(asBottom, asTop) : asBottom, VEd: i.VEd }, p) }];
  const shearRow = ec2ShearRow(cases, base, p.linkMaxSpacing * d);
  rows.push(shearRow);
  const gov = cases.reduce((a, c) => (c.s.aswS > a.s.aswS ? c : a));
  return { asBottom, asTop, aswS: gov.s.aswS, cotTheta: gov.s.cotTheta, d, vrdc: gov.s.vrdc, shear: cases.map((c) => c.s), rows };
}
