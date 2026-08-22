/**
 * What the app is actually able to say about each member, in one word.
 *
 * ── Why this is its own module ─────────────────────────────────────
 *
 * Two halves of the answer live in two places that must not be merged. The SCENE knows
 * whether a member has steel in it, and it knows that because it is a projection of the
 * document — it reads nothing else and must keep reading nothing else. The DESIGN RUN knows
 * whether the member was verified, refused, or never reached, and that lives on an outcome
 * the document does not carry.
 *
 * Joining them inside the scene would make the projection depend on live design state.
 * Joining them inside a Svelte component would make the rule untestable and would let two
 * screens answer the same question differently. So the join happens here: pure, given both
 * halves explicitly, returning one status per element.
 *
 * ── Why "has steel" is not the whole answer ────────────────────────
 *
 * Because "no steel" has at least four different causes and they need different actions:
 *
 *   - the design was refused              → change the section, or design by hand
 *   - a required check is not implemented → nothing you do to the section will help
 *   - the member was never evaluated      → run the design
 *   - the member was designed but has no
 *     modellable geometry (a wall with no
 *     start/end, whose checks are real
 *     and whose bar schedule cannot exist) → supply the geometry
 *
 * A view that collapses those into "grey" is a view that cannot be acted on, and one that
 * omits them — which is what this app did before — is worse.
 *
 * Pure: no store, no runes, no i18n, no DOM.
 */

import type { SceneModel } from './scene-model';

/** The seven states the workspace distinguishes, worst last. */
export type ElementStatus =
  /** Designed, verified, and physical bars exist in the document. */
  | 'MODELLED'
  /** Verified, but no bar geometry was produced — the checks stand, the schedule cannot. */
  | 'DESIGNED_NOT_MODELLED'
  /**
   * Bars exist and are a PROPOSAL: the primary axis was designed and verified, the secondary
   * axis is not evaluated by any verifier in this app.
   *
   * Deliberately its own state and not a shade of MODELLED. The two look identical in a
   * viewport — concrete with steel inside it — and mean opposite things to somebody about to
   * issue a drawing, so they may never share a colour, a count or a filter.
   */
  | 'PROVISIONAL'
  /** A required check is not implemented for this member. No arrangement can pass. */
  | 'UNSUPPORTED'
  /** The design ran and could not find a passing arrangement. */
  | 'REFUSED'
  /** The verification ran and the member does not pass. */
  | 'FAILED'
  /** No design outcome exists for this member at all. */
  | 'NOT_EVALUATED';

/**
 * Ordered by how much the user needs to look at it, not alphabetically.
 *
 * The workspace lists and colours in this order, so the states that need attention are never
 * buried under the ones that do not.
 */
export const ELEMENT_STATUS_ORDER: readonly ElementStatus[] = [
  'FAILED', 'UNSUPPORTED', 'REFUSED', 'PROVISIONAL', 'DESIGNED_NOT_MODELLED',
  'NOT_EVALUATED', 'MODELLED',
];

/**
 * States whose members must never be presented as finished work.
 *
 * One list, consumed by the viewport legend, the drawing sheets, the schedule and the report,
 * so "not for construction" cannot be true on one projection and forgotten on another.
 */
export const NOT_FOR_CONSTRUCTION_STATUSES: readonly ElementStatus[] = [
  'FAILED', 'UNSUPPORTED', 'REFUSED', 'PROVISIONAL',
];

