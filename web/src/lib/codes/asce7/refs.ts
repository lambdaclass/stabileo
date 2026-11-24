import { clause, type ClauseRef, type RegulationEdition, type RegulationId } from '../regulation';

// The regulation registry does not list ASCE/SEI 7 yet: these refs print the id as it is until it does.
export const A7 = (c: string, label?: string): ClauseRef => clause('asce-7' as RegulationId, '2022' as RegulationEdition, c, label);

export const FT = 0.3048;
export const LBF_KN = 4.4482216152605e-3;
export const PSF = LBF_KN / (FT * FT);
export const MPH = 0.44704;
