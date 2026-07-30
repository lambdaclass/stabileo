/**
 * Coordination along a continuous beam line or column stack, by dynamic programming.
 *
 * ── The problem ────────────────────────────────────────────────
 *
 * Designing each member in isolation produces a set of individually correct, jointly
 * absurd answers: span 1 wants 4Ø16 bottom, span 2 wants 5Ø16, span 3 wants 4Ø20. On
 * site that is three different bar marks, two diameter changes and a lap at every
 * support — for a saving of a few kilograms of steel. A detailer would draw 5Ø16
 * throughout and be done.
 *
 * ── Why dynamic programming ────────────────────────────────────
 *
 * The choice at each span is not independent: what makes a layout good is partly how
 * well it matches its neighbours. That is a chain-structured optimisation with a cost
 * that decomposes into a per-span term and a per-junction term, which is exactly what a
 * forward DP solves exactly in O(n · k²) — n spans, k candidate layouts each. Greedy
 * left-to-right gets the first junction right and then paints itself into a corner;
 * exhaustive search is kⁿ.
 *
 * The DP is over (span index, chosen layout), the transition cost is the junction cost
 * between consecutive layouts, and the result is the globally optimal assignment for
 * the given candidate sets and cost weights. Not "a good answer" — the best one the
 * candidates allow, which is a property worth having because it makes the output
 * reproducible and explainable.
 *
 * ── Hard constraints vs preferences ────────────────────────────
 *
 * Hard constraints are filtered out of the candidate sets before the DP runs, so an
 * infeasible layout can never be selected no matter how cheap it looks. A locked bar is
 * a hard constraint: it reduces its span's candidate set to exactly one entry.
 *
 * Preferences are the cost function. They never override a hard constraint.
 *
 * ── Honesty ────────────────────────────────────────────────────
 *
 * When a span has no feasible candidate the line is NOT silently dropped or filled with
 * the least-bad option: `coordinateLine` returns an infeasible result naming the span
 * and the reason. Producing a coordinated line that contains a member which fails is
 * how a false completeness claim gets made.
 *
 * Pure: no store, no runes.
 */

// ─── Inputs ──────────────────────────────────────────────────────

/**
 * One candidate reinforcement layout for one span or one storey lift.
 *
 * The coordinator is deliberately agnostic about what a "layout" contains — it works on
 * the comparable properties below plus an opaque payload — so the same DP coordinates
 * beam bottom steel, beam top steel and column verticals without three copies.
 */
export interface LayoutCandidate<T = unknown> {
  /** Stable id, unique within its span. Ties are broken by this, so results are stable. */
  id: string;
  /** Bar diameter, mm. Junction cost penalises changes. */
  diameterMm: number;
  /** Number of bars. Junction cost penalises changes. */
  barCount: number;
  /** Number of layers. Fewer is better. */
  layers: number;
  /** Steel area provided, m². */
  areaProvided: number;
  /** Utilization under the governing demand, D/C. Must be <= 1 to be feasible. */
  utilization: number;
  /** True when this layout satisfies every hard constraint for its span. */
  feasible: boolean;
  /** Why it is infeasible, when it is. Surfaced verbatim. */
  infeasibleReason?: string;
  /** The caller's own layout data, carried through untouched. */
  payload: T;
}

export interface SpanInput<T = unknown> {
  /** Element id of the member this span belongs to. */
  elementId: number;
  /** Span length, m. Used to weight the steel-mass term by quantity. */
  length: number;
  /** True when the user pinned this span's reinforcement. */
  locked: boolean;
  candidates: Array<LayoutCandidate<T>>;
}

/**
 * Cost weights, in a deliberate lexicographic-ish order enforced by magnitude.
 *
 * These are not tuned constants pulled from nowhere: the ordering encodes the
 * preference ranking that was agreed for the design objective. Continuity and mark
 * count dominate steel mass, because a detailer's judgement is that two extra bar marks
 * cost more on site than a few kilograms of steel.
 */
export interface CoordinationWeights {
  /** Per junction where the diameter changes. */
  diameterChange: number;
  /** Per junction where the bar count changes. */
  countChange: number;
  /** Per span, per layer beyond the first. */
  extraLayer: number;
  /**
   * Per junction where the bar mark — the (diameter, count) pair — changes.
   *
   * Deliberately a per-CHANGE term, not a penalty on the size of the distinct-mark set.
   * Set cardinality does not decompose over a chain (whether a layout introduces a new
   * mark depends on every earlier choice, not just the previous one), so putting it in
   * the DP would make the DP inexact. A per-change term is exactly optimisable, and it
   * is arguably the better objective anyway: a mark reused after a gap still needs its
   * own transition detail on the drawing.
   *
   * The distinct-mark count is still reported, as a statistic rather than a cost.
   */
  markChange: number;
  /** Per m³ of steel — the mass term, deliberately the weakest. */
  steelVolume: number;
  /** Per span, scaled by how far under the utilization target it sits. */
  underUtilization: number;
}

