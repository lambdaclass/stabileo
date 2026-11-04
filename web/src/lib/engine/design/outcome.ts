/**
 * Design outcome contract.
 *
 * A member is "designed" ONLY when the reinforcement actually assigned to it has a
 * valid certificate from the authoritative, axis-correct verifier. Every other
 * result is one of four honest failure states. Nothing in this module ever lets a
 * non-VERIFIED outcome be counted as a pass.
 *
 * Pure: no store access, no side effects.
 */

import type { ProvidedReinforcement } from '../../store/model.svelte';
import type { ProvidedRebarResult } from '../station-design-forces';
import type { DesignAxes, MomentAxis, ShearAxis } from './design-axes';

export type DesignOutcomeKind =
  /** The final assigned reinforcement passes every applicable check. */
  | 'VERIFIED'
  /**
   * A PROPOSAL, produced by a check that does not cover every significant action.
   *
   * Today there is exactly one such case: a beam bending about both axes, whose secondary
   * axis this app cannot verify. The proposal is the real, authoritative design of the
   * PRIMARY axis — nothing about it is invented — and it is offered because the alternative
   * was a bare orange beam and 117 members with no geometry anywhere in the model.
   *
   * It is not a weaker VERIFIED. It carries no certificate, it is never counted as a pass,
   * it cannot satisfy the constructibility gate (which counts certificates), and every
   * projection that renders it must say what it is. See `ProvisionalBasis`.
   */
  | 'PROVISIONAL_BIAXIAL'
  /**
   * DEMONSTRATED insufficiency: the section exceeds a bound of the code that no reinforcement
   * can lift (`InsufficiencyProof`: which bound, its clause and its numbers). A claim about
   * every arrangement, so it needs a proof, never only a search that came back empty.
   */
  | 'SECTION_INADEQUATE'
  /** Combinations / forces / material / section data absent. Never a pass. */
  | 'DEMAND_UNAVAILABLE'
  /**
   * No arrangement among the ones the search implements verifies; feasibility NOT established.
   * `exhaustion` says which: the implemented alternatives were run out (and which they were,
   * and what is not implemented), or a budget stopped the search first.
   */
  | 'SEARCH_EXHAUSTED'
  /** Selected code or a required check is not implemented for this member. */
  | 'UNSUPPORTED';

/**
 * What a provisional proposal is, and precisely what it is not.
 *
 * Every field here exists so that the sentence "this beam has bars" can never be read
 * without the sentence that qualifies it. `method` names how the bars were obtained,
 * `uncheckedAxis` names what nobody checked, and the two moments are given in kN·m and not
 * only as a ratio — a 12 % ratio between 4,3 and 1,0 kN·m and a 12 % ratio between 430 and
 * 100 kN·m are the same number and completely different engineering situations.
 */
export interface ProvisionalBasis {
  /**
   * `primaryAxisDesign` — the ordinary, authoritative bounded search, run against the
   * primary flexural axis exactly as it is for a uniaxial beam. No threshold was raised, no
   * check was skipped on the axis that WAS designed, and no capacity was invented for the
   * axis that was not.
   */
  method: 'primaryAxisDesign';
  /** The axis the proposal was designed and verified against. */
  designedAxis: MomentAxis;
  designedShear: ShearAxis;
  /** The axis no verifier in this app evaluates for a beam. */
  uncheckedAxis: MomentAxis;
  uncheckedShear: ShearAxis;
  /** secondary/primary governing moment, as `resolveDesignAxes` measured it. */
  secondaryRatio: number;
  /** kN·m. Stated absolutely, because a ratio alone cannot be triaged. */
  primaryMoment: number;
  secondaryMoment: number;
  /** Load combination governing the UNCHECKED moment, when the demands name one. */
  secondaryCombo: string | null;
  /** demand/capacity on the axis that was checked. Evidence, never a certificate. */
  primaryUtilization: number;
  /** Which force components the verifier actually evaluated. */
  checkedAxes: string[];
}

/**
 * A bound of the code that no reinforcement can lift, exceeded by the section: the evidence a
 * SECTION_INADEQUATE claim needs. `capacity` is an UPPER bound of what any admissible
 * reinforcement gives (every assumption in the section's favour, `basis`), so demand > capacity
 * holds for every arrangement, enumerated or not.
 */
