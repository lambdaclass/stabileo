/**
 * Torsion of a solid rectangular beam with closed stirrups, CIRSOC 201-2025 §22.7, with θ = 45°:
 * the threshold below which it may be neglected (§22.7.4.1), the limit of the cross-section under
 * shear and torsion together (§22.7.7.1), the transverse steel for both (§22.7.6.1, §9.6.4.2) and
 * the longitudinal steel torsion adds (§22.7.6.1, §9.6.4.3), with the stirrup spacing limit of
 * §9.7.6.3.3. kN, m, MPa.
 *
 * Material limits, §22.7.2: √f'c ≤ 8,3 MPa in Tth (22.7.2.1) and in Vc (22.5.3.1); fy and fyt
 * ≤ 420 MPa in the transverse and longitudinal steel for torsion and in Vs (22.7.2.2, 22.5.3.3,
 * through 20.2.1.3). The section limit's 0,66·√f'c and the minimums of 9.6.4 read √f'c as is:
 * the text limits only Tth, Tcr and Vc.
 */
import { shearFy, shearSqrtFc } from '../../engine/codes/argentina/cirsoc201-basis';

export interface TorsionInput {
  b: number; h: number; d: number;
  /** Clear cover to the stirrup, m, and the stirrup's diameter, mm. */
  cover: number; stirrupDiaMm: number;
  fc: number; fy: number; fyt: number;
  Vu: number; Tu: number;
  /** The stirrups there are: diameter, mm; legs; spacing, m. */
  stirrup?: { diameter: number; legs: number; spacing: number };
}

export interface TorsionCheck {
  /** φ·Tth, kN·m: below it torsion may be neglected. */
  phiTth: number;
  neglect: boolean;
  /** Cross-section limit: demand / capacity under V and T together. */
  sectionRatio: number;
  /** (Av + 2At)/s needed for shear and torsion together, with its minimum, m²/m. */
  transverseRequired: number;
  /** At/s needed for torsion, m²/m: what one outer leg must carry. */
  AtOverS: number;
  /** What the stirrups give: all legs, and one outer leg, m²/m. */
  transverseProvided: number; outerLegProvided: number;
  /** Longitudinal steel torsion adds, and its minimum, m². */
  Al: number; AlMin: number;
  /** Stirrup spacing limit, m. */
  sMax: number;
  /** The worst of the cross-section, transverse, outer leg and spacing ratios. */
  ratio: number;
}

const PHI = 0.75;

export function checkTorsion2025(input: TorsionInput): TorsionCheck {
  const i = { ...input, fy: shearFy(input.fy), fyt: shearFy(input.fyt) };
  const sq = Math.sqrt(i.fc), sqLim = shearSqrtFc(i.fc);
  const Acp = i.b * i.h, pcp = 2 * (i.b + i.h);
  const inset = 2 * (i.cover + i.stirrupDiaMm / 2000);
  const x1 = i.b - inset, y1 = i.h - inset;
  const Aoh = x1 * y1, ph = 2 * (x1 + y1), Ao = 0.85 * Aoh;
  const Tth = 0.083 * sqLim * 1000 * (Acp * Acp) / pcp;
  const phiTth = PHI * Tth;
  const Tu = Math.abs(i.Tu), Vu = Math.abs(i.Vu);
  const vc = 0.17 * sqLim * 1000; // Vc / (bw·d), kN/m²
  const lhs = Math.hypot(Vu / (i.b * i.d), (Tu * ph) / (1.7 * Aoh * Aoh));
  const sectionRatio = lhs / (PHI * (vc + 0.66 * sq * 1000));
  const AtOverS = Tu / (PHI * 2 * Ao * i.fyt * 1000);
  const Vs = Math.max(0, Vu / PHI - vc * i.b * i.d);
  const AvOverS = Vs / (i.fyt * 1000 * i.d);
  const min = Math.max(0.062 * sq, 0.35) * i.b / i.fyt;
  const transverseRequired = Math.max(AvOverS + 2 * AtOverS, min);
  const Ab = i.stirrup ? (Math.PI * (i.stirrup.diameter / 1000) ** 2) / 4 : 0;
  const transverseProvided = i.stirrup ? (i.stirrup.legs * Ab) / i.stirrup.spacing : 0;
  const outerLegProvided = i.stirrup ? Ab / i.stirrup.spacing : 0;
  const Al = AtOverS * ph * (i.fyt / i.fy);
  const AlMin = Math.max(0, (0.42 * sq * Acp) / i.fy - Math.max(AtOverS, (0.175 * i.b) / i.fyt) * ph * (i.fyt / i.fy));
  const sMax = Math.min(ph / 8, 0.3);
  const neglect = Tu < phiTth;
  const ratios = neglect ? [0] : [
    sectionRatio,
    transverseProvided > 0 ? transverseRequired / transverseProvided : Number.POSITIVE_INFINITY,
    outerLegProvided > 0 ? AtOverS / outerLegProvided : Number.POSITIVE_INFINITY,
    i.stirrup ? i.stirrup.spacing / sMax : Number.POSITIVE_INFINITY,
  ];
  return { phiTth, neglect, sectionRatio, transverseRequired, AtOverS, transverseProvided, outerLegProvided, Al, AlMin, sMax, ratio: Math.max(...ratios) };
}
