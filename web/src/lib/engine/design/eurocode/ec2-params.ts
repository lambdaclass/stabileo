/**
 * EN 1992-1-1:2004 (Eurocode 2): the Nationally Determined Parameters a design reads, as a set the
 * project can state, and the material values the code derives from fck.
 *
 * Two sets come with the app: the values the code recommends (`EC2_RECOMMENDED`, rows coded
 * `en-1992-1-1`) and those of the UK National Annex to BS EN 1992-1-1 (`EC2_UK`, rows coded
 * `bs-en-1992-1-1`). Neither text is in the repository: the values are the code's own, each with
 * its clause, and a person can change any of them. Units: MPa, m.
 */

export interface Ec2Params {
  /** Row code: `en-1992-1-1` or `bs-en-1992-1-1`. */
  code: string;
  /** Partial factors for concrete and reinforcing steel, persistent and transient (2.4.2.4(1), Table 2.1N). */
  gammaC: number; gammaS: number;
  /** Long-term coefficient on the compressive strength, in flexure and axial load (3.1.6(1)P). */
  alphaCC: number;
  /** The same coefficient where the strength is used in shear (VRd,max), 3.1.6(1)P. */
  alphaCCShear: number;
  /** Long-term coefficient on the tensile strength (3.1.6(2)P). */
  alphaCT: number;
  /** CRd,c = 0,18/γc, k1 and the coefficient of vmin = 0,035·k^1,5·fck^0,5 (6.2.2(1)). */
  crdc: number; k1: number; vminCoeff: number;
  /** Limits of the strut angle, 1 ≤ cotθ ≤ 2,5 (6.2.3(2)). */
  cotThetaMin: number; cotThetaMax: number;
  /** ν1 = ν·(1 − fck/250)·factor: the strength reduction for concrete cracked in shear (6.2.3(3), 6.2.2(6)). */
  nu1Factor: number;
  /** Largest neutral axis depth over d without moment redistribution, for fck ≤ 50 and above (5.5(4), δ = 1). */
  xuLimitLow: number; xuLimitHigh: number;
  /** Minimum tension steel, 9.2.1.1(1): max(minFctm·fctm/fyk; minAbs)·bt·d. Maximum, 9.2.1.1(3): maxRatio·Ac. */
  beamMinFctm: number; beamMinAbs: number; beamMaxRatio: number;
  /** Minimum links ratio coefficient, ρw,min = coeff·√fck/fyk (9.2.2(5)); largest link spacing over d (9.2.2(6)). */
  linkMinCoeff: number; linkMaxSpacing: number;
  /** Columns, 9.5.2(2) and (3): As,min = max(colMinN·NEd/fyd; colMinAbs·Ac), As,max = colMaxRatio·Ac. */
  colMinN: number; colMinAbs: number; colMaxRatio: number;
  /** Slenderness limit, 5.8.3.1(1): λlim = coeff·A·B·C/√n. */
  lambdaLimCoeff: number;
  /** Modulus of the reinforcement, MPa (3.2.7(4)). */
  es: number;
}

export const EC2_RECOMMENDED: Ec2Params = {
  code: 'en-1992-1-1',
  gammaC: 1.5, gammaS: 1.15,
  alphaCC: 1.0, alphaCCShear: 1.0, alphaCT: 1.0,
  crdc: 0.18 / 1.5, k1: 0.15, vminCoeff: 0.035,
  cotThetaMin: 1, cotThetaMax: 2.5,
  nu1Factor: 1,
  xuLimitLow: 0.45, xuLimitHigh: 0.35,
  beamMinFctm: 0.26, beamMinAbs: 0.0013, beamMaxRatio: 0.04,
  linkMinCoeff: 0.08, linkMaxSpacing: 0.75,
  colMinN: 0.1, colMinAbs: 0.002, colMaxRatio: 0.04,
  lambdaLimCoeff: 20,
  es: 200000,
};

/**
 * UK National Annex to BS EN 1992-1-1:
 *   · αcc = 0,85 for flexure and axial load (NA to 3.1.6(1)P); 1,0 for the other phenomena, here shear;
 *   · γc = 1,5 and γs = 1,15 (NA to 2.4.2.4(1)), as recommended;
 *   · CRd,c = 0,18/γc, k1 = 0,15, vmin = 0,035·k^1,5·fck^0,5 (NA to 6.2.2(1)), as recommended;
 *   · 1 ≤ cotθ ≤ 2,5 (NA to 6.2.3(2)), as recommended;
 *   · ν1 = ν (NA to 6.2.3(3) for fywd ≤ 0,8·fyk), as recommended;
 *   · minimum and maximum steel of 9.2.1.1 and 9.5.2, ρw,min and the link spacing of 9.2.2 as recommended.
 */