export interface InsufficiencyProof {
  bound:
    /** §22.5.1.2 with Vc at its §22.5.5.1.1 ceiling and the deepest d an admissible bar gives. */
    | 'shearSectionLimit'
    /** Tabla 22.4.2.1 with the most steel §10.6.1.1 admits and the spiral's factors. */
    | 'axialCapacityAtMaxSteel'
    /** §25.2.1: two of the smallest admissible bars do not fit inside the smallest stirrup. */
    | 'minimumBarRowDoesNotFit';
  clause: string;
  demand: number;
  capacity: number;
  unit: string;
  /** The axis or direction the bound was evaluated on. */
  axis?: string;
  combination?: string;
  /** What `capacity` assumes in the section's favour, so it is an upper bound. */
  basis: Record<string, number | string>;
}

/** An alternative the search does not implement, so an exhausted search did not try it. */
export type ExhaustionGap =
  | 'bundledBars' | 'mixedDiametersInRow' | 'optionsBeyondRetained'
  | 'headedBars' | 'mechanicalAnchorage' | 'columnCageChange'
  /** Refused on its anchorage under the undeclared reading of the lateral system (fy at the face). */
  | 'lateralRoleUndeclared'
  | 'searchBudget';

/**
 * What an exhausted search ran out of: the evidence a SEARCH_EXHAUSTED claim carries.
 *
 * `implementedAlternatives` — the generator ran out of the arrangements it enumerates;
 * `budget` — a candidate or verifier-call budget stopped it first. In neither case was
 * insufficiency shown: `notImplemented` names what could still exist.
 */
export interface ExhaustionRecord {
  scope: 'implementedAlternatives' | 'budget';
  limiting: LimitingConstraint[];
  tried: {
    candidates: number;
    longDiametersMm: number[];
    maxRows: number;
    /** Options kept per region (beams) or per member (columns) after ordering. */
    optionsRetained: number;
    stirrupDiametersMm: number[];
    maxLegs: number;
    /** The crossing beams were read at their lightest seat and the member designed again. */
    crossingSeatsRetried: boolean;
  };
  notImplemented: ExhaustionGap[];
}

export type LimitingConstraint =
  | 'flexure' | 'shear' | 'axialFlexure' | 'biaxial' | 'torsion'
  | 'maxSteel' | 'minSteel' | 'barFit' | 'barSpacing' | 'cover'
  | 'congestion' | 'anchorage' | 'slenderness' | 'tieSpacing'
  | 'unsupportedCheck' | 'missingDemand' | 'missingSection' | 'missingMaterial'
  | 'missingCombinations' | 'memberOrientationSuspect' | 'searchBudget';

/** Utilization convention used EVERYWHERE in the design surface: demand / capacity. */
export const UTILIZATION_CONVENTION = 'demandOverCapacity' as const;

/** Approved thresholds (O4): warn for 0.95 < u <= 1.00, fail above 1.00. Owned by the contract. */
import { UTIL_WARN_THRESHOLD, UTIL_FAIL_THRESHOLD, UTIL_EPSILON } from '../../design-contract/status';
export { UTIL_WARN_THRESHOLD, UTIL_FAIL_THRESHOLD, UTIL_EPSILON };
/** Design target the search prefers when it costs no extra reinforcement step (O5). */
export const DESIGN_TARGET_UTILIZATION = 0.95;

export type UtilStatus = 'ok' | 'warn' | 'fail';

/** Map a demand/capacity utilization to a status under the approved convention. */
export function utilizationStatus(u: number): UtilStatus {
  if (!Number.isFinite(u)) return 'fail';
  if (u > UTIL_FAIL_THRESHOLD + UTIL_EPSILON) return 'fail';
  if (u > UTIL_WARN_THRESHOLD + UTIL_EPSILON) return 'warn';
  return 'ok';
}

/** Reason entries are i18n keys + params — never raw user-facing English. */
export interface DesignReason {
  key: string;
  params?: Record<string, string | number>;
}

