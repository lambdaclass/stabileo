/**
 * What a detailing run is ALLOWED to be called, measured against the whole model.
 *
 * ── The hole this closes ───────────────────────────────────────────
 *
 * `detailingReadiness` answers one question — *is there anything worth drawing?* — and
 * `runDetailing` then details exactly `readiness.detailable` and nothing else. Members with no
 * verified design never enter the run: they are not in `byLevel`, not in `elementIds`, and
 * therefore not in `applicableMembers`, which `run-detailing.ts` sets to `elementIds.length`.
 *
 * The fifteen constructibility conditions are consequently measured over the SUBSET that was
 * drawn. On a frame where the design refused eight columns and verified four, the four are
 * coordinated, clash-free, reverified and certificate-matched — so the assembly reaches
 * CONSTRUCTIBLE, the review gate opens, and the project issues drawings for construction of a
 * building in which eight columns have no design at all. Nothing in that chain states a lie; the
 * gate simply never asked how much of the structure the drawing covers.
 *
 * That is the same defect `constructibility.ts` was written to fix, one level up. There it was
 * "an assignment exists" standing in for "this can be built". Here it is "what was drawn is
 * sound" standing in for "the structure is designed".
 *
 * ── The three claims, and why they must stay separate ──────────────
 *
 * | claim | question | evidence |
 * |---|---|---|
 * | technical detailing | is there anything to draw? | `detailingReadiness.ready` |
 * | provisional proposal | is what was drawn coherent? | the fifteen conditions |
 * | construction documentation | is what was drawn the WHOLE problem? | this module |
 *
 * They are three different questions and the app needs all three answered, which is why this is
 * a MEASUREMENT and not a new lock on the Generate command. Detailing a partially designed frame
 * is an ordinary, necessary operation: it is how an engineer sees what the refused members are
 * doing to the rest of the cage, and `h1e-refused-state` asserts the command stays enabled with
 * eight refused columns in the model precisely because that workflow is real. Withholding the
 * drawing would not make the design converge; it would remove the tool used to converge it.
 *
 * What must not survive the gap is the CLAIM. So the run still runs, the geometry is still
 * produced, and the sixteenth constructibility condition refuses to certify a cage that answers
 * for part of a structure.
 *
 * ── Why an unconverged model is not a defect ───────────────────────
 *
 * The verdict it produces is `NOT_ESTABLISHED`, never `CONFLICTED`. A refused column is not a
 * clash: the geometry that exists may be perfectly correct, and the remedy is to change a
 * section and design again, not to hunt for a defect in the bars that were drawn. That is the
 * distinction `assessConstructibility` already draws, applied to the same evidence.
 *
 * Pure: no store, no runes, no i18n.
 */

import type { MemberDesignOutcome } from '../design/outcome';

/**
 * How complete this design is, over the members the model holds.
 *
 * Ordered by decreasing authority, like `DocumentReadiness`. A consumer that does not
 * understand a value must treat it as the weakest rather than the strongest.
 */
export type ConvergenceState =
  /** Every applicable member is detailed, and every one of them is verified. */
  | 'CONVERGED'
  /**
   * Every applicable member is detailed and at least one carries a proposal rather than a
   * verification. The cage is complete; part of it is not certified.
   */
  | 'PROPOSAL'
  /** Members of the model are absent from the detailing entirely. */
  | 'INCOMPLETE';

/** One reason a member of the model is not in the detailing, with the members named. */
export interface ConvergenceGap {
  kind: 'refused' | 'unsupported' | 'demandUnavailable' | 'notDesigned' | 'notDetailable';
  /** i18n key for the sentence. Translated at the boundary. */
  key: string;
  elementIds: number[];
  count: number;
}

export interface DesignConvergence {
  state: ConvergenceState;
  /** Members of the model this design must answer for. Walls excluded — PR18 owns them. */
  applicable: number;
  /** Of those, the ones the run will actually detail. */
  detailed: number;
  /**
   * Detailed members carrying a proposal rather than a certificate.
   *
   * Separate from the gaps: they ARE in the drawing, which is why they cannot be counted as
   * missing, and they are not verified, which is why `CONVERGED` is out of reach while any
   * remains.
   */
  provisional: number[];
  /** Why each absent member is absent, one entry per reason, members named. */
  gaps: ConvergenceGap[];
}

