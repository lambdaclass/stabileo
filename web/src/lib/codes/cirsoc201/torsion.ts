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
import type { ConcurrentSectionDemand } from '../../engine/concurrent-demand';
import type { RegulationEdition } from '../regulation';
import type { StirrupDef } from '../../design-contract/reinforcement';
import { hookAnchorageIsSupported } from './transverse-cage';
import { transverseSpacingLimits } from './transverse-spacing';
import { rebarSpec } from '../../engine/codes/argentina/cirsoc201-rebar';
import { evaluateBeamSection } from '../../engine/codes/argentina/cirsoc201-beam-kernel';
import { shearFy, shearSqrtFc } from '../../engine/codes/argentina/cirsoc201-basis';

export type StirrupDeclaration = StirrupDef & {
  shape?: 'rectangular' | 'unknown';
  closed?: boolean | null;
  secondaryLegs?: number | null;
};

type SectionGeometry = { b: number; h: number; cover: number };

const checkedCage: unique symbol = Symbol();

interface ClosedRectangularCage {
  [checkedCage]: true;
  kind: 'closed-rectangle';
  diameter: number;
  spacing: number;
  primaryLegs: number;
  secondaryLegs: number;
}

export type CageResolution = ClosedRectangularCage | { kind: 'refusal'; reason: string; missing?: true };

export function resolveCage(section: SectionGeometry, stirrup: StirrupDeclaration | undefined, rectangular = true): CageResolution {
  if (!rectangular) return { kind: 'refusal', reason: 'Requires a rectangular section' };
  if (!stirrup) return { kind: 'refusal', reason: 'No complete member stirrup cage', missing: true };
  const { diameter, spacing, legs } = stirrup;
  if (!(Number.isFinite(diameter) && diameter > 0 && Number.isFinite(spacing) && spacing > 0)) {
    return { kind: 'refusal', reason: 'Invalid stirrup diameter or spacing' };
  }
  if ((stirrup.shape !== undefined && stirrup.shape !== 'rectangular')
      || (stirrup.closed !== undefined && stirrup.closed !== true) || !hookAnchorageIsSupported(diameter)
      || !(Number.isFinite(section.b) && Number.isFinite(section.h) && section.cover >= 0
        && Math.min(section.b, section.h) > Math.max(2 * section.cover, section.cover + 0.008) + diameter / 1000)) {
    return { kind: 'refusal', reason: 'Requires a closed rectangular cage' };
  }
  const secondaryLegs = stirrup.secondaryLegs === undefined ? 2 : stirrup.secondaryLegs;
  if (!Number.isSafeInteger(legs) || legs < 2 || secondaryLegs === null
      || !Number.isSafeInteger(secondaryLegs) || secondaryLegs < 2) {
    return { kind: 'refusal', reason: 'Unknown secondary stirrup legs' };
  }
  return { [checkedCage]: true, kind: 'closed-rectangle', diameter, spacing, primaryLegs: legs, secondaryLegs };
}

export function weakestMemberCages(section: SectionGeometry, stirrups: readonly (StirrupDeclaration | undefined)[], rectangular: boolean): CageResolution[] {
  const cages: ClosedRectangularCage[] = [];
  for (const stirrup of stirrups) {
    const cage = resolveCage(section, stirrup, rectangular);
    if (cage.kind === 'refusal') return [cage];
    cages.push(cage);
  }
  if (cages.length === 0) return [resolveCage(section, undefined, rectangular)];
  const spacing = Math.max(...cages.map(cage => cage.spacing));
  const primaryLegs = Math.min(...cages.map(cage => cage.primaryLegs));
  const secondaryLegs = Math.min(...cages.map(cage => cage.secondaryLegs));
  return [...new Set(cages.map(cage => cage.diameter))].map(diameter => ({
    [checkedCage]: true, kind: 'closed-rectangle', diameter, spacing, primaryLegs, secondaryLegs,
  }));
}

