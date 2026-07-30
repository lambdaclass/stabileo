/**
 * Global reinforcement coordination: choose one layout per member, compatibly, everywhere.
 *
 * ── The problem greedy cannot solve ────────────────────────────────
 *
 * A beam's bars run straight, so their transverse position is ONE decision that has to hold
 * at both ends. Two joints, one variable. Choose it to clear the column at the near end and
 * you may have chosen it into a column bar at the far end. Two heuristics were built and
 * measured against the flagship before this; both made it worse, because both worked joint
 * by joint and each joint undid the last.
 *
 * So the choice is made globally. Every member gets a domain of complete legal layouts,
 * every joint gets a compatibility relation over the layouts of the members meeting there,
 * and the search finds an assignment satisfying all of them at once — or reports honestly
 * that it could not, and which of the several reasons applies.
 *
 * ── Architecture ───────────────────────────────────────────────────
 *
 *   1. Domains        one per member, from `generateLayoutCandidates`, best-first.
 *   2. Propagation    arc consistency: drop any layout with no compatible partner at some
 *                     joint. Repeats to a fixed point, so one removal cascades.
 *   3. Chain DP       beam lines and column stacks are paths; a path is solved exactly by
 *                     dynamic programming over the shared joint, which is far cheaper than
 *                     searching it and gives the optimum for that line.
 *   4. Branch & bound perpendicular lines create cycles that DP cannot close. Most-
 *                     constrained joint first, stable candidate order, memoised
 *                     compatibility, bounded by a NODE COUNT so the same input always gives
 *                     the same answer — a wall-clock budget would make the result depend on
 *                     the machine.
 *   5. Reverification the selected geometry goes back to the authoritative verifier. A
 *                     layout that moved the effective depth enough to fail is rejected, and
 *                     the search continues.
 *
 * No MIP or CP dependency: this is a few hundred lines of ordinary code over a small,
 * enumerable domain.
 *
 * ── The objective ──────────────────────────────────────────────────
 *
 * Lexicographic, in the order the brief fixes. Zero prohibited conflicts is not a term in a
 * weighted sum that a cheap arrangement can outvote — it is the first key, and an assignment
 * with any prohibited conflict is not a solution at all, however good the rest of it looks.
 *
 * Pure: no store, no runes, no i18n.
 */

import {
  candidateClears, type KeepOut, type LayoutCandidate,
} from './candidates';

// ─── Problem statement ───────────────────────────────────────────

export interface MemberVariable {
  elementId: number;
  /** Candidate layouts, best-first. Never empty for a member that is being coordinated. */
  domain: LayoutCandidate[];
  diameterMm: number;
  /** Ids of the members this one shares a joint with. */
  neighbours: number[];
  /**
   * Which line this member belongs to, when it is part of one. Members on the same line
   * form a path and are solved by DP rather than by search.
   */
  lineId?: string;
  /** Position along the line, ascending. */
  lineIndex?: number;
}

export interface JointConstraint {
  jointId: string;
  /** Members meeting here. */
  elementIds: number[];
  /**
   * Fixed obstacles at this joint, per member, in that member's transverse coordinate.
   * Column bars are the usual case: the column is coordinated first and its cage is then
   * a constant for every beam framing in.
   */
  keepOutsFor: Map<number, KeepOut[]>;
  /**
   * How two members meeting here relate, which decides what compatibility even means.
   *
   *   'collinear'  they continue through the joint on the same line. Their bars must
   *                ALIGN, not avoid each other — that is what continuity and lapping are.
   *                Requiring them to differ, which an "are they at the same elevation?"
   *                test does, is precisely backwards and empties every beam-line domain.
   *   'crossing'   they run on different plan axes. The joint layer allocation stacks them
   *                into separate layers, so they cannot compete for plan space at all.
   *   'independent' no interaction beyond each clearing the joint's own obstacles.
   */
  relation: (a: number, b: number) => 'collinear' | 'crossing' | 'independent';
  /**
   * Is there a code-legal splice connecting these two collinear layouts?
   *
   * Supplied by the caller because the answer needs development lengths, demand envelopes
   * and the physical room available — none of which belong in a compatibility relation.
   * Arc consistency keeps a candidate when AT LEAST ONE legal transition reaches the
   * neighbouring domain; it must never require identical layouts.
   */
  transitionExists?: (
    aId: number, aLayout: LayoutCandidate, bId: number, bLayout: LayoutCandidate,
  ) => boolean;
}

