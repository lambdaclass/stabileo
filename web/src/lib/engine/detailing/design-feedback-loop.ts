/**
 * The design–detailing feedback loop.
 *
 * ── What it is for ─────────────────────────────────────────────────
 *
 * Design sizes steel against nominal geometry; coordination then moves it. Re-verification
 * at the geometry that actually exists is authoritative, and a failure there used to be the
 * end of the run: `allMembersReverified` came back short and the only remedies on offer
 * were a section change (which invalidates the analysis) or accepting a certificate that
 * describes a cage nobody built.
 *
 * This closes the loop instead. Nine steps, deterministically:
 *
 *   1. an authoritatively verified candidate                (the caller's design run)
 *   2. coordinate its physical geometry                     `detail()`
 *   3. materialise layers, laps, fusions, transitions       `detail()`
 *   4. re-verify at the exact final coordinates + tolerances`detail()` → `reverification`
 *   5. feed the exact geometry and check failures back      `buildFinalGeometryFeedback`
 *   6. select the next code-legal candidate that verifies   `selectCandidateUnderFinalGeometry`
 *   7. re-coordinate the affected assemblies and joints     `detail()` again
 *   8. re-verify again                                      `detail()` again
 *   9. continue until every member passes or the envelope is exhausted
 *
 * ── Why it terminates ──────────────────────────────────────────────
 *
 * Three independent bounds, none of them a clock:
 *
 *   - an iteration COUNT bound, so the outcome class cannot depend on machine load;
 *   - monotone cost per member, so a replacement is never cheaper than what it replaces and
 *     the loop cannot alternate between two arrangements that each look reasonable;
 *   - whole-assignment state hashing, so a repeat is detected even if the two bounds above
 *     would both have allowed it.
 *
 * ── What it is not ─────────────────────────────────────────────────
 *
 * Reinforcement-only. It never changes a section, never touches the demands, and by
 * construction runs ZERO structural solves: `contexts` is passed through by reference and
 * this module imports nothing from the solver. Where no reinforcement can work, it says so
 * and offers section advice — applying that advice is a separate, explicit mutation that
 * invalidates the analysis and requires re-solving.
 *
 * Pure: no store access, no side effects, no clock.
 */

import type { DesignCodeAdapter } from '../design/code-adapter';
import type { MemberContext } from '../design/member-context';
import type {
  CandidateCost, LimitingConstraint, MemberDesignOutcome, SectionRecommendation,
} from '../design/outcome';
import {
  assertRepairInvariants, buildFinalGeometryFeedback, finalGeometryHash,
  selectCandidateUnderFinalGeometry,
  type FinalGeometryDesignFeedback,
  type RepairBudget, type RepairKind, type RepairResult,
} from '../design/final-geometry-feedback';
import { rebarHash } from '../design/rebar-hash';
import type { ProvidedRebarResult } from '../station-design-forces';
import type { FinalGeometryRecord, RunDetailingResult } from './run-detailing';

/** How the whole loop ended. Same vocabulary as a single member's repair. */
export type LoopOutcome = RepairKind | 'FEEDBACK_LOOP_CYCLE_DETECTED';

/**
 * Precedence when several members end differently.
 *
 * Ordered by what the engineer must DO about it, most actionable last-resort first: a
 * pinned bar and a section change are decisions only a person can take, so they must not be
 * hidden behind a mere budget message.
 */
const OUTCOME_PRECEDENCE: LoopOutcome[] = [
  'SECTION_RECOMMENDATION_REQUIRES_RESOLVE',
  'LOCKED_REINFORCEMENT_PREVENTS_REPAIR',
  'UNSUPPORTED_FINAL_GEOMETRY_CHECK',
  'CANDIDATE_ENVELOPE_EXHAUSTED',
  'FEEDBACK_LOOP_CYCLE_DETECTED',
  'FEEDBACK_LOOP_TRUNCATED',
];