export function secondaryShearFace(section: SectionGeometry, cage: ClosedRectangularCage) {
  return { b: section.h, h: section.b, d: section.b - section.cover - cage.diameter / 1000 - 0.008,
    stirrupDia: cage.diameter, legs: cage.secondaryLegs, spacing: cage.spacing };
}

export function secondaryShearMinimumThreshold(edition: RegulationEdition, face: { b: number; d: number }, fc: number, phiVc: number) {
  return edition === '2005' ? phiVc / 2 : PHI * 0.085 * shearSqrtFc(fc) * face.b * face.d * 1000;
}

export function secondaryShearSpacingShortfall(
  edition: RegulationEdition, face: ReturnType<typeof secondaryShearFace>, cover: number,
  fc: number, Vu: number, phiVc: number,
): string | undefined {
  if (edition !== '2025') return undefined;
  const { requiredLegs, alongMax } = transverseSpacingLimits(edition, {
    VsRequired: Math.max(0, (Vu - phiVc) / PHI), bw: face.b, d: face.d, fc, cover, stirrupDiaMm: face.stirrupDia,
  });
  if (face.legs < requiredLegs) return `${face.legs} stirrup legs provided, ${requiredLegs} required (Table 9.7.6.2.2)`;
  return face.spacing > alongMax ? `Stirrup spacing exceeds ${(alongMax * 1000).toFixed(1)} mm (Table 9.7.6.2.2)` : undefined;
}

export function combinedTransverseMinimum(edition: RegulationEdition, bw: number, fc: number, fyt: number): number {
  const root = Math.sqrt(fc);
  const coefficient = edition === '2005' ? Math.max(root / 16, 0.33) : Math.max(0.062 * root, 0.35);
  return coefficient * bw / shearFy(fyt);
}

export interface TorsionInput {
  b: number; h: number; d: number; dSecondary: number;
  /** Clear cover to the stirrup, m, and the stirrup's diameter, mm. */
  cover: number; stirrupDiaMm: number;
  fc: number; fy: number; fyt: number;
  demand: ConcurrentSectionDemand;
  edition?: RegulationEdition;
  rhoW?: { primary?: number; secondary?: number };
  /** The stirrups there are: diameter, mm; legs; spacing, m. */
  stirrup?: StirrupDeclaration | CageResolution;
}

export interface TorsionCheck {
  /** φ·Tth, kN·m: below it torsion may be neglected. */
  phiTth: number;
  neglect: boolean;
  primaryDepth: number;
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
  refusal?: string;
}

const PHI = 0.75;

export function providedTorsionStirrups(stirrup: StirrupDef) {
  const Ab = (Math.PI * (stirrup.diameter / 1000) ** 2) / 4;
  return { transverseProvided: (stirrup.legs * Ab) / stirrup.spacing, outerLegProvided: Ab / stirrup.spacing };
}

