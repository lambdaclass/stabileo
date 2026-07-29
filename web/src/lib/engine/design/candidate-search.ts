/**
 * The bounded, deterministic candidate search.
 *
 * Every candidate is verified by the ADAPTER'S OWN authoritative verifier — the
 * same function the UI renders — so a "designed" member cannot have been certified
 * by a different standard than the one the engineer sees.
 *
 * Feasibility vs. exhaustion is decided honestly:
 *   - the whole code-permitted envelope was enumerated  → SECTION_INADEQUATE
 *   - a budget stopped the search first                  → SEARCH_EXHAUSTED (truncated)
 * We never claim infeasibility we did not establish (approved decision O1).
 *
 * Pure: no store access, no side effects, no timers beyond reading a clock.
 */

import type { DesignCodeAdapter } from './code-adapter';
import type { MemberContext } from './member-context';
import type { Candidate, CandidateFeedback } from './candidate-generator';
import { compareCandidates, compareFailures } from './objective';
import { rebarHash } from './rebar-hash';
import {
  assertOutcomeInvariants, tallyRunSummary,
  DESIGN_TARGET_UTILIZATION, UTILIZATION_CONVENTION,
  UTIL_FAIL_THRESHOLD, UTIL_EPSILON,
  type DesignAttempt, type DesignReason, type DesignRunSummary,
  type LimitingConstraint, type MemberDesignOutcome, type SearchStats,
} from './outcome';

export interface SearchBudget {
  /** Maximum candidates generated for one member. */
  maxCandidates: number;
  /** Maximum authoritative verifier calls for one member. */
  maxVerifierCalls: number;
}

/**
 * Per-member bounds are COUNT-BASED ONLY, never wall-clock.
 *
 * A time-based per-member cutoff makes the OUTCOME CLASS depend on machine load: the
 * same member could come back VERIFIED on an idle run and SEARCH_EXHAUSTED under a
 * busy test worker. That breaks the determinism contract, so wall-clock survives only
 * as a whole-run safety valve (`RunOptions.maxRunMs`), where its effect is confined to
 * `aborted` + `notReached` — both explicitly reported, never a silent verdict change.
 */
export const BEAM_BUDGET: SearchBudget = { maxCandidates: 240, maxVerifierCalls: 300 };
export const COLUMN_BUDGET: SearchBudget = { maxCandidates: 120, maxVerifierCalls: 150 };

export function budgetFor(ctx: MemberContext): SearchBudget {
  return ctx.elementType === 'column' ? COLUMN_BUDGET : BEAM_BUDGET;
}

/** Injected clock so tests are deterministic and the module stays pure-ish. */
export type Clock = () => number;
const defaultClock: Clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function attemptFrom(adapter: DesignCodeAdapter, ctx: MemberContext, c: Candidate): DesignAttempt {
  const verdict = adapter.verify(ctx, c.reinforcement);
  const failing = verdict.checks.filter(k => k.status === 'fail').length;
  const limiting = adapter.classifyFailure(verdict, ctx);
  return {
    candidate: c.reinforcement,
    verdict,
    worstUtilization: verdict.worstUtilization,
    failingCheckCount: failing,
    governing: limiting[0] ?? null,
    cost: c.meta.cost,
  };
}

/** True when a verdict is a genuine pass under the approved convention. */
export function isPassingVerdict(a: DesignAttempt): boolean {
  if (a.verdict.strengthCheckCount === 0) return false;   // nothing checked ≠ pass
  if (a.verdict.checks.some(c => c.status === 'fail')) return false;
  return a.worstUtilization <= UTIL_FAIL_THRESHOLD + UTIL_EPSILON;
}

/**
 * Design one member.
 *
 * Search shape: keep taking candidates while the generator escalates on feedback.
 * Collect ALL passing candidates (they are cheap once found — the generator stops
 * escalating a satisfied knob) and return the best by the staged objective. The
 * first pass is not automatically accepted, because the design target is 0.95 and a
 * slightly heavier candidate may reach it at no extra reinforcement step (O5).
 */
