import type { AnalysisResults, SolverInput } from '../../lib/engine/types';
import { solvePDelta } from '../../lib/engine/wasm-solver';
import { hasInvalid2DDisplacements } from '../../lib/geometry/coordinate-system';
import { t } from '../../lib/i18n';

export function solveEduPDelta(input: SolverInput): AnalysisResults | string {
  const solution = solvePDelta(input);
  if (solution.converged !== true) return t('pro.notConverged');
  if (solution.isStable !== true) return t('toast.pdeltaUnstable');
  if (hasInvalid2DDisplacements(solution.results.displacements)) return t('results.numericError');
  return solution.results;
}
