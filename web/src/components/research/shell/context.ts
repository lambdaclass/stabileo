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
  metric: string;
  observed: number;
  tolerance: number;
  passed: boolean;
};
