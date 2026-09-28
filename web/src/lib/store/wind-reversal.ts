/**
 * Whether a wind case may also enter a combination with the opposite sign.
 *
 * Reversing a case by sign stands for the wind blowing the other way. That is exact for a case
 * of horizontal forces — a lateral wind on the storeys — and wrong for one that loads the
 * members or pushes vertically: roof suction times −1 is roof pressure, a pattern the code never
 * prescribes, and the regulation generator makes the other direction as a case of its own
 * (`wind-cases.ts`). So only a case of horizontal nodal forces (and moments) is reversible.
 */
import type { ModelData } from '../engine/solver-service';

const VERTICAL_TOL = 1e-9;

export function windCaseReversible(model: Pick<ModelData, 'loads'>, caseId: number): boolean {
  const loads = model.loads.filter((l) => ((l.data as { caseId?: number }).caseId ?? 1) === caseId);
  if (loads.length === 0) return false;
  return loads.every((l) => {
    const d = l.data as { fz?: number; fy?: number };
    if (l.type === 'nodal3d') return Math.abs(d.fz ?? 0) <= VERTICAL_TOL;
    // A plane model's vertical is its second component (fz, or fy in older files).
    if (l.type === 'nodal') return Math.abs(d.fz ?? d.fy ?? 0) <= VERTICAL_TOL;
    return false;
  });
}
