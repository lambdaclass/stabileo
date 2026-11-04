/**
 * The design's warnings as a catalogue: each with a stable code, its cause and what to do about
 * it, so a member that does not verify says why and how to fix it, and the code can be searched,
 * quoted in the report and looked up. One entry per outcome that is not a pass and per limiting
 * constraint the search reports. The texts are `notice.<code>.cause` and `notice.<code>.fix`.
 */
import type { DesignOutcomeKind, LimitingConstraint, MemberDesignOutcome } from './outcome';

export type NoticeSeverity = 'error' | 'warning' | 'info';
export interface CatalogueNotice { code: string; severity: NoticeSeverity; causeKey: string; fixKey: string }

const OUTCOME_CODES: Partial<Record<DesignOutcomeKind, [string, NoticeSeverity]>> = {
  SECTION_INADEQUATE: ['D001', 'error'],
  DEMAND_UNAVAILABLE: ['D002', 'error'],
  SEARCH_EXHAUSTED: ['D003', 'warning'],
  UNSUPPORTED: ['D004', 'warning'],
  PROVISIONAL_BIAXIAL: ['D005', 'warning'],
};

const CONSTRAINT_CODES: Record<LimitingConstraint, string> = {
  flexure: 'D101', shear: 'D102', axialFlexure: 'D103', biaxial: 'D104', torsion: 'D105',
  maxSteel: 'D106', minSteel: 'D107', barFit: 'D108', barSpacing: 'D109', cover: 'D110',
  congestion: 'D111', anchorage: 'D112', slenderness: 'D113', tieSpacing: 'D114',
  unsupportedCheck: 'D115', missingDemand: 'D116', missingSection: 'D117', missingMaterial: 'D118',
  missingCombinations: 'D119', memberOrientationSuspect: 'D120', searchBudget: 'D121',
};

const entry = (code: string, severity: NoticeSeverity): CatalogueNotice =>
  ({ code, severity, causeKey: `notice.${code}.cause`, fixKey: `notice.${code}.fix` });

/** Every code the catalogue knows, for the reference list and the tests. */
export const NOTICE_CATALOGUE: readonly CatalogueNotice[] = [
  ...Object.values(OUTCOME_CODES).map(([c, s]) => entry(c, s)),
  ...Object.values(CONSTRAINT_CODES).map((c) => entry(c, 'warning')),
  entry('D122', 'warning'),
  entry('D124', 'warning'),
  entry('D006', 'warning'),
];

/**
 * An exhausted search that ran out of the alternatives it implements (D006) states something
 * different from one a budget stopped (D003): what was tried, against what was not. Neither is
 * a proof of insufficiency, which is D001's alone.
 */
const EXHAUSTED_ALTERNATIVES = entry('D006', 'warning');

export const noticeForConstraint = (l: LimitingConstraint): CatalogueNotice => entry(CONSTRAINT_CODES[l], 'warning');

/** A steel member whose section lacks what the CIRSOC 301 check needs (thicknesses, shape). */
export const STEEL_INPUTS_MISSING: CatalogueNotice = entry('D122', 'warning');

/**
 * A member on a floor whose slab the model joins to a column at one node (`analysis-validity.ts`):
 * the split of the slab's load between beams and columns its forces come from is the mesh's, not
 * established, so its steel is not presented as verified.
 */
export const POINT_SLAB_COLUMN_JOINT: CatalogueNotice = entry('D124', 'warning');

/** What a member's outcome says, as catalogue notices: its own first, then what limited it. */
export function noticesOf(o: MemberDesignOutcome | undefined): CatalogueNotice[] {
  if (!o) return [];
  const out: CatalogueNotice[] = [];
  const own = OUTCOME_CODES[o.outcome];
  if (o.outcome === 'SEARCH_EXHAUSTED' && o.exhaustion?.scope === 'implementedAlternatives') out.push(EXHAUSTED_ALTERNATIVES);
  else if (own) out.push(entry(own[0], own[1]));
  for (const l of o.limiting) if (CONSTRAINT_CODES[l]) out.push(noticeForConstraint(l));
  return out;
}
