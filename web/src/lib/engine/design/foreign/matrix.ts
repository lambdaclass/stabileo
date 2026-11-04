/**
 * What each foreign code covers here, article by article: designed (the app proposes the steel or
 * the profile), checked (it rates what the model holds), partial (part of the article, with what
 * is left named in the note), not evaluated (the article applies and the app does not evaluate it;
 * the member's row says so) or excluded (named so nobody assumes it). Only designed and checked
 * articles are offered in the memoria's scope.
 *
 *  · ACI 318-19 reads the CIRSOC 201-2025 design row by row where the formula is ACI's, with
 *    the same φ and within the material limits of both (`equivalence.ts`); the rest is not
 *    verified under it. Shear and torsion hold up to fy = 420 MPa and f'c = 69 MPa, columns up
 *    to fy = 500 MPa; development length does not carry over.
 *  · AISC 360-10 reads the CIRSOC 301-2018 check likewise; the 2016 and 2022 editions' changes
 *    are not in it. Compression does not carry over (φc = 0,85 against 0,90), nor H1 with
 *    compression, nor the strong-axis shear of rolled I-shapes (φv = 1,00 in G2.1(a)).
 *  · EN 1992-1-1 (recommended values, or the UK National Annex) has a design of its own
 *    (`engine/design/eurocode/`) for beams and columns.
 *  · EN 1993-1-1 rates members with the engine's checker and picks the lightest profile of each
 *    member's family that passes with nothing left out; the UK National Annex keeps γM0 = γM1 =
 *    1,0 as recommended. The checker combines axial force and bending by 6.3.3 with the Annex B
 *    factors, Cm at the upper bound 1,0 of Table B.3 (partial: on the safe side, not the exact
 *    factors), and 6.2.8 and 6.2.6(6) are flagged, not evaluated, where they apply.
 *
 * Feature and note names are i18n keys (`fx.feat.*`, `fx.note.*`).
 */
import type { ConcreteCodeChoice, SteelCodeChoice } from '../../../model/foreign-codes';

export type MatrixStatus = 'designed' | 'checked' | 'partial' | 'notEvaluated' | 'excluded';

/** Whether the memoria offers the article: only what is designed or checked in full. */
export const offeredStatus = (s: MatrixStatus): boolean => s === 'designed' || s === 'checked';
export interface MatrixRow { feature: string; clauses: string; status: MatrixStatus; note?: string }
export type ForeignCodeId = Exclude<ConcreteCodeChoice | SteelCodeChoice, 'cirsoc'>;

const r = (feature: string, clauses: string, status: MatrixStatus, note?: string): MatrixRow => ({ feature: `fx.feat.${feature}`, clauses, status, ...(note ? { note: `fx.note.${note}` } : {}) });

const EC2_ROWS: MatrixRow[] = [
  r('beamFlexure', '6.1; 3.1.7(3)', 'designed'),
  r('beamShear', '6.2.2; 6.2.3', 'designed', 'variableStrut'),
  r('beamDetailing', '9.2.1.1; 9.2.2', 'designed'),
  r('beamAxial', '6.1', 'notEvaluated', 'beamAxial'),
  r('columnAxialFlexure', '6.1; 6.1(4)', 'designed'),
  r('columnBiaxial', '5.8.9', 'designed', 'cornerBars'),
  r('columnSlenderness', '5.8.3.1; 5.8.8', 'designed', 'nominalCurvature'),
  r('columnSway', '5.8.2(6)', 'checked', 'swayFromStorey'),
  r('creep', '5.8.4; B.1', 'designed', 'creepAnnexB'),
  r('columnShear', '6.2.2; 6.2.3', 'designed'),
  r('columnDetailing', '9.5.2; 9.5.3', 'designed'),
  r('torsion', '6.3.2', 'partial', 'torsionSolid'),
  r('providedBars', '6.1; 6.2.3', 'checked', 'providedBars'),
  r('cracking', '7.3', 'excluded'),
  r('deflection', '7.4', 'excluded'),
  r('slabsWallsFootings', '9.3; 9.6; 9.8', 'excluded'),
  r('anchorage', '8.4; 8.7', 'excluded'),
];