export function designMember(
  adapter: DesignCodeAdapter,
  ctx: MemberContext,
  opts: { budget?: SearchBudget; clock?: Clock } = {},
): MemberDesignOutcome {
  const clock = opts.clock ?? defaultClock;
  const t0 = clock();
  const budget = opts.budget ?? budgetFor(ctx);
  const prov = adapter.provenance();
  const base = {
    elementId: ctx.elementId,
    elementType: ctx.elementType,
    codeId: prov.codeId,
    codeVersion: prov.codeVersion,
    axes: ctx.axes,
  };
  const stats = (candidatesTried: number, verifierCalls: number, truncated: boolean, envelopeExhausted: boolean): SearchStats => ({
    candidatesTried, verifierCalls, ms: +(clock() - t0).toFixed(3), truncated, envelopeExhausted,
  });

  const finish = (o: MemberDesignOutcome): MemberDesignOutcome => {
    assertOutcomeInvariants(o);
    return o;
  };

  // ── 1. Capability gate ──
  const unsupported = adapter.unsupported(ctx);
  if (unsupported.length > 0) {
    return finish({
      ...base, outcome: 'UNSUPPORTED', limiting: unsupported,
      reasons: [{ key: 'design.reason.memberUnsupported', params: { elementId: ctx.elementId, code: adapter.name } }],
      searchStats: stats(0, 0, false, false),
    });
  }

  // ── 2. Input validation (combinations, forces, section, material) ──
  const iv = adapter.validateInputs(ctx);
  if (!iv.ok) {
    const onlyUnsupported = iv.blocking.every(b => b === 'unsupportedCheck');
    return finish({
      ...base,
      outcome: onlyUnsupported ? 'UNSUPPORTED' : 'DEMAND_UNAVAILABLE',
      limiting: iv.blocking,
      reasons: iv.reasons.length > 0 ? iv.reasons : [{ key: 'design.reason.missingDemand', params: { elementId: ctx.elementId } }],
      searchStats: stats(0, 0, false, false),
    });
  }

  // ── 3. Orientation refusal (approved decision O6) ──
  if (ctx.orientationSuspect) {
    return finish({
      ...base, outcome: 'SEARCH_EXHAUSTED', limiting: ['memberOrientationSuspect'],
      reasons: [{ key: 'design.reason.orientationSuspect', params: { elementId: ctx.elementId } }],
      searchStats: stats(0, 0, false, false),
    });
  }

  // ── 4. Bounded search ──
  const gen = adapter.createGenerator(ctx);
  if (!gen) {
    return finish({
      ...base, outcome: 'UNSUPPORTED', limiting: ['unsupportedCheck'],
      reasons: [{ key: 'design.reason.noGenerator', params: { elementId: ctx.elementId, code: adapter.name } }],
      searchStats: stats(0, 0, false, false),
    });
  }

  const passing: Array<{ attempt: DesignAttempt; index: number; cost: DesignAttempt['cost'] }> = [];
  let bestFailure: { attempt: DesignAttempt; index: number } | null = null;
  let tried = 0;
  let verifierCalls = 0;
  let truncated = false;
  let feedback: CandidateFeedback | null = null;

  for (;;) {
    if (tried >= budget.maxCandidates || verifierCalls >= budget.maxVerifierCalls) { truncated = true; break; }
    const cand = gen.next(feedback);
    if (!cand) break;
    tried++;
    const attempt = attemptFrom(adapter, ctx, cand);
    verifierCalls++;
    if (isPassingVerdict(attempt)) {
      passing.push({ attempt, index: cand.meta.index, cost: attempt.cost });
      // Stop escalating once the design target is met — heavier candidates cannot
      // improve the staged objective (they cost more steel at equal constructability).
      if (attempt.worstUtilization <= DESIGN_TARGET_UTILIZATION + UTIL_EPSILON) break;
    } else if (!bestFailure || compareFailures(
      { ...attempt, index: cand.meta.index },
      { ...bestFailure.attempt, index: bestFailure.index },
    ) < 0) {
      bestFailure = { attempt, index: cand.meta.index };
    }
    feedback = {
      verdict: attempt.verdict,
      worstUtilization: attempt.worstUtilization,
      limiting: adapter.classifyFailure(attempt.verdict, ctx),
    };
  }

  const envelopeExhausted = gen.envelopeExhausted && !truncated;

  // ── 5. Best passing candidate wins ──
  if (passing.length > 0) {
    passing.sort((a, b) => compareCandidates(a, b));
    const win = passing[0].attempt;
    const certificate = {
      verifierId: prov.verifierId,
      codeId: prov.codeId,
      codeVersion: prov.codeVersion,
      analysisRevision: ctx.analysisRevision,
      demandRevision: ctx.demandRevision,
      rebarHash: rebarHash(win.candidate),
      worstUtilization: +win.worstUtilization.toFixed(4),
      designTarget: DESIGN_TARGET_UTILIZATION,
      checkCount: win.verdict.strengthCheckCount,
      checkedAxes: [...win.verdict.checkedAxes],
      axisBasis: ctx.axes.basis,
      utilizationConvention: UTILIZATION_CONVENTION,
    };
    return finish({
      ...base, outcome: 'VERIFIED',
      accepted: win.candidate, certificate,
      limiting: [], reasons: [],
      searchStats: stats(tried, verifierCalls, truncated, envelopeExhausted),
    });
  }

  // ── 6. Nothing passed — classify honestly ──
  const limiting: LimitingConstraint[] = bestFailure
    ? adapter.classifyFailure(bestFailure.attempt.verdict, ctx)
    : ['searchBudget'];
  if (truncated && !limiting.includes('searchBudget')) limiting.push('searchBudget');
  if (limiting.length === 0) limiting.push('searchBudget');

  const reasons: DesignReason[] = [];
  if (bestFailure) {
    reasons.push({
      key: 'design.reason.bestCandidateFails',
      params: {
        elementId: ctx.elementId,
        utilization: Number.isFinite(bestFailure.attempt.worstUtilization)
          ? +bestFailure.attempt.worstUtilization.toFixed(2) : '∞',
        failing: bestFailure.attempt.failingCheckCount,
        governing: bestFailure.attempt.governing ?? '—',
      },
    });
  }
  if (truncated) reasons.push({ key: 'design.reason.searchTruncated', params: { tried, elementId: ctx.elementId } });
  if (reasons.length === 0) reasons.push({ key: 'design.reason.noCandidate', params: { elementId: ctx.elementId } });

  const advice = envelopeExhausted ? adapter.recommendSection(ctx, limiting) : undefined;

  // The envelope was fully enumerated and nothing fits/verifies → the section, not
  // the reinforcement, is the limit. Requires a recommendation to be honest.
  if (envelopeExhausted && advice) {
    return finish({
      ...base, outcome: 'SECTION_INADEQUATE',
      provisional: bestFailure?.attempt,
      limiting, reasons, sectionAdvice: advice,
      searchStats: stats(tried, verifierCalls, truncated, true),
    });
  }

  return finish({
    ...base, outcome: 'SEARCH_EXHAUSTED',
    provisional: bestFailure?.attempt,
    limiting, reasons,
    sectionAdvice: advice ?? undefined,
    // Never report envelopeExhausted on a SEARCH_EXHAUSTED result: the invariant
    // guard treats that combination as a contract violation.
    searchStats: stats(tried, verifierCalls, truncated, false),
  });
}