/** The half of the answer that comes from the design run, per element. */
export interface DesignOutcomeSummary {
  /** The outcome kind, verbatim. Absent means the member was never designed. */
  outcome?: 'VERIFIED' | 'PROVISIONAL_BIAXIAL' | 'SECTION_INADEQUATE'
    | 'DEMAND_UNAVAILABLE' | 'SEARCH_EXHAUSTED' | 'UNSUPPORTED';
  /**
   * Whether the member's provided reinforcement passes verification, when that ran.
   *
   * `none` and `notRun` both mean "no verdict" and are treated as such: only `fail` changes
   * the status, and it changes it to FAILED. Reading absence as a pass is how a member with
   * no verification comes to look verified.
   */
  verificationStatus?: 'ok' | 'warn' | 'fail' | 'notRun' | 'none';
  /**
   * What the FAILING checks of that verification were limited by, when it failed.
   *
   * Needed to tell two failures apart that are otherwise identical from here. A member
   * carrying a PROVISIONAL_BIAXIAL proposal genuinely fails the authoritative verifier — on
   * the biaxial refusal, which is the same fact the outcome already names, better. A member
   * that ALSO fails on flexure or shear is a different situation and must not inherit the
   * proposal's calmer state.
   *
   * Empty or absent means the caller did not supply it, which is read as "no idea", not as
   * "nothing else failed".
   */
  verificationLimiting?: readonly string[];
  /** The constraints that stopped it, for the reason line. */
  limiting?: readonly string[];
  /**
   * Translation key of the design's own first reason, e.g. `design.reason.secondaryAxisUnchecked`.
   *
   * The KEY, not the sentence: 117 members refused for one shared cause must be recognisable
   * as one cause, and the rendered sentences differ from each other (they carry the member id
   * and its own ratio). Grouping on rendered text would produce 117 groups of one.
   */
  reasonKey?: string;
  /**
   * `secondaryRatio` from the design axes, when the run resolved them.
   *
   * Carried so a grouped reason can state the RANGE it covers. "117 members refused" invites
   * the suspicion that the threshold is being tripped by numerical noise; "between 11 % and
   * 266 % of the primary moment" answers that on sight, and answers it with the model's own
   * numbers rather than with reassurance.
   */
  secondaryRatio?: number;
}

/**
 * What a member's TOP steel is, orthogonal to its status.
 *
 * Named for the MEMBER rather than for the provision, because `beam-top-steel.ts` already has a
 * `TopSteelProvision` and it is a different thing: that one is the rule's answer for ONE support,
 * with its clauses, its areas and its blockage. This is the one word a table puts in a row.
 *
 * ── Why this is not a new `ElementStatus` ──────────────────────────
 *
 * A beam carrying the constructive pair §25.7.1.2 asks for is still whatever the design made
 * it: a PROVISIONAL_BIAXIAL proposal stays a proposal, a VERIFIED member stays verified. Adding
 * `TOP_HANGER_PROVISIONAL` to `ElementStatus` would put the two facts in one field, and a field
 * that can only hold one of them has to drop the other — which on the 7-storey building means
 * 62 proposals quietly reported as something else.
 *
 * So it rides alongside. A filter can ask for either, a table can show both, and neither can
 * hide the other.
 *
 * `hangerProvisional` — the top bars exist because the cage needs something in its bends, and
 *    their DIAMETER is this app's choice rather than a clause's. Never a moment capacity.
 * `resistant` — the top bars were sized against a hogging moment and checked.
 * `none` — the member has no longitudinal top steel at all.
 */
export type MemberTopSteel = 'resistant' | 'hangerProvisional' | 'none';

export interface ElementStatusEntry {
  elementId: number;
  status: ElementStatus;
  /** True when the scene holds at least one bar owned by this element. */
  hasSteel: boolean;
  /**
   * What this member's top steel is — read from the SCENE, like `hasSteel`.
   *
   * The scene is the projection of the document, so a bar marked `stirrupHanger` there was
   * marked so by the generator that built it. Re-deriving the role from an outcome would be a
   * second opinion about a decision already made and recorded.
   */
  topSteel: MemberTopSteel;
  /** What the design run said, carried through unchanged. */
  outcome?: DesignOutcomeSummary['outcome'];
  limiting: readonly string[];
  /** The design's own reason key, carried through unchanged. */
  reasonKey?: string;
  /** Secondary/primary moment ratio, carried through unchanged. */
  secondaryRatio?: number;
}

/**
 * One cause, and every member it accounts for.
 *
 * ── Why the workspace needs this and not just counts ───────────────
 *
 * On the 7-storey example the design refuses 117 of the 119 beams, all for the SAME reason:
 * the verifier does not implement the biaxial check, and every one of those beams carries
 * real bending about both axes. The workspace already held that sentence — but only per
 * member, and only while that member was selected. So the screen said "UNSUPPORTED 117",
 * which reads as 117 separate problems, or as a broken viewer, and the user's next move was
 * to click 117 members to find out it was one problem all along.
 *
 * The distinction this makes possible is the one the whole investigation turned on: a
 * legitimate, uniform limitation of the biaxial design path is a very different report from
 * 117 members whose steel went missing somewhere between the design and the screen. Stating
 * the shared cause and the span of ratios behind it is what lets a reviewer tell them apart
 * without opening a single member.
 */
