/**
 * What the app may say about a metallic member, and what it may never say.
 *
 * ── Why this is not `DesignOutcomeKind` ────────────────────────────
 *
 * `DesignOutcomeKind` is the result of the CONCRETE design pipeline: a bounded candidate
 * search run by a `DesignCodeAdapter` against a `MemberContext` whose material is f'c and
 * whose accepted solution is `ProvidedReinforcement`. A steel member never enters that
 * pipeline, because no steel adapter is registered — so it can never produce one of those
 * outcomes, and adding a metallic member to that union would put a state into concrete's
 * vocabulary that concrete can never emit.
 *
 * It would also collide head-on with PR #125, which is adding `PROVISIONAL_BIAXIAL` to that
 * same enum for a concrete case. Two branches widening one union is a merge conflict for no
 * benefit.
 *
 * And it is what was asked for: the states of steel and concrete stay separate.
 *
 * The two vocabularies are deliberately parallel in SHAPE — a status, a reason, an
 * invariant guard that throws — so a reader who knows one can read the other.
 *
 * ── The states ─────────────────────────────────────────────────────
 *
 * The distinction that matters most is between "nobody tried" and "something was computed
 * without an authority behind it". They look the same in a table and they are completely
 * different facts, and only the second one carries a number a user might be tempted to use.
 *
 * Pure: no store, no runes, no i18n.
 */

export const STEEL_MEMBER_STATUSES = [
  'NOT_DESIGNED',
  'EXPERIMENTAL',
  'DEMAND_UNAVAILABLE',
  'NOT_APPLICABLE',
] as const;

export type SteelMemberStatus = (typeof STEEL_MEMBER_STATUSES)[number];

/**
 * NOT_DESIGNED       recognised as metallic; no design was attempted, because no metallic
 *                    design authority is bound to this project. The honest resting state of
 *                    every steel member in the app today.
 *
 * EXPERIMENTAL       an implementation produced a number, and there is no verifiable
 *                    authority behind it: no clause map, no external benchmark, no
 *                    capability matrix. NOT a certification. Never green. Never counted as
 *                    a pass. Carries a visible warning wherever it appears, exports
 *                    included.
 *
 * DEMAND_UNAVAILABLE the member is metallic and the forces are not there — no solve, no
 *                    combinations. Distinct from the two above because the remedy is the
 *                    user's and it is obvious.
 *
 * NOT_APPLICABLE     the member is not metallic. Present so the metallic surface can say
 *                    "this is a concrete beam" instead of silently omitting it, which is
 *                    how a user comes to believe their steel is missing.
 */

/** Why a member is in the state it is in. i18n key plus params, never raw prose. */
export interface SteelReason {
  key: string;
  params?: Record<string, string | number>;
}

/**
 * A number produced without an authority behind it.
 *
 * Modelled on PR #125's `ProvisionalBasis`, deliberately: the two say the same kind of
 * thing — here is a value, and here is precisely what nobody checked — and they should read
 * the same way.
 */
export interface ExperimentalBasis {
  /** Where the number came from, e.g. `cirsoc301.js.untested`. */
  source: string;
  /** Worst demand/capacity the implementation reported. Evidence, never a certificate. */
  worstUtilization: number;
  /** Checks it says it performed. */
  checksPerformed: string[];
  /**
   * What it assumed rather than knew — every one an i18n key.
   *
   * Required and non-empty. An experimental result with nothing to disclose is either
   * validated, in which case it is not experimental, or undisclosed, which is worse.
   */
  assumptions: string[];
  /** What would have to exist for this to stop being experimental. */
  promotionKey: string;
}

export interface SteelMemberState {
  elementId: number;
  status: SteelMemberStatus;
  reasons: SteelReason[];
  /** Present ONLY when the status is EXPERIMENTAL. */
  experimental?: ExperimentalBasis;
}

/**
 * Runtime guard. Throws on any contract violation, exactly as `assertOutcomeInvariants`
 * does for concrete, so a regression cannot ship a metallic state that overclaims.
 */
export function assertSteelStateInvariants(s: SteelMemberState): void {
  const where = `element ${s.elementId}`;

  if (s.reasons.length === 0) {
    throw new Error(`${where}: ${s.status} without a reason`);
  }

  if (s.status === 'EXPERIMENTAL') {
    if (!s.experimental) throw new Error(`${where}: EXPERIMENTAL without its basis`);
    if (s.experimental.assumptions.length === 0) {
      throw new Error(`${where}: EXPERIMENTAL without a disclosed assumption`);
    }
    if (!s.experimental.promotionKey) {
      throw new Error(`${where}: EXPERIMENTAL without a stated route out of it`);
    }
    if (s.experimental.checksPerformed.length === 0) {
      throw new Error(`${where}: EXPERIMENTAL claiming a utilization with no check behind it`);
    }
  } else if (s.experimental) {
    throw new Error(`${where}: ${s.status} carries an experimental basis it cannot have earned`);
  }
}

/**
 * THE rule. No metallic status is ever a pass.
 *
 * A single function rather than a comparison spelled out at each call site, so that adding a
 * status cannot accidentally create a passing one: a new member of the union has to be
 * handled here to compile, and the only way to make it pass is to write that down.
 */
export function steelCountsAsVerified(_status: SteelMemberStatus): false {
  // Deliberately returns the literal type `false`, so a caller that tries to branch on a
  // "maybe verified" case gets a type error rather than dead code. There is no metallic
  // authority in this app; when there is one, this function is where that changes, and the
  // change will be visible in every consumer at once.
  return false;
}

/** The colour treatment a status may be shown with. Never `ok`. */
export function steelDisplayTone(status: SteelMemberStatus): 'neutral' | 'warn' | 'info' {
  switch (status) {
    case 'EXPERIMENTAL': return 'warn';
    case 'DEMAND_UNAVAILABLE': return 'info';
    case 'NOT_DESIGNED': return 'neutral';
    case 'NOT_APPLICABLE': return 'neutral';
  }
}

/** Glyph plus text, never colour alone — the rule `OutcomeBadge` already follows. */
export function steelStatusGlyph(status: SteelMemberStatus): string {
  switch (status) {
    case 'NOT_DESIGNED': return '○';
    case 'EXPERIMENTAL': return '⚗';
    case 'DEMAND_UNAVAILABLE': return '—';
    case 'NOT_APPLICABLE': return '·';
  }
}

export function steelStatusLabelKey(status: SteelMemberStatus): string {
  return `steel.status.${status}`;
}
