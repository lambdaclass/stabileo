import type { PlasticCollapseResult } from '../../../lib/engine/plastic-collapse';

export function userCompare(r: Pick<PlasticCollapseResult, 'isMechanism' | 'unresolved' | 'collapseFactor'>, lambda: number): { lambda: number; diff: number } | null {
  if (!r.isMechanism || r.unresolved || !(Number.isFinite(r.collapseFactor) && r.collapseFactor > 0)) return null;
  return { lambda: r.collapseFactor, diff: 100 * (lambda / r.collapseFactor - 1) };
}