/** Cost vector used by the staged optimizer (lower is better on every field). */
export interface CandidateCost {
  layers: number;
  distinctDiameters: number;
  nonStandardSteps: number;
  steelMassKg: number;
  congestion: number;
  arrangementCount: number;
  spacingPracticality: number;
  /** Weighted stage-2 scalar in [0, ~1]; only compared after lexicographic stages. */
  weighted: number;
}

export interface DesignAttempt {
  candidate: ProvidedReinforcement;
  verdict: ProvidedRebarResult;
  /** demand/capacity, worst across all strength checks. */
  worstUtilization: number;
  failingCheckCount: number;
  governing: LimitingConstraint | null;
  cost: CandidateCost;
}

/** Proof that a specific reinforcement passed the authoritative verifier. */
export interface DesignCertificate {
  verifierId: string;
  codeId: string;
  codeVersion: string;
  analysisRevision: number;
  demandRevision: number;
  rebarHash: string;
  /** demand/capacity. Always <= UTIL_FAIL_THRESHOLD for a valid certificate. */
  worstUtilization: number;
  /** The utilization target the search aimed at (O5). */
  designTarget: number;
  checkCount: number;
  /** Which force components were actually checked — the honesty field. */
  checkedAxes: string[];
  /** How the governing axis was chosen. */
  axisBasis: DesignAxes['basis'];
  utilizationConvention: typeof UTILIZATION_CONVENTION;
}

export interface SectionRecommendation {
  /** Always true — a section change invalidates the analysis it was derived from. */
  preliminary: true;
  currentB: number;
  currentH: number;
  proposedB: number;
  proposedH: number;
  /** Which constraint drove the proposal. */
  driver: LimitingConstraint;
  /** Why this dimension helps, as i18n key + params. */
  rationale: DesignReason[];
  /** Screen-level utilization estimate at the proposed size (advisory only). */
  screenedUtilization?: number;
  /** True when a hard dimensional cap was hit and no proposal can be made. */
  capReached: boolean;
}

export interface SearchStats {
  candidatesTried: number;
  verifierCalls: number;
  ms: number;
  /** True when a budget stopped the search before the envelope was covered. */
  truncated: boolean;
  /** True when the full code-permitted envelope was enumerated. */
  envelopeExhausted: boolean;
}

export interface MemberDesignOutcome {
  elementId: number;
  elementType: 'beam' | 'column' | 'wall';
  codeId: string;
  codeVersion: string;
  outcome: DesignOutcomeKind;
  /** Present ONLY when outcome === 'VERIFIED'. */
  accepted?: ProvidedReinforcement;
  /** Present ONLY when outcome === 'VERIFIED'. */
  certificate?: DesignCertificate;
  /**
   * Certificate issued against the member's FINAL, coordinated geometry.
   *
   * Present only after the design–detailing feedback loop has repaired this member. It
   * carries `finalGeometryHash` so the geometry it describes is stated rather than assumed:
   * a certificate from nominal geometry and one from final geometry are different claims,
   * and the thirteen-condition gate is not allowed to mistake the first for the second.
   */
  finalGeometryCertificate?: DesignCertificate & { finalGeometryHash: string };
  /**
   * Best failing candidate (O3), or — for `PROVISIONAL_BIAXIAL` — the proposal itself.
   *
   * One field for both because they are the same claim: a reinforcement arrangement that
   * was NOT certified. Giving the proposal its own field would have created a second
   * channel with the same meaning and a different name, and the first consumer to read one
   * and not the other would have shipped an uncertified arrangement as a designed one.
   *
   * Never certified, never counted as passing, always listed in the review UI.
   */
  provisional?: DesignAttempt;
  /** Present exactly when outcome === 'PROVISIONAL_BIAXIAL'. */
  provisionalBasis?: ProvisionalBasis;
  limiting: LimitingConstraint[];
  reasons: DesignReason[];
  sectionAdvice?: SectionRecommendation;
  /** Present exactly when outcome === 'SECTION_INADEQUATE': the bound and its numbers. */
  insufficiency?: InsufficiencyProof;
  /** Present on a SEARCH_EXHAUSTED search: what was tried, what stopped it, what was not tried. */
  exhaustion?: ExhaustionRecord;
  axes?: DesignAxes;
  searchStats: SearchStats;
}

