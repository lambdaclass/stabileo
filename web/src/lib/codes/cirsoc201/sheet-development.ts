import { reinforcementSheets } from '../../features';
import { clause } from '../regulation';
import { msg, round } from '../message';
import { deriveDevelopment, developmentAtCoefficient, MIN_DEVELOPMENT_MM, TABLE_25_4_2_3_DIAMETER_BREAK_MM, type DevelopmentInputs, type DevelopmentResult } from './anchorage';

export interface Confinement { cbMm: number; ktrMm?: number }

export const MAX_CONFINEMENT_TERM = 2.5;

export const confinementOf = (diameterMm: number, clearCoverMm: number, spacingMm: number): Confinement =>
  ({ cbMm: Math.min(clearCoverMm + diameterMm / 2, spacingMm / 2) });

export const favourableRow = (o: { diameterMm: number; clearSpacingMm: number; clearCoverMm: number; minimumStirrups: boolean }): boolean =>
  o.clearCoverMm >= o.diameterMm - 1e-9 && o.clearSpacingMm >= (o.minimumStirrups ? 1 : 2) * o.diameterMm - 1e-9;

export const sizeFactor = (diameterMm: number): number => (diameterMm <= TABLE_25_4_2_3_DIAMETER_BREAK_MM ? 0.8 : 1.0);


export function deriveSheetDevelopment(input: DevelopmentInputs & { confinement?: Confinement }): DevelopmentResult {
  if (!reinforcementSheets() || !input.confinement) return deriveDevelopment(input);
  const { diameterMm: db, edition, confinement } = input;
  const ktr = confinement.ktrMm ?? 0;
  const term = Math.min((confinement.cbMm + ktr) / db, MAX_CONFINEMENT_TERM);
  const psiS = sizeFactor(db);
  const coefficient = (1.1 * term) / psiS;
  const { psiT, psiG, lambda, computedMm, ldMm, refs } = developmentAtCoefficient(input, coefficient);
  const minimum = ldMm > computedMm;
  return {
    ldM: ldMm / 1000, computedM: computedMm / 1000, governedByMinimum: minimum,
    tableRow: 'general', tableColumn: db > TABLE_25_4_2_3_DIAMETER_BREAK_MM ? 'db>16' : 'db<=16',
    coefficient, confinementTerm: term,
    refs: [
      clause('cirsoc-201', edition, '25.4.2.4', 'longitud de anclaje para barras conformadas en tracción, expresión general'),
      clause('cirsoc-201', edition, 'Tabla 25.4.2.5', 'factores de modificación'), ...refs,
    ],
    derivation: msg(minimum ? 'codes.cirsoc201.anchorage.developmentGeneralMinimum' : 'codes.cirsoc201.anchorage.developmentGeneral', {
      db, psiT, psiS, psiG, lambda, cb: round(confinement.cbMm, 1), ktr, term: round(term, 2),
      computed: round(computedMm, 0), minimum: MIN_DEVELOPMENT_MM, ld: round(ldMm, 0),
    }),
  };
}
