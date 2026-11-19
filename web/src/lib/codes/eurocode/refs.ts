import { clause, type ClauseRef, type RegulationEdition, type RegulationId } from '../regulation';

// RegulationId and RegulationEdition are CIRSOC's closed unions: the Eurocodes cite through a cast.
const cite = (regulation: string, edition: string) => (c: string, l?: string): ClauseRef =>
  clause(regulation as RegulationId, edition as RegulationEdition, c, l);

export const EN1990 = cite('EN 1990', '2002');
export const EN1991_1_1 = cite('EN 1991-1-1', '2002');
export const EN1991_1_3 = cite('EN 1991-1-3', '2003');
export const EN1991_1_4 = cite('EN 1991-1-4', '2005');
export const EN1998_1 = cite('EN 1998-1', '2004');

export const UK_NA_1990 = cite('NA to BS EN 1990', '2004');
export const UK_NA_1991_1_1 = cite('NA to BS EN 1991-1-1', '2005');
export const UK_NA_1991_1_3 = cite('NA to BS EN 1991-1-3', '2005');
export const UK_NA_1991_1_4 = cite('NA to BS EN 1991-1-4', '2008');

export type EcFamily = 'eurocode' | 'uk';