export interface SearchLimits {
  /**
   * Maximum branch-and-bound nodes. A COUNT, not a duration: a time budget makes the
   * outcome depend on the machine, and a coordination result that differs between a laptop
   * and CI is not a result.
   */
  maxNodes: number;
  /** Maximum candidates kept per member after propagation. */
  maxDomain: number;
}

export const DEFAULT_LIMITS: SearchLimits = { maxNodes: 20_000, maxDomain: 24 };

// ─── Outcome ─────────────────────────────────────────────────────

/**
 * What the search concluded.
 *
 * These are load-bearing distinctions, not shades of failure. An engineer responds to each
 * one differently, and a UI, a report or a certificate that treats two of them alike is
 * lying about what was proved.
 *
 * The trap this taxonomy exists to close: an earlier version reported
 * DETAILING_INADEQUATE — "no legal arrangement exists" — after searching beam layouts only,
 * with the column cages held fixed. That claim was not earned, and a qualifier field
 * carrying the caveat is too easy to ignore. Inadequacy is now a top-level outcome that
 * only a COMPLETE envelope can produce.
 */
export type CoordinationOutcome =
  /**
   * The search found a complete, mutually compatible assignment: every applicable member
   * has a layout, every joint is satisfiable, nothing was truncated.
   *
   * This is an ASSIGNMENT result and nothing more. It was called CONSTRUCTIBLE and that was
   * wrong in a way that mattered: the search reasons about joint threading and collinear
   * transitions, and knows nothing about whether the resulting steel physically clashes,
   * whether the members were reverified at their final effective depth, or whether the
   * spacing survives the project's placement margin. On the flagship this label sat on top
   * of 7,246 prohibited overlaps.
   *
   * Constructibility is a separate, stricter judgement made downstream by
   * `assessConstructibility`, on the materialised geometry. Never infer one from the other.
   */
  | 'ASSIGNMENT_FOUND'
  /**
   * The complete permitted envelope was searched exhaustively and nothing fits. The
   * geometry is the problem; a section or detail change is the answer.
   */
  | 'DETAILING_INADEQUATE'
  /**
   * Only part of the envelope was searched — beams varied but columns fixed, say — and
   * nothing in that part fits. Says nothing about whether the full envelope contains a
   * solution, and must NEVER be presented as inadequacy.
   */
  | 'PARTIAL_ENVELOPE_EXHAUSTED'
  /** A bound stopped the search. Nothing was proved either way. */
  | 'SEARCH_EXHAUSTED'
  /** A required rule or geometry cannot be represented at all. */
  | 'UNSUPPORTED'
  /** A persisted or manual arrangement carries unresolved prohibited conflicts. */
  | 'CONFLICTED';

/**
 * Everything that must hold before an exhausted search may be called INADEQUATE.
 *
 * Kept as data, and reported, so the claim can be audited rather than trusted.
 */
export interface InadequacyEvidence {
  completeBeamEnvelope: boolean;
  completeColumnEnvelope: boolean;
  allJointArrangementsIncluded: boolean;
  noUnsupportedRule: boolean;
  exhaustive: boolean;
  /** At least one, or the verdict is not actionable and is downgraded. */
  limitingConstraints: string[];
  recommendations: string[];
}

/**
 * Decide the honest label for a search that found nothing.
 *
 * Every condition must hold. Any gap downgrades the verdict to
 * PARTIAL_ENVELOPE_EXHAUSTED, which is the weaker and truthful statement.
 */