export interface DesignFeedbackLoopInput {
  adapter: DesignCodeAdapter;
  /**
   * Member contexts, passed through UNCHANGED.
   *
   * The loop only ever derives `{...ctx, finalGeometry}` copies from these; it never
   * rebuilds a context, which is what guarantees the demands are the ones the solver
   * produced and that no solve is implied.
   */
  contexts: ReadonlyMap<number, MemberContext>;
  /** Outcomes of the initial design run, at nominal geometry. */
  outcomes: ReadonlyMap<number, MemberDesignOutcome>;
  /**
   * Run the whole detailing pipeline for a given reinforcement assignment.
   *
   * Supplied by the caller so this module stays free of the store and of `runDetailing`'s
   * long input list. The callback MUST supply the authoritative verifier for the same
   * assignment it is handed, otherwise step 4 has nothing to report.
   */
  detail: (outcomes: ReadonlyMap<number, MemberDesignOutcome>) => RunDetailingResult;
  /** Members whose reinforcement the engineer pinned. Never replaced. */
  lockedMembers?: ReadonlySet<number>;
  /**
   * Maximum repair iterations. COUNT-based, never wall-clock: a time bound would let the
   * same model come back repaired on an idle machine and truncated on a busy one.
   */
  maxIterations?: number;
  budget?: RepairBudget;
}

export const DEFAULT_MAX_ITERATIONS = 8;

/** One pass of the loop, recorded in full so the trace is evidence rather than narration. */
export interface LoopIteration {
  index: number;
  /** Members that failed re-verification at this iteration's final geometry. */
  failed: number[];
  /** The feedback records built from them. */
  feedback: FinalGeometryDesignFeedback[];
  /** What the repair did for each of them. */
  repairs: RepairResult[];
  /** Members whose reinforcement actually changed as a result. */
  changed: number[];
  /** Assemblies that own a changed member, and therefore must be re-coordinated. */
  affectedAssemblies: string[];
  /** Members sharing a joint with a changed member — the adjacency that must move with it. */
  adjacentMembers: number[];
  /** Identity of the whole assignment after this iteration, for cycle detection. */
  assignmentHash: string;
}

export interface DesignFeedbackLoopResult {
  outcome: LoopOutcome;
  /** The detailing result to persist: the last one produced, always fully re-verified. */
  result: RunDetailingResult;
  /** The reinforcement assignment that produced `result`. */
  outcomes: ReadonlyMap<number, MemberDesignOutcome>;
  iterations: LoopIteration[];
  /** Members still failing re-verification, with the reason the repair could not fix them. */
  unrepaired: Array<{
    elementId: number;
    kind: RepairKind;
    limiting: LimitingConstraint[];
    finalUtilization: number;
  }>;
  /** Section advice, where reinforcement alone cannot work. Applying it needs a re-solve. */
  sectionAdvice: Array<{ elementId: number; advice: SectionRecommendation }>;
  stats: {
    iterations: number;
    /** Full detailing passes run, including the first. */
    detailingRuns: number;
    candidatesConsidered: number;
    /** Authoritative verifier calls made by the repair search. */
    verifierCalls: number;
    memoHits: number;
    repeatedStates: number;
    nonMonotonicSkipped: number;
    /** True when a count bound stopped the loop before the envelope was covered. */
    truncated: boolean;
    /**
     * Always zero, and reported rather than assumed.
     *
     * Reinforcement is downstream of analysis: changing it cannot change the demands, so
     * repairing a member must never trigger a solve. Stated as a number so a regression
     * that introduced one would have somewhere to show up.
     */
    structuralSolves: 0;
  };
}

/** Stable identity of a whole reinforcement assignment. */
function assignmentHashOf(outcomes: ReadonlyMap<number, MemberDesignOutcome>): string {
  return [...outcomes.entries()]
    .filter(([, o]) => o.accepted)
    .sort((a, b) => a[0] - b[0])
    .map(([id, o]) => `${id}:${rebarHash(o.accepted!)}`)
    .join('|');
}

/** Members that share a joint with any of `changed`, per the layering relations. */
function adjacentTo(
  changed: ReadonlySet<number>, result: RunDetailingResult,
): number[] {
  const out = new Set<number>();
  for (const rel of result.layering?.relations ?? []) {
    if (changed.has(rel.a)) out.add(rel.b);
    if (changed.has(rel.b)) out.add(rel.a);
  }
  for (const id of changed) out.delete(id);
  return [...out].sort((a, b) => a - b);
}

/**
 * Run the loop.
 *
 * Returns the LAST detailing result, which is always one that has been re-verified at its
 * own final geometry — never an earlier pass's geometry with a later pass's certificates.
 */
