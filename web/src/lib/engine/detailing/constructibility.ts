/**
 * The CONSTRUCTIBLE gate.
 *
 * ── What went wrong ────────────────────────────────────────────────
 *
 * The coordination search reported `CONSTRUCTIBLE` when it found a complete assignment.
 * On the flagship that label sat on top of 7,246 prohibited physical overlaps, no
 * re-verification after the geometry moved, no placement-robustness check, and no
 * consumption of the lap geometry by anything downstream.
 *
 * The search was not lying about what it knew. It reasons about joint threading and
 * collinear transitions, it found an assignment, and that is a real result. The defect was
 * that "an assignment exists" and "this can be built" were the same word. They are
 * different claims with different evidence and different consequences: the first is an
 * intermediate search outcome, the second is a statement to an engineer who will pour
 * concrete against it.
 *
 * So the search now says `ASSIGNMENT_FOUND`, and constructibility is decided HERE, on the
 * materialised geometry, against thirteen conditions that must ALL hold.
 *
 * ── Why it is data, not a boolean ──────────────────────────────────
 *
 * Every condition is reported with its own evidence, whether it passed or failed. A gate
 * that returns false and nothing else is a gate nobody can argue with, and the engineer
 * has to be able to see which of the thirteen is blocking and by how much. A single failing
 * condition is enough to withhold the claim — and it must be NAMED, not summarised.
 *
 * Pure: no store, no runes, no i18n.
 */

import { msg, round, type EngineMessage } from '../../codes/message';
import {
  familyCertificateMissing, familyCertificateStale,
  type FamilyRequirement,
} from './family-record';

/**
 * The sixteen conditions, in the order they are evaluated and reported.
 *
 * The thirteenth — `allRequiredTransversePathsMaterialised` — was added when the transverse
 * cage became physical. Without it the gate had no way to tell a floor whose stirrups exist
 * from one whose stirrups are still an instruction, and CONSTRUCTIBLE was reachable with no
 * shear steel in the model at all.
 *
 * The fourteenth and fifteenth were added when slabs, walls and footings gained real design
 * records. Before them the gate had exactly ONE certificate instrument —
 * `certificatesMatchGeometry`, counted over FRAME members — so a slab-only floor faced a
 * choice between two wrong answers: leave `reverifiedMembers` at zero and never reach
 * CONSTRUCTIBLE however complete the design, or set the frame flags true and satisfy two
 * conditions that nothing measured. The second is the false-completeness this whole gate
 * exists to prevent, and it is now impossible to express: the frame conditions count frame
 * members, the family conditions count family members, and each is measured against what is
 * APPLICABLE rather than against a flag a caller could set.
 *
 * The sixteenth — `wholeModelDetailed` — is the same lesson a third time, and the first one
 * measured on something OUTSIDE the assembly. Every condition above it is evaluated over the
 * members that were drawn, because `runDetailing` details `readiness.detailable` and
 * `applicableMembers` is `elementIds.length`. So a frame with eight refused columns and four
 * verified ones produced a cage of four that was complete, clash-free and fully certified — and
 * satisfied all fifteen. The claim was true of the drawing and false of the structure, which is
 * the failure this module exists to make impossible. See `design-convergence.ts`.
 */
export const CONSTRUCTIBILITY_CONDITIONS = [
  'completeEnvelope',
  'searchNotTruncated',
  'allMembersAssigned',
  'allTransitionsMaterialised',
  'noUnmaterialisedTransitions',
  'allRequiredTransversePathsMaterialised',
  'noProhibitedConflicts',
  'allMembersReverified',
  'certificatesMatchGeometry',
  'allApplicableFamiliesCertified',
  'noStaleFamilyCertificate',
  'allSpacingCodeLegal',
  'allSpacingPlacementRobust',
  'noUnsupportedRule',
  'noStaleUpstreamRevision',
  'wholeModelDetailed',
] as const;

export type ConstructibilityCondition = (typeof CONSTRUCTIBILITY_CONDITIONS)[number];

export interface ConditionResult {
  condition: ConstructibilityCondition;
  passed: boolean;
  /** How many items failed this condition. Zero when it passed. */
  failing: number;
  /** Translated at the boundary. States the measurement, not a verdict. */
  detail: EngineMessage;
}

/**
 * Everything the gate needs, measured from the materialised model.
 *
 * Deliberately all raw counts and flags rather than pre-digested booleans: a caller that
 * can pass `noProhibitedConflicts: true` can pass it wrongly, and the whole point of this
 * module is that the claim is checkable.
 */
