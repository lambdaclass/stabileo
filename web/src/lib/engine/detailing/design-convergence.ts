/**
 * What a detailing run is ALLOWED to be called, measured against the scope it was asked for.
 *
 * ── The hole this closes ───────────────────────────────────────────
 *
 * `detailingReadiness` answers one question — *is there anything worth drawing?* — and
 * `runDetailing` then details exactly `readiness.detailable` and nothing else. Members with no
 * verified design never enter the run: they are not in `byLevel`, not in `elementIds`, and
 * therefore not in `applicableMembers`, which `run-detailing.ts` sets to `elementIds.length`.
 *
 * The constructibility conditions are consequently measured over the SUBSET that was drawn. On a
 * frame where the design refused eight columns and verified four, the four are coordinated,
 * clash-free, reverified and certificate-matched — so the assembly reaches CONSTRUCTIBLE, the
 * review gate opens, and the project issues drawings for construction of a building in which
 * eight columns have no design at all. Nothing in that chain states a lie; the gate simply never
 * asked how much of what was ASKED FOR the drawing covers.
 *
 * ── Why the denominator is the scope and not the model ─────────────
 *
 * The first version of this measured every frame member the model held. That was wrong in a way
 * that matters more than it looks: designing beams and columns on a building that also has slabs
 * is a legitimate, complete piece of work, and a global denominator declared it permanently
 * unconverged for slabs nobody asked to design. A gate that can never be satisfied is a gate
 * people learn to route around.
 *
 * So convergence is relative to the SELECTION, and the selection is the user's:
 *
 * - a family the model has and the user did not select does not block — it is `outOfScope`,
 *   named in the claim so the claim cannot be mistaken for a whole-building one;
 * - a family the user selected that the model does not have contributes nothing, because it has
 *   no members — absence is not a shortfall;
 * - a selected family with refused, provisional, stale, unavailable or undrawable members does
 *   block, and names which;
 * - adding a family re-opens the state until that family converges, and removing one takes its
 *   members out of the denominator. Both fall out of measuring the current selection rather than
 *   being separate rules.
 *
 * ── The three claims, and why they must stay separate ──────────────
 *
 * | claim | question | evidence |
 * |---|---|---|
 * | technical detailing | is there anything to draw? | `detailingReadiness.ready` |
 * | provisional proposal | is what was drawn coherent? | the constructibility conditions |
 * | construction documentation | is the drawn scope COMPLETE, and which scope? | this module |
 *
 * They are three different questions and the app needs all three answered, which is why this is
 * a MEASUREMENT and not a new lock on the Generate command. Detailing a partly designed frame is
 * an ordinary, necessary operation: it is how an engineer sees what the refused members are
 * doing to the rest of the cage, and `h1e-refused-state` asserts the command stays enabled with
 * eight refused columns in the model precisely because that workflow is real. Withholding the
 * drawing would not make the design converge; it would remove the tool used to converge it.
 *
 * What must not survive the gap is the CLAIM. So the run still runs, the geometry is still
 * produced, and the constructibility condition refuses to certify a scope that has not closed —
 * and every claim, including the passing one, states the families it covers.
 *
 * ── Why an unconverged scope is not a defect ───────────────────────
 *
 * The verdict it produces is `NOT_ESTABLISHED`, never `CONFLICTED`. A refused column is not a
 * clash: the geometry that exists may be perfectly correct, and the remedy is to change a
 * section and design again, not to hunt for a defect in the bars that were drawn. That is the
 * distinction `assessConstructibility` already draws, applied to the same evidence.
 *
 * Pure: no store, no runes, no i18n.
 */

import type { MemberDesignOutcome } from '../design/outcome';
import { DESIGN_FAMILIES, type DesignFamily } from '../design/design-families';

/**
 * How complete this design is, over the families it was asked to cover.
 *
 * Ordered by decreasing authority, like `DocumentReadiness`. A consumer that does not
 * understand a value must treat it as the weakest rather than the strongest.
 */
export type ConvergenceState =
  /** Every member of every selected family is detailed, and every one of them is verified. */
  | 'CONVERGED'
  /**
   * Every member of the scope is detailed and at least one carries a proposal rather than a
   * verification. The cage is complete; part of it is not certified.
   */
  | 'PROPOSAL'
  /** Members of a selected family are absent from the detailing entirely. */
  | 'INCOMPLETE'
  /**
   * Nothing was asked for, or nothing selected exists in the model.
   *
   * Its own state and not a vacuous CONVERGED. "Converged over no families" is a sentence that
   * reads as success and means nothing was done, and it is the exact shape of false completeness
   * the constructibility gate exists to refuse.
   */
  | 'EMPTY_SCOPE';

/** One reason a member of a selected family is not in the detailing, with the members named. */
export interface ConvergenceGap {
  kind: 'refused' | 'unsupported' | 'demandUnavailable' | 'notDesigned' | 'notDetailable';
  /** i18n key for the sentence. Translated at the boundary. */
  key: string;
  family: DesignFamily;
  elementIds: number[];
  count: number;
}

