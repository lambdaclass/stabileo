/**
 * Design-side feedback from the geometry detailing actually built.
 *
 * ── The gap this closes ────────────────────────────────────────────
 *
 * Design sizes a member against its NOMINAL geometry. Coordination then moves the steel —
 * a joint-layer rank costs lever arm — and Table 26.6.2.1(a) charges an unfavourable
 * tolerance on `d` whether anything moved or not. Re-verification at that final geometry
 * is authoritative, and until now a failure there was terminal: the thirteen-condition gate
 * reported `allMembersReverified` short and there was nothing the run could do about it.
 *
 * On `rc-design-qa-8` that was beams 7 and 8 at ratio 1,031. The governing check is NOT
 * flexure — it is Table 9.7.6.2.2's maximum stirrup spacing:
 *
 *   nominal   d = 512 mm → s,max = d/2 = 256 mm, provided 250 mm  (legal, 2,4 % margin)
 *   final     d = 485 mm → s,max = d/2 = 242 mm, provided 250 mm  (3,1 % over)
 *
 * The 27 mm is the 12 mm layer raise plus the 15 mm prescribed tolerance. The design search
 * had placed the stirrups AT the nominal limit, because wider spacing is less steel and
 * nothing told it the limit was about to move. Deepening the section does not help and was
 * measured making it worse, which is the same mechanism seen from the other side: a deeper
 * member gets a larger s,max and the search spends it, arriving at the identical zero
 * margin one grid step wider.
 *
 * So the repair is to re-enumerate candidates with the final geometry KNOWN, which is what
 * this module does. It is reinforcement-only: no section changes, no re-analysis, and by
 * construction zero structural solves — the demands are inputs and are never recomputed.
 *
 * Pure: no store access, no side effects, no clock.
 */

import type { DesignCodeAdapter } from './code-adapter';
import type { MemberContext } from './member-context';
import type { Candidate, CandidateFeedback } from './candidate-generator';
import type { ProvidedReinforcement } from '../../store/model.svelte';
import type { ProvidedRebarCheck, ProvidedRebarResult } from '../station-design-forces';
import { compareCandidates } from './objective';
import { rebarHash } from './rebar-hash';
import { isPassingVerdict } from './candidate-search';
import {
  DESIGN_TARGET_UTILIZATION, UTIL_EPSILON, UTIL_FAIL_THRESHOLD,
  UTILIZATION_CONVENTION,
  type CandidateCost, type DesignCertificate, type DesignReason,
  type LimitingConstraint, type SectionRecommendation,
} from './outcome';

/** A force component the verifier actually evaluated. */
export type DesignAxis = string;

/**
 * One failing check, as data.
 *
 * The verifier's own `category` string is carried verbatim rather than re-classified,
 * because the candidate generator escalates on exactly that string. Re-deriving it here
 * would create a second vocabulary that could silently drift from the one that steers the
 * search — which is the failure mode that made `channelAware` produce zero candidates for
 * three sessions.
 */
export interface StructuredCheckFailure {
  category: string;
  limiting: LimitingConstraint | null;
  /** demand / capacity, the single project-wide convention. */
  ratio: number;
  status: 'warn' | 'fail';
  /** Capacity-method checks. */
  demand?: number;
  capacity?: number;
  /** Area/geometry-method checks. */
  required?: number;
  provided?: number;
  unit: string;
  method: 'capacity' | 'area';
  comboName?: string;
  stationX?: number;
  /** True when the check could not run because the steel is absent. Never a pass. */
  missingReinforcement: boolean;
}

/**
 * Everything the design side needs to size a member for the geometry that EXISTS.
 *
 * A pure record: no functions, no adapters, no store handles, so it can be persisted,
 * diffed, rendered in a report and asserted on in a test without a live run.
 */