/**
 * The outcomes that mean "the design ran on this member and produced no reinforcement".
 *
 * Split by REMEDY, not by severity, because that is the only distinction that changes what the
 * engineer does next:
 *
 * - `refused` — the search covered the code-permitted envelope, or a bounded part of it, and
 *   nothing verified. Change the section.
 * - `unsupported` — this app does not implement a required check for this member. Nothing the
 *   engineer does to the model will change that answer.
 * - `demandUnavailable` — combinations, forces, material or section data are missing. Supply
 *   them and run again.
 *
 * `SECTION_INADEQUATE` and `SEARCH_EXHAUSTED` are both `refused` here although they are
 * different claims upstream — exhaustive versus bounded. The distinction governs how much the
 * engineer may conclude about feasibility, and `candidate-search.ts` keeps it for that reason;
 * it does not change that the member has no design and the next move is the section.
 */
const GAP_OF: Partial<Record<MemberDesignOutcome['outcome'], ConvergenceGap['kind']>> = {
  SECTION_INADEQUATE: 'refused',
  SEARCH_EXHAUSTED: 'refused',
  UNSUPPORTED: 'unsupported',
  DEMAND_UNAVAILABLE: 'demandUnavailable',
};

const GAP_KEY: Record<ConvergenceGap['kind'], string> = {
  refused: 'detailing.convergence.refused',
  unsupported: 'detailing.convergence.unsupported',
  demandUnavailable: 'detailing.convergence.demandUnavailable',
  notDesigned: 'detailing.convergence.notDesigned',
  notDetailable: 'detailing.convergence.notDetailable',
};

/**
 * Measure a detailing run against the model it claims to describe.
 *
 * `applicableIds` and `detailedIds` are supplied rather than re-derived so this stays pure and
 * so the answer cannot drift from `detailingReadiness`: the two must agree about which members
 * are in the drawing, and the way to guarantee that is to have one of them decide.
 */
export function assessDesignConvergence(input: {
  /** Every member the design must answer for, walls already excluded. */
  applicableIds: readonly number[];
  /** The members `runDetailing` will draw — `detailingReadiness.detailable`. */
  detailedIds: readonly number[];
  outcomes: ReadonlyMap<number, MemberDesignOutcome>;
}): DesignConvergence {
  const detailed = new Set(input.detailedIds);
  const byKind = new Map<ConvergenceGap['kind'], number[]>();
  const provisional: number[] = [];

  for (const id of input.applicableIds) {
    const outcome = input.outcomes.get(id);
    if (detailed.has(id)) {
      if (outcome?.outcome === 'PROVISIONAL_BIAXIAL') provisional.push(id);
      continue;
    }
    /**
     * A member with NO outcome has not been designed; one with an outcome this map does not
     * name was designed, produced reinforcement, and was still left out of the drawing —
     * `noStations` and `orientationSuspect` are the two ways that happens today.
     *
     * Both are reported, and separately. Collapsing them into one "missing" count would put a
     * member whose design nobody ran beside one whose design succeeded and whose geometry
     * could not be built, and those have nothing in common but the shortfall.
     */
    const kind: ConvergenceGap['kind'] = outcome
      ? GAP_OF[outcome.outcome] ?? 'notDetailable'
      : 'notDesigned';
    byKind.set(kind, [...(byKind.get(kind) ?? []), id]);
  }

  const gaps: ConvergenceGap[] = [...byKind.entries()]
    .map(([kind, ids]) => ({
      kind, key: GAP_KEY[kind], elementIds: ids.sort((a, b) => a - b), count: ids.length,
    }))
    .sort((a, b) => a.kind.localeCompare(b.kind));

  const state: ConvergenceState = gaps.length > 0
    ? 'INCOMPLETE'
    : provisional.length > 0 ? 'PROPOSAL' : 'CONVERGED';

  return {
    state,
    applicable: input.applicableIds.length,
    detailed: input.applicableIds.filter((id) => detailed.has(id)).length,
    provisional: provisional.sort((a, b) => a - b),
    gaps,
  };
}

/**
 * How many applicable members this detailing does not answer for.
 *
 * The number the sixteenth constructibility condition is measured on. Provisional members are
 * NOT counted: they are in the drawing, and the condition that refuses them a certificate is
 * `certificatesMatchGeometry`, which already does it. Counting them twice would report the same
 * shortfall under two names and send the engineer to the wrong remedy for one of them.
 */
export function undetailedMemberCount(c: DesignConvergence): number {
  return c.applicable - c.detailed;
}
