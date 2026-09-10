/**
 * Which codes this section calculator can actually apply.
 *
 * ── Two different questions, kept apart ────────────────────────────
 *
 * `lib/codes/regulation.ts` answers "what regulations exist, which edition is
 * in force, and is its text available". This answers a narrower one: "has
 * anybody written the flexure and axial-flexure clauses for it here". A code
 * can exist, be in force, and still have no implementation — that is the
 * ordinary state of every code on the day before someone writes it.
 *
 * Conflating them is how a calculator ends up applying one edition's rules
 * under another edition's name. The registry states the rule outright: an
 * edition that is not available "may be NAMED and CITED as unavailable. It
 * may never be APPLIED. There is deliberately no fallback." This file is how
 * that rule is kept while still offering the selector.
 *
 * ── Why 2005 is the default here, and only here ────────────────────
 *
 * CIRSOC 201-2025 is the edition in force, and PRO designs to it. This
 * calculator defaults to 2005 because of what it is FOR: it reproduces the
 * CIRSOC_FLEX workbook, which is a 2005 document, and its answers are
 * validated against that workbook's published examples. Defaulting to 2025
 * would make the numbers stop matching the thing they are checked against
 * and give a reader no way to tell whether a difference was the edition or a
 * mistake.
 *
 * The registry records `textAvailable: false` for 2005 — the official text is
 * not held here. What IS held is the workbook's worked examples, and the
 * panel's own attribution says so in as many words rather than implying the
 * clauses were read from the source. That is the disclosure the registry's
 * rule is protecting, made where a user will see it.
 */

import { REGULATIONS, type RegulationEdition, type RegulationId } from '../../codes/regulation';

export interface DesignCodeOption {
  key: string;
  id: RegulationId;
  edition: RegulationEdition;
  /** What the selector shows, e.g. `CIRSOC 201-2005`. */
  label: string;
  /** Whether this calculator has the clauses. */
  implemented: boolean;
  /**
   * Why not, when it is not — shown to the reader rather than left as a
   * greyed row they have to guess about.
   */
  reasonKey?: string;
}

/**
 * The codes offered, in the order they are offered.
 *
 * Everything the registry knows about reinforced concrete, plus the two
 * foreign codes worth naming as coming. They are listed UNIMPLEMENTED rather
 * than hidden: a reader deciding whether this tool fits their work is better
 * served by seeing that Eurocode is a known gap than by not finding it.
 */
export const DESIGN_CODES: DesignCodeOption[] = [
  ...REGULATIONS.filter((r) => r.id === 'cirsoc-201').map((r) => ({
    key: `${r.id}-${r.edition}`,
    id: r.id,
    edition: r.edition,
    label: `${r.name}-${r.edition}`,
    /*
     * Only 2005's clauses are written. 2025 is in force and PRO designs to
     * it through its own adapters; this calculator has not been given its
     * flexure and axial-flexure rules, and until it has, selecting it must
     * say so rather than quietly running 2005 under a 2025 heading.
     */
    implemented: r.edition === '2005',
    reasonKey: r.edition === '2005' ? undefined : 'flex.code.notYet',
  })),
  {
    key: 'aci-318',
    id: 'cirsoc-201',
    edition: '2025',
    label: 'ACI 318',
    implemented: false,
    reasonKey: 'flex.code.foreign',
  },
  {
    key: 'eurocode-2',
    id: 'cirsoc-201',
    edition: '2025',
    label: 'Eurocódigo 2',
    implemented: false,
    reasonKey: 'flex.code.foreign',
  },
];

/** What the calculator opens on. See the note above. */
export const DEFAULT_DESIGN_CODE = 'cirsoc-201-2005';

export function findDesignCode(key: string): DesignCodeOption | undefined {
  return DESIGN_CODES.find((c) => c.key === key);
}