export interface DesignConvergence {
  state: ConvergenceState;
  /** The families this run was asked to cover, in `DESIGN_FAMILIES` order. */
  scope: DesignFamily[];
  /**
   * Families the model HAS and the scope does not include.
   *
   * Carried so no claim can be read as a whole-building one. "Design converged for beams and
   * columns" and "design converged" are different sentences, and only the first is true of a
   * building with undesigned slabs in it.
   */
  outOfScope: DesignFamily[];
  /** Members of the SELECTED families this design must answer for. */
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
  /** Why each absent member is absent, one entry per reason and family, members named. */
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

/** One member of the model, with the family it belongs to. */
export interface ScopedMember {
  elementId: number;
  family: DesignFamily;
}

/**
 * Measure a detailing run against the scope it was asked to cover.
 *
 * `members` is every member of the model with its family, and `detailedIds` is what
 * `runDetailing` will draw — supplied rather than re-derived so this stays pure and so the answer
 * cannot drift from `detailingReadiness`: the two must agree about which members are in the
 * drawing, and the way to guarantee that is to have one of them decide.
 *
 * A member whose family is outside `scope` is not applicable, not a gap, and not detailed. It is
 * simply not this run's business, and its family is reported in `outOfScope` so the claim says
 * so out loud.
 */
export function assessDesignConvergence(input: {
  /** Every member the MODEL holds, with its family. Walls already excluded — PR18 owns them. */
  members: readonly ScopedMember[];
  /** The families the user selected. `designRunStore.familySelection`. */
  scope: readonly DesignFamily[];
  /** The members `runDetailing` will draw — `detailingReadiness.detailable`. */
  detailedIds: readonly number[];
  outcomes: ReadonlyMap<number, MemberDesignOutcome>;
  /**
   * Families the model holds that have no members in `members`.
   *
   * The floor families. A slab is not a `MemberContext` — the floor pass owns it — so a
   * frame-only member list cannot see that the building has any, and `outOfScope` would report
   * an empty list on exactly the building the qualifier exists for.
   *
   * Supplied by the caller from the same authority `DesignFamilyPanel` uses, which is why it is
   * families and not members: a shell becomes a slab or a wall only when the floor pass
   * classifies it, and naming individual ones here would be a second authority guessing.
   */
  alsoPresent?: readonly DesignFamily[];
}): DesignConvergence {
  const inScope = new Set(input.scope);
  const detailed = new Set(input.detailedIds);
  /** Keyed by family AND kind: "3 beams refused" and "2 columns refused" are two answers. */
  const byGap = new Map<string, ConvergenceGap>();
  const provisional: number[] = [];

  const present = new Set<DesignFamily>();
  let applicable = 0;
  let drawn = 0;

  for (const m of input.members) {
    present.add(m.family);
    if (!inScope.has(m.family)) continue;
    applicable += 1;

    const outcome = input.outcomes.get(m.elementId);
    if (detailed.has(m.elementId)) {
      drawn += 1;
      if (outcome?.outcome === 'PROVISIONAL_BIAXIAL') provisional.push(m.elementId);
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
    const key = `${m.family}:${kind}`;
    const gap = byGap.get(key)
      ?? { kind, key: GAP_KEY[kind], family: m.family, elementIds: [], count: 0 };
    gap.elementIds.push(m.elementId);
    gap.count += 1;
    byGap.set(key, gap);
  }

  const order = (f: DesignFamily) => DESIGN_FAMILIES.indexOf(f);
  const gaps = [...byGap.values()]
    .map((g) => ({ ...g, elementIds: g.elementIds.sort((a, b) => a - b) }))
    .sort((a, b) => order(a.family) - order(b.family) || a.kind.localeCompare(b.kind));

  /*
   * Only families the MODEL has. A scope that names `footing` on a building with no footings
   * adds nothing to either side of this: it is not a shortfall, because there is nothing to
   * design, and it is not out of scope, because it was selected. Absence is not a state.
   */
  for (const f of input.alsoPresent ?? []) present.add(f);
  const outOfScope = DESIGN_FAMILIES
    .filter((f) => present.has(f) && !inScope.has(f));

  const state: ConvergenceState = applicable === 0
    ? 'EMPTY_SCOPE'
    : gaps.length > 0
      ? 'INCOMPLETE'
      : provisional.length > 0 ? 'PROPOSAL' : 'CONVERGED';

  return {
    state,
    scope: DESIGN_FAMILIES.filter((f) => inScope.has(f)),
    outOfScope,
    applicable,
    detailed: drawn,
    provisional: provisional.sort((a, b) => a - b),
    gaps,
  };
}

/**
 * How many members of the SELECTED families this detailing does not answer for.
 *
 * The number the scope constructibility condition is measured on. Provisional members are NOT
 * counted: they are in the drawing, and the condition that refuses them a certificate is
 * `certificatesMatchGeometry`, which already does it. Counting them twice would report the same
 * shortfall under two names and send the engineer to the wrong remedy for one of them.
 *
 * An EMPTY_SCOPE run reports its whole (zero-member) scope as undetailed rather than zero. There
 * is no cage to certify, and `0 - 0 = 0` would read as a satisfied condition — the vacuous pass
 * this module's own state exists to name.
 */
export function undetailedScopeCount(c: DesignConvergence): number {
  return c.state === 'EMPTY_SCOPE' ? 1 : c.applicable - c.detailed;
}
