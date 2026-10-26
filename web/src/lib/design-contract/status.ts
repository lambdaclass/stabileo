/**
 * One status vocabulary for every design surface.
 *
 * Concrete, steel, connections and the other codes each spoke their own (ok/warn/fail with a
 * 1.05 band, VERIFIED/…, NOT_DESIGNED/…, pass/fail/incomplete). This is the one a person reads,
 * and the thresholds are the approved ones: near the limit above 0.95, failing above 1.00.
 */
export type DesignStatus = 'ok' | 'nearLimit' | 'fail' | 'notVerified' | 'unsupported';

/** Approved thresholds (O4): near the limit for 0.95 < u <= 1.00, failing above 1.00. */
export const UTIL_WARN_THRESHOLD = 0.95;
export const UTIL_FAIL_THRESHOLD = 1.00;
/** Floating-point slack so 1.0000000002 is not a failure. */
export const UTIL_EPSILON = 1e-6;

/** The status of a demand/capacity ratio. A ratio that is not a number fails. */
export function statusOfRatio(u: number): DesignStatus {
  if (!Number.isFinite(u)) return 'fail';
  if (u > UTIL_FAIL_THRESHOLD + UTIL_EPSILON) return 'fail';
  if (u > UTIL_WARN_THRESHOLD + UTIL_EPSILON) return 'nearLimit';
  return 'ok';
}

/** The worst of several statuses, in the order a reader must act on them. */
export function worstStatus(statuses: readonly DesignStatus[]): DesignStatus {
  const order: DesignStatus[] = ['fail', 'unsupported', 'notVerified', 'nearLimit', 'ok'];
  for (const s of order) if (statuses.includes(s)) return s;
  return 'notVerified';
}

/** From the three-way ok/warn/fail the checkers return. */
export function fromVerifStatus(s: 'ok' | 'warn' | 'fail' | 'none' | undefined): DesignStatus {
  return s === 'ok' ? 'ok' : s === 'warn' ? 'nearLimit' : s === 'fail' ? 'fail' : 'notVerified';
}