export interface DesignRunSummary {
  codeId: string;
  codeVersion: string;
  total: number;
  verified: number;
  sectionInadequate: number;
  demandUnavailable: number;
  searchExhausted: number;
  unsupported: number;
  /** Members carrying a provisional biaxial PROPOSAL. Never counted as verified. */
  provisionalBiaxial: number;
  /** Members whose provisional candidate was retained (subset of the failures). */
  provisionalRetained: number;
  outcomes: Map<number, MemberDesignOutcome>;
  wallMs: number;
  /** True when the run was cancelled or hit its wall budget. */
  aborted: boolean;
  /** Members not reached because the run stopped early. */
  notReached: number;
}

export function emptyRunSummary(codeId: string, codeVersion: string): DesignRunSummary {
  return {
    codeId, codeVersion, total: 0, verified: 0, sectionInadequate: 0,
    demandUnavailable: 0, searchExhausted: 0, unsupported: 0,
    provisionalBiaxial: 0, provisionalRetained: 0,
    outcomes: new Map(), wallMs: 0, aborted: false, notReached: 0,
  };
}

export function tallyRunSummary(
  codeId: string, codeVersion: string,
  outcomes: MemberDesignOutcome[],
  wallMs: number, aborted: boolean, notReached: number,
): DesignRunSummary {
  const s = emptyRunSummary(codeId, codeVersion);
  s.wallMs = wallMs;
  s.aborted = aborted;
  s.notReached = notReached;
  for (const o of outcomes) {
    s.outcomes.set(o.elementId, o);
    s.total++;
    if (o.provisional && o.outcome !== 'VERIFIED') s.provisionalRetained++;
    switch (o.outcome) {
      case 'VERIFIED': s.verified++; break;
      case 'PROVISIONAL_BIAXIAL': s.provisionalBiaxial++; break;
      case 'SECTION_INADEQUATE': s.sectionInadequate++; break;
      case 'DEMAND_UNAVAILABLE': s.demandUnavailable++; break;
      case 'SEARCH_EXHAUSTED': s.searchExhausted++; break;
      case 'UNSUPPORTED': s.unsupported++; break;
    }
  }
  return s;
}

/**
 * Runtime invariant guard. Throws on any contract violation so a regression can
 * never ship a silently-dishonest outcome. Called by the search on every result
 * and asserted directly in the contract test suite.
 */
