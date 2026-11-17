import { clause, type ClauseRef, type RegulationEdition, type RegulationId } from '../regulation';

// The regulation registry does not list ASCE/SEI 7 yet: these refs print the id as it is until it does.
export const A7 = (c: string, label?: string): ClauseRef => clause('asce-7' as RegulationId, '2022' as RegulationEdition, c, label);

export { FT, LBF_KN, PSF, MPH } from '../../code-profiles/units';