/**
 * Calibrated, not guessed. The arithmetic that fixes the scale:
 *
 * One extra Ø16 bar across a 6 m span is 5 × 2.01e-4 m² × 6 m of steel ≈ 4.7 kg. A
 * detailer's judgement — and the one this objective encodes — is that 4.7 kg of steel
 * is cheaper than an extra bar mark, which costs a schedule row, a separate cut, a
 * separate bundle and a separate placement instruction. So one kilogram must be worth
 * clearly less than one mark.
 *
 * At 1.5 cost units per kg (steelVolume = 1.5 × 7850), that bar costs ~7 units against
 * 25 for a count change plus 30 for a new mark. Continuity wins, as intended.
 *
 * The scale still lets steel dominate when the difference is large: going from 4Ø16 to
 * 8Ø25 over the same span is ~0.0188 m³ ≈ 221 units, which no amount of mark-count
 * saving will justify. That is the correct behaviour — the objective prefers continuity
 * over trivia, not over engineering.
 *
 * The first version of this table used 10 units/kg and 800 units per unit of
 * utilization slack. Both were an order of magnitude too strong: the DP then optimised
 * for tight utilization and minimum steel and produced exactly the fragmented,
 * three-marks-in-three-spans output that this whole module exists to avoid. The tests
 * caught it.
 */
export const DEFAULT_WEIGHTS: CoordinationWeights = {
  diameterChange: 40,
  countChange: 25,
  extraLayer: 15,
  markChange: 30,
  steelVolume: 1.5 * 7850,
  underUtilization: 20,
};

/** Utilization the optimizer aims at — below this a layout is wasteful, above it fails. */
export const TARGET_UTILIZATION = 0.92;

// ─── Costs ───────────────────────────────────────────────────────

export function spanCost<T>(
  c: LayoutCandidate<T>, span: SpanInput<T>, w: CoordinationWeights,
): number {
  const volume = c.areaProvided * span.length;
  const slack = Math.max(0, TARGET_UTILIZATION - c.utilization);
  return w.steelVolume * volume
    + w.extraLayer * Math.max(0, c.layers - 1)
    + w.underUtilization * slack;
}

export function junctionCost<T>(
  a: LayoutCandidate<T>, b: LayoutCandidate<T>, w: CoordinationWeights,
): number {
  let cost = 0;
  if (a.diameterMm !== b.diameterMm) cost += w.diameterChange;
  if (a.barCount !== b.barCount) cost += w.countChange;
  if (a.diameterMm !== b.diameterMm || a.barCount !== b.barCount) cost += w.markChange;
  return cost;
}

// ─── Results ─────────────────────────────────────────────────────

export interface CoordinatedSpan<T = unknown> {
  elementId: number;
  chosen: LayoutCandidate<T>;
  /** Cost contributed by this span alone. */
  spanCost: number;
  /** Cost of the junction with the PREVIOUS span. 0 for the first. */
  junctionCost: number;
  /** True when this span was pinned and the DP had no choice. */
  locked: boolean;
}

export interface InfeasibleSpan {
  elementId: number;
  /** Every candidate's reason, so the user sees why nothing worked. */
  reasons: string[];
  candidateCount: number;
}

export type CoordinationResult<T = unknown> =
  | {
      status: 'COORDINATED';
      spans: Array<CoordinatedSpan<T>>;
      totalCost: number;
      /** Distinct (diameter, count) pairs along the line. */
      uniqueMarks: number;
      /** Junctions where the diameter or the count changes. */
      transitions: number;
      /** Human-readable trace of the decision, for the explainability requirement. */
      trace: string[];
    }
  | {
      status: 'INFEASIBLE';
      /** Spans with no feasible candidate. Never empty in this branch. */
      infeasible: InfeasibleSpan[];
      trace: string[];
    }
  | {
      status: 'EMPTY';
      trace: string[];
    };

// ─── The DP ──────────────────────────────────────────────────────

/**
 * Coordinate one continuous line.
 *
 * Exactly optimal for the stated objective: every term is either per-span or
 * per-junction, so the forward DP over (span, candidate) is an exact minimisation.
 *
 * An earlier version tried to charge for the size of the distinct-mark SET, applied as
 * a post-hoc correction after backtracking. That was wrong twice over — set cardinality
 * does not decompose over a chain, and the correction could not change the answer at
 * all when the competing chains shared a terminal candidate, because backtracking then
 * yields exactly one chain to re-score. The greedy-trap test caught it. The mark term is
 * now a per-junction change cost, which is exact.
 */
