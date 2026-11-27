import metrics from '../../../../../research/tools/published-metrics.json';
import { getContext, setContext } from 'svelte';

/** What the article can ask of the app pane (links such as "watch step 54" or "try ℓ = 0.015"). */
export type ExperimentActions = {
  goToStep(step: number): void;
  setParams(params: Record<string, number | string | boolean>): void;
  /** Bring a pane tab forward (e.g. 'force' when the text points at the force curve). */
  showTab(tab: string): void;
};

const KEY = Symbol('research-experiment');
export const provideExperiment = (a: ExperimentActions) => setContext(KEY, a);
export const useExperiment = () => getContext<ExperimentActions | undefined>(KEY);

/** One line of "checked against": a number of passing checks, or none and why. */
export type Check = { kind: 'checks'; passed: number; total: number; href?: string } | { kind: 'none'; why: string };

/**
 * One row of reference-results/published_comparison.json: the paper's value, ours and their
 * difference, or for a whole curve only the largest difference over `points` values.
 */
export type PublishedRow = {
  id?: string;
  name: string;
  source: string;
  unit?: string;
  reference?: number;
  computed?: number;
  points?: number;
  samples?: number[][];
  orientation_unit?: string;
  metric: string;
  observed: number;
  tolerance: number;
  passed: boolean;
};

export function comparisonShape(row: PublishedRow) {
  if (Number.isFinite(row.reference) && Number.isFinite(row.computed) && row.points === undefined && row.samples === undefined
    && (metrics.absolute.includes(row.metric) || metrics.relative.includes(row.metric))) return 'scalar';
  if (row.reference === undefined && row.computed === undefined && Number.isInteger(row.points) && row.points! > 0
    && (metrics.paired.includes(row.metric) || metrics.errorBar.includes(row.metric) || ['absolute difference', 'absolute'].includes(row.metric))) return 'curve';
  return 'unavailable';
}

export function comparisonDifference(row: PublishedRow): number {
  const shape = comparisonShape(row);
  if (shape === 'curve') {
    if (row.samples === undefined) return row.observed;
    if (row.samples.length !== row.points || !row.samples.length) return NaN;
    let largest = 0;
    for (const p of row.samples) {
      if (!Array.isArray(p) || !p.every(Number.isFinite)) return NaN;
      if (metrics.errorBar.includes(row.metric) && p.length === 4 && p[1] <= p[2]) {
        largest = Math.max(largest, p[1] - p[3], p[3] - p[2]);
      } else if ((metrics.paired.includes(row.metric) || row.metric === 'absolute difference') && ((row.id !== 'fig7' && p.length === 2) || (row.metric === 'absolute difference in Y, largest' && p.length === 3 && row.orientation_unit === 'rad'))) {
        largest = Math.max(largest, Math.abs(p[p.length - 1] - p[p.length - 2]));
      } else return NaN;
    }
    return largest;
  }
  if (shape === 'scalar') {
    const difference = Math.abs(row.computed! - row.reference!);
    if (metrics.absolute.includes(row.metric)) return difference;
    if (metrics.relative.includes(row.metric) && row.reference !== 0) return difference / Math.abs(row.reference!);
  }
  return NaN;
}

export function comparisonPasses(row: PublishedRow) {
  const difference = comparisonDifference(row);
  return Number.isFinite(difference) && difference <= row.tolerance && row.passed === true && Number.isFinite(row.observed)
    && Math.abs(row.observed - difference) <= 1e-9 * Math.max(difference, row.observed)
    && Number.isFinite(row.tolerance) && row.observed >= 0 && row.observed <= row.tolerance;
}