export interface FinalGeometryDesignFeedback {
  elementId: number;
  /** Hash of the reinforcement that failed at this geometry. */
  previousCandidateHash: string;
  finalGeometry: {
    /** Lever arm lost at the bottom face, m. */
    bottomRaise: number;
    /** Lever arm lost at the top face, m. */
    topLower: number;
    /** Table 26.6.2.1(a) unfavourable tolerance on d, m. */
    depthTolerance: number;
    /**
     * Measured elevation of each bar layer, m, MODEL DATUM, descending.
     *
     * Evidence, not an input: the repair acts on the three scalars above, which are what
     * shift the layer centroids the verifier uses. These are read off the finished
     * BarPaths so a disagreement between intended and built geometry is visible.
     */
    layerCentroids: number[];
  };
  failedChecks: StructuredCheckFailure[];
  /** Worst demand/capacity at the final geometry. */
  finalUtilization: number;
  checkedAxes: DesignAxis[];
  /**
   * Largest area shortfall across the failing checks, cm² (or cm²/m).
   *
   * ABSENT when no failing check is an area comparison — and that is the common case, not
   * an omission. A maximum-spacing limit, a bar-fit failure and an anchorage shortfall are
   * all real governing failures with no "missing steel area" to report, and inventing a
   * number for them would misdirect an engineer to add bars that change nothing.
   */
  requiredReinforcementDeficit?: number;
  /** Reinforcement already known not to verify at this geometry, oldest first. */
  rejectedCandidateHashes: string[];
}

/** Stable identity for a geometry, so a memo entry can never cross geometries. */
export function finalGeometryHash(g: {
  bottomRaise: number; topLower: number; depthTolerance: number;
}): string {
  const mm = (v: number) => (Math.round(v * 10000) / 10).toFixed(1);
  return `b${mm(g.bottomRaise)}/t${mm(g.topLower)}/d${mm(g.depthTolerance)}`;
}

function isAreaUnit(unit: string): boolean {
  return unit === 'cm²' || unit === 'cm²/m';
}

/** Failing (and warning) checks of a verdict, as structured data. */
export function structuredFailures(verdict: ProvidedRebarResult): StructuredCheckFailure[] {
  return verdict.checks
    .filter((c): c is ProvidedRebarCheck & { status: 'warn' | 'fail' } => c.status !== 'ok')
    .map((c) => ({
      category: c.category,
      limiting: (c.limiting ?? null) as LimitingConstraint | null,
      ratio: c.ratio,
      status: c.status,
      ...(c.demand !== undefined ? { demand: c.demand } : {}),
      ...(c.capacity !== undefined ? { capacity: c.capacity } : {}),
      ...(c.required !== undefined ? { required: c.required } : {}),
      ...(c.provided !== undefined ? { provided: c.provided } : {}),
      unit: c.unit,
      method: c.method,
      ...(c.comboName !== undefined ? { comboName: c.comboName } : {}),
      ...(c.stationX !== undefined ? { stationX: c.stationX } : {}),
      missingReinforcement: c.missingReinforcement === true,
    }));
}

/**
 * Assemble the feedback record for one member that failed at its final geometry.
 *
 * `verdict` must be the verdict AT THE FINAL GEOMETRY. Passing a nominal verdict here would
 * describe a failure the built geometry does not have.
 */
export function buildFinalGeometryFeedback(input: {
  elementId: number;
  previousCandidate: ProvidedReinforcement;
  finalGeometry: FinalGeometryDesignFeedback['finalGeometry'];
  verdict: ProvidedRebarResult;
  rejectedCandidateHashes?: readonly string[];
}): FinalGeometryDesignFeedback {
  const failedChecks = structuredFailures(input.verdict);
  const deficits = failedChecks
    .filter((c) => c.status === 'fail' && isAreaUnit(c.unit)
      && c.required !== undefined && c.provided !== undefined)
    .map((c) => c.required! - c.provided!)
    .filter((d) => d > 0);
  const previousCandidateHash = rebarHash(input.previousCandidate);
  const rejected = [...(input.rejectedCandidateHashes ?? [])];
  if (!rejected.includes(previousCandidateHash)) rejected.push(previousCandidateHash);
  return {
    elementId: input.elementId,
    previousCandidateHash,
    finalGeometry: {
      ...input.finalGeometry,
      layerCentroids: [...input.finalGeometry.layerCentroids],
    },
    failedChecks,
    finalUtilization: input.verdict.worstUtilization,
    checkedAxes: [...input.verdict.checkedAxes],
    ...(deficits.length > 0 ? { requiredReinforcementDeficit: Math.max(...deficits) } : {}),
    rejectedCandidateHashes: rejected,
  };
}

