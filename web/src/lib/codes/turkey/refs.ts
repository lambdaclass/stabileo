import { clause, type ClauseRef, type RegulationEdition, type RegulationId } from '../regulation';

// The regulation registry does not list the Turkish codes yet: these ids print as they are until it does.
const ref = (id: string, edition: string) => (c: string, label?: string): ClauseRef =>
  clause(id as RegulationId, edition as RegulationEdition, c, label);

export const TS498 = ref('ts-498', '1997');
export const TS500 = ref('ts-500', '2000');
export const TBDY = ref('tbdy', '2018');
