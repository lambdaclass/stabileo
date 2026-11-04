/**
 * The bounded, deterministic candidate search.
 *
 * Every candidate is verified by the ADAPTER'S OWN authoritative verifier — the
 * same function the UI renders — so a "designed" member cannot have been certified
 * by a different standard than the one the engineer sees.
 *
 * Feasibility vs. exhaustion is decided by the evidence:
 *   - a bound of the code no reinforcement lifts is exceeded  → SECTION_INADEQUATE, with the proof
 *     (`section-bounds.ts`: which bound, its clause, its numbers)
 *   - the generator ran out of the arrangements it implements → SEARCH_EXHAUSTED, scope
 *     `implementedAlternatives`, with what was tried and what is not implemented
 *   - a budget stopped the search first                       → SEARCH_EXHAUSTED, scope `budget`
 * We never claim infeasibility we did not establish (approved decision O1): an enumeration that
 * came back empty is not a proof, whatever its size.
 *
 * Pure: no store access, no side effects, no timers beyond reading a clock.
 */

import { beamCornerRecord, columnCageDia, type BeamCornerRecord } from './end-support-anchorage';

import { columnBarsOf } from '../detailing/joint-threading';
import type { DesignCodeAdapter } from './code-adapter';
import type { MemberContext } from './member-context';
import type { Candidate, CandidateFeedback } from './candidate-generator';
import { compareCandidates, compareFailures, computeCandidateCost, STANDARD_LONG_DIAS } from './objective';
import type { ProvidedReinforcement } from '../../store/model.svelte';
import type { ProvidedRebarResult } from '../station-design-forces';
import { rebarHash } from './rebar-hash';
import { completeAnchorage } from './anchorage-hooks';
import {
  assertOutcomeInvariants, tallyRunSummary,
  DESIGN_TARGET_UTILIZATION, UTILIZATION_CONVENTION,
  UTIL_FAIL_THRESHOLD, UTIL_EPSILON,
  type DesignAttempt, type DesignCertificate, type DesignReason, type DesignRunSummary,
  type LimitingConstraint, type MemberDesignOutcome, type SearchStats,
  type ExhaustionGap, type ExhaustionRecord, type InsufficiencyProof,
  detailableReinforcement,
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
    /**
     * A beam refused ONLY for biaxial bending gets a proposal instead of nothing.
     *
     * ── What the refusal was, and why it stays ─────────────────────
     *
     * On `Edificio H.A. 7 pisos — PRO` this gate refuses 117 of 119 beams. Every refusal is
     * correct: `resolveDesignAxes` measures a secondary moment above the 10 % threshold, and
     * no verifier in this app evaluates a beam's secondary axis. Certifying would pass a
     * member whose significant secondary bending nobody checked, and that has not changed.
     *
     * What HAD to change is the consequence. A refusal designed nothing at all, so those 117
     * beams had no reinforcement in the model, no bars in the document, no steel in the 3-D
     * view and no rows on any schedule — bare orange concrete, with the explanation available
     * only to a reviewer who clicked into a status panel. The engineer could not see what
     * their building would need, could not size anything from it, and had nothing to design
     * the secondary axis ON TOP of by hand.
     *
     * ── What the proposal is ───────────────────────────────────────
     *
     * The ordinary bounded search, run against the PRIMARY axis, with nothing else altered:
     * the threshold is untouched, the verifier is untouched, every check that does run runs
     * in full, and no capacity is invented for the axis nobody checks. The context handed to
     * it is this one with `axes.biaxial` cleared — which is exactly the statement "design
     * this as the uniaxial beam it is about its primary axis", made once, in one place, so
     * that it cannot be mistaken for a lowered threshold.
     *
     * The result is returned as PROVISIONAL_BIAXIAL: geometry in the `provisional` field,
     * which the invariants already forbid from carrying a certificate, plus a
     * `ProvisionalBasis` naming the unchecked axis, its size in kN·m, the combination that
     * governs it and the method used. It cannot be counted as a pass, and it cannot satisfy
     * the constructibility gate, which counts certificates.
     *
     * ── Why not real biaxial design ────────────────────────────────
     *
     * Audited before this was written; the answer is `docs/audits/biaxial-beam-design.md`.
     * Briefly: a beam's reinforcement model has no side-face bars, in the schema, the
     * generator, the geometry, the drawings or the schedule — so a weak-axis check that
     * FAILED would leave the search no knob to turn. Bresler is formulated in 1/Pn and is
     * unusable at N≈0. Two-way shear on a beam is not implemented. (When this was audited
     * torsion was not verified at all, and in this population the median torsion, 1,33 kN·m,
     * exceeds the median secondary moment, 1,00 kN·m. Torsion is checked now, §22.7 in
     * `verifyProvidedReinforcement`; the reasons above still stand.)
     */
    if (unsupported.length === 1 && unsupported[0] === 'biaxial' && ctx.elementType !== 'column') {
      const proposal = proposeOnPrimaryAxis(adapter, ctx, opts, base, clock, t0);
      if (proposal) return finish(proposal);
    }
    /**
     * Name the biaxial refusal specifically, because it is actionable and the generic one
     * is not.
     *
     * "Member 19 is not supported by CIRSOC 201-2025" is true and leads nowhere. The
     * secondary-axis refusal has a cause the engineer can see in their own model — a beam
     * carrying real bending about both axes — and a remedy that is theirs to choose: brace
     * it, re-orient it, or design that axis by hand. Telling them the ratio is what makes
     * the difference between a dead end and a decision.
     */
    const biaxial = unsupported.includes('biaxial');
    return finish({
      ...base, outcome: 'UNSUPPORTED', limiting: unsupported,
      reasons: [biaxial
        ? {
          key: 'design.reason.secondaryAxisUnchecked',
          params: {
            elementId: ctx.elementId,
            percent: Math.round((ctx.axes?.secondaryRatio ?? 0) * 100),
            secondary: ctx.axes?.secondaryFlexure ?? '',
            primary: ctx.axes?.flexure ?? '',
          },
        }
        : { key: 'design.reason.memberUnsupported', params: { elementId: ctx.elementId, code: adapter.name } }],
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
    let win = passing[0].attempt;
    // A bottom group that anchors into its support only with a hook gets the hook (§25.4.3).
    const done = completeAnchorage(adapter, ctx, win.candidate, win.verdict,
      (v) => isPassingVerdict({ ...win, verdict: v, worstUtilization: v.worstUtilization }));
    if (done.verified) verifierCalls++;
    if (done.reinf !== win.candidate) win = { ...win, candidate: done.reinf, verdict: done.verdict, worstUtilization: done.verdict.worstUtilization };
    const certificate = certificateFor(adapter, ctx, win.candidate, win.verdict);
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

  /*
   * SECTION_INADEQUATE only on a proof: a bound of the code no reinforcement lifts, exceeded
   * (`section-bounds.ts`). It used to be the envelope run out with a section recommendation to
   * offer, which is a claim about the arrangements the generator ENUMERATES (finite diameters,
   * rows, layouts and seats, the first options per region), not about the section: 22 beams of
   * the flagship frame read «section inadequate» for congestion and anchorage that no bound
   * proves. Those are SEARCH_EXHAUSTED, with what was tried and what is not implemented.
   */
  const proof = adapter.insufficiency?.(ctx) ?? null;
  if (proof) {
    const bound: LimitingConstraint = proof.bound === 'shearSectionLimit' ? 'shear'
      : proof.bound === 'axialCapacityAtMaxSteel' ? 'axialFlexure' : 'barFit';
    const sectionAdvice = advice ?? adapter.recommendSection(ctx, [bound]);
    return finish({
      ...base, outcome: 'SECTION_INADEQUATE',
      provisional: bestFailure?.attempt,
      limiting: limiting.includes(bound) ? limiting : [bound, ...limiting.filter((l) => l !== 'searchBudget')],
      reasons: [insufficiencyReason(ctx.elementId, proof), ...reasons.filter((r) => r.key !== 'design.reason.searchTruncated')],
      insufficiency: proof,
      ...(sectionAdvice ? { sectionAdvice } : {}),
      searchStats: stats(tried, verifierCalls, truncated, envelopeExhausted),
    });
  }

  const exhaustion = exhaustionOf(adapter, ctx, limiting, tried, truncated);
  return finish({
    ...base, outcome: 'SEARCH_EXHAUSTED',
    provisional: bestFailure?.attempt,
    limiting,
    reasons: [...reasons, ...exhaustionReasons(ctx.elementId, exhaustion)],
    exhaustion,
    sectionAdvice: advice ?? undefined,
    searchStats: stats(tried, verifierCalls, truncated, envelopeExhausted),
  });
}

/**
 * What an exhausted search tried and what it could not: the alternatives the generator enumerates
 * for this member, and the ones nothing in this app implements, chosen by what limited it.
 */
export function exhaustionOf(
  adapter: DesignCodeAdapter, ctx: MemberContext, limiting: readonly LimitingConstraint[], tried: number, truncated: boolean,
): ExhaustionRecord {
  const alt = adapter.alternatives?.(ctx) ?? {
    longDiametersMm: [...(ctx.material.longDiametersMm ?? STANDARD_LONG_DIAS)], maxRows: 0, optionsRetained: 0,
    stirrupDiametersMm: [], maxLegs: 0,
  };
  const gaps = new Set<ExhaustionGap>();
  gaps.add('bundledBars');
  if (ctx.elementType !== 'column') { gaps.add('mixedDiametersInRow'); gaps.add('optionsBeyondRetained'); }
  if (limiting.includes('anchorage')) { gaps.add('headedBars'); gaps.add('mechanicalAnchorage'); gaps.add('columnCageChange'); }
  // An undeclared beam is designed as part of the lateral system (§9.7.3.8.2, fy at the face):
  // declaring its role is an input that can change this verdict, and the outcome says so.
  if (limiting.includes('anchorage') && ctx.elementType === 'beam' && (ctx.lateral?.role ?? 'undeclared') === 'undeclared') gaps.add('lateralRoleUndeclared');
  if (limiting.includes('congestion') && ctx.elementType !== 'column') gaps.add('columnCageChange');
  if (truncated) gaps.add('searchBudget');
  return {
    scope: truncated ? 'budget' : 'implementedAlternatives',
    limiting: [...limiting],
    tried: { candidates: tried, ...alt, crossingSeatsRetried: false },
    notImplemented: [...gaps],
  };
}

/** The sentence an exhausted search states, and one per alternative it did not try. */
export function exhaustionReasons(elementId: number, e: ExhaustionRecord): DesignReason[] {
  return [
    {
      key: e.scope === 'budget' ? 'design.reason.exhaustedBudget' : 'design.reason.alternativesExhausted',
      params: {
        elementId, tried: e.tried.candidates, limiting: e.limiting.join(', '),
        diameters: e.tried.longDiametersMm.join(', '), rows: e.tried.maxRows, options: e.tried.optionsRetained,
        stirrups: e.tried.stirrupDiametersMm.join(', '), legs: e.tried.maxLegs,
      },
    },
    ...(e.tried.crossingSeatsRetried ? [{ key: 'design.reason.crossingSeatsRetried', params: { elementId } }] : []),
    ...e.notImplemented.filter((g) => g !== 'searchBudget').map((g) => ({ key: `design.gap.${g}` })),
  ];
}

/** The proof, as the reason a demonstrated insufficiency states. */
export function insufficiencyReason(elementId: number, p: InsufficiencyProof): DesignReason {
  return {
    key: `design.reason.insufficiency.${p.bound}`,
    params: {
      elementId, demand: p.demand, capacity: p.capacity, unit: p.unit, clause: p.clause,
      ...(p.axis ? { axis: p.axis } : {}),
      ...Object.fromEntries(Object.entries(p.basis).map(([k, v]) => [k, v])),
    },
  };
}

/**
 * Design the primary axis of a beam the biaxial gate refused, and return it as a PROPOSAL.
 *
 * Returns null when the primary axis cannot be designed either. A member that has nothing to
 * propose is a refusal, and it is reported as one — inventing a proposal out of a failed
 * search would be the dishonesty this whole state exists to avoid.
 *
 * The recursion terminates: the context handed down has `axes.biaxial === false`, so
 * `adapter.unsupported` cannot return `['biaxial']` for it and this branch is not re-entered.
 */
function proposeOnPrimaryAxis(
  adapter: DesignCodeAdapter,
  ctx: MemberContext,
  opts: { budget?: SearchBudget; clock?: Clock },
  base: Pick<MemberDesignOutcome, 'elementId' | 'elementType' | 'codeId' | 'codeVersion' | 'axes'>,
  clock: Clock,
  t0: number,
): MemberDesignOutcome | null {
  const primaryCtx: MemberContext = { ...ctx, axes: { ...ctx.axes, biaxial: false } };
  const inner = designMember(adapter, primaryCtx, opts);
  if (inner.outcome !== 'VERIFIED' || !inner.accepted || !inner.certificate) return null;

  const axes = ctx.axes;
  const secondaryPeak = peakFor(ctx, axes.secondaryFlexure);

  /**
   * The verdict recorded is the REAL one, re-read from the verifier against the member as it
   * actually is — biaxial flag and all — not the primary-axis run's certificate wearing a
   * different type. So `provisional.verdict.checks` holds the biaxial refusal alongside the
   * primary-axis checks that passed, and a panel rendering it shows both without this
   * function having to summarise either.
   */
  const verdict = adapter.verify(ctx, inner.accepted);
  return {
    ...base,
    outcome: 'PROVISIONAL_BIAXIAL',
    // The geometry, in the field that by contract cannot be certified.
    provisional: {
      candidate: inner.accepted,
      verdict,
      worstUtilization: verdict.worstUtilization,
      failingCheckCount: verdict.checks.filter((c) => c.status === 'fail').length,
      governing: 'biaxial',
      cost: { layers: 0, distinctDiameters: 0, nonStandardSteps: 0, steelMassKg: 0,
        congestion: 0, arrangementCount: 0, spacingPracticality: 0, weighted: 0 },
    },
    provisionalBasis: {
      method: 'primaryAxisDesign',
      designedAxis: axes.flexure,
      designedShear: axes.shear,
      uncheckedAxis: axes.secondaryFlexure,
      uncheckedShear: axes.secondaryShear,
      secondaryRatio: axes.secondaryRatio,
      primaryMoment: +peakFor(ctx, axes.flexure).value.toFixed(2),
      secondaryMoment: +secondaryPeak.value.toFixed(2),
      secondaryCombo: secondaryPeak.combo,
      primaryUtilization: inner.certificate.worstUtilization,
      checkedAxes: [...inner.certificate.checkedAxes],
    },
    limiting: ['biaxial'],
    reasons: [
      {
        key: 'design.reason.provisionalBiaxial',
        params: {
          elementId: ctx.elementId,
          designed: axes.flexure,
          unchecked: axes.secondaryFlexure,
          uncheckedShear: axes.secondaryShear,
          secondary: +secondaryPeak.value.toFixed(2),
          primary: +peakFor(ctx, axes.flexure).value.toFixed(2),
          percent: Math.round(axes.secondaryRatio * 100),
        },
      },
      {
        key: 'design.reason.secondaryAxisUnchecked',
        params: {
          elementId: ctx.elementId,
          percent: Math.round(axes.secondaryRatio * 100),
          secondary: axes.secondaryFlexure,
          primary: axes.flexure,
        },
      },
    ],
    searchStats: {
      ...inner.searchStats,
      ms: +(clock() - t0).toFixed(3),
    },
  };
}

/** Peak |M| about one axis, with the combination that governs it. */
function peakFor(ctx: MemberContext, axis: 'My' | 'Mz'): { value: number; combo: string | null } {
  const demands = ctx.demands?.demands ?? [];
  let best: { value: number; combo: string | null } = { value: 0, combo: null };
  for (const d of demands) {
    if (d.category !== `${axis}+` && d.category !== `${axis}-`) continue;
    if (d.absValue > best.value) best = { value: d.absValue, combo: d.comboName };
  }
  return best;
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
  // Columns first: a beam's bars hook into the columns' cages (`end-support-anchorage.ts`), so the
  // beams are designed against the cages just designed, not against a default.
  const rank = (c: MemberContext) => (c.elementType === 'column' ? 0 : 1);
  const list = [...contexts].sort((a, b) => rank(a) - rank(b) || a.elementId - b.elementId);
  const outcomes: MemberDesignOutcome[] = [];
  let aborted = false;
  const cages = new Map<number, number>();
  const colBars = new Map<number, { count: number; diameterMm: number }>();
  const corners = new Map<number, BeamCornerRecord>();
  const absent = new Set<number>();

  for (let i = 0; i < list.length; i++) {
    if (opts.signal?.aborted) { aborted = true; break; }
    if (clock() - t0 > maxRunMs) { aborted = true; break; }
    const ctx = list[i];
    const withCages = ctx.elementType === 'beam' && (cages.size > 0 || corners.size > 0 || absent.size > 0)
      ? {
        ...ctx,
        columnCages: new Map([...(ctx.columnCages ?? []), ...cages]),
        columnBars: new Map([...(ctx.columnBars ?? []), ...colBars]),
        beamCorners: new Map([...(ctx.beamCorners ?? []), ...corners]),
        absentBeams: new Set([...(ctx.absentBeams ?? []), ...absent]),
      } : ctx;
    const o = designMember(adapter, withCages, { budget: opts.budget, clock });
    outcomes.push(o);
    if (ctx.elementType === 'column') {
      const dia = columnCageDia(detailableReinforcement(o)?.rebar);
      if (dia > 0) cages.set(ctx.elementId, dia);
      const bars = columnBarsOf(detailableReinforcement(o)?.rebar);
      if (bars) colBars.set(ctx.elementId, bars);
    } else if (ctx.elementType === 'beam') {
      const rec = beamCornerRecord(detailableReinforcement(o)?.rebar, ctx.material.stirrupDia);
      // Every piece of a span holds the span's steel; a refused span holds none.
      for (const id of ctx.span?.elements ?? [ctx.elementId]) {
        if (rec) corners.set(id, rec);
        if (!detailableReinforcement(o)) absent.add(id);
      }
    }
    if (opts.onProgress && ((i + 1) % every === 0 || i === list.length - 1)) {
      opts.onProgress({
        done: i + 1, total: list.length,
        verified: outcomes.reduce((n, o) => n + (o.outcome === 'VERIFIED' ? 1 : 0), 0),
        elementId: ctx.elementId,
      });
    }
  }

  /*
   * The settle runs to its end whatever the clock says. It is what makes a verified beam's
   * certificate true against the seats the run designed, and its work is bounded by counts (each
   * member's search budget, no more sweeps than members). Cut by the run's clock, it left beams
   * VERIFIED against a guess with `aborted` false: on the 408-member flagship a run that crossed
   * the 20 s mark during the settle verified 357 beams and columns where a complete one verifies
   * 356, and the repair ladder downstream moved other bars. The clock stops the loop above, where
   * what it leaves out is counted in `notReached`; a cancellation still stops the settle, and the
   * run says it was aborted.
   */
  if (!settleCrossingSeats(adapter, list, outcomes, cages, colBars, corners, absent, {
    budget: opts.budget, clock, cancelled: () => !!opts.signal?.aborted,
  })) aborted = true;

  const prov = adapter.provenance();
  return tallyRunSummary(
    prov.codeId, prov.codeVersion, outcomes,
    +(clock() - t0).toFixed(3), aborted, list.length - outcomes.length,
  );
}

/**
 * What a beam's supports hold, settled after the run.
 *
 * A beam's hooks keep clear of the corner bars of the beams crossing it at a joint, and its bars
 * lap at a support only where a beam continues the line (`end-support-anchorage.ts`). During the
 * run a beam not designed yet is read as present, at every seat it could take; a refused beam has
 * no bars and is read as absent from then on (`absentBeams`). Two things follow:
 *
 *   - two beams crossing at a congested joint refuse each other, each reading the other at its
 *     worst seat, and neither ever gets a seat to read. So every beam refused on its anchorage is
 *     designed again, reading the other ones as present at their lightest seat (the smallest
 *     admissible bar on the project's stirrup) — a guess;
 *   - a beam designed before its neighbour was refused read a line that continues, or a seat,
 *     that the detailing will not lay.
 *
 * So every verified beam is then verified again against what the run actually designed, and one
 * that no longer passes is designed again, and refused if nothing passes, until a sweep changes
 * nothing. A refused beam is never brought back in a sweep, so the beams the others were checked
 * against stay what they were checked as, and what is left verified passes against the designs
 * the detailing lays: never a guess.
 */
function settleCrossingSeats(
  adapter: DesignCodeAdapter, list: MemberContext[], outcomes: MemberDesignOutcome[],
  cages: Map<number, number>, colBars: Map<number, { count: number; diameterMm: number }>,
  corners: Map<number, BeamCornerRecord>, absent: Set<number>,
  o: { budget?: SearchBudget; clock: Clock; cancelled: () => boolean },
): boolean {
  const refusedOnAnchorage = (x: MemberDesignOutcome) => x.elementType === 'beam' && x.outcome !== 'VERIFIED' && x.limiting.includes('anchorage');
  const pieces = (c: MemberContext) => c.span?.elements ?? [c.elementId];
  const record = (i: number) => {
    const rebar = detailableReinforcement(outcomes[i])?.rebar;
    const rec = beamCornerRecord(rebar, list[i]!.material.stirrupDia);
    for (const id of pieces(list[i]!)) {
      if (rec) corners.set(id, rec); else corners.delete(id);
      if (rebar) absent.delete(id); else absent.add(id);
    }
  };
  const withSeats = (c: MemberContext, guess?: { seats: ReadonlyMap<number, BeamCornerRecord>; present: ReadonlySet<number> }): MemberContext => ({
    ...c, columnCages: new Map([...(c.columnCages ?? []), ...cages]),
    columnBars: new Map([...(c.columnBars ?? []), ...colBars]),
    beamCorners: new Map([...(c.beamCorners ?? []), ...(guess?.seats ?? []), ...corners]),
    absentBeams: new Set([...(c.absentBeams ?? []), ...absent].filter((id) => !guess?.present.has(id))),
  });
  // 1. The guess: the beams refused on their anchorage, present at their lightest seat.
  const refused = outcomes.map((x, i) => (refusedOnAnchorage(x) ? i : -1)).filter((i) => i >= 0);
  const lightest = new Map<number, BeamCornerRecord>();
  for (const i of refused) {
    const c = list[i]!;
    const admissible = c.material.longDiametersMm?.length ? c.material.longDiametersMm : STANDARD_LONG_DIAS;
    for (const id of pieces(c)) lightest.set(id, { cornerDiasMm: [Math.min(...admissible)], stirrupDiaMm: c.material.stirrupDia });
  }
  for (const i of refused) {
    if (o.cancelled()) return false;
    const again = designMember(adapter, withSeats(list[i]!, { seats: lightest, present: new Set(lightest.keys()) }), { budget: o.budget, clock: o.clock });
    if (again.outcome !== 'VERIFIED') {
      // Tried again with the crossing beams at their lightest seat, and refused again: said so.
      const x = outcomes[i]!;
      if (x.exhaustion && !x.exhaustion.tried.crossingSeatsRetried) {
        const exhaustion = { ...x.exhaustion, tried: { ...x.exhaustion.tried, crossingSeatsRetried: true } };
        outcomes[i] = { ...x, exhaustion, reasons: [...x.reasons, { key: 'design.reason.crossingSeatsRetried', params: { elementId: x.elementId } }] };
      }
      continue;
    }
    outcomes[i] = again; record(i);
    for (const id of pieces(list[i]!)) lightest.delete(id);
  }
  // 2 runs whatever happened in 1: a beam designed before the beams crossing it read them at
  // every seat they could take, and is checked again against the seats they have.
  // 2. Settle against what was designed.
  for (let sweep = 0; sweep < list.length; sweep++) {
    let changed = false;
    // Every beam's corner seats as designed now (its crossing beams' settled since).
    for (let i = 0; i < outcomes.length; i++) if (outcomes[i]!.elementType === 'beam') record(i);
    for (let i = 0; i < outcomes.length; i++) {
      const x = outcomes[i]!;
      if (x.elementType !== 'beam' || x.outcome !== 'VERIFIED') continue;
      const rebar = detailableReinforcement(x)?.rebar;
      if (!rebar || adapter.verify(withSeats(list[i]!), rebar).overallStatus !== 'fail') continue;
      if (o.cancelled()) return false;
      const again = designMember(adapter, withSeats(list[i]!), { budget: o.budget, clock: o.clock });
      outcomes[i] = again;
      record(i);
      /*
       * A change is a different verdict or different bars. A beam whose bars read `fail` here
       * only for a hook the search completes (`anchorHook`, `completeAnchorage`) is designed
       * again to the same bars, VERIFIED: counting that as a change re-ran the sweep up to once
       * per member (103 835 verifier calls on the 408-member frame, for two such beams).
       */
      const before = detailableReinforcement(x)?.rebar, after = detailableReinforcement(again)?.rebar;
      if (again.outcome !== x.outcome || !before || !after || rebarHash(before) !== rebarHash(after)) changed = true;
    }
    if (!changed) return true;
  }
  return true;
}

/** The certificate a passing arrangement gets: the one shape the search and an edit share. */
export function certificateFor(
  adapter: DesignCodeAdapter, ctx: MemberContext, reinf: ProvidedReinforcement, verdict: ProvidedRebarResult,
): DesignCertificate {
  const prov = adapter.provenance();
  return {
    verifierId: prov.verifierId,
    codeId: prov.codeId,
    codeVersion: prov.codeVersion,
    analysisRevision: ctx.analysisRevision,
    demandRevision: ctx.demandRevision,
    rebarHash: rebarHash(reinf),
    worstUtilization: +verdict.worstUtilization.toFixed(4),
    designTarget: DESIGN_TARGET_UTILIZATION,
    checkCount: verdict.strengthCheckCount,
    checkedAxes: [...verdict.checkedAxes],
    axisBasis: ctx.axes.basis,
    utilizationConvention: UTILIZATION_CONVENTION,
  };
}

/**
 * The outcome of the bars a member HAS, when someone edited them.
 *
 * The detailing, the drawings and the schedule draw what the outcome accepts, and they used to
 * read the design run's arrangement even after an edit: the table showed one set of bars and the
 * drawings another. An edit that verifies is accepted with its own certificate. One that fails
 * has no outcome to draw (null): the member is left out of the drawings, and the design table
 * already shows its failing checks. No refusal kind fits it, because nothing was searched.
 */
export function outcomeFromProvided(
  adapter: DesignCodeAdapter, ctx: MemberContext, reinf: ProvidedReinforcement, verdict: ProvidedRebarResult,
): MemberDesignOutcome | null {
  const attempt: DesignAttempt = {
    candidate: reinf, verdict, worstUtilization: verdict.worstUtilization,
    failingCheckCount: verdict.checks.filter((k) => k.status === 'fail').length,
    governing: null, cost: computeCandidateCost(reinf, { L: ctx.L, layoutIssues: 0, arrangements: 1, spacings: [] }),
  };
  if (!isPassingVerdict(attempt)) return null;
  const prov = adapter.provenance();
  const o: MemberDesignOutcome = {
    elementId: ctx.elementId, elementType: ctx.elementType,
    codeId: prov.codeId, codeVersion: prov.codeVersion, axes: ctx.axes,
    searchStats: { candidatesTried: 0, verifierCalls: 0, ms: 0, truncated: false, envelopeExhausted: false },
    outcome: 'VERIFIED', accepted: reinf, certificate: certificateFor(adapter, ctx, reinf, verdict),
    limiting: [], reasons: [],
  };
  assertOutcomeInvariants(o);
  return o;
}