export interface ConstructibilityFacts {
  /** Did the search cover the complete supported envelope (beams AND columns)? */
  completeEnvelope: boolean;
  /** Did any bound stop the search? */
  searchTruncated: boolean;
  /** Applicable members, and how many the search assigned a layout to. */
  applicableMembers: number;
  assignedMembers: number;
  /** Transitions the search selected, and how many produced real geometry. */
  selectedTransitions: number;
  materialisedTransitions: number;
  /** Transitions the search selected that the geometry could not build. */
  unmaterialisedTransitions: number;
  /**
   * Transverse pieces the stirrup ZONES require, and how many exist as real `BarPath`s.
   *
   * ── Counts, not a boolean ──────────────────────────────────────────
   *
   * A boolean says the cage is incomplete; two counts say by how much, and "3 of 412
   * missing" and "0 of 412 present" send an engineer to completely different places.
   *
   * ── Derived from the ZONES, deliberately ───────────────────────────
   *
   * `requiredTransversePieces` comes from the zone geometry and the table's spacing, NOT
   * from the pieces that were built. A requirement read off the output is satisfied by a
   * generator that emits nothing, which is exactly the failure this condition exists to
   * catch.
   */
  requiredTransversePieces: number;
  materialisedTransversePieces: number;
  /** Physical bar-surface interpenetrations that remain unresolved. */
  prohibitedConflicts: number;
  /** Members whose final geometry was passed back through the authoritative verifier. */
  reverifiedMembers: number;
  /**
   * Members whose certificate hash matches the hash of the rebar actually in the model.
   *
   * A certificate issued against a layout that was later moved is worse than no
   * certificate: it is a correct-looking claim about geometry that no longer exists.
   */
  certificateHashMatches: number;
  /** Spacing assessments that failed the code minimum. */
  spacingNotCodeLegal: number;
  /** Spacing assessments that pass the code but not the project's placement margin. */
  spacingNotPlacementRobust: number;
  /** Rules the engine cannot represent and that apply to this model. */
  unsupportedRules: number;
  /** Assemblies whose upstream demand revision has moved on. */
  staleAssemblies: number;
  /**
   * Members of the MODEL that this detailing does not answer for.
   *
   * ── Why it is a separate number from `applicableMembers` ───────────
   *
   * `applicableMembers` counts what entered the assembly, and every condition above is measured
   * against it. That is correct for all of them: they ask whether the cage that was drawn is
   * sound. This one asks a question none of them can — whether the cage that was drawn is the
   * whole cage — and it cannot be answered from inside the assembly, because a member with no
   * verified design never reaches it.
   *
   * Supplied by the caller from `assessDesignConvergence`, and a raw count for the reason the
   * whole interface is raw counts: a caller that can pass `wholeModelDetailed: true` can pass it
   * wrongly, and "3 of 248 undetailed" and "245 of 248 undetailed" are the same boolean and
   * completely different situations.
   *
   * Zero on a fully converged design, which is the only value that lets the gate through.
   */
  undetailedModelMembers: number;
  /**
   * Certificate evidence for the floor families, one entry per family, ALWAYS present.
   *
   * ── Why it is required rather than optional ─────────────────────────
   *
   * Because `undefined >= undefined` is false and reads like a failing measurement, and the
   * inverse — an omitted count treated as satisfied — reads like a passing one. This gate
   * has already been broken once in each direction: the thirteenth condition compared two
   * absent numbers and no floor could ever be constructible, and before that an empty
   * conflict list was taken as the whole of constructibility.
   *
   * So a caller must SAY what families apply. A beam line states three requirements with
   * `applicable: 0`, which is a measurement — "no slabs here" — and is what makes it
   * distinguishable from "slabs here, none certified". An omitted field could mean either.
   */
  familyRequirements: readonly FamilyRequirement[];
}

export type ConstructibilityVerdict = 'CONSTRUCTIBLE' | 'CONFLICTED' | 'NOT_ESTABLISHED';

export interface ConstructibilityAssessment {
  verdict: ConstructibilityVerdict;
  conditions: ConditionResult[];
  /** The conditions that failed, in evaluation order. Empty iff CONSTRUCTIBLE. */
  blocking: ConstructibilityCondition[];
  summary: EngineMessage;
}

