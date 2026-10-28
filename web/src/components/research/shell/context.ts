import { getContext, setContext } from 'svelte';

/** What the article can ask of the app pane (links such as "watch step 54" or "try ℓ = 0.015"). */
export type ExperimentActions = {
  goToStep(step: number): void;
  setParams(params: Record<string, number | string | boolean>): void;
};

const KEY = Symbol('research-experiment');
export const provideExperiment = (a: ExperimentActions) => setContext(KEY, a);
export const useExperiment = () => getContext<ExperimentActions | undefined>(KEY);