// ─── Candidate selection under final-geometry constraints ─────────

/** Why a per-member repair ended. Never collapsed into a boolean. */
export type RepairKind =
  /** A candidate verifies at the FINAL geometry. */
  | 'FINAL_GEOMETRY_VERIFIED'
  /** The whole code-permitted envelope was enumerated and none verifies. Exhaustive. */
  | 'CANDIDATE_ENVELOPE_EXHAUSTED'
  /** A count bound stopped the enumeration first. Feasibility NOT established. */
  | 'FEEDBACK_LOOP_TRUNCATED'
  /** The engineer pinned this reinforcement; the repair may not touch it. */
  | 'LOCKED_REINFORCEMENT_PREVENTS_REPAIR'
  /** No reinforcement fits; the section is the limit. Applying advice needs a re-solve. */
  | 'SECTION_RECOMMENDATION_REQUIRES_RESOLVE'
  /** A check present at the final geometry is not implemented for this member. */
  | 'UNSUPPORTED_FINAL_GEOMETRY_CHECK';

export interface RepairStats {
  candidatesConsidered: number;
  /** Authoritative verifier calls actually made — memo hits are excluded. */
  verifierCalls: number;
  /** Calls avoided because this (reinforcement, geometry) pair was already judged. */
  memoHits: number;
  /** Candidates the generator re-emitted after they had already been seen. */
  repeatedStates: number;
  /** Candidates skipped for not being at least as costly as the one they replace. */
  nonMonotonicSkipped: number;
  /** Candidates skipped because they are already known not to verify here. */
  rejectedSkipped: number;
  truncated: boolean;
  envelopeExhausted: boolean;
}

export interface RepairResult {
  elementId: number;
  kind: RepairKind;
  /** Present ONLY for FINAL_GEOMETRY_VERIFIED. */
  accepted?: ProvidedReinforcement;
  /**
   * Certificate issued AT THE FINAL GEOMETRY.
   *
   * `finalGeometryHash` is part of it on purpose: a certificate that does not say which
   * geometry it describes is exactly the artefact this whole pass exists to eliminate.
   */
  certificate?: DesignCertificate & { finalGeometryHash: string };
  /** Cost of the accepted candidate, so the loop can enforce monotone progress. */
  cost?: CandidateCost;
  limiting: LimitingConstraint[];
  reasons: DesignReason[];
  sectionAdvice?: SectionRecommendation;
  /** Every candidate hash judged here, so the next iteration cannot retry them. */
  rejectedCandidateHashes: string[];
  stats: RepairStats;
}

export interface RepairBudget {
  /** Candidates the generator may produce for one member. Count-based, never wall-clock. */
  maxCandidates: number;
  /** Authoritative verifier calls for one member. */
  maxVerifierCalls: number;
}

export const DEFAULT_REPAIR_BUDGET: RepairBudget = { maxCandidates: 240, maxVerifierCalls: 300 };

export interface RepairOptions {
  budget?: RepairBudget;
  /** True when the engineer pinned this member's reinforcement. */
  locked?: boolean;
  /**
   * Cost the replacement must be at least as expensive as.
   *
   * Monotone progress is what makes the loop terminate: without it a member could be handed
   * back a cheaper arrangement that the previous iteration had already rejected, and the
   * two would alternate forever while every individual step looked reasonable.
   */
  minimumCost?: CandidateCost;
  /**
   * Verdicts already known for this member, keyed `rebarHash@finalGeometryHash`.
   *
   * Shared across iterations by the loop. The geometry is part of the key because a verdict
   * at nominal geometry says nothing about the same steel at the final one — reusing one
   * for the other is the specific dishonesty the thirteen-condition gate exists to catch.
   */
  memo?: Map<string, ProvidedRebarResult>;
}

/**
 * Choose the next code-legal reinforcement that verifies AT THE FINAL GEOMETRY.
 *
 * The context passed in must already carry `finalGeometry`; this function does not invent
 * it, so a caller cannot accidentally run a nominal search through here.
 *
 * Search shape mirrors `designMember` — the same adapter, the same feedback-driven
 * generator, the same objective — so a repaired member is designed by the identical rules
 * as an originally designed one. What differs is only what is excluded: the arrangements
 * already known to fail at this geometry, and anything cheaper than what it replaces.
 */