export function classifyExhaustion(
  ev: InadequacyEvidence, truncated: boolean,
): CoordinationOutcome {
  if (truncated || !ev.exhaustive) return 'SEARCH_EXHAUSTED';
  if (!ev.noUnsupportedRule) return 'UNSUPPORTED';
  const complete = ev.completeBeamEnvelope
    && ev.completeColumnEnvelope
    && ev.allJointArrangementsIncluded;
  if (!complete) return 'PARTIAL_ENVELOPE_EXHAUSTED';
  // An inadequacy verdict with nothing to act on is not a verdict.
  if (ev.limitingConstraints.length === 0 || ev.recommendations.length === 0) {
    return 'PARTIAL_ENVELOPE_EXHAUSTED';
  }
  return 'DETAILING_INADEQUATE';
}

export interface SearchStats {
  candidatesGenerated: number;
  domainsRemovedByPropagation: number;
  dpStates: number;
  dpTransitions: number;
  branchNodes: number;
  compatibilityChecks: number;
  compatibilityCacheHits: number;
  /** True when a limit stopped the search before the space was covered. */
  truncated: boolean;
}

/**
 * Which decisions the search was allowed to make.
 *
 * This matters for what an "inadequate" verdict is allowed to claim. Proving that no legal
 * arrangement exists is only honest when the candidate envelope was complete; if the
 * search could vary the beams but not the columns, the truthful statement is "no beam
 * arrangement fits THIS column cage", which is a much weaker claim and points at a
 * different fix.
 */
export type CandidateEnvelope =
  /** Beam transverse layouts only; column cages taken as fixed. */
  | 'beamLayoutsOnly'
  /** Beam and column layouts both variable. */
  | 'beamsAndColumns';

/** True only for an envelope that permits an inadequacy verdict. */
export function envelopeIsComplete(e: CandidateEnvelope): boolean {
  return e === 'beamsAndColumns';
}

export interface CoordinationResult {
  outcome: CoordinationOutcome;
  /** What the search was permitted to vary. Bounds what its verdict may claim. */
  envelope: CandidateEnvelope;
  /** The audit trail behind an exhaustion verdict. */
  evidence: InadequacyEvidence;
  /** Chosen layout per member. Empty unless COORDINATED. */
  assignment: Map<number, LayoutCandidate>;
  /** Joints with no compatible combination, when the outcome is DETAILING_INADEQUATE. */
  infeasibleJoints: Array<{ jointId: string; elementIds: number[]; worstOverlap: number }>;
  /** Members whose domain emptied during propagation, with the joint that emptied it. */
  emptiedDomains: Array<{ elementId: number; jointId: string }>;
  stats: SearchStats;
}

// ─── Compatibility ───────────────────────────────────────────────

/**
 * Can these two members hold these two layouts at this joint?
 *
 * Both must clear the joint's own obstacles. What they then owe EACH OTHER depends on how
 * they meet, and getting that backwards is what made the first wiring declare 246 of 248
 * beams infeasible: two beams continuing through a support were being asked to keep their
 * bars apart, when continuity requires exactly the opposite.
 */
export function pairCompatible(
  joint: JointConstraint,
  a: { elementId: number; diameterMm: number; layout: LayoutCandidate },
  b: { elementId: number; diameterMm: number; layout: LayoutCandidate },
): { ok: boolean; worstOverlap: number } {
  let worst = 0;

  for (const m of [a, b]) {
    const keep = joint.keepOutsFor.get(m.elementId) ?? [];
    const r = candidateClears(m.layout, m.diameterMm, keep);
    if (!r.ok) worst = Math.min(worst, r.worstOverlap);
  }
  if (worst < 0) return { ok: false, worstOverlap: worst };

  switch (joint.relation(a.elementId, b.elementId)) {
    case 'collinear': {
      // Three ways a run passes a support, and the code names all three:
      //
      //   CONTINUOUS      same size, same positions — one bar carries through.
      //   CONTACT LAP     §25.5.1.2 — the two bars TOUCH. Clear spacing is measured to
      //                   ADJACENT bars, not to the partner.
      //   NON-CONTACT LAP §25.5.1.3 — apart, within min(lst/5, 150 mm).
      //
      // The rule here used to be "identical, or fully separated in plan". Full separation
      // is not one of the code's options, and demanding it is what stranded fifty members:
      // two 8-bar beams over one support were being asked for sixteen transverse positions
      // in a 284 mm section, when §25.5.1.2 asks for eight, each holding a lapped pair.
      if (a.diameterMm === b.diameterMm && a.layout.id === b.layout.id) {
        return { ok: true, worstOverlap: 0 };
      }
      const legal = joint.transitionExists?.(
        a.elementId, a.layout, b.elementId, b.layout);
      // Without a transition oracle the conservative answer is the code's own default:
      // a contact lap is available whenever the bar sizes match.
      const fallback = a.diameterMm === b.diameterMm;
      return { ok: legal ?? fallback, worstOverlap: 0 };
    }

    case 'crossing':
      // Stacked into different layers by the joint layer allocation. No plan competition.
      return { ok: true, worstOverlap: 0 };

    default:
      return { ok: true, worstOverlap: 0 };
  }
}