export function checkTorsion2025(input: TorsionInput): TorsionCheck {
  const i = { ...input, fy: shearFy(input.fy), fyt: shearFy(input.fyt) };
  const sq = Math.sqrt(i.fc), sqLim = shearSqrtFc(i.fc);
  const Acp = i.b * i.h, pcp = 2 * (i.b + i.h);
  const cage = i.stirrup && 'kind' in i.stirrup ? i.stirrup : resolveCage(i, i.stirrup);
  const diameter = cage.kind === 'closed-rectangle' ? cage.diameter : i.stirrupDiaMm;
  const depthCorrection = (i.stirrupDiaMm - diameter) / 1000;
  const d = i.d + depthCorrection, dSecondary = i.dSecondary + depthCorrection;
  const inset = 2 * i.cover + diameter / 1000;
  const x1 = i.b - inset, y1 = i.h - inset;
  const Aoh = x1 * y1, ph = 2 * (x1 + y1), Ao = 0.85 * Aoh;
  const Tth = 0.083 * sqLim * 1000 * (Acp * Acp) / pcp;
  const phiTth = PHI * Tth;
  const { Tu, Vu, VuSecondary } = i.demand;
  const vc = 0.17 * sqLim * 1000; // Vc / (bw·d), kN/m²
  const shearStress = Math.max(Vu / (i.b * d), VuSecondary / (i.h * dSecondary));
  const shearSectionRatio = Math.hypot(shearStress, 0) / (PHI * (vc + 0.66 * sq * 1000));
  const lhs = Math.hypot(shearStress, (Tu * ph) / (1.7 * Aoh * Aoh));
  const sectionRatio = lhs / (PHI * (vc + 0.66 * sq * 1000));
  const AtOverS = Tu / (PHI * 2 * Ao * i.fyt * 1000);
  const neglect = Tu < phiTth;
  const edition = i.edition ?? '2025';
  const outerLegProvided = cage.kind === 'closed-rectangle'
    ? providedTorsionStirrups({ ...cage, legs: cage.primaryLegs }).outerLegProvided : 0;
  const face = (width: number, height: number, depth: number, shear: number, legs: number, rhoW = 0) => {
    const concrete = !neglect && cage.kind === 'closed-rectangle' && shear !== 0
      ? evaluateBeamSection({
        edition, fc: i.fc * 1e6, fy: input.fy * 1e6, fyt: input.fyt * 1e6,
        b: width, h: height, d: depth, Ag: Acp, As: rhoW * width * depth,
        Av: legs * rebarSpec(diameter).area * 1e-4, s: cage.spacing, NuCompression: i.demand.Nu * 1000,
      }) : undefined;
    const reserve = shear === 0 || neglect ? 0 : concrete?.shearValid
      ? Math.max(0, shear / PHI - concrete.Vc / 1000) / (i.fyt * 1000 * depth) : Infinity;
    const required = Math.max(reserve + 2 * AtOverS, combinedTransverseMinimum(edition, width, i.fc, input.fyt));
    const provided = legs * outerLegProvided;
    return { required, provided, ratio: provided > 0 ? required / provided : Infinity };
  };
  const primary = face(i.b, i.h, d, Vu, cage.kind === 'closed-rectangle' ? cage.primaryLegs : 0, i.rhoW?.primary);
  const secondary = VuSecondary > 0
    ? face(i.h, i.b, dSecondary, VuSecondary, cage.kind === 'closed-rectangle' ? cage.secondaryLegs : 0, i.rhoW?.secondary) : undefined;
  const governing = secondary && (secondary.ratio > primary.ratio
    || (secondary.ratio === primary.ratio && secondary.required > primary.required)) ? secondary : primary;
  const { required: transverseRequired, provided: transverseProvided } = governing;
  const Al = AtOverS * ph * (i.fyt / i.fy);
  const AlMin = Math.max(0, (0.42 * sq * Acp) / i.fy - Math.max(AtOverS, (0.175 * i.b) / i.fyt) * ph * (i.fyt / i.fy));
  const sMax = Math.min(ph / 8, 0.3);
  const refusal = cage.kind === 'refusal' ? cage.reason
    : [d, dSecondary, x1, y1].every(v => Number.isFinite(v) && v > 0) ? undefined : 'Invalid stirrup cage geometry';
  const ratios = neglect ? [0] : [
    sectionRatio,
    governing.ratio,
    outerLegProvided > 0 ? AtOverS / outerLegProvided : Number.POSITIVE_INFINITY,
    cage.kind === 'closed-rectangle' ? cage.spacing / sMax : Number.POSITIVE_INFINITY,
  ];
  const ratio = Math.max(...ratios);
  return { phiTth, neglect, primaryDepth: d, sectionRatio, shearSectionRatio, transverseRequired, AtOverS, transverseProvided, outerLegProvided, Al, AlMin, sMax,
    ratio: (!neglect && refusal !== undefined) || Number.isNaN(ratio) ? Infinity : ratio,
    ...(!neglect && refusal ? { refusal } : {}) };
}
