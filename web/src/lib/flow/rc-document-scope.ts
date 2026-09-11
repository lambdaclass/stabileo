/**
 * What a document is allowed to cover, and what the user narrowed it to.
 *
 * ── The third answer this removes ──────────────────────────────────
 *
 * Before this module there were three ways to ask "what does this document cover" and they could
 * disagree:
 *
 *   1. `DocumentModel.scope` — the FAMILIES the design run was asked for, stamped on every
 *      export by `scopeStatement`;
 *   2. the assemblies actually in the document — whatever the detailing run happened to draw;
 *   3. `ExportRecord.elements` — recorded on every emission and displayed nowhere.
 *
 * A user who designed beams and columns, ran the detailing, and then unticked `column` in
 * Diseñar got a set whose banner said "SCOPE: beams" and whose sheets drew the columns. Nothing
 * in that chain is a lie on its own, and the reader on site has no way to find the seam.
 *
 * ── The rule, confirmed as product on 2026-08-27 ───────────────────
 *
 * Documentos REUSES the family scope chosen in Diseñar. It may narrow; it may never widen.
 *
 *   the base set          the members of the drawing whose family Diseñar selected
 *   narrowing             a subset of that base, chosen element by element
 *   widening              impossible from here — a family is added in Diseñar and nowhere else
 *   every export          declares the families AND the elements it contains
 *
 * `design-convergence.ts` already made the family selection the denominator of the convergence
 * claim, for the reason its header gives: a global denominator declares a legitimate
 * beams-and-columns job permanently unconverged. This module is the same denominator applied one
 * level down — to the elements — so the two cannot come apart.
 *
 * ── Why an unclassified member is INCLUDED and named ───────────────
 *
 * The family of a frame member is read from its `MemberContext`, and a context can be absent: a
 * model edited after the detailing ran leaves members in the drawing that nothing can classify.
 * Dropping them would silently remove steel from a drawing set, which is the one failure mode
 * that must not be traded for tidiness. So they stay in the base and are reported as
 * `unclassified`, and the panel says so out loud.
 *
 * A member whose family is KNOWN and outside the selection is a different case: it is excluded,
 * and the remedy is named — tick the family in Diseñar.
 *
 * Pure: no store, no runes, no i18n.
 */

import { DESIGN_FAMILIES, type DesignFamily } from '../engine/design/design-families';

/**
 * One member the drawing contains, with every family its steel belongs to.
 *
 * ── Why a member can have more than one ────────────────────────────
 *
 * A footing's design record is owned by the COLUMN it carries — `ownerElementIds` on a
 * `FootingDesignRecord` names the column, not a footing element, because a footing is an entity
 * and not a member of the model. So element 10 can be a column in a column stack and the owner of
 * a footing record at the same time, and both statements are true of the same drawing.
 *
 * A single family would have to pick one, and either choice breaks a real project: reading the
 * column loses a foundations-only job (nothing would be documentable), and reading the footing
 * mislabels every column that happens to sit on one.
 */
export interface RcDocumentableMember {
  elementId: number;
  /**
   * Empty when nothing in the project can name a family for it.
   *
   * Not a default: guessing one would put a member in or out of scope on the strength of an
   * assumption, and the two errors are not symmetric — see the header on `unclassified`.
   */
  families: readonly DesignFamily[];
}

/** One member excluded from the base, with the families that put it out of scope. */
export interface RcExcludedMember {
  elementId: number;
  families: DesignFamily[];
}