export function selectCandidateUnderFinalGeometry(
  adapter: DesignCodeAdapter,
  ctxAtFinalGeometry: MemberContext,
  feedback: FinalGeometryDesignFeedback,
  opts: RepairOptions = {},
): RepairResult {
  const elementId = feedback.elementId;
  const budget = opts.budget ?? DEFAULT_REPAIR_BUDGET;
  const memo = opts.memo ?? new Map<string, ProvidedRebarResult>();
  const geomHash = finalGeometryHash(feedback.finalGeometry);
  const rejected = new Set(feedback.rejectedCandidateHashes);
  const stats: RepairStats = {
    candidatesConsidered: 0, verifierCalls: 0, memoHits: 0, repeatedStates: 0,
    nonMonotonicSkipped: 0, rejectedSkipped: 0, truncated: false, envelopeExhausted: false,
  };
  const base = { elementId, limiting: [] as LimitingConstraint[], reasons: [] as DesignReason[] };

  if (!ctxAtFinalGeometry.finalGeometry) {
    throw new Error(`element ${elementId}: repair requires a context carrying finalGeometry`);
  }

  // ── Locked reinforcement is a hard constraint, not a preference ──
  //
  // The engineer pinned this steel. Silently replacing it would be the single most
  // damaging thing this loop could do, so it is refused before any enumeration.
  if (opts.locked) {
    return {
      ...base, kind: 'LOCKED_REINFORCEMENT_PREVENTS_REPAIR',
      limiting: uniqueLimiting(feedback, ['congestion']),
      reasons: [{
        key: 'design.feedback.reason.lockedReinforcement',
        params: { elementId, utilization: round2(feedback.finalUtilization) },
      }],
      rejectedCandidateHashes: [...rejected],
      stats,
    };
  }

  // ── A check the code adapter does not implement cannot be repaired by guessing ──
  const unsupported = adapter.unsupported(ctxAtFinalGeometry);
  if (unsupported.length > 0) {
    return {
      ...base, kind: 'UNSUPPORTED_FINAL_GEOMETRY_CHECK',
      limiting: unsupported,
      reasons: [{
        key: 'design.feedback.reason.unsupportedCheck',
        params: { elementId, code: adapter.name },
      }],
      rejectedCandidateHashes: [...rejected],
      stats,
    };
  }

  const gen = adapter.createGenerator(ctxAtFinalGeometry);
  if (!gen) {
    return {
      ...base, kind: 'UNSUPPORTED_FINAL_GEOMETRY_CHECK',
      limiting: ['unsupportedCheck'],
      reasons: [{
        key: 'design.feedback.reason.noGenerator',
        params: { elementId, code: adapter.name },
      }],
      rejectedCandidateHashes: [...rejected],
      stats,
    };
  }

  /** Verdict for one candidate at THIS geometry, memoised. */
  const judge = (reinf: ProvidedReinforcement, hash: string): ProvidedRebarResult => {
    const key = `${hash}@${geomHash}`;
    const hit = memo.get(key);
    if (hit) { stats.memoHits++; return hit; }
    const verdict = adapter.verify(ctxAtFinalGeometry, reinf);
    stats.verifierCalls++;
    memo.set(key, verdict);
    return verdict;
  };

  // Seed the memo with what is already known, so the candidate that failed is not paid for
  // twice. It still has to be OFFERED to the generator, because its verdict is the feedback
  // that makes the generator escalate the knob that actually failed.
  const seen = new Set<string>();
  const passing: Array<{ reinf: ProvidedReinforcement; verdict: ProvidedRebarResult; cost: CandidateCost; index: number }> = [];
  let lastFailure: ProvidedRebarResult | null = null;
  let nextFeedback: CandidateFeedback | null = null;
  let emitted: Candidate | null = null;

  for (;;) {
    if (stats.candidatesConsidered >= budget.maxCandidates
      || stats.verifierCalls >= budget.maxVerifierCalls) {
      stats.truncated = true;
      break;
    }
    const cand: Candidate | null = gen.next(emitted ? nextFeedback : null);
    if (!cand) break;
    emitted = cand;
    stats.candidatesConsidered++;
    const hash = rebarHash(cand.reinforcement);

    // Repeated state. The generator clamps a maxed-out knob, so it can re-emit the same
    // arrangement indefinitely; without this the loop would spin on a fixed point.
    if (seen.has(hash)) stats.repeatedStates++;
    seen.add(hash);

    const verdict = judge(cand.reinforcement, hash);
    // Feedback is driven by the real verdict even for a candidate that will not be
    // accepted, because that is what tells the generator WHICH knob to escalate.
    nextFeedback = {
      verdict,
      worstUtilization: verdict.worstUtilization,
      limiting: adapter.classifyFailure(verdict, ctxAtFinalGeometry),
    };

    const attempt = {
      candidate: cand.reinforcement, verdict,
      worstUtilization: verdict.worstUtilization,
      failingCheckCount: verdict.checks.filter((c) => c.status === 'fail').length,
      governing: null, cost: cand.meta.cost,
    };
    if (!isPassingVerdict(attempt)) { lastFailure = verdict; continue; }

    // ── Passing. Two exclusions before it may be accepted. ──
    if (rejected.has(hash)) {
      // Known not to verify here, yet passing now: the memo and the record disagree, which
      // means one of them describes a different geometry. Refusing it is the safe reading.
      stats.rejectedSkipped++;
      continue;
    }
    if (opts.minimumCost
      && compareCandidates({ cost: cand.meta.cost, index: cand.meta.index },
        { cost: opts.minimumCost, index: -1 }) < 0) {
      stats.nonMonotonicSkipped++;
      continue;
    }
    passing.push({
      reinf: cand.reinforcement, verdict, cost: cand.meta.cost, index: cand.meta.index,
    });
    // The approved design margin (O5): prefer <= 0,95 when it is available without another
    // reinforcement step. Code compliance stays the hard boundary — this only stops the
    // escalation early, it never accepts something over 1,00.
    if (verdict.worstUtilization <= DESIGN_TARGET_UTILIZATION + UTIL_EPSILON) break;
  }

  stats.envelopeExhausted = gen.envelopeExhausted && !stats.truncated;
  for (const h of seen) rejected.add(h);

  // ── A candidate verifies at the final geometry ──
  if (passing.length > 0) {
    passing.sort((a, b) => compareCandidates(a, b));
    const win = passing[0];
    const prov = adapter.provenance();
    // The winner is not "rejected"; every other arrangement judged here is.
    const winHash = rebarHash(win.reinf);
    rejected.delete(winHash);
    return {
      ...base, kind: 'FINAL_GEOMETRY_VERIFIED',
      accepted: win.reinf,
      certificate: {
        verifierId: prov.verifierId,
        codeId: prov.codeId,
        codeVersion: prov.codeVersion,
        analysisRevision: ctxAtFinalGeometry.analysisRevision,
        demandRevision: ctxAtFinalGeometry.demandRevision,
        rebarHash: winHash,
        worstUtilization: +win.verdict.worstUtilization.toFixed(4),
        designTarget: DESIGN_TARGET_UTILIZATION,
        checkCount: win.verdict.strengthCheckCount,
        checkedAxes: [...win.verdict.checkedAxes],
        axisBasis: ctxAtFinalGeometry.axes.basis,
        utilizationConvention: UTILIZATION_CONVENTION,
        finalGeometryHash: geomHash,
      },
      cost: win.cost,
      rejectedCandidateHashes: [...rejected],
      stats,
    };
  }

  // ── Nothing verifies. Classify honestly — truncation is not infeasibility. ──
  const limiting = lastFailure
    ? adapter.classifyFailure(lastFailure, ctxAtFinalGeometry)
    : uniqueLimiting(feedback, ['searchBudget']);
  if (stats.truncated && !limiting.includes('searchBudget')) limiting.push('searchBudget');
  if (limiting.length === 0) limiting.push('searchBudget');

  if (stats.truncated) {
    return {
      ...base, kind: 'FEEDBACK_LOOP_TRUNCATED',
      limiting,
      reasons: [{
        key: 'design.feedback.reason.truncated',
        params: { elementId, tried: stats.candidatesConsidered },
      }],
      rejectedCandidateHashes: [...rejected],
      stats,
    };
  }

  const advice = stats.envelopeExhausted
    ? adapter.recommendSection(ctxAtFinalGeometry, limiting) : null;
  if (stats.envelopeExhausted && advice) {
    // The envelope was fully enumerated and nothing fits at the geometry that exists, so
    // the section is the limit. Applying the advice is a SEPARATE, explicit mutation: it
    // changes stiffness, which invalidates the analysis these demands came from.
    return {
      ...base, kind: 'SECTION_RECOMMENDATION_REQUIRES_RESOLVE',
      limiting,
      reasons: [{
        key: 'design.feedback.reason.sectionAdvice',
        params: {
          elementId,
          utilization: round2(feedback.finalUtilization),
          proposedB: advice.proposedB, proposedH: advice.proposedH,
        },
      }],
      sectionAdvice: advice,
      rejectedCandidateHashes: [...rejected],
      stats,
    };
  }

  return {
    ...base, kind: 'CANDIDATE_ENVELOPE_EXHAUSTED',
    limiting,
    reasons: [{
      key: 'design.feedback.reason.envelopeExhausted',
      params: {
        elementId,
        tried: stats.candidatesConsidered,
        utilization: round2(feedback.finalUtilization),
      },
    }],
    ...(advice ? { sectionAdvice: advice } : {}),
    rejectedCandidateHashes: [...rejected],
    stats,
  };
}