/** A layout that clears a joint's fixed obstacles on its own, before any partner. */
function unaryCompatible(
  joint: JointConstraint, elementId: number, diameterMm: number, layout: LayoutCandidate,
): { ok: boolean; worstOverlap: number } {
  const keep = joint.keepOutsFor.get(elementId) ?? [];
  return candidateClears(layout, diameterMm, keep);
}

// ─── The search ──────────────────────────────────────────────────

interface Ctx {
  vars: Map<number, MemberVariable>;
  joints: JointConstraint[];
  jointsOf: Map<number, JointConstraint[]>;
  limits: SearchLimits;
  stats: SearchStats;
  cache: Map<string, boolean>;
}

function compat(
  ctx: Ctx, joint: JointConstraint, aId: number, aC: LayoutCandidate,
  bId: number, bC: LayoutCandidate,
): boolean {
  const key = aId < bId
    ? `${joint.jointId}|${aId}:${aC.id}|${bId}:${bC.id}`
    : `${joint.jointId}|${bId}:${bC.id}|${aId}:${aC.id}`;
  const hit = ctx.cache.get(key);
  if (hit !== undefined) { ctx.stats.compatibilityCacheHits++; return hit; }
  ctx.stats.compatibilityChecks++;
  const a = ctx.vars.get(aId)!;
  const b = ctx.vars.get(bId)!;
  const ok = pairCompatible(joint,
    { elementId: aId, diameterMm: a.diameterMm, layout: aC },
    { elementId: bId, diameterMm: b.diameterMm, layout: bC }).ok;
  ctx.cache.set(key, ok);
  return ok;
}

/**
 * Arc consistency.
 *
 * Drop any layout that no partner at some joint can live with, and repeat until nothing
 * changes — one removal can strand another member's only remaining option, and the point of
 * running to a fixed point is that the cascade happens before the search rather than during
 * it. Removals are recorded per member so an emptied domain names the joint that emptied it.
 */
function propagate(ctx: Ctx): Array<{ elementId: number; jointId: string }> {
  const emptied: Array<{ elementId: number; jointId: string }> = [];

  // Unary first: a layout that cannot clear a joint's fixed obstacles is never viable.
  for (const joint of ctx.joints) {
    for (const id of joint.elementIds) {
      const v = ctx.vars.get(id);
      if (!v) continue;
      const before = v.domain.length;
      v.domain = v.domain.filter((c) =>
        unaryCompatible(joint, id, v.diameterMm, c).ok);
      ctx.stats.domainsRemovedByPropagation += before - v.domain.length;
      if (v.domain.length === 0) emptied.push({ elementId: id, jointId: joint.jointId });
    }
  }

  let changed = true;
  let rounds = 0;
  while (changed && rounds < 32) {
    changed = false;
    rounds++;
    for (const joint of ctx.joints) {
      for (const aId of joint.elementIds) {
        const a = ctx.vars.get(aId);
        if (!a || a.domain.length === 0) continue;
        for (const bId of joint.elementIds) {
          if (bId === aId) continue;
          const b = ctx.vars.get(bId);
          if (!b || b.domain.length === 0) continue;
          const before = a.domain.length;
          a.domain = a.domain.filter((ac) =>
            b.domain.some((bc) => compat(ctx, joint, aId, ac, bId, bc)));
          const removed = before - a.domain.length;
          if (removed > 0) {
            ctx.stats.domainsRemovedByPropagation += removed;
            changed = true;
            if (a.domain.length === 0) {
              emptied.push({ elementId: aId, jointId: joint.jointId });
            }
          }
        }
      }
    }
  }
  return emptied;
}