export interface StatusReasonGroup {
  status: ElementStatus;
  /** Translation key shared by every member in the group. */
  reasonKey: string;
  count: number;
  /** Ascending. The workspace uses these to isolate the group in the viewport. */
  elementIds: number[];
  /** Span of `secondaryRatio` across the group, when any member carried one. */
  ratioRange?: { min: number; max: number };
}

/**
 * Group a report's members by (state, reason), commonest first.
 *
 * Members whose outcome carried no reason are omitted rather than bucketed under a
 * placeholder: a group called "unknown" is not a cause and would dilute the ones that are.
 * They remain visible in the per-state counts, which are computed from every member.
 */
export function summariseStatusReasons(
  entries: readonly ElementStatusEntry[],
): StatusReasonGroup[] {
  const byKey = new Map<string, StatusReasonGroup>();
  for (const e of entries) {
    if (!e.reasonKey) continue;
    const k = `${e.status}::${e.reasonKey}`;
    let g = byKey.get(k);
    if (!g) {
      g = { status: e.status, reasonKey: e.reasonKey, count: 0, elementIds: [] };
      byKey.set(k, g);
    }
    g.count += 1;
    g.elementIds.push(e.elementId);
    if (typeof e.secondaryRatio === 'number') {
      g.ratioRange = g.ratioRange
        ? { min: Math.min(g.ratioRange.min, e.secondaryRatio), max: Math.max(g.ratioRange.max, e.secondaryRatio) }
        : { min: e.secondaryRatio, max: e.secondaryRatio };
    }
  }
  const groups = [...byKey.values()];
  for (const g of groups) g.elementIds.sort((a, b) => a - b);
  // Commonest first, then by state severity, then by key — a total order, so the panel does
  // not reshuffle between renders of the same model.
  return groups.sort((a, b) =>
    b.count - a.count
    || ELEMENT_STATUS_ORDER.indexOf(a.status) - ELEMENT_STATUS_ORDER.indexOf(b.status)
    || a.reasonKey.localeCompare(b.reasonKey));
}

/**
 * Decide one member's status.
 *
 * Deliberately pessimistic in the same way `documentReadiness` is: a member only reaches
 * MODELLED when BOTH halves agree — verified by the design AND carrying steel in the
 * document. Everything else names the specific gap rather than falling through to a generic
 * "not ready".
 */
/**
 * The failing checks' constraints, from a provided-reinforcement verdict.
 *
 * One derivation, because two callers need it and they used to be one: the join that feeds
 * `statusOf` built it inline, and when the design surface needed the same fact it had no way
 * to ask for it without writing the filter a second time. A second reading of "what failed" is
 * how one screen comes to call a member a proposal while another calls it a failure.
 */
export function failingLimits(
  checks: ReadonlyArray<{ status: string; limiting?: unknown }> | undefined,
): string[] {
  return (checks ?? [])
    .filter((c) => c.status === 'fail')
    .flatMap((c) => (c.limiting ? [String(c.limiting)] : []));
}

/**
 * Whether a member's verification failure is ENTIRELY the biaxial limitation it already
 * declares.
 *
 * ── Why this is one exported predicate ─────────────────────────────
 *
 * A PROVISIONAL_BIAXIAL member's steel fails the authoritative verifier BY CONSTRUCTION: the
 * verifier pushes the biaxial refusal for exactly these members, which is the same fact the
 * outcome already carries and names far better. Every surface that reports a status has to
 * make the same exception or the app contradicts itself — and it did, for a while, in both
 * directions: the detailing panel said FAILED until that was fixed, and the design summary bar
 * went on saying `fail` for a release after it.
 *
 * The exception is narrow on purpose and this is the only place it is stated. It applies only
 * when EVERY failing check is the biaxial one. A proposal that also fails on flexure or shear
 * is a different situation and stays a failure, because then something is wrong beyond the
 * known limitation. An ABSENT list reads as "no idea", not "nothing else": silence is not
 * agreement, which is why the length test is there.
 */
export function isKnownBiaxialLimitation(
  summary: DesignOutcomeSummary | undefined,
): boolean {
  return summary?.outcome === 'PROVISIONAL_BIAXIAL'
    && (summary.verificationLimiting?.length ?? 0) > 0
    && summary.verificationLimiting!.every((x) => x === 'biaxial');
}

