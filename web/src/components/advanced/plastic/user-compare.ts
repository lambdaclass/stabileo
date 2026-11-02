import type { PlasticCollapseResult } from '../../../lib/engine/plastic-collapse';

type Verdict = Pick<PlasticCollapseResult, 'isMechanism' | 'unresolved' | 'collapseFactor'>;

export const verifiedCollapse = (r: Verdict): boolean => r.isMechanism && !r.unresolved && Number.isFinite(r.collapseFactor) && r.collapseFactor > 0;

export function userCompare(r: Verdict, lambda: number): { lambda: number; diff: number } | null {
  if (!verifiedCollapse(r)) return null;
  return { lambda: r.collapseFactor, diff: 100 * (lambda / r.collapseFactor - 1) };
}