export const EC2_UK: Ec2Params = { ...EC2_RECOMMENDED, code: 'bs-en-1992-1-1', alphaCC: 0.85, alphaCCShear: 1.0 };

export interface Ec2Material {
  fcd: number; fcdShear: number; fctm: number; fcm: number; ecm: number;
  fyd: number; eyd: number;
  /** Rectangular block (3.1.7(3)): depth factor λ, strength factor η; ultimate strain εcu3 and εc3. */
  lambda: number; eta: number; ecu3: number; ec3: number;
}

/** Material values of EN 1992-1-1 Table 3.1 and 3.1.7(3), with the set's partial factors. MPa. */
export function ec2Material(fck: number, fyk: number, p: Ec2Params): Ec2Material {
  const fcm = fck + 8;
  const fctm = fck <= 50 ? 0.3 * fck ** (2 / 3) : 2.12 * Math.log(1 + fcm / 10);
  const ecm = 22000 * (fcm / 10) ** 0.3;
  const high = fck > 50;
  const lambda = high ? 0.8 - (fck - 50) / 400 : 0.8;
  const eta = high ? 1 - (fck - 50) / 200 : 1;
  const ecu3 = high ? (2.6 + 35 * ((90 - fck) / 100) ** 4) / 1000 : 0.0035;
  const ec3 = high ? (1.75 + 0.55 * ((fck - 50) / 40)) / 1000 : 0.00175;
  const fyd = fyk / p.gammaS;
  return { fcd: (p.alphaCC * fck) / p.gammaC, fcdShear: (p.alphaCCShear * fck) / p.gammaC, fctm, fcm, ecm, fyd, eyd: fyd / p.es, lambda, eta, ecu3, ec3 };
}

/**
 * The final creep coefficient φ(∞,t0) by Annex B of EN 1992-1-1 (B.1, B.2, B.4, B.5, B.8b), for
 * a member of notional size h0 = 2·Ac/u, mm. The defaults are the conditions a building's inside
 * columns are designed for when nothing else is stated: relative humidity 50 % and first loading
 * at t0 = 28 days, cement class N (B.9 leaves t0 as it is). At t = ∞, βc(t,t0) = 1, so φ = φ0.
 *
 *   φRH = 1 + (1 − RH/100)/(0,1·h0^(1/3))                     fcm ≤ 35 MPa
 *   φRH = [1 + (1 − RH/100)/(0,1·h0^(1/3))·α1]·α2             fcm > 35 MPa, α1 = (35/fcm)^0,7, α2 = (35/fcm)^0,2
 *   β(fcm) = 16,8/√fcm,  β(t0) = 1/(0,1 + t0^0,20)
 */
export function ec2CreepCoefficient(fck: number, h0mm: number, rh = 50, t0 = 28): number {
  const fcm = fck + 8;
  const dry = (1 - rh / 100) / (0.1 * Math.cbrt(h0mm));
  const phiRH = fcm <= 35 ? 1 + dry : (1 + dry * (35 / fcm) ** 0.7) * (35 / fcm) ** 0.2;
  return phiRH * (16.8 / Math.sqrt(fcm)) * (1 / (0.1 + t0 ** 0.2));
}

/**
 * ψ2 of EN 1990 Table A1.1 for the quasi-permanent combination, by the load case's type: permanent
 * actions (dead load, earth and fluid pressure) at 1; imposed floor loads at 0,3, the value of
 * categories A and B (domestic, office), which the model does not tell apart from C to E; roof,
 * snow (sites up to 1000 m), rain, wind, temperature and earthquake at 0. A case of no known type
 * is taken as permanent: the larger creep, on the safe side.
 */
export function ec2Psi2(caseType: string | undefined): number {
  switch (caseType) {
    case 'L': return 0.3;
    case 'Lr': case 'LR': case 'S': case 'R': case 'W': case 'T': case 'E': return 0;
    default: return 1;
  }
}