export interface RcDocumentScope {
  /** The families Diseñar selected, in `DESIGN_FAMILIES` order. The base set's own scope. */
  designFamilies: DesignFamily[];
  /** Every member this project may document, ascending. */
  base: number[];
  /** What the next export will contain, ascending. A subset of `base`. */
  elements: number[];
  /** The families `elements` belongs to — a subset of `designFamilies`, never more. */
  families: DesignFamily[];
  /** True when nothing was narrowed: `elements` is the whole base. */
  whole: boolean;
  /**
   * Members of the drawing whose family Diseñar did not select.
   *
   * They are not documentable from here. Named rather than counted so the panel can point at
   * them, and so the remedy — tick the family in Diseñar — has a subject.
   */
  excluded: RcExcludedMember[];
  /** Members in the base that nothing could classify. In the set, and stated. */
  unclassified: number[];
  /**
   * Requested ids the base does not contain.
   *
   * A refused widening, whatever its cause: a family out of scope, or a member the detailing no
   * longer draws. Reported rather than dropped, because a selection that silently loses an
   * element is a selection the user still believes in.
   */
  refused: number[];
  /**
   * Nothing selected.
   *
   * Its own flag rather than `elements.length === 0`, because the two reachable ways to get there
   * mean different things and the second is not this one: an empty BASE is a project with nothing
   * documentable, and an empty SELECTION is a user who unticked everything. Both block an export;
   * only one of them is fixed by ticking a box.
   */
  emptySelection: boolean;
}

/**
 * Resolve what the next export covers.
 *
 * `requested === null` means the whole base — the state a project starts in and the one a
 * "select all" returns to. It is NOT the same as requesting every id: the base moves when the
 * detailing is regenerated, and a caller holding an explicit list would keep exporting the set
 * that was documentable an hour ago.
 */
export function resolveDocumentScope(input: {
  /** The members the drawing contains, with their families. */
  members: readonly RcDocumentableMember[];
  /** `designRunStore.familySelection` — the base set's scope. */
  designFamilies: readonly DesignFamily[];
  /** The user's narrowing, or null for the whole base. */
  requested: readonly number[] | null;
}): RcDocumentScope {
  const inScope = new Set(input.designFamilies);
  const base: number[] = [];
  const excluded: RcExcludedMember[] = [];
  const unclassified: number[] = [];
  /** The IN-SCOPE families of each member, which is what the statement may name. */
  const familiesOf = new Map<number, DesignFamily[]>();

  for (const m of input.members) {
    if (familiesOf.has(m.elementId)) continue;
    const own = DESIGN_FAMILIES.filter((f) => m.families.includes(f));
    const covered = own.filter((f) => inScope.has(f));
    familiesOf.set(m.elementId, covered);
    if (own.length === 0) {
      base.push(m.elementId);
      unclassified.push(m.elementId);
      continue;
    }
    /*
     * ANY family in scope puts the member in the base.
     *
     * A column standing on a footing carries both families' steel. On a foundations-only run the
     * column is the element the footing drawing draws, so reading only its frame family would
     * make a legitimate job produce nothing documentable at all.
     */
    if (covered.length === 0) {
      excluded.push({ elementId: m.elementId, families: own });
      continue;
    }
    base.push(m.elementId);
  }

  const asc = (a: number, b: number) => a - b;
  base.sort(asc);
  unclassified.sort(asc);
  excluded.sort((a, b) => a.elementId - b.elementId);

  const baseSet = new Set(base);
  const requested = input.requested;
  const elements = requested === null
    ? [...base]
    : [...new Set(requested)].filter((id) => baseSet.has(id)).sort(asc);
  const refused = requested === null
    ? []
    : [...new Set(requested)].filter((id) => !baseSet.has(id)).sort(asc);

  const present = new Set<DesignFamily>();
  for (const id of elements) {
    for (const f of familiesOf.get(id) ?? []) present.add(f);
  }

  return {
    designFamilies: DESIGN_FAMILIES.filter((f) => inScope.has(f)),
    base,
    elements,
    families: DESIGN_FAMILIES.filter((f) => present.has(f)),
    whole: requested === null || elements.length === base.length,
    excluded,
    unclassified,
    refused,
    emptySelection: requested !== null && elements.length === 0 && base.length > 0,
  };
}

/**
 * Whether an export may go out at all.
 *
 * Two refusals, worded apart. `noBase` is a project with nothing documentable — the answer is
 * upstream, in Diseñar or in the detailing. `emptySelection` is a user who unticked everything,
 * and the answer is one click away. A single "nothing to export" would send half the users to the
 * wrong place.
 */
export function documentScopeBlocker(
  s: RcDocumentScope,
): 'noBase' | 'emptySelection' | null {
  if (s.base.length === 0) return 'noBase';
  if (s.elements.length === 0) return 'emptySelection';
  return null;
}