export function assertOutcomeInvariants(o: MemberDesignOutcome): void {
  const where = `element ${o.elementId}`;
  if (o.outcome === 'VERIFIED') {
    if (!o.accepted) throw new Error(`${where}: VERIFIED without accepted reinforcement`);
    if (!o.certificate) throw new Error(`${where}: VERIFIED without a certificate`);
    if (o.certificate.worstUtilization > UTIL_FAIL_THRESHOLD + UTIL_EPSILON) {
      throw new Error(`${where}: VERIFIED with utilization ${o.certificate.worstUtilization} > ${UTIL_FAIL_THRESHOLD}`);
    }
    if (o.certificate.checkCount <= 0) throw new Error(`${where}: VERIFIED with zero checks`);
    if (o.certificate.checkedAxes.length === 0) throw new Error(`${where}: VERIFIED without recorded checked axes`);
    if (o.certificate.utilizationConvention !== UTILIZATION_CONVENTION) {
      throw new Error(`${where}: certificate uses a foreign utilization convention`);
    }
    if (o.limiting.length > 0) throw new Error(`${where}: VERIFIED but limiting constraints reported`);
    if (o.provisional) throw new Error(`${where}: VERIFIED must not retain a provisional candidate`);
  } else {
    if (o.accepted) throw new Error(`${where}: non-VERIFIED outcome must not assign reinforcement`);
    if (o.certificate) throw new Error(`${where}: non-VERIFIED outcome must not carry a certificate`);
    if (o.limiting.length === 0) throw new Error(`${where}: ${o.outcome} without a limiting constraint`);
    if (o.reasons.length === 0) throw new Error(`${where}: ${o.outcome} without a reason`);
  }
  if (o.outcome === 'PROVISIONAL_BIAXIAL') {
    // The whole point of the state is that it carries geometry WITHOUT a certificate. Both
    // halves are invariants: a proposal with nothing to propose is a mislabelled refusal,
    // and one that acquired a certificate is a false pass wearing an honest name.
    if (!o.provisional) throw new Error(`${where}: PROVISIONAL_BIAXIAL without a proposal`);
    if (!o.provisionalBasis) throw new Error(`${where}: PROVISIONAL_BIAXIAL without its basis`);
    if (!o.limiting.includes('biaxial')) {
      throw new Error(`${where}: PROVISIONAL_BIAXIAL must name 'biaxial' as its limiting constraint`);
    }
    if (o.provisionalBasis.designedAxis === o.provisionalBasis.uncheckedAxis) {
      throw new Error(`${where}: PROVISIONAL_BIAXIAL claims the unchecked axis is the designed one`);
    }
  }
  if (o.provisionalBasis && o.outcome !== 'PROVISIONAL_BIAXIAL') {
    throw new Error(`${where}: ${o.outcome} carries a provisional basis it cannot have earned`);
  }
  /*
   * SECTION_INADEQUATE is a claim about EVERY arrangement, so it needs a proof: a bound no
   * reinforcement lifts, exceeded. Running out of the arrangements the search enumerates is not
   * one (it was: an exhausted envelope with a section recommendation read as inadequate), and
   * that is SEARCH_EXHAUSTED with what was tried and what was not.
   */
  if (o.outcome === 'SECTION_INADEQUATE') {
    const p = o.insufficiency;
    if (!p) throw new Error(`${where}: SECTION_INADEQUATE without a demonstrated insufficiency`);
    if (!(p.demand > p.capacity)) {
      throw new Error(`${where}: SECTION_INADEQUATE whose bound holds (${p.demand} ≤ ${p.capacity} ${p.unit})`);
    }
  } else if (o.insufficiency) {
    throw new Error(`${where}: ${o.outcome} carries an insufficiency proof it does not claim`);
  }
  if (o.outcome === 'SEARCH_EXHAUSTED' && !o.limiting.includes('memberOrientationSuspect')) {
    if (!o.exhaustion) throw new Error(`${where}: SEARCH_EXHAUSTED without saying what was exhausted`);
    if ((o.exhaustion.scope === 'budget') !== o.searchStats.truncated) {
      throw new Error(`${where}: exhaustion scope ${o.exhaustion.scope} disagrees with truncated=${o.searchStats.truncated}`);
    }
  }
  if (o.exhaustion && o.outcome !== 'SEARCH_EXHAUSTED') {
    throw new Error(`${where}: ${o.outcome} carries an exhaustion record`);
  }
}

/** True when the outcome may be shown with a passing (green) treatment. */
export function isPassing(o: MemberDesignOutcome | undefined): boolean {
  return o?.outcome === 'VERIFIED';
}

/**
 * The reinforcement an outcome offers to the detailing pipeline, and what it is worth.
 *
 * ── Why one function rather than eight reads of `.accepted` ────────
 *
 * `run-detailing` read `outcomes.get(id)?.accepted` in eight places. Adding a second source of
 * bars by editing eight call sites is how one of them gets missed, and a missed one is not a
 * crash — it is a member that silently has bars in the elevation and none in the section.
 *
 * `certified: false` is returned WITH the bars rather than instead of them, so a caller
 * cannot obtain the geometry without also obtaining the fact that it is a proposal.
 */
export function detailableReinforcement(
  o: MemberDesignOutcome | undefined,
): { rebar: ProvidedReinforcement; certified: boolean } | null {
  if (!o) return null;
  if (o.outcome === 'VERIFIED' && o.accepted) return { rebar: o.accepted, certified: true };
  if (o.outcome === 'PROVISIONAL_BIAXIAL' && o.provisional) {
    return { rebar: o.provisional.candidate, certified: false };
  }
  return null;
}

/** True when this member's bars are a proposal rather than certified reinforcement. */
export function isProvisionalOutcome(o: MemberDesignOutcome | undefined): boolean {
  return o?.outcome === 'PROVISIONAL_BIAXIAL';
}
