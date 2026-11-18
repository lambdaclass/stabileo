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
import type { StirrupDef } from '../../design-contract/reinforcement';
import { secondaryStirrupLegs, secondaryStirrupLegsUnavailable } from './secondary-stirrup-legs';
import type { ConcurrentSectionDemand } from '../../engine/concurrent-demand';
import { shearFy, shearSqrtFc } from '../../engine/codes/argentina/cirsoc201-basis';

export type TorsionInput = {
  b: number; h: number; d: number; dSecondary: number;
  /** Clear cover to the stirrup, m, and the stirrup's diameter, mm. */
  cover: number; stirrupDiaMm: number;
  fc: number; fy: number; fyt: number;
  demand: ConcurrentSectionDemand;
} & ({ stirrup?: undefined } | { stirrup: StirrupDef; rectangularCage: boolean });

export interface TorsionCheck {
  /** φ·Tth, kN·m: below it torsion may be neglected. */
  phiTth: number;
  neglect: boolean;
  /** Cross-section limit: demand / capacity under V and T together. */
  sectionRatio: number;
  shearSectionRatio: number;
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
  secondaryLegsRefusal?: string;
}

const PHI = 0.75;

export function providedTorsionStirrups(stirrup: NonNullable<TorsionInput['stirrup']>) {
  const Ab = (Math.PI * (stirrup.diameter / 1000) ** 2) / 4;
  return { transverseProvided: (stirrup.legs * Ab) / stirrup.spacing, outerLegProvided: Ab / stirrup.spacing };
}

export function checkTorsion2025(input: TorsionInput): TorsionCheck {
  const i = { ...input, fy: shearFy(input.fy), fyt: shearFy(input.fyt) };
  const sq = Math.sqrt(i.fc), sqLim = shearSqrtFc(i.fc);
  const Acp = i.b * i.h, pcp = 2 * (i.b + i.h);
  const inset = 2 * (i.cover + i.stirrupDiaMm / 2000);
  const x1 = i.b - inset, y1 = i.h - inset;
  const Aoh = x1 * y1, ph = 2 * (x1 + y1), Ao = 0.85 * Aoh;
  const Tth = 0.083 * sqLim * 1000 * (Acp * Acp) / pcp;
  const phiTth = PHI * Tth;
  const { Tu, Vu, VuSecondary } = i.demand;
  const vc = 0.17 * sqLim * 1000; // Vc / (bw·d), kN/m²
  const shearStress = Math.max(Vu / (i.b * i.d), VuSecondary / (i.h * i.dSecondary));
  const shearSectionRatio = Math.hypot(shearStress, 0) / (PHI * (vc + 0.66 * sq * 1000));
  const lhs = Math.hypot(shearStress, (Tu * ph) / (1.7 * Aoh * Aoh));
  const sectionRatio = lhs / (PHI * (vc + 0.66 * sq * 1000));
  const AtOverS = Tu / (PHI * 2 * Ao * i.fyt * 1000);
  const required = (width: number, depth: number, shear: number) => {
    const Vs = Math.max(0, shear / PHI - vc * width * depth);
    const minimum = Math.max(0.062 * sq, 0.35) * width / i.fyt;
    return Math.max(Vs / (i.fyt * 1000 * depth) + 2 * AtOverS, minimum);
  };
  const neglect = Tu < phiTth;
  const provision = i.stirrup ? providedTorsionStirrups(i.stirrup) : { transverseProvided: 0, outerLegProvided: 0 };
  const { outerLegProvided } = provision;
  let transverseRequired = required(i.b, i.d, Vu);
  let transverseProvided = provision.transverseProvided;
  let secondaryLegsRefusal: string | undefined;
  if (!neglect && !(VuSecondary <= 0)) {
    const secondaryRequired = required(i.h, i.dSecondary, VuSecondary);
    const legs = i.stirrup ? secondaryStirrupLegs(i.stirrup, i.rectangularCage) : undefined;
    const provided = i.stirrup && legs !== undefined
      ? providedTorsionStirrups({ ...i.stirrup, legs }).transverseProvided : 0;
    if (i.stirrup && legs === undefined) secondaryLegsRefusal = secondaryStirrupLegsUnavailable;
    const primaryRatio = transverseProvided > 0 ? transverseRequired / transverseProvided : Infinity;
    const secondaryRatio = provided > 0 ? secondaryRequired / provided : Infinity;
    if (secondaryRatio > primaryRatio || (secondaryRatio === primaryRatio && secondaryRequired > transverseRequired)) {
      transverseRequired = secondaryRequired;
      transverseProvided = provided;
    }
  }
  const Al = AtOverS * ph * (i.fyt / i.fy);
  const AlMin = Math.max(0, (0.42 * sq * Acp) / i.fy - Math.max(AtOverS, (0.175 * i.b) / i.fyt) * ph * (i.fyt / i.fy));
  const sMax = Math.min(ph / 8, 0.3);
  const ratios = neglect ? [0] : [
    sectionRatio,
    transverseProvided > 0 ? transverseRequired / transverseProvided : Number.POSITIVE_INFINITY,
    outerLegProvided > 0 ? AtOverS / outerLegProvided : Number.POSITIVE_INFINITY,
    i.stirrup ? i.stirrup.spacing / sMax : Number.POSITIVE_INFINITY,
  ];
  return { phiTth, neglect, sectionRatio, shearSectionRatio, transverseRequired, AtOverS, transverseProvided, outerLegProvided, Al, AlMin, sMax, ratio: secondaryLegsRefusal ? Infinity : Math.max(...ratios),
    ...(secondaryLegsRefusal ? { secondaryLegsRefusal } : {}) };
}