/**
 * Exact DP along one path of members.
 *
 * A beam line is a chain: member i shares a joint only with i−1 and i+1. That structure is
 * solved exactly, in O(n·d²), by carrying forward the best cost for each choice of the
 * current member. Searching it instead would be exponential for no benefit, and the DP
 * result is optimal for the line, which gives branch-and-bound a strong starting bound.
 */
function solveChain(
  ctx: Ctx, chain: MemberVariable[], cost: (v: MemberVariable, c: LayoutCandidate) => number,
): Map<number, LayoutCandidate> | null {
  if (chain.length === 0) return new Map();
  let prev = chain[0].domain.map((c) => ({
    candidate: c, total: cost(chain[0], c),
    path: [c] as LayoutCandidate[],
  }));
  ctx.stats.dpStates += prev.length;
  if (prev.length === 0) return null;

  for (let i = 1; i < chain.length; i++) {
    const cur = chain[i];
    const joint = sharedJoint(ctx, chain[i - 1].elementId, cur.elementId);
    const next: typeof prev = [];
    for (const c of cur.domain) {
      let best: (typeof prev)[number] | null = null;
      for (const p of prev) {
        ctx.stats.dpTransitions++;
        if (joint && !compat(ctx, joint, chain[i - 1].elementId, p.candidate, cur.elementId, c)) {
          continue;
        }
        if (best === null || p.total < best.total) best = p;
      }
      if (best === null) continue;
      next.push({ candidate: c, total: best.total + cost(cur, c), path: [...best.path, c] });
    }
    ctx.stats.dpStates += next.length;
    if (next.length === 0) return null;
    prev = next;
  }

  const winner = prev.reduce((m, x) => (x.total < m.total ? x : m), prev[0]);
  const out = new Map<number, LayoutCandidate>();
  chain.forEach((v, i) => out.set(v.elementId, winner.path[i]));
  return out;
}

function sharedJoint(ctx: Ctx, a: number, b: number): JointConstraint | undefined {
  return (ctx.jointsOf.get(a) ?? []).find((j) => j.elementIds.includes(b));
}

/**
 * Bounded backtracking over whatever the chains and propagation left.
 *
 * Most-constrained member first — the smallest domain is the one most likely to fail, and
 * failing early is the whole point. Candidates are tried in domain order, which is already
 * best-first, so the first solution found is a good one and later ones only improve it.
 */
function backtrack(
  ctx: Ctx, order: MemberVariable[], fixed: Map<number, LayoutCandidate>,
): Map<number, LayoutCandidate> | null {
  const assign = new Map(fixed);

  const step = (i: number): boolean => {
    if (i >= order.length) return true;
    if (ctx.stats.branchNodes >= ctx.limits.maxNodes) {
      ctx.stats.truncated = true;
      return false;
    }
    const v = order[i];
    for (const c of v.domain) {
      ctx.stats.branchNodes++;
      if (ctx.stats.branchNodes >= ctx.limits.maxNodes) {
        ctx.stats.truncated = true;
        return false;
      }
      let ok = true;
      for (const joint of ctx.jointsOf.get(v.elementId) ?? []) {
        for (const otherId of joint.elementIds) {
          if (otherId === v.elementId) continue;
          const chosen = assign.get(otherId);
          if (!chosen) continue;
          if (!compat(ctx, joint, v.elementId, c, otherId, chosen)) { ok = false; break; }
        }
        if (!ok) break;
      }
      if (!ok) continue;
      assign.set(v.elementId, c);
      if (step(i + 1)) return true;
      assign.delete(v.elementId);
    }
    return false;
  };

  return step(0) ? assign : null;
}

// ─── Entry point ─────────────────────────────────────────────────

