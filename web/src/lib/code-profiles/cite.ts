import { clause, type ClauseRef, type RegulationEdition, type RegulationId } from '../codes/regulation';
import type { Cite, Meta } from './types';

/** The app's clause reference for a cite: its source's regulation id and edition, the first source's when it names none. */
export function clauseOf(meta: Meta, cite: Cite): ClauseRef {
  const source = cite.source === undefined ? meta.sources[0]! : meta.sources.find((s) => s.id === cite.source)!;
  return clause(source.id as RegulationId, source.edition as RegulationEdition, cite.clause, cite.label);
}