export function coordinateLine<T>(
  spans: readonly SpanInput<T>[],
  weights: CoordinationWeights = DEFAULT_WEIGHTS,
): CoordinationResult<T> {
  const trace: string[] = [];

  if (spans.length === 0) {
    return { status: 'EMPTY', trace: ['No spans supplied.'] };
  }

  // ── Hard constraints first: filter, never rank ──
  const feasible: Array<Array<LayoutCandidate<T>>> = [];
  const infeasible: InfeasibleSpan[] = [];

  for (const span of spans) {
    const ok = span.candidates.filter((c) => c.feasible && c.utilization <= 1.0);
    if (ok.length === 0) {
      infeasible.push({
        elementId: span.elementId,
        reasons: [...new Set(span.candidates.map(
          (c) => c.infeasibleReason ?? `utilización ${c.utilization.toFixed(2)} > 1,00`))],
        candidateCount: span.candidates.length,
      });
      feasible.push([]);
      continue;
    }
    // Deterministic order: cheapest first, ties broken by id so the result never
    // depends on the order the generator happened to emit candidates.
    ok.sort((a, b) => spanCost(a, span, weights) - spanCost(b, span, weights)
      || a.id.localeCompare(b.id));
    feasible.push(ok);
  }

  if (infeasible.length > 0) {
    trace.push(`${infeasible.length} span(s) have no feasible layout; the line is not coordinated.`);
    return { status: 'INFEASIBLE', infeasible, trace };
  }

  trace.push(`${spans.length} span(s), ${feasible.map((f) => f.length).join('/')} feasible candidates each.`);

  // ── Forward DP ──
  // best[i][j] = minimum cost of covering spans 0..i with span i using candidate j.
  const best: number[][] = [];
  const from: number[][] = [];

  for (let i = 0; i < spans.length; i++) {
    const row: number[] = [];
    const back: number[] = [];
    for (let j = 0; j < feasible[i].length; j++) {
      const own = spanCost(feasible[i][j], spans[i], weights);
      if (i === 0) {
        row.push(own);
        back.push(-1);
        continue;
      }
      let bestPrev = Infinity;
      let bestIdx = -1;
      for (let k = 0; k < feasible[i - 1].length; k++) {
        const total = best[i - 1][k] + junctionCost(feasible[i - 1][k], feasible[i][j], weights);
        // Strict < keeps the earliest (cheapest, then id-sorted) predecessor on ties,
        // which is what makes the whole result deterministic.
        if (total < bestPrev) { bestPrev = total; bestIdx = k; }
      }
      row.push(own + bestPrev);
      back.push(bestIdx);
    }
    best.push(row);
    from.push(back);
  }

  // ── Backtrack from the cheapest terminal state ──
  const last = spans.length - 1;
  let bestTotal = Infinity;
  let bestChain: number[] | null = null;

  for (let j = 0; j < feasible[last].length; j++) {
    if (!(best[last][j] < bestTotal)) continue;
    const chain: number[] = new Array(spans.length);
    chain[last] = j;
    for (let i = last; i > 0; i--) chain[i - 1] = from[i][chain[i]];
    if (chain.some((x) => x < 0)) continue;
    bestTotal = best[last][j];
    bestChain = chain;
  }

  if (!bestChain) {
    // Unreachable given the feasibility filter above, but a silent wrong answer here
    // would be worse than an explicit one.
    return {
      status: 'INFEASIBLE',
      infeasible: spans.map((s) => ({
        elementId: s.elementId, reasons: ['no reachable DP state'], candidateCount: 0,
      })),
      trace: [...trace, 'DP produced no reachable chain.'],
    };
  }

  const out: Array<CoordinatedSpan<T>> = [];
  let transitions = 0;
  for (let i = 0; i < spans.length; i++) {
    const chosen = feasible[i][bestChain[i]];
    const jc = i === 0 ? 0 : junctionCost(feasible[i - 1][bestChain[i - 1]], chosen, weights);
    if (jc > 0) transitions++;
    out.push({
      elementId: spans[i].elementId,
      chosen,
      spanCost: spanCost(chosen, spans[i], weights),
      junctionCost: jc,
      locked: spans[i].locked,
    });
  }

  const uniqueMarks = new Set(out.map((s) => `${s.chosen.diameterMm}x${s.chosen.barCount}`)).size;

  trace.push(
    `Chosen: ${out.map((s) => `${s.chosen.barCount}Ø${s.chosen.diameterMm}`).join(' | ')}`,
    `${uniqueMarks} unique mark(s), ${transitions} transition(s), total cost ${bestTotal.toFixed(1)}.`,
  );

  return { status: 'COORDINATED', spans: out, totalCost: bestTotal, uniqueMarks, transitions, trace };
}

/**
 * Reduce a locked span to its pinned layout.
 *
 * A locked span is a hard constraint, not a strong preference, so it is enforced by
 * shrinking the candidate set to one before the DP sees it. The DP then optimises
 * everything else *around* it, which is the behaviour a user pinning one span expects.
 */
export function applyLock<T>(span: SpanInput<T>, lockedCandidateId: string): SpanInput<T> {
  const kept = span.candidates.filter((c) => c.id === lockedCandidateId);
  return {
    ...span,
    locked: true,
    candidates: kept.length > 0
      ? kept
      // The pinned layout is no longer among the candidates — usually because demands
      // changed. Report it as infeasible rather than silently unpinning.
      : [{
          id: lockedCandidateId, diameterMm: 0, barCount: 0, layers: 1,
          areaProvided: 0, utilization: Infinity, feasible: false,
          infeasibleReason:
            `La armadura fijada "${lockedCandidateId}" ya no figura entre las alternativas ` +
            'admisibles para este tramo. Revisar o liberar la fijación.',
          payload: span.candidates[0]?.payload as T,
        }],
  };
}