export interface RunProgress {
  done: number;
  total: number;
  verified: number;
  elementId: number;
}

export interface RunOptions {
  budget?: SearchBudget;
  clock?: Clock;
  /** Cooperative cancellation. */
  signal?: { aborted: boolean };
  /** Wall-clock cap for the whole run (ms). */
  maxRunMs?: number;
  /** Called every `progressEvery` members. */
  onProgress?: (p: RunProgress) => void;
  progressEvery?: number;
}

export const DEFAULT_RUN_MS = 20_000;

/**
 * Design many members. Honest about partial runs: members not reached are counted
 * in `notReached` and the summary is flagged `aborted`.
 */
export function runDesign(
  adapter: DesignCodeAdapter,
  contexts: Iterable<MemberContext>,
  opts: RunOptions = {},
): DesignRunSummary {
  const clock = opts.clock ?? defaultClock;
  const t0 = clock();
  const maxRunMs = opts.maxRunMs ?? DEFAULT_RUN_MS;
  const every = Math.max(1, opts.progressEvery ?? 25);
  const list = [...contexts].sort((a, b) => a.elementId - b.elementId);
  const outcomes: MemberDesignOutcome[] = [];
  let aborted = false;

  for (let i = 0; i < list.length; i++) {
    if (opts.signal?.aborted) { aborted = true; break; }
    if (clock() - t0 > maxRunMs) { aborted = true; break; }
    const ctx = list[i];
    outcomes.push(designMember(adapter, ctx, { budget: opts.budget, clock }));
    if (opts.onProgress && ((i + 1) % every === 0 || i === list.length - 1)) {
      opts.onProgress({
        done: i + 1, total: list.length,
        verified: outcomes.reduce((n, o) => n + (o.outcome === 'VERIFIED' ? 1 : 0), 0),
        elementId: ctx.elementId,
      });
    }
  }

  const prov = adapter.provenance();
  return tallyRunSummary(
    prov.codeId, prov.codeVersion, outcomes,
    +(clock() - t0).toFixed(3), aborted, list.length - outcomes.length,
  );
}