export const FOREIGN_MATRIX: Readonly<Record<ForeignCodeId, { name: string; edition: string; rows: MatrixRow[] }>> = {
  aci318: {
    name: 'ACI 318', edition: '19', rows: [
      r('beamFlexure', '9.5; 22.3', 'designed', 'aciEquivalence'),
      r('beamShear', '9.5; 22.5', 'partial', 'aciShearLimits'),
      r('torsion', '9.5.4; 22.7', 'partial', 'aciShearLimits'),
      r('beamDetailing', '9.6; 9.7; 25', 'partial', 'aciDetailing'),
      r('columnAxialFlexure', '10.5; 22.4', 'partial', 'aciColumn'),
      r('columnSlenderness', '6.6.4', 'designed', 'aciEquivalence'),
      r('slabsWallsFootings', '7; 8; 11; 13', 'notEvaluated', 'aciMembersOnly'),
      r('seismic', '18', 'excluded', 'aciSeismic'),
      r('loadCombinations', '5.3', 'checked', 'loadFamily'),
    ],
  },
  aisc360: {
    name: 'AISC 360', edition: '10', rows: [
      r('tension', 'D2', 'designed', 'aiscEquivalence'),
      r('compression', 'E3; E4; E7', 'notEvaluated', 'aiscPhiC'),
      r('flexure', 'F2; F3; F6', 'partial', 'aiscFlexure'),
      r('shear', 'G2; G7', 'partial', 'aiscShear'),
      r('interaction', 'H1', 'partial', 'aiscInteraction'),
      r('stability', 'C; App. 7', 'checked', 'directAnalysis'),
      r('connections', 'J; K', 'notEvaluated', 'aiscMembersOnly'),
      r('laterEditions', '360-16; 360-22', 'excluded', 'laterEditions'),
    ],
  },
  ec2: { name: 'EN 1992-1-1', edition: '2004', rows: EC2_ROWS },
  'ec2-uk': { name: 'BS EN 1992-1-1 + UK NA', edition: '2004', rows: [...EC2_ROWS, r('nationalAnnex', 'NA 2.4; 3.1.6', 'designed', 'ukConcrete')] },
  ec3: {
    name: 'EN 1993-1-1', edition: '2005', rows: [
      r('classification', '5.5', 'checked', 'class4'),
      r('crossSection', '6.2', 'partial', 'ec3CrossSection'),
      r('compression', '6.3.1', 'designed', 'lightestProfile'),
      r('lateralTorsional', '6.3.2', 'designed', 'c1'),
      r('interaction', '6.3.3', 'partial', 'annexBCm'),
      r('connections', 'EN 1993-1-8', 'excluded'),
    ],
  },
  'ec3-uk': {
    name: 'BS EN 1993-1-1 + UK NA', edition: '2005', rows: [
      r('classification', '5.5', 'checked', 'class4'),
      r('crossSection', '6.2', 'partial', 'ec3CrossSection'),
      r('compression', '6.3.1', 'designed', 'lightestProfile'),
      r('lateralTorsional', '6.3.2', 'designed', 'ukLtb'),
      r('interaction', '6.3.3', 'partial', 'annexBCm'),
      r('nationalAnnex', 'NA 2.15', 'checked', 'ukSteel'),
      r('connections', 'BS EN 1993-1-8', 'excluded'),
    ],
  },
};

/** The load family that goes with each design code: a project combining one with another family is told. */
export const LOAD_FAMILY_OF: Readonly<Record<ForeignCodeId, 'aci-aisc' | 'eurocode'>> = {
  aci318: 'aci-aisc', aisc360: 'aci-aisc', ec2: 'eurocode', 'ec2-uk': 'eurocode', ec3: 'eurocode', 'ec3-uk': 'eurocode',
};