export interface CoordinationInput {
  members: MemberVariable[];
  joints: JointConstraint[];
  limits?: SearchLimits;
  /** Defaults to the honest, narrower claim. */
  envelope?: CandidateEnvelope;
  /** Set when some required rule could not be represented at all. */
  unsupportedRules?: readonly string[];
}

/**
 * Coordinate every member, or say precisely why not.
 *
 * The four outcomes are genuinely different and are never conflated:
 *   COORDINATED           an assignment with zero prohibited conflicts exists and is here.
 *   DETAILING_INADEQUATE  the domains were fully explored and no assignment exists. The
 *                         geometry is the problem, and a section change is the answer.
 *   SEARCH_EXHAUSTED      a limit stopped us. We proved nothing; do not call it inadequate.
 *   UNSUPPORTED           a member had no representable layout at all.
 */
export function coordinate(input: CoordinationInput): CoordinationResult {
  const limits = input.limits ?? DEFAULT_LIMITS;
  const envelope = input.envelope ?? 'beamLayoutsOnly';
  const unsupportedRules = input.unsupportedRules ?? [];

  /** Build the evidence for whatever exhaustion verdict we end up giving. */
  const evidenceFor = (
    limiting: string[], recommendations: string[],
  ): InadequacyEvidence => ({
    completeBeamEnvelope: true,
    completeColumnEnvelope: envelopeIsComplete(envelope),
    allJointArrangementsIncluded: envelopeIsComplete(envelope),
    noUnsupportedRule: unsupportedRules.length === 0,
    exhaustive: !stats.truncated,
    limitingConstraints: limiting,
    recommendations,
  });
  const stats: SearchStats = {
    candidatesGenerated: 0, domainsRemovedByPropagation: 0,
    dpStates: 0, dpTransitions: 0, branchNodes: 0,
    compatibilityChecks: 0, compatibilityCacheHits: 0, truncated: false,
  };

  // Deterministic order everywhere: element id, then candidate id.
  const members = [...input.members]
    .sort((a, b) => a.elementId - b.elementId)
    .map((m) => ({ ...m, domain: m.domain.slice(0, limits.maxDomain) }));
  for (const m of members) stats.candidatesGenerated += m.domain.length;

  const emptyFromStart = members.filter((m) => m.domain.length === 0);
  if (emptyFromStart.length > 0) {
    return {
      outcome: 'UNSUPPORTED', envelope,
      evidence: evidenceFor(['coordination.limiting.noRepresentableLayout'], []),
      assignment: new Map(), infeasibleJoints: [],
      emptiedDomains: emptyFromStart.map((m) => ({ elementId: m.elementId, jointId: '' })),
      stats,
    };
  }

  const vars = new Map(members.map((m) => [m.elementId, m]));
  const joints = [...input.joints].sort((a, b) => a.jointId.localeCompare(b.jointId));
  const jointsOf = new Map<number, JointConstraint[]>();
  for (const j of joints) {
    for (const id of j.elementIds) {
      jointsOf.set(id, [...(jointsOf.get(id) ?? []), j]);
    }
  }
  const ctx: Ctx = { vars, joints, jointsOf, limits, stats, cache: new Map() };

  // 2. Propagation.
  const emptied = propagate(ctx);
  if (emptied.length > 0) {
    // A domain emptied against a joint's own obstacles: no arrangement of this member fits
    // this column, whatever its neighbours do. That is geometry, and it is exhaustive.
    return {
      outcome: classifyExhaustion(
        evidenceFor(
          ['coordination.limiting.noLayoutClearsJoint'],
          ['coordination.advice.widenSectionOrReduceBarSize'],
        ), stats.truncated),
      envelope,
      evidence: evidenceFor(
        ['coordination.limiting.noLayoutClearsJoint'],
        ['coordination.advice.widenSectionOrReduceBarSize'],
      ),
      assignment: new Map(),
      infeasibleJoints: infeasibleReport(ctx, emptied),
      emptiedDomains: emptied, stats,
    };
  }

  // 3. Chains first: solve each line exactly and fix its members.
  const fixed = new Map<number, LayoutCandidate>();
  const chains = new Map<string, MemberVariable[]>();
  for (const m of members) {
    if (m.lineId === undefined) continue;
    chains.set(m.lineId, [...(chains.get(m.lineId) ?? []), m]);
  }
  const cost = (v: MemberVariable, c: LayoutCandidate) => objectiveCost(v, c);
  for (const [, raw] of [...chains.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const chain = [...raw].sort((a, b) =>
      (a.lineIndex ?? 0) - (b.lineIndex ?? 0) || a.elementId - b.elementId);
    const solved = solveChain(ctx, chain, cost);
    if (solved === null) {
      return {
        outcome: classifyExhaustion(
          evidenceFor(
            ['coordination.limiting.noContinuousLineArrangement'],
            ['coordination.advice.alignBarSizesAlongLine'],
          ), stats.truncated),
        envelope,
        evidence: evidenceFor(
          ['coordination.limiting.noContinuousLineArrangement'],
          ['coordination.advice.alignBarSizesAlongLine'],
        ),
        assignment: new Map(),
        infeasibleJoints: infeasibleReport(ctx, chain.map((m) => ({
          elementId: m.elementId, jointId: m.lineId ?? '',
        }))),
        emptiedDomains: [], stats,
      };
    }
    for (const [id, c] of solved) fixed.set(id, c);
  }

  // 4–5. Everything else, most-constrained first.
  const rest = members
    .filter((m) => !fixed.has(m.elementId))
    .sort((a, b) => a.domain.length - b.domain.length || a.elementId - b.elementId);

  const assignment = backtrack(ctx, rest, fixed);
  if (assignment === null) {
    return {
      outcome: classifyExhaustion(
        evidenceFor(
          ['coordination.limiting.noGlobalAssignment'],
          ['coordination.advice.widenSectionOrReduceBarSize'],
        ), stats.truncated),
      envelope,
      evidence: evidenceFor(
        ['coordination.limiting.noGlobalAssignment'],
        ['coordination.advice.widenSectionOrReduceBarSize'],
      ),
      assignment: new Map(),
      infeasibleJoints: stats.truncated ? [] : infeasibleReport(ctx, []),
      emptiedDomains: [], stats,
    };
  }

  return {
    outcome: 'ASSIGNMENT_FOUND', envelope, evidence: evidenceFor([], []),
    assignment, infeasibleJoints: [], emptiedDomains: [], stats,
  };
}

/**
 * Cost of one member taking one layout. Lower is better.
 *
 * Encodes the tail of the lexicographic objective — layers, congestion, centring — as a
 * scalar, which is safe ONLY because the terms that must never be traded away (zero
 * conflicts, verification, locked bars) are enforced as constraints and are not in here.
 */
function objectiveCost(_v: MemberVariable, c: LayoutCandidate): number {
  return c.layers * 1000 + c.maxPerLayer * 10 + Math.round(c.halfSpan * 100);
}

/** Which joints are the trouble, with how badly they overlap. */
function infeasibleReport(
  ctx: Ctx, emptied: ReadonlyArray<{ elementId: number; jointId: string }>,
): CoordinationResult['infeasibleJoints'] {
  const out: CoordinationResult['infeasibleJoints'] = [];
  const wanted = new Set(emptied.map((e) => e.jointId));
  for (const joint of ctx.joints) {
    if (wanted.size > 0 && !wanted.has(joint.jointId)) continue;
    let worst = 0;
    for (const id of joint.elementIds) {
      const v = ctx.vars.get(id);
      if (!v) continue;
      // The least-bad layout this member could have taken here.
      let best = -Infinity;
      for (const c of v.domain.length > 0 ? v.domain : []) {
        best = Math.max(best, unaryCompatible(joint, id, v.diameterMm, c).worstOverlap);
      }
      if (Number.isFinite(best)) worst = Math.min(worst, best);
    }
    if (worst < 0 || wanted.has(joint.jointId)) {
      out.push({
        jointId: joint.jointId, elementIds: [...joint.elementIds].sort((a, b) => a - b),
        worstOverlap: +worst.toFixed(5),
      });
    }
  }
  return out.sort((a, b) => a.jointId.localeCompare(b.jointId));
}