export function statusOf(
  hasSteel: boolean, summary: DesignOutcomeSummary | undefined,
): ElementStatus {
  /**
   * A failing verification outranks everything below it — with one exception.
   *
   * Checked first because a member can carry steel, have a VERIFIED design outcome from an
   * earlier run, and still fail verification now — an edit to the section or the loads does
   * exactly that. Reporting MODELLED there would show a green member the app knows is not.
   *
   * ── The exception, and why it is not a softening ───────────────
   *
   * A PROVISIONAL_BIAXIAL member's steel fails the authoritative verifier BY CONSTRUCTION:
   * the verifier pushes the biaxial refusal for exactly these members, which is the same fact
   * the outcome already carries and names far better. Reporting FAILED there would collapse
   * every proposal into the generic failure bucket and lose the distinction the state exists
   * to make — "the primary axis was designed and verified, the secondary one is not checked"
   * versus "this member does not pass".
   *
   * The exception is narrow on purpose. It applies only when EVERY failing check is the
   * biaxial one. A proposal that also fails on flexure or shear is a different situation and
   * keeps FAILED, because then there is something wrong beyond the known limitation.
   */
  /*
   * ── And the second exception: an outcome that already explains the failure ──
   *
   * A member whose design was REFUSED also fails verification — the refusal happened precisely
   * because nothing in the code-permitted envelope verified. Testing FAILED unconditionally made
   * `REFUSED` unreachable: measured on a starved column, the design table said
   * `SEARCH_EXHAUSTED` ×8 while the rail said `failed 5 · refused 0`.
   *
   * The two states mean different remedies, which is the whole reason there are two of them —
   * this file's own header says a refusal means "change the section, or design by hand". Calling
   * it a failure sends the reader to change reinforcement that no reinforcement can fix.
   *
   * So FAILED preempts unless the outcome already names the reason. Listed explicitly rather than
   * as "anything but VERIFIED", which is what the first version of this said and which broke the
   * biaxial exception above: `PROVISIONAL_BIAXIAL` does NOT explain a flexure failure, and a
   * proposal that fails on something beyond the known limitation must stay FAILED. Two existing
   * tests caught it, which is the argument for the allowlist.
   *
   * `DEMAND_UNAVAILABLE` is not here either: a member with no demand that somehow fails
   * verification is not a case the outcome accounts for.
   *
   * Both sides stay in `NOT_FOR_CONSTRUCTION_STATUSES`, so nothing here can make a refusal read
   * as finished work.
   */
  const EXPLAINS_ITS_OWN_FAILURE = ['SEARCH_EXHAUSTED', 'SECTION_INADEQUATE', 'UNSUPPORTED'];
  const outcomeExplainsIt = summary?.outcome !== undefined
    && EXPLAINS_ITS_OWN_FAILURE.includes(summary.outcome);

  if (summary?.verificationStatus === 'fail'
    && !isKnownBiaxialLimitation(summary)
    && !outcomeExplainsIt) {
    return 'FAILED';
  }

  if (!summary?.outcome) {
    /**
     * No outcome, but steel exists.
     *
     * Reachable for footing, slab and wall steel, which is produced by the floor design run
     * rather than by the member design run and therefore has no per-element outcome. Calling
     * that NOT_EVALUATED would be false — the family record and its certificate are the
     * evidence — so the presence of steel is taken at face value here and the family
     * certificate remains the authority on whether it may be built.
     */
    return hasSteel ? 'MODELLED' : 'NOT_EVALUATED';
  }

  switch (summary.outcome) {
    case 'PROVISIONAL_BIAXIAL':
      /**
       * A proposal with no bars is not a proposal.
       *
       * `proposeOnPrimaryAxis` only returns PROVISIONAL_BIAXIAL when the primary-axis search
       * verified something, so steel should always exist — but if it did not survive
       * detailing, saying PROVISIONAL over an empty member would claim geometry the user
       * cannot see. UNSUPPORTED is what that member actually is.
       */
      return hasSteel ? 'PROVISIONAL' : 'UNSUPPORTED';
    case 'UNSUPPORTED':
      return 'UNSUPPORTED';
    case 'SECTION_INADEQUATE':
    case 'SEARCH_EXHAUSTED':
      return 'REFUSED';
    case 'DEMAND_UNAVAILABLE':
      return 'NOT_EVALUATED';
    case 'VERIFIED':
      // Verified and no bars: the checks are real and the despiece does not exist. A wall
      // with no start/end reaches exactly this state, and the floor run says so out loud.
      return hasSteel ? 'MODELLED' : 'DESIGNED_NOT_MODELLED';
  }
}

