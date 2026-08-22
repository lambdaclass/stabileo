/**
 * Per-member assumptions, and where each one comes from.
 *
 * ── Why provenance is the whole point ──────────────────────────────
 *
 * Stage 5 listed the checker's assumptions as a flat set of five sentences, identical for every
 * member. That is better than hiding them and still not enough to act on: a reader cannot tell
 * whether an assumption was something THEY chose, something a generator recorded, or something the
 * app decided on their behalf. Only the third kind is a risk they did not take knowingly, and it is
 * the kind this app is full of.
 *
 * So every assumption here carries a source:
 *
 *   · `user` — declared in the model. Nothing is `user` today; the field exists because that is
 *     what the fix looks like, and a slot with nothing in it is a more honest statement of the gap
 *     than no slot at all.
 *   · `generator` — recorded when the model was generated. Also empty today, and for a reason worth
 *     stating precisely: the shed generator DOES place explicit bracing members, and `emit.ts`
 *     throws the relationship away — the role never reaches the stored `Element`, and the section is
 *     named after its profile rather than its role. The knowledge existed and was discarded.
 *   · `assumed` — the app decided. Everything is here.
 *   · `notInferable` — nobody can decide it from what the model holds. Distinct from `assumed`
 *     because no amount of care would produce a value: there is no field to read.
 *
 * ── `Lb` is reported, never invented ───────────────────────────────
 *
 * The value shown is the member's own length, because that is literally what
 * `verification-service.ts` passes. It is not `L/2`, not `L/n` over intermediate nodes, and not a
 * fraction of anything: replacing a declared conservative assumption with an undeclared and
 * possibly unsafe one is the trade this module exists to refuse.
 */

import type { SteelInventory } from './steel-inventory';

/** Where an assumption came from. */
export type AssumptionSource = 'user' | 'generator' | 'assumed' | 'notInferable';

export interface MemberAssumption {
  /** i18n key for the assumption itself. */
  key: string;
  source: AssumptionSource;
  /**
   * i18n key saying what would have to exist for this to stop being an assumption.
   *
   * Present on everything that is not already `user`: an assumption with no route out of being one
   * reads as a permanent property of the world, and most of these are not.
   */
  routeOutKey?: string;
}

export interface AssumptionRow {
  elementId: number;
  memberName: string;
  /** The unbraced length the checker is given, in metres. The member's own length. */
  lbM: number;
  /** Always `assumed` today. `user` and `generator` are the two ways out. */
  lbSource: AssumptionSource;
  /**
   * How many bracing members the model records for this one. **Always zero**, and not because there
   * are none — because there is no field that could hold the relationship.
   */
  bracingRecorded: number;
  applicable: MemberAssumption[];
  /**
   * Assumptions the app NO LONGER makes, so a reader can see what moved.
   *
   * Empty in normal operation; the list exists so that when an assumption is retired it can be
   * shown as retired for one release rather than silently vanishing.
   */
  retired: MemberAssumption[];
  /** What cannot be inferred at all from what the model holds. */
  notInferable: MemberAssumption[];
  /** i18n keys for what stops these assumptions from being validated. */
  blockedBy: string[];
}

/**
 * The assumptions that apply to every metallic member, with their provenance.
 *
 * Flat rather than per-member because that is the truth: not one of them varies by member today.
 * Presenting them per-member anyway would imply a granularity the app does not have — and the row
 * still carries the member's own `lbM`, which does vary and is the number that matters.
 */
const UNIVERSAL: readonly MemberAssumption[] = Object.freeze([
  {
    key: 'steel.assume.unbracedLengthIsMemberLength',
    source: 'assumed',
    routeOutKey: 'steel.assume.route.bracingData',
  },
  {
    key: 'steel.assume.noSectionClassification',
    source: 'assumed',
    routeOutKey: 'steel.assume.route.implementClassification',
  },
  {
    key: 'steel.assume.netAreaEqualsGross',
    source: 'assumed',
    routeOutKey: 'steel.assume.route.boltGeometry',
  },
  {
    key: 'steel.assume.noPlasticMomentCap',
    source: 'assumed',
    routeOutKey: 'steel.assume.route.implementCap',
  },
  {
    key: 'steel.assume.noTorsionalBuckling',
    source: 'assumed',
    routeOutKey: 'steel.assume.route.implementE4',
  },
  {
    key: 'steel.assume.momentGradientIsUnity',
    source: 'assumed',
    routeOutKey: 'steel.assume.route.momentDiagram',
  },
  {
    key: 'steel.assume.torsionalConstantZeroWhenAbsent',
    source: 'assumed',
    routeOutKey: 'steel.assume.route.torsionalConstant',
  },
]);

/**
 * What the model cannot tell anyone, however carefully it is read.
 *
 * Separated from `assumed` because the remedy differs in kind: an assumed value could be replaced
 * by a better rule, while these need a FIELD that does not exist. Saying «assumed» about them would
 * suggest the app could do better with the data it has.
 */
const NOT_INFERABLE: readonly MemberAssumption[] = Object.freeze([
  {
    key: 'steel.assume.notInferable.bracingPoints',
    source: 'notInferable',
    routeOutKey: 'steel.assume.route.bracingData',
  },
  {
    key: 'steel.assume.notInferable.effectiveLength',
    source: 'notInferable',
    routeOutKey: 'steel.assume.route.effectiveLength',
  },
  {
    key: 'steel.assume.notInferable.holePattern',
    source: 'notInferable',
    routeOutKey: 'steel.assume.route.boltGeometry',
  },
]);

/** What stops the assumptions above from being validated. Not data — signatures and implementations. */
const VALIDATION_BLOCKERS: readonly string[] = Object.freeze([
  'steel.workflow.blocker.clauseRefs',
  'steel.workflow.blocker.unbracedLength',
  'steel.workflow.blocker.signature',
]);

/**
 * One row per metallic member.
 *
 * `lengthM` comes from the inventory, which measures it from the nodes — so `lbM` is the real
 * number the checker will receive, not a restatement of the rule.
 */
export function assumptionRows(inv: SteelInventory): AssumptionRow[] {
  return inv.members.map((m) => ({
    elementId: m.elementId,
    memberName: m.sectionName,
    lbM: m.lengthM,
    lbSource: 'assumed' as const,
    bracingRecorded: 0,
    applicable: [...UNIVERSAL],
    retired: [],
    notInferable: [...NOT_INFERABLE],
    blockedBy: [...VALIDATION_BLOCKERS],
  }));
}

/** i18n key for a source. Never a raw enum on screen. */
export const assumptionSourceKey = (s: AssumptionSource): string => `steel.assume.source.${s}`;
