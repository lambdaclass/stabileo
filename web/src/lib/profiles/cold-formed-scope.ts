/**
 * What the app can and cannot do with a cold-formed section, as data rather than prose.
 *
 * ── Why this is a list and not a paragraph in a component ─────────────
 *
 * Five separate facts have to reach a user, and they are not interchangeable:
 *
 *   1. the parametric geometry EXISTS — a section can be specified, derived and drawn;
 *   2. the tabulated catalogue is NOT available — nothing lists what a mill rolls;
 *   3. CIRSOC 301 EXCLUDES these sections, by name, in the text this app ships;
 *   4. CIRSOC 303 — the code that does cover them — is NOT incorporated;
 *   5. therefore there is NO normative verification.
 *
 * Written as prose in a panel, those five collapse into "cold-formed is not supported", which is
 * false: the first is a capability and the reader loses it. Written as data, each one keeps its
 * own kind (`available` vs `unavailable`), its own key, and its own place in the reasoning — and a
 * test can assert that all five are present, which is the only way «the state explains it» stops
 * being an opinion.
 *
 * ── The order is an argument ──────────────────────────────────────────
 *
 * Capability first, then the two absences, then the exclusion, then the conclusion that follows
 * from them. A reader who stops after the first line has learned something true; a reader who
 * gets to the last one knows why. Reversing it would open on a refusal and bury the fact that
 * anything works at all.
 *
 * ── Not a status ─────────────────────────────────────────────────────
 *
 * This is the SCOPE — a property of the app, identical for every cold-formed member in every
 * model. A member's own state (`NOT_DESIGNED`, and why) lives in `steel-inventory.ts` and is
 * per-member. Keeping them apart is what stops a panel from claiming that a particular member was
 * examined when what actually happened is that no code covers its shape.
 */

/** The five facts, in the order they are meant to be read. */
export type ColdFormedScopeFact =
  /** A section can be specified, its properties derived and its outline drawn. */
  | 'parametricGeometryAvailable'
  /** No sourced list of commercially rolled sizes ships with the app. */
  | 'tabulatedCatalogueUnavailable'
  /** CIRSOC 301-2018 chapter A excludes cold-formed open sections and defers to 303. */
  | 'cirsoc301Excludes'
  /** CIRSOC 303-2009 is not in `docs/codes/`, so the code that covers them is absent. */
  | 'cirsoc303NotIncorporated'
  /** Nothing verifies these sections. No utilization, no capacity, no pass. */
  | 'noNormativeVerification';

export interface ColdFormedScopeEntry {
  fact: ColdFormedScopeFact;
  /**
   * Whether this line is a capability or a limit.
   *
   * On the entry so a surface can style the two differently without pattern-matching on the fact
   * name — and so it is impossible to render all five as refusals, which is the failure mode this
   * whole module exists to prevent.
   */
  kind: 'available' | 'unavailable';
  /** i18n key. Never raw prose, same rule `SteelReason` follows. */
  key: string;
  /**
   * The clause a fact rests on, where it rests on one.
   *
   * Present only for the two that are normative claims. A fact about this repository's contents
   * («no sourced series») is not a clause and must not be dressed as one.
   */
  clause?: string;
}

/**
 * The scope, in reading order.
 *
 * Frozen because it is a statement about the app, not a configuration: a caller that could filter
 * or reorder it could show the refusals without the capability, or the conclusion without its
 * premises.
 */
export const COLD_FORMED_SCOPE: readonly ColdFormedScopeEntry[] = Object.freeze([
  {
    fact: 'parametricGeometryAvailable',
    kind: 'available',
    key: 'steel.coldFormed.scope.parametricGeometryAvailable',
  },
  {
    fact: 'tabulatedCatalogueUnavailable',
    kind: 'unavailable',
    key: 'steel.coldFormed.scope.tabulatedCatalogueUnavailable',
  },
  {
    fact: 'cirsoc301Excludes',
    kind: 'unavailable',
    key: 'steel.coldFormed.scope.cirsoc301Excludes',
    // Chapter A, «Especificaciones generales» — the scope article that names the deferral.
    clause: 'CIRSOC 301-2018 A',
  },
  {
    fact: 'cirsoc303NotIncorporated',
    kind: 'unavailable',
    key: 'steel.coldFormed.scope.cirsoc303NotIncorporated',
    clause: 'CIRSOC 303-2009',
  },
  {
    fact: 'noNormativeVerification',
    kind: 'unavailable',
    key: 'steel.coldFormed.scope.noNormativeVerification',
  },
] as const);

/**
 * The one fact that is a capability, separated out for a surface that leads with it.
 *
 * A panel that opens with «what you CAN do» reads differently from one that opens with a list of
 * four things you cannot, and both are the same five facts.
 */
export const COLD_FORMED_AVAILABLE = COLD_FORMED_SCOPE.filter((e) => e.kind === 'available');
export const COLD_FORMED_LIMITS = COLD_FORMED_SCOPE.filter((e) => e.kind === 'unavailable');

/**
 * The extra thing a ZED needs said, on top of the five.
 *
 * A zed is only point-symmetric, so its product of inertia is nonzero and its principal axes are
 * rotated — and this app has no field for a product of inertia anywhere. Analysing one about its
 * geometric axes is therefore correct only if the member cannot bend out of that plane, which for
 * a sheeted purlin is usually the case and is exactly the provision that lives in the cold-formed
 * code the app does not have.
 *
 * So the honest line is neither «wrong» nor «fine»: the assumption that would make it valid
 * cannot be cited. Kept separate from `COLD_FORMED_SCOPE` because it applies to one shape and
 * showing it beside a channel would be a warning about nothing.
 */
export const COLD_FORMED_ZED_AXES_KEY = 'steel.coldFormed.zedAxesNotPrincipal';
