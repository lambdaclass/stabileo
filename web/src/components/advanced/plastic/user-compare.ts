import type { PlasticCollapseResult } from '../../../lib/engine/plastic-collapse';
import type { MechanismView } from '../../../lib/engine/plastic/mechanism';
import type { CurveAxis } from '../../../lib/engine/plastic/curve';

type Verdict = Pick<PlasticCollapseResult, 'isMechanism' | 'unresolved' | 'collapseFactor'>;

export const verifiedCollapse = (r: Verdict): boolean => r.isMechanism && !r.unresolved && Number.isFinite(r.collapseFactor) && r.collapseFactor > 0;

/** The final verdict: a collapse only when verified; any other mechanism is unresolved, never a collapse. */
export const collapseVerdict = (r: Verdict): 'collapse' | 'unresolved' | 'none' =>
  verifiedCollapse(r) ? 'collapse' : r.unresolved || r.isMechanism ? 'unresolved' : 'none';

export function userCompare(r: Verdict, lambda: number): { lambda: number; diff: number } | null {
  if (!verifiedCollapse(r)) return null;
  return { lambda: r.collapseFactor, diff: 100 * (lambda / r.collapseFactor - 1) };
}

export function plateauSign(r: PlasticCollapseResult, view: MechanismView | null, axis: CurveAxis): -1 | 0 | 1 | null {
  if (!verifiedCollapse(r) || !view) return null;
  let c: number | undefined;
  if (axis.kind === 'hinge') {
    const k = r.hinges.map((h, i) => ({ h, i })).filter(({ h }) => h.kind === 'bending' && h.unloadedAt === undefined).findIndex(({ i }) => i === axis.hinge);
    c = k < 0 ? 0 : view.hinges[k]?.theta;
  } else {
    const p = view.km.nodePoint.get(axis.node);
    if (p === undefined) return 0;
    const j = view.km.joint.get(axis.node);
    c = axis.dof === 'ux' ? view.d[2 * p] : axis.dof === 'uz' ? view.d[2 * p + 1] : j === undefined ? 0 : view.d[j];
  }
  const big = Math.max(0, ...view.d.map(Math.abs));
  if (c === undefined || !(Math.abs(c) > 1e-9 * big)) return 0;
  return c > 0 ? 1 : -1;
}
