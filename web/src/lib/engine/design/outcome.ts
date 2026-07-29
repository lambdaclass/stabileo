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
import type { DesignAxes } from './design-axes';

export type DesignOutcomeKind =
  /** The final assigned reinforcement passes every applicable check. */
  | 'VERIFIED'
  /** No permitted arrangement can satisfy the checks or physically fit. Exhaustive. */
  | 'SECTION_INADEQUATE'
  /** Combinations / forces / material / section data absent. Never a pass. */
  | 'DEMAND_UNAVAILABLE'
  /** Bounded search found nothing; feasibility NOT established. */
  | 'SEARCH_EXHAUSTED'
  /** Selected code or a required check is not implemented for this member. */
  | 'UNSUPPORTED';

export type LimitingConstraint =
  | 'flexure' | 'shear' | 'axialFlexure' | 'biaxial' | 'torsion'
  | 'maxSteel' | 'minSteel' | 'barFit' | 'barSpacing' | 'cover'
  | 'congestion' | 'anchorage' | 'slenderness' | 'tieSpacing'
  | 'unsupportedCheck' | 'missingDemand' | 'missingSection' | 'missingMaterial'
  | 'missingCombinations' | 'memberOrientationSuspect' | 'searchBudget';

/** Utilization convention used EVERYWHERE in the design surface: demand / capacity. */
export const UTILIZATION_CONVENTION = 'demandOverCapacity' as const;

/** Approved thresholds (O4): warn for 0.95 < u <= 1.00, fail above 1.00. */
export const UTIL_WARN_THRESHOLD = 0.95;
export const UTIL_FAIL_THRESHOLD = 1.00;
/** Design target the search prefers when it costs no extra reinforcement step (O5). */
export const DESIGN_TARGET_UTILIZATION = 0.95;
/** Floating-point slack so 1.0000000002 is not a failure. */
export const UTIL_EPSILON = 1e-6;

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
   * Best failing candidate (O3). Clearly provisional: never certified, never
   * counted as passing, always listed in the review UI.
   */
  provisional?: DesignAttempt;
  limiting: LimitingConstraint[];
  reasons: DesignReason[];
  sectionAdvice?: SectionRecommendation;
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
    demandUnavailable: 0, searchExhausted: 0, unsupported: 0, provisionalRetained: 0,
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
  if (o.outcome === 'SECTION_INADEQUATE') {
    if (!o.searchStats.envelopeExhausted) {
      throw new Error(`${where}: SECTION_INADEQUATE claimed without exhausting the permitted envelope`);
    }
    if (!o.sectionAdvice) throw new Error(`${where}: SECTION_INADEQUATE without a section recommendation`);
  }
  if (o.outcome === 'SEARCH_EXHAUSTED' && o.searchStats.envelopeExhausted
      && !o.limiting.includes('memberOrientationSuspect')) {
    throw new Error(`${where}: envelope exhausted must be reported as SECTION_INADEQUATE, not SEARCH_EXHAUSTED`);
  }
}

/** True when the outcome may be shown with a passing (green) treatment. */
export function isPassing(o: MemberDesignOutcome | undefined): boolean {
  return o?.outcome === 'VERIFIED';
}