export interface ElementStatusReport {
  entries: ElementStatusEntry[];
  /** How many members are in each state, in `ELEMENT_STATUS_ORDER`. */
  counts: Record<ElementStatus, number>;
  /** The states actually present, worst first — what a filter should offer. */
  present: ElementStatus[];
  /**
   * Members whose top steel is the §25.7.1.2 pair, ascending.
   *
   * Reported on the run and not only per entry, for the same reason `provisionalMembers` is: a
   * reader must be able to ask "how many beams carry assembly bars up top" without walking
   * every member, and a caller that never opens an entry still must not be able to miss it.
   */
  hangerTopMembers: number[];
}

/**
 * Status for every member the scene draws.
 *
 * The scene's solids are the population, not the design outcomes: a member the design never
 * reached still has concrete on screen and still needs a state. Driving it the other way
 * would reintroduce the original bug, where the members without outcomes were the ones that
 * vanished.
 */
export function reportElementStatus(
  scene: SceneModel,
  outcomes: ReadonlyMap<number, DesignOutcomeSummary>,
): ElementStatusReport {
  const steelOf = new Set(scene.bars.flatMap((b) => b.elementIds));
  /**
   * TOP longitudinal steel per member, split by what it is for.
   *
   * Two filters and both earn their place. `role === 'longitudinal'` excludes the cage: a
   * stirrup carries no purpose marking and never will, and letting a transverse piece answer
   * "what is this member's top steel" is how the original defect would read as solved — 63
   * beams had 24 to 48 bars each and not one of them was main steel.
   *
   * The FACE comes from `layerId` (`e184:topRun:0`, `e184:bottom:0`), which the generator
   * writes because it knows which layer it placed each bar in. Without that filter every beam
   * with bottom bars answers `resistant`, because bottom bars are longitudinal and carry no
   * purpose either — the question would then be about the member's steel rather than its top
   * steel, and it would be answered yes for every beam in the model.
   */
  const hangerOf = new Set<number>();
  const resistantOf = new Set<number>();
  for (const b of scene.bars) {
    if (b.role !== 'longitudinal') continue;
    if (!b.layerId?.split(':')[1]?.startsWith('top')) continue;
    for (const id of b.elementIds) {
      (b.purpose === 'stirrupHanger' ? hangerOf : resistantOf).add(id);
    }
  }
  const topSteelOf = (id: number): MemberTopSteel =>
    // A member with both is `resistant`: the hangers are then part of hogging steel that WAS
    // designed, and reporting the member as hanger-provisional would understate it.
    resistantOf.has(id) ? 'resistant' : hangerOf.has(id) ? 'hangerProvisional' : 'none';
  const seen = new Set<number>();
  const entries: ElementStatusEntry[] = [];

  for (const s of scene.solids) {
    for (const id of s.elementIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      const summary = outcomes.get(id);
      const hasSteel = steelOf.has(id) || s.reinforced;
      entries.push({
        elementId: id,
        status: statusOf(hasSteel, summary),
        hasSteel,
        topSteel: topSteelOf(id),
        outcome: summary?.outcome,
        limiting: summary?.limiting ?? [],
        reasonKey: summary?.reasonKey,
        secondaryRatio: summary?.secondaryRatio,
      });
    }
  }
  entries.sort((a, b) => a.elementId - b.elementId);

  const counts = {
    MODELLED: 0, DESIGNED_NOT_MODELLED: 0, PROVISIONAL: 0, UNSUPPORTED: 0,
    REFUSED: 0, FAILED: 0, NOT_EVALUATED: 0,
  } as Record<ElementStatus, number>;
  for (const e of entries) counts[e.status] += 1;

  return {
    entries,
    counts,
    present: ELEMENT_STATUS_ORDER.filter((s) => counts[s] > 0),
    hangerTopMembers: entries
      .filter((e) => e.topSteel === 'hangerProvisional')
      .map((e) => e.elementId),
  };
}
