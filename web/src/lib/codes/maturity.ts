/**
 * Validation maturity of a calculation.
 *
 * ── Why this exists ────────────────────────────────────────────
 *
 * The five-facet capability model answers "can the app do this at all?". It cannot
 * answer "how far do we trust the number it produced?", and collapsing the two led to a
 * real mistake: joint shear was implemented, clause-grounded and internally tested, and
 * was still reported as UNSUPPORTED purely because no published worked example had been
 * located. That is the wrong call. An engineer who can see the free body, the equations,
 * the assumptions and the equilibrium residual is better served by a provisional result
 * they can review and accept than by a blank.
 *
 * So maturity is a separate axis with three states:
 *
 *   VALIDATED                clause-grounded AND benchmarked against an independent
 *                            reference. Counts toward normal verified status.
 *
 *   IMPLEMENTED_PROVISIONAL  clause-grounded, inputs/equations/assumptions all visible,
 *                            internal analytical, property and equilibrium tests pass,
 *                            but external benchmark coverage is incomplete. Generates
 *                            reinforcement, drawings and exports; a named engineer may
 *                            review and explicitly accept it. Labelled provisional
 *                            everywhere it appears. NEVER silently counted as validated.
 *
 *   UNSUPPORTED              the required demand or rule genuinely cannot be computed
 *                            from available data. No honest implementation exists.
 *
 * ── Promotion ──────────────────────────────────────────────────
 *
 * A provisional calculation is promoted by adding benchmark evidence, not by editing a
 * flag: `promotionPath` on every provisional record states exactly what evidence would
 * do it, and `benchmarks` records what already exists. The invariant is enforced by
 * `deriveMaturity`, so a calculation cannot be marked VALIDATED without at least one
 * external benchmark on file.
 *
 * Pure: no store, no runes.
 */

import type { ClauseRef } from './regulation';
import { msg, type EngineMessage } from './message';

export type Maturity = 'VALIDATED' | 'IMPLEMENTED_PROVISIONAL' | 'UNSUPPORTED';

/** Where a benchmark came from. Only `external` can promote to VALIDATED. */
export type BenchmarkKind =
  /** A worked example from the regulation, a textbook, or a published paper. */
  | 'external'
  /** A hand calculation built directly from the clause, checked in as a fixture. */
  | 'handFixture'
  /** A second, independent implementation used only in tests. */
  | 'crossCheck'
  /** Equilibrium, symmetry, scaling, sign-reversal or limiting-case property tests. */
  | 'property';

export interface BenchmarkRecord {
  kind: BenchmarkKind;
  /** Short identifier, e.g. 'CIRSOC 201-2025 Ej. 22.6-1' or 'hand/punching-interior'. */
  id: string;
  /** Where the reference value came from, in words. */
  source: string;
  /** Agreement achieved, as a relative tolerance. */
  tolerance?: number;
}

export interface MaturityRecord {
  maturity: Maturity;
  /** Clauses the implementation is grounded in. Empty only when UNSUPPORTED. */
  refs: readonly ClauseRef[];
  benchmarks: readonly BenchmarkRecord[];
  /**
   * What evidence would promote this to VALIDATED. Required whenever the state is
   * IMPLEMENTED_PROVISIONAL — a provisional result with no stated route out of it is
   * just an excuse.
   */
  promotionPath?: EngineMessage;
  /** Why the calculation is unsupported. Required whenever the state is UNSUPPORTED. */
  unsupportedReason?: EngineMessage;
  /** Assumptions a reviewer must see, verbatim. */
  assumptions: readonly EngineMessage[];
}

/**
 * Derive the maturity from the evidence on file, rather than trusting a hand-set flag.
 *
 * A calculation reaches VALIDATED only with at least one `external` benchmark. Hand
 * fixtures, cross-checks and property tests are real evidence and are what makes a
 * result provisional rather than unsupported — but they are not independent of the
 * implementer, so they cannot promote it the whole way.
 */
export function deriveMaturity(input: {
  implemented: boolean;
  refs: readonly ClauseRef[];
  benchmarks: readonly BenchmarkRecord[];
  assumptions?: readonly EngineMessage[];
  unsupportedReason?: EngineMessage;
  promotionPath?: EngineMessage;
}): MaturityRecord {
  const assumptions = input.assumptions ?? [];

  if (!input.implemented) {
    return {
      maturity: 'UNSUPPORTED',
      refs: input.refs,
      benchmarks: input.benchmarks,
      unsupportedReason: input.unsupportedReason
        ?? msg('maturity.unsupported.notImplemented'),
      assumptions,
    };
  }

  if (input.refs.length === 0) {
    // An implementation with no clause behind it is not a code check.
    return {
      maturity: 'UNSUPPORTED',
      refs: [],
      benchmarks: input.benchmarks,
      unsupportedReason: msg('maturity.unsupported.noClauseCited'),
      assumptions,
    };
  }

  const external = input.benchmarks.some((b) => b.kind === 'external');
  if (external) {
    return { maturity: 'VALIDATED', refs: input.refs, benchmarks: input.benchmarks, assumptions };
  }

  return {
    maturity: 'IMPLEMENTED_PROVISIONAL',
    refs: input.refs,
    benchmarks: input.benchmarks,
    promotionPath: input.promotionPath
      ?? msg('maturity.promotion.needsExternalBenchmark'),
    assumptions,
  };
}

/** True when the result may contribute to a normal verified/constructible status. */
export function countsAsVerified(m: Maturity): boolean {
  return m === 'VALIDATED';
}

/**
 * True when the result may still be generated, drawn, scheduled and exported.
 *
 * Provisional results are exportable on purpose: withholding them would leave the
 * engineer with nothing to review, which is worse than a labelled provisional drawing.
 */
export function isProducible(m: Maturity): boolean {
  return m === 'VALIDATED' || m === 'IMPLEMENTED_PROVISIONAL';
}

/** i18n key for the badge shown in the UI, on certificates and on drawings. */
export function maturityLabelKey(m: Maturity): string {
  switch (m) {
    case 'VALIDATED': return 'maturity.validated';
    case 'IMPLEMENTED_PROVISIONAL': return 'maturity.provisional';
    case 'UNSUPPORTED': return 'maturity.unsupported';
  }
}

/**
 * Worst maturity across a set — a floor's status is that of its weakest calculation.
 *
 * Ordering: UNSUPPORTED < IMPLEMENTED_PROVISIONAL < VALIDATED.
 */
export function worstMaturity(list: readonly Maturity[]): Maturity {
  if (list.length === 0) return 'VALIDATED';
  if (list.includes('UNSUPPORTED')) return 'UNSUPPORTED';
  if (list.includes('IMPLEMENTED_PROVISIONAL')) return 'IMPLEMENTED_PROVISIONAL';
  return 'VALIDATED';
}

/**
 * The note that must appear on any drawing or certificate carrying provisional work.
 *
 * Deliberately explicit that software approval is not professional sign-off.
 */
export const PROVISIONAL_DRAWING_NOTE: EngineMessage =
  msg('maturity.provisionalDrawingNote');