function uniqueLimiting(
  feedback: FinalGeometryDesignFeedback, fallback: LimitingConstraint[],
): LimitingConstraint[] {
  const out = new Set<LimitingConstraint>();
  for (const c of feedback.failedChecks) if (c.limiting) out.add(c.limiting);
  return out.size > 0 ? [...out] : [...fallback];
}

function round2(v: number): number | string {
  return Number.isFinite(v) ? +v.toFixed(2) : '∞';
}

/** True when a status may be treated as a passing re-verification. */
export function reverificationPassed(status: string): boolean {
  return status === 'ok' || status === 'warn';
}

/** Guard: a repair result must never claim a pass it does not have. */
export function assertRepairInvariants(r: RepairResult): void {
  const where = `element ${r.elementId}`;
  if (r.kind === 'FINAL_GEOMETRY_VERIFIED') {
    if (!r.accepted) throw new Error(`${where}: verified repair without reinforcement`);
    if (!r.certificate) throw new Error(`${where}: verified repair without a certificate`);
    if (!r.certificate.finalGeometryHash) {
      throw new Error(`${where}: certificate does not say which geometry it describes`);
    }
    if (r.certificate.worstUtilization > UTIL_FAIL_THRESHOLD + UTIL_EPSILON) {
      throw new Error(`${where}: verified repair at utilization ${r.certificate.worstUtilization}`);
    }
    if (r.certificate.checkCount <= 0) throw new Error(`${where}: verified repair with zero checks`);
    if (r.limiting.length > 0) throw new Error(`${where}: verified repair reports limiting constraints`);
  } else {
    if (r.accepted) throw new Error(`${where}: ${r.kind} must not assign reinforcement`);
    if (r.certificate) throw new Error(`${where}: ${r.kind} must not carry a certificate`);
    if (r.limiting.length === 0) throw new Error(`${where}: ${r.kind} without a limiting constraint`);
    if (r.reasons.length === 0) throw new Error(`${where}: ${r.kind} without a reason`);
  }
  if (r.kind === 'SECTION_RECOMMENDATION_REQUIRES_RESOLVE') {
    if (!r.sectionAdvice) throw new Error(`${where}: section recommendation without a recommendation`);
    if (!r.stats.envelopeExhausted) {
      throw new Error(`${where}: section advice claimed without exhausting the envelope`);
    }
  }
  if (r.kind === 'CANDIDATE_ENVELOPE_EXHAUSTED' && r.stats.truncated) {
    throw new Error(`${where}: a truncated search may not be reported as exhaustive`);
  }
}