function cond(
  condition: ConstructibilityCondition, passed: boolean, failing: number,
  detail: EngineMessage,
): ConditionResult {
  return { condition, passed, failing, detail };
}

/**
 * Decide whether this detailing may be called constructible.
 *
 * All sixteen or none. There is no partial credit and no "mostly": an engineer reading
 * CONSTRUCTIBLE is entitled to assume every one of these was checked.
 *
 * The distinction between the two failure verdicts is about what the engineer does next.
 * `CONFLICTED` means the geometry is wrong and there is something to fix. `NOT_ESTABLISHED`
 * means the geometry may well be fine but the work of proving it has not been done — an
 * unverified model is not a failing model, and reporting it as one sends the engineer
 * hunting for a defect that does not exist.
 */
export function assessConstructibility(f: ConstructibilityFacts): ConstructibilityAssessment {
  const conditions: ConditionResult[] = [
    cond('completeEnvelope', f.completeEnvelope, f.completeEnvelope ? 0 : 1,
      msg('detailing.constructible.envelope', {
        complete: f.completeEnvelope ? 1 : 0,
      })),
    cond('searchNotTruncated', !f.searchTruncated, f.searchTruncated ? 1 : 0,
      msg('detailing.constructible.truncated', { truncated: f.searchTruncated ? 1 : 0 })),
    cond('allMembersAssigned', f.assignedMembers >= f.applicableMembers,
      Math.max(0, f.applicableMembers - f.assignedMembers),
      msg('detailing.constructible.assigned', {
        assigned: f.assignedMembers, total: f.applicableMembers,
      })),
    cond('allTransitionsMaterialised',
      f.materialisedTransitions >= f.selectedTransitions,
      Math.max(0, f.selectedTransitions - f.materialisedTransitions),
      msg('detailing.constructible.materialised', {
        built: f.materialisedTransitions, selected: f.selectedTransitions,
      })),
    cond('noUnmaterialisedTransitions', f.unmaterialisedTransitions === 0,
      f.unmaterialisedTransitions,
      msg('detailing.constructible.unmaterialised', { n: f.unmaterialisedTransitions })),
    cond('allRequiredTransversePathsMaterialised',
      f.materialisedTransversePieces >= f.requiredTransversePieces,
      Math.max(0, f.requiredTransversePieces - f.materialisedTransversePieces),
      msg('detailing.constructible.transverseMaterialised', {
        built: f.materialisedTransversePieces, required: f.requiredTransversePieces,
      })),
    cond('noProhibitedConflicts', f.prohibitedConflicts === 0, f.prohibitedConflicts,
      msg('detailing.constructible.prohibited', { n: f.prohibitedConflicts })),
    cond('allMembersReverified', f.reverifiedMembers >= f.applicableMembers,
      Math.max(0, f.applicableMembers - f.reverifiedMembers),
      msg('detailing.constructible.reverified', {
        done: f.reverifiedMembers, total: f.applicableMembers,
      })),
    cond('certificatesMatchGeometry', f.certificateHashMatches >= f.applicableMembers,
      Math.max(0, f.applicableMembers - f.certificateHashMatches),
      msg('detailing.constructible.hashes', {
        matching: f.certificateHashMatches, total: f.applicableMembers,
      })),
    // ── The family certificates ───────────────────────────────────────
    //
    // Measured per family against what is APPLICABLE. A floor with slabs and footings and no
    // walls reports the wall requirement as `applicable: 0` — a measurement, not an
    // omission — and the shortfall is counted only over families that are actually there.
    //
    // These are separate conditions from the frame pair above rather than folded into them,
    // because a mixed floor must satisfy BOTH and an engineer reading a blocked gate has to
    // know which kind of evidence is missing. Merging the counts would report "3 of 8
    // certified" over two incomparable populations.
    //
    // This condition counts only the owners with NO certificate. The ones whose certificate
    // exists and does not apply are the NEXT condition's business, so the two partition the
    // shortfall and a single stale certificate blocks exactly one of them.
    cond('allApplicableFamiliesCertified',
      familyCertificateMissing(f.familyRequirements) === 0,
      familyCertificateMissing(f.familyRequirements),
      msg('detailing.constructible.familiesCertified', {
        certified: f.familyRequirements.reduce((n, r) => n + r.certified, 0),
        applicable: f.familyRequirements.reduce((n, r) => n + r.applicable, 0),
        // A NESTED message, not a bare key in a string slot. `params` resolves inside-out, so
        // this reads as a sentence in both locales; pasting the key would print it verbatim,
        // which is how `maturity.validated` once leaked into a badge.
        families: f.familyRequirements.some((r) => r.applicable > 0)
          ? f.familyRequirements.filter((r) => r.applicable > 0).map((r) => r.family).join(', ')
          : msg('detailing.constructible.familyNone'),
      })),
    // A certificate that EXISTS and does not apply is reported separately from one that is
    // absent. They have different remedies — reissue versus issue — and the stale case is
    // the more dangerous of the two, because it is a correct-looking claim about a member
    // that has since moved.
    cond('noStaleFamilyCertificate',
      familyCertificateStale(f.familyRequirements) === 0,
      familyCertificateStale(f.familyRequirements),
      msg('detailing.constructible.familiesStale', {
        stale: f.familyRequirements.reduce((n, r) => n + r.stale, 0),
        mismatched: f.familyRequirements.reduce((n, r) => n + r.mismatched, 0),
        failed: f.familyRequirements.reduce((n, r) => n + r.failed, 0),
        unsupported: f.familyRequirements.reduce((n, r) => n + r.unsupported, 0),
      })),
    cond('allSpacingCodeLegal', f.spacingNotCodeLegal === 0, f.spacingNotCodeLegal,
      msg('detailing.constructible.codeLegal', { n: f.spacingNotCodeLegal })),
    cond('allSpacingPlacementRobust', f.spacingNotPlacementRobust === 0,
      f.spacingNotPlacementRobust,
      msg('detailing.constructible.placementRobust', { n: f.spacingNotPlacementRobust })),
    cond('noUnsupportedRule', f.unsupportedRules === 0, f.unsupportedRules,
      msg('detailing.constructible.unsupported', { n: f.unsupportedRules })),
    cond('noStaleUpstreamRevision', f.staleAssemblies === 0, f.staleAssemblies,
      msg('detailing.constructible.stale', { n: f.staleAssemblies })),
    // The whole-structure condition. Everything above is about the drawing; this is about what
    // the drawing leaves out.
    cond('wholeModelDetailed', f.undetailedModelMembers === 0, f.undetailedModelMembers,
      msg('detailing.constructible.undetailed', { n: f.undetailedModelMembers })),
  ];

  const blocking = conditions.filter((c) => !c.passed).map((c) => c.condition);

  // A physical clash is a defect in the model. Everything else that blocks the gate is
  // work not yet done, and conflating the two sends the engineer looking for the wrong
  // thing entirely.
  //
  // A missing or stale family certificate is deliberately NOT a defect. The geometry may be
  // entirely correct; what is absent is the act of certifying it, and the remedy is to
  // reissue rather than to resize. A failing family DESIGN does block the gate, but it does
  // so through `noUnsupportedRule` and through the record's own status — not by having the
  // certificate condition impersonate a clash.
  const hasDefect = !conditions.find((c) => c.condition === 'noProhibitedConflicts')!.passed
    || !conditions.find((c) => c.condition === 'allSpacingCodeLegal')!.passed;

  const verdict: ConstructibilityVerdict = blocking.length === 0
    ? 'CONSTRUCTIBLE'
    : hasDefect ? 'CONFLICTED' : 'NOT_ESTABLISHED';

  return {
    verdict, conditions, blocking,
    summary: msg(
      verdict === 'CONSTRUCTIBLE'
        ? 'detailing.constructible.yes'
        : verdict === 'CONFLICTED'
          ? 'detailing.constructible.conflicted'
          : 'detailing.constructible.notEstablished',
      {
        passed: conditions.length - blocking.length,
        total: conditions.length,
        first: blocking.length > 0
          ? `detailing.constructible.cond.${blocking[0]}`
          : 'detailing.constructible.cond.none',
        conflicts: round(f.prohibitedConflicts, 0),
      },
    ),
  };
}

/**
 * The highest assembly state these facts can justify.
 *
 * The state ladder must never be climbed on an intermediate search result. A model with
 * thousands of interpenetrating bars is CONFLICTED whatever the search concluded, and this
 * is the single function that decides it.
 */
export function constructibilityState(
  a: ConstructibilityAssessment,
): 'COORDINATED' | 'CONSTRUCTIBLE' | 'CONFLICTED' {
  if (a.verdict === 'CONSTRUCTIBLE') return 'CONSTRUCTIBLE';
  if (a.verdict === 'CONFLICTED') return 'CONFLICTED';
  return 'COORDINATED';
}