export function runDesignFeedbackLoop(
  input: DesignFeedbackLoopInput,
): DesignFeedbackLoopResult {
  const maxIterations = input.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const locked = input.lockedMembers ?? new Set<number>();
  const iterations: LoopIteration[] = [];
  /** Verdicts already computed, keyed `rebarHash@finalGeometryHash`. Shared across passes. */
  const memo = new Map<string, ProvidedRebarResult>();
  /** Arrangements known not to verify at some geometry, per member. */
  const rejectedByMember = new Map<number, Set<string>>();
  /** Cost of the last accepted arrangement, per member, for monotone progress. */
  const acceptedCost = new Map<number, CandidateCost>();
  /** Assignment states already visited, so a cycle is detected rather than ridden. */
  const visitedStates = new Set<string>();

  const stats: DesignFeedbackLoopResult['stats'] = {
    iterations: 0, detailingRuns: 0, candidatesConsidered: 0, verifierCalls: 0,
    memoHits: 0, repeatedStates: 0, nonMonotonicSkipped: 0, truncated: false,
    structuralSolves: 0,
  };

  let outcomes: ReadonlyMap<number, MemberDesignOutcome> = input.outcomes;
  visitedStates.add(assignmentHashOf(outcomes));
  let result = input.detail(outcomes);
  stats.detailingRuns++;

  const lastRepairs = new Map<number, RepairResult>();
  const lastFeedback = new Map<number, FinalGeometryDesignFeedback>();
  let cycleDetected = false;

  for (let iter = 1; ; iter++) {
    const failing = failingRecords(result, input.contexts);
    if (failing.length === 0) break;

    if (iter > maxIterations) { stats.truncated = true; break; }

    // ── Step 5: turn the measured geometry and the real verdicts into feedback ──
    const feedback: FinalGeometryDesignFeedback[] = [];
    const repairs: RepairResult[] = [];
    const changed = new Set<number>();
    const nextOutcomes = new Map(outcomes);

    for (const rec of failing) {
      const ctx = input.contexts.get(rec.elementId);
      const current = outcomes.get(rec.elementId);
      if (!ctx || !current?.accepted) continue;

      const ctxAtFinal: MemberContext = {
        ...ctx,
        finalGeometry: {
          bottomRaise: Math.max(0, rec.finalGeometry.bottomRaise),
          topLower: Math.max(0, rec.finalGeometry.topLower),
          depthTolerance: Math.max(0, rec.finalGeometry.depthTolerance),
        },
      };
      const geomHash = finalGeometryHash(rec.finalGeometry);
      const currentHash = rebarHash(current.accepted);

      // The authoritative verdict AT THE FINAL GEOMETRY. Memoised, and never substituted by
      // the nominal one — a certificate from nominal geometry is exactly what this pass
      // exists to refuse.
      const key = `${currentHash}@${geomHash}`;
      let verdict = memo.get(key);
      if (verdict) { stats.memoHits++; } else {
        verdict = input.adapter.verify(ctxAtFinal, current.accepted);
        stats.verifierCalls++;
        memo.set(key, verdict);
      }

      const fb = buildFinalGeometryFeedback({
        elementId: rec.elementId,
        previousCandidate: current.accepted,
        // The measured centroids travel WITH the three scalars, because the record is the
        // evidence that the geometry acted on is the geometry that was built.
        finalGeometry: { ...rec.finalGeometry, layerCentroids: rec.layerCentroids },
        verdict,
        rejectedCandidateHashes: [...(rejectedByMember.get(rec.elementId) ?? [])],
      });
      feedback.push(fb);
      lastFeedback.set(rec.elementId, fb);

      // ── Step 6: the next code-legal candidate that verifies at THIS geometry ──
      const repair = selectCandidateUnderFinalGeometry(input.adapter, ctxAtFinal, fb, {
        budget: input.budget,
        locked: locked.has(rec.elementId),
        minimumCost: acceptedCost.get(rec.elementId),
        memo,
      });
      assertRepairInvariants(repair);
      repairs.push(repair);
      lastRepairs.set(rec.elementId, repair);
      rejectedByMember.set(rec.elementId, new Set(repair.rejectedCandidateHashes));
      stats.candidatesConsidered += repair.stats.candidatesConsidered;
      stats.verifierCalls += repair.stats.verifierCalls;
      stats.memoHits += repair.stats.memoHits;
      stats.repeatedStates += repair.stats.repeatedStates;
      stats.nonMonotonicSkipped += repair.stats.nonMonotonicSkipped;

      if (repair.kind !== 'FINAL_GEOMETRY_VERIFIED' || !repair.accepted) continue;
      if (rebarHash(repair.accepted) === currentHash) continue;   // nothing to re-coordinate

      changed.add(rec.elementId);
      acceptedCost.set(rec.elementId, repair.cost!);
      // The outcome carries the FINAL-GEOMETRY certificate. `MemberDesignOutcome.certificate`
      // has no place for the geometry hash, so it travels in `finalGeometryCertificate`
      // alongside it rather than being dropped — a certificate that cannot say which
      // geometry it describes is not evidence of anything.
      nextOutcomes.set(rec.elementId, {
        ...current,
        accepted: repair.accepted,
        certificate: {
          ...current.certificate!,
          rebarHash: repair.certificate!.rebarHash,
          worstUtilization: repair.certificate!.worstUtilization,
          checkCount: repair.certificate!.checkCount,
          checkedAxes: [...repair.certificate!.checkedAxes],
        },
        finalGeometryCertificate: repair.certificate,
      } as MemberDesignOutcome);
    }

    const affectedAssemblies = result.assemblies
      .filter((a) => a.elementIds.some((e) => changed.has(e)))
      .map((a) => a.id)
      .sort();
    const adjacentMembers = adjacentTo(changed, result);

    const nextHash = assignmentHashOf(nextOutcomes);
    iterations.push({
      index: iter,
      failed: failing.map((r) => r.elementId),
      feedback,
      repairs,
      changed: [...changed].sort((a, b) => a - b),
      affectedAssemblies,
      adjacentMembers,
      assignmentHash: nextHash,
    });
    stats.iterations = iter;

    // Nothing moved: every failing member is unrepairable for a reason already recorded.
    // Iterating again would repeat the identical work and reach the identical conclusion.
    if (changed.size === 0) break;

    // A state we have already coordinated. The monotone-cost rule makes this very hard to
    // reach, which is exactly why it is checked: if it ever happens, riding the cycle would
    // burn the whole iteration budget and report truncation for a loop that was actually
    // stuck.
    if (visitedStates.has(nextHash)) { cycleDetected = true; break; }
    visitedStates.add(nextHash);

    // ── Steps 7 + 8: re-coordinate and re-verify ──
    //
    // The whole floor is re-coordinated, not just `affectedAssemblies`. That is not laziness:
    // the layout search propagates arc consistency ACROSS joints, so a changed member's
    // domain can legally alter a neighbour's, and a scoped re-run would judge the neighbour
    // against a cage that no longer exists. The affected set is reported so the scope is
    // visible, and `feedback-loop.test.ts` asserts the corresponding invariant — assemblies
    // owning no changed member come back byte-identical.
    outcomes = nextOutcomes;
    result = input.detail(outcomes);
    stats.detailingRuns++;
  }

  // ── Classify the ending ──
  const stillFailing = failingRecords(result, input.contexts);
  const unrepaired = stillFailing.map((rec) => {
    const repair = lastRepairs.get(rec.elementId);
    const fb = lastFeedback.get(rec.elementId);
    return {
      elementId: rec.elementId,
      kind: repair?.kind ?? ('FEEDBACK_LOOP_TRUNCATED' as RepairKind),
      limiting: repair?.limiting ?? [],
      finalUtilization: fb?.finalUtilization ?? Number.NaN,
    };
  });
  const sectionAdvice = [...lastRepairs.values()]
    .filter((r) => r.sectionAdvice && stillFailing.some((f) => f.elementId === r.elementId))
    .map((r) => ({ elementId: r.elementId, advice: r.sectionAdvice! }))
    .sort((a, b) => a.elementId - b.elementId);

  let outcome: LoopOutcome = 'FINAL_GEOMETRY_VERIFIED';
  if (stillFailing.length > 0) {
    const kinds = new Set<LoopOutcome>(unrepaired.map((u) => u.kind));
    if (cycleDetected) kinds.add('FEEDBACK_LOOP_CYCLE_DETECTED');
    if (stats.truncated) kinds.add('FEEDBACK_LOOP_TRUNCATED');
    outcome = OUTCOME_PRECEDENCE.find((k) => kinds.has(k)) ?? 'FEEDBACK_LOOP_TRUNCATED';
  }

  return { outcome, result, outcomes, iterations, unrepaired, sectionAdvice, stats };
}

/**
 * Members whose re-verification did not pass.
 *
 * `noVerifier` is deliberately NOT treated as a failure to repair: no check ran, so there
 * is no failure to act on, and re-designing against a verdict that does not exist would be
 * worse than leaving the gate honestly unmet. `noBars` likewise — a member with no physical
 * steel has nothing whose geometry could be wrong, and it is already reported as skipped.
 */
function failingRecords(
  result: RunDetailingResult, contexts: ReadonlyMap<number, MemberContext>,
): FinalGeometryRecord[] {
  return result.reverification
    .filter((r) => r.status === 'fail' && contexts.has(r.elementId))
    .sort((a, b) => a.elementId - b.elementId);
}
